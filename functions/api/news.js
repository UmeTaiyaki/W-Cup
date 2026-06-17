// GET /api/news — サッカー専門メディアのRSS(複数)をマージして配信。
// NEWS_ENABLED ゲート＋KVキャッシュ30分＋障害隔離。OFF/失敗/空は items:[]（カルーセル非表示）。

import { json } from "../_lib/http.js";
import { fetchRssNews } from "../_lib/rss.js";

// rss-v1: GNews(専門メディア未インデックス)からRSS直接取得に切替。
const CACHE_KEY = "news:rss:ja:v1";
const CACHE_TTL_SEC = 1800; // 30分。RSSの外部取得回数とKV書込を抑える。
// 空結果(全フィード失敗等)は短TTLでキャッシュし、毎リクエストの再取得連打を防ぐ。
const EMPTY_TTL_SEC = 300; // 5分。

export async function onRequestGet(context) {
	const { env } = context;
	if (env.NEWS_ENABLED !== "true") {
		return json(200, { enabled: false, items: [] });
	}
	try {
		const kv = env.CONFIG;
		if (kv) {
			const cached = await kv.get(CACHE_KEY);
			if (cached) {
				// 壊れたキャッシュ(部分書き込み等)は無視してGNewsから再取得する。
				try {
					const parsed = JSON.parse(cached);
					if (parsed && Array.isArray(parsed.items)) {
						return json(200, { enabled: true, items: parsed.items });
					}
				} catch (e) {
					console.warn("news cache parse failed, refetching:", e?.message);
				}
			}
		}
		const items = await fetchRssNews(env);
		if (kv) {
			await kv.put(CACHE_KEY, JSON.stringify({ items }), {
				expirationTtl: items.length > 0 ? CACHE_TTL_SEC : EMPTY_TTL_SEC,
			});
		}
		return json(200, { enabled: true, items });
	} catch (err) {
		console.error("GET /api/news failed:", err?.message);
		return json(200, { enabled: true, items: [] });
	}
}
