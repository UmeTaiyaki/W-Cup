import assert from "node:assert/strict";
import { test } from "node:test";
import {
	computeStandings,
	generateFixtures,
} from "../../public/lib/standings.js";

test("generateFixtures は4チームから6試合を生成", () => {
	const f = generateFixtures(["A", "B", "C", "D"]);
	assert.equal(f.length, 6);
	assert.deepEqual(f[0], { a: "A", b: "B" });
});

test("generateFixtures は空スロットを除いた組のみ生成", () => {
	const f = generateFixtures(["A", "B", "", ""]);
	assert.equal(f.length, 1);
	assert.deepEqual(f[0], { a: "A", b: "B" });
});

test("computeStandings は勝点・得失点を集計しソート", () => {
	const members = ["A", "B", "C", "D"];
	const matches = [
		{ a: "A", b: "B", ga: 2, gb: 1 }, // A勝
		{ a: "A", b: "C", ga: 1, gb: 1 }, // 分
		{ a: "A", b: "D", ga: 3, gb: 0 }, // A勝
		{ a: "B", b: "C", ga: 0, gb: 0 }, // 分
		{ a: "B", b: "D", ga: 2, gb: 2 }, // 分
		{ a: "C", b: "D", ga: 1, gb: 0 }, // C勝
	];
	const rows = computeStandings(members, matches);
	assert.equal(rows[0].code, "A");
	assert.equal(rows[0].pts, 7); // 2勝1分
	assert.equal(rows[0].gd, 4);
	assert.equal(rows[0].played, 3);
	assert.equal(rows[0].w, 2);
	assert.equal(rows[0].d, 1);
	assert.equal(rows[0].l, 0);
});

test("computeStandings は未消化試合を除外", () => {
	const rows = computeStandings(
		["A", "B"],
		[{ a: "A", b: "B", ga: null, gb: null }],
	);
	assert.equal(rows[0].played, 0);
	assert.equal(rows[0].pts, 0);
});

test("computeStandings 同点は得失点差→総得点→登録順", () => {
	const members = ["A", "B"];
	const matches = [{ a: "A", b: "B", ga: 5, gb: 5 }];
	const rows = computeStandings(members, matches);
	// 同勝点・同得失点・同総得点 → 登録順で A が先
	assert.equal(rows[0].code, "A");
	assert.equal(rows[1].code, "B");
});

test("computeStandings 勝点同点は当該チーム間(head-to-head)が全試合得失差より優先", () => {
	// A と B は勝点6(2勝1敗)で並ぶ。全試合得失差は B(+9) > A(-1) だが、
	// 直接対決は A が B に勝利 → FIFA 2026 では A が上位。
	const members = ["A", "B", "C", "D"];
	const matches = [
		{ a: "A", b: "B", ga: 1, gb: 0 }, // A勝（直接対決）
		{ a: "A", b: "C", ga: 1, gb: 0 }, // A勝
		{ a: "A", b: "D", ga: 0, gb: 3 }, // A敗 → A: 2勝1敗 pts6 gd-1
		{ a: "B", b: "C", ga: 5, gb: 0 }, // B勝
		{ a: "B", b: "D", ga: 5, gb: 0 }, // B勝 → B: 2勝1敗 pts6 gd+9
		{ a: "C", b: "D", ga: 0, gb: 0 }, // 分
	];
	const rows = computeStandings(members, matches);
	assert.equal(rows[0].code, "A"); // head-to-head 勝者
	assert.equal(rows[1].code, "B");
	assert.equal(rows[0].pts, 6);
	assert.equal(rows[1].pts, 6);
	assert.equal(rows[0].gd, -1); // 全試合得失差は劣るが上位
	assert.equal(rows[1].gd, 9);
});

test("computeStandings 3すくみは当該チーム間で並ぶと全試合得失差で決着", () => {
	// A,B,C が循環(各1勝1敗)で head-to-head 完全同値、D には全員勝利。
	// head-to-head で並ぶ3者は全試合得失差→総得点で決まる。
	const members = ["A", "B", "C", "D"];
	const matches = [
		{ a: "A", b: "B", ga: 1, gb: 0 },
		{ a: "B", b: "C", ga: 1, gb: 0 },
		{ a: "C", b: "A", ga: 1, gb: 0 },
		{ a: "A", b: "D", ga: 5, gb: 0 }, // A 総得点を最大化
		{ a: "B", b: "D", ga: 3, gb: 0 },
		{ a: "C", b: "D", ga: 1, gb: 0 },
	];
	const rows = computeStandings(members, matches);
	// A,B,C は head-to-head 同値(勝点3/gd0/gf1)。全試合得失差: A+5 B+2 C-1。
	assert.deepEqual(
		rows.map((r) => r.code),
		["A", "B", "C", "D"],
	);
});

test("computeStandings 試合ゼロでも全メンバーを返す", () => {
	const rows = computeStandings(["A", "B", "C", "D"], []);
	assert.equal(rows.length, 4);
	assert.ok(rows.every((r) => r.played === 0));
});
