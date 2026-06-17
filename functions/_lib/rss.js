// サッカー専門メディアのRSS(複数)を取得・正規化してマージする。
// GNewsの日本語インデックスに専門メディアが無いため、RSS直接取得に切替。
// 失敗フィードはスキップ(graceful)。空・全失敗は [] を返し呼び出し側で縮退させる。

// 既定フィード。env NEWS_RSS_FEEDS("名前|URL,名前|URL,...") で上書き可。
const DEFAULT_FEEDS = [
	{ name: "サッカーキング", url: "https://www.soccer-king.jp/feed" },
	{
		name: "フットボールチャンネル",
		url: "https://www.footballchannel.jp/feed/",
	},
	{ name: "ゲキサカ", url: "https://web.gekisaka.jp/feed" },
];
const DISPLAY_LIMIT = 12; // カルーセル表示件数。
const MAX_POOL = 30; // KVに保持するプールの最大件数。
const RETAIN_HOURS = 72; // これより古い(またはpublishedAt無効な)記事はプールから破棄。
const POOL_TTL_SEC = 86400; // KVのセーフティTTL(24h)。Cronが止まれば1日で自然消滅。

// Cron(worker-watch)とPages(/api/news)が共有するKVキー。
export const NEWS_KV_KEY = "news:rss:ja:v2";

// W杯2026の記事だけを残す判定語(title/description/category のいずれかに含む)。
const WC_RE = /ワールドカップ|W杯|北中米/i;
// 速報スタブ(中身が無く逐次更新される枠)を弾く。タイトルで判定。
const STUB_RE = /試合記録|試合経過|スタメン発表|スタメン|試合結果速報/;
// 広報/販促枠を弾く(W杯に言及するスポンサーCM・グッズ・コラボ等は試合/チームのニュースでない)。
const PROMO_CAT_RE = /リリース|プレゼント|キャンペーン/;
const PROMO_TITLE_RE =
	/CM|ＣＭ|グッズ|プレゼント|キャンペーン|コラボ|タイアップ|発売|福袋|ガチャ/;

// W杯2026以外(Jリーグ等)・スタブ・広報/販促記事を除外する。
export function filterWorldCup(items) {
	return items.filter((it) => {
		const cats = (it.categories || []).join(" ");
		if (STUB_RE.test(it.title)) return false;
		if (PROMO_CAT_RE.test(cats)) return false; // 広報/プレゼント等のカテゴリ
		if (PROMO_TITLE_RE.test(it.title)) return false; // CM/グッズ等の販促タイトル
		const hay = `${it.title} ${it.description} ${cats}`;
		return WC_RE.test(hay);
	});
}

// 全フィードを取得→W杯フィルタ→新着順→重複排除し、正規化記事の配列を返す(件数無制限)。
async function collectItems(env) {
	const feeds = parseFeeds(env.NEWS_RSS_FEEDS) || DEFAULT_FEEDS;
	const fetchImpl = env.__fetchImpl || fetch;
	// 各フィードは別ドメイン(共有レート制限なし)なので並列取得でよい。
	const results = await Promise.all(
		feeds.map((f) => fetchOneFeed(fetchImpl, f)),
	);
	const all = filterWorldCup(results.flat());
	all.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
	// categories は判定用の内部フィールドなので出力から落とす。
	return dedupe(all).map(({ categories, ...rest }) => rest);
}

// オンデマンド取得(API のフォールバック用)。最新 DISPLAY_LIMIT 件。
export async function fetchRssNews(env) {
	return (await collectItems(env)).slice(0, DISPLAY_LIMIT);
}

// ローリングプールの追加/破棄ロジック(純関数)。
//  - 追加: fresh の新着を既存プールに統合(URL/タイトルで重複排除・新しい方を優先)。
//  - 破棄: publishedAt が now-retainHours より古い/無効な記事を捨て、新着順で maxPool 件にキャップ。
export function mergePool(existing, fresh, opts = {}) {
	const {
		now = Date.now(),
		maxPool = MAX_POOL,
		retainHours = RETAIN_HOURS,
	} = opts;
	const cutoff = now - retainHours * 3600 * 1000;
	const seenUrl = new Set();
	const seenTitle = new Set();
	const out = [];
	// fresh を先に見て、同一記事は新しい取得データを優先。
	for (const it of [...(fresh || []), ...(existing || [])]) {
		if (!it || !it.url) continue;
		const t = Date.parse(it.publishedAt || "");
		if (Number.isNaN(t) || t < cutoff) continue; // 期限切れ/日付無効は破棄
		if (seenUrl.has(it.url)) continue;
		const key = (it.title || "").trim().toLowerCase();
		if (key && seenTitle.has(key)) continue;
		seenUrl.add(it.url);
		if (key) seenTitle.add(key);
		out.push(it);
	}
	out.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
	return out.slice(0, maxPool);
}

