import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "./results.js";

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
