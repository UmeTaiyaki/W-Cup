import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchRssNews, filterWorldCup, parseRssItems } from "./rss.js";

// 実フィード構造を模した最小XML（W杯カテゴリ付き）。
const SOCCER_KING = `<?xml version="1.0"?><rss><channel>
<item>
<title>メッシ退場すべきだった？</title>
<link>https://www.soccer-king.jp/news/world/wc/1.html</link>
<pubDate>Wed, 17 Jun 2026 05:19:42 +0000</pubDate>
<category><![CDATA[ワールドカップ]]></category>
<category><![CDATA[FIFAワールドカップ2026]]></category>
<description><![CDATA[FIFAワールドカップ2026初戦で活躍した&amp;メッシ···]]></description>
<content:encoded><![CDATA[<p>本文</p><img src="https://img.soccer-king.jp/a.jpg" />]]></content:encoded>
</item>
</channel></rss>`;

const FOOTBALL_CHANNEL = `<rss><channel>
<item>
<title><![CDATA[オーストリア代表 対 ヨルダン代表 プレビュー]]></title>
<link>https://www.footballchannel.jp/2026/06/17/post919188/</link>
<pubDate>Wed, 17 Jun 2026 05:51:24 +0000</pubDate>
<category><![CDATA[FIFAワールドカップ2026]]></category>
<category><![CDATA[北中米W杯]]></category>
<description><![CDATA[北中米W杯のグループリーグをお届けする。]]></description>
<content:encoded><![CDATA[<img fetchpriority="high" width="1200" src="https://img-footballchannel.com/x.jpg" class="wp-post-image" alt="">本文]]></content:encoded>
</item>
</channel></rss>`;

const GEKISAKA = `<rss><channel>
<item>
<title><![CDATA[ムバッペが代表歴代最多得点者に]]></title>
<link>https://web.gekisaka.jp/photonews/worldcup/detail/?453600-453600-pn</link>
<pubDate>Wed, 17 Jun 2026 14:25:56 +0900</pubDate>
<category><![CDATA[W杯]]></category>
<description><![CDATA[フランス代表は16日、W杯I組第1節にて…]]></description>
<content:encoded><![CDATA[<img src="https://f.image.geki.jp/news_1.jpg?time=20260617" alt="ムバッペ" /><br />本文]]></content:encoded>
</item>
</channel></rss>`;

function fetchByUrl(map) {
	return async (url) => {
		if (map[url] === undefined) return new Response("", { status: 404 });
		return new Response(map[url], { status: 200 });
	};
}

test("parseRssItems: 1記事を正規化(画像/カテゴリ含む)", () => {
	const items = parseRssItems(SOCCER_KING, "サッカーキング");
	assert.equal(items.length, 1);
	assert.deepEqual(items[0], {
		id: "https://www.soccer-king.jp/news/world/wc/1.html",
		title: "メッシ退場すべきだった？",
		description: "FIFAワールドカップ2026初戦で活躍した&メッシ···",
		url: "https://www.soccer-king.jp/news/world/wc/1.html",
		image: "https://img.soccer-king.jp/a.jpg",
		source: "サッカーキング",
		publishedAt: "2026-06-17T05:19:42.000Z",
		categories: ["ワールドカップ", "FIFAワールドカップ2026"],
	});
});

test("parseRssItems: footballchannelの img(属性付き)からsrc抽出", () => {
	const items = parseRssItems(FOOTBALL_CHANNEL, "フットボールチャンネル");
	assert.equal(items[0].image, "https://img-footballchannel.com/x.jpg");
});

test("parseRssItems: +0900 の pubDate もISO化", () => {
	const items = parseRssItems(GEKISAKA, "ゲキサカ");
	assert.equal(items[0].publishedAt, "2026-06-17T05:25:56.000Z");
});

test("filterWorldCup: スタブ(試合記録/試合経過/スタメン発表)を除外", () => {
	const base = { description: "", categories: ["W杯"], url: "u", image: "" };
	const items = [
		{ ...base, title: "フランスvsセネガル 試合記録" },
		{ ...base, title: "オーストリアvsヨルダン スタメン発表" },
		{ ...base, title: "試合経過: 日本vsオランダ" },
		{ ...base, title: "ムバッペが代表歴代最多得点者に" },
	];
	const kept = filterWorldCup(items);
	assert.equal(kept.length, 1);
	assert.equal(kept[0].title, "ムバッペが代表歴代最多得点者に");
});

