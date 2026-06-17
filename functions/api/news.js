// GET /api/news — GNews(lang=ja)のW杯ニュースを配信。
// NEWS_ENABLED ゲート＋KVキャッシュ30分＋障害隔離。OFF/失敗/空は items:[]（カルーセル非表示）。

import { fetchGnews } from "../_lib/gnews.js";
import { json } from "../_lib/http.js";

const CACHE_KEY = "news:gnews:ja:v1";
const CACHE_TTL_SEC = 1800; // 30分。無料プラン100req/日を遵守。
// 空結果(0件/429/401等で fetchGnews が []) も短TTLでキャッシュし、
// 失敗時に毎リクエストGNewsを叩いて無料枠を使い切る「呼び出しの嵐」を防ぐ。
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
		const items = await fetchGnews(env);
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
