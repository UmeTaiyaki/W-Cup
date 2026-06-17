import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchGnews } from "./gnews.js";

// 全クエリに同一payloadを返す。叩かれた全URLを urls() で参照できる。
function fakeFetch(payload, status = 200) {
	const urls = [];
	const impl = async (url) => {
		urls.push(url);
		return new Response(JSON.stringify(payload), { status });
	};
	impl.urls = () => urls;
	impl.lastUrl = () => urls[urls.length - 1];
	return impl;
}

// q(検索語)ごとに別payloadを返す。一般枠/海外枠の交互マージ検証用。
function fakeFetchByQuery(map, status = 200) {
	const impl = async (url) => {
		const q = new URL(url).searchParams.get("q");
		const payload = map[q] || { articles: [] };
		return new Response(JSON.stringify(payload), { status });
	};
	return impl;
}

const SAMPLE = {
	totalArticles: 2,
	articles: [
		{
			title: "日本、初戦勝利",
			description: "森保ジャパンが白星発進。",
			content: "truncated...",
			url: "https://example.com/a",
			image: "https://example.com/a.jpg",
			publishedAt: "2026-06-17T10:00:00Z",
			source: { name: "Example News", url: "https://example.com" },
		},
		{
			title: "ブラジル快勝",
			description: "5得点の圧勝。",
			url: "https://example.com/b",
			image: "https://example.com/b.jpg",
			publishedAt: "2026-06-17T08:00:00Z",
			source: { name: "Sample Sports", url: "https://sample.com" },
		},
	],
};

test("正常レスポンスを正規化", async () => {
	const env = { GNEWS_API_KEY: "k", __fetchImpl: fakeFetch(SAMPLE) };
	const items = await fetchGnews(env);
	assert.equal(items.length, 2);
	assert.deepEqual(items[0], {
		id: "https://example.com/a",
		title: "日本、初戦勝利",
		description: "森保ジャパンが白星発進。",
		url: "https://example.com/a",
		image: "https://example.com/a.jpg",
		source: "Example News",
		publishedAt: "2026-06-17T10:00:00Z",
	});
});

test("一般枠と海外枠の2クエリを叩き、共通パラメータを組み立てる", async () => {
	const impl = fakeFetch(SAMPLE);
	const env = {
		GNEWS_API_KEY: "secret-key",
		GNEWS_QUERY: '"ワールドカップ"',
		GNEWS_QUERY_INTL: '"ワールドカップ" NOT 日本',
		GNEWS_LANG: "ja",
		__fetchImpl: impl,
	};
	await fetchGnews(env);
	const urls = impl.urls().map((u) => new URL(u));
	assert.equal(urls.length, 2, "一般枠＋海外枠で2回叩く");
	const queries = urls.map((u) => u.searchParams.get("q"));
	assert.ok(queries.includes('"ワールドカップ"'), "一般枠クエリ");
	assert.ok(queries.includes('"ワールドカップ" NOT 日本'), "海外枠クエリ");
	for (const u of urls) {
		assert.equal(u.origin + u.pathname, "https://gnews.io/api/v4/search");
		assert.equal(u.searchParams.get("lang"), "ja");
		assert.equal(u.searchParams.get("max"), "10");
		assert.equal(u.searchParams.get("sortby"), "publishedAt");
		assert.equal(u.searchParams.get("apikey"), "secret-key");
	}
});

test("海外枠の結果が一般枠と交互にマージされる", async () => {
	const env = {
		GNEWS_API_KEY: "k",
		GNEWS_QUERY: "GEN",
		GNEWS_QUERY_INTL: "INTL",
		__fetchImpl: fakeFetchByQuery({
			GEN: {
				articles: [
					{
						title: "日本G1",
						url: "https://g.com/1",
						publishedAt: "2026-06-17T10:00:00Z",
					},
					{
						title: "日本G2",
						url: "https://g.com/2",
						publishedAt: "2026-06-17T09:00:00Z",
					},
				],
			},
			INTL: {
				articles: [
					{
						title: "ブラジルI1",
						url: "https://i.com/1",
						publishedAt: "2026-06-17T10:00:00Z",
					},
					{
						title: "ドイツI2",
						url: "https://i.com/2",
						publishedAt: "2026-06-17T09:00:00Z",
					},
				],
			},
		}),
	};
	const items = await fetchGnews(env);
	// interleave: [G1, I1, G2, I2]
	assert.deepEqual(
		items.map((it) => it.title),
		["日本G1", "ブラジルI1", "日本G2", "ドイツI2"],
	);
});

