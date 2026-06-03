import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveKnockoutFromSets } from '../../public/lib/bracket.js';

// 各組1〜4位（M1..M16 の seed を満たす最小データ）
const GR = {
  A: ['A1', 'A2', 'A3', 'A4'], B: ['B1', 'B2', 'B3', 'B4'],
  C: ['C1', 'C2', 'C3', 'C4'], D: ['D1', 'D2', 'D3', 'D4'],
  E: ['E1', 'E2', 'E3', 'E4'], F: ['F1', 'F2', 'F3', 'F4'],
  G: ['G1', 'G2', 'G3', 'G4'], H: ['H1', 'H2', 'H3', 'H4'],
  I: ['I1', 'I2', 'I3', 'I4'], J: ['J1', 'J2', 'J3', 'J4'],
  K: ['K1', 'K2', 'K3', 'K4'], L: ['L1', 'L2', 'L3', 'L4'],
};

test('到達集合から対戦カードの勝者を整列する', () => {
  // M1: E1 vs (wc) → thirdAssign 未設定なら bottom=null。E1 が集合にいれば勝者
  const der = deriveKnockoutFromSets(GR, {}, { r32: ['E1'] });
  const m1Idx = 0;
  assert.deepEqual(der.matches.r32[m1Idx], ['E1', null]);
  assert.equal(der.winners.r32[m1Idx], 'E1');
});

test('r32勝者がr16カードへ伝播する', () => {
  // M3: A2 vs B2, M4: F1 vs C2 → r16[1] は M3勝者 × M4勝者
  const der = deriveKnockoutFromSets(GR, {}, {
    r32: ['A2', 'F1'], // M3勝者=A2, M4勝者=F1
    r16: ['A2'],       // r16カード(A2 vs F1)の勝者=A2
  });
  assert.deepEqual(der.matches.r16[1], ['A2', 'F1']);
  assert.equal(der.winners.r16[1], 'A2');
});

test('空集合なら勝者なし', () => {
  const der = deriveKnockoutFromSets(GR, {}, {});
  assert.ok(der.winners.r32.every((w) => w === null));
});

test('3位枠割当でワイルドカード席が埋まる', () => {
  const der = deriveKnockoutFromSets(GR, { M1: 'A3' }, { r32: ['A3'] });
  assert.deepEqual(der.matches.r32[0], ['E1', 'A3']);
  assert.equal(der.winners.r32[0], 'A3');
});
