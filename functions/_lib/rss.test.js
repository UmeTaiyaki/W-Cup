import assert from "node:assert/strict";
import { test } from "node:test";
import {
	fetchRssNews,
	filterWorldCup,
	mergePool,
	NEWS_KV_KEY,
	parseRssItems,
	refreshNewsPool,
} from "./rss.js";

// 固定の基準時刻(2026-06-17T12:00:00Z)。テストを Date.now() 非依存にする。
const NOW = Date.parse("2026-06-17T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
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

test("filterWorldCup: 広報/販促(CM・リリース等)はW杯言及でも除外", () => {
	const items = [
		// W杯スポンサーCMだが試合/チームのニュースではない(カテゴリ=リリース)
		{
			title: "＝LOVEがユニ姿でマクドナルドCMに登場",
			description: "FIFAワールドカップ2026のオフィシャルスポンサー…",
			categories: ["リリース", "ワールドカップ"],
		},
		// グッズ販促
		{
			title: "W杯記念グッズが発売",
			description: "",
			categories: ["ワールドカップ"],
		},
		// 通常の試合ニュースは残る
		{
			title: "メッシがハットトリック",
			description: "",
			categories: ["FIFAワールドカップ2026"],
		},
	];
	const kept = filterWorldCup(items);
	assert.deepEqual(
		kept.map((i) => i.title),
		["メッシがハットトリック"],
	);
});

test("filterWorldCup: データ系ハブ(日程/放送/ランキング)はアプリ本体が持つので除外", () => {
	const cat = ["FIFAワールドカップ2026"];
	const items = [
		{
			title: "FIFAワールドカップ2026｜出場国一覧｜試合日程・結果",
			description: "",
			categories: cat,
		},
		{
			title:
				"【6月18日】ガーナ代表 vs パナマ代表｜地上波テレビ放送・中継・ネット配信",
			description: "",
			categories: cat,
		},
		{
			title: "【最新】FIFAワールドカップ2026得点ランキング｜得点王争い",
			description: "",
			categories: cat,
		},
		{
			title: "ウズベキスタン対コロンビア、FIFAランキング順位は？",
			description: "ワールドカップ",
			categories: cat,
		},
		{
			title: "ハーランドが待望のW杯デビュー戦でいきなり2発",
			description: "",
			categories: cat,
		}, // 残る
	];
	const kept = filterWorldCup(items);
	assert.deepEqual(
		kept.map((i) => i.title),
		["ハーランドが待望のW杯デビュー戦でいきなり2発"],
	);
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

// ---- ローリングプール(追加/破棄ロジック) ----

const A = (id, h) => ({
	id: `https://x/${id}`,
	url: `https://x/${id}`,
	title: `記事${id}`,
	description: "",
	image: "",
	source: "S",
	publishedAt: hoursAgo(h),
});

test("mergePool: 新着を既存に追加(重複URLは1つ)・新着順", () => {
	const existing = [A("1", 2), A("2", 5)];
	const fresh = [A("3", 0), A("1", 2)]; // 3が新規・1は重複
	const pool = mergePool(existing, fresh, { now: NOW });
	assert.deepEqual(
		pool.map((p) => p.id),
		["https://x/3", "https://x/1", "https://x/2"],
	);
});

test("mergePool: retainHours(72h)より古い記事は破棄", () => {
	const pool = mergePool([A("old", 100)], [A("new", 1)], { now: NOW });
	assert.deepEqual(
		pool.map((p) => p.id),
		["https://x/new"],
	);
});

test("mergePool: publishedAt 無効な記事は破棄", () => {
	const bad = { ...A("bad", 1), publishedAt: "" };
	const pool = mergePool([], [bad, A("ok", 1)], { now: NOW });
	assert.deepEqual(
		pool.map((p) => p.id),
		["https://x/ok"],
	);
});

test("mergePool: maxPool 件にキャップ(新着優先)", () => {
	const many = Array.from({ length: 40 }, (_, i) => A(`n${i}`, i * 0.1));
	const pool = mergePool([], many, { now: NOW, maxPool: 30 });
	assert.equal(pool.length, 30);
	assert.equal(pool[0].id, "https://x/n0"); // 最新が先頭
});

test("refreshNewsPool: フィード取得→既存プールにmerge→KV書込(セーフティTTL付)", async () => {
	const xml = `<rss><channel><item><title>新W杯記事</title>
		<link>https://feed/new</link><pubDate>${new Date(NOW - 3600000).toUTCString()}</pubDate>
		<category>W杯</category></item></channel></rss>`;
	const existing = JSON.stringify({ items: [A("keep", 2)] });
	const kv = memKV({ [NEWS_KV_KEY]: existing });
	const env = {
		CONFIG: kv,
		NEWS_RSS_FEEDS: "A|https://a/feed",
		__fetchImpl: async () => new Response(xml, { status: 200 }),
	};
	const pool = await refreshNewsPool(env, NOW);
	assert.deepEqual(
		pool.map((p) => p.url),
		["https://feed/new", "https://x/keep"], // 新着(1h)が既存(2h)より前
	);
	const stored = JSON.parse(kv._store.get(NEWS_KV_KEY));
	assert.equal(stored.items.length, 2);
	assert.equal(kv._opts.get(NEWS_KV_KEY).expirationTtl, 86400);
});
