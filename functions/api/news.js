// GET /api/news — サッカー専門メディアのRSS記事を配信。
// KVのローリングプール(worker-watch のCronが15分ごとに更新)を読み、新着12件を返すだけ。
// NEWS_ENABLED ゲート＋障害隔離。OFF/失敗/空は items:[]（カルーセル非表示）。
// KVが空(Cron未稼働/初回)のときだけ直接RSS取得でフォールバック(書き込みはCron専任)。

import { json } from "../_lib/http.js";
import { fetchRssNews, NEWS_KV_KEY } from "../_lib/rss.js";

const DISPLAY_LIMIT = 12;

export async function onRequestGet(context) {
	const { env } = context;
	if (env.NEWS_ENABLED !== "true") {
		return json(200, { enabled: false, items: [] });
	}
	try {
		const kv = env.CONFIG;
		if (kv) {
			const raw = await kv.get(NEWS_KV_KEY);
			if (raw) {
				// 壊れたプール(部分書き込み等)は無視してフォールバック取得する。
				try {
					const parsed = JSON.parse(raw);
					if (parsed && Array.isArray(parsed.items)) {
						return json(200, {
							enabled: true,
							items: parsed.items.slice(0, DISPLAY_LIMIT),
						});
					}
				} catch (e) {
					console.warn("news pool parse failed, falling back:", e?.message);
				}
			}
		}
		// KV未充填(Cron未稼働/初回)時のみ直接取得。KVへは書かない(Cronが唯一の書き手)。
		const items = await fetchRssNews(env);
		return json(200, { enabled: true, items });
	} catch (err) {
		console.error("GET /api/news failed:", err?.message);
		return json(200, { enabled: true, items: [] });
	}
}
