import assert from "node:assert/strict";
import { test } from "node:test";
import {
	FIXTURE_DETAIL_INCLUDE,
	isFinished,
	isInPlay,
	selectFixturesForDetailSync,
	syncFixtureDetail,
	syncLive,
	syncSeasonFixtures,
	syncTypes,
} from "./sm-sync.js";

// D1 風のフェイク（prepare/bind/batch を記録）
function fakeDb() {
	const batched = [];
	return {
		batched,
		prepare(sql) {
			return { bind: (...a) => ({ sql, a }) };
		},
		batch: async (stmts) => {
			batched.push(stmts.length);
			return stmts.map(() => ({ success: true }));
		},
	};
}

test("isInPlay / isFinished: state_id 判定", () => {
	for (const s of [2, 3, 6, 9]) assert.equal(isInPlay(s), true);
	for (const s of [1, 5, 7, 8]) assert.equal(isInPlay(s), false);
	for (const s of [5, 7, 8]) assert.equal(isFinished(s), true);
	assert.equal(isFinished(2), false);
});

test("syncTypes: pagination を has_more=false まで辿って upsert", async () => {
	const pages = {
		1: {
			data: [{ id: 1, name: "A", code: "a" }],
			pagination: { has_more: true },
		},
		2: {
			data: [{ id: 2, name: "B", code: "b" }],
			pagination: { has_more: false },
		},
	};
	let calls = 0;
	const client = {
		get: async (path, opts) => {
			calls++;
			return pages[opts.params.page];
		},
	};
	const db = fakeDb();
	const n = await syncTypes(client, db, 1000);
	assert.equal(calls, 2);
	assert.equal(n, 2); // 2 types upserted
	assert.deepEqual(db.batched, [1, 1]); // 1件/ページずつ
});

test("syncTypes: maxPages で暴走を止める", async () => {
	const client = {
		get: async () => ({ data: [{ id: 1 }], pagination: { has_more: true } }),
	};
	const n = await syncTypes(client, fakeDb(), 1000, { maxPages: 3 });
	assert.equal(n, 3);
});

test("syncSeasonFixtures: data.fixtures を backfill(チャンク分割)", async () => {
	const mk = (id, h, a) => ({
		id,
		league_id: 732,
		season_id: 26618,
		starting_at: "x",
		starting_at_timestamp: id,
		state_id: 1,
		participants: [
			{ id: h, name: "H" + h, meta: { location: "home" } },
			{ id: a, name: "A" + a, meta: { location: "away" } },
		],
	});
	// 60試合 → teams(重複排除) + 60 fixtures が 50件/batch で分割される
	const fixtures = Array.from({ length: 60 }, (_, i) =>
		mk(i + 1, 100, 200 + i),
	);
	const body = { data: { fixtures } };
	let captured = null;
	const client = {
		get: async (path, opts) => {
			captured = { path, opts };
			return body;
		},
	};
	const db = fakeDb();
	const res = await syncSeasonFixtures(client, db, 26618, 1000);
	assert.match(captured.path, /seasons\/26618/);
	assert.match(captured.opts.include, /fixtures\.participants/);
	assert.equal(res.count, 60);
	// teams: 100 と 200..259 の 61チーム + 60 fixtures = 121 文 → 50で割って3バッチ
	assert.ok(db.batched.length >= 3);
	assert.equal(
		db.batched.reduce((a, b) => a + b, 0),
		res.statements,
	);
});

test("syncSeasonFixtures: 空 fixtures は no-op", async () => {
	const client = { get: async () => ({ data: { fixtures: [] } }) };
	const res = await syncSeasonFixtures(client, fakeDb(), 1, 1000);
	assert.equal(res.count, 0);
});

