import assert from "node:assert/strict";
import { test } from "node:test";
import {
	deriveGroupMatches,
	deriveGroupResult,
	isFinalRound,
	roundKey,
} from "./sm-results.js";

test("roundKey は SportMonks round 名をアプリの r32/r16/qf/sf へ写像", () => {
	assert.equal(roundKey("Round of 32"), "r32");
	assert.equal(roundKey("Round of 16"), "r16");
	assert.equal(roundKey("Quarter-finals"), "qf");
	assert.equal(roundKey("Semi-finals"), "sf");
	assert.equal(roundKey("Group A"), null);
});

test("isFinalRound は決勝のみ true（3位決定戦は除外）", () => {
	assert.equal(isFinalRound("Final"), true);
	assert.equal(isFinalRound("3rd Place Final"), false);
	assert.equal(isFinalRound("Semi-finals"), false);
});

const groups = { A: ["MEX", "KOR", "RSA", "CZE"] };

test("deriveGroupMatches はグループ内対戦のスコアを {a,b,ga,gb} で返す（ライブ込み）", () => {
	const fixtures = [
		{
			status: "FT",
			home: { app_code: "MEX", score: 2 },
			away: { app_code: "KOR", score: 1 },
		},
		{
			status: "LIVE",
			home: { app_code: "RSA", score: 0 },
			away: { app_code: "CZE", score: 0 },
		},
		{
			status: "NS",
			home: { app_code: "MEX", score: null },
			away: { app_code: "RSA", score: null },
		},
		{
			status: "FT",
			home: { app_code: "BRA", score: 1 },
			away: { app_code: "MAR", score: 0 },
		},
	];
	const gm = deriveGroupMatches(fixtures, groups);
	assert.equal(gm.A.length, 2);
	assert.deepEqual(gm.A[0], { a: "MEX", b: "KOR", ga: 2, gb: 1 });
	assert.deepEqual(gm.A[1], { a: "RSA", b: "CZE", ga: 0, gb: 0 });
});

test("deriveGroupResult は全6試合FTのグループだけ上位3コードを返す", () => {
	const m = (a, b, ga, gb) => ({
		status: "FT",
		home: { app_code: a, score: ga },
		away: { app_code: b, score: gb },
	});
	const full = [
		m("MEX", "KOR", 2, 0),
		m("MEX", "RSA", 2, 0),
		m("MEX", "CZE", 2, 0),
		m("KOR", "RSA", 1, 0),
		m("KOR", "CZE", 1, 0),
		m("RSA", "CZE", 1, 0),
	];
	const gr = deriveGroupResult(full, { A: ["MEX", "KOR", "RSA", "CZE"] });
	assert.deepEqual(gr.A, ["MEX", "KOR", "RSA"]);
});

test("deriveGroupResult は未完（FT<6）のグループは空配列", () => {
	const partial = [
		{
			status: "FT",
			home: { app_code: "MEX", score: 1 },
			away: { app_code: "KOR", score: 0 },
		},
	];
	const gr = deriveGroupResult(partial, { A: ["MEX", "KOR", "RSA", "CZE"] });
	assert.deepEqual(gr.A, []);
});
