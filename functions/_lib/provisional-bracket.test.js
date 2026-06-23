import assert from "node:assert/strict";
import { test } from "node:test";
import {
	provisionalGroupRank,
	provisionalThirdGroups,
} from "../../public/lib/standings.js";

const ft = (a, b, ga, gb) => ({ a, b, ga, gb, status: "FT" });
const live = (a, b, ga, gb) => ({ a, b, ga, gb, status: "LIVE" });

// 1組4チームの全6試合（総当たり）
function allFt(members, scores) {
	const [W, X, Y, Z] = members;
	return [
		ft(W, X, ...scores.WX),
		ft(W, Y, ...scores.WY),
		ft(W, Z, ...scores.WZ),
		ft(X, Y, ...scores.XY),
		ft(X, Z, ...scores.XZ),
		ft(Y, Z, ...scores.YZ),
	];
}

test("確定枠は provisional=false、暫定枠は provisional=true で埋まる", () => {
	// A組: 1試合だけFT（W が X に勝利）。残りは未消化。
	const groups = { A: ["W", "X", "Y", "Z"] };
	const groupMatches = { A: [ft("W", "X", 2, 0)] };
	const { rank, provisional } = provisionalGroupRank(groups, groupMatches, {});
	// この段階では数学的確定は無い → 全枠が暫定（現在順位由来）
	assert.equal(rank.A[0], "W"); // 勝点3で暫定1位
	assert.equal(provisional.A[0], true);
	// 暫定2〜3位も埋まる（得失点で並ぶ）
	assert.ok(rank.A[1]);
	assert.equal(provisional.A[1], true);
});

test("全試合FTのグループは確定として配置（provisional=false）", () => {
	const members = ["W", "X", "Y", "Z"];
	const groups = { A: members };
	// W>X>Y>Z が明確になる結果
	const groupMatches = {
		A: allFt(members, {
			WX: [1, 0],
			WY: [1, 0],
			WZ: [1, 0],
			XY: [1, 0],
			XZ: [1, 0],
			YZ: [1, 0],
		}),
	};
	const { rank, provisional } = provisionalGroupRank(groups, groupMatches, {});
	assert.deepEqual(rank.A.slice(0, 2), ["W", "X"]);
	// 1位/2位は数学的に確定 → 暫定ではない
	assert.equal(provisional.A[0], false);
	assert.equal(provisional.A[1], false);
});

test("base（GROUP_RESULT 最終順位）があれば最優先で確定扱い", () => {
	const groups = { A: ["W", "X", "Y", "Z"] };
	const groupMatches = { A: [] };
	const base = { A: ["X", "W", "Y"] };
	const { rank, provisional } = provisionalGroupRank(
		groups,
		groupMatches,
		base,
	);
	assert.deepEqual(rank.A, ["X", "W", "Y"]);
	assert.equal(provisional.A[0], false);
	assert.equal(provisional.A[1], false);
	assert.equal(provisional.A[2], false);
});

test("スコア未投入のグループは全枠 null・provisional=false", () => {
	const groups = { A: ["W", "X", "Y", "Z"] };
	const { rank, provisional } = provisionalGroupRank(groups, {}, {});
	assert.deepEqual(rank.A, [null, null, null]);
	assert.deepEqual(provisional.A, [false, false, false]);
});

test("ライブスコアも暫定順位に反映される", () => {
	const groups = { A: ["W", "X", "Y", "Z"] };
	const groupMatches = { A: [live("W", "X", 0, 3)] };
	const { rank, provisional } = provisionalGroupRank(groups, groupMatches, {});
	assert.equal(rank.A[0], "X"); // ライブで X リード→暫定1位
	assert.equal(provisional.A[0], true);
});

test("provisionalThirdGroups: 成績上位8組の組記号を昇順で返す", () => {
	// 12組。各組3位の勝点を変えて上位8組を作る。
	const groups = {};
	const groupMatches = {};
	const letters = "ABCDEFGHIJKL".split("");
	letters.forEach((g, idx) => {
		const ms = [`${g}1`, `${g}2`, `${g}3`, `${g}4`];
		groups[g] = ms;
		// 3位（=ms[2]）の勝点を idx で差をつける: idx 大きいほど3位が強い
		// ms[2] が ms[3] に idx%4... 単純化のため ms[2] vs ms[3] のスコア差で得失点を操作
		groupMatches[g] = [
			ft(ms[0], ms[1], 3, 0), // 1位確定的
			ft(ms[2], ms[3], 1 + (idx % 3), 0), // 3位の勝点/得失点を変動
			ft(ms[0], ms[2], 1, 0),
			ft(ms[1], ms[3], 1, 0),
		];
	});
	const res = provisionalThirdGroups(groups, groupMatches, {});
	assert.equal(res.length, 8);
	// 昇順ソートされている
	assert.deepEqual(res, [...res].sort());
});

test("provisionalThirdGroups: スコアのある組が8未満なら満たない配列", () => {
	const groups = {};
	const groupMatches = {};
	"ABCDE".split("").forEach((g) => {
		groups[g] = [`${g}1`, `${g}2`, `${g}3`, `${g}4`];
		groupMatches[g] = [ft(`${g}1`, `${g}2`, 1, 0)];
	});
	// スコアのある組5つでも各組3位が出る（4チーム→rows[2]あり）→5組
	const res = provisionalThirdGroups(groups, groupMatches, {});
	assert.ok(res.length <= 5);
});
