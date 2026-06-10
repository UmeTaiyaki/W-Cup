import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "./player.js";

function ctx(env, url = "https://x/api/player?id=21773355") {
	return { env, request: new Request(url) };
}
function fakeFetch(data) {
	return async () => new Response(JSON.stringify({ data }), { status: 200 });
}

test("WATCH_ENABLED unset → 200 enabled:false", async () => {
	const res = await onRequestGet(ctx({}));
	assert.equal(res.status, 200);
	assert.equal((await res.json()).enabled, false);
});

test("invalid id → 400", async () => {
	const res = await onRequestGet(
		ctx(
			{ WATCH_ENABLED: "true", SPORTMONKS_TOKEN: "t" },
			"https://x/api/player?id=abc",
		),
	);
	assert.equal(res.status, 400);
});

test("no token → 200 note", async () => {
	const res = await onRequestGet(ctx({ WATCH_ENABLED: "true" }));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.profile, null);
});

test("happy path returns normalized profile", async () => {
	const env = {
		WATCH_ENABLED: "true",
		SPORTMONKS_TOKEN: "t",
		__fetchImpl: fakeFetch({
			id: 21773355,
			name: "Ayase Ueda",
			height: 182,
			metadata: [{ type_id: 229, values: "right" }],
			teams: [{ end: "2028-06-30", team: { name: "Feyenoord" } }],
			statistics: [
				{ season_id: 1, details: [{ type_id: 52, value: { total: 8 } }] },
			],
		}),
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.profile.name, "Ayase Ueda");
	assert.equal(b.profile.club_name, "Feyenoord");
	assert.equal(b.seasons[0].stats.goals, 8);
});

test("fetch throws → 200 fault-isolated null", async () => {
	const env = {
		WATCH_ENABLED: "true",
		SPORTMONKS_TOKEN: "t",
		__fetchImpl: async () => {
			throw new Error("boom");
		},
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.profile, null);
});
