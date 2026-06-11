# チームAI分析タブ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** チーム詳細に「分析」サブタブを追加し、AIで焼き込んだ各国の読み物プロフィール（静的JSON）を表示する。

**Architecture:** 完全静的・焼き込み方式。開発者がスクリプト `scripts/gen-ai-teams.mjs` を手動実行して `public/data/ai-teams.json` を生成・コミットし、GitHub Actions で自動デプロイ。ランタイムはAIもD1も呼ばず、ブラウザが静的JSONを遅延fetchして描画するのみ。

**Tech Stack:** ESM純ロジック（`public/lib`）＋ `node --test`、Cloudflare Pages、Workers AI REST API（第1段・無料枠）、React(Babel standalone)/`window.WC` グローバル。

参照spec: `docs/superpowers/specs/2026-06-11-ai-team-analysis-design.md`

---

## ファイル構成

- Create `public/lib/ai-analysis.js` — 分析ドキュメントの純ロジック（検証・取得）。ブラウザ/Node 共有・ESM。fetch/DOMに触れない。
- Create `functions/_lib/ai-analysis.test.js` — 上記のユニットテスト。
- Create `scripts/lib/ai-team-prompt.mjs` — チーム分析プロンプト組立（純関数）。
- Create `functions/_lib/ai-team-prompt.test.js` — 上記のユニットテスト。
- Create `scripts/gen-ai-teams.mjs` — 生成オーケストレータ（config取得→プロンプト→Workers AI→検証→部分マージ→書き込み）。
- Create `public/data/ai-teams.json` — 焼き込み済み分析（スクリプト実行で生成）。
- Modify `public/data.js` — `window.WC.AI_ANALYSIS` 状態と `fetchAiAnalysis()` を追加（`fetchLive` と同形の副作用）。
- Modify `public/index.html` — module block で `ai-analysis.js` を `window.WC.aiLib` に露出。`data.js?v` と `screens-teams.jsx?v` をバンプ。
- Modify `public/screens-teams.jsx` — 「分析」サブタブ追加・描画・遅延fetchトリガ。

---

## Task 1: 分析ドキュメントの純ロジック（検証・取得）

**Files:**
- Create: `public/lib/ai-analysis.js`
- Test: `functions/_lib/ai-analysis.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/ai-analysis.test.js`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	validateDoc,
	validateTeam,
	unknownPicks,
	getTeamAnalysis,
	hasAnalysis,
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/_lib/ai-analysis.test.js`
Expected: FAIL（`Cannot find module '../../public/lib/ai-analysis.js'`）

- [ ] **Step 3: 実装を書く**

`public/lib/ai-analysis.js`:

```js
// チームAI分析の純ロジック（ブラウザ/Node 共有・ESM）。
// fetch/DOM には触れない。副作用は呼び出し側（data.js / screens-teams.jsx）が持つ。

// 許可する section id（journey は大会中のみ任意で存在）。
export const SECTION_IDS = ["profile", "style", "players", "context", "journey"];

// 1チーム分の検証。エラーメッセージ配列を返す（空＝OK）。
export function validateTeam(team) {
	const errors = [];
	if (!team || typeof team !== "object") return ["team is not an object"];
	if (typeof team.summary !== "string" || !team.summary.trim())
		errors.push("summary empty");
	if (!Array.isArray(team.sections) || team.sections.length === 0) {
		errors.push("sections empty");
		return errors;
	}
	team.sections.forEach((s, i) => {
		if (!s || typeof s !== "object") {
			errors.push(`section[${i}] not object`);
			return;
		}
		if (!SECTION_IDS.includes(s.id))
			errors.push(`section[${i}] invalid id "${s.id}"`);
		if (typeof s.heading !== "string" || !s.heading.trim())
			errors.push(`section[${i}] heading empty`);
		if (typeof s.body !== "string" || !s.body.trim())
			errors.push(`section[${i}] body empty`);
	});
	return errors;
}

