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
function fakeFetch(xml, status = 200) {
	return async () => new Response(xml, { status });
}
function ctx(env) {
	return { env, request: new Request("https://x/api/news") };
}

const RSS_XML = `<rss><channel><item>
<title>W杯記事</title>
<link>https://soccer-king.jp/news/1.html</link>
<pubDate>Wed, 17 Jun 2026 10:00:00 +0000</pubDate>
<description><![CDATA[要約]]></description>
<content:encoded><![CDATA[<img src="https://img/1.jpg" />本文]]></content:encoded>
</item></channel></rss>`;

test("NEWS_ENABLED 未設定 → enabled:false", async () => {
	const res = await onRequestGet(ctx({ CONFIG: memKV() }));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.enabled, false);
});

test("KVミス → RSS取得→正規化→KV保存(30分TTL)→items返却", async () => {
	const kv = memKV();
	const env = {
		NEWS_ENABLED: "true",
		CONFIG: kv,
		__fetchImpl: fakeFetch(RSS_XML),
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(b.enabled, true);
	assert.equal(b.items.length, 1); // 既定3フィードが同一XML→同一URLで重複排除され1件
	assert.equal(b.items[0].url, "https://soccer-king.jp/news/1.html");
	assert.ok(kv._store.has("news:rss:ja:v1"), "KVに保存されている");
	assert.equal(
		kv._opts.get("news:rss:ja:v1").expirationTtl,
		1800,
		"成功時は30分TTLで保存",
	);
});

test("KVヒット → RSSを取得せず即返却", async () => {
	let fetched = false;
	const cached = JSON.stringify({
		items: [
			{
				id: "https://c.com/1",
				url: "https://c.com/1",
				title: "cached",
				description: "",
				image: "",
				source: "サッカーキング",
				publishedAt: "",
			},
		],
	});
	const env = {
		NEWS_ENABLED: "true",
		CONFIG: memKV({ "news:rss:ja:v1": cached }),
		__fetchImpl: async () => {
			fetched = true;
			return new Response("");
		},
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(b.items[0].title, "cached");
	assert.equal(fetched, false, "KVヒット時はRSSを取得しない");
});

test("RSS取得失敗 → enabled:true, items:[]（障害隔離）", async () => {
	const env = {
		NEWS_ENABLED: "true",
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

test("記事0件 → items:[] かつ短TTL(300s)でキャッシュ（再取得連打を防ぐ）", async () => {
	const kv = memKV();
	const env = {
		NEWS_ENABLED: "true",
		CONFIG: kv,
		__fetchImpl: fakeFetch("<rss><channel></channel></rss>"),
	};
	const b = await (await onRequestGet(ctx(env))).json();
	assert.deepEqual(b.items, []);
	assert.ok(kv._store.has("news:rss:ja:v1"), "空でもKVに保存される");
	assert.equal(kv._opts.get("news:rss:ja:v1").expirationTtl, 300);
});

test("KVの不正JSON → 例外を吸収しRSSから再取得", async () => {
	const env = {
		NEWS_ENABLED: "true",
		CONFIG: memKV({ "news:rss:ja:v1": "not json{" }),
		__fetchImpl: fakeFetch(RSS_XML),
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.enabled, true);
	assert.equal(b.items.length, 1);
});
