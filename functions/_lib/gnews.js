// GNews v4/search を叩いてW杯ニュースを正規化する。
// 「一般枠」と「海外枠(日本中心語をNOT除外)」の2クエリを交互マージし、
// 日本関連に偏らせず海外ニュースも必ず混ぜる。
// 失敗・APIキー欠如・空はすべて [] を返し、呼び出し側で縮退させる。
const GNEWS_ENDPOINT = "https://gnews.io/api/v4/search";
const DEFAULT_QUERY = '"ワールドカップ" OR "W杯"';
// 海外枠: 各国「〇〇代表」の引用句OR。GNews無料プランは AND/NOT/括弧が効かず(実測0件)、
// 引用句のORのみ有効なため、サッカー特化で非日本のW杯記事が取れるこの形にする。
const DEFAULT_INTL_QUERY =
	'"ブラジル代表" OR "アルゼンチン代表" OR "フランス代表" OR "ドイツ代表" OR "スペイン代表" OR "イングランド代表" OR "ポルトガル代表" OR "オランダ代表" OR "イタリア代表" OR "アメリカ代表"';
const MAX_ARTICLES = 10;
const MERGED_LIMIT = 12; // カルーセル表示上限。
const REQUEST_GAP_MS = 1200; // GNews無料プランのバースト制限回避用の2クエリ間インターバル。

export async function fetchGnews(env) {
	const apikey = env.GNEWS_API_KEY;
	if (!apikey) return [];
	const fetchImpl = env.__fetchImpl || fetch;
	const generalQuery = env.GNEWS_QUERY || DEFAULT_QUERY;
	const intlQuery = env.GNEWS_QUERY_INTL || DEFAULT_INTL_QUERY;

	// GNews無料プランは2リクエストを同時/連続で叩くと429(バースト制限)になるため、
	// 一般枠→海外枠を逐次＋インターバルで叩く。テスト(__fetchImpl注入)では待たない。
	const general = await fetchOneQuery(env, apikey, fetchImpl, generalQuery);
	if (!env.__fetchImpl) await sleep(REQUEST_GAP_MS);
	const intl = await fetchOneQuery(env, apikey, fetchImpl, intlQuery);

	// 一般枠と海外枠を交互にマージ → タイトル重複排除 → 表示上限で打ち切り。
	return dedupeByTitle(interleave(general, intl)).slice(0, MERGED_LIMIT);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOneQuery(env, apikey, fetchImpl, query) {
	const url = new URL(GNEWS_ENDPOINT);
	url.searchParams.set("q", query);
	url.searchParams.set("lang", env.GNEWS_LANG || "ja");
	url.searchParams.set("sortby", "publishedAt");
	url.searchParams.set("max", String(MAX_ARTICLES));
	url.searchParams.set("apikey", apikey);

	const res = await fetchImpl(url.toString());
	if (!res.ok) return [];
	const data = await res.json();
	const articles = Array.isArray(data?.articles) ? data.articles : [];
	return articles.map(normalizeArticle).filter(Boolean);
}

// 2配列を先頭から交互に取り出す（[a0, b0, a1, b1, ...]）。長さが違っても残りを連結。
function interleave(a, b) {
	const out = [];
	const n = Math.max(a.length, b.length);
	for (let i = 0; i < n; i++) {
		if (i < a.length) out.push(a[i]);
		if (i < b.length) out.push(b[i]);
	}
	return out;
}

// 重複排除。先頭(=新着/関連度上位)を残す。
//  - 同一URL: 一般枠と海外枠が同じ記事を返した時の重複を除去。
//  - 同一タイトル: 複数の配信元(シンジケート)の重複を除去。タイトル空はURLのみで判定。
function dedupeByTitle(items) {
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

function normalizeArticle(a) {
	if (!a || typeof a.url !== "string" || !a.url) return null;
	return {
		id: a.url,
		title: typeof a.title === "string" ? a.title : "",
		description: typeof a.description === "string" ? a.description : "",
		url: a.url,
		image: typeof a.image === "string" ? a.image : "",
		source: a.source && typeof a.source.name === "string" ? a.source.name : "",
		publishedAt: typeof a.publishedAt === "string" ? a.publishedAt : "",
	};
}
