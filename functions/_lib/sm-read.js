// sm_* の読み取り（観戦プラットフォーム P0 ⑤ 配信用）
// /api/live が sm_fixtures を sm_teams と JOIN して日程＋ライブスコアを返す。
// 障害隔離: クエリ失敗や results 欠落でも例外を投げず空配列を返す。

// state_id → 表示ステータス（SportMonks確定値）。
//   LIVE = 在プレー(2前半/6延長/9PK/22後半) ＋ 試合中の中断(3HT/4延長待ち/21延長中断/25PK前)
//   FT   = 5/7/8（FT/AET/PK後）
//   NS   = それ以外(1含む)
// ※ 22(後半)が抜けていると後半開始でライブ表示が消える。
const LIVE_STATES = new Set([2, 3, 4, 6, 9, 21, 22, 25]);
const FT_STATES = new Set([5, 7, 8]);
export function statusFromState(stateId) {
	if (LIVE_STATES.has(stateId)) return "LIVE";
	if (FT_STATES.has(stateId)) return "FT";
	return "NS";
}

// sm_fixtures + home/away の sm_teams を LEFT JOIN。開始時刻順。
const FIXTURES_SQL = `
  SELECT
    f.sm_fixture_id, f.starting_at, f.starting_at_ts, f.state_id, f.round_name, f.result_info,
    f.minute, f.added_time,
    f.home_team_id, f.home_score, f.home_pen, f.home_xg,
    f.away_team_id, f.away_score, f.away_pen, f.away_xg,
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
		minute: row.minute ?? null, // 進行中ピリオドの経過分（無→null）
		added_time: row.added_time ?? null, // アディショナル分（無→null）
		home: {
			team_id: row.home_team_id ?? null,
			app_code: row.home_app ?? null, // アプリのFIFAコード(schedule突合キー)
			name: row.home_name ?? null,
			short_code: row.home_short ?? null,
			image_url: row.home_img ?? null,
			score: row.home_score ?? null,
			pen_score: row.home_pen ?? null, // PK戦スコア（非PKはnull）
			xg: row.home_xg ?? null,
		},
		away: {
			team_id: row.away_team_id ?? null,
			app_code: row.away_app ?? null,
			name: row.away_name ?? null,
			short_code: row.away_short ?? null,
			image_url: row.away_img ?? null,
			score: row.away_score ?? null,
			pen_score: row.away_pen ?? null,
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
    f.minute, f.added_time,
    f.home_team_id, f.home_score, f.home_pen, f.home_xg,
    f.away_team_id, f.away_score, f.away_pen, f.away_xg,
    h.name AS home_name, h.short_code AS home_short, h.image_url AS home_img, h.app_code AS home_app,
    a.name AS away_name, a.short_code AS away_short, a.image_url AS away_img, a.app_code AS away_app
  FROM sm_fixtures f
  LEFT JOIN sm_teams h ON h.sm_team_id = f.home_team_id
  LEFT JOIN sm_teams a ON a.sm_team_id = f.away_team_id
  WHERE f.sm_fixture_id = ?`;

// VAR ゴール取消(type=var_goal_disallowed)を対象ゴールへ統合する（表示/AI 共通の前処理）。
// 背景: SportMonks は取消ゴールを API レスポンスから消すが、ライブ中に取り込んだ
//   goal 行は D1 に残る（取り込みは upsert で削除しない）。結果、同一選手のゴール(77')と
//   VARイベント(78')が二重表示される。
// 方針: VAR と同一選手の直近ゴール(minute<=VAR minute)を goal_disallowed に上書きし、
//   別個の VAR 行は畳む（=対象ゴールの時間にプロットしたまま「取消」表示にする）。
//   対応ゴールが見つからなければ VAR 行は残す（review時刻で「ゴール取消」と表示）。
export function reconcileVarDisallowedGoals(events) {
	const list = Array.isArray(events) ? events : [];
	const vars = list.filter((e) => e && e.type === "var_goal_disallowed");
	if (vars.length === 0) return list;
	const out = list.map((e) => ({ ...e }));
	const drop = new Set();
	for (const v of vars) {
		const goal = out
			.filter(
				(e) =>
					e.type === "goal" &&
					(v.player_id != null
						? e.player_id === v.player_id
						: !!e.player_name && e.player_name === v.player_name) &&
					(e.minute ?? 0) <= (v.minute ?? Number.MAX_SAFE_INTEGER),
			)
			.sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0))[0];
		if (goal) {
			goal.type = "goal_disallowed"; // 対象ゴールを取消へ上書き
			drop.add(v.sm_event_id); // 別個の VAR 行は畳む
		}
	}
	return out.filter((e) => !drop.has(e.sm_event_id));
}

