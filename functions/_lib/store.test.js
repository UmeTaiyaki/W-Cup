import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './store.js';

// 最小限のフェイク KV。get/put のみ。onVerifyRead で「読み直し」時に競合を注入できる。
function fakeKV(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async put(key, value) {
      data.set(key, value);
    },
  };
}

test('createStore は get/put 関数の無いバインディングを拒否する', () => {
  assert.throws(() => createStore(null));
  assert.throws(() => createStore({}));
});

test('getJSON は不正JSONで null を返す', async () => {
  const store = createStore(fakeKV({ k: '{not json' }));
  assert.equal(await store.getJSON('k'), null);
});

test('getJSON / putJSON のラウンドトリップ', async () => {
  const store = createStore(fakeKV());
  await store.putJSON('k', { a: 1 });
  assert.deepEqual(await store.getJSON('k'), { a: 1 });
});

test('update: 変更なし(changed:false)は書き込みを省略する', async () => {
  const kv = fakeKV({ r: JSON.stringify({ updatedAt: 't0', members: ['a'] }) });
  let puts = 0;
  const origPut = kv.put.bind(kv);
  kv.put = async (k, v) => { puts++; return origPut(k, v); };
  const store = createStore(kv);
  const res = await store.update('r', () => ({ changed: false }));
  assert.equal(res.ok, true);
  assert.equal(res.changed, false);
  assert.equal(puts, 0);
});

test('update: 業務的拒否(ok:false)はそのまま理由を返す', async () => {
  const store = createStore(fakeKV({ r: JSON.stringify({ updatedAt: 't0' }) }));
  const res = await store.update('r', () => ({ ok: false, reason: 'full' }));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'full');
});

test('update: 競合が無ければ書き込んで成功する', async () => {
  const store = createStore(fakeKV({ r: JSON.stringify({ updatedAt: 't0', members: ['a'] }) }));
  const res = await store.update('r', (cur) => ({
    changed: true,
    value: { ...cur, members: [...cur.members, 'b'], updatedAt: 't1' },
  }));
  assert.equal(res.ok, true);
  assert.equal(res.changed, true);
  assert.deepEqual(res.value.members, ['a', 'b']);
  assert.deepEqual(await store.getJSON('r'), res.value);
});

test('update: 書き込み直前の競合を検知して最新で再適用する', async () => {
  // 1回目の verify 読み出しで「他者が b を追加して updatedAt=t1 にした」状態を注入する。
  const kv = fakeKV({ r: JSON.stringify({ updatedAt: 't0', members: ['a'] }) });
  let getCount = 0;
  const baseGet = kv.get.bind(kv);
  kv.get = async (key) => {
    getCount++;
    // 呼び出し順: [1] current(t0) [2] verify → ここで競合を注入(t1) [3] 再current(t1) [4] verify(t1)
    if (getCount === 2) {
      return JSON.stringify({ updatedAt: 't1', members: ['a', 'b'] });
    }
    if (getCount >= 3 && kv.data.get('r') === JSON.stringify({ updatedAt: 't0', members: ['a'] })) {
      // まだ初期値のままなら、競合者が確定させた t1 の状態を見せる
      kv.data.set('r', JSON.stringify({ updatedAt: 't1', members: ['a', 'b'] }));
    }
    return baseGet(key);
  };
  const store = createStore(kv);
  // mutator は「自分(c)を必ず加える」。再適用時は最新([a,b])に c を足す。
  const res = await store.update('r', (cur) => ({
    changed: true,
    value: { members: [...cur.members, 'c'], updatedAt: cur.updatedAt + '+c' },
  }));
  assert.equal(res.ok, true);
  // 競合者の b が消えずに c が加わっていること（ロストアップデート回避）
  assert.deepEqual(res.value.members, ['a', 'b', 'c']);
});

test('update: リトライを使い切ると contended を返す', async () => {
  // verify が常に current と異なる版を返し続け、決して整合しない状況。
  const kv = fakeKV({ r: JSON.stringify({ updatedAt: 't0' }) });
  let n = 0;
  kv.get = async () => {
    n++;
    return JSON.stringify({ updatedAt: 't' + n });
  };
  const store = createStore(kv);
  const res = await store.update('r', (cur) => ({ changed: true, value: { updatedAt: 'x' } }), { retries: 2 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'contended');
});