test("syncFixtureDetail: detail 取得→specs→batch", async () => {
	const detail = {
		data: {
			id: 7,
			league_id: 732,
			season_id: 26618,
			starting_at: "2026-06-11 19:00:00",
			starting_at_timestamp: 1,
			state_id: 5,
			participants: [
				{ id: 10, name: "A", meta: { location: "home" } },
				{ id: 20, name: "B", meta: { location: "away" } },
			],
			scores: [
				{
					participant_id: 10,
					score: { goals: 2, participant: "home" },
					description: "CURRENT",
				},
				{
					participant_id: 20,
					score: { goals: 1, participant: "away" },
					description: "CURRENT",
				},
			],
			events: [],
			statistics: [],
		},
	};
	let captured = null;
	const client = {
		get: async (path, opts) => {
			captured = { path, opts };
			return detail;
		},
	};
	const db = fakeDb();
	const res = await syncFixtureDetail(client, db, 7, 1000);
	assert.match(captured.path, /fixtures\/7/);
	assert.match(captured.opts.include, /participants/);
	assert.equal(res.ok, true);
	assert.equal(db.batched.length, 1); // 1バッチ
});

test("syncFixtureDetail: data が無ければ no-op（例外なし）", async () => {
	const client = { get: async () => ({}) };
	const db = fakeDb();
	const res = await syncFixtureDetail(client, db, 9, 1000);
	assert.equal(res.ok, false);
	assert.equal(db.batched.length, 0);
});

test("syncLive: livescores から各 fixture を upsert", async () => {
	const live = {
		data: [
			{
				id: 1,
				state_id: 3,
				participants: [
					{ id: 10, meta: { location: "home" } },
					{ id: 20, meta: { location: "away" } },
				],
				scores: [],
				events: [],
				statistics: [],
			},
			{
				id: 2,
				state_id: 3,
				participants: [
					{ id: 30, meta: { location: "home" } },
					{ id: 40, meta: { location: "away" } },
				],
				scores: [],
				events: [],
				statistics: [],
			},
		],
	};
	const client = { get: async () => live };
	const db = fakeDb();
	const res = await syncLive(client, db, 1000);
	assert.equal(res.count, 2);
	assert.equal(db.batched.length, 1); // 全fixtureを1バッチに集約
});

test("syncLive: 空でも例外なし", async () => {
	const client = { get: async () => ({ data: [] }) };
	const res = await syncLive(client, fakeDb(), 1000);
	assert.equal(res.count, 0);
});

test("syncFixtureDetail: include に lineups と xGFixture が含まれる", async () => {
	const detail = {
		data: {
			id: 42,
			league_id: 732,
			season_id: 26618,
			starting_at: "2026-06-11 19:00:00",
			starting_at_timestamp: 1,
			state_id: 3,
			participants: [
				{ id: 10, name: "A", meta: { location: "home" } },
				{ id: 20, name: "B", meta: { location: "away" } },
			],
			scores: [],
			events: [],
			statistics: [],
		},
	};
	let captured = null;
	const client = {
		get: async (path, opts) => {
			captured = { path, opts };
			return detail;
		},
	};
	await syncFixtureDetail(client, fakeDb(), 42, 1000);
	assert.ok(
		captured.opts.include.includes("lineups"),
		"include should contain lineups",
	);
	assert.ok(
		captured.opts.include.includes("xGFixture"),
		"include should contain xGFixture",
	);
});

test("selectFixturesForDetailSync: ライブと直近終了を選ぶ", () => {
	const rows = [
		{ sm_fixture_id: 1, state_id: 3 },
		{ sm_fixture_id: 2, state_id: 1 },
		{ sm_fixture_id: 3, state_id: 5 },
	];
	const ids = selectFixturesForDetailSync(rows).map((r) => r.sm_fixture_id);
	assert.deepEqual(ids.sort(), [1, 3]);
});

test("selectFixturesForDetailSync: 非配列は空", () => {
	assert.deepEqual(selectFixturesForDetailSync(null), []);
});

test("FIXTURE_DETAIL_INCLUDE requests player profile for lineups", () => {
	assert.ok(FIXTURE_DETAIL_INCLUDE.includes("lineups.player"));
	assert.ok(FIXTURE_DETAIL_INCLUDE.includes("lineups.player.nationality"));
});
