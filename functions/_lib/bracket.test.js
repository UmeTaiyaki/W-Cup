import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRACKET_STRUCTURE, WILDCARD_SLOTS, PERMITTED, deriveKnockout } from '../../public/lib/bracket.js';

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
