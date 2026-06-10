// sm_* の読み取り（観戦プラットフォーム P0 ⑤ 配信用）
// /api/live が sm_fixtures を sm_teams と JOIN して日程＋ライブスコアを返す。
// 障害隔離: クエリ失敗や results 欠落でも例外を投げず空配列を返す。

// state_id → 表示ステータス。2/3/6/9=LIVE, 5/7/8=FT, それ以外(1含む)=NS
export function statusFromState(stateId) {
	if (stateId === 2 || stateId === 3 || stateId === 6 || stateId === 9)
		return "LIVE";
	if (stateId === 5 || stateId === 7 || stateId === 8) return "FT";
	return "NS";
}

// sm_fixtures + home/away の sm_teams を LEFT JOIN。開始時刻順。
const FIXTURES_SQL = `
  SELECT
    f.sm_fixture_id, f.starting_at, f.starting_at_ts, f.state_id, f.round_name, f.result_info,
    f.home_team_id, f.home_score, f.home_xg,
    f.away_team_id, f.away_score, f.away_xg,
    h.name AS home_name, h.short_code AS home_short, h.image_url AS home_img, h.app_code AS home_app,
    a.name AS away_name, a.short_code AS away_short, a.image_url AS away_img, a.app_code AS away_app
  FROM sm_fixtures f
  LEFT JOIN sm_teams h ON h.sm_team_id = f.home_team_id
  LEFT JOIN sm_teams a ON a.sm_team_id = f.away_team_id
  ORDER BY f.starting_at_ts ASC
  LIMIT ?`;

// フラットな JOIN 行 → home/away ネスト構造
export function mapFixtureRow(row) {
	return {
		id: row.sm_fixture_id,
		starting_at: row.starting_at ?? null,
		starting_at_ts: row.starting_at_ts ?? null,
		state_id: row.state_id ?? null,
		status: statusFromState(row.state_id),
		round_name: row.round_name ?? null,
		result_info: row.result_info ?? null,
		home: {
			team_id: row.home_team_id ?? null,
			app_code: row.home_app ?? null, // アプリのFIFAコード(schedule突合キー)
			name: row.home_name ?? null,
			short_code: row.home_short ?? null,
			image_url: row.home_img ?? null,
			score: row.home_score ?? null,
			xg: row.home_xg ?? null,
		},
		away: {
			team_id: row.away_team_id ?? null,
			app_code: row.away_app ?? null,
			name: row.away_name ?? null,
			short_code: row.away_short ?? null,
			image_url: row.away_img ?? null,
			score: row.away_score ?? null,
			xg: row.away_xg ?? null,
		},
	};
}

export async function listFixtures(db, { limit = 120 } = {}) {
	const res = await db.prepare(FIXTURES_SQL).bind(limit).all();
	const rows = Array.isArray(res?.results) ? res.results : [];
	return rows.map(mapFixtureRow);
}

// 1試合の詳細 (fixture + 関連テーブル) を束ねて返す。
// 不在 id は null、クエリ失敗や results 欠落は空配列（障害隔離）。
const FIXTURE_ONE_SQL = `
  SELECT
    f.sm_fixture_id, f.starting_at, f.starting_at_ts, f.state_id, f.round_name, f.result_info,
    f.home_team_id, f.home_score, f.home_xg,
    f.away_team_id, f.away_score, f.away_xg,
    h.name AS home_name, h.short_code AS home_short, h.image_url AS home_img, h.app_code AS home_app,
    a.name AS away_name, a.short_code AS away_short, a.image_url AS away_img, a.app_code AS away_app
  FROM sm_fixtures f
  LEFT JOIN sm_teams h ON h.sm_team_id = f.home_team_id
  LEFT JOIN sm_teams a ON a.sm_team_id = f.away_team_id
  WHERE f.sm_fixture_id = ?`;

export async function getFixtureDetail(db, id) {
	const fxRes = await db.prepare(FIXTURE_ONE_SQL).bind(id).all();
	const fxRow = (Array.isArray(fxRes?.results) ? fxRes.results : [])[0];
	if (!fxRow) return null;
	const fixture = mapFixtureRow(fxRow);
	const all = async (sql) => {
		const r = await db.prepare(sql).bind(id).all();
		return Array.isArray(r?.results) ? r.results : [];
	};
	const events = await all(
		"SELECT * FROM sm_events WHERE sm_fixture_id = ? ORDER BY sort_order ASC, minute ASC",
	);
	const stats = await all("SELECT * FROM sm_stats WHERE sm_fixture_id = ?");
	const lineups = await all("SELECT * FROM sm_lineups WHERE sm_fixture_id = ?");
	const player_stats = await all(
		"SELECT * FROM sm_player_stats WHERE sm_fixture_id = ?",
	);
	return { fixture, events, stats, lineups, player_stats };
}
