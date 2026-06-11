import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildMatchPrompt,
	callGeminiText,
	selectFixturesForAi,
} from "./ai-match.js";

const baseDetail = {
	fixture: {
		home_name: "日本",
		away_name: "ブラジル",
		home_score: 1,
		away_score: 2,
		home_xg: 1.3,
		away_xg: 1.8,
		state_id: 5,
		round_name: "グループF",
	},
	events: [
		{ minute: 23, type: "goal", team_id: 10, player_name: "三笘" },
		{ minute: 40, type: "goal", team_id: 20, player_name: "ヴィニシウス" },
	],
	stats: [
		{ team_id: 10, type_id: 5304, value: 1.3 },
		{ team_id: 10, type_id: 42, value: 8 },
	],
	lineups: [
		{
			team_id: 10,
			player_name: "遠藤",
			position: "MF",
			club_name: "Liverpool",
			is_start: 1,
			formation_field: "2:2",
		},
		{
			team_id: 20,
			player_name: "ヴィニシウス",
			position: "FW",
			club_name: "Real Madrid",
			is_start: 1,
			formation_field: "4:1",
		},
	],
};

test("buildMatchPrompt: lineup フェーズは布陣と先発を含む", () => {
	const p = buildMatchPrompt("lineup", baseDetail);
	assert.match(p, /日本/);
	assert.match(p, /ブラジル/);
	assert.match(p, /遠藤/);
	assert.match(p, /Liverpool/);
	assert.match(p, /数値.*正/);
});

test("buildMatchPrompt: ht/ft はスコアとxGを含む", () => {
	const p = buildMatchPrompt("ft", baseDetail);
	assert.match(p, /1\s*-\s*2|1-2/);
	assert.match(p, /1\.3/);
	assert.match(p, /三笘|ヴィニシウス/);
});

test("buildMatchPrompt: xG欠損でも壊れない（graceful）", () => {
	const d = {
		...baseDetail,
		fixture: { ...baseDetail.fixture, home_xg: null, away_xg: null },
	};
	const p = buildMatchPrompt("ht", d);
	assert.ok(typeof p === "string" && p.length > 0);
	assert.doesNotMatch(p, /null/);
});

test("buildMatchPrompt: detail が null でも throw しない", () => {
	assert.doesNotThrow(() => buildMatchPrompt("ft", null));
});

test("buildMatchPrompt: lineup フェーズはスコアを含まない", () => {
	const p = buildMatchPrompt("lineup", baseDetail);
	assert.doesNotMatch(p, /スコア:/);
});

test("buildMatchPrompt: unknown phase で throw する", () => {
	assert.throws(() => buildMatchPrompt("FT", baseDetail), /unknown phase/);
});

// fixtureRows: { sm_fixture_id, state_id, start_xi_count }
// existing:    Map<"fixtureId:phase", { summary, attempts }>
test("selectFixturesForAi: 先発22名でlineupを発火", () => {
	const rows = [{ sm_fixture_id: 1, state_id: 1, start_xi_count: 22 }];
	const out = selectFixturesForAi(rows, new Map(), 10);
	assert.deepEqual(out, [{ fixtureId: 1, phase: "lineup" }]);
});

test("selectFixturesForAi: 先発が揃わない間は発火しない", () => {
	const rows = [{ sm_fixture_id: 1, state_id: 1, start_xi_count: 11 }];
	assert.deepEqual(selectFixturesForAi(rows, new Map(), 10), []);
});

test("selectFixturesForAi: HT(3)とFT(5/7/8)を発火", () => {
	const rows = [
		{ sm_fixture_id: 1, state_id: 3, start_xi_count: 22 },
		{ sm_fixture_id: 2, state_id: 7, start_xi_count: 22 },
		{ sm_fixture_id: 3, state_id: 8, start_xi_count: 22 },
	];
	const out = selectFixturesForAi(rows, new Map(), 10);
	assert.deepEqual(out, [
		{ fixtureId: 1, phase: "ht" },
		{ fixtureId: 2, phase: "ft" },
		{ fixtureId: 3, phase: "ft" },
	]);
});

