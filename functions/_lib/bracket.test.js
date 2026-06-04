import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRACKET_STRUCTURE, WILDCARD_SLOTS, PERMITTED, deriveKnockout, deriveKnockoutAuto, seedLabel } from '../../public/lib/bracket.js';

// 全12グループに1〜3位を入れたサンプル順位
const GR = {
  A: ['A1', 'A2', 'A3'], B: ['B1', 'B2', 'B3'], C: ['C1', 'C2', 'C3'],
  D: ['D1', 'D2', 'D3'], E: ['E1', 'E2', 'E3'], F: ['F1', 'F2', 'F3'],
  G: ['G1', 'G2', 'G3'], H: ['H1', 'H2', 'H3'], I: ['I1', 'I2', 'I3'],
  J: ['J1', 'J2', 'J3'], K: ['K1', 'K2', 'K3'], L: ['L1', 'L2', 'L3'],
};
// 8枠に許可グループの3位を1つずつ割当（重複なし）
const TA = { M1: 'A3', M2: 'C3', M7: 'B3', M8: 'E3', M11: 'F3', M12: 'H3', M15: 'G3', M16: 'D3' };

test('構造は16試合・ワイルドカード8枠', () => {
  assert.equal(BRACKET_STRUCTURE.r32.length, 16);
  assert.equal(WILDCARD_SLOTS.length, 8);
  assert.deepEqual(WILDCARD_SLOTS, ['M1', 'M2', 'M7', 'M8', 'M11', 'M12', 'M15', 'M16']);
});

test('PERMITTED は各ワイルドカード枠の許可グループ5つ', () => {
  assert.deepEqual(PERMITTED.M1, ['A', 'B', 'C', 'D', 'F']);
  assert.deepEqual(PERMITTED.M16, ['D', 'E', 'I', 'J', 'L']);
});

test('R32カードが順位予想と3位割当から組み上がる', () => {
  const d = deriveKnockout(GR, TA, {});
  // M3 = A2 vs B2（直接シード）
  assert.deepEqual(d.matches.r32[2], ['A2', 'B2']);
  // M1 = E1 vs ワイルドカード(A3)
  assert.deepEqual(d.matches.r32[0], ['E1', 'A3']);
  // M16 = K1 vs ワイルドカード(D3)
  assert.deepEqual(d.matches.r32[15], ['K1', 'D3']);
});

test('順位未入力のスロットは null カード', () => {
  const d = deriveKnockout({}, {}, {});
  assert.deepEqual(d.matches.r32[2], [null, null]);
});

test('seedLabel は枠の出自を返す（直接シード／ワイルドカード）', () => {
  assert.equal(seedLabel('A1'), 'A組 1位');
  assert.equal(seedLabel('B2'), 'B組 2位');
  assert.equal(seedLabel({ wc: ['A', 'B', 'C', 'D', 'F'] }), '3位 (A/B/C/D/F)');
});

test('seeds は進出国が未確定でも常に決まっている', () => {
  const d = deriveKnockout({}, {}, {});
  // M3 = A2 vs B2（直接シード）
  assert.deepEqual(d.seeds.r32[2], ['A組 2位', 'B組 2位']);
  // M1 = E1 vs ワイルドカード
  assert.deepEqual(d.seeds.r32[0], ['E組 1位', '3位 (A/B/C/D/F)']);
});

test('deriveKnockoutAuto: 優勝・準優勝は自動で決勝まで勝ち上がる', () => {
  // E1（M1=上半分）を優勝、C1（M9=下半分）を準優勝に
  const d = deriveKnockoutAuto(GR, TA, {}, ['E1', 'C1']);
  assert.equal(d.winners.r32[0], 'E1');
  assert.equal(d.winners.r32[8], 'C1');
  assert.deepEqual(d.finalists, ['E1', 'C1']); // 両者が決勝（sf勝者）へ
});

test('deriveKnockoutAuto: forced はユーザー選択より優先される', () => {
  // M1 = E1 vs A3。ユーザーが A3 を選んでも優勝 E1 が勝つ
  const d = deriveKnockoutAuto(GR, TA, { r32: ['A3'] }, ['E1']);
  assert.equal(d.winners.r32[0], 'E1');
});

test('勝者は対戦カードに含まれる場合のみ有効', () => {
  const ko = { r32: ['E1', 'I1', 'A2', 'F1', 'K2', 'H1', 'D1', 'G1', 'C1', 'E2', 'A1', 'L1', 'J1', 'D2', 'B1', 'K1'] };
  const d = deriveKnockout(GR, TA, ko);
  assert.equal(d.winners.r32[2], 'A2'); // A2 は M3 のカードに含まれる→有効
  // 不正な勝者は消える
  const bad = deriveKnockout(GR, TA, { r32: ['ZZ'] });
  assert.equal(bad.winners.r32[0], null);
});

test('上流の勝者から下流カードが組まれる（R16ペア）', () => {
  const ko = { r32: ['E1', 'I1', 'A2', 'F1', 'K2', 'H1', 'D1', 'G1', 'C1', 'E2', 'A1', 'L1', 'J1', 'D2', 'B1', 'K1'] };
  const d = deriveKnockout(GR, TA, ko);
  // R16 M1×M2 → 勝者 E1, I1
  assert.deepEqual(d.matches.r16[0], ['E1', 'I1']);
  assert.equal(d.matches.r16.length, 8);
  assert.equal(d.matches.sf.length, 2);
});

test('決勝進出者は sf 勝者（finalists）', () => {
  const ko = {
    r32: ['E1', 'I1', 'A2', 'F1', 'K2', 'H1', 'D1', 'G1', 'C1', 'E2', 'A1', 'L1', 'J1', 'D2', 'B1', 'K1'],
    r16: ['E1', 'F1', 'K2', 'D1', 'C1', 'A1', 'J1', 'B1'],
    qf: ['E1', 'K2', 'C1', 'J1'],
    sf: ['E1', 'C1'],
  };
  const d = deriveKnockout(GR, TA, ko);
  assert.deepEqual(d.finalists, ['E1', 'C1']);
});
