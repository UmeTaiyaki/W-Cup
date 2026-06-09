// 取り込みオーケストレーション（観戦プラットフォーム P0 ④）
// client(SportMonks) と db(D1) を注入し、fixture/types/live を sm_* へ同期する。
// 副作用は runBatch に集約。各関数は障害隔離のため例外を投げず結果オブジェクトを返す。
import {
	fixtureDetailStatements,
	runBatch,
	seasonFixturesStatements,
	typeStatements,
} from "./sm-store.js";

// fixture 詳細の include。ラインナップ・xG を含む完全版（lineups/xGFixture を追加）。
export const FIXTURE_DETAIL_INCLUDE =
	"participants;scores;statistics;events;events.type;events.player;xGFixture;lineups;lineups.details;lineups.xglineup";
// livescores の軽量 include（書き込み節約）
export const LIVE_INCLUDE = "scores;participants;events";
// season スケジュール backfill の include（各 fixture にチームをネスト）
export const SEASON_FIXTURES_INCLUDE = "fixtures.participants";

// D1 batch の1回あたり文数。多すぎると上限に当たるため分割実行する。
const BATCH_CHUNK = 50;

async function runChunked(db, specs, chunkSize = BATCH_CHUNK) {
	for (let i = 0; i < specs.length; i += chunkSize) {
		await runBatch(db, specs.slice(i, i + chunkSize));
	}
}

// state_id: 2/3/6/9=インプレー、5/7/8=終了、1=未開始（メモリの確定値）
const INPLAY_STATES = new Set([2, 3, 6, 9]);
const FINISHED_STATES = new Set([5, 7, 8]);
export const isInPlay = (stateId) => INPLAY_STATES.has(stateId);
export const isFinished = (stateId) => FINISHED_STATES.has(stateId);

// ライブ中＋直近終了の fixture を詳細同期対象に選ぶ（純粋）
const LIVE_STATES = new Set([2, 3, 6, 9]);
const DONE_STATES = new Set([5, 7, 8]);
export function selectFixturesForDetailSync(rows) {
	const list = Array.isArray(rows) ? rows : [];
	return list.filter(
		(r) => LIVE_STATES.has(r?.state_id) || DONE_STATES.has(r?.state_id),
	);
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