test("selectFixturesForAi: 生成済み(summary有)はスキップ、attempts>=3もスキップ", () => {
	const rows = [
		{ sm_fixture_id: 1, state_id: 3, start_xi_count: 22 },
		{ sm_fixture_id: 2, state_id: 3, start_xi_count: 22 },
	];
	const existing = new Map([
		["1:ht", { summary: "済み", attempts: 1 }],
		["2:ht", { summary: null, attempts: 3 }],
	]);
	assert.deepEqual(selectFixturesForAi(rows, existing, 10), []);
});

test("selectFixturesForAi: 1tick上限でキャップ", () => {
	const rows = [1, 2, 3, 4].map((id) => ({
		sm_fixture_id: id,
		state_id: 5,
		start_xi_count: 22,
	}));
	const out = selectFixturesForAi(rows, new Map(), 2);
	assert.equal(out.length, 2);
});

test("selectFixturesForAi: 空文字列summaryは未完了扱いで再生成対象", () => {
	const rows = [{ sm_fixture_id: 1, state_id: 3, start_xi_count: 22 }];
	const existing = new Map([["1:ht", { summary: "", attempts: 1 }]]);
	assert.deepEqual(selectFixturesForAi(rows, existing, 10), [
		{ fixtureId: 1, phase: "ht" },
	]);
});

test("selectFixturesForAi: null入力でも空配列を返す", () => {
	assert.deepEqual(selectFixturesForAi(null, new Map(), 10), []);
});

// ── callGeminiText ──────────────────────────────────────────────────────────

function fakeFetchOk(text) {
	return async () => ({
		ok: true,
		json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
	});
}

test("callGeminiText: 応答本文を返す", async () => {
	const out = await callGeminiText({
		apiKey: "k",
		model: "gemini-2.5-pro",
		prompt: "p",
		fetchImpl: fakeFetchOk("分析です"),
	});
	assert.equal(out, "分析です");
});

test("callGeminiText: HTTPエラーで例外", async () => {
	const fetchErr = async () => ({
		ok: false,
		status: 500,
		text: async () => "boom",
	});
	await assert.rejects(
		() =>
			callGeminiText({
				apiKey: "k",
				model: "m",
				prompt: "p",
				fetchImpl: fetchErr,
			}),
		/Gemini HTTP 500/,
	);
});

test("callGeminiText: 空応答で例外", async () => {
	const fetchEmpty = async () => ({
		ok: true,
		json: async () => ({
			candidates: [
				{ content: { parts: [{ text: "" }] }, finishReason: "SAFETY" },
			],
		}),
	});
	await assert.rejects(
		() =>
			callGeminiText({
				apiKey: "k",
				model: "m",
				prompt: "p",
				fetchImpl: fetchEmpty,
			}),
		/応答が空/,
	);
});

test("callGeminiText: candidates空配列で例外", async () => {
	const fetchNoCand = async () => ({
		ok: true,
		json: async () => ({ candidates: [] }),
	});
	await assert.rejects(
		() =>
			callGeminiText({
				apiKey: "k",
				model: "m",
				prompt: "p",
				fetchImpl: fetchNoCand,
			}),
		/応答が空/,
	);
});

// ── generateMatchAi ─────────────────────────────────────────────────────────

import { generateMatchAi } from "./ai-match.js";

function makeWriteDb() {
	const runs = [];
	const db = {
		prepare: (sql) => ({
			bind: (...args) => ({
				run: async () => {
					runs.push({ sql, args });
					return { success: true };
				},
				all: async () => ({ results: [] }),
			}),
		}),
		_runs: runs,
	};
	return db;
}

