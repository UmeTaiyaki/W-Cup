import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskCode, validateFeedbackText, buildDiscordPayload } from './feedback.js';

test('maskCode は末尾4桁だけ残して ****-XXXX を返す', () => {
  assert.equal(maskCode('ABCD2345'), '****-2345');
});
test('maskCode はハイフン付きコードを正規化してからマスクする', () => {
  assert.equal(maskCode('ABCD-2345'), '****-2345');
});
test('maskCode は4文字以下を **** に潰す', () => {
  assert.equal(maskCode('AB'), '****');
  assert.equal(maskCode('ABCD'), '****');
});
test('maskCode は空・null を - にする', () => {
  assert.equal(maskCode(''), '-');
  assert.equal(maskCode(null), '-');
  assert.equal(maskCode(undefined), '-');
});

test('validateFeedbackText は trim 済みの本文を返す', () => {
  assert.deepEqual(validateFeedbackText('  こんにちは  '), { ok: true, value: 'こんにちは' });
});
test('validateFeedbackText は空・空白のみを弾く', () => {
  assert.equal(validateFeedbackText('').ok, false);
  assert.equal(validateFeedbackText('   ').ok, false);
  assert.equal(validateFeedbackText(123).ok, false);
});
test('validateFeedbackText は上限超過を弾く', () => {
  const long = 'あ'.repeat(1001);
  assert.equal(validateFeedbackText(long).ok, false);
  assert.equal(validateFeedbackText('あ'.repeat(1000)).ok, true);
});

test('buildDiscordPayload は本文と文脈を embed に詰める', () => {
  const p = buildDiscordPayload({
    text: 'バグ報告', userId: 'u_abc', name: 'たろう',
    codeMasked: '****-2345', ua: 'Mozilla/5.0', ts: '2026-06-06T00:00:00.000Z',
  });
  assert.equal(p.embeds[0].description, 'バグ報告');
  assert.equal(p.embeds[0].timestamp, '2026-06-06T00:00:00.000Z');
  const fieldsText = JSON.stringify(p.embeds[0].fields);
  assert.ok(fieldsText.includes('u_abc'));
  assert.ok(fieldsText.includes('たろう'));
  assert.ok(fieldsText.includes('****-2345'));
  assert.ok(fieldsText.includes('Mozilla/5.0'));
});
test('buildDiscordPayload は欠損値に既定を入れる', () => {
  const p = buildDiscordPayload({ text: 'x', ts: '2026-06-06T00:00:00.000Z' });
  const fieldsText = JSON.stringify(p.embeds[0].fields);
  assert.ok(fieldsText.includes('(不明)'));
});
test('buildDiscordPayload は入力オブジェクトを変更しない', () => {
  const input = { text: 'x', ua: 'a'.repeat(2000), ts: '2026-06-06T00:00:00.000Z' };
  const snapshot = JSON.stringify(input);
  buildDiscordPayload(input);
  assert.equal(JSON.stringify(input), snapshot);
});
