import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDualStore } from './dual-store.js';

// インメモリのフェイク store（getRaw/putRaw/getJSON/putJSON/update）。
// failPut を真にすると putRaw/putJSON が投げる（副系の書き込み失敗の再現用）。
function fakeStore(initial = {}, { failPut = false, tag = 'x' } = {}) {
  const data = new Map(Object.entries(initial));
  const api = {
    tag,
    data,
    async getRaw(k) { return data.has(k) ? data.get(k) : null; },
    async putRaw(k, v) { if (failPut) throw new Error(tag + ' putRaw failed'); data.set(k, v); },
    async getJSON(k) { const s = data.get(k); if (s == null) return null; try { return JSON.parse(s); } catch { return null; } },
    async putJSON(k, v) { return api.putRaw(k, JSON.stringify(v)); },
    async update(k, mutator) {
      const cur = await api.getJSON(k);
      const res = mutator(cur);
      if (!res) return { ok: false, reason: 'aborted', value: cur };
      if (res.ok === false) return { ok: false, reason: res.reason ?? 'rejected', value: cur };
      if (res.changed === false) return { ok: true, changed: false, value: res.value ?? cur };
      await api.putJSON(k, res.value);
      return { ok: true, changed: true, value: res.value };
    },
  };
  return api;
}

test('createDualStore は kvStore / d1Store の両方を要求する', () => {
  assert.throws(() => createDualStore({ kvStore: fakeStore(), readBackend: 'kv' }));
  assert.throws(() => createDualStore({ d1Store: fakeStore(), readBackend: 'kv' }));
});

test('readBackend=kv は KV から読む', async () => {
  const kv = fakeStore({ k: 'from-kv' }, { tag: 'kv' });
  const d1 = fakeStore({ k: 'from-d1' }, { tag: 'd1' });
  const store = createDualStore({ kvStore: kv, d1Store: d1, readBackend: 'kv' });
  assert.equal(await store.getRaw('k'), 'from-kv');
});

test('readBackend=d1 は D1 から読む', async () => {
  const kv = fakeStore({ k: 'from-kv' }, { tag: 'kv' });
  const d1 = fakeStore({ k: 'from-d1' }, { tag: 'd1' });
  const store = createDualStore({ kvStore: kv, d1Store: d1, readBackend: 'd1' });
  assert.equal(await store.getRaw('k'), 'from-d1');
});

test('putRaw は KV と D1 の両方へ書き込む', async () => {
  const kv = fakeStore({}, { tag: 'kv' });
  const d1 = fakeStore({}, { tag: 'd1' });
  const store = createDualStore({ kvStore: kv, d1Store: d1, readBackend: 'kv' });
  await store.putRaw('k', 'v');
  assert.equal(kv.data.get('k'), 'v');
  assert.equal(d1.data.get('k'), 'v');
});

test('副系(D1)の書き込み失敗は握りつぶす（正系=KVが成功すればユーザーは成功）', async () => {
  const kv = fakeStore({}, { tag: 'kv' });
  const d1 = fakeStore({}, { tag: 'd1', failPut: true });
  const store = createDualStore({ kvStore: kv, d1Store: d1, readBackend: 'kv' });
  await store.putRaw('k', 'v'); // 例外を投げないこと
  assert.equal(kv.data.get('k'), 'v'); // 正系には入る
});

test('正系(KV)の書き込み失敗は伝播する（保存失敗をユーザーに返す）', async () => {
  const kv = fakeStore({}, { tag: 'kv', failPut: true });
  const d1 = fakeStore({}, { tag: 'd1' });
  const store = createDualStore({ kvStore: kv, d1Store: d1, readBackend: 'kv' });
  await assert.rejects(() => store.putRaw('k', 'v'));
});

test('readBackend=d1 のとき正系は D1、副系は KV（D1失敗で伝播・KV失敗は握りつぶす）', async () => {
  const kvFail = fakeStore({}, { tag: 'kv', failPut: true });
  const d1ok = fakeStore({}, { tag: 'd1' });
  const a = createDualStore({ kvStore: kvFail, d1Store: d1ok, readBackend: 'd1' });
  await a.putRaw('k', 'v'); // D1=正系が成功すればOK、KV副系の失敗は無視
  assert.equal(d1ok.data.get('k'), 'v');

  const kvOk = fakeStore({}, { tag: 'kv' });
  const d1Fail = fakeStore({}, { tag: 'd1', failPut: true });
  const b = createDualStore({ kvStore: kvOk, d1Store: d1Fail, readBackend: 'd1' });
  await assert.rejects(() => b.putRaw('k', 'v')); // D1=正系の失敗は伝播
});

test('update は正系で実行し、変更を副系へミラーする', async () => {
  const kv = fakeStore({ r: JSON.stringify({ updatedAt: 't0', members: ['a'] }) }, { tag: 'kv' });
  const d1 = fakeStore({ r: JSON.stringify({ updatedAt: 't0', members: ['a'] }) }, { tag: 'd1' });
  const store = createDualStore({ kvStore: kv, d1Store: d1, readBackend: 'kv' });
  const res = await store.update('r', (cur) => ({
    changed: true,
    value: { ...cur, members: [...cur.members, 'b'], updatedAt: 't1' },
  }));
  assert.equal(res.ok, true);
  assert.deepEqual(res.value.members, ['a', 'b']);
  assert.deepEqual(JSON.parse(kv.data.get('r')).members, ['a', 'b']); // 正系
  assert.deepEqual(JSON.parse(d1.data.get('r')).members, ['a', 'b']); // 副系へミラー
});

test('update が changed:false なら副系へ書き込まない', async () => {
  const kv = fakeStore({ r: JSON.stringify({ updatedAt: 't0' }) }, { tag: 'kv' });
  const d1 = fakeStore({}, { tag: 'd1' });
  const store = createDualStore({ kvStore: kv, d1Store: d1, readBackend: 'kv' });
  const res = await store.update('r', () => ({ changed: false }));
  assert.equal(res.ok, true);
  assert.equal(res.changed, false);
  assert.equal(d1.data.has('r'), false); // ミラーされない
});
