import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "./fixture.js";

// fake-db: dispatches by table name in SQL, same pattern as sm-read.test.js
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

// ────────────────────────────────────────────────────────────────
// 1. WATCH_ENABLED !== 'true' → 200, enabled:false, detail:null
// ────────────────────────────────────────────────────────────────
test("WATCH_ENABLED=false → 200 enabled:false, detail:null", async () => {
	const env = { WATCH_ENABLED: "false" };
	const request = new Request("https://x/api/fixture?id=1");
	const res = await onRequestGet({ env, request });
	assert.equal(res.status, 200);
	const body = await res.json();
	assert.equal(body.enabled, false);
	assert.equal(body.detail, null);
});

test("WATCH_ENABLED unset → 200 enabled:false", async () => {
	const env = {};
	const request = new Request("https://x/api/fixture?id=1");
	const res = await onRequestGet({ env, request });
	assert.equal(res.status, 200);
	const body = await res.json();
	assert.equal(body.enabled, false);
});

// ────────────────────────────────────────────────────────────────
// 2. invalid / missing id → 400, error: 'invalid id'
// ────────────────────────────────────────────────────────────────
test("id missing → 400 invalid id", async () => {
	const env = { WATCH_ENABLED: "true", DB: makeFakeDb() };
	const request = new Request("https://x/api/fixture");
	const res = await onRequestGet({ env, request });
	assert.equal(res.status, 400);
	const body = await res.json();
	assert.equal(body.error, "invalid id");
	assert.equal(body.enabled, true);
});

test("id=abc (non-numeric) → 400 invalid id", async () => {
	const env = { WATCH_ENABLED: "true", DB: makeFakeDb() };
	const request = new Request("https://x/api/fixture?id=abc");
	const res = await onRequestGet({ env, request });
	assert.equal(res.status, 400);
	const body = await res.json();
	assert.equal(body.error, "invalid id");
});

test("id=0 → 400 invalid id", async () => {
	const env = { WATCH_ENABLED: "true", DB: makeFakeDb() };
	const request = new Request("https://x/api/fixture?id=0");
	const res = await onRequestGet({ env, request });
	assert.equal(res.status, 400);
	const body = await res.json();
	assert.equal(body.error, "invalid id");
});

// ────────────────────────────────────────────────────────────────
// 3. no DB → 200, note:'no-db', detail:null
// ────────────────────────────────────────────────────────────────
test("WATCH_ENABLED=true, no DB → 200 note:no-db", async () => {
	const env = { WATCH_ENABLED: "true" }; // DB intentionally absent
	const request = new Request("https://x/api/fixture?id=1");
	const res = await onRequestGet({ env, request });
	assert.equal(res.status, 200);
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.equal(body.note, "no-db");
	assert.equal(body.detail, null);
});

// ────────────────────────────────────────────────────────────────
// 4. happy path: real getFixtureDetail via fake DB
// ────────────────────────────────────────────────────────────────
test("happy path: returns fixture detail", async () => {
	const db = makeFakeDb({
		fixture: [
			{
				sm_fixture_id: 1,
				home_team_id: 10,
				away_team_id: 20,
				home_score: 1,
				away_score: 0,
				home_xg: null,
				away_xg: null,
				state_id: 5,
				home_name: "A",
				away_name: "B",
				home_short: null,
				home_img: null,
				home_app: null,
				away_short: null,
				away_img: null,
				away_app: null,
				starting_at: "2026-06-11T19:00:00",
				starting_at_ts: 1749668400,
				round_name: "Group A",
				result_info: null,
			},
		],
		events: [],
		stats: [],
		lineups: [],
		playerStats: [],
	});
	const env = { WATCH_ENABLED: "true", DB: db };
	const request = new Request("https://x/api/fixture?id=1");
	const res = await onRequestGet({ env, request });
	assert.equal(res.status, 200);
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.ok(body.detail, "detail should be present");
	assert.equal(body.detail.fixture.id, 1);
	assert.equal(body.detail.fixture.home.name, "A");
	assert.equal(body.detail.fixture.away.name, "B");
	assert.ok(Array.isArray(body.detail.events));
	assert.ok(Array.isArray(body.detail.stats));
	assert.ok(Array.isArray(body.detail.lineups));
	assert.ok(Array.isArray(body.detail.player_stats));
});

// ────────────────────────────────────────────────────────────────
// 5. error path: DB.prepare throws → 200, note:'unavailable', detail:null
// ────────────────────────────────────────────────────────────────
test("DB.prepare throws → 200 fault-isolated note:unavailable", async () => {
	const db = {
		prepare: () => {
			throw new Error("D1 exploded");
		},
	};
	const env = { WATCH_ENABLED: "true", DB: db };
	const request = new Request("https://x/api/fixture?id=1");
	const res = await onRequestGet({ env, request });
	assert.equal(res.status, 200);
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.equal(body.note, "unavailable");
	assert.equal(body.detail, null);
});
