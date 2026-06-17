import assert from "node:assert/strict";
import { test } from "node:test";
import { makeAfClient } from "./apifootball-client.js";

test("makeAfClient: ホスト・ヘッダ・status/json を返す", async () => {
	let seenUrl;
	let seenHeaders;
	const fetchImpl = async (url, opts) => {
		seenUrl = url;
		seenHeaders = opts.headers;
		return { status: 200, json: async () => ({ response: [] }) };
	};
	const c = makeAfClient({ token: "KEY", fetchImpl });
	const r = await c.get("/fixtures/headtohead?h2h=25-1118");
	assert.equal(
		seenUrl,
		"https://v3.football.api-sports.io/fixtures/headtohead?h2h=25-1118",
	);
	assert.equal(seenHeaders["x-apisports-key"], "KEY");
	assert.equal(r.status, 200);
	assert.deepEqual(r.json, { response: [] });
});

test("makeAfClient: fetch 例外は status:0 で握る", async () => {
	const fetchImpl = async () => {
		throw new Error("network");
	};
	const c = makeAfClient({ token: "KEY", fetchImpl });
	const r = await c.get("/x");
	assert.equal(r.status, 0);
	assert.equal(r.json, null);
});
