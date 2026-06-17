import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "./news.js";

const NEWS_KV_KEY = "news:rss:ja:v2";

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

function poolItems(n) {
	return Array.from({ length: n }, (_, i) => ({
		id: `https://x/${i}`,
		url: `https://x/${i}`,
		title: `記事${i}`,
		description: "",
		image: "",
		source: "サッカーキング",
		publishedAt: "2026-06-17T10:00:00Z",
	}));
}

const RSS_XML = `<rss><channel><item>
<title>W杯記事</title>
<link>https://soccer-king.jp/news/1.html</link>
<pubDate>Wed, 17 Jun 2026 10:00:00 +0000</pubDate>
<category>W杯</category>
<description><![CDATA[要約]]></description>
<content:encoded><![CDATA[<img src="https://img/1.jpg" />本文]]></content:encoded>
</item></channel></rss>`;

test("NEWS_ENABLED 未設定 → enabled:false", async () => {
	const res = await onRequestGet(ctx({ CONFIG: memKV() }));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.enabled, false);
});

test("KVプールあり → 新着12件にスライスして返す(RSSは取得しない)", async () => {
	let fetched = false;
	const kv = memKV({ [NEWS_KV_KEY]: JSON.stringify({ items: poolItems(30) }) });
	const env = {
		NEWS_ENABLED: "true",
		CONFIG: kv,
		__fetchImpl: async () => {
			fetched = true;
			return new Response("");
		},
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(b.enabled, true);
	assert.equal(b.items.length, 12, "30件プールを12件に絞る");
	assert.equal(fetched, false, "プールがあればRSSを叩かない");
});

test("KV空(Cron未稼働) → 直接RSS取得でフォールバック・KVには書かない", async () => {
	const kv = memKV();
	const env = {
		NEWS_ENABLED: "true",
		CONFIG: kv,
		__fetchImpl: fakeFetch(RSS_XML),
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(b.enabled, true);
	assert.equal(b.items.length, 1);
	assert.equal(b.items[0].url, "https://soccer-king.jp/news/1.html");
	assert.equal(kv._store.size, 0, "フォールバックはKVに書き込まない(Cron専任)");
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

test("KVの不正JSON → 例外を吸収しフォールバック取得", async () => {
	const env = {
		NEWS_ENABLED: "true",
		CONFIG: memKV({ [NEWS_KV_KEY]: "not json{" }),
		__fetchImpl: fakeFetch(RSS_XML),
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.enabled, true);
	assert.equal(b.items.length, 1);
});