test("filterWorldCup: W杯2026以外(Jリーグ等)を除外", () => {
	const items = [
		{
			title: "札幌が水曜どうでしょうとコラボ",
			description: "Jリーグの話題",
			categories: ["Jリーグ"],
		},
		{
			title: "鹿島の18歳DF",
			description: "北中米W杯同行で経験",
			categories: [],
		},
		{
			title: "メッシ ハットトリック",
			description: "",
			categories: ["ワールドカップ"],
		},
	];
	const kept = filterWorldCup(items);
	assert.deepEqual(
		kept.map((i) => i.title),
		["鹿島の18歳DF", "メッシ ハットトリック"],
	);
});

test("fetchRssNews: 複数フィードをマージし新着順・categoriesは出力しない", async () => {
	const env = {
		NEWS_RSS_FEEDS:
			"サッカーキング|https://sk/feed,フットボールチャンネル|https://fc/feed,ゲキサカ|https://gk/feed",
		__fetchImpl: fetchByUrl({
			"https://sk/feed": SOCCER_KING, // 05:19Z
			"https://fc/feed": FOOTBALL_CHANNEL, // 05:51Z
			"https://gk/feed": GEKISAKA, // 05:25Z
		}),
	};
	const items = await fetchRssNews(env);
	assert.equal(items.length, 3);
	assert.deepEqual(
		items.map((i) => i.source),
		["フットボールチャンネル", "ゲキサカ", "サッカーキング"],
	);
	assert.ok(!("categories" in items[0]), "categories は出力に含めない");
});

test("fetchRssNews: スタブ・非W杯はマージ結果から除外", async () => {
	const mixed = `<rss><channel>
		<item><title>フランスvsセネガル 試合記録</title><link>https://x/1</link>
			<pubDate>Wed, 17 Jun 2026 10:00:00 +0000</pubDate><category>W杯</category></item>
		<item><title>Jリーグ第15節の結果</title><link>https://x/2</link>
			<pubDate>Wed, 17 Jun 2026 09:00:00 +0000</pubDate><category>Jリーグ</category></item>
		<item><title>メッシがハット</title><link>https://x/3</link>
			<pubDate>Wed, 17 Jun 2026 08:00:00 +0000</pubDate><category>FIFAワールドカップ2026</category></item>
	</channel></rss>`;
	const env = {
		NEWS_RSS_FEEDS: "A|https://a/feed",
		__fetchImpl: fetchByUrl({ "https://a/feed": mixed }),
	};
	const items = await fetchRssNews(env);
	assert.equal(items.length, 1);
	assert.equal(items[0].title, "メッシがハット");
});

test("fetchRssNews: 一部フィード失敗(404)でも残りを返す", async () => {
	const env = {
		NEWS_RSS_FEEDS: "A|https://a/feed,B|https://b/feed",
		__fetchImpl: fetchByUrl({ "https://b/feed": GEKISAKA }),
	};
	const items = await fetchRssNews(env);
	assert.equal(items.length, 1);
	assert.equal(items[0].source, "B");
});

test("fetchRssNews: 全フィード失敗なら空配列", async () => {
	const env = {
		NEWS_RSS_FEEDS: "A|https://a/feed",
		__fetchImpl: async () => {
			throw new Error("network");
		},
	};
	assert.deepEqual(await fetchRssNews(env), []);
});

test("fetchRssNews: 同一URLの重複は排除", async () => {
	const dup = `<rss><channel><item><title>同じW杯記事</title><link>https://x.com/same</link>
		<pubDate>Wed, 17 Jun 2026 00:00:00 +0000</pubDate><category>W杯</category></item></channel></rss>`;
	const env = {
		NEWS_RSS_FEEDS: "A|https://a/feed,B|https://b/feed",
		__fetchImpl: fetchByUrl({ "https://a/feed": dup, "https://b/feed": dup }),
	};
	const items = await fetchRssNews(env);
	assert.equal(items.length, 1);
});
