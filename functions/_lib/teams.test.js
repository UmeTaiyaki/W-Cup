import assert from "node:assert/strict";
import { test } from "node:test";
import {
	groupOf,
	parseFavs,
	teamFixtures,
	toggleFav,
} from "../../public/lib/teams.js";

test("parseFavs: 正常な配列はそのまま（文字列のみ・重複除去）", () => {
	assert.deepEqual(parseFavs(JSON.stringify(["JPN", "BRA"])), ["JPN", "BRA"]);
	assert.deepEqual(parseFavs(JSON.stringify(["JPN", "JPN", "BRA"])), [
		"JPN",
		"BRA",
	]);
	assert.deepEqual(parseFavs(JSON.stringify(["JPN", 1, null, "", "BRA"])), [
		"JPN",
		"BRA",
	]);
});

test("parseFavs: 空/壊れたJSON/非配列は空配列", () => {
	assert.deepEqual(parseFavs(""), []);
	assert.deepEqual(parseFavs(null), []);
	assert.deepEqual(parseFavs("{not json"), []);
	assert.deepEqual(parseFavs(JSON.stringify({ a: 1 })), []);
	assert.deepEqual(parseFavs(JSON.stringify("JPN")), []);
});

test("toggleFav: 無ければ追加・あれば除去（新配列・元配列は不変）", () => {
	const base = ["JPN"];
	assert.deepEqual(toggleFav(base, "BRA"), ["JPN", "BRA"]);
	assert.deepEqual(toggleFav(base, "JPN"), []);
	assert.deepEqual(base, ["JPN"]); // 不変
});

test("toggleFav: 不正入力は安全に処理", () => {
	assert.deepEqual(toggleFav(null, "JPN"), ["JPN"]);
	assert.deepEqual(toggleFav(["JPN"], ""), ["JPN"]);
	assert.deepEqual(toggleFav(undefined, ""), []);
});

test("teamFixtures: a/b いずれかに code を含む試合を日付→時刻順で抽出", () => {
	const sched = [
		{ a: "JPN", b: "NED", date: "2026-06-20", time: "13:00", round: "F" },
		{ a: "SWE", b: "TUN", date: "2026-06-15", time: "19:00", round: "F" },
		{ a: "TUN", b: "JPN", date: "2026-06-15", time: "13:00", round: "F" },
		{ a: "BRA", b: "MAR", date: "2026-06-16", time: "10:00", round: "C" },
	];
	const r = teamFixtures(sched, "JPN");
	assert.equal(r.length, 2);
	assert.equal(r[0].date, "2026-06-15");
	assert.equal(r[1].date, "2026-06-20");
});

test("teamFixtures: 該当なし/不正入力は空配列、日付なしは末尾", () => {
	assert.deepEqual(teamFixtures([], "JPN"), []);
	assert.deepEqual(teamFixtures(null, "JPN"), []);
	assert.deepEqual(teamFixtures([{ a: "JPN", b: "BRA" }], ""), []);
	const r = teamFixtures(
		[
			{ a: "JPN", b: "BRA" },
			{ a: "JPN", b: "NED", date: "2026-06-20", time: "13:00" },
		],
		"JPN",
	);
	assert.equal(r[0].date, "2026-06-20"); // 日付ありが先、日付なしが末尾
	assert.equal(r[1].date, undefined);
});

test("groupOf: 所属グループキーを返す/無ければ null", () => {
	const groups = { A: ["MEX", "KOR"], F: ["NED", "JPN", "TUN", "SWE"] };
	assert.equal(groupOf(groups, "JPN"), "F");
	assert.equal(groupOf(groups, "MEX"), "A");
	assert.equal(groupOf(groups, "BRA"), null);
	assert.equal(groupOf(null, "JPN"), null);
	assert.equal(groupOf(groups, ""), null);
});
