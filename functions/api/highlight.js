// /api/highlight — 試合ハイライト動画の手動登録/削除（管理者用・Phase1）
// POST   { fixtureId, url }  → source='manual' 行を upsert（confidence=1.0）
// DELETE { fixtureId }       → source='manual' 行を削除（自動取得の dazn/fifa 行は残す）
// 認証は config.js と同じセッショントークン（Authorization: Bearer）で行う。
// WATCH_ENABLED ゲート＋障害隔離。生パスワードは使わない。
import { verifySession } from "../_lib/admin-auth.js";
import { json } from "../_lib/http.js";
import { createRateLimiter } from "../_lib/ratelimit.js";
import { parseYoutubeId } from "../_lib/youtube-url.js";

// 管理操作のソフトレート制限（正規操作は低頻度なので絞ってよい）。
const limiter = createRateLimiter({ capacity: 20, refillPerSec: 0.2 });
const clientIp = (request) => request.headers.get("CF-Connecting-IP") || "anon";

// 共通: 認証＋環境チェック。NG なら Response、OK なら null を返す。
async function guard(context) {
	const { env, request } = context;
	if (env.WATCH_ENABLED !== "true") {
		return json(404, { error: "機能が無効です" });
	}
	if (!env.DB) {
		return json(503, { error: "DB が利用できません" });
	}
	if (!limiter(clientIp(request))) {
		return json(429, {
			error: "操作が多すぎます。少し待って再度お試しください",
		});
	}
	const auth = request.headers.get("authorization") || "";
	const token = auth.replace(/^Bearer\s+/i, "");
	if (!(await verifySession(env.CONFIG, token))) {
		return json(401, { error: "認証が必要です。再度ログインしてください" });
	}
	return null;
}

// fixtureId を正の整数として取り出す（不正は null）。
function parseFixtureId(value) {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export async function onRequestPost(context) {
	const denied = await guard(context);
	if (denied) return denied;
	const { env, request } = context;

	let input;
	try {
		input = await request.json();
	} catch (e) {
		console.error("POST /api/highlight: invalid json", e?.message);
		return json(400, { error: "JSON が不正です" });
	}

	const fixtureId = parseFixtureId(input?.fixtureId);
	if (fixtureId == null) {
		return json(400, { error: "fixtureId が不正です" });
	}
	const videoId = parseYoutubeId(input?.url);
	if (!videoId) {
		return json(400, { error: "YouTube の URL または動画 ID が不正です" });
	}

	// 対象 fixture の存在を軽く検証（誤 ID への登録を防ぐ）。
	try {
		const fx = await env.DB.prepare(
			"SELECT sm_fixture_id FROM sm_fixtures WHERE sm_fixture_id = ?",
		)
			.bind(fixtureId)
			.all();
		if (!(Array.isArray(fx?.results) ? fx.results : []).length) {
			return json(404, { error: "該当する試合が見つかりません" });
		}
	} catch (e) {
		console.error("POST /api/highlight: fixture check failed", e?.message);
		return json(500, { error: "保存に失敗しました" });
	}

	const now = Math.floor(Date.now() / 1000);
	const title =
		typeof input?.title === "string" ? input.title.slice(0, 300) : null;
	try {
		await env.DB.prepare(
			`INSERT INTO sm_highlights
         (sm_fixture_id, source, video_id, title, channel_id, confidence, published_at, attempts, updated_at)
       VALUES (?, 'manual', ?, ?, NULL, 1.0, NULL, 0, ?)
       ON CONFLICT(sm_fixture_id, source) DO UPDATE SET
         video_id = excluded.video_id,
         title = excluded.title,
         confidence = 1.0,
         updated_at = excluded.updated_at`,
		)
			.bind(fixtureId, videoId, title, now)
			.run();
	} catch (e) {
		console.error("POST /api/highlight: upsert failed", e?.message);
		return json(500, { error: "保存に失敗しました" });
	}

	return json(200, { ok: true, fixtureId, videoId });
}

export async function onRequestDelete(context) {
	const denied = await guard(context);
	if (denied) return denied;
	const { env, request } = context;

	let input;
	try {
		input = await request.json();
	} catch (e) {
		console.error("DELETE /api/highlight: invalid json", e?.message);
		return json(400, { error: "JSON が不正です" });
	}
	const fixtureId = parseFixtureId(input?.fixtureId);
	if (fixtureId == null) {
		return json(400, { error: "fixtureId が不正です" });
	}

	try {
		await env.DB.prepare(
			"DELETE FROM sm_highlights WHERE sm_fixture_id = ? AND source = 'manual'",
		)
			.bind(fixtureId)
			.run();
	} catch (e) {
		console.error("DELETE /api/highlight: delete failed", e?.message);
		return json(500, { error: "削除に失敗しました" });
	}

	return json(200, { ok: true, fixtureId });
}
