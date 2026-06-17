// GET /api/news — GNews(lang=ja)のW杯ニュースを配信。
// NEWS_ENABLED ゲート＋KVキャッシュ30分＋障害隔離。OFF/失敗/空は items:[]（カルーセル非表示）。

import { fetchGnews } from "../_lib/gnews.js";
import { json } from "../_lib/http.js";

const CACHE_KEY = "news:gnews:ja:v1";
const CACHE_TTL_SEC = 1800; // 30分。無料プラン100req/日を遵守。

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
				const parsed = JSON.parse(cached);
				if (parsed && Array.isArray(parsed.items)) {
					return json(200, { enabled: true, items: parsed.items });
				}
			}
		}
		const items = await fetchGnews(env);
		if (kv && items.length > 0) {
			await kv.put(CACHE_KEY, JSON.stringify({ items }), {
				expirationTtl: CACHE_TTL_SEC,
			});
		}
		return json(200, { enabled: true, items });
	} catch (err) {
		console.error("GET /api/news failed:", err?.message);
		return json(200, { enabled: true, items: [] });
	}
}
