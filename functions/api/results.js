// GET /api/results — 大会結果の純導出配信（大会結果自動反映）
// フィーチャーフラグ WATCH_ENABLED が 'true' のときのみ sm_* から導出して返す。
// OFF時/未マイグレーション時/クエリ失敗時は enabled:false or null で返し、既存挙動に一切影響しない。
import { DEFAULT_CONFIG } from "../_lib/defaults.js";
import { json } from "../_lib/http.js";
import { listFixtures, listTopscorers } from "../_lib/sm-read.js";
import { deriveGroupMatches, deriveResult } from "../_lib/sm-results.js";

const SEASON_2026 = 26618;
// エッジキャッシュTTL(秒)。全利用者共通の導出データを Cloudflare エッジで配信し、
// リクエストごとの D1 読み取り＋導出を節約する（config.js と同じ Cache API 方式）。
// 反映遅延は最大このTTL。導出は読み取り専用なので明示的な破棄は不要（TTL失効で更新）。
const EDGE_TTL = 30;
// キャッシュキーは安定した正規URLで作る（クエリの揺れでキャッシュが分散しないように）。
const cacheKeyFor = (request) =>
	new Request(new URL("/api/results", request.url).toString(), {
		method: "GET",
	});

export async function onRequestGet(context) {
	const { env, request, waitUntil } = context;

	// フラグOFF → 機能無効を明示（既存画面は従来表示にフォールバック）
	if (env.WATCH_ENABLED !== "true")
		return json(200, { enabled: false, result: null, groupMatches: null });

	// D1 未バインド → 障害隔離（500にせず null で返す）
	if (!env.DB)
		return json(200, {
			enabled: true,
			result: null,
			groupMatches: null,
			note: "no-db",
		});

	// エッジキャッシュ命中なら D1 を読まず即返却（人数が増えても処理が集約される）。
	const cache = caches.default;
	const cacheKey = cacheKeyFor(request);
	const hit = await cache.match(cacheKey);
	if (hit) return hit;

	try {
		const groups = DEFAULT_CONFIG.groups;
		const fixtures = await listFixtures(env.DB, { limit: 200 });
		const topscorers = await listTopscorers(env.DB, SEASON_2026);
		const result = deriveResult(fixtures, topscorers, groups);
		const groupMatches = deriveGroupMatches(fixtures, groups);
		const resp = new Response(
			JSON.stringify({ enabled: true, result, groupMatches, updatedAt: null }),
			{
				status: 200,
				headers: {
					"content-type": "application/json; charset=utf-8",
					// ブラウザは都度検証、Cloudflareエッジでは EDGE_TTL 秒キャッシュ。
					"cache-control": `public, max-age=0, s-maxage=${EDGE_TTL}`,
				},
			},
		);
		// レスポンスをエッジキャッシュへ保存（応答はブロックしない）。
		if (waitUntil) waitUntil(cache.put(cacheKey, resp.clone()));
		return resp;
	} catch (e) {
		// sm_* 未作成や一時障害でも採点・既存画面に波及させない
		console.error("api/results failed", e?.message);
		return json(200, {
			enabled: true,
			result: null,
			groupMatches: null,
			note: "error",
		});
	}
}
