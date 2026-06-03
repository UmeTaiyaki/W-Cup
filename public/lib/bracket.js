// ベスト32トーナメント構造と対戦表導出（純ロジック / ESM）
// seed: 'X1'|'X2'（グループX 1位/2位）または { wc: ['A',...] }（3位ワイルドカード枠）

export const BRACKET_STRUCTURE = {
  r32: [
    { id: 'M1',  top: 'E1', bottom: { wc: ['A', 'B', 'C', 'D', 'F'] } },
    { id: 'M2',  top: 'I1', bottom: { wc: ['C', 'D', 'F', 'G', 'H'] } },
    { id: 'M3',  top: 'A2', bottom: 'B2' },
    { id: 'M4',  top: 'F1', bottom: 'C2' },
    { id: 'M5',  top: 'K2', bottom: 'L2' },
    { id: 'M6',  top: 'H1', bottom: 'J2' },
    { id: 'M7',  top: 'D1', bottom: { wc: ['B', 'E', 'F', 'I', 'J'] } },
    { id: 'M8',  top: 'G1', bottom: { wc: ['A', 'E', 'H', 'I', 'J'] } },
    { id: 'M9',  top: 'C1', bottom: 'F2' },
    { id: 'M10', top: 'E2', bottom: 'I2' },
    { id: 'M11', top: 'A1', bottom: { wc: ['C', 'E', 'F', 'H', 'I'] } },
    { id: 'M12', top: 'L1', bottom: { wc: ['E', 'H', 'I', 'J', 'K'] } },
    { id: 'M13', top: 'J1', bottom: 'H2' },
    { id: 'M14', top: 'D2', bottom: 'G2' },
    { id: 'M15', top: 'B1', bottom: { wc: ['E', 'F', 'G', 'I', 'J'] } },
    { id: 'M16', top: 'K1', bottom: { wc: ['D', 'E', 'I', 'J', 'L'] } },
  ],
};

export const WILDCARD_SLOTS = BRACKET_STRUCTURE.r32
  .filter((m) => Array.isArray(m.bottom?.wc))
  .map((m) => m.id);

export const PERMITTED = Object.fromEntries(
  BRACKET_STRUCTURE.r32
    .filter((m) => Array.isArray(m.bottom?.wc))
    .map((m) => [m.id, m.bottom.wc])
);

// seed トークン → チームコード
function seedTeam(seed, groupRank, thirdAssign, slotId) {
  if (typeof seed === 'string') {
    const g = seed[0];
    const pos = Number(seed[1]); // 1 or 2
    const order = groupRank[g] || [];
    return order[pos - 1] || null;
  }
  return thirdAssign[slotId] || null; // ワイルドカード
}

// 勝者配列 [w0,w1,...] → 次ラウンドのカード [[w0,w1],...]
function pair(winners) {
  const m = [];
  for (let i = 0; i < winners.length; i += 2) m.push([winners[i] || null, winners[i + 1] || null]);
  return m;
}

// 勝者を len 個に整え、各カードに含まれない勝者は null に消す
function sanitize(arr, matches, len) {
  const w = (arr || []).slice(0, len);
  while (w.length < len) w.push(null);
  return w.map((t, i) => (t && matches[i] && matches[i].includes(t) ? t : null));
}

export function deriveKnockout(groupRank = {}, thirdAssign = {}, knockout = {}) {
  const r32m = BRACKET_STRUCTURE.r32.map((m) => [
    seedTeam(m.top, groupRank, thirdAssign, m.id),
    seedTeam(m.bottom, groupRank, thirdAssign, m.id),
  ]);
  const r32w = sanitize(knockout.r32, r32m, 16);

  const r16m = pair(r32w);
  const r16w = sanitize(knockout.r16, r16m, 8);

  const qfm = pair(r16w);
  const qfw = sanitize(knockout.qf, qfm, 4);

  const sfm = pair(qfw);
  const sfw = sanitize(knockout.sf, sfm, 2);

  return {
    matches: { r32: r32m, r16: r16m, qf: qfm, sf: sfm },
    winners: { r32: r32w, r16: r16w, qf: qfw, sf: sfw },
    finalists: sfw,
  };
}
