import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createD1Store } from './d1-store.js';

// 最小限のフェイク D1。d1-store が発行する SQL（SELECT / UPSERT / CAS UPDATE / CAS INSERT）を
// 解釈する。行は k -> { v, updated_at } の Map。store.test.js のフェイクKVと同方針。
function fakeD1(initial = {}) {
  const rows = new Map();
  for (const [k, val] of Object.entries(initial)) {
    rows.set(k, typeof val === 'string' ? { v: val, updated_at: verOf(val) } : val);
  }
  const stmt = (sql) => ({
    sql,
    args: [],
    bind(...a) { this.args = a; return this; },
    async first() {
      if (/^SELECT v/i.test(sql)) {
        const r = rows.get(this.args[0]);
        return r ? { v: r.v } : null;
      }
      return null;
    },
    async run() {
      const a = this.args;
      if (/^INSERT/i.test(sql) && /DO UPDATE/i.test(sql)) {
        rows.set(a[0], { v: a[1], updated_at: a[2] ?? null });
        return { success: true, meta: { changes: 1 } };
      }
      if (/^UPDATE kv SET/i.test(sql)) {
        const [v, ua, k, expected] = a;
        const r = rows.get(k);
        if (r && (r.updated_at ?? null) === (expected ?? null)) {
          rows.set(k, { v, updated_at: ua ?? null });
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      }
      if (/^INSERT/i.test(sql) && /DO NOTHING/i.test(sql)) {
        const [k, v, ua] = a;
        if (rows.has(k)) return { success: true, meta: { changes: 0 } };
        rows.set(k, { v, updated_at: ua ?? null });
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    },
  });
  return { rows, prepare(sql) { return stmt(sql); } };
}

function verOf(s) {
  try { const o = JSON.parse(s); return o && o.updatedAt != null ? o.updatedAt : null; } catch { return null; }
}

test('createD1Store は prepare の無いバインディングを拒否する', () => {
  assert.throws(() => createD1Store(null));
  assert.throws(() => createD1Store({}));
});

test('getRaw / putRaw のラウンドトリップ', async () => {
  const store = createD1Store(fakeD1());
  await store.putRaw('k', 'hello');
  assert.equal(await store.getRaw('k'), 'hello');
});

test('getRaw は未存在キーで null を返す', async () => {
  const store = createD1Store(fakeD1());
  assert.equal(await store.getRaw('nope'), null);
});

test('getJSON は不正JSONで null を返す', async () => {
  const store = createD1Store(fakeD1({ k: '{not json' }));
  assert.equal(await store.getJSON('k'), null);
});

test('getJSON / putJSON のラウンドトリップ', async () => {
  const store = createD1Store(fakeD1());
  await store.putJSON('k', { a: 1 });
  assert.deepEqual(await store.getJSON('k'), { a: 1 });
});

test('update: 変更なし(changed:false)は書き込みを省略する', async () => {
  const d1 = fakeD1({ r: JSON.stringify({ updatedAt: 't0', members: ['a'] }) });
  const store = createD1Store(d1);
  const before = d1.rows.get('r');
  const res = await store.update('r', () => ({ changed: false }));
  assert.equal(res.ok, true);
  assert.equal(res.changed, false);
  assert.equal(d1.rows.get('r'), before); // 同一参照＝未書き込み
});

test('update: 業務的拒否(ok:false)はそのまま理由を返す', async () => {
  const store = createD1Store(fakeD1({ r: JSON.stringify({ updatedAt: 't0' }) }));
  const res = await store.update('r', () => ({ ok: false, reason: 'full' }));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'full');
});

test('update: 競合が無ければ書き込んで成功する', async () => {
  const store = createD1Store(fakeD1({ r: JSON.stringify({ updatedAt: 't0', members: ['a'] }) }));
  const res = await store.update('r', (cur) => ({
    changed: true,
    value: { ...cur, members: [...cur.members, 'b'], updatedAt: 't1' },
  }));
  assert.equal(res.ok, true);
  assert.equal(res.changed, true);
  assert.deepEqual(res.value.members, ['a', 'b']);
  assert.deepEqual(await store.getJSON('r'), res.value);
});

test('update: CAS で書き込み直前の競合を検知し最新で再適用する（ロストアップデート回避）', async () => {
  const d1 = fakeD1({ r: JSON.stringify({ updatedAt: 't0', members: ['a'] }) });
  let getCount = 0;
  const origPrepare = d1.prepare.bind(d1);
  d1.prepare = (sql) => {
    const s = origPrepare(sql);
    if (/^SELECT v/i.test(sql)) {
      const origFirst = s.first.bind(s);
      s.first = async () => {
        getCount++;
        // 1回目の current 読み出し後、他者が b を追加し updatedAt=t1 に確定させた状況を注入。
        if (getCount === 1) {
          d1.rows.set('r', { v: JSON.stringify({ updatedAt: 't1', members: ['a', 'b'] }), updated_at: 't1' });
          return { v: JSON.stringify({ updatedAt: 't0', members: ['a'] }) }; // current は古い版を返す
        }
        return origFirst();
      };
    }
    return s;
  };
  const store = createD1Store(d1);
  const res = await store.update('r', (cur) => ({
    changed: true,
    value: { members: [...cur.members, 'c'], updatedAt: cur.updatedAt + '+c' },
  }));
  assert.equal(res.ok, true);
  assert.deepEqual(res.value.members, ['a', 'b', 'c']); // b が消えず c が加わる
});

test('update: リトライを使い切ると contended を返す', async () => {
  // CAS UPDATE が常に changes:0（競合し続ける）状況。
  const d1 = fakeD1({ r: JSON.stringify({ updatedAt: 't0' }) });
  const origPrepare = d1.prepare.bind(d1);
  d1.prepare = (sql) => {
    const s = origPrepare(sql);
    if (/^UPDATE kv SET/i.test(sql)) {
      s.run = async () => ({ success: true, meta: { changes: 0 } });
    }
    return s;
  };
  const store = createD1Store(d1);
  const res = await store.update('r', (cur) => ({ changed: true, value: { updatedAt: 'x' } }), { retries: 2 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'contended');
});
