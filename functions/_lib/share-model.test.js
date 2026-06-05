import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupTop2,
  groupRanking,
  availableCards,
  parseScorer,
  shareFilename,
  shareText,
  GROUP_KEYS,
} from '../../public/lib/share-model.js';

test('groupTop2: 各グループの先頭2件のみ返す', () => {
  const gr = { A: ['ARG', 'MEX', 'KOR', 'RSA'], B: ['BRA'], C: [] };
  const out = groupTop2(gr);
  assert.deepEqual(out.A, ['ARG', 'MEX']);
  assert.deepEqual(out.B, ['BRA']);
  assert.deepEqual(out.C, []);
  // 全12キーが存在する
  assert.equal(Object.keys(out).length, GROUP_KEYS.length);
});

test('groupTop2: falsy要素を除去する', () => {
  const out = groupTop2({ A: [null, 'ARG', '', 'MEX'] });
  assert.deepEqual(out.A, ['ARG', 'MEX']);
});

test('groupTop2: 不正入力は全キー空配列', () => {
  assert.deepEqual(groupTop2(null).A, []);
  assert.deepEqual(groupTop2(undefined).L, []);
});

test('availableCards: グループは1位だけでもtrue', () => {
  assert.equal(availableCards({ groupRank: { A: ['ARG'] } }).group, true);
  assert.equal(availableCards({ groupRank: { A: [] } }).group, false);
});

test('availableCards: knockoutは勝者ありかchampionでtrue', () => {
  assert.equal(availableCards({ knockout: { r32: ['ARG'] } }).knockout, true);
  assert.equal(availableCards({ champion: 'ARG' }).knockout, true);
  assert.equal(availableCards({ knockout: { r32: [] } }).knockout, false);
});

test('availableCards: coreは優勝/準優勝/得点王のいずれかでtrue', () => {
  assert.equal(availableCards({ topScorer: 'MBAPPE (FRA)' }).core, true);
  assert.equal(availableCards({ champion: 'ARG' }).core, true);
  assert.equal(availableCards({ runnerUp: 'FRA' }).core, true);
  assert.equal(availableCards({ topScorer: '   ' }).core, false);
  assert.equal(availableCards({}).core, false);
});

test('availableCards: 空予想は全false', () => {
  assert.deepEqual(availableCards({}), { core: false, group: false, knockout: false });
  assert.deepEqual(availableCards(null), { core: false, group: false, knockout: false });
});

test('groupRanking: 1〜3位予想で4位を所属チームから自動補完', () => {
  const groups = { A: ['ARG', 'MEX', 'KOR', 'RSA'] };
  const out = groupRanking({ A: ['ARG', 'MEX', 'KOR'] }, groups);
  assert.deepEqual(out.A.map((e) => e.code), ['ARG', 'MEX', 'KOR', 'RSA']);
  assert.equal(out.A[3].auto, true);
  assert.equal(out.A[0].auto, false);
});

test('groupRanking: 4位まで明示済みなら自動補完しない', () => {
  const out = groupRanking({ A: ['ARG', 'MEX', 'KOR', 'RSA'] }, { A: ['ARG', 'MEX', 'KOR', 'RSA'] });
  assert.deepEqual(out.A.map((e) => e.code), ['ARG', 'MEX', 'KOR', 'RSA']);
  assert.equal(out.A[3].auto, false);
});

test('groupRanking: グループ情報が無ければ予想ぶんだけ返す', () => {
  const out = groupRanking({ A: ['ARG', 'MEX', 'KOR'] }, {});
  assert.deepEqual(out.A.map((e) => e.code), ['ARG', 'MEX', 'KOR']);
  assert.equal(out.B.length, 0);
  assert.equal(Object.keys(out).length, GROUP_KEYS.length);
});

test('parseScorer: "NAME (CODE)" を分解', () => {
  assert.deepEqual(parseScorer('MBAPPE (FRA)'), { name: 'MBAPPE', code: 'FRA' });
  assert.deepEqual(parseScorer('BRAUT HAALAND (NOR)'), { name: 'BRAUT HAALAND', code: 'NOR' });
});

test('parseScorer: コード無し・不正入力', () => {
  assert.deepEqual(parseScorer('メッシ'), { name: 'メッシ', code: null });
  assert.deepEqual(parseScorer(''), { name: '', code: null });
  assert.deepEqual(parseScorer(null), { name: '', code: null });
});

test('shareFilename: 種別と安全化された名前を含む', () => {
  assert.equal(shareFilename('ひかる', 'group'), 'wcup2026-group-ひかる.png');
  assert.equal(shareFilename('a/b\\c:d', 'core'), 'wcup2026-core-abcd.png');
  // 不明な種別は card にフォールバック
  assert.equal(shareFilename('x', 'bogus'), 'wcup2026-card-x.png');
  // 空名は member
  assert.equal(shareFilename('', 'knockout'), 'wcup2026-knockout-member.png');
});

test('shareText: 名前・ラベル・URL・ハッシュタグを含む', () => {
  const t = shareText('ひかる', 'knockout', 'https://example.com');
  assert.match(t, /ひかる/);
  assert.match(t, /トーナメント予想/);
  assert.match(t, /https:\/\/example\.com/);
  assert.match(t, /#W杯予想/);
});

test('shareText: URL省略時はリンク行なし', () => {
  const t = shareText('そべ', 'group', '');
  assert.match(t, /そべ/);
  assert.doesNotMatch(t, /https?:/);
});
