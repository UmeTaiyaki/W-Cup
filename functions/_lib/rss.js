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
const MERGED_LIMIT = 12; // カルーセル表示上限。

// W杯2026の記事だけを残す判定語(title/description/category のいずれかに含む)。
const WC_RE = /ワールドカップ|W杯|北中米/i;
// 速報スタブ(中身が無く逐次更新される枠)を弾く。タイトルで判定。
const STUB_RE = /試合記録|試合経過|スタメン発表|スタメン|試合結果速報/;

// W杯2026以外(Jリーグ等)とスタブ記事を除外する。
export function filterWorldCup(items) {
	return items.filter((it) => {
		if (STUB_RE.test(it.title)) return false;
		const hay = `${it.title} ${it.description} ${(it.categories || []).join(" ")}`;
		return WC_RE.test(hay);
	});
}

export async function fetchRssNews(env) {
	const feeds = parseFeeds(env.NEWS_RSS_FEEDS) || DEFAULT_FEEDS;
	const fetchImpl = env.__fetchImpl || fetch;
	// 各フィードは別ドメイン(共有レート制限なし)なので並列取得でよい。
	const results = await Promise.all(
		feeds.map((f) => fetchOneFeed(fetchImpl, f)),
	);
	const all = filterWorldCup(results.flat());
	// 新着順(ISO文字列は辞書順=時系列順)。publishedAt 空は末尾へ。
	all.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
	// categories は判定用の内部フィールドなので出力から落とす。
	return dedupe(all)
		.slice(0, MERGED_LIMIT)
		.map(({ categories, ...rest }) => rest);
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
