import assert from "node:assert/strict";
import { test } from "node:test";
import {
	getFixtureDetail,
	listFixtures,
	listTopscorers,
	mapFixtureRow,
	reconcileVarDisallowedGoals,
	resolveHighlight,
	statusFromState,
} from "./sm-read.js";

// fake-db for getFixtureDetail tests
// dispatches .bind(id).all() by matching table name in the SQL string
function makeFakeDb({
	fixture = [],
	events = [],
	stats = [],
	lineups = [],
	playerStats = [],
	matchAi = [],
	highlights = [],
} = {}) {
	return {
		prepare: (sql) => ({
			bind: (_id) => ({
				all: async () => {
					let results;
					if (sql.includes("sm_highlights")) {
						results = highlights;
					} else if (sql.includes("sm_match_ai")) {
						results = matchAi;
					} else if (sql.includes("sm_player_stats")) {
						results = playerStats;
					} else if (sql.includes("sm_events")) {
						results = events;
					} else if (sql.includes("sm_lineups")) {
						results = lineups;
					} else if (sql.includes("sm_stats")) {
						results = stats;
					} else {
						results = fixture;
					}
					return { results };
				},
			}),
		}),
	};
}

test("statusFromState: state_id を表示ステータスへ", () => {
	assert.equal(statusFromState(1), "NS");
	assert.equal(statusFromState(3), "LIVE");
	assert.equal(statusFromState(2), "LIVE");
	assert.equal(statusFromState(5), "FT");
	assert.equal(statusFromState(7), "FT");
	assert.equal(statusFromState(999), "NS");
});

test("mapFixtureRow: フラット行を home/away ネストへ", () => {
	const row = {
		sm_fixture_id: 7,
		starting_at: "2026-06-11 19:00:00",
		starting_at_ts: 100,
		state_id: 5,
		round_name: "Group A",
		result_info: "A won",
		home_team_id: 10,
		home_name: "A",
		home_short: "AAA",
		home_img: "a.png",
		home_app: "MEX",
		home_score: 2,
		home_xg: 1.5,
		away_team_id: 20,
		away_name: "B",
		away_short: "BBB",
		away_img: "b.png",
		away_app: "RSA",
		away_score: 1,
		away_xg: 0.8,
	};
	const out = mapFixtureRow(row);
	assert.equal(out.id, 7);
	assert.equal(out.status, "FT");
	assert.equal(out.home.name, "A");
	assert.equal(out.home.app_code, "MEX");
	assert.equal(out.home.score, 2);
	assert.equal(out.home.xg, 1.5);
	assert.equal(out.away.app_code, "RSA");
	assert.equal(out.away.short_code, "BBB");
	assert.equal(out.result_info, "A won");
});

test("listFixtures: db からクエリして map した配列を返す", async () => {
	const rows = [
		{
			sm_fixture_id: 1,
			starting_at_ts: 1,
			state_id: 1,
			home_team_id: 10,
			away_team_id: 20,
		},
		{
			sm_fixture_id: 2,
			starting_at_ts: 2,
			state_id: 3,
			home_team_id: 30,
			away_team_id: 40,
		},
	];
	let boundLimit = null;
	const db = {
		prepare: (sql) => ({
			bind: (...a) => {
				boundLimit = a;
				return { all: async () => ({ results: rows }) };
			},
		}),
	};
	const out = await listFixtures(db, { limit: 50 });
	assert.equal(out.length, 2);
	assert.equal(out[1].status, "LIVE");
	assert.deepEqual(boundLimit, [50]);
});

test("listFixtures: results 欠落でも空配列（例外なし）", async () => {
	const db = { prepare: () => ({ bind: () => ({ all: async () => ({}) }) }) };
	const out = await listFixtures(db, {});
	assert.deepEqual(out, []);
});

test("getFixtureDetail: fixture/events/stats/lineups を束ねて返す", async () => {
	const db = makeFakeDb({
		fixture: [
			{
				sm_fixture_id: 1,
				home_team_id: 10,
				away_team_id: 20,
				home_score: 2,
				away_score: 1,
				home_xg: 1.8,
				away_xg: 1.2,
				state_id: 5,
				home_name: "A",
				away_name: "B",
			},
		],
		events: [
			{
				sm_event_id: 9,
				sm_fixture_id: 1,
				minute: 12,
				type: "goal",
				team_id: 10,
				player_name: "X",
			},
		],
		stats: [{ sm_fixture_id: 1, team_id: 10, type_id: 45, value: 58 }],
		lineups: [
			{
				sm_fixture_id: 1,
				team_id: 10,
				player_id: 100,
				player_name: "X",
				jersey_number: 7,
				formation_field: "2:3",
				is_start: 1,
				xg: 0.6,
			},
		],
		playerStats: [{ sm_fixture_id: 1, player_id: 100, type_id: 42, value: 3 }],
	});
	const out = await getFixtureDetail(db, 1);
	assert.equal(out.fixture.id, 1);
	assert.equal(out.events.length, 1);
	assert.equal(out.lineups[0].xg, 0.6);
	assert.equal(out.player_stats[0].value, 3);
});

test("getFixtureDetail: 不在 id は null（障害隔離）", async () => {
	const db = makeFakeDb({ fixture: [] });
	assert.equal(await getFixtureDetail(db, 999), null);
});

