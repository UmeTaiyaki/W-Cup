import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "./news.js";

function memKV(initial = {}) {
	const store = new Map(Object.entries(initial));
	const opts = new Map();
	return {
		get: async (k) => (store.has(k) ? store.get(k) : null),
		put: async (k, v, o) => {
			store.set(k, v);
			opts.set(k, o);
		},
		_store: store,
		_opts: opts,
	};
}
function fakeFetch(payload, status = 200) {
	const impl = async () => new Response(JSON.stringify(payload), { status });
	return impl;
}
function ctx(env) {
	return { env, request: new Request("https://x/api/news") };
}

const SAMPLE = {
	articles: [
		{
			title: "t1",
			description: "d1",
			url: "https://n.com/1",
			image: "https://n.com/1.jpg",
			publishedAt: "2026-06-17T10:00:00Z",
			source: { name: "N" },
		},
	],
};

test("NEWS_ENABLED 未設定 → enabled:false", async () => {
	const res = await onRequestGet(ctx({ CONFIG: memKV() }));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.enabled, false);
});

test("KVミス → fetch→正規化→KV保存→items返却", async () => {
	const kv = memKV();
	const env = {
		NEWS_ENABLED: "true",
		GNEWS_API_KEY: "k",
		CONFIG: kv,
		__fetchImpl: fakeFetch(SAMPLE),
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(b.enabled, true);
	assert.equal(b.items.length, 1);
	assert.equal(b.items[0].url, "https://n.com/1");
	assert.ok(kv._store.has("news:gnews:ja:v1"), "KVに保存されている");
	assert.equal(
		kv._opts.get("news:gnews:ja:v1").expirationTtl,
		1800,
		"成功時は30分TTLで保存",
	);
});

test("KVヒット → GNewsを叩かず即返却", async () => {
	let fetched = false;
	const cached = JSON.stringify({
		items: [
			{
				id: "https://c.com/1",
				url: "https://c.com/1",
				title: "cached",
				description: "",
				image: "",
				source: "",
				publishedAt: "",
			},
		],
	});
	const env = {
		NEWS_ENABLED: "true",
		GNEWS_API_KEY: "k",
		CONFIG: memKV({ "news:gnews:ja:v1": cached }),
		__fetchImpl: async () => {
			fetched = true;
			return new Response("{}");
		},
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(b.items[0].title, "cached");
	assert.equal(fetched, false, "KVヒット時はGNewsを叩かない");
});

test("GNews失敗 → enabled:true, items:[]（障害隔離）", async () => {
	const env = {
		NEWS_ENABLED: "true",
		GNEWS_API_KEY: "k",
		CONFIG: memKV(),
		__fetchImpl: async () => {
			throw new Error("network");
		},
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.enabled, true);
	assert.deepEqual(b.items, []);
});

test("記事0件 → items:[] かつ短TTL(300s)でキャッシュ（呼び出しの嵐を防ぐ）", async () => {
	const kv = memKV();
	const env = {
		NEWS_ENABLED: "true",
		GNEWS_API_KEY: "k",
		CONFIG: kv,
		__fetchImpl: fakeFetch({ articles: [] }),
	};
	const b = await (await onRequestGet(ctx(env))).json();
	assert.deepEqual(b.items, []);
	assert.ok(kv._store.has("news:gnews:ja:v1"), "空でもKVに保存される");
	assert.equal(kv._opts.get("news:gnews:ja:v1").expirationTtl, 300);
});

test("NEWS_ENABLED true だが GNEWS_API_KEY 無し → enabled:true, items:[]", async () => {
	const env = {
		NEWS_ENABLED: "true",
		CONFIG: memKV(),
		__fetchImpl: fakeFetch(SAMPLE),
	};
	const b = await (await onRequestGet(ctx(env))).json();
	assert.equal(b.enabled, true);
	assert.deepEqual(b.items, []);
});

test("KVの不正JSON → 例外を吸収しGNewsから再取得", async () => {
	const env = {
		NEWS_ENABLED: "true",
		GNEWS_API_KEY: "k",
		CONFIG: memKV({ "news:gnews:ja:v1": "not json{" }),
		__fetchImpl: fakeFetch(SAMPLE),
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.enabled, true);
	assert.equal(b.items.length, 1);
});
