import assert from "node:assert/strict";
import { test } from "node:test";
import {
	getFixtureDetail,
	listFixtures,
	mapFixtureRow,
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
} = {}) {
	return {
		prepare: (sql) => ({
			bind: (_id) => ({
				all: async () => {
					let results;
					if (sql.includes("sm_player_stats")) {
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
