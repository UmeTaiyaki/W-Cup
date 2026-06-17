import assert from "node:assert/strict";
import { test } from "node:test";
import {
	aggregateH2H,
	extractH2HResult,
	H2H_WINDOW_DAYS,
	rowsToH2H,
} from "./sm-h2h.js";

// v3 標準形の fixture を組む小ヘルパ
function fx(homeId, awayId, hg, ag) {
	return {
		participants: [
			{ id: homeId, meta: { location: "home" } },
			{ id: awayId, meta: { location: "away" } },
		],
		scores: [
			{ description: "CURRENT", score: { participant: "home", goals: hg } },
			{ description: "CURRENT", score: { participant: "away", goals: ag } },
		],
	};
}

test("extractH2HResult: home/away の team_id と最終スコアを抽出", () => {
	assert.deepEqual(extractH2HResult(fx(18, 83, 2, 1)), {
		home_team_id: 18,
		away_team_id: 83,
		home_score: 2,
		away_score: 1,
	});
});

test("extractH2HResult: 不完全な fixture は null", () => {
	assert.equal(extractH2HResult(null), null);
	assert.equal(extractH2HResult({ participants: [] }), null);
	assert.equal(
		extractH2HResult({ participants: [{ id: 1, meta: { location: "home" } }] }),
		null,
	);
});

test("aggregateH2H: home視点で勝/分/敗を集計", () => {
	const fixtures = [
		fx(18, 83, 2, 1), // 18 home win
		fx(83, 18, 0, 0), // draw
		fx(83, 18, 3, 1), // 18(away) lose
		fx(18, 83, 1, 1), // draw
	];
	// 18 視点: 1勝 2分 1敗
	assert.deepEqual(aggregateH2H(18, fixtures), {
		home_wins: 1,
		draws: 2,
		away_wins: 1,
		total: 4,
	});
});

test("aggregateH2H: スコア欠落/対象外チームはスキップ", () => {
	const bad = { participants: [], scores: [] };
	const notInvolved = fx(50, 60, 1, 0);
	const fixtures = [fx(18, 83, 1, 0), bad, notInvolved];
	assert.deepEqual(aggregateH2H(18, fixtures), {
		home_wins: 1,
		draws: 0,
		away_wins: 0,
		total: 1,
	});
});

test("aggregateH2H: 空配列はすべて0", () => {
	assert.deepEqual(aggregateH2H(18, []), {
		home_wins: 0,
		draws: 0,
		away_wins: 0,
		total: 0,
	});
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
