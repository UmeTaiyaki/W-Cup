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

// VAR レビュー系 type_id。判定内容は event.sub_type_id（汎用 sub_event 記述子）に入る。
// 実データ確定済: 10=VAR / 1697=VAR_CARD（カード判定）。sub 1512=Goal Disallowed（ゴール取消）。
// 未知の VAR サブタイプは汎用 "var" に倒す。
// ※ type 列に解決済みトークンを載せることで、別マイグレーション無しに表示/AI へ届ける。
export const VAR_TYPE_IDS = new Set([10, 1697]);
export const VAR_SUBTYPE_TYPES = Object.freeze({
	1512: "var_goal_disallowed", // ゴール取消
});

// 1イベント → 正規化 type 名。VAR はサブタイプまで解決し、未知 type_id は null。
export function resolveEventType(e) {
	if (VAR_TYPE_IDS.has(e?.type_id)) {
		return VAR_SUBTYPE_TYPES[e?.sub_type_id] ?? "var";
	}
	return EVENT_TYPE_NAMES[e?.type_id] ?? null;
}

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

// periods[] から進行中(ticking)ピリオドの経過分とアディショナルを抽出（純粋）。
// SportMonks: ticking=true のピリオドが現在進行中。minutes=経過分、time_added=アディショナル分。
// 進行中ピリオドが無い（未開始/ハーフタイム/終了）場合は両方 null＝表示側はステータスへフォールバック。
export function liveMinute(detail) {
	const periods = Array.isArray(detail?.periods) ? detail.periods : [];
	const p = periods.find((x) => x?.ticking);
	if (!p) return { minute: null, added: null };
	const minute = typeof p.minutes === "number" ? p.minutes : null;
	const added =
		typeof p.time_added === "number" && p.time_added > 0 ? p.time_added : null;
	return { minute, added };
}

// fixture detail → sm_fixtures 1行
export function toFixtureRow(detail) {
	const { home, away } = participantsByLocation(detail);
	const { minute, added } = liveMinute(detail);
	return {
		sm_fixture_id: detail?.id ?? null,
		league_id: detail?.league_id ?? null,
		season_id: detail?.season_id ?? null,
		// KO構造は stage.name（"Round of 16"等）に入る。round.name は群リーグの節番号 or KO で null。
		round_name: detail?.stage?.name ?? detail?.round?.name ?? null,
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
		minute, // 進行中ピリオドの経過分（無→null）
		added_time: added, // アディショナル分（無→null）
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
			type: resolveEventType(e),
			type_id: e.type_id ?? null,
			team_id: e.participant_id ?? null,
			player_name: e.player_name ?? null,
			related_player_name: e.related_player_name ?? null,
			player_id: e.player_id ?? null,
			related_player_id: e.related_player_id ?? null,
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

// lineups.player.teams から現所属クラブ（meta.active=true 優先・無ければ先頭）を返す。
function activeClub(l) {
	const teams = Array.isArray(l?.player?.teams) ? l.player.teams : [];
	if (teams.length === 0) return null;
	return teams.find((t) => t?.meta?.active === true) ?? teams[0] ?? null;
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
			date_of_birth: l?.player?.date_of_birth ?? null,
			height: l?.player?.height ?? null,
			weight: l?.player?.weight ?? null,
			nationality_id: l?.player?.nationality_id ?? null,
			nationality_name: l?.player?.nationality?.name ?? null,
			detailed_position:
				l.detailed_position ?? l?.player?.detailedposition?.name ?? null,
			club_name: activeClub(l)?.name ?? null,
			club_image: activeClub(l)?.image_path ?? null,
		}));
}

// lineups[].details[] → sm_player_stats 行（縦持ち）
// 重複 (player_id, type_id) は sm_player_stats の PRIMARY KEY upsert 側で吸収する前提。
export function toPlayerStatRows(detail) {
	const lineups = Array.isArray(detail?.lineups) ? detail.lineups : [];
	const rows = [];
	for (const l of lineups) {
		if (l?.player_id == null) continue;
		const details = Array.isArray(l.details) ? l.details : [];
		for (const d of details) {
			if (d?.type_id == null) continue;
			rows.push({
				sm_fixture_id: l.fixture_id ?? detail?.id ?? null,
				player_id: l.player_id,
				type_id: d.type_id,
				value: d?.data?.value ?? null,
			});
		}
	}
	return rows;
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

// season topscorers data[] → sm_topscorers 行（純変換）
// ゴール得点王のみ抽出（GOAL_TYPE_ID）。アシスト/カード種別は除外。
// app_code は participant→sm_teams の解決を要するため取り込み時は null、配信側 JOIN で埋める。
export const GOAL_TYPE_ID = 208; // 仮値: 本大会データで実 type_id を検証・修正する
export function toTopscorerRows(body, seasonId) {
	const list = Array.isArray(body?.data) ? body.data : [];
	return list
		.filter((d) => d?.player_id != null && d?.type_id === GOAL_TYPE_ID)
		.map((d) => ({
			season_id: seasonId ?? null,
			player_id: d.player_id,
			player_name: d?.player?.name ?? null,
			team_id: d?.participant_id ?? d?.participant?.id ?? null,
			app_code: null,
			goals: typeof d.total === "number" ? d.total : null,
			position: typeof d.position === "number" ? d.position : null,
		}));
}
