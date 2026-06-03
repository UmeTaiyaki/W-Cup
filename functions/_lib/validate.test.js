import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from './validate.js';
import { DEFAULT_CONFIG } from './defaults.js';

test('デフォルト設定は妥当', () => {
  const r = validateConfig(DEFAULT_CONFIG);
  assert.equal(r.ok, true);
  assert.equal(r.value.teams.length, 32);
  assert.equal(r.value.r16Teams.length, 16);
});

test('teams が無いと失敗', () => {
  const r = validateConfig({ teams: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /teams/);
});

test('code 重複は失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }, { code: 'AAA', ja: 'B' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /重複|duplicate/);
});

test('result.champion が teams に無いと失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    result: { champion: 'ZZZ' },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /champion/);
});

test('r16Teams は 0 か 16 以外の長さで失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    r16Teams: ['AAA', 'AAA'],
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /r16Teams/);
});

test('欠損フィールドは正規化で補完される', () => {
  const r = validateConfig({ teams: [{ code: 'AAA', ja: 'A' }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.scorerSuggest, []);
  assert.deepEqual(r.value.result.bracket.r16, []);
  assert.equal(r.value.result.champion, null);
  assert.deepEqual(r.value.schedule, []);
});
