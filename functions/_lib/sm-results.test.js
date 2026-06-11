import assert from "node:assert/strict";
import { test } from "node:test";
import { isFinalRound, roundKey } from "./sm-results.js";

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