test("両枠が同一URL記事を返しても重複排除される", async () => {
	const shared = {
		articles: [
			{
				title: "共通記事",
				url: "https://x.com/same",
				publishedAt: "2026-06-17T10:00:00Z",
			},
		],
	};
	const env = {
		GNEWS_API_KEY: "k",
		GNEWS_QUERY: "GEN",
		GNEWS_QUERY_INTL: "INTL",
		__fetchImpl: fakeFetchByQuery({ GEN: shared, INTL: shared }),
	};
	const items = await fetchGnews(env);
	assert.equal(items.length, 1);
});

test("マージ結果は表示上限(12件)で打ち切る", async () => {
	const mk = (p, n) => ({
		articles: Array.from({ length: n }, (_, i) => ({
			title: `${p}-${i}`,
			url: `https://${p}.com/${i}`,
			publishedAt: "2026-06-17T10:00:00Z",
		})),
	});
	const env = {
		GNEWS_API_KEY: "k",
		GNEWS_QUERY: "GEN",
		GNEWS_QUERY_INTL: "INTL",
		__fetchImpl: fakeFetchByQuery({ GEN: mk("g", 10), INTL: mk("i", 10) }),
	};
	const items = await fetchGnews(env);
	assert.equal(items.length, 12);
});

test("APIキー未設定 → 空配列（fetchしない）", async () => {
	let called = false;
	const env = {
		__fetchImpl: async () => {
			called = true;
			return new Response("{}");
		},
	};
	const items = await fetchGnews(env);
	assert.deepEqual(items, []);
	assert.equal(called, false);
});

test("非200 → 空配列", async () => {
	const env = {
		GNEWS_API_KEY: "k",
		__fetchImpl: fakeFetch({ errors: ["bad"] }, 401),
	};
	assert.deepEqual(await fetchGnews(env), []);
});

test("articles欠如 → 空配列", async () => {
	const env = {
		GNEWS_API_KEY: "k",
		__fetchImpl: fakeFetch({ totalArticles: 0 }),
	};
	assert.deepEqual(await fetchGnews(env), []);
});

test("url欠損の記事はスキップ", async () => {
	const env = {
		GNEWS_API_KEY: "k",
		__fetchImpl: fakeFetch({
			articles: [
				{ title: "no url", description: "x" },
				{
					title: "ok",
					url: "https://ok.com/1",
					publishedAt: "2026-06-17T00:00:00Z",
				},
			],
		}),
	};
	const items = await fetchGnews(env);
	assert.equal(items.length, 1);
	assert.equal(items[0].url, "https://ok.com/1");
});

test("source/image欠損は安全な既定値", async () => {
	const env = {
		GNEWS_API_KEY: "k",
		__fetchImpl: fakeFetch({
			articles: [
				{
					title: "t",
					url: "https://x.com/1",
					publishedAt: "2026-06-17T00:00:00Z",
				},
			],
		}),
	};
	const items = await fetchGnews(env);
	assert.equal(items[0].source, "");
	assert.equal(items[0].image, "");
	assert.equal(items[0].description, "");
});

test("同一タイトルの重複(シンジケート配信)は先頭を残して排除", async () => {
	const env = {
		GNEWS_API_KEY: "k",
		__fetchImpl: fakeFetch({
			articles: [
				{
					title: "W杯日本勝利",
					url: "https://a.com/1",
					source: { name: "A" },
					publishedAt: "2026-06-17T10:00:00Z",
				},
				{
					title: "W杯日本勝利",
					url: "https://b.com/1",
					source: { name: "B" },
					publishedAt: "2026-06-17T09:00:00Z",
				},
				{
					title: "別の記事",
					url: "https://c.com/1",
					source: { name: "C" },
					publishedAt: "2026-06-17T08:00:00Z",
				},
			],
		}),
	};
	const items = await fetchGnews(env);
	assert.equal(items.length, 2);
	assert.equal(items[0].source, "A"); // 先頭を残す
	assert.equal(items[1].title, "別の記事");
});

test("タイトル空は重複扱いせず全て残す", async () => {
	const env = {
		GNEWS_API_KEY: "k",
		__fetchImpl: fakeFetch({
			articles: [
				{ url: "https://a.com/1", publishedAt: "2026-06-17T10:00:00Z" },
				{ url: "https://b.com/1", publishedAt: "2026-06-17T09:00:00Z" },
			],
		}),
	};
	const items = await fetchGnews(env);
	assert.equal(items.length, 2);
});
