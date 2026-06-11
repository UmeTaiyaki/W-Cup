import assert from "node:assert/strict";
import { test } from "node:test";
import {
	fixtureDetailStatements,
	runBatch,
	seasonFixturesStatements,
	topscorersStatements,
	typeStatements,
} from "./sm-store.js";

const detail = {
	id: 1,
	league_id: 732,
	season_id: 18017,
	starting_at: "2022-12-06 15:00:00",
	starting_at_timestamp: 1670338400,
	state_id: 8,
	result_info: "X won",
	participants: [
		{
			id: 10,
			name: "A",
			short_code: "AAA",
			image_path: "a.png",
			meta: { location: "home" },
		},
		{
			id: 20,
			name: "B",
			short_code: "BBB",
			image_path: "b.png",
			meta: { location: "away" },
		},
	],
	scores: [
		{
			type_id: 1525,
			participant_id: 10,
			score: { goals: 1, participant: "home" },
			description: "CURRENT",
		},
		{
			type_id: 1525,
			participant_id: 20,
			score: { goals: 2, participant: "away" },
			description: "CURRENT",
		},
	],
	events: [
		{
			id: 100,
			participant_id: 10,
			type_id: 14,
			player_name: "P",
			minute: 70,
			sort_order: 1,
		},
	],
	statistics: [
		{
			id: 1,
			type_id: 45,
			participant_id: 10,
			data: { value: 60 },
			location: "home",
		},
	],
	lineups: [
		{
			id: 1,
			team_id: 10,
			player_id: 501,
			player_name: "Player A",
			jersey_number: 1,
			formation_field: "1:1",
			type_id: 11,
			position_id: 24,
			xglineup: { value: 0.0 },
		},
		{
			id: 2,
			team_id: 10,
			player_id: 502,
			player_name: "Player B",
			jersey_number: 2,
			formation_field: "2:4",
			type_id: 11,
			position_id: 25,
			xglineup: { value: 0.12 },
			details: [{ type_id: 42, data: { value: 3 } }],
		},
		{
			id: 3,
			team_id: 20,
			player_id: 601,
			player_name: "Player C",
			jersey_number: 7,
			formation_field: null,
			type_id: 12,
			position_id: 27,
			xglineup: null,
		},
	],
};

test("fixtureDetailStatements: teams/fixture/event/stat の文を生成", () => {
	const specs = fixtureDetailStatements(detail, 1000);
	// 2 teams + 1 fixture + 1 event + 1 stat + 3 lineups + 1 player_stat = 9
	assert.equal(specs.length, 9);
	for (const s of specs) {
		assert.ok(typeof s.sql === "string" && s.sql.length > 0);
		assert.ok(Array.isArray(s.args));
	}
});

test("全 upsert に ON CONFLICT(冪等)が含まれる", () => {
	const specs = fixtureDetailStatements(detail, 1000);
	for (const s of specs) assert.match(s.sql, /ON CONFLICT/i);
});

test("fixture 文に正しい列と updated_at が乗る", () => {
	const specs = fixtureDetailStatements(detail, 1234);
	const fx = specs.find((s) => /INTO sm_fixtures/.test(s.sql));
	assert.ok(fx);
	// home/away score と updated_at(=1234) が args に含まれる
	assert.ok(fx.args.includes(1)); // home_score
	assert.ok(fx.args.includes(2)); // away_score
	assert.ok(fx.args.includes(1234)); // updated_at
});

test("team 文の args はプレースホルダ数と一致", () => {
	const specs = fixtureDetailStatements(detail, 1000);
	const team = specs.find((s) => /INTO sm_teams/.test(s.sql));
	const placeholders = (team.sql.match(/\?/g) || []).length;
	assert.equal(team.args.length, placeholders);
});

test("typeStatements: types マスタの upsert 文", () => {
	const specs = typeStatements([{ id: 14, name: "Goal", code: "goal" }], 1000);
	assert.equal(specs.length, 1);
	assert.match(specs[0].sql, /INTO sm_types/);
	assert.match(specs[0].sql, /ON CONFLICT/i);
	assert.ok(specs[0].args.includes(14));
});

