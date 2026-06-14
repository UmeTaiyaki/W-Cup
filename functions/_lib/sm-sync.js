// 取り込みオーケストレーション（観戦プラットフォーム P0 ④）
// client(SportMonks) と db(D1) を注入し、fixture/types/live を sm_* へ同期する。
// 副作用は runBatch に集約。各関数は障害隔離のため例外を投げず結果オブジェクトを返す。
import { toTopscorerRows } from "./sm-ingest.js";
import {
	fixtureDetailStatements,
	fixtureSeriesStatements,
	runBatch,
	seasonFixturesStatements,
	topscorersStatements,
	typeStatements,
} from "./sm-store.js";

// fixture 時系列データの include（pressure/trends/periods）
export const FIXTURE_SERIES_INCLUDE = "pressure;trends;periods.statistics";

// fixture 詳細の include。ラインナップ・xG を含む完全版（lineups/xGFixture を追加）。
// periods: 進行中ピリオドの経過分(minutes/time_added)取得用。
export const FIXTURE_DETAIL_INCLUDE =
	"participants;scores;statistics;events;events.type;events.player;xGFixture;lineups;lineups.details;lineups.xglineup;lineups.player;lineups.player.nationality;lineups.player.teams;periods";
// livescores の軽量 include（書き込み節約）。periods=経過分表示用。
export const LIVE_INCLUDE = "scores;participants;events;periods";
// season スケジュール backfill の include（各 fixture にチームをネスト）
export const SEASON_FIXTURES_INCLUDE = "fixtures.participants;fixtures.stage";

// D1 batch の1回あたり文数。多すぎると上限に当たるため分割実行する。
const BATCH_CHUNK = 50;

async function runChunked(db, specs, chunkSize = BATCH_CHUNK) {
	for (let i = 0; i < specs.length; i += chunkSize) {
		await runBatch(db, specs.slice(i, i + chunkSize));
	}
}

// state_id（SportMonks確定値）:
//   在プレー: 2=前半 / 6=延長 / 9=PK / 22=後半
//   試合中の中断: 3=HT / 4=延長待ち / 21=延長中断 / 25=PK前
//   終了: 5=FT / 7=AET / 8=PK後 ／ 未開始: 1=NS
// ※ 22(後半)が抜けると後半開始でライブ判定が外れる（実害バグ）。
const INPLAY_STATES = new Set([2, 3, 4, 6, 9, 21, 22, 25]);
const FINISHED_STATES = new Set([5, 7, 8]);
export const isInPlay = (stateId) => INPLAY_STATES.has(stateId);
export const isFinished = (stateId) => FINISHED_STATES.has(stateId);

// 未開始でもキックオフ直前の試合はスタメン先行取得の対象にする窓（秒）
export const PREMATCH_LINEUP_WINDOW_SEC = 90 * 60;

// 詳細同期の優先度（小さいほど優先）: インプレー → もうすぐ開始 → 終了
function detailSyncPriority(r, now) {
	if (isInPlay(r?.state_id)) return 0;
	const ts = r?.starting_at_ts;
	if (r?.state_id === 1 && ts != null && ts > now) return 1;
	return 2; // 終了
}

// ライブ中＋直近終了＋キックオフ90分以内の未開始 を詳細同期対象に選ぶ（純粋）
// DETAIL_CAP で切られても開幕直前が落ちないよう優先度順に並べて返す。
export function selectFixturesForDetailSync(rows, now) {
	const list = Array.isArray(rows) ? rows : [];
	return list
		.filter((r) => {
			if (isInPlay(r?.state_id) || isFinished(r?.state_id)) return true;
			// 未開始(state_id=1)だがキックオフまで PREMATCH_LINEUP_WINDOW_SEC 以内
			const ts = r?.starting_at_ts;
			return ts != null && ts > now && ts - now <= PREMATCH_LINEUP_WINDOW_SEC;
		})
		.sort((a, b) => detailSyncPriority(a, now) - detailSyncPriority(b, now));
}

// 毎分 cron のうち intervalMin 分に1回だけ true を返す（重い同期の間引き用・純粋）。
// now=epoch秒。UTC分境界で判定（例 interval=3 → 0,3,6...分で実行）。
// interval<=1 や不正値は true＝間引かない（書き込みを止めない安全側にフォールバック）。
export function shouldRunInterval(now, intervalMin) {
	if (
		!Number.isFinite(now) ||
		!Number.isFinite(intervalMin) ||
		intervalMin <= 1
	)
		return true;
	return Math.floor(now / 60) % intervalMin === 0;
}

