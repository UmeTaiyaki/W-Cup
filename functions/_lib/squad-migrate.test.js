import assert from "node:assert/strict";
import { test } from "node:test";
import { migrateSquads } from "../../scripts/squad-migrate.mjs";

const SQUADS = {
	FRA: [{ name: "MBAPPE", pos: "FW", club: "Real Madrid" }],
	BRA: [
		{ name: "VINI JR.", pos: "FW", club: "Real Madrid" },
		{ name: "RAPHINHA", pos: "FW", club: "Barcelona" },
	],
};

test("migrateSquads: アクセントのみの改名はエイリアス不要", () => {
	const { squads, aliases, report } = migrateSquads(SQUADS, {
		FRA: { MBAPPE: "Mbappé" },
	});
	assert.equal(squads.FRA[0].name, "Mbappé"); // 改名された
	assert.equal(squads.FRA[0].pos, "FW"); // 他フィールド保持
	assert.equal(aliases.length, 0); // canonical同一→エイリアス不要
	assert.equal(report.renamed, 1);
	assert.equal(report.accentOnly, 1);
	assert.equal(report.aliased, 0);
});

test("migrateSquads: 綴りが変わる改名はエイリアス自動生成", () => {
	const { squads, aliases } = migrateSquads(SQUADS, {
		BRA: { "VINI JR.": "Vinícius Júnior" },
	});
	assert.equal(squads.BRA[0].name, "Vinícius Júnior");
	assert.equal(aliases.length, 1);
	assert.equal(aliases[0].canonical, "BRA::VINICIUS JUNIOR");
	assert.deepEqual(aliases[0].variants, ["VINI JR. (BRA)"]); // 旧予想値を橋渡し
});

test("migrateSquads: mapping に無い選手は不変", () => {
	const { squads, report } = migrateSquads(SQUADS, {
		BRA: { "VINI JR.": "Vinícius Júnior" },
	});
	assert.equal(squads.BRA[1].name, "RAPHINHA"); // 触らない
	assert.equal(report.unchanged, 2); // FRA MBAPPE と BRA RAPHINHA（mapping対象外）
});

test("migrateSquads: 入力は不変（非破壊）", () => {
	const before = JSON.stringify(SQUADS);
	const base = [{ canonical: "X::Y", variants: ["Z"] }];
	const beforeAliases = JSON.stringify(base);
	migrateSquads(SQUADS, { FRA: { MBAPPE: "Mbappé" } }, base);
	assert.equal(JSON.stringify(SQUADS), before);
	assert.equal(JSON.stringify(base), beforeAliases);
});

test("migrateSquads: 既存エイリアスへ追記（重複なし）", () => {
	const base = [
		{ canonical: "BRA::VINICIUS JUNIOR", variants: ["VINI JR. (BRA)"] },
	];
	const { aliases } = migrateSquads(
		SQUADS,
		{ BRA: { "VINI JR.": "Vinícius Júnior" } },
		base,
	);
	assert.equal(aliases.length, 1);
	assert.equal(aliases[0].variants.length, 1); // 既存と同一→増えない
});
