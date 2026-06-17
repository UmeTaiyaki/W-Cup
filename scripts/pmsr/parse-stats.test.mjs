// parse-stats.mjs のユニットテスト。
// 入力は render-app.html の __allText() 相当（pdf.js を Y座標で行再構成し \n 連結したもの）。
// m11(NED 2-2 JPN) の Key Statistics(p03)/Possession/Defensive Pressure(p29) の
// 実レイアウトを最小再現する。watermark 文字・"ff" 合字・"s"(秒) サフィックス・
// 部分文字列衝突("Pushing on" ⊂ "Pushing on into Pressing")の回帰を固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStats, findMissing } from "./parse-stats.mjs";

// p03 Key Statistics（home 値 | ラベル | away 値）。
const P03 = [
	"Total 54.9% 7.7% 37.4% Total",
	"2 Goals 2",
	"0.63 xG (Expected Goals) 0.34",
	"10 (6) Attempts at Goal (On Target) 9 (2)",
	"529 (473) Total Passes (Complete) 356 (302)",
	"89 % Pass Completion % 85 %",
	"88 Completed Line Breaks 72",
	"13 Defensive Line Breaks 13",
	"156 Receptions in the Final Third 120",
	"23 Crosses 24",
	"23 Ball Progressions 21",
	"194 (30) Defensive Pressures Applied (Direct Pressures) 316 (46)",
	"33 Forced Turnovers 28",
	"49 Second Balls 50",
	"102.9 km Total Distance Covered 109.4 km",
	"4.6 km Zone 4 – Low Speed Sprinting: 20-25 km/h 5.1 km",
];

// p29 Defensive Pressure。左右端に縦書き watermark("NOTICE"/"RID") の文字が
// 行内に混入する点と、所要時間が "1.57s" のように s 付きである点を再現する。
const P29 = [
	"Defensive Pressure",
	"194 Total Pressures 316",
	"N N",
	"O 30 Direct Pressures 46 O",
	"I I",
	"C 1.57s Avg Pressure Duration 1.75s C",
	"I 33 Forced Turnovers 28 I",
	"14.25s Ball Recovery Time 22.26s",
	"86 Pushing on into Pressing 151",
	"158 Pushing on 274",
	"27 Pressing Direction Inside 68",
	"129 Pressing Direction Outside 193",
];

// p04 Phases of Play（home% | ラベル | away%）。
const P04 = [
	"IN POSSESSION",
	"46% Build Up Unopposed 44%",
	"19% Build Up Opposed 9%",
	"14% Progression 17%",
	"24% Final Third 20%",
	"3% Long Ball 3%",
	"8% Attacking Transition 12%",
	"1% Counter Attack 1%",
	"6% Set Piece 6%",
	"OUT OF POSSESSION",
	"2% High Press 2%",
	"2% Mid Press 3%",
	"0% Low Press 0%",
	"2% High Block 1%",
	"25% Mid Block 18%",
	"33% Low Block 50%",
	"5% Recovery 4%",
	"12% Defensive Transition 8%",
	"7% Counter-press 6%",
];

const TEXT = [...P03, ...P04, ...P29].join("\n");

test("possession を home/contested/away で抽出", () => {
	const { possession } = parseStats(TEXT);
	assert.deepEqual(possession, { home: 54.9, contested: 7.7, away: 37.4 });
});

test("Key Statistics（隠し項目含む）を欠損なく抽出", () => {
	const { keyStats: k } = parseStats(TEXT);
	assert.deepEqual([k.goals.home, k.goals.away], ["2", "2"]);
	assert.deepEqual([k.xg.home, k.xg.away], ["0.63", "0.34"]);
	assert.deepEqual([k.attempts.home, k.attempts.away], ["10 (6)", "9 (2)"]);
	assert.deepEqual([k.defLineBreaks.home, k.defLineBreaks.away], ["13", "13"]);
	assert.deepEqual([k.ballProg.home, k.ballProg.away], ["23", "21"]);
	// "(Direct Pressures)" の括弧内一致に引きずられず Applied 全体で home/away を取る。
	assert.deepEqual(
		[k.defPressures.home, k.defPressures.away],
		["194 (30)", "316 (46)"],
	);
	assert.deepEqual([k.distance.home, k.distance.away], ["102.9 km", "109.4 km"]);
});

test("Defensive Pressure（s サフィックス・watermark混入）を抽出", () => {
	const { pressure: p } = parseStats(TEXT);
	assert.deepEqual([p.totalPressures.home, p.totalPressures.away], ["194", "316"]);
	assert.deepEqual([p.directPressures.home, p.directPressures.away], ["30", "46"]);
	// s 付き値（VALUE_RE の s 対応）。
	assert.deepEqual(
		[p.avgPressureDuration.home, p.avgPressureDuration.away],
		["1.57s", "1.75s"],
	);
	assert.deepEqual(
		[p.ballRecoveryTime.home, p.ballRecoveryTime.away],
		["14.25s", "22.26s"],
	);
	assert.deepEqual(
		[p.pushingIntoPressing.home, p.pushingIntoPressing.away],
		["86", "151"],
	);
});

test("Phases of Play（攻撃/守備の隠し項目含む）を抽出", () => {
	const { phasesInPossession: pi, phasesOutOfPossession: po } = parseStats(TEXT);
	assert.deepEqual([pi.progression.home, pi.progression.away], ["14%", "17%"]);
	assert.deepEqual([pi.longBall.home, pi.longBall.away], ["3%", "3%"]);
	assert.deepEqual([pi.counterAttack.home, pi.counterAttack.away], ["1%", "1%"]);
	assert.deepEqual([po.highPress.home, po.highPress.away], ["2%", "2%"]);
	assert.deepEqual([po.lowBlock.home, po.lowBlock.away], ["33%", "50%"]);
	assert.deepEqual([po.recovery.home, po.recovery.away], ["5%", "4%"]);
});

test('"Pushing on" は "Pushing on into Pressing" に誤マッチしない', () => {
	const { pressure: p } = parseStats(TEXT);
	// 158/274 (Pushing on) であって 86/151 (into Pressing) ではない。
	assert.deepEqual([p.pushingOn.home, p.pushingOn.away], ["158", "274"]);
});

test("findMissing は完全入力で空（pressure含む）", () => {
	const stats = parseStats(TEXT);
	const missing = findMissing(stats);
	// pressure を含む全ブロックが揃っているので欠損なし。
	assert.deepEqual(missing, []);
});

test("Defensive Pressure ページ欠損時は graceful（pressure が missing に並ぶ）", () => {
	const stats = parseStats(P03.join("\n"));
	const missing = findMissing(stats);
	assert.ok(missing.includes("pressure.totalPressures"));
	assert.ok(missing.includes("pressure.avgPressureDuration"));
	// Key Statistics 側は欠損していない。
	assert.ok(!missing.some((m) => m.startsWith("keyStats.")));
});
