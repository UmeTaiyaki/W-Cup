import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMatchPrompt, selectFixturesForAi } from "./ai-match.js";

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
