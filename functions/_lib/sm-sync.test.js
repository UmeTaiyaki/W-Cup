import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	FIXTURE_DETAIL_INCLUDE,
	FIXTURE_SERIES_INCLUDE,
	isFinished,
	isInPlay,
	selectFixturesForDetailSync,
	shouldRunInterval,
	syncFixtureDetail,
	syncFixtureSeries,
	syncH2H,
	syncLive,
	syncSeasonFixtures,
	syncTopscorers,
	syncTypes,
} from "./sm-sync.js";

// D1 風のフェイク（prepare/bind/batch を記録）
function fakeDb() {
	const batched = [];
	return {
		batched,
		prepare(sql) {
			return { bind: (...a) => ({ sql, a }) };
		},
		batch: async (stmts) => {
			batched.push(stmts.length);
			return stmts.map(() => ({ success: true }));
		},
	};
}

test("isInPlay / isFinished: state_id 判定", () => {
	// 在プレー+試合中の中断（22=後半を含む）
	for (const s of [2, 3, 4, 6, 9, 21, 22, 25]) assert.equal(isInPlay(s), true);
	for (const s of [1, 5, 7, 8]) assert.equal(isInPlay(s), false);
	for (const s of [5, 7, 8]) assert.equal(isFinished(s), true);
	assert.equal(isFinished(2), false);
});

test("syncTypes: pagination を has_more=false まで辿って upsert", async () => {
	const pages = {
		1: {
			data: [{ id: 1, name: "A", code: "a" }],
			pagination: { has_more: true },
		},
		2: {
			data: [{ id: 2, name: "B", code: "b" }],
			pagination: { has_more: false },
		},
	};
	let calls = 0;
	const client = {
		get: async (path, opts) => {
			calls++;
			return pages[opts.params.page];
		},
	};
	const db = fakeDb();
	const n = await syncTypes(client, db, 1000);
	assert.equal(calls, 2);
	assert.equal(n, 2); // 2 types upserted
	assert.deepEqual(db.batched, [1, 1]); // 1件/ページずつ
});

test("syncTypes: maxPages で暴走を止める", async () => {
	const client = {
		get: async () => ({ data: [{ id: 1 }], pagination: { has_more: true } }),
	};
	const n = await syncTypes(client, fakeDb(), 1000, { maxPages: 3 });
	assert.equal(n, 3);
});

test("syncSeasonFixtures: data.fixtures を backfill(チャンク分割)", async () => {
	const mk = (id, h, a) => ({
		id,
		league_id: 732,
		season_id: 26618,
		starting_at: "x",
		starting_at_timestamp: id,
		state_id: 1,
		participants: [
			{ id: h, name: "H" + h, meta: { location: "home" } },
			{ id: a, name: "A" + a, meta: { location: "away" } },
		],
	});
	// 60試合 → teams(重複排除) + 60 fixtures が 50件/batch で分割される
	const fixtures = Array.from({ length: 60 }, (_, i) =>
		mk(i + 1, 100, 200 + i),
	);
	const body = { data: { fixtures } };
	let captured = null;
	const client = {
		get: async (path, opts) => {
			captured = { path, opts };
			return body;
		},
	};
	const db = fakeDb();
	const res = await syncSeasonFixtures(client, db, 26618, 1000);
	assert.match(captured.path, /seasons\/26618/);
	assert.match(captured.opts.include, /fixtures\.participants/);
	assert.equal(res.count, 60);
	// teams: 100 と 200..259 の 61チーム + 60 fixtures = 121 文 → 50で割って3バッチ
	assert.ok(db.batched.length >= 3);
	assert.equal(
		db.batched.reduce((a, b) => a + b, 0),
		res.statements,
	);
});

test("syncSeasonFixtures: 空 fixtures は no-op", async () => {
	const client = { get: async () => ({ data: { fixtures: [] } }) };
	const res = await syncSeasonFixtures(client, fakeDb(), 1, 1000);
	assert.equal(res.count, 0);
});

