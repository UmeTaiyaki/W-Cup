// GET /api/h2h — 試合前カードの H2H（過去対戦 通算W-D-L）配信API。
// フィーチャーフラグ H2H_ENABLED が 'true' のときのみ稼働（CHEER_ENABLED と同方針）。
// OFF時/未マイグレーション時/クエリ失敗時は空で返し、既存挙動に一切影響しない。

import { parseFixtures } from "../_lib/cheer.js";
import { json } from "../_lib/http.js";
import { rowsToH2H } from "../_lib/sm-h2h.js";

const GET_CACHE = "public, s-maxage=300, stale-while-revalidate=600";

function disabled() {
	return json(
		200,
		{ enabled: false, h2h: {} },
		{ "cache-control": "public, s-maxage=60" },
	);
}

// GET /api/h2h?fixtures=<id,id,...> → { enabled, h2h:{ "<fixtureId>":{home_code,away_code,home_wins,draws,away_wins,total} } }
export async function onRequestGet(context) {
	const { env, request } = context;
	if (env.H2H_ENABLED !== "true") return disabled();

	const url = new URL(request.url);
	const fixtures = parseFixtures(url.searchParams.get("fixtures") || "");
	if (!env.DB || fixtures.length === 0) {
		return json(
			200,
			{ enabled: true, h2h: {} },
			{ "cache-control": GET_CACHE },
		);
	}

	try {
		const placeholders = fixtures.map(() => "?").join(",");
		const sql = `SELECT fixture_id, home_code, away_code, home_wins, draws, away_wins, total
                 FROM sm_h2h WHERE fixture_id IN (${placeholders})`;
		const res = await env.DB.prepare(sql)
			.bind(...fixtures)
			.all();
		const h2h = rowsToH2H(res?.results || []);
		return json(200, { enabled: true, h2h }, { "cache-control": GET_CACHE });
	} catch (err) {
		// sm_h2h 未作成や一時障害でも 200・空で返す（障害隔離）
		console.error("GET /api/h2h failed:", err?.message);
		return json(
			200,
			{ enabled: true, h2h: {} },
			{ "cache-control": "public, s-maxage=10" },
		);
	}
}
