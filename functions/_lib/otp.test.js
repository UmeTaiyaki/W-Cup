import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOtp,
  generateChallengeId,
  hashOtp,
  storeChallenge,
  verifyChallenge,
  deleteChallenge,
  OTP_TTL_SEC,
  OTP_MAX_ATTEMPTS,
  OTP_LENGTH,
} from './otp.js';

// 最小フェイク KV（get/put/delete）。put の options も記録する。
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

// テスト用: チャレンジを生成して KV に積み、id と平文コードを返す。
async function seedChallenge(kv, code = '123456') {
  const id = generateChallengeId();
  const codeHash = await hashOtp(id, code);
  await storeChallenge(kv, id, { codeHash });
  return { id, code };
}

test('generateOtp は既定6桁の数字で毎回（ほぼ）異なる', () => {
  const a = generateOtp();
  assert.match(a, new RegExp(`^[0-9]{${OTP_LENGTH}}$`));
  assert.match(generateOtp(8), /^[0-9]{8}$/);
  // 連続生成が全部同じになる確率は無視できる
  const set = new Set(Array.from({ length: 5 }, () => generateOtp()));
  assert.ok(set.size > 1);
});

test('hashOtp は同入力で一致・異なるコードで不一致・challengeId依存', async () => {
  const h1 = await hashOtp('cid-1', '123456');
  const h2 = await hashOtp('cid-1', '123456');
  const h3 = await hashOtp('cid-1', '654321');
  const h4 = await hashOtp('cid-2', '123456');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.notEqual(h1, h4); // 同じコードでも challengeId が違えば別ハッシュ
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('storeChallenge は otp: プレフィックスと expirationTtl 付きで保存', async () => {
  const kv = fakeKV();
  const id = generateChallengeId();
  await storeChallenge(kv, id, { codeHash: 'abc' });
  assert.equal(kv.puts.length, 1);
  assert.equal(kv.puts[0].key, 'otp:' + id);
  assert.equal(kv.puts[0].opts.expirationTtl, OTP_TTL_SEC);
  assert.deepEqual(JSON.parse(kv.puts[0].value), { codeHash: 'abc', attempts: 0 });
});

test('verifyChallenge は正しいコードで ok=true、チャレンジを削除', async () => {
  const kv = fakeKV();
  const { id, code } = await seedChallenge(kv, '246810');
  const res = await verifyChallenge(kv, id, code);
  assert.deepEqual(res, { ok: true });
  assert.equal(await kv.get('otp:' + id), null); // 成功後は削除
});

test('verifyChallenge は未知/空 ID で expired', async () => {
  const kv = fakeKV();
  assert.deepEqual(await verifyChallenge(kv, 'nope', '123456'), { ok: false, reason: 'expired' });
  assert.deepEqual(await verifyChallenge(kv, '', '123456'), { ok: false, reason: 'expired' });
  assert.deepEqual(await verifyChallenge(kv, null, '123456'), { ok: false, reason: 'expired' });
});

test('verifyChallenge は不一致で mismatch、attempts を書き戻す', async () => {
  const kv = fakeKV();
  const { id } = await seedChallenge(kv, '111111');
  const res = await verifyChallenge(kv, id, '999999');
  assert.deepEqual(res, { ok: false, reason: 'mismatch' });
  const rec = JSON.parse(await kv.get('otp:' + id));
  assert.equal(rec.attempts, 1);
});

test('verifyChallenge は上限到達でチャレンジ失効 too_many_attempts', async () => {
  const kv = fakeKV();
  const { id, code } = await seedChallenge(kv, '424242');
  // OTP_MAX_ATTEMPTS 回まで失敗できる。最後の失敗で削除される。
  for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
    assert.deepEqual(await verifyChallenge(kv, id, '000000'), { ok: false, reason: 'mismatch' });
  }
  const last = await verifyChallenge(kv, id, '000000');
  assert.deepEqual(last, { ok: false, reason: 'too_many_attempts' });
  assert.equal(await kv.get('otp:' + id), null); // 失効＝削除
  // 失効後は正しいコードでも通らない
  assert.deepEqual(await verifyChallenge(kv, id, code), { ok: false, reason: 'expired' });
});

test('deleteChallenge でチャレンジが消える', async () => {
  const kv = fakeKV();
  const { id, code } = await seedChallenge(kv);
  await deleteChallenge(kv, id);
  assert.deepEqual(await verifyChallenge(kv, id, code), { ok: false, reason: 'expired' });
});
