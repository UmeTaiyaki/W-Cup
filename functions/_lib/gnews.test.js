import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchGnews } from "./gnews.js";

function fakeFetch(payload, status = 200) {
	let captured = null;
	const impl = async (url) => {
		captured = url;
		return new Response(JSON.stringify(payload), { status });
	};
	impl.lastUrl = () => captured;
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

test("URLにlang/q/max/sortby/apikeyを組み立てる", async () => {
	const impl = fakeFetch(SAMPLE);
	const env = {
		GNEWS_API_KEY: "secret-key",
		GNEWS_QUERY: '"ワールドカップ"',
		GNEWS_LANG: "ja",
		__fetchImpl: impl,
	};
	await fetchGnews(env);
	const u = new URL(impl.lastUrl());
	assert.equal(u.origin + u.pathname, "https://gnews.io/api/v4/search");
	assert.equal(u.searchParams.get("lang"), "ja");
	assert.equal(u.searchParams.get("q"), '"ワールドカップ"');
	assert.equal(u.searchParams.get("max"), "10");
	assert.equal(u.searchParams.get("sortby"), "publishedAt");
	assert.equal(u.searchParams.get("apikey"), "secret-key");
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
