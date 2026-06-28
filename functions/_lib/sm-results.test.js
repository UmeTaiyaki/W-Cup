import assert from "node:assert/strict";
import { test } from "node:test";
import {
	deriveBracket,
	deriveChampion,
	deriveFairPlay,
	deriveGroupMatches,
	deriveGroupResult,
	deriveKnockout,
	deriveResult,
	deriveScorers,
	deriveThirdGroups,
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
	assert.deepEqual(gm.A[0], { a: "MEX", b: "KOR", ga: 2, gb: 1, status: "FT" });
	assert.deepEqual(gm.A[1], {
		a: "RSA",
		b: "CZE",
		ga: 0,
		gb: 0,
		status: "LIVE",
	});
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

// ---- deriveFairPlay（タイブレーカー⑦）----
const cardFixtures = [
	{
		home: { team_id: 1, app_code: "MEX" },
		away: { team_id: 2, app_code: "KOR" },
	},
	{
		home: { team_id: 3, app_code: "RSA" },
		away: { team_id: 4, app_code: "CZE" },
	},
];
const cardGroups = { A: ["MEX", "KOR", "RSA", "CZE"] };

test("deriveFairPlay はFIFA減点方式で集計（黄-1/間接赤-3/直接赤-4/黄+直接赤-5）", () => {
	const events = [
		// MEX 選手100: イエロー1枚 → -1
		{ sm_fixture_id: 10, team_id: 1, type_id: 19, player_id: 100 },
		// KOR 選手200: イエロー→2枚目イエロー(間接退場) → -3（-1-3 ではなく -3）
		{ sm_fixture_id: 10, team_id: 2, type_id: 19, player_id: 200 },
		{ sm_fixture_id: 10, team_id: 2, type_id: 21, player_id: 200 },
		// RSA 選手300: 直接レッド → -4
		{ sm_fixture_id: 11, team_id: 3, type_id: 20, player_id: 300 },
		// CZE 選手400: イエロー+直接レッド → -5
		{ sm_fixture_id: 11, team_id: 4, type_id: 19, player_id: 400 },
		{ sm_fixture_id: 11, team_id: 4, type_id: 20, player_id: 400 },
	];
	const fp = deriveFairPlay(events, cardFixtures, cardGroups);
	assert.equal(fp.MEX, -1);
	assert.equal(fp.KOR, -3);
	assert.equal(fp.RSA, -4);
	assert.equal(fp.CZE, -5);
});

test("deriveFairPlay は選手別に合算し、グループ外チームは無視", () => {
	const events = [
		{ sm_fixture_id: 10, team_id: 1, type_id: 19, player_id: 100 },
		{ sm_fixture_id: 12, team_id: 1, type_id: 19, player_id: 101 }, // 別選手の黄
		{ sm_fixture_id: 10, team_id: 999, type_id: 20, player_id: 900 }, // 未知チーム→無視
	];
	const fp = deriveFairPlay(events, cardFixtures, cardGroups);
	assert.equal(fp.MEX, -2); // -1 + -1
	assert.equal(Object.hasOwn(fp, "undefined"), false);
});

test("deriveFairPlay は空入力で空オブジェクト", () => {
	assert.deepEqual(deriveFairPlay([], cardFixtures, cardGroups), {});
	assert.deepEqual(deriveFairPlay(null, cardFixtures, cardGroups), {});
});

test("deriveGroupResult はフェアプレーで最終決着（全6FT・完全同値）", () => {
	// 全試合0-0 → 全チーム勝点3・得失差0・総得点0、head-to-head も完全同値。
	// フェアプレー: CZE のみカード -4、他は0 → CZE が最下位、残りは登録順。
	const m = (a, b) => ({
		status: "FT",
		home: { app_code: a, score: 0 },
		away: { app_code: b, score: 0 },
	});
	const full = [
		m("MEX", "KOR"),
		m("MEX", "RSA"),
		m("MEX", "CZE"),
		m("KOR", "RSA"),
		m("KOR", "CZE"),
		m("RSA", "CZE"),
	];
	const gr = deriveGroupResult(
		full,
		{ A: ["MEX", "KOR", "RSA", "CZE"] },
		{ CZE: -4 },
	);
	// CZE はフェアプレー最下位なので top3 に入らない。
	assert.deepEqual(gr.A, ["MEX", "KOR", "RSA"]);
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

test("deriveBracket: PK決着(本スコア同点)はPK戦スコアで勝者を決める", () => {
	// 2022 Morocco vs Spain 実例形: 0-0でPK 3-0 Morocco
	const fx = [
		{
			status: "FT",
			round_name: "Round of 16",
			home: { app_code: "MAR", score: 0, pen_score: 3 },
			away: { app_code: "ESP", score: 0, pen_score: 0 },
		},
	];
	assert.deepEqual(deriveBracket(fx).r16, ["MAR"]);
});

test("deriveBracket: 本スコア同点でPK情報なしは勝者なし（試合中/未到達）", () => {
	const fx = [
		{
			status: "FT",
			round_name: "Round of 16",
			home: { app_code: "MAR", score: 0, pen_score: null },
			away: { app_code: "ESP", score: 0, pen_score: null },
		},
	];
	assert.deepEqual(deriveBracket(fx).r16, []);
});

test("deriveChampion: 決勝PK決着もPK戦スコアで優勝を判定", () => {
	// 2022 決勝 Argentina 3-3 France, PK 4-2 Argentina
	const fx = [
		{
			status: "FT",
			round_name: "Final",
			home: { app_code: "ARG", score: 3, pen_score: 4 },
			away: { app_code: "FRA", score: 3, pen_score: 2 },
		},
	];
	assert.deepEqual(deriveChampion(fx), { champion: "ARG", runnerUp: "FRA" });
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

test("deriveScorers は position 順に '名前 (CODE)'/goals 配列を返す", () => {
	const rows = [
		{ player_name: "B", app_code: "FRA", goals: 4, position: 2 },
		{ player_name: "A. Striker", app_code: "ARG", goals: 6, position: 1 },
	];
	assert.deepEqual(deriveScorers(rows), [
		{ name: "A. Striker (ARG)", goals: 6 },
		{ name: "B (FRA)", goals: 4 },
	]);
});

test("deriveScorers は app_code 欠落なら名前のみ・goals欠落/空入力は除外", () => {
	assert.deepEqual(
		deriveScorers([
			{ player_name: "X", app_code: null, goals: 3, position: 1 },
			{ player_name: "NoGoals", app_code: "BRA", goals: null, position: 2 },
			{ player_name: "", app_code: "GER", goals: 1, position: 3 },
		]),
		[{ name: "X", goals: 3 }],
	);
	assert.deepEqual(deriveScorers([]), []);
	assert.deepEqual(deriveScorers(null), []);
});

// ---- deriveThirdGroups（3位通過8組の確定。グループ全試合FT時のみ）----
// 4チーム総当たり(6試合)の完全な組を作るヘルパ。最終順位は L1>L2>L3>L4 で固定し、
// 3位(L3)の得失差を thirdMargin（L3 が L4 に勝つ点差）で制御する。
// L1: 全勝(9pt), L2: L1に負けて他に勝ち(6pt), L3: L1/L2に負けて L4 に thirdMargin-0 で勝ち(3pt,gd=margin-2),
// L4: 全敗(0pt)。組ごとに thirdMargin を変えると 3位の成績順を一意に決められる。
function fullGroupFixtures(L, thirdMargin) {
	const t = (n) => `${L}${n}`;
	const m = (a, b, ga, gb) => ({
		status: "FT",
		home: { app_code: a, score: ga },
		away: { app_code: b, score: gb },
	});
	return [
		m(t(1), t(2), 1, 0),
		m(t(1), t(3), 1, 0),
		m(t(1), t(4), 1, 0),
		m(t(2), t(3), 1, 0),
		m(t(2), t(4), 1, 0),
		m(t(3), t(4), thirdMargin, 0),
	];
}

test("deriveThirdGroups は全組FT時に成績上位8組の3位通過を返す（昇順）", () => {
	// A..L に thirdMargin = 1..12 を割り当て → 3位の得失差(margin-2)は組ごとに一意。
	// 上位8組 = margin 最大の 8 組 = E(5)..L(12)。
	const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
	const groups = {};
	let fixtures = [];
	letters.forEach((L, idx) => {
		groups[L] = [`${L}1`, `${L}2`, `${L}3`, `${L}4`];
		fixtures = fixtures.concat(fullGroupFixtures(L, idx + 1));
	});
	assert.deepEqual(deriveThirdGroups(fixtures, groups), [
		"E",
		"F",
		"G",
		"H",
		"I",
		"J",
		"K",
		"L",
	]);
});

test("deriveThirdGroups は1組でも未完なら空配列（確定前は暫定扱い）", () => {
	const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
	const groups = {};
	let fixtures = [];
	letters.forEach((L, idx) => {
		groups[L] = [`${L}1`, `${L}2`, `${L}3`, `${L}4`];
		const fx = fullGroupFixtures(L, idx + 1);
		// 組 A は1試合落として未完（FT5/6）にする。
		fixtures = fixtures.concat(L === "A" ? fx.slice(0, 5) : fx);
	});
	assert.deepEqual(deriveThirdGroups(fixtures, groups), []);
});

test("deriveResult は thirdGroups を含む（全組FTで8組・未確定で空）", () => {
	const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
	const groups = {};
	let fixtures = [];
	letters.forEach((L, idx) => {
		groups[L] = [`${L}1`, `${L}2`, `${L}3`, `${L}4`];
		fixtures = fixtures.concat(fullGroupFixtures(L, idx + 1));
	});
	const r = deriveResult(fixtures, [], groups);
	assert.deepEqual(r.thirdGroups, ["E", "F", "G", "H", "I", "J", "K", "L"]);
	// 未完シナリオ（最初の1試合のみ）では空配列。
	const r2 = deriveResult(fixtures.slice(0, 1), [], groups);
	assert.deepEqual(r2.thirdGroups, []);
});

test("deriveResult は各導出を 1 つの result 型に束ねる", () => {
	const fixtures = [
		{
			status: "FT",
			round_name: "Final",
			home: { app_code: "ARG", score: 1 },
			away: { app_code: "FRA", score: 0 },
		},
	];
	const topscorers = [
		{ player_name: "A", app_code: "ARG", goals: 5, position: 1 },
	];
	const r = deriveResult(fixtures, topscorers, {
		A: ["MEX", "KOR", "RSA", "CZE"],
	});
	assert.equal(r.champion, "ARG");
	assert.equal(r.runnerUp, "FRA");
	assert.equal(r.topScorer, "A (ARG)");
	assert.ok(r.groupResult && r.knockout && r.bracket);
});
