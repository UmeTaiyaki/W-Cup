// 試合前カード H2H（過去対戦）の純粋ヘルパ群（D1/環境に依存しない）。
// API ハンドラ（functions/api/h2h.js）と Cron 同期（sm-sync.js syncH2H）から利用。
// SportMonks のレスポンス整形・集計・D1 read 整形をここに隔離して単体テストする。

// 取得対象 fixture の窓（現在〜N日後の未開始試合のみ H2H を事前取得）。
export const H2H_WINDOW_DAYS = 7;

// SportMonks fixture（participants;scores include）から最終結果を正規化。
// home/away の team_id と CURRENT スコアが揃わなければ null（集計でスキップ）。
export function extractH2HResult(fixture) {
	const parts =
		fixture && Array.isArray(fixture.participants)
			? fixture.participants
			: null;
	if (!parts) return null;
	let homeId = null;
	let awayId = null;
	for (const p of parts) {
		const loc = p && p.meta && p.meta.location;
		if (loc === "home") homeId = p.id;
		else if (loc === "away") awayId = p.id;
	}
	if (!Number.isFinite(homeId) || !Number.isFinite(awayId)) return null;

	const scores = Array.isArray(fixture.scores) ? fixture.scores : [];
	let hg = null;
	let ag = null;
	for (const s of scores) {
		if (!s || s.description !== "CURRENT" || !s.score) continue;
		if (s.score.participant === "home") hg = s.score.goals;
		else if (s.score.participant === "away") ag = s.score.goals;
	}
	if (!Number.isFinite(hg) || !Number.isFinite(ag)) return null;
	return {
		home_team_id: homeId,
		away_team_id: awayId,
		home_score: hg,
		away_score: ag,
	};
}

// homeTeamId 視点で過去対戦の勝/分/敗を集計。対象外/欠損 fixture はスキップ。
export function aggregateH2H(homeTeamId, fixtures) {
	const out = { home_wins: 0, draws: 0, away_wins: 0, total: 0 };
	for (const f of fixtures || []) {
		const r = extractH2HResult(f);
		if (!r) continue;
		// homeTeamId がこの試合のどちら側だったかを判定し、その視点の得失で勝敗。
		let forGoals;
		let againstGoals;
		if (r.home_team_id === homeTeamId) {
			forGoals = r.home_score;
			againstGoals = r.away_score;
		} else if (r.away_team_id === homeTeamId) {
			forGoals = r.away_score;
			againstGoals = r.home_score;
		} else {
			continue; // homeTeamId が関与しない試合は除外
		}
		out.total += 1;
		if (forGoals > againstGoals) out.home_wins += 1;
		else if (forGoals < againstGoals) out.away_wins += 1;
		else out.draws += 1;
	}
	return out;
}

// sm_h2h の行配列を { "<fixtureId>": {home_code, away_code, W-D-L, total} } へ整形。
export function rowsToH2H(rows) {
	const out = {};
	for (const r of rows || []) {
		out[String(r.fixture_id)] = {
			home_code: r.home_code ?? null,
			away_code: r.away_code ?? null,
			home_wins: r.home_wins ?? 0,
			draws: r.draws ?? 0,
			away_wins: r.away_wins ?? 0,
			total: r.total ?? 0,
		};
	}
	return out;
}
