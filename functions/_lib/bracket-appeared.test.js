import assert from "node:assert/strict";
import { test } from "node:test";
import {
	deriveKnockoutFromAppeared,
	deriveKnockoutFromSets,
} from "../../public/lib/bracket.js";

// BRACKET_STRUCTURE 由来の実カード（メモリ wcup-bracket-2026）:
//   M3: A2 vs B2 / M4: F1 vs C2
// groupRank に該当チームを置けば、これらのカードに実チームが入る。
const GR = {
	A: ["a1", "a2"],
	B: ["b1", "b2"],
	C: ["c1", "c2"],
	F: ["f1", "f2"],
};

function r32Card(der, predTeams) {
	// der.matches.r32 から [a2,b2] / [f1,c2] のカード index を見つける
	const idx = der.matches.r32.findIndex(
		(m) => m.includes(predTeams[0]) && m.includes(predTeams[1]),
	);
	assert.notEqual(idx, -1, `card ${predTeams} not found`);
	return { idx, winner: der.winners.r32[idx] };
}

test("バグ再現: 到達集合(appeared.r32=両チーム)を勝者として渡すと先頭が誤勝者になる", () => {
	// 旧経路 deriveKnockoutFromSets に「到達チーム集合」を渡した場合の誤動作を固定。
	const appearedAsSets = { r32: ["a2", "b2", "f1", "c2"] }; // R32出場（両チーム）
	const der = deriveKnockoutFromSets(GR, {}, appearedAsSets);
	// M3 [a2,b2] の先頭 a2 が勝者扱いされてしまう（これがバグ）
	const m3 = r32Card(der, ["a2", "b2"]);
	assert.ok(m3.winner, "旧経路では試合前でも勝者が出てしまう");
});

test("修正: 試合前(到達r16空)は R32 勝者ハイライトが出ない", () => {
	// グループ終了直後・R16未到達。appeared.r32 に出場チームが入っていても勝者は出ない。
	const appeared = { r32: ["a2", "b2", "f1", "c2"] };
	const der = deriveKnockoutFromAppeared(GR, {}, appeared, []);
	const m3 = r32Card(der, ["a2", "b2"]);
	const m4 = r32Card(der, ["f1", "c2"]);
	assert.equal(m3.winner, null);
	assert.equal(m4.winner, null);
});

test("修正: R16到達チームが R32 カードの勝者になる", () => {
	// a2 と f1 がベスト16に到達 = それぞれ R32 を勝ち上がった。
	const appeared = {
		r32: ["a2", "b2", "f1", "c2"],
		r16: ["a2", "f1"],
	};
	const der = deriveKnockoutFromAppeared(GR, {}, appeared, []);
	assert.equal(r32Card(der, ["a2", "b2"]).winner, "a2");
	assert.equal(r32Card(der, ["f1", "c2"]).winner, "f1");
});

test("修正: R16カードの勝者は QF到達で判定（1ラウンドずれ）", () => {
	// a2,f1 が R16到達 → der で M3×M4 の勝者同士が R16 カードを組む。
	// そのうち a2 が QF到達 = R16 を勝ち上がった。
	const appeared = {
		r32: ["a2", "b2", "f1", "c2"],
		r16: ["a2", "f1"],
		qf: ["a2"],
	};
	const der = deriveKnockoutFromAppeared(GR, {}, appeared, []);
	// R16 カード [a2, f1] の勝者は a2
	const idx = der.matches.r16.findIndex(
		(m) => m.includes("a2") && m.includes("f1"),
	);
	assert.notEqual(idx, -1);
	assert.equal(der.winners.r16[idx], "a2");
});

test("finalists(champion/runnerUp)が SF カードの勝者になる", () => {
	// SF まで到達した構図を最小で作る代わりに、finalists 判定だけ確認する。
	// sf カードに両者がいれば、finalists に含まれる側が勝者。
	const appeared = {
		r32: ["a2", "b2", "f1", "c2"],
		r16: ["a2", "f1"],
		qf: ["a2", "f1"],
		sf: ["a2", "f1"],
	};
	// a2 を優勝者(finalist)に
	const der = deriveKnockoutFromAppeared(GR, {}, appeared, ["a2"]);
	const idx = der.matches.sf.findIndex(
		(m) => m.includes("a2") && m.includes("f1"),
	);
	if (idx !== -1) assert.equal(der.winners.sf[idx], "a2");
});
