import assert from "node:assert/strict";
import { test } from "node:test";
import {
	getTeamAnalysis,
	hasAnalysis,
	unknownPicks,
	validateDoc,
	validateTeam,
} from "../../public/lib/ai-analysis.js";

const sampleTeam = () => ({
	summary: "南米の強豪。",
	sections: [
		{ id: "profile", heading: "チームの横顔", body: "歴史…" },
		{ id: "style", heading: "プレースタイル", body: "攻撃的…" },
		{ id: "players", heading: "注目選手", body: "…", picks: ["S. GIMENEZ"] },
		{ id: "context", heading: "今大会の構図", body: "鍵は…" },
	],
});
const sampleDoc = () => ({
	generatedAt: "2026-06-11T09:00:00Z",
	model: "@cf/meta/llama-3.3-70b-instruct",
	teams: { MEX: sampleTeam() },
});

test("validateDoc: 正常ドキュメントは ok:true", () => {
	assert.deepEqual(validateDoc(sampleDoc()), { ok: true, errors: [] });
});

test("validateDoc: 必須トップレベル欠落を検出", () => {
	const d = sampleDoc();
	delete d.generatedAt;
	const r = validateDoc(d);
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((m) => m.includes("generatedAt")));
});

test("validateDoc: teams 非オブジェクトは ok:false", () => {
	const r = validateDoc({ generatedAt: "x", model: "m", teams: null });
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((m) => m.includes("teams")));
});

test("validateDoc: teams が配列は ok:false", () => {
	const r = validateDoc({ generatedAt: "x", model: "m", teams: [] });
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((m) => m.includes("teams")));
});

test("validateTeam: id 未定義の section を invalid id として検出", () => {
	const t = sampleTeam();
	t.sections[0] = { heading: "h", body: "b" };
	assert.ok(validateTeam(t).some((m) => m.includes("invalid id")));
});

test("validateTeam: summary 空 / section body 空 を検出", () => {
	const t = sampleTeam();
	t.summary = "  ";
	t.sections[0].body = "";
	const errs = validateTeam(t);
	assert.ok(errs.some((m) => m.includes("summary")));
	assert.ok(errs.some((m) => m.includes("body")));
});

test("validateTeam: 不正な section id を検出", () => {
	const t = sampleTeam();
	t.sections[0].id = "bogus";
	assert.ok(validateTeam(t).some((m) => m.includes("bogus")));
});

test("unknownPicks: 名簿外の picks を返す", () => {
	const squad = [{ pos: "FW", name: "S. GIMENEZ", club: "AC Milan (ITA)" }];
	const t = sampleTeam();
	t.sections[2].picks = ["S. GIMENEZ", "PHANTOM"];
	assert.deepEqual(unknownPicks(t, squad), ["PHANTOM"]);
});

test("unknownPicks: players/picks 無しは空配列", () => {
	const t = { sections: [{ id: "profile", heading: "h", body: "b" }] };
	assert.deepEqual(unknownPicks(t, []), []);
});

test("getTeamAnalysis: 該当チーム取得・無ければ null", () => {
	const d = sampleDoc();
	assert.equal(getTeamAnalysis(d, "MEX").summary, "南米の強豪。");
	assert.equal(getTeamAnalysis(d, "JPN"), null);
	assert.equal(getTeamAnalysis(null, "MEX"), null);
});

test("hasAnalysis: 正常チームは true・不正/不在は false", () => {
	const d = sampleDoc();
	assert.equal(hasAnalysis(d, "MEX"), true);
	assert.equal(hasAnalysis(d, "JPN"), false);
	const bad = sampleDoc();
	bad.teams.MEX.summary = "";
	assert.equal(hasAnalysis(bad, "MEX"), false);
});
