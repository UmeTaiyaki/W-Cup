import assert from "node:assert/strict";
import { test } from "node:test";
import { AF_TEAM_ID, afIdForCode } from "./af-team-map.js";

test("afIdForCode: 既知コードを解決", () => {
	assert.equal(afIdForCode("GER"), 25);
	assert.equal(afIdForCode("NED"), 1118);
	assert.equal(afIdForCode("USA"), 2384); // 男子代表
	assert.equal(afIdForCode("KOR"), 17); // South Korea シニア（U23でない）
});

test("afIdForCode: 未収録は null", () => {
	assert.equal(afIdForCode("ZZZ"), null);
});

test("AF_TEAM_ID: 48代表・値は全て有限数・コードは大文字3字・id重複なし", () => {
	const entries = Object.entries(AF_TEAM_ID);
	assert.equal(entries.length, 48);
	const ids = new Set();
	for (const [code, id] of entries) {
		assert.match(code, /^[A-Z]{3}$/);
		assert.equal(Number.isFinite(id), true, `${code} の id が数値でない`);
		assert.equal(ids.has(id), false, `id 重複: ${id} (${code})`);
		ids.add(id);
	}
});
