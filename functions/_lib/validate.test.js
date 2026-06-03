import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from './validate.js';
import { DEFAULT_CONFIG } from './defaults.js';

test('デフォルト設定は妥当', () => {
  const r = validateConfig(DEFAULT_CONFIG);
  assert.equal(r.ok, true);
  assert.equal(r.value.teams.length, 48);
  assert.ok(r.value.result.knockout);
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


test('欠損フィールドは正規化で補完される', () => {
  const r = validateConfig({ teams: [{ code: 'AAA', ja: 'A' }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.scorerSuggest, []);
  assert.deepEqual(r.value.result.bracket.r16, []);
  assert.equal(r.value.result.champion, null);
  assert.deepEqual(r.value.schedule, []);
});

test('groups: 妥当な所属は通り正規化される', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }, { code: 'BBB', ja: 'B' }],
    groups: { A: ['aaa', 'BBB'] },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.groups.A, ['AAA', 'BBB']);
});

test('groups: 未登録コードは失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    groups: { A: ['ZZZ'] },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /groups/);
});

test('groups: 不正なキーは失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    groups: { Z: ['AAA'] },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /groups/);
});

test('groupResult: 所属外コードは失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }, { code: 'BBB', ja: 'B' }],
    groups: { A: ['AAA'] },
    groupResult: { A: ['BBB'] },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /groupResult/);
});

test('groupResult: 所属内コードは通る', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }, { code: 'BBB', ja: 'B' }],
    groups: { A: ['AAA', 'BBB'] },
    groupResult: { A: ['BBB', 'AAA'] },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.groupResult.A, ['BBB', 'AAA']);
});

test('groups/groupResult 省略時は空オブジェクト', () => {
  const r = validateConfig({ teams: [{ code: 'AAA', ja: 'A' }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.groups, {});
  assert.deepEqual(r.value.groupResult, {});
});

test('groups: 同一グループ内の重複は失敗', () => {
  const r = validateConfig({ teams: [{ code: 'AAA', ja: 'A' }], groups: { A: ['AAA', 'AAA'] } });
  assert.equal(r.ok, false);
  assert.match(r.error, /重複/);
});

test('groups: 複数グループへの所属は失敗', () => {
  const r = validateConfig({ teams: [{ code: 'AAA', ja: 'A' }], groups: { A: ['AAA'], B: ['AAA'] } });
  assert.equal(r.ok, false);
  assert.match(r.error, /複数グループ/);
});

test('groupResult: 同一チームを複数順位は失敗', () => {
  const r = validateConfig({ teams: [{ code: 'AAA', ja: 'A' }, { code: 'BBB', ja: 'B' }], groups: { A: ['AAA', 'BBB'] }, groupResult: { A: ['AAA', 'AAA'] } });
  assert.equal(r.ok, false);
  assert.match(r.error, /重複/);
});

test('groups: 空文字スロットの重複は許容', () => {
  const r = validateConfig({ teams: [{ code: 'AAA', ja: 'A' }], groups: { A: ['AAA', '', '', ''] } });
  assert.equal(r.ok, true);
});

test('result.knockout は既知コードのみ許容し正規化', () => {
  const r = validateConfig({
    teams: [{ code: 'ARG', ja: 'A' }, { code: 'FRA', ja: 'F' }],
    result: { knockout: { r32: ['arg', 'fra'], r16: ['ARG'], qf: [], sf: [] } },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.result.knockout.r32, ['ARG', 'FRA']);
  assert.deepEqual(r.value.result.knockout.sf, []);
});

test('result.knockout に未登録コードは失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'ARG', ja: 'A' }],
    result: { knockout: { r32: ['ZZZ'] } },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /knockout/);
});
