import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTurnstile } from './turnstile.js';

const fakeFetch = (success, codes) => async () => ({
  json: async () => ({ success, 'error-codes': codes }),
});

test('secret 未設定なら検証をスキップして通す', async () => {
  const r = await verifyTurnstile({ token: 'anything' });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
});

test('secret あり・token 欠落は失敗', async () => {
  const r = await verifyTurnstile({ secret: 's' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing-token');
});

test('siteverify success:true は通す', async () => {
  const r = await verifyTurnstile({ secret: 's', token: 't', fetchImpl: fakeFetch(true) });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, false);
});

test('siteverify success:false は弾く', async () => {
  const r = await verifyTurnstile({ secret: 's', token: 't', fetchImpl: fakeFetch(false, ['invalid-input-response']) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'verify-failed');
  assert.deepEqual(r.codes, ['invalid-input-response']);
});

test('siteverify の通信例外は fail-open（締め出さない）', async () => {
  const throwing = async () => { throw new Error('network down'); };
  const r = await verifyTurnstile({ secret: 's', token: 't', fetchImpl: throwing });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'verify-error');
});

test('remoteip を含めても検証できる', async () => {
  let captured = null;
  const capturing = async (url, opts) => { captured = opts.body; return { json: async () => ({ success: true }) }; };
  const r = await verifyTurnstile({ secret: 's', token: 't', ip: '1.2.3.4', fetchImpl: capturing });
  assert.equal(r.ok, true);
  assert.match(captured, /remoteip=1.2.3.4/);
});