// Cron が呼ぶ: フィード取得→既存プール読込→merge→KV書込。更新後のプールを返す。
export async function refreshNewsPool(env, now = Date.now()) {
	const fresh = await collectItems(env);
	let existing = [];
	try {
		const raw = await env.CONFIG?.get(NEWS_KV_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed && Array.isArray(parsed.items)) existing = parsed.items;
		}
	} catch (e) {
		console.warn("news pool read failed, rebuilding:", e?.message);
	}
	const pool = mergePool(existing, fresh, { now });
	if (env.CONFIG) {
		await env.CONFIG.put(
			NEWS_KV_KEY,
			JSON.stringify({ items: pool, updatedAt: new Date(now).toISOString() }),
			{ expirationTtl: POOL_TTL_SEC },
		);
	}
	return pool;
}

async function fetchOneFeed(fetchImpl, feed) {
	try {
		const res = await fetchImpl(feed.url, {
			headers: { "user-agent": "Mozilla/5.0 (W-Cup news)" },
		});
		if (!res.ok) return [];
		const xml = await res.text();
		return parseRssItems(xml, feed.name);
	} catch (e) {
		return [];
	}
}

// RSS2.0 の <item> を正規化記事 {id,title,description,url,image,source,publishedAt} に変換。
export function parseRssItems(xml, source) {
	const items = [];
	const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
	for (const block of blocks) {
		const link = clean(tag(block, "link"));
		if (!link) continue;
		const contentHtml = tag(block, "content:encoded");
		const descRaw = tag(block, "description");
		const image =
			firstImg(contentHtml) || firstImg(descRaw) || mediaUrl(block) || "";
		const categories = (
			block.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) || []
		).map((c) => decode(clean(c.replace(/<\/?category[^>]*>/gi, ""))));
		items.push({
			id: link,
			title: decode(clean(tag(block, "title"))),
			description: decode(stripHtml(clean(descRaw))).trim(),
			url: link,
			image,
			source,
			publishedAt: toIso(clean(tag(block, "pubDate"))),
			categories,
		});
	}
	return items;
}

function tag(block, name) {
	const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const m = block.match(
		new RegExp(`<${esc}[^>]*>([\\s\\S]*?)<\\/${esc}>`, "i"),
	);
	return m ? m[1] : "";
}

function clean(s) {
	return String(s || "")
		.replace(/<!\[CDATA\[/g, "")
		.replace(/\]\]>/g, "")
		.trim();
}

function stripHtml(s) {
	return String(s || "").replace(/<[^>]+>/g, "");
}

function firstImg(html) {
	const m = String(html || "").match(/<img[^>]+src=["']([^"']+)["']/i);
	return m ? m[1] : "";
}

// <enclosure url="..">/<media:content url="..">/<media:thumbnail url=".."> の url 属性。
function mediaUrl(block) {
	const m = String(block || "").match(
		/<(?:enclosure|media:content|media:thumbnail)[^>]+url=["']([^"']+)["']/i,
	);
	return m ? m[1] : "";
}

function toIso(pubDate) {
	if (!pubDate) return "";
	const t = Date.parse(pubDate);
	return Number.isNaN(t) ? "" : new Date(t).toISOString();
}

function decode(s) {
	return String(s || "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&nbsp;/g, " ");
}

// 同一URL/同一タイトルを除去。先頭(=新着上位)を残す。
function dedupe(items) {
	const seenUrl = new Set();
	const seenTitle = new Set();
	const out = [];
	for (const it of items) {
		if (seenUrl.has(it.url)) continue;
		const key = it.title.trim().toLowerCase();
		if (key && seenTitle.has(key)) continue;
		seenUrl.add(it.url);
		if (key) seenTitle.add(key);
		out.push(it);
	}
	return out;
}

function parseFeeds(spec) {
	if (!spec || typeof spec !== "string") return null;
	const feeds = spec
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => {
			const i = s.indexOf("|");
			if (i < 0) return null;
			return { name: s.slice(0, i).trim(), url: s.slice(i + 1).trim() };
		})
		.filter((f) => f && f.url);
	return feeds.length ? feeds : null;
}