test("syncFixtureDetail: detail 取得→specs→batch", async () => {
	const detail = {
		data: {
			id: 7,
			league_id: 732,
			season_id: 26618,
			starting_at: "2026-06-11 19:00:00",
			starting_at_timestamp: 1,
			state_id: 5,
			participants: [
				{ id: 10, name: "A", meta: { location: "home" } },
				{ id: 20, name: "B", meta: { location: "away" } },
			],
			scores: [
				{
					participant_id: 10,
					score: { goals: 2, participant: "home" },
					description: "CURRENT",
				},
				{
					participant_id: 20,
					score: { goals: 1, participant: "away" },
					description: "CURRENT",
				},
			],
			events: [],
			statistics: [],
		},
	};
	let captured = null;
	const client = {
		get: async (path, opts) => {
			captured = { path, opts };
			return detail;
		},
	};
	const db = fakeDb();
	const res = await syncFixtureDetail(client, db, 7, 1000);
	assert.match(captured.path, /fixtures\/7/);
	assert.match(captured.opts.include, /participants/);
	assert.equal(res.ok, true);
	assert.equal(db.batched.length, 1); // 1バッチ
});

test("syncFixtureDetail: data が無ければ no-op（例外なし）", async () => {
	const client = { get: async () => ({}) };
	const db = fakeDb();
	const res = await syncFixtureDetail(client, db, 9, 1000);
	assert.equal(res.ok, false);
	assert.equal(db.batched.length, 0);
});

test("syncLive: livescores から各 fixture を upsert", async () => {
	const live = {
		data: [
			{
				id: 1,
				state_id: 3,
				participants: [
					{ id: 10, meta: { location: "home" } },
					{ id: 20, meta: { location: "away" } },
				],
				scores: [],
				events: [],
				statistics: [],
			},
			{
				id: 2,
				state_id: 3,
				participants: [
					{ id: 30, meta: { location: "home" } },
					{ id: 40, meta: { location: "away" } },
				],
				scores: [],
				events: [],
				statistics: [],
			},
		],
	};
	const client = { get: async () => live };
	const db = fakeDb();
	const res = await syncLive(client, db, 1000);
	assert.equal(res.count, 2);
	assert.equal(db.batched.length, 1); // 全fixtureを1バッチに集約
});

test("syncLive: 空でも例外なし", async () => {
	const client = { get: async () => ({ data: [] }) };
	const res = await syncLive(client, fakeDb(), 1000);
	assert.equal(res.count, 0);
});

test("syncFixtureDetail: include に lineups と xGFixture が含まれる", async () => {
	const detail = {
		data: {
			id: 42,
			league_id: 732,
			season_id: 26618,
			starting_at: "2026-06-11 19:00:00",
			starting_at_timestamp: 1,
			state_id: 3,
			participants: [
				{ id: 10, name: "A", meta: { location: "home" } },
				{ id: 20, name: "B", meta: { location: "away" } },
			],
			scores: [],
			events: [],
			statistics: [],
		},
	};
	let captured = null;
	const client = {
		get: async (path, opts) => {
			captured = { path, opts };
			return detail;
		},
	};
	await syncFixtureDetail(client, fakeDb(), 42, 1000);
	assert.ok(
		captured.opts.include.includes("lineups"),
		"include should contain lineups",
	);
	assert.ok(
		captured.opts.include.includes("xGFixture"),
		"include should contain xGFixture",
	);
});

test("selectFixturesForDetailSync: ライブと直近終了を選ぶ", () => {
	const now = 1000;
	const rows = [
		{ sm_fixture_id: 1, state_id: 3 },
		{ sm_fixture_id: 2, state_id: 1 },
		{ sm_fixture_id: 3, state_id: 5 },
	];
	const ids = selectFixturesForDetailSync(rows, now).map(
		(r) => r.sm_fixture_id,
	);
	assert.deepEqual(ids.sort(), [1, 3]);
});

test("selectFixturesForDetailSync: 非配列は空", () => {
	assert.deepEqual(selectFixturesForDetailSync(null, 1000), []);
});

test("selectFixturesForDetailSync: 未開始でもキックオフ90分以内は拾う", () => {
	const now = 1000;
	const rows = [
		{ sm_fixture_id: 1, state_id: 1, starting_at_ts: now + 89 * 60 },
		{ sm_fixture_id: 2, state_id: 1, starting_at_ts: now + 91 * 60 },
		{ sm_fixture_id: 3, state_id: 1, starting_at_ts: now - 60 }, // キックオフ済み
		{ sm_fixture_id: 4, state_id: 1, starting_at_ts: null },
	];
	const ids = selectFixturesForDetailSync(rows, now).map(
		(r) => r.sm_fixture_id,
	);
	assert.deepEqual(ids, [1]);
});

