import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchRssNews, parseRssItems } from "./rss.js";

// 実フィード構造を模した最小XML。
const SOCCER_KING = `<?xml version="1.0"?><rss><channel>
<item>
<title>メッシ退場すべきだった？</title>
<link>https://www.soccer-king.jp/news/world/wc/1.html</link>
<pubDate>Wed, 17 Jun 2026 05:19:42 +0000</pubDate>
<description><![CDATA[FIFAワールドカップ2026初戦で活躍した&amp;メッシ···]]></description>
<content:encoded><![CDATA[<p>本文</p><img src="https://img.soccer-king.jp/a.jpg" />]]></content:encoded>
</item>
</channel></rss>`;

const FOOTBALL_CHANNEL = `<rss><channel>
<item>
<title><![CDATA[【結果速報】オーストリア代表 対 ヨルダン代表]]></title>
<link>https://www.footballchannel.jp/2026/06/17/post919188/</link>
<pubDate>Wed, 17 Jun 2026 05:51:24 +0000</pubDate>
<description><![CDATA[テキスト速報でお届けする。]]></description>
<content:encoded><![CDATA[<img fetchpriority="high" width="1200" src="https://img-footballchannel.com/x.jpg" class="wp-post-image" alt="">本文]]></content:encoded>
</item>
</channel></rss>`;

const GEKISAKA = `<rss><channel>
<item>
<title><![CDATA[ムバッペが代表歴代最多得点者に]]></title>
<link>https://web.gekisaka.jp/photonews/worldcup/detail/?453600-453600-pn</link>
<pubDate>Wed, 17 Jun 2026 14:25:56 +0900</pubDate>
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

test("parseRssItems: 1記事を正規化(画像はcontent:encodedのimgから)", () => {
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
	});
});

test("parseRssItems: footballchannelの img(属性付き)からsrc抽出", () => {
	const items = parseRssItems(FOOTBALL_CHANNEL, "フットボールチャンネル");
	assert.equal(items[0].image, "https://img-footballchannel.com/x.jpg");
	assert.equal(items[0].source, "フットボールチャンネル");
});

test("parseRssItems: +0900 の pubDate もISO化", () => {
	const items = parseRssItems(GEKISAKA, "ゲキサカ");
	assert.equal(items[0].publishedAt, "2026-06-17T05:25:56.000Z");
	assert.equal(
		items[0].image,
		"https://f.image.geki.jp/news_1.jpg?time=20260617",
	);
});

test("parseRssItems: link 欠落の item はスキップ", () => {
	const xml = `<rss><channel>
		<item><title>no link</title><pubDate>Wed, 17 Jun 2026 00:00:00 +0000</pubDate></item>
		<item><title>ok</title><link>https://ok.com/1</link><pubDate>Wed, 17 Jun 2026 00:00:00 +0000</pubDate></item>
	</channel></rss>`;
	const items = parseRssItems(xml, "X");
	assert.equal(items.length, 1);
	assert.equal(items[0].url, "https://ok.com/1");
});

test("parseRssItems: 画像が無ければ image は空(カード側でグラデ)", () => {
	const xml = `<rss><channel><item><title>t</title><link>https://x.com/1</link>
		<pubDate>Wed, 17 Jun 2026 00:00:00 +0000</pubDate><description><![CDATA[本文のみ]]></description></item></channel></rss>`;
	assert.equal(parseRssItems(xml, "X")[0].image, "");
});

test("fetchRssNews: 複数フィードをマージし新着順", async () => {
	const env = {
		NEWS_RSS_FEEDS:
			"サッカーキング|https://sk/feed,フットボールチャンネル|https://fc/feed,ゲキサカ|https://gk/feed",
		__fetchImpl: fetchByUrl({
			"https://sk/feed": SOCCER_KING, // 05:19Z
			"https://fc/feed": FOOTBALL_CHANNEL, // 05:51Z
			"https://gk/feed": GEKISAKA, // 05:25Z (14:25+0900)
		}),
	};
	const items = await fetchRssNews(env);
	assert.equal(items.length, 3);
	assert.deepEqual(
		items.map((i) => i.source),
		["フットボールチャンネル", "ゲキサカ", "サッカーキング"], // 05:51 > 05:25 > 05:19
	);
});

test("fetchRssNews: 一部フィード失敗(404)でも残りを返す", async () => {
	const env = {
		NEWS_RSS_FEEDS: "A|https://a/feed,B|https://b/feed",
		__fetchImpl: fetchByUrl({ "https://b/feed": GEKISAKA }), // A は404
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
	const dup = `<rss><channel><item><title>同じ</title><link>https://x.com/same</link>
		<pubDate>Wed, 17 Jun 2026 00:00:00 +0000</pubDate></item></channel></rss>`;
	const env = {
		NEWS_RSS_FEEDS: "A|https://a/feed,B|https://b/feed",
		__fetchImpl: fetchByUrl({ "https://a/feed": dup, "https://b/feed": dup }),
	};
	const items = await fetchRssNews(env);
	assert.equal(items.length, 1);
});
