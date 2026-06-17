import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateResults, H2H_WINDOW_DAYS, rowsToH2H } from "./sm-h2h.js";

// 正規化済み結果を組む小ヘルパ
const R = (homeId, awayId, hg, ag) => ({
	home_team_id: homeId,
	away_team_id: awayId,
	home_score: hg,
	away_score: ag,
});

test("rowsToH2H: 行を fixtureId キーへ整形", () => {
	const rows = [
		{
			fixture_id: 7,
			home_code: "JPN",
			away_code: "BRA",
			home_wins: 1,
			draws: 2,
			away_wins: 5,
			total: 8,
		},
	];
	assert.deepEqual(rowsToH2H(rows), {
		7: {
			home_code: "JPN",
			away_code: "BRA",
			home_wins: 1,
			draws: 2,
			away_wins: 5,
			total: 8,
		},
	});
	assert.deepEqual(rowsToH2H([]), {});
	assert.deepEqual(rowsToH2H(null), {});
});

test("H2H_WINDOW_DAYS は 7", () => {
	assert.equal(H2H_WINDOW_DAYS, 7);
});

test("aggregateResults: home がどちら側でも視点が正しい", () => {
	// teamId=18 視点。1試合目 home で勝ち、2試合目 away で引分。
	const out = aggregateResults(18, [R(18, 83, 1, 0), R(83, 18, 2, 2)]);
	assert.deepEqual(out, { home_wins: 1, draws: 1, away_wins: 0, total: 2 });
});

test("aggregateResults: 関与しない結果はスキップ", () => {
	const out = aggregateResults(18, [R(50, 60, 3, 0)]);
	assert.deepEqual(out, { home_wins: 0, draws: 0, away_wins: 0, total: 0 });
});

test("rowsToH2H: D1行を fixtureId キーへ整形", () => {
	const out = rowsToH2H([
		{
			fixture_id: 7,
			home_code: "ENG",
			away_code: "CRO",
			home_wins: 2,
			draws: 0,
			away_wins: 1,
			total: 3,
		},
	]);
	assert.deepEqual(out["7"], {
		home_code: "ENG",
		away_code: "CRO",
		home_wins: 2,
		draws: 0,
		away_wins: 1,
		total: 3,
	});
});
