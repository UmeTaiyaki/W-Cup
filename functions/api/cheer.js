// GET/POST /api/cheer — 試合前 ご当地応援バトルの集計API。
// フィーチャーフラグ CHEER_ENABLED が 'true' のときのみ稼働（WATCH_ENABLED と同方針）。
// OFF時/未マイグレーション時/クエリ失敗時は空で返し、既存挙動に一切影響しない。

import {
	clampDelta,
	isSide,
	isStarted,
	parseFixtures,
	rowsToCounts,
} from "../_lib/cheer.js";
import { json } from "../_lib/http.js";

const GET_CACHE = "public, s-maxage=10, stale-while-revalidate=30";

function disabled() {
	return json(
		200,
		{ enabled: false, counts: {} },
		{ "cache-control": "public, s-maxage=60" },
	);
}

// GET /api/cheer?fixtures=<id,id,...> → { enabled, counts:{ "<fixtureId>":{home,away} } }
export async function onRequestGet(context) {
	const { env, request } = context;
	if (env.CHEER_ENABLED !== "true") return disabled();

	const url = new URL(request.url);
	const fixtures = parseFixtures(url.searchParams.get("fixtures") || "");
	if (!env.DB || fixtures.length === 0) {
		return json(
			200,
			{ enabled: true, counts: {} },
			{ "cache-control": GET_CACHE },
		);
	}

	try {
		const placeholders = fixtures.map(() => "?").join(",");
		const sql = `SELECT fixture_id, side, count FROM cheer_counts WHERE fixture_id IN (${placeholders})`;
		const res = await env.DB.prepare(sql)
			.bind(...fixtures)
			.all();
		const counts = rowsToCounts(res?.results || []);
		return json(200, { enabled: true, counts }, { "cache-control": GET_CACHE });
	} catch (err) {
		// cheer_counts 未作成や一時障害でも 200・空で返す（障害隔離）
		console.error("GET /api/cheer failed:", err?.message);
		return json(
			200,
			{ enabled: true, counts: {} },
			{ "cache-control": "public, s-maxage=10" },
		);
	}
}

// POST /api/cheer  body:{ fixtureId, side:"home"|"away", delta } → 加算後の {home,away}
export async function onRequestPost(context) {
	const { env, request } = context;
	if (env.CHEER_ENABLED !== "true") return disabled();

	let body;
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "invalid json" });
	}

	const fixtureId = Number(body?.fixtureId);
	const side = body?.side;
	if (!Number.isInteger(fixtureId) || fixtureId <= 0)
		return json(400, { error: "bad fixtureId" });
	if (!isSide(side)) return json(400, { error: "bad side" });
	const delta = clampDelta(body?.delta);

	if (!env.DB)
		return json(200, { enabled: true, counts: { home: 0, away: 0 } });

	try {
		// 開始済み（LIVE/FT）の試合には加算しない＝試合前限定の整合性を保つ。
		const fx = await env.DB.prepare(
			"SELECT state_id FROM sm_fixtures WHERE sm_fixture_id = ?",
		)
			.bind(fixtureId)
			.first();
		const started = fx ? isStarted(fx.state_id) : false;

		if (!started) {
			const now = new Date().toISOString();
			await env.DB.prepare(
				`INSERT INTO cheer_counts (fixture_id, side, count, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(fixture_id, side) DO UPDATE SET count = count + ?, updated_at = ?`,
			)
				.bind(fixtureId, side, delta, now, delta, now)
				.run();
		}

		const res = await env.DB.prepare(
			"SELECT fixture_id, side, count FROM cheer_counts WHERE fixture_id = ?",
		)
			.bind(fixtureId)
			.all();
		const counts = rowsToCounts(res?.results || [])[String(fixtureId)] || {
			home: 0,
			away: 0,
		};
		return json(200, { enabled: true, started, counts });
	} catch (err) {
		console.error("POST /api/cheer failed:", err?.message);
		return json(200, { enabled: true, counts: { home: 0, away: 0 } });
	}
}
