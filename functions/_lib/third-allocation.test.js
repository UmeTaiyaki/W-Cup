import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THIRD_ALLOCATION, thirdAllocation, WINNER_ORDER, WINNER_SLOT,
} from '../../public/lib/third-allocation.js';
import { resolveThirdAssign, deriveKnockout, PERMITTED, WILDCARD_SLOTS } from '../../public/lib/bracket.js';

test('Annex C 表は C(12,8)=495 通り', () => {
  assert.equal(Object.keys(THIRD_ALLOCATION).length, 495);
});

test('全行が全単射・許可クラスタ適合・通過セット一致', () => {
  for (const [key, val] of Object.entries(THIRD_ALLOCATION)) {
    assert.equal(val.length, 8, `${key}: 値が8文字でない`);
    const groups = val.split('');
    // 全単射（3位グループに重複なし）
    assert.equal(new Set(groups).size, 8, `${key}: 3位グループに重複`);
    // 通過セット（キー）= 割当された3位グループ集合
    assert.equal([...groups].sort().join(''), key, `${key}: 通過セット不一致`);
    // 各割当が許可クラスタに適合
    WINNER_ORDER.forEach((w, i) => {
      const slot = WINNER_SLOT[w];
      assert.ok(PERMITTED[slot].includes(groups[i]), `${key}: ${slot} に 3${groups[i]} は不許可`);
    });
  }
});

test('WINNER_SLOT は既存ワイルドカードスロットと一致', () => {
  assert.deepEqual(Object.values(WINNER_SLOT).sort(), [...WILDCARD_SLOTS].sort());
});

test('thirdAllocation: 検証済み既知行（EFGHIJKL）', () => {
  // A1=3E, B1=3J, D1=3I, E1=3F, G1=3H, I1=3G, K1=3L, L1=3K
  const alloc = thirdAllocation(['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  assert.deepEqual(alloc, {
    M11: 'E', M15: 'J', M7: 'I', M1: 'F', M8: 'H', M2: 'G', M16: 'L', M12: 'K',
  });
});

test('thirdAllocation: 入力順は不問（ソートでキー化）', () => {
  const a = thirdAllocation(['L', 'K', 'J', 'I', 'H', 'G', 'F', 'E']);
  const b = thirdAllocation(['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  assert.deepEqual(a, b);
});

test('thirdAllocation: 8組未満・不正は null', () => {
  assert.equal(thirdAllocation(['A', 'B', 'C']), null);
  assert.equal(thirdAllocation([]), null);
  assert.equal(thirdAllocation(['A', 'A', 'B', 'C', 'D', 'E', 'F', 'G']), null); // 重複→7種でキー無し
});

test('resolveThirdAssign: グループ→各組3位の実コードへ解決', () => {
  const gr = {};
  for (const g of ['A','B','C','D','E','F','G','H','I','J','K','L']) gr[g] = [g + '1', g + '2', g + '3', g + '4'];
  const ta = resolveThirdAssign(gr, ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  // M1=E1の相手=3F → F3, M2=I1の相手=3G → G3 ...
  assert.equal(ta.M1, 'F3');
  assert.equal(ta.M2, 'G3');
  assert.equal(ta.M11, 'E3');
  assert.equal(ta.M12, 'K3');
});

test('resolveThirdAssign: 未選択は全枠 null', () => {
  const ta = resolveThirdAssign({}, []);
  assert.deepEqual(Object.keys(ta).sort(), [...WILDCARD_SLOTS].sort());
  assert.ok(Object.values(ta).every((v) => v === null));
});

test('resolveThirdAssign: 3位未予想の組は当該枠 null', () => {
  const gr = { E: ['E1', 'E2'] }; // E3 未定
  const ta = resolveThirdAssign(gr, ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  assert.equal(ta.M1, null); // M1=E1 の相手=3F だが F の順位未定 → null
});

test('統合: thirdGroups からノックアウト表の全ワイルドカード枠が埋まる', () => {
  const gr = {};
  for (const g of ['A','B','C','D','E','F','G','H','I','J','K','L']) gr[g] = [g + '1', g + '2', g + '3', g + '4'];
  const ta = resolveThirdAssign(gr, ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  const der = deriveKnockout(gr, ta, {});
  // 8つのワイルドカード枠（bottom）がすべて 3位チームで埋まる
  const r32 = der.matches.r32;
  WILDCARD_SLOTS.forEach((slot) => {
    const idx = Number(slot.slice(1)) - 1; // M1→0, M2→1 ...
    assert.ok(/3$/.test(r32[idx][1]), `${slot} の3位枠が埋まっていない: ${r32[idx][1]}`);
  });
});
