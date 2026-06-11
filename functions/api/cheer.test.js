import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet, onRequestPost } from "./cheer.js";

// 最小フェイク D1。本APIが発行する3種のSQLだけ解釈する:
//  - SELECT state_id FROM sm_fixtures ... .first()
//  - INSERT INTO cheer_counts ... ON CONFLICT ... .run()
//  - SELECT ... FROM cheer_counts WHERE fixture_id (IN | =) ... .all()
function fakeDB({ fixtures = {}, cheers = [] } = {}) {
	const cheerMap = new Map(
		cheers.map((c) => [c.fixture_id + ":" + c.side, { ...c }]),
	);
	const make = (sql) => ({
		sql,
		args: [],
		bind(...a) {
			this.args = a;
			return this;
		},
		async first() {
			if (/FROM sm_fixtures/i.test(this.sql)) {
				const id = this.args[0];
				return id in fixtures ? { state_id: fixtures[id] } : null;
			}
			return null;
		},
		async all() {
			if (/FROM cheer_counts/i.test(this.sql)) {
				const ids = this.args.map(Number);
				const results = [...cheerMap.values()].filter((c) =>
					ids.includes(c.fixture_id),
				);
				return { results };
			}
			return { results: [] };
		},
		async run() {
			if (/INSERT INTO cheer_counts/i.test(this.sql)) {
				const [fid, side, delta] = this.args;
				const key = fid + ":" + side;
				const cur = cheerMap.get(key);
				if (cur) cur.count += delta;
				else cheerMap.set(key, { fixture_id: fid, side, count: delta });
				return { success: true, meta: { changes: 1 } };
			}
			return { success: true, meta: { changes: 0 } };
		},
	});
	return { prepare: (sql) => make(sql), _cheerMap: cheerMap };
}

const getReq = (qs) => ({ url: "https://x/api/cheer" + (qs ? "?" + qs : "") });
const postReq = (body) => ({ json: async () => body });

test("GET: CHEER_ENABLED 未設定なら enabled:false", async () => {
	const res = await onRequestGet({ env: {}, request: getReq("fixtures=1") });
	assert.equal((await res.json()).enabled, false);
});

test("POST: CHEER_ENABLED 未設定なら enabled:false", async () => {
	const res = await onRequestPost({
		env: {},
		request: postReq({ fixtureId: 1, side: "home" }),
	});
	assert.equal((await res.json()).enabled, false);
});

test("GET: 指定 fixtures の counts を集約", async () => {
	const env = {
		CHEER_ENABLED: "true",
		DB: fakeDB({
			cheers: [
				{ fixture_id: 1, side: "home", count: 10 },
				{ fixture_id: 1, side: "away", count: 4 },
				{ fixture_id: 2, side: "home", count: 6 },
			],
		}),
	};
	const res = await onRequestGet({ env, request: getReq("fixtures=1,2") });
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.deepEqual(body.counts, {
		1: { home: 10, away: 4 },
		2: { home: 6, away: 0 },
	});
});

test("GET: prepare が投げても 200・空（障害隔離）", async () => {
	const env = {
		CHEER_ENABLED: "true",
		DB: {
			prepare() {
				throw new Error("no table");
			},
		},
	};
	const res = await onRequestGet({ env, request: getReq("fixtures=1") });
	assert.equal(res.status, 200);
	assert.deepEqual((await res.json()).counts, {});
});

test("POST: 未開始試合に加算し、増加後の値を返す", async () => {
	const env = { CHEER_ENABLED: "true", DB: fakeDB({ fixtures: { 100: 1 } }) }; // NS
	const res = await onRequestPost({
		env,
		request: postReq({ fixtureId: 100, side: "home", delta: 3 }),
	});
	const body = await res.json();
	assert.equal(body.started, false);
	assert.equal(body.counts.home, 3);
	assert.equal(body.counts.away, 0);
});

test("POST: delta は上限クランプ（99→20）", async () => {
	const env = { CHEER_ENABLED: "true", DB: fakeDB({ fixtures: { 100: 1 } }) };
	const res = await onRequestPost({
		env,
		request: postReq({ fixtureId: 100, side: "away", delta: 99 }),
	});
	assert.equal((await res.json()).counts.away, 20);
});

test("POST: side 不正は400、fixtureId 非整数は400", async () => {
	const env = { CHEER_ENABLED: "true", DB: fakeDB() };
	const r1 = await onRequestPost({
		env,
		request: postReq({ fixtureId: 1, side: "x" }),
	});
	assert.equal(r1.status, 400);
	const r2 = await onRequestPost({
		env,
		request: postReq({ fixtureId: "abc", side: "home" }),
	});
	assert.equal(r2.status, 400);
});

test("POST: 開始済み(LIVE)は加算せず現値を返す", async () => {
	const env = {
		CHEER_ENABLED: "true",
		DB: fakeDB({
			fixtures: { 100: 2 },
			cheers: [{ fixture_id: 100, side: "home", count: 5 }],
		}), // LIVE
	};
	const res = await onRequestPost({
		env,
		request: postReq({ fixtureId: 100, side: "home", delta: 3 }),
	});
	const body = await res.json();
	assert.equal(body.started, true);
	assert.equal(body.counts.home, 5); // 加算されない
});
