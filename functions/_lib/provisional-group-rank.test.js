import assert from "node:assert/strict";
import { test } from "node:test";
import { provisionalGroupResult } from "../../public/lib/standings.js";

// 4チームグループ A,B,C,D。1巡目（A-B, C-D）のみ消化 → 全チーム1試合消化済み。
test("全チーム1試合消化後は暫定 top3 コードを返す", () => {
	const groups = { A: ["A", "B", "C", "D"] };
	const groupMatches = {
		A: [
			{ a: "A", b: "B", ga: 2, gb: 0 }, // A 勝ち(3)
			{ a: "C", b: "D", ga: 1, gb: 1 }, // C,D 引分(1)
		],
	};
	const out = provisionalGroupResult(groups, groupMatches);
	// A(3) > C(1,gd0) = D(1,gd0) … 同点は総得点→登録順。B(0)。top3 = A, C, D
	assert.deepEqual(out.A, ["A", "C", "D"]);
});

test("一部チームが未消化なら空配列（加点なし）", () => {
	const groups = { A: ["A", "B", "C", "D"] };
	const groupMatches = {
		A: [{ a: "A", b: "B", ga: 2, gb: 0 }], // C,D は未消化
	};
	assert.deepEqual(provisionalGroupResult(groups, groupMatches).A, []);
});

test("ライブスコア（FT前でも ga/gb 数値）で順位に反映される", () => {
	const groups = { A: ["A", "B", "C", "D"] };
	const groupMatches = {
		A: [
			{ a: "A", b: "B", ga: 0, gb: 1, status: "LIVE" }, // B 暫定勝ち
			{ a: "C", b: "D", ga: 0, gb: 0 },
		],
	};
	const out = provisionalGroupResult(groups, groupMatches);
	assert.equal(out.A[0], "B"); // ライブの 1点が反映され B が首位
});

test("スコア未入力（ga/gb null）は未消化扱いで空配列", () => {
	const groups = { A: ["A", "B", "C", "D"] };
	const groupMatches = {
		A: [
			{ a: "A", b: "B", ga: null, gb: null },
			{ a: "C", b: "D", ga: null, gb: null },
		],
	};
	assert.deepEqual(provisionalGroupResult(groups, groupMatches).A, []);
});

test("複数グループを個別に判定する", () => {
	const groups = { A: ["A", "B"], B: ["C", "D"] };
	const groupMatches = {
		A: [{ a: "A", b: "B", ga: 3, gb: 0 }], // 全消化
		B: [], // 未消化
	};
	const out = provisionalGroupResult(groups, groupMatches);
	assert.deepEqual(out.A, ["A", "B"]);
	assert.deepEqual(out.B, []);
});
