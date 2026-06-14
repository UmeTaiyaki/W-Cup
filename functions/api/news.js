// GET /api/news — ホーム用 W杯ニュース配信。NEWS_ENABLED ゲート＋障害隔離。
//  - 一覧: news/{pre,post}-match/seasons/{seasonId} を統合＋タイトル日本語訳。
//  - 本文(?id=&type=): fixture include で lines＋得点者写真＋venue＋スコアを1コール取得し日本語訳。
//  - 翻訳は既存 GCP サービスアカウント(GCP_SERVICE_ACCOUNT)を流用し Vertex AI へ(grounding 無し)。

import { mintGcpAccessToken } from "../_lib/gcp-auth.js";
import { json } from "../_lib/http.js";
import {
	joinLines,
	mergeNewsList,
	newsBodyInclude,
	pickHero,
	translationCacheKey,
} from "../_lib/sm-news.js";
import { translateToJa } from "../_lib/sm-news-i18n.js";
import { createSportmonks } from "../_lib/sportmonks.js";

const LIST_CACHE = "public, s-maxage=1800, stale-while-revalidate=3600";
const BODY_CACHE = "public, s-maxage=21600, stale-while-revalidate=86400";
// カルーセルに出す最大件数。一覧の翻訳は cold-start でこの件数まで並列実行される。
const NEWS_LIST_MAX = 15;

function newsByType(fixture, type) {
	const arr =
		type === "prematch" ? fixture?.prematchnews : fixture?.postmatchnews;
	return Array.isArray(arr) ? arr[0] : null;
}

// GCP_SERVICE_ACCOUNT からトークンを1回発行し vertex 設定を返す。未設定/失敗は null(英語フォールバック)。
async function buildVertex(env) {
	const raw = env.GCP_SERVICE_ACCOUNT;
	if (!raw) return null;
	let sa;
	try {
		sa = JSON.parse(raw);
	} catch {
		console.error("/api/news: GCP_SERVICE_ACCOUNT invalid JSON");
		return null;
	}
	// トークン発行の注入シーム（既存 env.__fetchImpl と同パターン。テストで差し替え）。
	const mint = env.__mintToken || mintGcpAccessToken;
	try {
		const { token } = await mint({
			clientEmail: sa.client_email,
			privateKey: sa.private_key,
			fetchImpl: env.__fetchImpl,
		});
		return {
			accessToken: token,
			project: env.GCP_PROJECT || sa.project_id,
			location: env.GCP_LOCATION || "global",
			model: env.NEWS_TRANSLATE_MODEL || undefined,
			fetchImpl: env.__fetchImpl,
		};
	} catch (e) {
		console.error("/api/news: token mint failed", e?.message);
		return null;
	}
}

export async function onRequestGet(context) {
	const { env, request } = context;
	if (env.NEWS_ENABLED !== "true") {
		return json(
			200,
			{ enabled: false, items: [] },
			{ "cache-control": "public, s-maxage=60" },
		);
	}
	if (!env.SPORTMONKS_TOKEN) {
		return json(200, { enabled: true, items: [], note: "no-token" });
	}
	const url = new URL(request.url);
	const idParam = url.searchParams.get("id");
	const seasonId = env.WC_SEASON_ID || "26618";
	const kv = env.CONFIG || null;
	const sm = createSportmonks({
		token: env.SPORTMONKS_TOKEN,
		fetchImpl: env.__fetchImpl,
	});

	// ── 本文モード ──
	if (idParam != null) {
		const id = Number(idParam);
		const type =
			url.searchParams.get("type") === "prematch" ? "prematch" : "postmatch";
		if (!Number.isInteger(id) || id <= 0) {
			return json(400, { enabled: true, body: null, error: "invalid id" });
		}
		try {
			const [res, vertex] = await Promise.all([
				sm.get(`fixtures/${id}`, { include: newsBodyInclude(type) }),
				buildVertex(env),
			]);
			const fx = res?.data;
			const item = newsByType(fx, type);
			const titleEn = item?.title || "";
			const bodyEn = joinLines(item?.lines);
			const [titleJa, bodyJa] = await Promise.all([
				translateToJa(titleEn, {
					kv,
					cacheKey: translationCacheKey(item?.id, "title"),
					vertex,
				}),
				translateToJa(bodyEn, {
					kv,
					cacheKey: translationCacheKey(item?.id, "body"),
					vertex,
				}),
			]);
			return json(
				200,
				{
					enabled: true,
					body: {
						title_ja: titleJa,
						body_ja: bodyJa,
						hero: pickHero(fx),
						scoreline: fx?.result_info || "",
					},
				},
				{ "cache-control": BODY_CACHE },
			);
		} catch (err) {
			console.error("GET /api/news body failed:", err?.message);
			return json(200, { enabled: true, body: null, note: "unavailable" });
		}
	}

	// ── 一覧モード ──
	try {
		const [preRes, postRes, vertex] = await Promise.all([
			sm.get(`news/pre-match/seasons/${seasonId}`),
			sm.get(`news/post-match/seasons/${seasonId}`),
			buildVertex(env),
		]);
		// カルーセル表示分だけに制限（cold-start で大量の翻訳並列呼び出しを防ぐ）。
		const merged = mergeNewsList(preRes?.data, postRes?.data).slice(
			0,
			NEWS_LIST_MAX,
		);
		const items = await Promise.all(
			merged.map(async (it) => ({
				...it,
				title_ja: await translateToJa(it.title_en, {
					kv,
					cacheKey: translationCacheKey(it.newsitem_id, "title"),
					vertex,
				}),
			})),
		);
		return json(200, { enabled: true, items }, { "cache-control": LIST_CACHE });
	} catch (err) {
		console.error("GET /api/news list failed:", err?.message);
		return json(200, { enabled: true, items: [], note: "unavailable" });
	}
}
