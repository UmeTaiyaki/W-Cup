import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAliasMap, upsertAlias } from "../../public/lib/scorer-alias.js";

const ALIASES = [
	{
		canonical: "BRA::VINICIUS JUNIOR",
		variants: ["VINI JR. (BRA)", "Vinícius Júnior"],
		smPlayerId: 12345,
	},
];

test("buildAliasMap: 変種を正規化キーで canonical に写像", () => {
	const map = buildAliasMap(ALIASES);
	assert.equal(map["VINI JR. (BRA)"], "BRA::VINICIUS JUNIOR");
	assert.equal(map["VINICIUS JUNIOR"], "BRA::VINICIUS JUNIOR"); // 'Vinícius Júnior' の正規化
});

test("buildAliasMap: 空/不正入力は空マップ", () => {
	assert.deepEqual(buildAliasMap(), {});
	assert.deepEqual(buildAliasMap([{ variants: ["X"] }]), {}); // canonical 無しは無視
});

test("upsertAlias: 新規 canonical を追加（非破壊）", () => {
	const next = upsertAlias(ALIASES, {
		canonical: "ENG::KANE",
		variant: "KANE (ENG)",
		smPlayerId: 99,
	});
	assert.equal(next.length, 2);
	assert.equal(ALIASES.length, 1); // 元配列は不変
	assert.deepEqual(next[1], {
		canonical: "ENG::KANE",
		variants: ["KANE (ENG)"],
		smPlayerId: 99,
	});
});

test("upsertAlias: 既存 canonical へ変種を追記（重複は正規化で排除）", () => {
	const next = upsertAlias(ALIASES, {
		canonical: "BRA::VINICIUS JUNIOR",
		variant: "vini jr. (bra)",
	});
	assert.equal(next[0].variants.length, 2); // 'vini jr. (bra)' は既存 'VINI JR. (BRA)' と同一視され追記されない
});