test("generateMatchAi: 成功時に summary を upsert", async () => {
	const db = makeWriteDb();
	await generateMatchAi({
		db,
		fixtureId: 1,
		phase: "ft",
		apiKey: "k",
		model: "gemini-2.5-pro",
		now: 1000,
		getDetail: async () => ({
			fixture: { home_name: "A", away_name: "B", home_score: 1, away_score: 0 },
			events: [],
			stats: [],
			lineups: [],
		}),
		callAi: async () => "総括テキスト",
	});
	const w = db._runs.find((r) => r.sql.includes("INSERT INTO sm_match_ai"));
	assert.ok(w, "upsert が実行される");
	assert.ok(w.args.includes("総括テキスト"));
});

test("generateMatchAi: AI失敗時は summary を書かず attempts を加算", async () => {
	const db = makeWriteDb();
	await generateMatchAi({
		db,
		fixtureId: 1,
		phase: "ft",
		apiKey: "k",
		model: "m",
		now: 1000,
		getDetail: async () => ({
			fixture: {},
			events: [],
			stats: [],
			lineups: [],
		}),
		callAi: async () => {
			throw new Error("AI down");
		},
	});
	const w = db._runs.find((r) => r.sql.includes("INSERT INTO sm_match_ai"));
	assert.ok(w, "失敗でも attempts upsert は実行される");
	assert.ok(!w.args.includes("総括テキスト"));
});

// ── maybeGenerateMatchAi ────────────────────────────────────────────────────

import { maybeGenerateMatchAi } from "./ai-match.js";

test("maybeGenerateMatchAi: 窓内のFT試合を検知して生成集計を返す", async () => {
	const runs = [];
	const db = {
		prepare: (sql) => ({
			bind: (...args) => ({
				run: async () => {
					runs.push({ sql, args });
					return { success: true };
				},
				all: async () => {
					if (sql.includes("FROM sm_fixtures")) {
						return {
							results: [{ sm_fixture_id: 7, state_id: 5, start_xi_count: 22 }],
						};
					}
					if (sql.includes("FROM sm_match_ai")) return { results: [] };
					return { results: [] };
				},
			}),
		}),
	};
	const agg = await maybeGenerateMatchAi(db, 1000, {
		apiKey: "k",
		// generateMatchAi 内の getFixtureDetail を避けるため、detail/ai を注入できない点に注意。
	});
	// NOTE: 実際の生成は getFixtureDetail(本物) を呼ぶため、fake-db の all() が
	// fixture を返さない→detail=null→FAIL_SQL 経路になる。agg は {lineup:0,ht:0,ft:0}。
	assert.deepEqual(agg, { lineup: 0, ht: 0, ft: 0 });
	// 検知が走り FAIL_SQL の upsert が試行されたことを確認
	assert.ok(runs.some((r) => r.sql.includes("INSERT INTO sm_match_ai")));
});

test("maybeGenerateMatchAi: success経路 — 注入したdetail/AIでFTを生成", async () => {
	const runs = [];
	const db = {
		prepare: (sql) => ({
			bind: (...args) => ({
				run: async () => {
					runs.push({ sql, args });
					return { success: true };
				},
				all: async () => {
					if (sql.includes("FROM sm_fixtures"))
						return {
							results: [{ sm_fixture_id: 7, state_id: 5, start_xi_count: 22 }],
						};
					return { results: [] }; // sm_match_ai
				},
			}),
		}),
	};
	const agg = await maybeGenerateMatchAi(db, 1000, {
		apiKey: "k",
		getDetail: async () => ({
			fixture: { home_name: "A", away_name: "B", home_score: 1, away_score: 0 },
			events: [],
			stats: [],
			lineups: [],
		}),
		callAi: async () => "総括",
	});
	assert.deepEqual(agg, { lineup: 0, ht: 0, ft: 1 });
	const w = runs.find(
		(r) => r.sql.includes("INSERT INTO sm_match_ai") && r.args.includes("総括"),
	);
	assert.ok(w, "SUCCESS_SQL upsert に総括が含まれる");
});