// core/types を全ページ辿って sm_types へ。戻り値は upsert 件数。
export async function syncTypes(coreClient, db, now, { maxPages = 60 } = {}) {
	let count = 0;
	for (let page = 1; page <= maxPages; page++) {
		let body;
		try {
			body = await coreClient.get("types", { params: { page } });
		} catch (e) {
			console.error("syncTypes: page fetch failed", page, e?.message);
			break;
		}
		const types = Array.isArray(body?.data) ? body.data : [];
		if (types.length) {
			await runBatch(db, typeStatements(types, now));
			count += types.length;
		}
		if (!body?.pagination?.has_more) break;
	}
	return count;
}

// season の全fixture（日程＋チーム）を取得して backfill。開幕前スケジュール用。
// scores/events/stats は試合開始後に live/detail 同期で埋まる。
export async function syncSeasonFixtures(footballClient, db, seasonId, now) {
	let body;
	try {
		body = await footballClient.get(`seasons/${seasonId}`, {
			include: SEASON_FIXTURES_INCLUDE,
		});
	} catch (e) {
		console.error("syncSeasonFixtures: fetch failed", seasonId, e?.message);
		return { count: 0, error: e?.message };
	}
	const fixtures = Array.isArray(body?.data?.fixtures)
		? body.data.fixtures
		: [];
	if (!fixtures.length) return { count: 0 };
	const specs = seasonFixturesStatements(fixtures, now);
	try {
		await runChunked(db, specs);
		return { count: fixtures.length, statements: specs.length };
	} catch (e) {
		console.error("syncSeasonFixtures: upsert failed", e?.message);
		return { count: 0, error: e?.message };
	}
}

// fixture 1件の詳細を取得して sm_* へ upsert。
export async function syncFixtureDetail(footballClient, db, fixtureId, now) {
	let body;
	try {
		body = await footballClient.get(`fixtures/${fixtureId}`, {
			include: FIXTURE_DETAIL_INCLUDE,
		});
	} catch (e) {
		console.error("syncFixtureDetail: fetch failed", fixtureId, e?.message);
		return { ok: false, error: e?.message };
	}
	const detail = body?.data;
	if (!detail) return { ok: false, error: "no data" };
	try {
		await runBatch(db, fixtureDetailStatements(detail, now));
		return { ok: true, fixtureId };
	} catch (e) {
		console.error("syncFixtureDetail: upsert failed", fixtureId, e?.message);
		return { ok: false, error: e?.message };
	}
}

// season topscorers を取得し sm_topscorers へ upsert。得点王導出の元データ。
export async function syncTopscorers(footballClient, db, seasonId, now) {
	let body;
	try {
		body = await footballClient.get(`seasons/${seasonId}/topscorers`, {
			include: "player;participant",
		});
	} catch (e) {
		console.error("syncTopscorers: fetch failed", seasonId, e?.message);
		return { count: 0, error: e?.message };
	}
	const rows = toTopscorerRows(body, seasonId);
	if (!rows.length) return { count: 0 };
	try {
		await runChunked(db, topscorersStatements(rows, now));
		return { count: rows.length };
	} catch (e) {
		console.error("syncTopscorers: upsert failed", e?.message);
		return { count: 0, error: e?.message };
	}
}

// fixture 1件の時系列データを取得して sm_fixture_series へ upsert。FT試合に対し一度だけ呼ぶ想定。
export async function syncFixtureSeries(footballClient, db, fixtureId, now) {
	let body;
	try {
		body = await footballClient.get(`fixtures/${fixtureId}`, {
			include: FIXTURE_SERIES_INCLUDE,
		});
	} catch (e) {
		console.error("syncFixtureSeries: fetch failed", fixtureId, e?.message);
		return { ok: false, error: e?.message };
	}
	const detail = body?.data;
	if (!detail) return { ok: false, error: "no data" };
	try {
		await runBatch(db, fixtureSeriesStatements(detail, now));
		return { ok: true, fixtureId };
	} catch (e) {
		console.error("syncFixtureSeries: upsert failed", fixtureId, e?.message);
		return { ok: false, error: e?.message };
	}
}

// livescores/latest を取得し、返ってきた各 fixture を1バッチで upsert。
// /latest は直近で変化した試合のみ返す＝書き込みが変化分に限定される。
export async function syncLive(footballClient, db, now) {
	let body;
	try {
		body = await footballClient.get("livescores/latest", {
			include: LIVE_INCLUDE,
		});
	} catch (e) {
		console.error("syncLive: fetch failed", e?.message);
		return { count: 0, error: e?.message };
	}
	const fixtures = Array.isArray(body?.data) ? body.data : [];
	if (!fixtures.length) return { count: 0 };
	const specs = fixtures.flatMap((fx) => fixtureDetailStatements(fx, now));
	try {
		await runBatch(db, specs);
		return { count: fixtures.length };
	} catch (e) {
		console.error("syncLive: upsert failed", e?.message);
		return { count: 0, error: e?.message };
	}
}
