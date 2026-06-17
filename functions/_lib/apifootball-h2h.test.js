import assert from "node:assert/strict";
import { test } from "node:test";
import { afResponseHasError, extractAfH2HResult } from "./apifootball-h2h.js";

const fx = (homeId, awayId, hg, ag) => ({
	teams: { home: { id: homeId }, away: { id: awayId } },
	goals: { home: hg, away: ag },
});

test("extractAfH2HResult: 正常形を正規化", () => {
	const r = extractAfH2HResult(fx(25, 1118, 2, 1));
	assert.deepEqual(r, {
		home_team_id: 25,
		away_team_id: 1118,
		home_score: 2,
		away_score: 1,
	});
});

test("extractAfH2HResult: 文字列型の id/goals を Number 強制", () => {
	const r = extractAfH2HResult(fx("25", "1118", "2", "0"));
	assert.deepEqual(r, {
		home_team_id: 25,
		away_team_id: 1118,
		home_score: 2,
		away_score: 0,
	});
});

test("extractAfH2HResult: goals 欠損なら null", () => {
	assert.equal(
		extractAfH2HResult({
			teams: { home: { id: 1 }, away: { id: 2 } },
			goals: { home: null, away: null },
		}),
		null,
	);
});

test("extractAfH2HResult: teams 欠損なら null", () => {
	assert.equal(extractAfH2HResult({ goals: { home: 1, away: 0 } }), null);
	assert.equal(extractAfH2HResult(null), null);
});

test("afResponseHasError: 成功(errors:[])は false", () => {
	assert.equal(afResponseHasError({ errors: [], response: [] }), false);
	assert.equal(afResponseHasError({ response: [] }), false);
	assert.equal(afResponseHasError(null), false);
});

test("afResponseHasError: 上限超過(errors非空)は true", () => {
	// 分間超過
	assert.equal(
		afResponseHasError({
			errors: { rateLimit: "Too many requests..." },
			response: [],
		}),
		true,
	);
	// 日次超過
	assert.equal(
		afResponseHasError({
			errors: { requests: "You have reached the request limit for the day" },
			response: [],
		}),
		true,
	);
	// 配列形のエラー
	assert.equal(afResponseHasError({ errors: ["bad"], response: [] }), true);
});
