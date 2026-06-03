// 2部門採点（純ロジック / ESM）
export const SCORING = {
  champion: 25,
  runnerUp: 15,
  topScorer: 20,
  rankHit: 1, // グループ順位ピタリ1チーム
  koHit: 1,   // ノックアウト到達1チーム
};

const KO_ROUNDS = ['r32', 'r16', 'qf', 'sf'];

export function scoreMember(pred = {}, result = {}, scoring = SCORING) {
  // ---- コア ----
  const champion = pred.champion && pred.champion === result.champion ? scoring.champion : 0;
  const runnerUp = pred.runnerUp && pred.runnerUp === result.runnerUp ? scoring.runnerUp : 0;
  const topScorer =
    pred.topScorer && result.topScorer && pred.topScorer.trim() === result.topScorer.trim()
      ? scoring.topScorer
      : 0;
  const coreTotal = champion + runnerUp + topScorer;

  // ---- オプション：グループ順位 ----
  let rankPts = 0;
  let rankHits = 0;
  const gr = pred.groupRank || {};
  const grRes = result.groupResult || {};
  for (const k of Object.keys(grRes)) {
    const mine = gr[k] || [];
    const act = grRes[k] || [];
    for (let i = 0; i < 3; i++) {
      if (mine[i] && act[i] && mine[i] === act[i]) {
        rankPts += scoring.rankHit;
        rankHits += 1;
      }
    }
  }

  // ---- オプション：ノックアウト到達 ----
  let koPts = 0;
  const koHits = { r32: 0, r16: 0, qf: 0, sf: 0 };
  const ko = pred.knockout || {};
  const koRes = result.knockout || {};
  for (const r of KO_ROUNDS) {
    const mine = ko[r] || [];
    const act = new Set(koRes[r] || []);
    for (const t of mine) {
      if (t && act.has(t)) {
        koPts += scoring.koHit;
        koHits[r] += 1;
      }
    }
  }

  const optionTotal = rankPts + koPts;
  return {
    core: { champion, runnerUp, topScorer, total: coreTotal },
    option: { groupRank: rankPts, knockout: koPts, total: optionTotal, rankHits, koHits },
    coreTotal,
    optionTotal,
    grandTotal: coreTotal + optionTotal,
  };
}
