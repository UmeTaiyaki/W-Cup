// sm_* テーブルへの upsert 文生成と D1 バッチ実行（観戦プラットフォーム P0 ③ 永続化）
// 方針: SQL 生成は純粋関数で {sql, args} を返す（テスト可能）。D1 に触れるのは runBatch のみ。
// 冪等性: 全 upsert に ON CONFLICT を付け、Cron の再取得で重複せず最新値へ更新。
import {
	toEventRows,
	toFixtureRow,
	toLineupRows,
	toPlayerStatRows,
	toStatRows,
	toTeamRows,
	toTypeRows,
} from "./sm-ingest.js";

function teamStatement(row, updatedAt) {
	return {
		sql: `INSERT INTO sm_teams (sm_team_id, name, short_code, image_url, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(sm_team_id) DO UPDATE SET
            name=excluded.name, short_code=excluded.short_code,
            image_url=excluded.image_url, updated_at=excluded.updated_at`,
		args: [row.sm_team_id, row.name, row.short_code, row.image_url, updatedAt],
	};
}

function fixtureStatement(row, updatedAt) {
	return {
		sql: `INSERT INTO sm_fixtures
            (sm_fixture_id, league_id, season_id, round_name, starting_at, starting_at_ts,
             state_id, state_short, home_team_id, away_team_id, home_score, away_score,
             home_xg, away_xg, venue, result_info, minute, added_time, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(sm_fixture_id) DO UPDATE SET
            league_id=excluded.league_id, season_id=excluded.season_id,
            round_name=COALESCE(excluded.round_name, sm_fixtures.round_name),
            starting_at=excluded.starting_at, starting_at_ts=excluded.starting_at_ts,
            state_id=excluded.state_id, state_short=excluded.state_short,
            home_team_id=excluded.home_team_id, away_team_id=excluded.away_team_id,
            home_score=excluded.home_score, away_score=excluded.away_score,
            home_xg=COALESCE(excluded.home_xg, sm_fixtures.home_xg),
            away_xg=COALESCE(excluded.away_xg, sm_fixtures.away_xg),
            venue=COALESCE(excluded.venue, sm_fixtures.venue),
            result_info=excluded.result_info,
            minute=excluded.minute, added_time=excluded.added_time,
            updated_at=excluded.updated_at`,
		args: [
			row.sm_fixture_id,
			row.league_id,
			row.season_id,
			row.round_name,
			row.starting_at,
			row.starting_at_ts,
			row.state_id,
			row.state_short,
			row.home_team_id,
			row.away_team_id,
			row.home_score,
			row.away_score,
			row.home_xg,
			row.away_xg,
			row.venue,
			row.result_info,
			row.minute ?? null,
			row.added_time ?? null,
			updatedAt,
		],
	};
}

function eventStatement(row, updatedAt) {
	return {
		sql: `INSERT INTO sm_events
            (sm_event_id, sm_fixture_id, minute, extra_minute, type, type_id,
             team_id, player_name, related_player_name, player_id, related_player_id,
             sort_order, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(sm_event_id) DO UPDATE SET
            sm_fixture_id=excluded.sm_fixture_id, minute=excluded.minute,
            extra_minute=excluded.extra_minute, type=excluded.type, type_id=excluded.type_id,
            team_id=excluded.team_id, player_name=excluded.player_name,
            related_player_name=excluded.related_player_name,
            player_id=excluded.player_id, related_player_id=excluded.related_player_id,
            sort_order=excluded.sort_order,
            updated_at=excluded.updated_at`,
		args: [
			row.sm_event_id,
			row.sm_fixture_id,
			row.minute,
			row.extra_minute,
			row.type,
			row.type_id,
			row.team_id,
			row.player_name,
			row.related_player_name,
			row.player_id ?? null,
			row.related_player_id ?? null,
			row.sort_order,
			updatedAt,
		],
	};
}

function statStatement(row, updatedAt) {
	return {
		sql: `INSERT INTO sm_stats (sm_fixture_id, team_id, type_id, value, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(sm_fixture_id, team_id, type_id) DO UPDATE SET
            value=excluded.value, updated_at=excluded.updated_at`,
		args: [row.sm_fixture_id, row.team_id, row.type_id, row.value, updatedAt],
	};
}

function typeStatement(row, updatedAt) {
	return {
		sql: `INSERT INTO sm_types (type_id, code, name, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(type_id) DO UPDATE SET
            code=excluded.code, name=excluded.name, updated_at=excluded.updated_at`,
		args: [row.type_id, row.code, row.name, updatedAt],
	};
}

function lineupStatement(row, updatedAt) {
	return {
		sql: `INSERT INTO sm_lineups
            (sm_fixture_id, team_id, player_id, player_name, jersey_number,
             position, formation_field, is_start, xg,
             date_of_birth, height, weight, nationality_id, nationality_name,
             detailed_position, club_name, club_image, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(sm_fixture_id, player_id) DO UPDATE SET
            team_id=excluded.team_id, player_name=excluded.player_name,
            jersey_number=excluded.jersey_number, position=excluded.position,
            formation_field=excluded.formation_field, is_start=excluded.is_start,
            xg=COALESCE(excluded.xg, sm_lineups.xg),
            date_of_birth=COALESCE(excluded.date_of_birth, sm_lineups.date_of_birth),
            height=COALESCE(excluded.height, sm_lineups.height),
            weight=COALESCE(excluded.weight, sm_lineups.weight),
            nationality_id=COALESCE(excluded.nationality_id, sm_lineups.nationality_id),
            nationality_name=COALESCE(excluded.nationality_name, sm_lineups.nationality_name),
            detailed_position=COALESCE(excluded.detailed_position, sm_lineups.detailed_position),
            club_name=COALESCE(excluded.club_name, sm_lineups.club_name),
            club_image=COALESCE(excluded.club_image, sm_lineups.club_image),
            updated_at=excluded.updated_at`,
		args: [
			row.sm_fixture_id,
			row.team_id,
			row.player_id,
			row.player_name,
			row.jersey_number,
			row.position,
			row.formation_field,
			row.is_start,
			row.xg,
			row.date_of_birth ?? null,
			row.height ?? null,
			row.weight ?? null,
			row.nationality_id ?? null,
			row.nationality_name ?? null,
			row.detailed_position ?? null,
			row.club_name ?? null,
			row.club_image ?? null,
			updatedAt,
		],
	};
}