// ハイライト動画のソース優先順位（小さいほど優先）。手動が最優先で自動に上書きされない。
const HIGHLIGHT_SOURCE_PRIORITY = {
	manual: 0,
	dazn: 1,
	fifa: 2,
	sportmonks: 3,
};

// sm_highlights 行群から表示する1本を解決する（純粋）。
// video_id を持つ行のうち最優先 source を選ぶ。無ければ null。
export function resolveHighlight(rows) {
	const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.video_id);
	if (list.length === 0) return null;
	list.sort(
		(a, b) =>
			(HIGHLIGHT_SOURCE_PRIORITY[a.source] ?? 99) -
			(HIGHLIGHT_SOURCE_PRIORITY[b.source] ?? 99),
	);
	const top = list[0];
	return {
		video_id: top.video_id,
		source: top.source,
		title: top.title ?? null,
	};
}

export async function getFixtureDetail(db, id) {
	const fxRes = await db.prepare(FIXTURE_ONE_SQL).bind(id).all();
	const fxRow = (Array.isArray(fxRes?.results) ? fxRes.results : [])[0];
	if (!fxRow) return null;
	const fixture = mapFixtureRow(fxRow);
	const all = async (sql) => {
		const r = await db.prepare(sql).bind(id).all();
		return Array.isArray(r?.results) ? r.results : [];
	};
	// 時系列順は minute(+extra_minute) で取る。sort_order は SportMonks の「型別連番」
	// (1st goal / 2nd substitution …)でグローバル時系列ではないため主キーに使わない。
	const eventsRaw = await all(
		"SELECT * FROM sm_events WHERE sm_fixture_id = ? ORDER BY minute ASC, COALESCE(extra_minute,0) ASC, sort_order ASC",
	);
	const events = reconcileVarDisallowedGoals(eventsRaw);
	const stats = await all("SELECT * FROM sm_stats WHERE sm_fixture_id = ?");
	const lineups = await all("SELECT * FROM sm_lineups WHERE sm_fixture_id = ?");
	const player_stats = await all(
		"SELECT * FROM sm_player_stats WHERE sm_fixture_id = ?",
	);
	const aiRows = await all(
		"SELECT phase, summary, model, updated_at FROM sm_match_ai WHERE sm_fixture_id = ? AND summary IS NOT NULL ORDER BY updated_at ASC",
	);
	const ai = aiRows.map((r) => ({
		phase: r.phase,
		summary: r.summary,
		model: r.model ?? null,
		generated_at: r.updated_at ?? null,
	}));
	// ハイライト動画（手動/自動）。テーブル未作成や読み失敗でも例外を投げず null（障害隔離）。
	let highlight = null;
	try {
		const hlRows = await all(
			"SELECT source, video_id, title FROM sm_highlights WHERE sm_fixture_id = ?",
		);
		highlight = resolveHighlight(hlRows);
	} catch (e) {
		console.error("getFixtureDetail: highlights read failed", e?.message);
	}
	return { fixture, events, stats, lineups, player_stats, ai, highlight };
}

// 得点王ランキング。topscorers.team_id を sm_teams.app_code で解決し、
// 取り込み時 null の app_code を埋める。順位昇順・上限付き。障害隔離で空配列フォールバック。
const TOPSCORERS_SQL = `
  SELECT t.player_name, t.goals, t.position,
         COALESCE(t.app_code, m.app_code) AS app_code
  FROM sm_topscorers t
  LEFT JOIN sm_teams m ON m.sm_team_id = t.team_id
  WHERE t.season_id = ?
  ORDER BY t.position ASC
  LIMIT ?`;

export async function listTopscorers(db, seasonId, { limit = 30 } = {}) {
	const res = await db.prepare(TOPSCORERS_SQL).bind(seasonId, limit).all();
	return Array.isArray(res?.results) ? res.results : [];
}
