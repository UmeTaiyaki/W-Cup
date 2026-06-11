import assert from "node:assert/strict";
import { test } from "node:test";
import {
	deriveBracket,
	deriveChampion,
	deriveGroupMatches,
	deriveGroupResult,
	deriveKnockout,
	deriveResult,
	deriveTopScorer,
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

test("deriveChampion は決勝FTから勝者=champion・敗者=runnerUp", () => {
	const fixtures = [
		{
			status: "FT",
			round_name: "Final",
			home: { app_code: "ARG", score: 3 },
			away: { app_code: "FRA", score: 1 },
		},
	];
	assert.deepEqual(deriveChampion(fixtures), {
		champion: "ARG",
		runnerUp: "FRA",
	});
});

test("deriveChampion は決勝が未FTなら null/null", () => {
	const fixtures = [
		{
			status: "LIVE",
			round_name: "Final",
			home: { app_code: "ARG", score: 0 },
			away: { app_code: "FRA", score: 0 },
		},
	];
	assert.deepEqual(deriveChampion(fixtures), {
		champion: null,
		runnerUp: null,
	});
});

const koFixtures = [
	{
		status: "FT",
		round_name: "Round of 16",
		home: { app_code: "ARG", score: 2 },
		away: { app_code: "MEX", score: 0 },
	},
	{
		status: "FT",
		round_name: "Round of 16",
		home: { app_code: "FRA", score: 1 },
		away: { app_code: "ESP", score: 0 },
	},
	{
		status: "FT",
		round_name: "Quarter-finals",
		home: { app_code: "ARG", score: 1 },
		away: { app_code: "FRA", score: 0 },
	},
];

test("deriveKnockout は各ラウンドに到達した app_code 群（重複なし）", () => {
	const ko = deriveKnockout(koFixtures);
	assert.deepEqual(ko.r16.sort(), ["ARG", "ESP", "FRA", "MEX"].sort());
	assert.deepEqual(ko.qf.sort(), ["ARG", "FRA"].sort());
	assert.deepEqual(ko.r32, []);
	assert.deepEqual(ko.sf, []);
});

test("deriveBracket はラウンドFT勝者コードを返す", () => {
	const b = deriveBracket(koFixtures);
	assert.deepEqual(b.r16.sort(), ["ARG", "FRA"].sort());
	assert.deepEqual(b.qf, ["ARG"]);
});

test("deriveTopScorer は position 最小（goals 最大）を '名前 (CODE)' で返す", () => {
	const rows = [
		{ player_name: "B", app_code: "FRA", goals: 4, position: 2 },
		{ player_name: "A. Striker", app_code: "ARG", goals: 6, position: 1 },
	];
	assert.equal(deriveTopScorer(rows), "A. Striker (ARG)");
});

test("deriveTopScorer は app_code 欠落なら名前のみ", () => {
	assert.equal(
		deriveTopScorer([
			{ player_name: "X", app_code: null, goals: 3, position: 1 },
		]),
		"X",
	);
});

test("deriveTopScorer は空なら空文字", () => {
	assert.equal(deriveTopScorer([]), "");
});

test("deriveResult は各導出を 1 つの result 型に束ねる", () => {
	const fixtures = [
		{ status: "FT", round_name: "Final", home: { app_code: "ARG", score: 1 }, away: { app_code: "FRA", score: 0 } },
	];
	const topscorers = [{ player_name: "A", app_code: "ARG", goals: 5, position: 1 }];
	const r = deriveResult(fixtures, topscorers, { A: ["MEX","KOR","RSA","CZE"] });
	assert.equal(r.champion, "ARG");
	assert.equal(r.runnerUp, "FRA");
	assert.equal(r.topScorer, "A (ARG)");
	assert.ok(r.groupResult && r.knockout && r.bracket);
});
