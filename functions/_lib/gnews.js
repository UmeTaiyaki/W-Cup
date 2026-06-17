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
	return articles.map(normalizeArticle).filter(Boolean);
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
