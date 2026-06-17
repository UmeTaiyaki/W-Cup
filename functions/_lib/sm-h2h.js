// 試合前カード H2H（過去対戦）の純粋ヘルパ群（D1/環境に依存しない）。
// API ハンドラ（functions/api/h2h.js）と Cron 同期（sm-sync.js syncH2H）から利用。
// H2H 集計・D1 読み込み整形の純関数（データソース非依存）。

// 取得対象 fixture の窓（現在〜N日後の未開始試合のみ H2H を事前取得）。
export const H2H_WINDOW_DAYS = 7;

// homeTeamId 視点で、正規化済み結果配列から勝/分/敗を集計。関与しない結果はスキップ。
export function aggregateResults(homeTeamId, results) {
	const out = { home_wins: 0, draws: 0, away_wins: 0, total: 0 };
	for (const r of results || []) {
		if (!r) continue;
		let forGoals;
		let againstGoals;
		if (r.home_team_id === homeTeamId) {
			forGoals = r.home_score;
			againstGoals = r.away_score;
		} else if (r.away_team_id === homeTeamId) {
			forGoals = r.away_score;
			againstGoals = r.home_score;
		} else {
			continue;
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
