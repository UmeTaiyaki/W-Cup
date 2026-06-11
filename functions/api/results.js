// GET /api/results — 大会結果の純導出配信（大会結果自動反映）
// フィーチャーフラグ WATCH_ENABLED が 'true' のときのみ sm_* から導出して返す。
// OFF時/未マイグレーション時/クエリ失敗時は enabled:false or null で返し、既存挙動に一切影響しない。
import { DEFAULT_CONFIG } from "../_lib/defaults.js";
import { json } from "../_lib/http.js";
import { listFixtures, listTopscorers } from "../_lib/sm-read.js";
import { deriveGroupMatches, deriveResult } from "../_lib/sm-results.js";

const SEASON_2026 = 26618;

export async function onRequestGet(context) {
	const { env } = context;

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

	try {
		const groups = DEFAULT_CONFIG.groups;
		const fixtures = await listFixtures(env.DB, { limit: 200 });
		const topscorers = await listTopscorers(env.DB, SEASON_2026);
		const result = deriveResult(fixtures, topscorers, groups);
		const groupMatches = deriveGroupMatches(fixtures, groups);
		return json(
			200,
			{ enabled: true, result, groupMatches, updatedAt: null },
			{ "cache-control": "public, s-maxage=30, stale-while-revalidate=60" },
		);
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
