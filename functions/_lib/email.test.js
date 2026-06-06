import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOtpEmail, sendOtpEmail } from './email.js';

test('buildOtpEmail は宛先・差出人・コード・TTL文言を含む', () => {
  const p = buildOtpEmail({ to: 'admin@example.com', from: 'noreply@example.com', code: '135790', ttlMin: 10 });
  assert.deepEqual(p.to, ['admin@example.com']);
  assert.equal(p.from, 'noreply@example.com');
  assert.match(p.subject, /135790/);
  assert.match(p.text, /135790/);
  assert.match(p.text, /10分/);
  assert.match(p.html, /135790/);
});

test('buildOtpEmail は from 未指定で resend.dev 既定差出人にフォールバック', () => {
  const p = buildOtpEmail({ to: 'admin@example.com', code: '111111' });
  assert.equal(p.from, 'onboarding@resend.dev');
});

test('sendOtpEmail は RESEND_API_KEY 未設定で not_configured', async () => {
  const res = await sendOtpEmail({}, { to: 'a@b.com', code: '123456' });
  assert.deepEqual(res, { ok: false, reason: 'not_configured' });
});

test('sendOtpEmail は宛先未設定で no_recipient', async () => {
  const res = await sendOtpEmail({ RESEND_API_KEY: 'x' }, { to: '', code: '123456' });
  assert.deepEqual(res, { ok: false, reason: 'no_recipient' });
});

test('sendOtpEmail は Resend 成功で ok（fetch をスタブ）', async () => {
  const orig = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, async text() { return ''; } };
  };
  try {
    const res = await sendOtpEmail({ RESEND_API_KEY: 'key-123', OTP_FROM_EMAIL: 'noreply@example.com' }, { to: 'admin@example.com', code: '246802' });
    assert.deepEqual(res, { ok: true });
    assert.equal(captured.url, 'https://api.resend.com/emails');
    assert.equal(captured.opts.headers.authorization, 'Bearer key-123');
    const body = JSON.parse(captured.opts.body);
    assert.deepEqual(body.to, ['admin@example.com']);
    assert.match(body.subject, /246802/);
  } finally {
    globalThis.fetch = orig;
  }
});

test('sendOtpEmail は Resend 非2xx で send_failed', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 422, async text() { return 'bad'; } });
  try {
    const res = await sendOtpEmail({ RESEND_API_KEY: 'k' }, { to: 'a@b.com', code: '1' });
    assert.deepEqual(res, { ok: false, reason: 'send_failed' });
  } finally {
    globalThis.fetch = orig;
  }
});