test("getFixtureDetail: ai は summary のある行のみ同梱", async () => {
	const db = makeFakeDb({
		fixture: [{ sm_fixture_id: 1, state_id: 5 }],
		matchAi: [
			{
				phase: "lineup",
				summary: "布陣分析",
				model: "gemini-2.5-pro",
				updated_at: 100,
			},
			{
				phase: "ft",
				summary: "総括",
				model: "gemini-2.5-pro",
				updated_at: 200,
			},
		],
	});
	const d = await getFixtureDetail(db, 1);
	assert.equal(d.ai.length, 2);
	assert.deepEqual(
		d.ai.map((a) => a.phase),
		["lineup", "ft"],
	);
	assert.equal(d.ai[0].summary, "布陣分析");
	assert.equal(d.ai[0].generated_at, 100);
});

test("getFixtureDetail: ai が無ければ空配列", async () => {
	const db = makeFakeDb({ fixture: [{ sm_fixture_id: 1 }] });
	const d = await getFixtureDetail(db, 1);
	assert.deepEqual(d.ai, []);
});

test("listTopscorers は sm_topscorers を順位順で返す", async () => {
	const db = {
		prepare: () => ({
			bind: () => ({
				all: async () => ({
					results: [
						{ player_name: "A", app_code: "ARG", goals: 6, position: 1 },
					],
				}),
			}),
		}),
	};
	const rows = await listTopscorers(db, 26618);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].app_code, "ARG");
});

test("listTopscorers: results 欠落でも空配列（例外なし）", async () => {
	const db = { prepare: () => ({ bind: () => ({ all: async () => ({}) }) }) };
	const rows = await listTopscorers(db, 26618);
	assert.deepEqual(rows, []);
});

test("reconcileVarDisallowedGoals: 同一選手の直近ゴールを取消へ統合しVAR行を畳む", () => {
	// 韓国vsチェコ実データ: 77' Souček goal(D1残存) + 78' var_goal_disallowed
	const events = [
		{
			sm_event_id: 1,
			minute: 59,
			type: "goal",
			player_id: 10,
			player_name: "Krejci",
		},
		{
			sm_event_id: 2,
			minute: 77,
			type: "goal",
			player_id: 20,
			player_name: "Souček",
		},
		{
			sm_event_id: 3,
			minute: 78,
			type: "var_goal_disallowed",
			player_id: 20,
			player_name: "Souček",
		},
	];
	const out = reconcileVarDisallowedGoals(events);
	// VAR行(3)は畳まれ、対象ゴール(2)は goal_disallowed に上書き・77'のまま
	assert.equal(out.length, 2);
	assert.equal(
		out.find((e) => e.sm_event_id === 3),
		undefined,
	);
	const g = out.find((e) => e.sm_event_id === 2);
	assert.equal(g.type, "goal_disallowed");
	assert.equal(g.minute, 77);
	// 無関係なゴール(1)は不変
	assert.equal(out.find((e) => e.sm_event_id === 1).type, "goal");
});

test("reconcileVarDisallowedGoals: 対応ゴールが無ければVAR行を残す（grace）", () => {
	const events = [
		{ sm_event_id: 9, minute: 78, type: "var_goal_disallowed", player_id: 20 },
	];
	const out = reconcileVarDisallowedGoals(events);
	assert.equal(out.length, 1);
	assert.equal(out[0].type, "var_goal_disallowed");
});

test("reconcileVarDisallowedGoals: VARが無ければそのまま返す", () => {
	const events = [{ sm_event_id: 1, minute: 10, type: "goal", player_id: 1 }];
	assert.equal(reconcileVarDisallowedGoals(events), events);
	assert.deepEqual(reconcileVarDisallowedGoals(null), []);
});

test("resolveHighlight: manual を最優先で選ぶ", () => {
	const rows = [
		{ source: "fifa", video_id: "fifaVIDEO11", title: "FIFA" },
		{ source: "manual", video_id: "manualVID11", title: "Manual" },
		{ source: "dazn", video_id: "daznVIDEO11", title: "DAZN" },
	];
	assert.deepEqual(resolveHighlight(rows), {
		video_id: "manualVID11",
		source: "manual",
		title: "Manual",
	});
});

test("resolveHighlight: manual 無しなら dazn > fifa", () => {
	const rows = [
		{ source: "fifa", video_id: "fifaVIDEO11", title: "FIFA" },
		{ source: "dazn", video_id: "daznVIDEO11", title: "DAZN" },
	];
	assert.equal(resolveHighlight(rows).source, "dazn");
});

test("resolveHighlight: video_id が無い行は無視", () => {
	const rows = [
		{ source: "manual", video_id: null, title: "空manual" },
		{ source: "fifa", video_id: "fifaVIDEO11", title: "FIFA" },
	];
	assert.equal(resolveHighlight(rows).source, "fifa");
});

test("resolveHighlight: 空・null は null", () => {
	assert.equal(resolveHighlight([]), null);
	assert.equal(resolveHighlight(null), null);
	assert.equal(resolveHighlight([{ source: "manual", video_id: null }]), null);
});

test("getFixtureDetail: highlight を解決して返す", async () => {
	const db = makeFakeDb({
		fixture: [{ sm_fixture_id: 9, state_id: 5 }],
		highlights: [
			{ source: "manual", video_id: "manualVID11", title: "M" },
			{ source: "dazn", video_id: "daznVIDEO11", title: "D" },
		],
	});
	const out = await getFixtureDetail(db, 9);
	assert.equal(out.highlight.video_id, "manualVID11");
	assert.equal(out.highlight.source, "manual");
});

test("getFixtureDetail: highlight 無しは null", async () => {
	const db = makeFakeDb({ fixture: [{ sm_fixture_id: 9, state_id: 5 }] });
	const out = await getFixtureDetail(db, 9);
	assert.equal(out.highlight, null);
});
