// 観戦プラットフォーム Cron Worker（P0 ④）
// 役割: SportMonks を中央で1回ポーリングし sm_* テーブルへ取り込む。
// Pages Functions には常駐 cron が無いため、本 Worker を別デプロイし Cron Trigger で駆動する。
// 既存(予想/部屋/config)とは別 Worker・別コードパス。同一 D1(wcup2026-db) の sm_* のみ触る。
//
// Cron(wrangler.toml):
//   "* * * * *"  毎分 → ライブ同期(livescores/latest。変化分のみ＝書き込み節約)
//   "0 3 * * *"  日次 → types マスタ更新
// Secret: SPORTMONKS_TOKEN（wrangler secret put で設定。コード/設定に直書きしない）

import {
	selectFixturesForDetailSync,
	syncFixtureDetail,
	syncLive,
	syncSeasonFixtures,
	syncTypes,
} from "../../functions/_lib/sm-sync.js";
import { createSportmonks } from "../../functions/_lib/sportmonks.js";

const FOOTBALL_BASE = "https://api.sportmonks.com/v3/football";
const CORE_BASE = "https://api.sportmonks.com/v3/core";
// W杯2026 本大会シーズン（検証済み）。日程/ブラケットの backfill 対象。
const SEASON_2026 = 26618;

function clients(env) {
	const token = env.SPORTMONKS_TOKEN;
	return {
		football: createSportmonks({ token, baseUrl: FOOTBALL_BASE }),
		core: createSportmonks({ token, baseUrl: CORE_BASE }),
	};
}

// epoch 秒（D1 の updated_at に使う）
function nowSec() {
	return Math.floor(Date.now() / 1000);
}

export default {
	// Cron Trigger エントリ。event.cron で発火スケジュールを判別。
	async scheduled(event, env, ctx) {
		if (!env.SPORTMONKS_TOKEN || !env.DB) {
			console.error("watch-cron: missing SPORTMONKS_TOKEN or DB binding");
			return;
		}
		const { football, core } = clients(env);
		const now = nowSec();
		if (event.cron === "0 3 * * *") {
			// 日次: types マスタ更新 ＋ 2026日程/ブラケットの backfill（抽選確定で venue/round が埋まる）
			const n = await syncTypes(core, env.DB, now);
			const s = await syncSeasonFixtures(football, env.DB, SEASON_2026, now);
			console.log(
				`watch-cron daily: types=${n} season=${s.count}${s.error ? " err=" + s.error : ""}`,
			);
		} else {
			const r = await syncLive(football, env.DB, now);
			console.log(
				`watch-cron: live synced=${r.count}${r.error ? " err=" + r.error : ""}`,
			);

			// 詳細同期: ライブ中＋直近終了の fixture に lineup/xGFixture を取り込む
			try {
				// ±36h 窓で候補 fixture を取得（W杯は重複なし前提で上限は十分）
				const windowSec = 36 * 60 * 60;
				const dbRows = await env.DB.prepare(
					"SELECT sm_fixture_id, state_id FROM sm_fixtures WHERE starting_at_ts BETWEEN ? AND ?",
				)
					.bind(now - windowSec, now + windowSec)
					.all();
				const candidates = selectFixturesForDetailSync(dbRows?.results ?? []);
				const DETAIL_CAP = 12;
				if (candidates.length > DETAIL_CAP) {
					console.log(
						`watch-cron: detail candidates capped ${candidates.length} → ${DETAIL_CAP}`,
					);
				}
				const toSync = candidates.slice(0, DETAIL_CAP);
				for (const row of toSync) {
					const dr = await syncFixtureDetail(
						football,
						env.DB,
						row.sm_fixture_id,
						now,
					);
					if (!dr.ok) {
						console.error(
							`watch-cron: detail sync failed fixture=${row.sm_fixture_id} err=${dr.error}`,
						);
					}
				}
				console.log(`watch-cron: detail synced=${toSync.length}`);
			} catch (e) {
				console.error("watch-cron: detail sync error", e?.message);
			}
		}
	},

	// 運用/バックフィル用の手動トリガ（HTTP）。
	//   /?action=types         types マスタ更新
	//   /?action=season[&id=N] season 日程/ブラケット backfill（既定=2026）
	//   /?action=fixture&id=N  fixture 1件の詳細取り込み
	//   /?action=live          ライブ同期を即時実行
	// 簡易ガード: ?key= が env.WATCH_CRON_KEY と一致する場合のみ実行。
	async fetch(request, env) {
		const url = new URL(request.url);
		const action = url.searchParams.get("action");
		if (!action) return new Response("watch-cron worker", { status: 200 });
		if (!env.SPORTMONKS_TOKEN || !env.DB) {
			return new Response("not configured", { status: 503 });
		}
		if (
			!env.WATCH_CRON_KEY ||
			url.searchParams.get("key") !== env.WATCH_CRON_KEY
		) {
			return new Response("forbidden", { status: 403 });
		}
		const { football, core } = clients(env);
		const now = nowSec();
		try {
			if (action === "types") {
				const n = await syncTypes(core, env.DB, now);
				return Response.json({ ok: true, types: n });
			}
			if (action === "live") {
				const r = await syncLive(football, env.DB, now);
				return Response.json({ ok: true, ...r });
			}
			if (action === "season") {
				const id = url.searchParams.get("id") || SEASON_2026;
				const r = await syncSeasonFixtures(football, env.DB, id, now);
				return Response.json({ ok: true, ...r });
			}
			if (action === "fixture") {
				const id = url.searchParams.get("id");
				if (!id) return new Response("missing id", { status: 400 });
				const r = await syncFixtureDetail(football, env.DB, id, now);
				return Response.json(r);
			}
			return new Response("unknown action", { status: 400 });
		} catch (e) {
			console.error("watch-cron fetch failed", e?.message);
			return new Response("error", { status: 500 });
		}
	},
};
