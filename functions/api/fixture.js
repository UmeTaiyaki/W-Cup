// GET /api/fixture?id=<sm_fixture_id> — 1試合の詳細配信（観戦プラットフォーム P2）
// WATCH_ENABLED ゲート＋障害隔離: OFF/未マイグレーション/失敗時も既存挙動に波及しない。
import { json } from "../_lib/http.js";
import { getFixtureDetail } from "../_lib/sm-read.js";

export async function onRequestGet(context) {
	const { env, request } = context;

	if (env.WATCH_ENABLED !== "true") {
		return json(
			200,
			{ enabled: false, detail: null },
			{ "cache-control": "public, s-maxage=60" },
		);
	}

	const id = Number(new URL(request.url).searchParams.get("id"));
	if (!Number.isFinite(id) || id <= 0) {
		return json(400, { enabled: true, detail: null, error: "invalid id" });
	}

	if (!env.DB) {
		return json(200, { enabled: true, detail: null, note: "no-db" });
	}

	try {
		const detail = await getFixtureDetail(env.DB, id);
		// ハイライト機能は独立フラグでゲート。OFF時はデータがあっても highlight を出さない（安全なロールアウト）。
		if (detail && env.HIGHLIGHTS_ENABLED !== "true") {
			detail.highlight = null;
		}
		return json(
			200,
			{ enabled: true, detail },
			{
				"cache-control": "public, s-maxage=15, stale-while-revalidate=60",
			},
		);
	} catch (err) {
		console.error("GET /api/fixture failed:", err?.message);
		return json(200, { enabled: true, detail: null, note: "unavailable" });
	}
}
