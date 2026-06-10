// GET /api/player?id=<player_id> — 選手プロフィール(キャリア/シーズン統計)配信。
// WATCH_ENABLED ゲート＋障害隔離。SportMonks /players/{id} をプロキシ＋エッジキャッシュ。
import { json } from "../_lib/http.js";
import { normalizePlayer } from "../_lib/sm-player.js";
import { createSportmonks } from "../_lib/sportmonks.js";

const PLAYER_INCLUDE =
	"metadata;position;detailedPosition;nationality;teams.team;statistics.details;statistics.season";

export async function onRequestGet(context) {
	const { env, request } = context;
	if (env.WATCH_ENABLED !== "true") {
		return json(
			200,
			{ enabled: false, profile: null, seasons: [] },
			{ "cache-control": "public, s-maxage=60" },
		);
	}
	const id = Number(new URL(request.url).searchParams.get("id"));
	if (!Number.isInteger(id) || id <= 0) {
		return json(400, {
			enabled: true,
			profile: null,
			seasons: [],
			error: "invalid id",
		});
	}
	if (!env.SPORTMONKS_TOKEN) {
		return json(200, {
			enabled: true,
			profile: null,
			seasons: [],
			note: "no-token",
		});
	}
	try {
		const sm = createSportmonks({
			token: env.SPORTMONKS_TOKEN,
			fetchImpl: env.__fetchImpl,
		});
		const body = await sm.get(`players/${id}`, { include: PLAYER_INCLUDE });
		const { profile, seasons } = normalizePlayer(body?.data);
		return json(
			200,
			{ enabled: true, profile, seasons },
			{
				"cache-control": "public, s-maxage=21600, stale-while-revalidate=86400",
			},
		);
	} catch (err) {
		console.error("GET /api/player failed:", err?.message);
		return json(200, {
			enabled: true,
			profile: null,
			seasons: [],
			note: "unavailable",
		});
	}
}
