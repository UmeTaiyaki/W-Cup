// GET /api/live — 観戦データ配信（観戦プラットフォーム P0 ⑤）
// フィーチャーフラグ WATCH_ENABLED が 'true' のときのみ sm_* を返す。
// OFF時/未マイグレーション時/クエリ失敗時は enabled:false or 空で返し、既存挙動に一切影響しない。
import { json } from "../_lib/http.js";
import { listFixtures } from "../_lib/sm-read.js";

export async function onRequestGet(context) {
	const { env } = context;

	// フラグOFF → 機能無効を明示（既存画面はこの値を見て従来表示にフォールバック）
	if (env.WATCH_ENABLED !== "true") {
		return json(
			200,
			{ enabled: false, fixtures: [] },
			{ "cache-control": "public, s-maxage=60" },
		);
	}

	// D1 未バインド → 障害隔離（500にせず空で返す）
	if (!env.DB) {
		return json(200, { enabled: true, fixtures: [], note: "no-db" });
	}

	try {
		const fixtures = await listFixtures(env.DB, {
			limit: 120,
			withEvents: true,
		});
		return json(
			200,
			{ enabled: true, fixtures },
			{
				"cache-control": "public, s-maxage=30, stale-while-revalidate=60",
			},
		);
	} catch (err) {
		// sm_* 未作成や一時障害でも観戦以外に波及させない
		console.error("GET /api/live failed:", err?.message);
		return json(200, { enabled: true, fixtures: [], note: "unavailable" });
	}
}