// ドキュメント全体の形を検証。{ ok, errors[] } を返す。
export function validateDoc(doc) {
	const errors = [];
	if (!doc || typeof doc !== "object")
		return { ok: false, errors: ["doc is not an object"] };
	if (typeof doc.generatedAt !== "string" || !doc.generatedAt)
		errors.push("generatedAt missing");
	if (typeof doc.model !== "string" || !doc.model) errors.push("model missing");
	if (!doc.teams || typeof doc.teams !== "object") {
		errors.push("teams missing or not an object");
		return { ok: false, errors };
	}
	for (const [code, team] of Object.entries(doc.teams)) {
		validateTeam(team).forEach((m) => errors.push(`${code}: ${m}`));
	}
	return { ok: errors.length === 0, errors };
}

// players セクションの picks のうち、名簿(squad)に存在しない選手名を返す。
// squad: [{ pos, name, club }]。players/picks 無しは [] を返す。
export function unknownPicks(team, squad) {
	const names = new Set(
		(Array.isArray(squad) ? squad : [])
			.map((p) => p && p.name)
			.filter(Boolean),
	);
	const sections = team && Array.isArray(team.sections) ? team.sections : [];
	const players = sections.find((s) => s && s.id === "players");
	const picks = players && Array.isArray(players.picks) ? players.picks : [];
	return picks.filter((name) => !names.has(name));
}

// ドキュメントから1チームの分析を取得。無ければ null。
export function getTeamAnalysis(doc, code) {
	if (!doc || !doc.teams || !code) return null;
	return doc.teams[code] || null;
}

