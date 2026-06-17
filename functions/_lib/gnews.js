// GNews v4/search を叩いてW杯ニュースを正規化する。
// 失敗・APIキー欠如・空はすべて [] を返し、呼び出し側で縮退させる。
const GNEWS_ENDPOINT = "https://gnews.io/api/v4/search";
const DEFAULT_QUERY = '"ワールドカップ" OR "W杯"';
const MAX_ARTICLES = 10;

export async function fetchGnews(env) {
	const apikey = env.GNEWS_API_KEY;
	if (!apikey) return [];
	const fetchImpl = env.__fetchImpl || fetch;
	const url = new URL(GNEWS_ENDPOINT);
	url.searchParams.set("q", env.GNEWS_QUERY || DEFAULT_QUERY);
	url.searchParams.set("lang", env.GNEWS_LANG || "ja");
	url.searchParams.set("sortby", "publishedAt");
	url.searchParams.set("max", String(MAX_ARTICLES));
	url.searchParams.set("apikey", apikey);

	const res = await fetchImpl(url.toString());
	if (!res.ok) return [];
	const data = await res.json();
	const articles = Array.isArray(data?.articles) ? data.articles : [];
	return dedupeByTitle(articles.map(normalizeArticle).filter(Boolean));
}

// 同一記事が複数の配信元(シンジケート)で重複するため、タイトルで重複排除する。
// 先頭(=新着/関連度上位)を残す。タイトル空はキー化できないので常に残す。
function dedupeByTitle(items) {
	const seen = new Set();
	const out = [];
	for (const it of items) {
		const key = it.title.trim().toLowerCase();
		if (key && seen.has(key)) continue;
		if (key) seen.add(key);
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
