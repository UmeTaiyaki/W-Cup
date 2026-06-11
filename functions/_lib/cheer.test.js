import assert from "node:assert/strict";
import { test } from "node:test";
import {
	clampDelta,
	isSide,
	isStarted,
	MAX_DELTA,
	parseFixtures,
	rowsToCounts,
} from "./cheer.js";

test("clampDelta: 0/負/不正は1、正常はそのまま、上限でクランプ", () => {
	assert.equal(clampDelta(0), 1);
	assert.equal(clampDelta(-5), 1);
	assert.equal(clampDelta("x"), 1);
	assert.equal(clampDelta(5), 5);
	assert.equal(clampDelta(99), MAX_DELTA);
	assert.equal(clampDelta(20), 20);
});

test("isSide: home/away のみ true", () => {
	assert.equal(isSide("home"), true);
	assert.equal(isSide("away"), true);
	assert.equal(isSide("draw"), false);
	assert.equal(isSide(""), false);
	assert.equal(isSide(undefined), false);
});

test("parseFixtures: 正の整数のみ・重複排除", () => {
	assert.deepEqual(parseFixtures("1,2,x,2"), [1, 2]);
	assert.deepEqual(parseFixtures(""), []);
	assert.deepEqual(parseFixtures("0,-3,5"), [5]);
	assert.deepEqual(parseFixtures(null), []);
});

test("rowsToCounts: 行を fixture×side へ集約、欠側は0", () => {
	const rows = [
		{ fixture_id: 1, side: "home", count: 12 },
		{ fixture_id: 1, side: "away", count: 7 },
		{ fixture_id: 2, side: "home", count: 3 },
	];
	assert.deepEqual(rowsToCounts(rows), {
		1: { home: 12, away: 7 },
		2: { home: 3, away: 0 },
	});
	assert.deepEqual(rowsToCounts([]), {});
	assert.deepEqual(rowsToCounts(null), {});
});

test("isStarted: LIVE/FT は true、NS/null は false", () => {
	assert.equal(isStarted(2), true); // LIVE
	assert.equal(isStarted(5), true); // FT
	assert.equal(isStarted(1), false); // NS
	assert.equal(isStarted(null), false);
	assert.equal(isStarted(undefined), false);
});