// 指定チームの分析が存在し描画可能か。
export function hasAnalysis(doc, code) {
	const t = getTeamAnalysis(doc, code);
	return !!(t && validateTeam(t).length === 0);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/ai-analysis.test.js`
Expected: PASS（9 tests）

- [ ] **Step 5: コミット**

```bash
git add public/lib/ai-analysis.js functions/_lib/ai-analysis.test.js
git commit -m "feat(ai-teams): 分析ドキュメントの検証・取得ロジック"
```

---

## Task 2: プロンプト組立（純関数）

**Files:**
- Create: `scripts/lib/ai-team-prompt.mjs`
- Test: `functions/_lib/ai-team-prompt.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/ai-team-prompt.test.js`:

```js
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

test("buildTeamPrompt: liveSummary 無しは journey 指示を含まない", () => {
	const p = buildTeamPrompt(input({ liveSummary: null }));
	assert.ok(!p.includes("journey"));
});

test("buildTeamPrompt: liveSummary ありは journey 指示と実績を含む", () => {
	const p = buildTeamPrompt(input({ liveSummary: "vs 南アフリカ 2-1（勝利）" }));
	assert.ok(p.includes("journey"));
	assert.ok(p.includes("vs 南アフリカ 2-1"));
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/_lib/ai-team-prompt.test.js`
Expected: FAIL（モジュール未定義）

- [ ] **Step 3: 実装を書く**

`scripts/lib/ai-team-prompt.mjs`:

```js
// チーム分析プロンプトの組立（純関数・ESM）。AI呼び出し・I/Oはしない。

// 名簿を "- POS NAME / CLUB" の行テキストにする。
function rosterLines(squad) {
	return (Array.isArray(squad) ? squad : [])
		.map((p) =>
			p && p.name
				? `- ${p.pos || "?"} ${p.name}${p.club ? ` / ${p.club}` : ""}`
				: null,
		)
		.filter(Boolean)
		.join("\n");
}

// 対戦相手リスト（日本語名）。byCode: { code: ja }。
function opponentLines(fixtures, teamCode, byCode) {
	return (Array.isArray(fixtures) ? fixtures : [])
		.map((f) => {
			const oppCode = f.a === teamCode ? f.b : f.a;
			const oppName = (byCode && byCode[oppCode]) || oppCode || "未定";
			return `- ${f.date || "日付未定"} vs ${oppName}`;
		})
		.join("\n");
}

// buildTeamPrompt({ team:{code,ja}, group, fixtures, squad, byCode, liveSummary })
// → モデルに渡すプロンプト文字列。1チーム分のJSONを返すよう指示する。
export function buildTeamPrompt(input) {
	const { team, group, fixtures, squad, byCode, liveSummary } = input || {};
	const roster = rosterLines(squad);
	const opps = opponentLines(fixtures, team.code, byCode);
	const liveBlock = liveSummary
		? `\n## 大会中の実績（必ずこの事実に基づくこと）\n${liveSummary}\n`
		: "";
	const journeyLine = liveSummary
		? `,\n    { "id":"journey","heading":"ここまでの歩み","body":"上記実績の事実に基づく要約" }`
		: "";
	return `あなたはサッカーW杯2026の解説者です。次のチームについて、日本語で中立的な「読み物プロフィール」を書いてください。勝敗の断定予想（優勝確率・突破濃厚など）はしないでください。

# チーム
- 名前: ${team.ja}（${team.code}）
- 所属グループ: ${group || "未定"}

## 対戦相手（事実・この日程に基づくこと）
${opps || "（未定）"}

## 代表メンバー名簿（注目選手はこの中からのみ選ぶこと。名簿外の選手名を出さない）
${roster || "（名簿未登録）"}
${liveBlock}
# 出力形式（厳守）
次のキーだけを持つJSONを1つだけ出力してください。前後に説明文やコードフェンスを付けないこと。picks の各要素は上の名簿の選手名と完全一致させること。
{
  "summary": "2〜3文の概要",
  "sections": [
    { "id":"profile","heading":"チームの横顔","body":"歴史・W杯実績・国内での位置づけ" },
    { "id":"style","heading":"プレースタイル","body":"フォーメーション傾向・攻守の特徴" },
    { "id":"players","heading":"注目選手","body":"2〜3名を取り上げ、なぜ注目かを説明","picks":["名簿のnameと完全一致した選手名"] },
    { "id":"context","heading":"今大会の構図","body":"所属グループ・対戦相手の構図。断定予想はせず『鍵となるのは〜』程度に留める" }${journeyLine}
  ]
}`;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/ai-team-prompt.test.js`
Expected: PASS（4 tests）

- [ ] **Step 5: コミット**

```bash
git add scripts/lib/ai-team-prompt.mjs functions/_lib/ai-team-prompt.test.js
git commit -m "feat(ai-teams): プロンプト組立ロジック"
```

---

## Task 3: 生成オーケストレータ（スクリプト）

I/Oとネットワークを伴うためユニットテスト対象外。純ロジック（Task 1/2）に依存し、自身は薄く保つ。

**Files:**
- Create: `scripts/gen-ai-teams.mjs`

- [ ] **Step 1: 実装を書く**

`scripts/gen-ai-teams.mjs`:

```js
// W杯2026 チームAI分析の生成スクリプト（完全静的・焼き込み）。
//
// 使い方:
//   CF_ACCOUNT_ID=xxx CF_AI_TOKEN=yyy \
//     node scripts/gen-ai-teams.mjs --base https://wcup2026-yosou.pages.dev [--only JPN,BRA] [--with-live] [--model @cf/meta/llama-3.3-70b-instruct]
//
// 入力: <base>/api/config（teams/squads/groups/schedule）。--with-live 時は <base>/api/live。
// 出力: public/data/ai-teams.json（既存があれば成功チームのみ部分マージ）。
// 注意: ネットワーク／課金が発生する。サンドボックス外で実行すること。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildTeamPrompt } from "./lib/ai-team-prompt.mjs";
import { validateTeam, unknownPicks } from "../public/lib/ai-analysis.js";

const OUT = new URL("../public/data/ai-teams.json", import.meta.url);
const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct";

function parseArgs(argv) {
	const a = { base: "http://127.0.0.1:8788", only: null, withLive: false, model: DEFAULT_MODEL };
	for (let i = 0; i < argv.length; i++) {
		const v = argv[i];
		if (v === "--base") a.base = argv[++i];
		else if (v === "--only") a.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
		else if (v === "--with-live") a.withLive = true;
		else if (v === "--model") a.model = argv[++i];
	}
	return a;
}

async function fetchJson(url, label) {
	const res = await fetch(url, { headers: { "User-Agent": "wcup-ai-gen/1.0" } });
	if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
	return res.json();
}

// Workers AI REST 呼び出し。応答テキストを返す。
async function callWorkersAI({ accountId, token, model, prompt }) {
	const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
	const res = await fetch(url, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
	});
	if (!res.ok) throw new Error(`Workers AI HTTP ${res.status}: ${await res.text()}`);
	const json = await res.json();
	const text = json && json.result && json.result.response;
	if (typeof text !== "string" || !text.trim()) throw new Error("Workers AI: 応答テキスト無し");
	return text;
}

// モデル出力から JSON オブジェクトを抽出してパース。
function parseModelJson(text) {
	let s = String(text).trim();
	s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
	const start = s.indexOf("{");
	const end = s.lastIndexOf("}");
	if (start === -1 || end === -1) throw new Error("出力にJSONオブジェクトが無い");
	return JSON.parse(s.slice(start, end + 1));
}

// schedule から teamCode の試合を date 昇順で抽出。
function teamFixtures(schedule, teamCode) {
	return (Array.isArray(schedule) ? schedule : [])
		.filter((m) => m && (m.a === teamCode || m.b === teamCode))
		.sort((x, y) => String(x.date || "").localeCompare(String(y.date || "")));
}

// /api/live から teamCode の終了済み試合を要約文字列にする。無ければ null。
function liveSummaryFor(live, teamCode, byCode) {
	if (!live || !Array.isArray(live.fixtures)) return null;
	const lines = [];
	for (const fx of live.fixtures) {
		const ha = fx.home && fx.home.app_code;
		const aa = fx.away && fx.away.app_code;
		if (ha !== teamCode && aa !== teamCode) continue;
		if (fx.status !== "FT") continue;
		const oppCode = ha === teamCode ? aa : ha;
		const oppName = (byCode && byCode[oppCode]) || oppCode;
		const me = ha === teamCode ? fx.home.score : fx.away.score;
		const op = ha === teamCode ? fx.away.score : fx.home.score;
		lines.push(`- vs ${oppName} ${me}-${op}${fx.result_info ? `（${fx.result_info}）` : ""}`);
	}
	return lines.length ? lines.join("\n") : null;
}

async function loadExisting() {
	try {
		return JSON.parse(await readFile(OUT, "utf8"));
	} catch {
		return { teams: {} };
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const accountId = process.env.CF_ACCOUNT_ID;
	const token = process.env.CF_AI_TOKEN;
	if (!accountId || !token) {
		console.error("CF_ACCOUNT_ID と CF_AI_TOKEN を環境変数に設定してください。");
		process.exit(1);
	}

	console.log(`config 取得: ${args.base}/api/config`);
	const cfg = await fetchJson(`${args.base}/api/config`, "config");
	const teams = Array.isArray(cfg.teams) ? cfg.teams : [];
	const squads = cfg.squads || {};
	const groups = cfg.groups || {};
	const schedule = Array.isArray(cfg.schedule) ? cfg.schedule : [];
	const byCode = {};
	teams.forEach((t) => { byCode[t.code] = t.ja || t.code; });
	const groupOf = (code) =>
		Object.keys(groups).find((k) => Array.isArray(groups[k]) && groups[k].includes(code)) || null;

	let live = null;
	if (args.withLive) {
		try { live = await fetchJson(`${args.base}/api/live`, "live"); }
		catch (e) { console.error(`live 取得失敗（journey 省略）: ${e.message}`); }
	}

	const targetCodes = (args.only || teams.map((t) => t.code)).filter((c) => byCode[c]);
	const existing = await loadExisting();
	const out = {
		generatedAt: new Date().toISOString(),
		model: args.model,
		teams: { ...(existing.teams || {}) },
	};

	const failed = [];
	for (const code of targetCodes) {
		const squad = squads[code] || [];
		const prompt = buildTeamPrompt({
			team: { code, ja: byCode[code] },
			group: groupOf(code),
			fixtures: teamFixtures(schedule, code),
			squad,
			byCode,
			liveSummary: live ? liveSummaryFor(live, code, byCode) : null,
		});

		let ok = false;
		for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
			try {
				const text = await callWorkersAI({ accountId, token, model: args.model, prompt });
				const parsed = parseModelJson(text);
				const errs = validateTeam(parsed);
				const bad = unknownPicks(parsed, squad);
				if (errs.length) throw new Error(`検証NG: ${errs.join("; ")}`);
				if (bad.length) throw new Error(`名簿外選手: ${bad.join(", ")}`);
				out.teams[code] = parsed;
				ok = true;
				console.log(`✓ ${code}`);
			} catch (e) {
				console.error(`  ${code} 試行${attempt} 失敗: ${e.message}`);
			}
		}
		if (!ok) failed.push(code);
	}

	await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
	await writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
	console.log(`書き込み: public/data/ai-teams.json（${Object.keys(out.teams).length} チーム）`);
	if (failed.length) {
		console.error(`\n失敗 ${failed.length} チーム: ${failed.join(", ")}`);
		process.exit(1);
	}
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 構文チェック（実行はしない）**

Run: `node --check scripts/gen-ai-teams.mjs`
Expected: エラー無し（終了コード0）

- [ ] **Step 3: コミット**

```bash
git add scripts/gen-ai-teams.mjs
git commit -m "feat(ai-teams): 生成オーケストレータ(Workers AI REST)"
```

---

## Task 4: フロントのデータ取得（data.js）

**Files:**
- Modify: `public/data.js`（`fetchLive` 定義の直後、`teamLogo` 定義の前あたり）
- Modify: `public/index.html:58`（`data.js?v=10` → `?v=11`）

- [ ] **Step 1: data.js に状態と取得関数を追加**

`public/data.js` の `window.WC.fetchLive = ...};` ブロックの直後に、次を追加する:

```js
	// ---- チームAI分析（静的JSON /data/ai-teams.json）----------------------
	// 焼き込み済みの分析ドキュメント。未取得は null。失敗時も null
	// （フロントは「分析はまだありません」を表示）。一度取得したら再取得しない。
	window.WC.AI_ANALYSIS = null;
	window.WC.fetchAiAnalysis = async function fetchAiAnalysis() {
		if (window.WC.AI_ANALYSIS) return true;
		try {
			const res = await fetch("/data/ai-teams.json", { cache: "no-store" });
			if (!res.ok) return false;
			const doc = await res.json();
			window.WC.AI_ANALYSIS = doc && typeof doc === "object" ? doc : null;
			return !!window.WC.AI_ANALYSIS;
		} catch (e) {
			window.WC.AI_ANALYSIS = null;
			return false;
		}
	};
```

- [ ] **Step 2: index.html のキャッシュバスターをバンプ**

`public/index.html:58` を編集:

```
変更前: <script src="data.js?v=10"></script>
変更後: <script src="data.js?v=11"></script>
```

- [ ] **Step 3: 既存テストが壊れていないことを確認**

Run: `npm test`
Expected: PASS（既存全テスト ＋ Task1/2 の新規テスト）

- [ ] **Step 4: コミット**

```bash
git add public/data.js public/index.html
git commit -m "feat(ai-teams): フロントの分析JSON取得(fetchAiAnalysis)"
```

---

## Task 5: ライブラリ露出（index.html module block）

**Files:**
- Modify: `public/index.html:88-90`（module block）

- [ ] **Step 1: import と window 露出を追加**

`public/index.html` の module block、`import { parseFavs, ... } from './lib/teams.js';` の次の行に追加:

```js
    import { validateDoc, validateTeam, unknownPicks, getTeamAnalysis, hasAnalysis } from './lib/ai-analysis.js';
```

そして `window.WC.teamsLib = { ... };` の次の行に追加:

```js
    window.WC.aiLib = { validateDoc, validateTeam, unknownPicks, getTeamAnalysis, hasAnalysis };
```

- [ ] **Step 2: ローカルで起動確認（手動）**

Run: `npm run dev`
Expected: ブラウザのコンソールで `window.WC.aiLib.getTeamAnalysis` が関数であること。確認後 Ctrl-C。

- [ ] **Step 3: コミット**

```bash
git add public/index.html
git commit -m "feat(ai-teams): aiLib を window.WC に露出"
```

---

## Task 6: 分析サブタブ（screens-teams.jsx）

**Files:**
- Modify: `public/screens-teams.jsx`（`TeamDetail` 内：subtab タブ配列・遅延fetch・描画ブロック。`fmtTeamsDate` 直後に日時整形ヘルパ追加）
- Modify: `public/index.html:112`（`screens-teams.jsx?v=2` → `?v=3`）

- [ ] **Step 1: 日時整形ヘルパを追加**

`public/screens-teams.jsx` の `fmtTeamsDate` 関数定義の直後に追加:

```js
// ISO日時 → "6月11日"。不正値は空文字。
function fmtGenerated(iso) {
	if (!iso) return "";
	const d = new Date(iso);
	if (isNaN(d.getTime())) return "";
	return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}
```

- [ ] **Step 2: subtab タブ配列に「分析」を追加**

`TeamDetail` 内の `DetailTabs` の `tabs` 配列を編集:

```js
変更前:
				tabs={[
					{ id: "squad", label: "メンバー" },
					{ id: "schedule", label: "日程" },
				]}
変更後:
				tabs={[
					{ id: "squad", label: "メンバー" },
					{ id: "schedule", label: "日程" },
					{ id: "analysis", label: "分析" },
				]}
```

- [ ] **Step 3: 分析タブ選択時の遅延fetchを追加**

`TeamDetail` 関数内、`const [subtab, setSubtab] = React.useState("squad");` の直後に追加:

```js
	const [aiTick, setAiTick] = React.useState(0);
	React.useEffect(() => {
		if (subtab !== "analysis") return undefined;
		let alive = true;
		const f = (window.WC.fetchAiAnalysis || (() => Promise.resolve(false)))();
		Promise.resolve(f).then(() => {
			if (alive) setAiTick((n) => n + 1);
		});
		return () => {
			alive = false;
		};
	}, [subtab, code]);
```

- [ ] **Step 4: 分析の描画ブロックを追加**

`TeamDetail` 内、日程ブロック `{subtab === "schedule" && ( ... )}` の直後に追加:

```jsx
			{/* 分析（AI生成・静的JSON） */}
			{subtab === "analysis" &&
				(() => {
					void aiTick; // fetch完了→setAiTick で再描画させるための依存
					const aiLib = window.WC.aiLib || {};
					const doc = window.WC.AI_ANALYSIS;
					const ta = aiLib.getTeamAnalysis
						? aiLib.getTeamAnalysis(doc, code)
						: null;
					if (!ta) {
						return (
							<Card T={T} style={{ padding: "8px 14px 12px", marginTop: 10 }}>
								<div
									style={{
										color: T.faint,
										fontSize: 14,
										padding: "20px 0",
										textAlign: "center",
										fontWeight: 700,
									}}
								>
									分析はまだありません
								</div>
							</Card>
						);
					}
					return (
						<Card T={T} style={{ padding: "12px 14px 14px", marginTop: 10 }}>
							<div
								style={{
									fontSize: 14.5,
									lineHeight: 1.7,
									color: T.text,
									fontWeight: 600,
									marginBottom: 14,
								}}
							>
								{ta.summary}
							</div>
							{ta.sections.map((s) => (
								<div key={s.id} style={{ marginBottom: 14 }}>
									<div
										style={{
											fontSize: 12.5,
											fontWeight: 800,
											color: T.sub,
											marginBottom: 4,
										}}
									>
										{s.heading}
									</div>
									<div
										style={{
											fontSize: 14,
											lineHeight: 1.7,
											color: T.text,
											whiteSpace: "pre-wrap",
										}}
									>
										{s.body}
									</div>
									{s.id === "players" &&
										Array.isArray(s.picks) &&
										s.picks.length > 0 && (
											<div
												style={{
													display: "flex",
													flexWrap: "wrap",
													gap: 6,
													marginTop: 8,
												}}
											>
												{s.picks.map((n) => (
													<span
														key={n}
														style={{
															fontSize: 12,
															fontWeight: 800,
															color: T.sub,
															padding: "3px 10px",
															borderRadius: 999,
															background: "rgba(255,255,255,0.08)",
															boxShadow: `inset 0 0 0 1px ${T.line}`,
														}}
													>
														{n}
													</span>
												))}
											</div>
										)}
								</div>
							))}
							<div
								style={{
									fontSize: 11,
									color: T.faint,
									marginTop: 6,
									paddingTop: 10,
									borderTop: `1px solid ${T.line}`,
								}}
							>
								{doc && doc.generatedAt
									? `${fmtGenerated(doc.generatedAt)}時点・`
									: ""}
								AIが生成した内容です。情報が古い場合があります（特に監督名）。
							</div>
						</Card>
					);
				})()}
```

- [ ] **Step 5: index.html のキャッシュバスターをバンプ**

`public/index.html:112` を編集:

```
変更前: <script type="text/babel" src="screens-teams.jsx?v=2"></script>
変更後: <script type="text/babel" src="screens-teams.jsx?v=3"></script>
```

- [ ] **Step 6: ローカルで目視確認（手動）**

Run: `npm run dev`
Expected: チームタブ → 任意の国 → 「分析」タブが出現。`ai-teams.json` 未配置なら「分析はまだありません」。配置済みなら概要＋4セクション＋picksチップ＋日時注記が表示。確認後 Ctrl-C。

- [ ] **Step 7: 既存テストが壊れていないことを確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add public/screens-teams.jsx public/index.html
git commit -m "feat(ai-teams): チーム詳細に分析タブを追加"
```

---

## Task 7: 初回生成とコミット（運用・手動）

ネットワーク／課金が伴うため、開発者が手動で実行する。第1段は Workers AI 無料枠（10,000 Neurons/日）。一括が枠を超える場合は `--only` で分割。

**Files:**
- Create: `public/data/ai-teams.json`（スクリプト出力）

- [ ] **Step 1: Cloudflare の認証情報を用意**

`CF_ACCOUNT_ID`（アカウントID）と `CF_AI_TOKEN`（Workers AI 実行権限を持つ API トークン）を取得し、シェルに export する。本番には配置しない（ローカル実行時のみ）。

- [ ] **Step 2: 数チームで試作 → 品質確認**

```bash
CF_ACCOUNT_ID=xxx CF_AI_TOKEN=yyy \
  node scripts/gen-ai-teams.mjs --base https://wcup2026-yosou.pages.dev --only JPN,BRA,MEX
```
Expected: `public/data/ai-teams.json` に3チームが生成される。`npm run dev` で実機の見た目と日本語品質を確認。
品質が読み物として不十分なら spec §3 第2段（外部API）へ。`callWorkersAI` を差し替える別タスクを起こす。

- [ ] **Step 3: 全チーム生成**

```bash
CF_ACCOUNT_ID=xxx CF_AI_TOKEN=yyy \
  node scripts/gen-ai-teams.mjs --base https://wcup2026-yosou.pages.dev
```
Expected: 48チーム生成（無料枠超過時は失敗チームを翌日 `--only` で補完）。

- [ ] **Step 4: コミット（→ 自動デプロイ）**

```bash
git add public/data/ai-teams.json
git commit -m "chore(ai-teams): 初回分析データを生成"
```

---

## Self-Review メモ

- spec §2(完全静的) … Task3/7（焼き込み）+ Task4/6（静的fetch・ランタイムAI/D1不使用）でカバー。
- spec §3(段階的AI) … Task3 で Workers AI REST、`callWorkersAI` を差し替え点として分離。第2段は品質判定後に別タスク。
- spec §4(セクション構成) … Task2 プロンプト＋Task6 描画。journey は liveSummary 有時のみ（Task2/3）。
- spec §5(スキーマ＋picks検証) … Task1 `validateTeam`/`unknownPicks`、Task3 で生成時検証。
- spec §6(スクリプト：base/only/with-live/部分マージ/リトライ) … Task3 で全実装。
- spec §7(フロント：lib純ロジック＋tab＋遅延fetch＋?vバンプ) … Task1/4/5/6。
- spec §8(テスト) … Task1/2 でユニットテスト。AI呼び出しは純ロジックと分離済み・スクリプトは対象外。
- 型整合 … `validateTeam`/`unknownPicks`/`getTeamAnalysis`/`hasAnalysis`/`buildTeamPrompt` の名前と引数が Task 間で一致。`window.WC.aiLib`/`window.WC.fetchAiAnalysis`/`window.WC.AI_ANALYSIS` の名前が Task4/5/6 で一致。
