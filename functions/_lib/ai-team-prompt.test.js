import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTeamPrompt } from "../../scripts/lib/ai-team-prompt.mjs";

const input = (over = {}) => ({
	team: { code: "MEX", ja: "メキシコ" },
	group: "A",
	fixtures: [
		{ date: "2026-06-11", a: "MEX", b: "RSA" },
		{ date: "2026-06-18", a: "KOR", b: "MEX" },
	],
	squad: [
		{ pos: "FW", name: "S. GIMENEZ", club: "AC Milan (ITA)" },
		{ pos: "GK", name: "G. OCHOA", club: "AEL Limassol (CYP)" },
	],
	byCode: { MEX: "メキシコ", RSA: "南アフリカ", KOR: "韓国" },
	liveSummary: null,
	...over,
});

test("buildTeamPrompt: チーム名・グループ・対戦相手(日本語)・名簿を含む", () => {
	const p = buildTeamPrompt(input());
	assert.ok(p.includes("メキシコ"));
	assert.ok(p.includes("所属グループ: A"));
	assert.ok(p.includes("南アフリカ"));
	assert.ok(p.includes("韓国"));
	assert.ok(p.includes("S. GIMENEZ"));
});

test("buildTeamPrompt: 名簿外選手禁止の指示を含む", () => {
	const p = buildTeamPrompt(input());
	assert.ok(p.includes("名簿外") || p.includes("この中からのみ"));
});

test("buildTeamPrompt: 注目選手は今シーズンの活躍重視の指示を含む", () => {
	const p = buildTeamPrompt(input());
	assert.ok(p.includes("今シーズンの活躍"));
	assert.ok(p.includes("クラブの格") || p.includes("クラブのレベル"));
});

test("buildTeamPrompt: liveSummary 無しは journey 指示を含まない", () => {
	const p = buildTeamPrompt(input({ liveSummary: null }));
	assert.ok(!p.includes("journey"));
});

test("buildTeamPrompt: liveSummary ありは journey 指示と実績を含む", () => {
	const p = buildTeamPrompt(
		input({ liveSummary: "vs 南アフリカ 2-1（勝利）" }),
	);
	assert.ok(p.includes("journey"));
	assert.ok(p.includes("vs 南アフリカ 2-1"));
});

test("buildTeamPrompt: team が不正なら throw する", () => {
	assert.throws(() => buildTeamPrompt({}));
	assert.throws(() => buildTeamPrompt(null));
});

test("buildTeamPrompt: 自チームを含まない fixture は対戦相手に現れない", () => {
	const p = buildTeamPrompt(
		input({
			fixtures: [
				{ date: "2026-06-11", a: "MEX", b: "RSA" },
				{ date: "2026-06-12", a: "BRA", b: "ARG" },
				{ date: "2026-06-18", a: "KOR", b: "MEX" },
			],
			byCode: {
				MEX: "メキシコ",
				RSA: "南アフリカ",
				KOR: "韓国",
				BRA: "ブラジル",
				ARG: "アルゼンチン",
			},
		}),
	);
	assert.ok(!p.includes("ブラジル"));
	assert.ok(!p.includes("アルゼンチン"));
});
