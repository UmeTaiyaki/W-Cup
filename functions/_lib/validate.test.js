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
  assert.deepEqual(r.value.result.bracket.r16, []);
  assert.equal(r.value.result.champion, null);
  assert.deepEqual(r.value.schedule, []);
  assert.deepEqual(r.value.squads, {});
});

test('squads: 妥当な名簿は通り正規化される（club含む）', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    squads: { aaa: [{ name: ' 田中 ', pos: 'gk', club: ' FC東京 (JPN) ' }, { name: '佐藤', pos: 'FW' }] },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.squads.AAA, [
    { name: '田中', pos: 'GK', club: 'FC東京 (JPN)' },
    { name: '佐藤', pos: 'FW', club: '' },
  ]);
});

test('squads: pos/club 空は許容', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    squads: { AAA: [{ name: '無所属', pos: '' }, { name: 'ポジ無し' }] },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.squads.AAA, [
    { name: '無所属', pos: '', club: '' },
    { name: 'ポジ無し', pos: '', club: '' },
  ]);
});

test('squads: 未登録コードは失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    squads: { ZZZ: [{ name: '誰か', pos: 'MF' }] },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /squads/);
});

test('squads: 不正ポジションは失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    squads: { AAA: [{ name: '誰か', pos: 'XX' }] },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /ポジション/);
});

test('squads: 選手名が空は失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    squads: { AAA: [{ name: '   ', pos: 'MF' }] },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /選手名/);
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

test('groupMatches: 既知コード・整数スコアは妥当', () => {
  const r = validateConfig({
    ...DEFAULT_CONFIG,
    groupMatches: { A: [{ a: 'MEX', b: 'KOR', ga: 2, gb: 1 }] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.groupMatches.A[0].ga, 2);
});

test('groupMatches: 未登録コードは失敗', () => {
  const r = validateConfig({
    ...DEFAULT_CONFIG,
    groupMatches: { A: [{ a: 'ZZZ', b: 'KOR', ga: 1, gb: 0 }] },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /groupMatches/);
});

test('groupMatches: null スコアは未消化として許容', () => {
  const r = validateConfig({
    ...DEFAULT_CONFIG,
    groupMatches: { A: [{ a: 'MEX', b: 'KOR', ga: null, gb: null }] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.groupMatches.A[0].ga, null);
});

test('scorers: name+goals は妥当', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, scorers: [{ name: 'X', goals: 3 }] });
  assert.equal(r.ok, true);
  assert.equal(r.value.scorers[0].goals, 3);
});

test('scorers: 負の得点は失敗', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, scorers: [{ name: 'X', goals: -1 }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /scorers/);
});

test('result.thirdAssign: 既知コード・正しいスロットは妥当', () => {
  const r = validateConfig({
    ...DEFAULT_CONFIG,
    result: { ...DEFAULT_CONFIG.result, thirdAssign: { M1: 'BRA' } },
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.result.thirdAssign.M1, 'BRA');
});

test('result.thirdAssign: 不正スロットキーは失敗', () => {
  const r = validateConfig({
    ...DEFAULT_CONFIG,
    result: { ...DEFAULT_CONFIG.result, thirdAssign: { ZZ: 'BRA' } },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /thirdAssign/);
});

test('result.thirdGroups: A〜L の重複なしは妥当・大文字化', () => {
  const r = validateConfig({
    ...DEFAULT_CONFIG,
    result: { ...DEFAULT_CONFIG.result, thirdGroups: ['e', 'f', 'g'] },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.result.thirdGroups, ['E', 'F', 'G']);
});

test('result.thirdGroups: 重複・不正グループ・9組超は失敗', () => {
  for (const tg of [['A', 'A'], ['Z'], ['A','B','C','D','E','F','G','H','I']]) {
    const r = validateConfig({
      ...DEFAULT_CONFIG,
      result: { ...DEFAULT_CONFIG.result, thirdGroups: tg },
    });
    assert.equal(r.ok, false, `${tg} は失敗すべき`);
    assert.match(r.error, /thirdGroups/);
  }
});

test('aliases 正常系', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, aliases: [
    { canonical: 'BRA::VINICIUS JUNIOR', variants: ['VINI JR. (BRA)'], smPlayerId: 5 },
  ]});
  assert.equal(r.ok, true);
  assert.equal(r.value.aliases[0].canonical, 'BRA::VINICIUS JUNIOR');
});

test('aliases 未指定なら空配列', () => {
  const r = validateConfig(DEFAULT_CONFIG);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.aliases, []);
});

test('aliases が非配列は失敗', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, aliases: {} });
  assert.equal(r.ok, false);
  assert.match(r.error, /aliases/);
});

test('aliases の canonical 欠落は失敗', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, aliases: [{ variants: ['X'] }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /canonical/);
});
