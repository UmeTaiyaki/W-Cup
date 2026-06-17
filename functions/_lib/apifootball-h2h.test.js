import assert from "node:assert/strict";
import { test } from "node:test";
import { extractAfH2HResult } from "./apifootball-h2h.js";

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
