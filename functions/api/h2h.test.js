import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "./h2h.js";

function fakeDB(rowsByFixture = {}) {
	const make = (sql) => ({
		sql,
		args: [],
		bind(...a) {
			this.args = a;
			return this;
		},
		async all() {
			if (/FROM sm_h2h/i.test(this.sql)) {
				const ids = this.args.map(Number);
				const results = ids
					.filter((id) => id in rowsByFixture)
					.map((id) => ({ fixture_id: id, ...rowsByFixture[id] }));
				return { results };
			}
			return { results: [] };
		},
	});
	return { prepare: (sql) => make(sql) };
}

const getReq = (qs) => ({ url: "https://x/api/h2h" + (qs ? "?" + qs : "") });

test("GET: H2H_ENABLED 未設定なら enabled:false", async () => {
	const res = await onRequestGet({ env: {}, request: getReq("fixtures=7") });
	const body = await res.json();
	assert.equal(body.enabled, false);
});

test("GET: 正常時は fixtureId キーで W-D-L を返す", async () => {
	const env = {
		H2H_ENABLED: "true",
		DB: fakeDB({
			7: {
				home_code: "JPN",
				away_code: "BRA",
				home_wins: 1,
				draws: 2,
				away_wins: 5,
				total: 8,
			},
		}),
	};
	const res = await onRequestGet({ env, request: getReq("fixtures=7,8") });
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.deepEqual(body.h2h["7"], {
		home_code: "JPN",
		away_code: "BRA",
		home_wins: 1,
		draws: 2,
		away_wins: 5,
		total: 8,
	});
	assert.equal(body.h2h["8"], undefined); // 行なしは含めない
});

test("GET: DB 無し/fixtures 空なら enabled:true・空", async () => {
	const res = await onRequestGet({
		env: { H2H_ENABLED: "true" },
		request: getReq(""),
	});
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.deepEqual(body.h2h, {});
});
