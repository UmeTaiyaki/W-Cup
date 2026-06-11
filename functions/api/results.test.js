import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "./results.js";

// Workers の caches.default を node 上で無害化（常にミス＝毎回導出経路を検証）。
globalThis.caches = {
	default: { match: async () => undefined, put: async () => {} },
};

// fixtures 用の fake DB。SQL に sm_topscorers を含むクエリは空、
// それ以外（listFixtures）は与えた rows を返す。
const fixturesRows = (rows) => ({
	prepare: (sql) => ({
		bind: () => ({
			all: async () => ({
				results: sql.includes("sm_topscorers") ? [] : rows,
			}),
		}),
	}),
});

test("WATCH_ENABLED 未設定なら enabled:false", async () => {
	const res = await onRequestGet({
		env: {},
		request: new Request("https://x/api/results"),
	});
	const body = await res.json();
	assert.equal(body.enabled, false);
});

test("DB 未バインドなら enabled:true / note:no-db", async () => {
	const res = await onRequestGet({
		env: { WATCH_ENABLED: "true" },
		request: new Request("https://x/api/results"),
	});
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.equal(body.note, "no-db");
	assert.equal(body.result, null);
});

test("有効時は result/groupMatches を返す", async () => {
	const env = {
		WATCH_ENABLED: "true",
		DB: fixturesRows([
			{
				sm_fixture_id: 1,
				state_id: 5,
				round_name: "Final",
				home_team_id: 1,
				home_app: "ARG",
				home_score: 1,
				away_team_id: 2,
				away_app: "FRA",
				away_score: 0,
			},
		]),
	};
	const res = await onRequestGet({
		env,
		request: new Request("https://x/api/results"),
	});
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.equal(body.result.champion, "ARG");
	assert.equal(body.result.runnerUp, "FRA");
	assert.ok(body.groupMatches);
});

test("成功レスポンスはエッジキャッシュ用の cache-control を付ける", async () => {
	const res = await onRequestGet({
		env: { WATCH_ENABLED: "true", DB: fixturesRows([]) },
		request: new Request("https://x/api/results"),
	});
	assert.match(res.headers.get("cache-control") || "", /s-maxage=30/);
});

test("エッジキャッシュ命中時は D1 を読まずキャッシュ応答を返す", async () => {
	const saved = globalThis.caches.default.match;
	let dbCalled = false;
	const env = {
		WATCH_ENABLED: "true",
		DB: {
			prepare: () => ({
				bind: () => ({
					all: async () => {
						dbCalled = true;
						return { results: [] };
					},
				}),
			}),
		},
	};
	globalThis.caches.default.match = async () =>
		new Response(JSON.stringify({ enabled: true, cached: true }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	try {
		const res = await onRequestGet({
			env,
			request: new Request("https://x/api/results"),
		});
		const body = await res.json();
		assert.equal(body.cached, true);
		assert.equal(dbCalled, false); // 命中時は D1 を一切叩かない
	} finally {
		globalThis.caches.default.match = saved;
	}
});