test("seasonFixturesStatements: チーム重複排除＋全fixture", () => {
	// 2試合で 3チーム(10,20,30)。10 が両方に出る → teams は3件に一意化。
	const fixtures = [
		{
			id: 1,
			league_id: 732,
			season_id: 26618,
			starting_at: "x",
			starting_at_timestamp: 1,
			state_id: 1,
			participants: [
				{
					id: 10,
					name: "A",
					short_code: "AAA",
					image_path: "a.png",
					meta: { location: "home" },
				},
				{
					id: 20,
					name: "B",
					short_code: "BBB",
					image_path: "b.png",
					meta: { location: "away" },
				},
			],
		},
		{
			id: 2,
			league_id: 732,
			season_id: 26618,
			starting_at: "y",
			starting_at_timestamp: 2,
			state_id: 1,
			participants: [
				{
					id: 10,
					name: "A",
					short_code: "AAA",
					image_path: "a.png",
					meta: { location: "home" },
				},
				{
					id: 30,
					name: "C",
					short_code: "CCC",
					image_path: "c.png",
					meta: { location: "away" },
				},
			],
		},
	];
	const specs = seasonFixturesStatements(fixtures, 1000);
	const teams = specs.filter((s) => /INTO sm_teams/.test(s.sql));
	const fx = specs.filter((s) => /INTO sm_fixtures/.test(s.sql));
	assert.equal(teams.length, 3); // 10,20,30（10は重複排除）
	assert.equal(fx.length, 2);
	// 開幕前: スコアは null（CURRENT が無い）
	const fxRow = fx[0];
	assert.equal(fxRow.args.includes(1), true); // fixture_id 等
});

test("seasonFixturesStatements: 空/壊れ入力は空配列", () => {
	assert.deepEqual(seasonFixturesStatements(null, 1), []);
	assert.deepEqual(seasonFixturesStatements([{ foo: 1 }], 1), []); // id 無しは除外
});

test("runBatch: db.prepare→bind→batch に specs を流す", async () => {
	const calls = { prepared: [], bound: [], batched: 0 };
	const db = {
		prepare(sql) {
			calls.prepared.push(sql);
			return {
				bind: (...a) => {
					calls.bound.push(a);
					return { sql, a };
				},
			};
		},
		batch: async (stmts) => {
			calls.batched = stmts.length;
			return stmts.map(() => ({ success: true }));
		},
	};
	const specs = [
		{ sql: "INSERT 1", args: [1] },
		{ sql: "INSERT 2", args: [2, 3] },
	];
	const res = await runBatch(db, specs);
	assert.equal(calls.prepared.length, 2);
	assert.deepEqual(calls.bound[1], [2, 3]);
	assert.equal(calls.batched, 2);
	assert.equal(res.length, 2);
});

test("runBatch: 空 specs は何もせず空配列", async () => {
	let touched = false;
	const db = {
		prepare: () => {
			touched = true;
		},
		batch: async () => {
			touched = true;
		},
	};
	const res = await runBatch(db, []);
	assert.deepEqual(res, []);
	assert.equal(touched, false);
});

test("fixtureDetailStatements: lineups/player_stats の upsert を含む", () => {
	const stmts = fixtureDetailStatements(detail, 1700000000);
	const sqls = stmts.map((s) => s.sql).join("\n");
	assert.ok(sqls.includes("INSERT INTO sm_lineups"));
	assert.ok(sqls.includes("INSERT INTO sm_player_stats"));
});

test("lineup statement includes bio columns and args", () => {
	const detail = {
		id: 1,
		lineups: [
			{
				fixture_id: 1,
				team_id: 5,
				player_id: 100,
				type_id: 11,
				player: {
					date_of_birth: "1997-05-20",
					height: 180,
					weight: 75,
					nationality_id: 32,
					nationality: { name: "Japan" },
					teams: [],
				},
			},
		],
	};
	const sts = fixtureDetailStatements(detail, 1781000000);
	const lu = sts.find((s) => s.sql.includes("INTO sm_lineups"));
	assert.ok(lu.sql.includes("date_of_birth"));
	assert.ok(lu.sql.includes("nationality_name"));
	assert.ok(lu.sql.includes("club_name"));
	assert.ok(lu.args.includes("Japan"));
});

test("event statement includes player_id columns and args", () => {
	const detail = {
		id: 1,
		events: [
			{
				id: 9,
				fixture_id: 1,
				type_id: 18,
				participant_id: 5,
				player_id: 100,
				related_player_id: 200,
			},
		],
	};
	const sts = fixtureDetailStatements(detail, 1781000000);
	const ev = sts.find((s) => s.sql.includes("INTO sm_events"));
	assert.ok(ev.sql.includes("player_id"));
	assert.ok(ev.sql.includes("related_player_id"));
	assert.ok(ev.args.includes(100));
	assert.ok(ev.args.includes(200));
});

test("topscorersStatements は player ごとに upsert 文を生成", () => {
	const specs = topscorersStatements(
		[
			{
				season_id: 26618,
				player_id: 11,
				player_name: "A",
				team_id: 99,
				app_code: null,
				goals: 5,
				position: 1,
			},
		],
		1700,
	);
	assert.equal(specs.length, 1);
	assert.match(specs[0].sql, /INSERT INTO sm_topscorers/);
	assert.match(specs[0].sql, /ON CONFLICT\(season_id, player_id\) DO UPDATE/);
	assert.deepEqual(specs[0].args, [26618, 11, "A", 99, null, 5, 1, 1700]);
});