function playerStatStatement(row, updatedAt) {
	return {
		sql: `INSERT INTO sm_player_stats (sm_fixture_id, player_id, type_id, value, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(sm_fixture_id, player_id, type_id) DO UPDATE SET
            value=excluded.value, updated_at=excluded.updated_at`,
		args: [row.sm_fixture_id, row.player_id, row.type_id, row.value, updatedAt],
	};
}

function topscorerStatement(row, updatedAt) {
	return {
		sql: `INSERT INTO sm_topscorers
            (season_id, player_id, player_name, team_id, app_code, goals, position, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(season_id, player_id) DO UPDATE SET
            player_name=excluded.player_name, team_id=excluded.team_id,
            app_code=COALESCE(excluded.app_code, sm_topscorers.app_code),
            goals=excluded.goals, position=excluded.position,
            updated_at=excluded.updated_at`,
		args: [
			row.season_id,
			row.player_id,
			row.player_name,
			row.team_id,
			row.app_code,
			row.goals,
			row.position,
			updatedAt,
		],
	};
}

// sm_topscorers 行配列 → upsert 文配列（純粋）
export function topscorersStatements(rows, updatedAt) {
	const list = Array.isArray(rows) ? rows : [];
	return list.map((r) => topscorerStatement(r, updatedAt));
}

// 取り込み済みだが現APIに無い「孤児」イベントを削除する文。
// 背景: SportMonks はライブ中に誤投入したイベント（壊れたVAR等）を後でAPIから消すが、
//   eventStatement は upsert のみで削除しないため D1 にゴミが残る（例: "vip_for_unknown.true"）。
// 保護: ゴール系(goal/own_goal/penalty/pen_shootout_goal)は残す。VAR取消ゴールはAPIから
//   消えるが、読み出し層 reconcileVarDisallowedGoals が「取消ゴール」として再現するため。
// 注意: SQLite では NULL NOT IN (...) は NULL(=偽)になり消えないので type IS NULL を明示。
const GOAL_FAMILY_TYPES = ["goal", "own_goal", "penalty", "pen_shootout_goal"];
function eventCleanupStatement(fixtureId, keepIds, updatedAt) {
	const ph = keepIds.map(() => "?").join(",");
	const goalPh = GOAL_FAMILY_TYPES.map(() => "?").join(",");
	return {
		sql: `DELETE FROM sm_events
          WHERE sm_fixture_id = ?
            AND (type IS NULL OR type NOT IN (${goalPh}))
            AND sm_event_id NOT IN (${ph})`,
		args: [fixtureId, ...GOAL_FAMILY_TYPES, ...keepIds],
	};
}

// fixture 詳細1件 → teams/fixture/events/stats/lineups/player_stats の upsert 文配列（純粋）
export function fixtureDetailStatements(detail, updatedAt) {
	const eventRows = toEventRows(detail);
	const fixtureId = detail?.id ?? null;
	const stmts = [
		...toTeamRows(detail).map((r) => teamStatement(r, updatedAt)),
		fixtureStatement(toFixtureRow(detail), updatedAt),
	];
	// 孤児掃除は API にイベントがある時だけ（瞬間的な空応答で全削除しないため）。
	if (eventRows.length > 0 && fixtureId != null) {
		stmts.push(
			eventCleanupStatement(
				fixtureId,
				eventRows.map((r) => r.sm_event_id),
				updatedAt,
			),
		);
	}
	stmts.push(
		...eventRows.map((r) => eventStatement(r, updatedAt)),
		...toStatRows(detail).map((r) => statStatement(r, updatedAt)),
		...toLineupRows(detail).map((r) => lineupStatement(r, updatedAt)),
		...toPlayerStatRows(detail).map((r) => playerStatStatement(r, updatedAt)),
	);
	return stmts;
}

// core/types data[] → sm_types の upsert 文配列（純粋）
export function typeStatements(types, updatedAt) {
	return toTypeRows(types).map((r) => typeStatement(r, updatedAt));
}

// season の fixtures[]（include=fixtures.participants）→ teams(重複排除)＋fixtures の文。
// 開幕前スケジュール backfill 用。scores/events/stats は無いので fixture 行は NS スコア=null。
export function seasonFixturesStatements(fixtures, updatedAt) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const teamMap = new Map(); // sm_team_id 単位で一意化（48チーム×重複を排除）
	const fixtureStmts = [];
	for (const fx of list) {
		if (fx?.id == null) continue;
		for (const t of toTeamRows(fx)) teamMap.set(t.sm_team_id, t);
		fixtureStmts.push(fixtureStatement(toFixtureRow(fx), updatedAt));
	}
	const teamStmts = [...teamMap.values()].map((r) =>
		teamStatement(r, updatedAt),
	);
	return [...teamStmts, ...fixtureStmts];
}

// 唯一 D1 に触れる薄い実行層。specs を prepare/bind して batch 実行する。
export async function runBatch(db, specs) {
	if (!Array.isArray(specs) || specs.length === 0) return [];
	const stmts = specs.map((s) => db.prepare(s.sql).bind(...s.args));
	return db.batch(stmts);
}