test("selectFixturesForDetailSync: 優先度順(インプレー→もうすぐ開始→終了)", () => {
	const now = 1000;
	const rows = [
		{ sm_fixture_id: 10, state_id: 5 }, // 終了
		{ sm_fixture_id: 11, state_id: 1, starting_at_ts: now + 30 * 60 }, // もうすぐ開始
		{ sm_fixture_id: 12, state_id: 3 }, // インプレー
	];
	const ids = selectFixturesForDetailSync(rows, now).map(
		(r) => r.sm_fixture_id,
	);
	assert.deepEqual(ids, [12, 11, 10]);
});

test("worker-watch の候補クエリは starting_at_ts を SELECT する（先行取得の配線）", () => {
	// selectFixturesForDetailSync は未開始試合を starting_at_ts で判定するため、
	// 実クエリが当該カラムを返さないと先行取得が一切発火しない（配線ミス回帰防止）。
	const src = readFileSync(
		new URL("../../worker-watch/src/index.js", import.meta.url),
		"utf8",
	);
	const m = src.match(/SELECT[^"]*FROM sm_fixtures/i);
	assert.ok(m, "sm_fixtures の候補 SELECT が見つからない");
	assert.match(m[0], /\bstarting_at_ts\b/);
});

test("FIXTURE_DETAIL_INCLUDE requests player profile for lineups", () => {
	assert.ok(FIXTURE_DETAIL_INCLUDE.includes("lineups.player"));
	assert.ok(FIXTURE_DETAIL_INCLUDE.includes("lineups.player.nationality"));
});

test("syncTopscorers は topscorers を取得し upsert 件数を返す", async () => {
	const calls = [];
	const football = {
		get: async (path, opts) => {
			calls.push({ path, opts });
			return {
				data: [
					{
						position: 1,
						total: 5,
						type_id: 208,
						player_id: 11,
						participant_id: 99,
						player: { name: "A" },
					},
				],
			};
		},
	};
	const db = { batch: async () => {}, prepare: () => ({ bind: () => ({}) }) };
	const r = await syncTopscorers(football, db, 26618, 1700);
	assert.equal(r.count, 1);
	assert.match(calls[0].path, /seasons\/26618\/topscorers/);
});

test("syncTopscorers は fetch 失敗でも例外を投げず error を返す", async () => {
	const football = {
		get: async () => {
			throw new Error("boom");
		},
	};
	const db = { batch: async () => {}, prepare: () => ({ bind: () => ({}) }) };
	const r = await syncTopscorers(football, db, 26618, 1700);
	assert.equal(r.count, 0);
	assert.equal(r.error, "boom");
});

test("FIXTURE_SERIES_INCLUDE は participants と pressure;trends を含む", () => {
	// participants が無いと home/away を解決できず全点 null になる回帰を防ぐ。
	assert.equal(
		FIXTURE_SERIES_INCLUDE,
		"participants;pressure;trends;periods.statistics",
	);
	assert.ok(FIXTURE_SERIES_INCLUDE.includes("participants"));
});

test("syncFixtureSeries: include が正しく path が fixtures/9、書き込みが1回起きる", async () => {
	const fakeDetail = {
		id: 9,
		participants: [
			{ id: 10, meta: { location: "home" } },
			{ id: 20, meta: { location: "away" } },
		],
		pressure: [
			{ participant_id: 10, minute: 5, pressure: 50 },
			{ participant_id: 20, minute: 5, pressure: 30 },
		],
		trends: [],
	};
	let captured = null;
	const client = {
		get: async (path, opts) => {
			captured = { path, opts };
			return { data: fakeDetail };
		},
	};
	// バッチに渡る bind 済みステートメントを捕捉する db（fakeDb は件数のみ記録のため）。
	const written = [];
	const db = {
		prepare: (sql) => ({ bind: (...a) => ({ sql, a }) }),
		batch: async (stmts) => {
			written.push(...stmts);
			return stmts.map(() => ({ success: true }));
		},
	};
	const res = await syncFixtureSeries(client, db, 9, 1000);
	assert.equal(captured.path, "fixtures/9");
	assert.equal(
		captured.opts.include,
		"participants;pressure;trends;periods.statistics",
	);
	assert.equal(res.ok, true);
	assert.equal(res.fixtureId, 9);
	assert.equal(written.length, 1);
	// participants 経由で home/away が解決され、全点 null にならないこと（バグ回帰防止）。
	const parsed = JSON.parse(written[0].a[1]);
	assert.deepEqual(parsed.pressure, [{ minute: 5, home: 50, away: 30 }]);
});

test("syncFixtureSeries: data が無ければ ok:false（例外なし）", async () => {
	const client = { get: async () => ({}) };
	const res = await syncFixtureSeries(client, fakeDb(), 9, 1000);
	assert.equal(res.ok, false);
	assert.equal(res.error, "no data");
});

test("syncFixtureSeries: fetch 失敗でも例外を投げず ok:false を返す", async () => {
	const client = {
		get: async () => {
			throw new Error("network error");
		},
	};
	const res = await syncFixtureSeries(client, fakeDb(), 9, 1000);
	assert.equal(res.ok, false);
	assert.ok(res.error);
});

test("shouldRunInterval: intervalMin 分境界でのみ true（重い同期の間引き）", () => {
	// epoch秒 → 分 = floor(now/60)。interval=3 なら 0,3,6... 分で実行。
	assert.equal(shouldRunInterval(0, 3), true); // 0分
	assert.equal(shouldRunInterval(60, 3), false); // 1分
	assert.equal(shouldRunInterval(120, 3), false); // 2分
	assert.equal(shouldRunInterval(180, 3), true); // 3分
	assert.equal(shouldRunInterval(240, 3), false); // 4分
	assert.equal(shouldRunInterval(360, 3), true); // 6分
});

test("shouldRunInterval: interval<=1 は常に true（毎分実行＝間引かない）", () => {
	assert.equal(shouldRunInterval(60, 1), true);
	assert.equal(shouldRunInterval(120, 1), true);
	assert.equal(shouldRunInterval(90, 0), true);
});

test("shouldRunInterval: 不正な now/interval は true（書き込みを止めない安全側）", () => {
	assert.equal(shouldRunInterval(Number.NaN, 3), true);
	assert.equal(shouldRunInterval(180, Number.NaN), true);
	assert.equal(shouldRunInterval(undefined, 5), true);
});

// sm_fixtures(対象抽出: LEFT JOIN sm_h2h で未キャッシュのみ), sm_teams(app_code), sm_h2h(upsert記録)
function fakeH2HDB({ fixtures = [], teams = {} } = {}) {
	const h2hUpserts = [];
	const make = (sql) => ({
		sql,
		args: [],
		bind(...a) {
			this.args = a;
			return this;
		},
		async all() {
			if (/FROM sm_fixtures/i.test(this.sql)) return { results: fixtures };
			if (/FROM sm_teams/i.test(this.sql)) {
				const ids = this.args.map(Number);
				return {
					results: ids
						.filter((id) => id in teams)
						.map((id) => ({ sm_team_id: id, app_code: teams[id] })),
				};
			}
			return { results: [] };
		},
		async run() {
			if (/INSERT INTO sm_h2h/i.test(this.sql)) h2hUpserts.push(this.args);
			return { success: true, meta: { changes: 1 } };
		},
	});
	return {
		prepare: (sql) => make(sql),
		async batch(stmts) {
			for (const s of stmts) await s.run();
			return [];
		},
		_h2hUpserts: h2hUpserts,
	};
}

// API-Football クライアントのモック。h2h=A-B をキーに response を返す。status も差し替え可能。
// statusが関数の場合は呼び出す度に評価（呼び出し回数に応じた動的ステータス対応）。
function fakeAfClient(byPair, { status = 200 } = {}) {
	let callCount = 0;
	return {
		calls: [],
		async get(path) {
			this.calls.push(path);
			const m = path.match(/h2h=(\d+)-(\d+)/);
			const key = m ? `${m[1]}-${m[2]}` : "";
			const actualStatus =
				typeof status === "function" ? status(++callCount) : status;
			return { status: actualStatus, json: { response: byPair[key] || [] } };
		},
	};
}

// API-Football fixture（teams/goals 形）
function afFx(homeId, awayId, hg, ag) {
	return {
		teams: { home: { id: homeId }, away: { id: awayId } },
		goals: { home: hg, away: ag },
	};
}

test("syncH2H: 未キャッシュ窓内fixtureをAPI-FootballでH2H集計しupsert", async () => {
	const now = 1_000_000;
	const db = fakeH2HDB({
		fixtures: [
			{
				sm_fixture_id: 7,
				home_team_id: 18,
				away_team_id: 83,
				starting_at_ts: now + 3600,
			},
		],
		teams: { 18: "GER", 83: "NED" }, // afIdForCode で 25 / 1118 に解決される想定
	});
	const af = fakeAfClient({
		"25-1118": [afFx(25, 1118, 2, 1), afFx(1118, 25, 0, 0)],
	});
	const res = await syncH2H(af, db, now);
	assert.equal(res.count, 1);
	const up = db._h2hUpserts[0];
	assert.equal(up[0], 7); // fixture_id
	assert.equal(up[1], "GER"); // home_code
	assert.equal(up[2], "NED"); // away_code
	// GER(25) 視点: 1勝(2-1) + 1分(0-0) = 1-1-0, total 2
	assert.equal(up[3], 1); // home_wins
	assert.equal(up[4], 1); // draws
	assert.equal(up[5], 0); // away_wins
	assert.equal(up[6], 2); // total
});

test("syncH2H: 未マッピングのチームはスキップ（行を作らない）", async () => {
	const now = 1_000_000;
	const db = fakeH2HDB({
		fixtures: [
			{
				sm_fixture_id: 9,
				home_team_id: 1,
				away_team_id: 2,
				starting_at_ts: now + 3600,
			},
		],
		teams: { 1: "ZZZ", 2: "GER" }, // ZZZ は AF_TEAM_ID に無い
	});
	const af = fakeAfClient({});
	const res = await syncH2H(af, db, now);
	assert.equal(res.count, 0);
	assert.equal(af.calls.length, 0); // API を叩かない
});

test("syncH2H: 429 を受けたら即停止（部分コミット）", async () => {
	const now = 1_000_000;
	const db = fakeH2HDB({
		fixtures: [
			{
				sm_fixture_id: 7,
				home_team_id: 18,
				away_team_id: 83,
				starting_at_ts: now + 100,
			},
			{
				sm_fixture_id: 8,
				home_team_id: 18,
				away_team_id: 83,
				starting_at_ts: now + 200,
			},
		],
		teams: { 18: "GER", 83: "NED" },
	});
	const af = fakeAfClient(
		{ "25-1118": [afFx(25, 1118, 1, 0)] },
		{ status: 429 },
	);
	const res = await syncH2H(af, db, now);
	assert.equal(res.count, 0); // 1件目で 429 → upsert せず break
	assert.equal(af.calls.length, 1); // 2件目は叩かない
});

test("syncH2H: 429 が来る前の成功分は部分コミット（count > 0）", async () => {
	const now = 1_000_000;
	const db = fakeH2HDB({
		fixtures: [
			{
				sm_fixture_id: 7,
				home_team_id: 18,
				away_team_id: 83,
				starting_at_ts: now + 100,
			},
			{
				sm_fixture_id: 8,
				home_team_id: 18,
				away_team_id: 83,
				starting_at_ts: now + 200,
			},
		],
		teams: { 18: "GER", 83: "NED" },
	});
	const af = fakeAfClient(
		{ "25-1118": [afFx(25, 1118, 1, 0)] },
		{ status: (callCount) => (callCount === 1 ? 200 : 429) },
	);
	const res = await syncH2H(af, db, now);
	assert.equal(res.count, 1); // 1件目がコミット済み
	assert.equal(af.calls.length, 2); // 2回叩いて2回目の429で停止
});

test("syncH2H: max で per-run 件数を制限", async () => {
	const now = 1_000_000;
	const fixtures = [];
	const teams = { 18: "GER", 83: "NED" };
	for (let i = 0; i < 5; i++)
		fixtures.push({
			sm_fixture_id: i,
			home_team_id: 18,
			away_team_id: 83,
			starting_at_ts: now + i,
		});
	// LIMIT は SQL 側だが、フェイクは全件返すので syncH2H 内の slice/limit を検証する目的で
	// max=2 を渡し、API 呼び出しが 2 回で止まることを見る。
	const db = fakeH2HDB({ fixtures, teams });
	const af = fakeAfClient({ "25-1118": [afFx(25, 1118, 1, 0)] });
	const res = await syncH2H(af, db, now, { max: 2 });
	assert.equal(af.calls.length, 2);
	assert.equal(res.count, 2);
});
