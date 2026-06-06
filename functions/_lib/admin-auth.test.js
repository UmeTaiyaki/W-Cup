import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  timingSafeEqual,
  verifyPassword,
  generateToken,
  createSession,
  verifySession,
  deleteSession,
  SESSION_TTL_SEC,
} from './admin-auth.js';

// 最小フェイク KV。put の options（expirationTtl）も記録して検証する。
function fakeKV(initial = {}) {
  const data = new Map(Object.entries(initial));
  const puts = [];
  return {
    data,
    puts,
    async get(key) { return data.has(key) ? data.get(key) : null; },
    async put(key, value, opts) { data.set(key, value); puts.push({ key, value, opts }); },
    async delete(key) { data.delete(key); },
  };
}

test('timingSafeEqual は一致で true、不一致で false', () => {
  assert.equal(timingSafeEqual('secret', 'secret'), true);
  assert.equal(timingSafeEqual('secret', 'Secret'), false);
  assert.equal(timingSafeEqual('secret', 'secrets'), false); // 長さ違い
  assert.equal(timingSafeEqual('', ''), true);
  assert.equal(timingSafeEqual(null, undefined), true); // どちらも '' 扱い
});

test('verifyPassword は ADMIN_PASSWORD と一致した時だけ true', () => {
  const env = { ADMIN_PASSWORD: 'p@ss-word-123' };
  assert.equal(verifyPassword(env, 'p@ss-word-123'), true);
  assert.equal(verifyPassword(env, 'wrong'), false);
});

test('verifyPassword は ADMIN_PASSWORD 未設定なら常に false', () => {
  assert.equal(verifyPassword({}, 'anything'), false);
  assert.equal(verifyPassword({ ADMIN_PASSWORD: '' }, ''), false);
  assert.equal(verifyPassword(null, 'x'), false);
});

test('generateToken は十分長い16進文字列で毎回異なる', () => {
  const a = generateToken();
  const b = generateToken();
  assert.match(a, /^[0-9a-f]{64}$/); // 32バイト = 64 hex
  assert.notEqual(a, b);
});

test('createSession は KV に expirationTtl 付きで保存しトークンを返す', async () => {
  const kv = fakeKV();
  const token = await createSession(kv, { now: () => 1000 });
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(kv.puts.length, 1);
  assert.equal(kv.puts[0].key, 'session:' + token);
  assert.equal(kv.puts[0].opts.expirationTtl, SESSION_TTL_SEC);
  assert.deepEqual(JSON.parse(kv.puts[0].value), { iat: 1000 });
});

test('verifySession は有効トークンで true、未知/空トークンで false', async () => {
  const kv = fakeKV();
  const token = await createSession(kv);
  assert.equal(await verifySession(kv, token), true);
  assert.equal(await verifySession(kv, 'unknown-token'), false);
  assert.equal(await verifySession(kv, ''), false);
  assert.equal(await verifySession(kv, null), false);
});

test('verifySession は KV エラー時に false（フェイルクローズ）', async () => {
  const kv = { async get() { throw new Error('kv down'); } };
  assert.equal(await verifySession(kv, 'some-token'), false);
});

test('deleteSession でトークンが無効化される', async () => {
  const kv = fakeKV();
  const token = await createSession(kv);
  await deleteSession(kv, token);
  assert.equal(await verifySession(kv, token), false);
});
