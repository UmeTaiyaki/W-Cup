// SportMonks fixture detail → sm_* テーブル行への純粋変換（観戦プラットフォーム P0 ③）
// 実データ検証(2026-06-09 fixture 18452339)で確定した構造に基づく。
// 方針: 変換は副作用なしの純粋関数。D1 upsert は別(Cron Worker)に置きテスト容易性を保つ。
// 不変条件: 壊れた/欠損入力でも例外を投げず空配列 or null フィールドで返す（障害隔離）。

// 確定済み event type_id（core/types ページ1）。表示名へ解決する。
export const EVENT_TYPE_NAMES = Object.freeze({
	14: "goal",
	15: "own_goal",
	16: "penalty",
	17: "missed_penalty",
	18: "substitution",
	19: "yellowcard",
	20: "redcard",
	21: "yellowredcard",
	22: "pen_shootout_miss",
	23: "pen_shootout_goal",
});

// 最終/現在スコアは scores[].description == 'CURRENT'（type_id=1525）から取る。
const SCORE_CURRENT = "CURRENT";

function participantsByLocation(detail) {
	const parts = Array.isArray(detail?.participants) ? detail.participants : [];
	const home = parts.find((p) => p?.meta?.location === "home") || null;
	const away = parts.find((p) => p?.meta?.location === "away") || null;
	return { home, away };
}

function currentGoals(detail, participant) {
	const scores = Array.isArray(detail?.scores) ? detail.scores : [];
	const hit = scores.find(
		(s) =>
			s?.description === SCORE_CURRENT && s?.score?.participant === participant,
	);
	return hit ? hit.score.goals : null;
}

// xG は xGFixture include（レスポンスキー xgfixture・配列）から location で取る。
// 各要素例: { participant_id, location, type_id, value }。statistics には来ない。
function xgFor(detail, location) {
	const xg = Array.isArray(detail?.xgfixture)
		? detail.xgfixture
		: Array.isArray(detail?.xGFixture)
			? detail.xGFixture
			: [];
	const hit = xg.find((x) => x?.location === location);
	if (!hit) return null;
	return hit.value ?? hit?.data?.value ?? null;
}

// participants[] → sm_teams 行（image_path=ロゴURL）
export function toTeamRows(detail) {
	const parts = Array.isArray(detail?.participants) ? detail.participants : [];
	return parts
		.filter((p) => p?.id != null)
		.map((p) => ({
			sm_team_id: p.id,
			name: p.name ?? null,
			short_code: p.short_code ?? null,
			image_url: p.image_path ?? null,
		}));
}

// fixture detail → sm_fixtures 1行
export function toFixtureRow(detail) {
	const { home, away } = participantsByLocation(detail);
	return {
		sm_fixture_id: detail?.id ?? null,
		league_id: detail?.league_id ?? null,
		season_id: detail?.season_id ?? null,
		round_name: null, // round_id は別 include(rounds/stages)。P0では未解決→後で埋める
		starting_at: detail?.starting_at ?? null,
		starting_at_ts: detail?.starting_at_timestamp ?? null,
		state_id: detail?.state_id ?? null,
		state_short: null, // state include 未取得。state_id のみ
		home_team_id: home?.id ?? null,
		away_team_id: away?.id ?? null,
		home_score: currentGoals(detail, "home"),
		away_score: currentGoals(detail, "away"),
		home_xg: xgFor(detail, "home"),
		away_xg: xgFor(detail, "away"),
		venue: null, // venue_id のみ。名称は venues include で後付け
		result_info: detail?.result_info ?? null,
	};
}

// events[] → sm_events 行（SportMonks の event id を PK に。type 名を解決）
export function toEventRows(detail) {
	const events = Array.isArray(detail?.events) ? detail.events : [];
	return events
		.filter((e) => e?.id != null)
		.map((e) => ({
			sm_event_id: e.id,
			sm_fixture_id: e.fixture_id ?? detail?.id ?? null,
			minute: e.minute ?? null,
			extra_minute: e.extra_minute ?? null,
			type: EVENT_TYPE_NAMES[e.type_id] ?? null,
			type_id: e.type_id ?? null,
			team_id: e.participant_id ?? null,
			player_name: e.player_name ?? null,
			related_player_name: e.related_player_name ?? null,
			sort_order: e.sort_order ?? null,
		}));
}

// statistics[] → sm_stats 行（縦持ち。value は data.value、team=participant_id）
export function toStatRows(detail) {
	const stats = Array.isArray(detail?.statistics) ? detail.statistics : [];
	return stats
		.filter((s) => s?.type_id != null && s?.participant_id != null)
		.map((s) => ({
			sm_fixture_id: s.fixture_id ?? detail?.id ?? null,
			team_id: s.participant_id,
			type_id: s.type_id,
			value: s?.data?.value ?? null,
		}));
}

// lineups[] → sm_lineups 行。type_id 11=先発/12=控え。xg は xglineup.value。
export function toLineupRows(detail) {
	const lineups = Array.isArray(detail?.lineups) ? detail.lineups : [];
	return lineups
		.filter((l) => l?.player_id != null)
		.map((l) => ({
			sm_fixture_id: l.fixture_id ?? detail?.id ?? null,
			team_id: l.team_id ?? null,
			player_id: l.player_id,
			player_name: l.player_name ?? null,
			jersey_number: l.jersey_number ?? null,
			position: l.position_id != null ? String(l.position_id) : null,
			formation_field: l.formation_field ?? null,
			is_start: l.type_id === 11 ? 1 : l.type_id === 12 ? 0 : null,
			xg: l?.xglineup?.value ?? null,
		}));
}

// core/types data[] → sm_types 行
export function toTypeRows(types) {
	const list = Array.isArray(types) ? types : [];
	return list
		.filter((t) => t?.id != null)
		.map((t) => ({
			type_id: t.id,
			code: t.code ?? null,
			name: t.name ?? null,
		}));
}
