import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestDelete, onRequestPost } from "./highlight.js";

// 有効セッショントークン 'good' を持つ fake KV（verifySession は session:<token> を get する）。
const fakeConfigKv = {
	get: async (key) =>
		key === "session:good" ? JSON.stringify({ iat: 1 }) : null,
};

// fake D1: fixtures に存在する id と、run() 呼び出しを記録する。
function makeDb({ fixtureExists = true } = {}) {
	const calls = { run: [] };
	return {
		calls,
		prepare(sql) {
			return {
				bind(...args) {
					return {
						all: async () => ({
							results:
								sql.includes("SELECT") && fixtureExists
									? [{ sm_fixture_id: args[0] }]
									: [],
						}),
						run: async () => {
							calls.run.push({ sql, args });
							return { success: true };
						},
					};
				},
			};
		},
	};
}

function makeRequest(body, { token = "good", method = "POST" } = {}) {
	return new Request("https://x/api/highlight", {
		method,
		headers: {
			"content-type": "application/json",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body),
	});
}

const baseEnv = (db) => ({
	WATCH_ENABLED: "true",
	DB: db,
	CONFIG: fakeConfigKv,
});

test("POST: WATCH_ENABLED でなければ 404", async () => {
	const res = await onRequestPost({
		env: { WATCH_ENABLED: "false" },
		request: makeRequest({ fixtureId: 1, url: "x" }),
	});
	assert.equal(res.status, 404);
});

test("POST: 認証トークン無しは 401", async () => {
	const db = makeDb();
	const res = await onRequestPost({
		env: baseEnv(db),
		request: makeRequest(
			{ fixtureId: 1, url: "https://youtu.be/dQw4w9WgXcQ" },
			{ token: null },
		),
	});
	assert.equal(res.status, 401);
});

test("POST: 不正トークンは 401", async () => {
	const db = makeDb();
	const res = await onRequestPost({
		env: baseEnv(db),
		request: makeRequest(
			{ fixtureId: 1, url: "https://youtu.be/dQw4w9WgXcQ" },
			{ token: "bad" },
		),
	});
	assert.equal(res.status, 401);
});

test("POST: fixtureId 不正は 400", async () => {
	const db = makeDb();
	const res = await onRequestPost({
		env: baseEnv(db),
		request: makeRequest({ fixtureId: 0, url: "https://youtu.be/dQw4w9WgXcQ" }),
	});
	assert.equal(res.status, 400);
});

test("POST: 不正 URL は 400", async () => {
	const db = makeDb();
	const res = await onRequestPost({
		env: baseEnv(db),
		request: makeRequest({ fixtureId: 1, url: "https://example.com/x" }),
	});
	assert.equal(res.status, 400);
});

test("POST: 存在しない fixture は 404", async () => {
	const db = makeDb({ fixtureExists: false });
	const res = await onRequestPost({
		env: baseEnv(db),
		request: makeRequest({
			fixtureId: 999,
			url: "https://youtu.be/dQw4w9WgXcQ",
		}),
	});
	assert.equal(res.status, 404);
});

test("POST: 正常系は manual 行を upsert して 200", async () => {
	const db = makeDb();
	const res = await onRequestPost({
		env: baseEnv(db),
		request: makeRequest({
			fixtureId: 42,
			url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3",
		}),
	});
	assert.equal(res.status, 200);
	const data = await res.json();
	assert.equal(data.ok, true);
	assert.equal(data.videoId, "dQw4w9WgXcQ");
	// upsert の run が呼ばれ、INSERT...manual を含む
	const upsert = db.calls.run.find((c) =>
		c.sql.includes("INSERT INTO sm_highlights"),
	);
	assert.ok(upsert, "upsert が実行された");
	assert.ok(upsert.sql.includes("'manual'"));
});

test("DELETE: 正常系は manual 行を削除して 200", async () => {
	const db = makeDb();
	const res = await onRequestDelete({
		env: baseEnv(db),
		request: makeRequest({ fixtureId: 42 }, { method: "DELETE" }),
	});
	assert.equal(res.status, 200);
	const del = db.calls.run.find((c) =>
		c.sql.includes("DELETE FROM sm_highlights"),
	);
	assert.ok(del, "delete が実行された");
	assert.ok(del.sql.includes("source = 'manual'"));
});

test("DELETE: 認証無しは 401", async () => {
	const db = makeDb();
	const res = await onRequestDelete({
		env: baseEnv(db),
		request: makeRequest({ fixtureId: 42 }, { token: null, method: "DELETE" }),
	});
	assert.equal(res.status, 401);
});
