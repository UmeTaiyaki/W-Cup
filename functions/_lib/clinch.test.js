import assert from "node:assert/strict";
import { test } from "node:test";
import {
	clinchGroupRank,
	computeAllClinch,
	computeClinchStatus,
} from "../../public/lib/standings.js";

const ft = (a, b, ga, gb) => ({ a, b, ga, gb, status: "FT" });

test("全試合FT: 1位確定・2位確定・敗退確定が正しく出る", () => {
	// W>X>Y>Z（W全勝, X はY,Zに勝ち, YはZに勝ち）
	const members = ["W", "X", "Y", "Z"];
	const matches = [
		ft("W", "X", 1, 0),
		ft("W", "Y", 1, 0),
		ft("W", "Z", 1, 0),
		ft("X", "Y", 1, 0),
		ft("X", "Z", 1, 0),
		ft("Y", "Z", 1, 0),
	];
	const s = computeClinchStatus(members, matches);
	assert.deepEqual(s.W, {
		qualified: true,
		won: true,
		eliminated: false,
		secondLocked: false,
	});
	assert.deepEqual(s.X, {
		qualified: true,
		won: false,
		eliminated: false,
		secondLocked: true,
	});
	// Y は3位確定。2026は各組3位上位8組も通過するため敗退とはしない。
	assert.equal(s.Y.eliminated, false);
	// Z は4位確定（3位以内不可）＝真の敗退。
	assert.equal(s.Z.eliminated, true);
});

test("2節終了で首位は突破確定だが1位/2位未確定（保守）", () => {
	// 2節: W6(勝勝), X3, Y3, Z0。残り W-Z, X-Y。
	const members = ["W", "X", "Y", "Z"];
	const matches = [
		ft("W", "X", 1, 0),
		ft("Y", "Z", 1, 0),
		ft("W", "Y", 1, 0),
		ft("X", "Z", 1, 0),
	];
	const s = computeClinchStatus(members, matches);
	assert.equal(s.W.qualified, true); // 2位以内は確定
	assert.equal(s.W.won, false); // X が6で並びうる→1位確定にしない
	assert.equal(s.W.secondLocked, false);
	assert.equal(s.Z.eliminated, true); // 最大3、上に常時2チーム
});

test("1試合のみFTでは誰もクリンチしない（保守）", () => {
	const members = ["W", "X", "Y", "Z"];
	const matches = [ft("W", "X", 1, 0)];
	const s = computeClinchStatus(members, matches);
	for (const c of members) {
		assert.equal(s[c].qualified, false);
		assert.equal(s[c].won, false);
		assert.equal(s[c].eliminated, false);
	}
});

test("LIVE試合は未確定（残り）扱い", () => {
	const members = ["W", "X", "Y", "Z"];
	// W が X に LIVE で 5-0 でも確定に使わない
	const matches = [
		{ a: "W", b: "X", ga: 5, gb: 0, status: "LIVE" },
		ft("W", "Y", 1, 0),
		ft("W", "Z", 1, 0),
	];
	const s = computeClinchStatus(members, matches);
	// W は FT 2勝=6点だが X-W が未確定のため X も最大6到達可→1位確定にしない
	assert.equal(s.W.won, false);
});

test("computeAllClinch はグループ毎に状態を返す", () => {
	const groups = { A: ["W", "X", "Y", "Z"] };
	const gm = {
		A: [
			ft("W", "X", 1, 0),
			ft("W", "Y", 1, 0),
			ft("W", "Z", 1, 0),
			ft("X", "Y", 1, 0),
			ft("X", "Z", 1, 0),
			ft("Y", "Z", 1, 0),
		],
	};
	const all = computeAllClinch(groups, gm);
	assert.equal(all.A.W.won, true);
	assert.equal(all.A.X.secondLocked, true);
});

test("clinchGroupRank は確定枠のみ埋める", () => {
	const groups = { A: ["W", "X", "Y", "Z"], B: ["P", "Q", "R", "S"] };
	const gm = {
		A: [
			ft("W", "X", 1, 0),
			ft("W", "Y", 1, 0),
			ft("W", "Z", 1, 0),
			ft("X", "Y", 1, 0),
			ft("X", "Z", 1, 0),
			ft("Y", "Z", 1, 0),
		],
		B: [], // 未消化
	};
	const rank = clinchGroupRank(groups, gm, {});
	assert.deepEqual(rank.A, ["W", "X", null]); // 1位/2位確定
	assert.deepEqual(rank.B, [null, null, null]); // 確定なし
});

test("clinchGroupRank は base(GROUP_RESULT) を優先する", () => {
	const groups = { A: ["W", "X", "Y", "Z"] };
	const gm = { A: [] };
	const base = { A: ["Y", "Z", "W"] };
	const rank = clinchGroupRank(groups, gm, base);
	assert.deepEqual(rank.A, ["Y", "Z", "W"]);
});
