# 試合ライフサイクル連動 AI分析 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スタメン発表 / ハーフタイム / フルタイムの各タイミングで、`worker-watch` が自動でGemini AI分析（数行）を生成し、試合詳細の「AI」タブに表示する。

**Architecture:** 既存の毎分Cron（`worker-watch` → `syncFixtureDetail`）の直後に検知フックを足し、`sm_*`確定データ＋Google検索グラウンディングでGeminiに数行サマリーを生成させ、新テーブル`sm_match_ai`へ冪等保存。`getFixtureDetail`が`ai`配列を同梱し、`AiTab`が時系列描画する。

**Tech Stack:** Cloudflare Workers / Pages Functions（ESM, `node --test`）、D1（SQLite）、Gemini Developer API（`gemini-2.5-pro`＋`google_search`）、React（バンドラ無し`screens-detail.jsx`）。

設計spec: `docs/superpowers/specs/2026-06-12-match-lifecycle-ai-analysis-design.md`

---

## ファイル構成

| ファイル | 責務 | 区分 |
|---|---|---|
| `schema/0011_sm_match_ai.sql` | 本番反映用の移行SQL（`sm_match_ai`） | 新規 |
| `db/schema-watch.sql` | 新規セットアップ用スキーマに同テーブル追記 | 変更 |
| `functions/_lib/ai-match.js` | 純関数(`buildMatchPrompt`/`selectFixturesForAi`)＋AI呼び出し(`callGeminiText`)＋保存オーケストレーション(`generateMatchAi`/`maybeGenerateMatchAi`) | 新規 |
| `functions/_lib/ai-match.test.js` | 上記のユニットテスト | 新規 |
| `functions/_lib/sm-read.js` | `getFixtureDetail` に `ai` 同梱 | 変更 |
| `functions/_lib/sm-read.test.js` | `ai` 同梱のテスト追加 | 変更 |
| `worker-watch/src/index.js` | `scheduled` に `maybeGenerateMatchAi` フック | 変更 |
| `worker-watch/wrangler.toml` | `AI_MATCH_ENABLED` var（secretは別途 `wrangler secret put GEMINI_API_KEY`） | 変更 |
| `public/screens-detail.jsx` | 「AI」タブ追加＋`AiTab` | 変更 |
| `public/index.html` | jsx の `?v=N` 更新 | 変更 |

**API変更は不要**: `/api/fixture` は `getFixtureDetail` の戻り値をそのまま返すため、`ai` 同梱は自動で配信される。

---

## Task 1: スキーマ `sm_match_ai`

**Files:**
- Create: `schema/0011_sm_match_ai.sql`
- Modify: `db/schema-watch.sql`（末尾に追記）

- [ ] **Step 1: 移行SQLを作成**

`schema/0011_sm_match_ai.sql`:
```sql
-- 試合ライフサイクル連動 AI分析（lineup/ht/ft をフェーズごと1行・冪等保存）
CREATE TABLE IF NOT EXISTS sm_match_ai (
  sm_fixture_id INTEGER NOT NULL,
  phase         TEXT    NOT NULL,        -- 'lineup' | 'ht' | 'ft'
  summary       TEXT,                    -- 成功まで NULL（数行サマリー本文）
  model         TEXT,                    -- 'gemini-2.5-pro'
  attempts      INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER,                 -- epoch秒
  PRIMARY KEY (sm_fixture_id, phase)
);
CREATE INDEX IF NOT EXISTS idx_sm_match_ai_fixture ON sm_match_ai (sm_fixture_id);
```

- [ ] **Step 2: 新規セットアップ用スキーマにも同じ定義を追記**

`db/schema-watch.sql` の末尾に上記 `CREATE TABLE`/`CREATE INDEX` をそのまま追記する。

- [ ] **Step 3: ローカルD1に適用して検証**

Run:
```bash
npx wrangler d1 execute wcup2026-db --local --file=schema/0011_sm_match_ai.sql
npx wrangler d1 execute wcup2026-db --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name='sm_match_ai';"
```
Expected: 出力に `sm_match_ai` が1行表示される。

- [ ] **Step 4: Commit**

```bash
git add schema/0011_sm_match_ai.sql db/schema-watch.sql
git commit -m "feat(watch): sm_match_ai テーブル（試合AI分析の保存先）"
```

---

## Task 2: `buildMatchPrompt`（純関数）

**Files:**
- Create: `functions/_lib/ai-match.js`
- Test: `functions/_lib/ai-match.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/ai-match.test.js`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMatchPrompt } from "./ai-match.js";

const baseDetail = {
	fixture: {
		home_name: "日本", away_name: "ブラジル",
		home_score: 1, away_score: 2, home_xg: 1.3, away_xg: 1.8,
		state_id: 5, round_name: "グループF",
	},
	events: [
		{ minute: 23, type: "goal", team_id: 10, player_name: "三笘" },
		{ minute: 40, type: "goal", team_id: 20, player_name: "ヴィニシウス" },
	],
	stats: [
		{ team_id: 10, type_id: 5304, value: 1.3 },
		{ team_id: 10, type_id: 42, value: 8 },
	],
	lineups: [
		{ team_id: 10, player_name: "遠藤", position: "MF", club_name: "Liverpool", is_start: 1, formation_field: "2:2" },
		{ team_id: 20, player_name: "ヴィニシウス", position: "FW", club_name: "Real Madrid", is_start: 1, formation_field: "4:1" },
	],
};

test("buildMatchPrompt: lineup フェーズは布陣と先発を含む", () => {
	const p = buildMatchPrompt("lineup", baseDetail);
	assert.match(p, /日本/);
	assert.match(p, /ブラジル/);
	assert.match(p, /遠藤/);
	assert.match(p, /Liverpool/);
	assert.match(p, /数値.*正/); // 制約文（Web検索は文脈のみ）
});

test("buildMatchPrompt: ht/ft はスコアとxGを含む", () => {
	const p = buildMatchPrompt("ft", baseDetail);
	assert.match(p, /1\s*-\s*2|1-2/);
	assert.match(p, /1\.3/);
	assert.match(p, /三笘|ヴィニシウス/);
});

test("buildMatchPrompt: xG欠損でも壊れない（graceful）", () => {
	const d = { ...baseDetail, fixture: { ...baseDetail.fixture, home_xg: null, away_xg: null } };
	const p = buildMatchPrompt("ht", d);
	assert.ok(typeof p === "string" && p.length > 0);
	assert.doesNotMatch(p, /null/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`buildMatchPrompt` が未定義 / `ai-match.js` が無い）。

- [ ] **Step 3: 最小実装を書く**

`functions/_lib/ai-match.js`（このタスク分のみ）:
```js
// 試合ライフサイクル連動 AI分析: プロンプト組立(純関数)・AI呼び出し・保存。
// 数値は sm_* 確定値を正とし、Google検索グラウンディングは文脈の肉付けのみ。

// 既知の team stat type_id → 日本語ラベル（欠損・未知は畳む）
const STAT_LABELS = { 5304: "xG", 42: "シュート", 86: "枠内", 45: "支配率%" };

const PHASE_GOAL = {
	lineup: "スタメンと布陣から、注目の対決と勝敗の鍵を日本語で2〜3文にまとめてください。",
	ht: "前半の流れ（スコア・xG・主なイベント）を踏まえ、後半の見どころを日本語で2〜3文にまとめてください。",
	ft: "試合結果（スコア・xG・主なイベント）から、勝敗の要因とMVPを日本語で2〜3文にまとめてください。",
};

const CONSTRAINT =
	"制約: スコア・xG・統計などの数値は与えたデータを正とし、推測で上書きしないこと。Web検索は選手の調子や話題など文脈の肉付けにのみ使うこと。";

function lineupLines(detail) {
	const xi = (detail.lineups || []).filter((p) => p.is_start === 1);
	return xi
		.map((p) =>
			`- ${p.position || "?"} ${p.player_name || "?"}${p.club_name ? ` / ${p.club_name}` : ""}${p.formation_field ? ` [${p.formation_field}]` : ""}`,
		)
		.join("\n");
}

function eventLines(detail) {
	return (detail.events || [])
		.map((e) => `- ${e.minute ?? "?"}' ${e.type || ""} ${e.player_name || ""}`.trim())
		.join("\n");
}

function statLines(detail) {
	const byTeam = new Map();
	for (const s of detail.stats || []) {
		const label = STAT_LABELS[s.type_id];
		if (!label || s.value == null) continue;
		const arr = byTeam.get(s.team_id) || [];
		arr.push(`${label}=${s.value}`);
		byTeam.set(s.team_id, arr);
	}
	return [...byTeam.entries()].map(([t, arr]) => `- team ${t}: ${arr.join(", ")}`).join("\n");
}

export function buildMatchPrompt(phase, detail) {
	const f = (detail && detail.fixture) || {};
	const head = `${f.home_name ?? "Home"} vs ${f.away_name ?? "Away"}（${f.round_name ?? ""}）`;
	const parts = [PHASE_GOAL[phase] || PHASE_GOAL.ft, CONSTRAINT, "", head];

	if (phase !== "lineup") {
		if (f.home_score != null && f.away_score != null) {
			parts.push(`スコア: ${f.home_score} - ${f.away_score}`);
		}
		if (f.home_xg != null || f.away_xg != null) {
			parts.push(`xG: ${f.home_xg ?? "—"} - ${f.away_xg ?? "—"}`);
		}
		const evs = eventLines(detail);
		if (evs) parts.push("主なイベント:\n" + evs);
		const st = statLines(detail);
		if (st) parts.push("チーム統計:\n" + st);
	}

	const xi = lineupLines(detail);
	if (xi) parts.push("先発(両チーム):\n" + xi);

	return parts.filter((s) => s !== "").join("\n");
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS（buildMatchPrompt の3テスト）。

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/ai-match.js functions/_lib/ai-match.test.js
git commit -m "feat(watch): 試合AI分析のプロンプト組立(buildMatchPrompt)"
```

---

## Task 3: `selectFixturesForAi`（純関数・検知ロジック）

**Files:**
- Modify: `functions/_lib/ai-match.js`
- Modify: `functions/_lib/ai-match.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/ai-match.test.js` に追記:
```js
import { selectFixturesForAi } from "./ai-match.js";

// fixtureRows: { sm_fixture_id, state_id, start_xi_count }
// existing:    Map<"fixtureId:phase", { summary, attempts }>
test("selectFixturesForAi: 先発22名でlineupを発火", () => {
	const rows = [{ sm_fixture_id: 1, state_id: 1, start_xi_count: 22 }];
	const out = selectFixturesForAi(rows, new Map(), 10);
	assert.deepEqual(out, [{ fixtureId: 1, phase: "lineup" }]);
});

test("selectFixturesForAi: 先発が揃わない間は発火しない", () => {
	const rows = [{ sm_fixture_id: 1, state_id: 1, start_xi_count: 11 }];
	assert.deepEqual(selectFixturesForAi(rows, new Map(), 10), []);
});

test("selectFixturesForAi: HT(3)とFT(5/7/8)を発火", () => {
	const rows = [
		{ sm_fixture_id: 1, state_id: 3, start_xi_count: 22 },
		{ sm_fixture_id: 2, state_id: 7, start_xi_count: 22 },
	];
	const out = selectFixturesForAi(rows, new Map(), 10);
	assert.deepEqual(out, [
		{ fixtureId: 1, phase: "ht" },
		{ fixtureId: 2, phase: "ft" },
	]);
});

test("selectFixturesForAi: 生成済み(summary有)はスキップ、attempts>=3もスキップ", () => {
	const rows = [
		{ sm_fixture_id: 1, state_id: 3, start_xi_count: 22 },
		{ sm_fixture_id: 2, state_id: 3, start_xi_count: 22 },
	];
	const existing = new Map([
		["1:ht", { summary: "済み", attempts: 1 }],
		["2:ht", { summary: null, attempts: 3 }],
	]);
	assert.deepEqual(selectFixturesForAi(rows, existing, 10), []);
});

test("selectFixturesForAi: 1tick上限でキャップ", () => {
	const rows = [1, 2, 3, 4].map((id) => ({ sm_fixture_id: id, state_id: 5, start_xi_count: 22 }));
	const out = selectFixturesForAi(rows, new Map(), 2);
	assert.equal(out.length, 2);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`selectFixturesForAi` が未定義）。

- [ ] **Step 3: 最小実装を書く**

`functions/_lib/ai-match.js` に追記:
```js
// state_id → フェーズ（該当しなければ null）。HT は 3、FT は 5/7/8、lineup は NS(1)。
function phaseForState(stateId, startXiCount) {
	if (stateId === 1) return startXiCount >= 22 ? "lineup" : null;
	if (stateId === 3) return "ht";
	if (stateId === 5 || stateId === 7 || stateId === 8) return "ft";
	return null;
}

// 生成可能か（行が無い、または summary未充填かつ attempts<3）
function isGeneratable(existing, fixtureId, phase) {
	const cur = existing.get(`${fixtureId}:${phase}`);
	if (!cur) return true;
	return cur.summary == null && (cur.attempts || 0) < 3;
}

// 生成すべき {fixtureId, phase} を返す。cap で 1tick あたりの件数を制限。
export function selectFixturesForAi(fixtureRows, existing, cap) {
	const out = [];
	for (const r of fixtureRows || []) {
		const phase = phaseForState(r.state_id, r.start_xi_count || 0);
		if (!phase) continue;
		if (!isGeneratable(existing, r.sm_fixture_id, phase)) continue;
		out.push({ fixtureId: r.sm_fixture_id, phase });
		if (out.length >= cap) break;
	}
	return out;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS（selectFixturesForAi の5テスト）。

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/ai-match.js functions/_lib/ai-match.test.js
git commit -m "feat(watch): 試合AI分析の検知ロジック(selectFixturesForAi)"
```

---

## Task 4: `callGeminiText`（Gemini呼び出し・fetch注入でテスト）

**Files:**
- Modify: `functions/_lib/ai-match.js`
- Modify: `functions/_lib/ai-match.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/ai-match.test.js` に追記:
```js
import { callGeminiText } from "./ai-match.js";

function fakeFetchOk(text) {
	return async () => ({
		ok: true,
		json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
	});
}

test("callGeminiText: 応答本文を返す", async () => {
	const out = await callGeminiText({
		apiKey: "k", model: "gemini-2.5-pro", prompt: "p", fetchImpl: fakeFetchOk("分析です"),
	});
	assert.equal(out, "分析です");
});

test("callGeminiText: HTTPエラーで例外", async () => {
	const fetchErr = async () => ({ ok: false, status: 500, text: async () => "boom" });
	await assert.rejects(
		() => callGeminiText({ apiKey: "k", model: "m", prompt: "p", fetchImpl: fetchErr }),
		/Gemini HTTP 500/,
	);
});

test("callGeminiText: 空応答で例外", async () => {
	const fetchEmpty = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "" }] }, finishReason: "SAFETY" }] }) });
	await assert.rejects(
		() => callGeminiText({ apiKey: "k", model: "m", prompt: "p", fetchImpl: fetchEmpty }),
		/応答が空/,
	);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`callGeminiText` が未定義）。

- [ ] **Step 3: 最小実装を書く**

`functions/_lib/ai-match.js` に追記（`gen-ai-teams.mjs` の `callGemini`/`extractGeminiText` を移植。`fetchImpl` 注入でテスト可能に）:
```js
// generateContent 応答から本文テキストを取り出す。
function extractGeminiText(json, label) {
	const cand = json && json.candidates && json.candidates[0];
	const parts = cand && cand.content && cand.content.parts;
	const text = Array.isArray(parts) ? parts.map((p) => p.text || "").join("") : "";
	if (!text.trim()) {
		const fr = cand && cand.finishReason;
		throw new Error(`${label}: 応答が空${fr ? `（finishReason=${fr}）` : ""}`);
	}
	return text;
}

// Gemini Developer API 呼び出し（Google検索グラウンディング有効）。応答テキストを返す。
export async function callGeminiText({ apiKey, model, prompt, fetchImpl }) {
	const doFetch = fetchImpl || fetch;
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
	const res = await doFetch(url, {
		method: "POST",
		headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
		body: JSON.stringify({
			contents: [{ role: "user", parts: [{ text: prompt }] }],
			tools: [{ google_search: {} }],
			generationConfig: { temperature: 0.7 },
		}),
	});
	if (!res.ok) {
		throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
	}
	return extractGeminiText(await res.json(), "Gemini");
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS（callGeminiText の3テスト）。

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/ai-match.js functions/_lib/ai-match.test.js
git commit -m "feat(watch): Gemini呼び出し(callGeminiText・grounding)"
```

---

## Task 5: `getFixtureDetail` に `ai` 同梱

**Files:**
- Modify: `functions/_lib/sm-read.js`（`getFixtureDetail`）
- Modify: `functions/_lib/sm-read.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-read.test.js` の `makeFakeDb` に `matchAi` 分岐を追加し、テストを追記:

`makeFakeDb` の引数とディスパッチに以下を追加（`all()` 内分岐の先頭に置く＝他テーブル名と衝突しないよう最初に判定）:
```js
// makeFakeDb({..., matchAi = []}) を追加し、all() 内の分岐先頭に:
if (sql.includes("sm_match_ai")) { results = matchAi; }
else if (sql.includes("sm_player_stats")) { /* 既存 */ }
```

追記テスト:
```js
test("getFixtureDetail: ai は summary のある行のみ同梱", async () => {
	const db = makeFakeDb({
		fixture: [{ sm_fixture_id: 1, state_id: 5 }],
		matchAi: [
			{ phase: "lineup", summary: "布陣分析", model: "gemini-2.5-pro", updated_at: 100 },
			{ phase: "ft", summary: "総括", model: "gemini-2.5-pro", updated_at: 200 },
		],
	});
	const d = await getFixtureDetail(db, 1);
	assert.equal(d.ai.length, 2);
	assert.deepEqual(d.ai.map((a) => a.phase), ["lineup", "ft"]);
	assert.equal(d.ai[0].summary, "布陣分析");
	assert.equal(d.ai[0].generated_at, 100);
});

test("getFixtureDetail: ai が無ければ空配列", async () => {
	const db = makeFakeDb({ fixture: [{ sm_fixture_id: 1 }] });
	const d = await getFixtureDetail(db, 1);
	assert.deepEqual(d.ai, []);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`d.ai` が undefined）。

- [ ] **Step 3: 最小実装を書く**

`functions/_lib/sm-read.js` の `getFixtureDetail` 内、`player_stats` 取得の後・`return` の前に追加し、return を置換:
```js
	const aiRows = await all(
		"SELECT phase, summary, model, updated_at FROM sm_match_ai WHERE sm_fixture_id = ? AND summary IS NOT NULL ORDER BY updated_at ASC",
	);
	const ai = aiRows.map((r) => ({
		phase: r.phase,
		summary: r.summary,
		model: r.model ?? null,
		generated_at: r.updated_at ?? null,
	}));
	return { fixture, events, stats, lineups, player_stats, ai };
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/sm-read.js functions/_lib/sm-read.test.js
git commit -m "feat(watch): /api/fixture detail に ai 分析を同梱"
```

---

## Task 6: 保存オーケストレーション `generateMatchAi` / `maybeGenerateMatchAi`

**Files:**
- Modify: `functions/_lib/ai-match.js`
- Modify: `functions/_lib/ai-match.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/ai-match.test.js` に追記。D1 風 fake-db（`prepare().bind().run()/all()`）と依存注入:
```js
import { generateMatchAi } from "./ai-match.js";

function makeWriteDb() {
	const runs = [];
	const db = {
		prepare: (sql) => ({
			bind: (...args) => ({
				run: async () => { runs.push({ sql, args }); return { success: true }; },
				all: async () => ({ results: [] }),
			}),
		}),
		_runs: runs,
	};
	return db;
}

test("generateMatchAi: 成功時に summary を upsert", async () => {
	const db = makeWriteDb();
	await generateMatchAi({
		db, fixtureId: 1, phase: "ft", apiKey: "k", model: "gemini-2.5-pro", now: 1000,
		getDetail: async () => ({ fixture: { home_name: "A", away_name: "B", home_score: 1, away_score: 0 }, events: [], stats: [], lineups: [] }),
		callAi: async () => "総括テキスト",
	});
	const w = db._runs.find((r) => r.sql.includes("INSERT INTO sm_match_ai"));
	assert.ok(w, "upsert が実行される");
	assert.ok(w.args.includes("総括テキスト"));
});

test("generateMatchAi: AI失敗時は summary を書かず attempts を加算", async () => {
	const db = makeWriteDb();
	await generateMatchAi({
		db, fixtureId: 1, phase: "ft", apiKey: "k", model: "m", now: 1000,
		getDetail: async () => ({ fixture: {}, events: [], stats: [], lineups: [] }),
		callAi: async () => { throw new Error("AI down"); },
	});
	const w = db._runs.find((r) => r.sql.includes("INSERT INTO sm_match_ai"));
	assert.ok(w, "失敗でも attempts upsert は実行される");
	assert.ok(!w.args.includes("総括テキスト"));
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`generateMatchAi` が未定義）。

- [ ] **Step 3: 最小実装を書く**

`functions/_lib/ai-match.js` の先頭付近に import を追加:
```js
import { getFixtureDetail } from "./sm-read.js";
```
末尾に追記:
```js
const SUCCESS_SQL = `INSERT INTO sm_match_ai (sm_fixture_id, phase, summary, model, attempts, updated_at)
VALUES (?, ?, ?, ?, 1, ?)
ON CONFLICT(sm_fixture_id, phase) DO UPDATE SET
  summary=excluded.summary, model=excluded.model, attempts=sm_match_ai.attempts+1, updated_at=excluded.updated_at`;

const FAIL_SQL = `INSERT INTO sm_match_ai (sm_fixture_id, phase, summary, model, attempts, updated_at)
VALUES (?, ?, NULL, NULL, 1, ?)
ON CONFLICT(sm_fixture_id, phase) DO UPDATE SET
  attempts=sm_match_ai.attempts+1, updated_at=excluded.updated_at`;

// 1件のAI分析を生成して保存。getDetail/callAi は注入可能（既定は本番実装）。
export async function generateMatchAi({ db, fixtureId, phase, apiKey, model, now, getDetail, callAi }) {
	const fetchDetail = getDetail || ((id) => getFixtureDetail(db, id));
	const ai = callAi || ((prompt) => callGeminiText({ apiKey, model, prompt }));
	try {
		const detail = await fetchDetail(fixtureId);
		if (!detail) throw new Error("detail not found");
		const prompt = buildMatchPrompt(phase, detail);
		const summary = (await ai(prompt)).trim();
		await db.prepare(SUCCESS_SQL).bind(fixtureId, phase, summary, model, now).run();
		return { ok: true };
	} catch (err) {
		await db.prepare(FAIL_SQL).bind(fixtureId, phase, now).run();
		return { ok: false, error: err?.message };
	}
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: `maybeGenerateMatchAi` を追加（検知→順次生成）**

`functions/_lib/ai-match.js` に追記:
```js
const DEFAULT_CAP = 3;
const DEFAULT_MODEL = "gemini-2.5-pro";

// ±36h 窓の fixture と既存 sm_match_ai から検知し、上限内で生成する。
// 集計を返す: { lineup, ht, ft }
export async function maybeGenerateMatchAi(db, now, { apiKey, model = DEFAULT_MODEL, cap = DEFAULT_CAP, windowSec = 36 * 60 * 60 } = {}) {
	const fxRes = await db
		.prepare(
			`SELECT f.sm_fixture_id, f.state_id,
        (SELECT COUNT(*) FROM sm_lineups l WHERE l.sm_fixture_id = f.sm_fixture_id AND l.is_start = 1) AS start_xi_count
       FROM sm_fixtures f WHERE f.starting_at_ts BETWEEN ? AND ?`,
		)
		.bind(now - windowSec, now + windowSec)
		.all();
	const rows = Array.isArray(fxRes?.results) ? fxRes.results : [];

	const aiRes = await db.prepare("SELECT sm_fixture_id, phase, summary, attempts FROM sm_match_ai").all();
	const existing = new Map();
	for (const r of Array.isArray(aiRes?.results) ? aiRes.results : []) {
		existing.set(`${r.sm_fixture_id}:${r.phase}`, { summary: r.summary, attempts: r.attempts });
	}

	const targets = selectFixturesForAi(rows, existing, cap);
	const agg = { lineup: 0, ht: 0, ft: 0 };
	for (const t of targets) {
		const r = await generateMatchAi({ db, fixtureId: t.fixtureId, phase: t.phase, apiKey, model, now });
		if (r.ok) agg[t.phase] += 1;
	}
	return agg;
}
```

- [ ] **Step 6: 全テスト→Commit**

```bash
npm test
git add functions/_lib/ai-match.js functions/_lib/ai-match.test.js
git commit -m "feat(watch): 試合AI分析の生成・保存(generateMatchAi/maybeGenerateMatchAi)"
```

---

## Task 7: `worker-watch` にフック

**Files:**
- Modify: `worker-watch/src/index.js`
- Modify: `worker-watch/wrangler.toml`

- [ ] **Step 1: import を追加**

`worker-watch/src/index.js` の import 群に追記:
```js
import { maybeGenerateMatchAi } from "../../functions/_lib/ai-match.js";
```

- [ ] **Step 2: 詳細同期 try/catch の「外」にAIフックを追加**

`scheduled` の `else`（毎分ライブ）内、既存「詳細同期」`try{...}catch{...}` の直後に独立ブロックで追加:
```js
			// AI分析: スタメン/HT/FT の検知駆動生成（詳細同期とは別の障害隔離）
			if (env.AI_MATCH_ENABLED === "true" && env.GEMINI_API_KEY) {
				try {
					const ai = await maybeGenerateMatchAi(env.DB, now, { apiKey: env.GEMINI_API_KEY });
					console.log(`watch-cron: ai lineup=${ai.lineup} ht=${ai.ht} ft=${ai.ft}`);
				} catch (e) {
					console.error("watch-cron: ai gen error", e?.message);
				}
			}
```

- [ ] **Step 3: `wrangler.toml` に var を追加**

`worker-watch/wrangler.toml` の `[vars]`（無ければ新設）に:
```toml
[vars]
AI_MATCH_ENABLED = "false"
```

- [ ] **Step 4: 全テストを実行（リグレッション確認）**

Run: `npm test`
Expected: PASS（既存＋新規すべて）。

- [ ] **Step 5: Commit（有効化はまだしない）**

```bash
git add worker-watch/src/index.js worker-watch/wrangler.toml
git commit -m "feat(watch): worker-watch に試合AI分析フック(既定OFF)"
```

---

## Task 8: UI「AI」タブ

**Files:**
- Modify: `public/screens-detail.jsx`
- Modify: `public/index.html`（`?v=N`）

- [ ] **Step 1: タブ配列に AI を追加**

`public/screens-detail.jsx` の TABS 定義（`{ id: "xg", label: "xG" }` 等の配列・10行付近）に追加:
```jsx
	{ id: "ai", label: "AI" },
```
（並びは timeline / ai / xg / lineup / stats を推奨＝速報性の高いAIを上位に。実コードの配列順に合わせて挿入。）

- [ ] **Step 2: `AiTab` コンポーネントを追加**

`XgTab` の近くに追加:
```jsx
// ── AiTab ───────────────────────────────────────────────────────────────
// detail.ai を時系列(lineup→ht→ft)でカード表示。空ならプレースホルダ。
const AI_PHASE_META = {
	lineup: { label: "スタメン分析", order: 0 },
	ht: { label: "ハーフタイム分析", order: 1 },
	ft: { label: "試合総括", order: 2 },
};

function AiTab({ T, detail }) {
	const ai = (detail && detail.ai) || [];
	if (ai.length === 0) {
		return (
			<div style={{ padding: 24, textAlign: "center", color: T.sub, fontSize: 13 }}>
				AI分析は試合の進行に合わせて表示されます
			</div>
		);
	}
	const sorted = [...ai].sort(
		(a, b) => (AI_PHASE_META[a.phase]?.order ?? 9) - (AI_PHASE_META[b.phase]?.order ?? 9),
	);
	return (
		<div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
			{sorted.map((a) => (
				<div key={a.phase} style={{ background: T.card, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
					<div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 }}>
						{AI_PHASE_META[a.phase]?.label || a.phase}
					</div>
					<div style={{ fontSize: 13, lineHeight: 1.7, color: T.text, whiteSpace: "pre-wrap" }}>
						{a.summary}
					</div>
				</div>
			))}
		</div>
	);
}
```
（`T.card`/`T.border`/`T.text`/`T.sub` は同ファイルの既存テーマキーに合わせ、無いキーは既存タブが使う名前に置換。）

- [ ] **Step 3: タブ切替の描画分岐に `ai` を追加**

`tab === "xg"` で `XgTab` を出している箇所に並べて:
```jsx
	{tab === "ai" && <AiTab T={T} detail={detail} />}
```

- [ ] **Step 4: `index.html` の `?v=N` を更新**

`public/index.html` の `screens-detail.jsx?v=<現在値>` を次番号へ増やす（jsx変更の本番反映に必須）。

- [ ] **Step 5: ローカルで目視確認**

Run: `npx wrangler pages dev public`
手順: 検証用 seed の fixture 詳細を開き、「AI」タブにカード表示／空時のプレースホルダを確認。
seed例（`db/seed-detail-*.sql` に追記）:
```sql
INSERT INTO sm_match_ai VALUES (<fixture>, 'ft', '総括テキスト', 'gemini-2.5-pro', 1, 0);
```

- [ ] **Step 6: Commit**

```bash
git add public/screens-detail.jsx public/index.html
git commit -m "feat(detail): 試合詳細に AI 分析タブを追加"
```

---

## Task 9: 本番反映と有効化（運用手順）

- [ ] **Step 1: 本番D1にスキーマ適用**

```bash
npx wrangler d1 execute wcup2026-db --remote --file=schema/0011_sm_match_ai.sql
```

- [ ] **Step 2: worker-watch に secret を設定**

```bash
cd worker-watch && npx wrangler secret put GEMINI_API_KEY
```
（チームAI生成に使った Gemini Developer API キーを投入。）

- [ ] **Step 3: PRを作成してデプロイ**

```bash
git push -u origin feat/match-ai-analysis
gh pr create --fill
```
（Pages: PR→preview / main→本番。worker-watch のデプロイ経路はデプロイ運用フローに従う。）

- [ ] **Step 4: 1試合で検証 → 有効化**

`AI_MATCH_ENABLED="false"` のまま、worker-watch 手動トリガ（`/?action=fixture&id=<検証fixture>&key=<WATCH_CRON_KEY>`）で詳細同期し、`sm_match_ai` に手 seed して UI 確認。問題なければ `AI_MATCH_ENABLED="true"` に変更して再デプロイ。検証 fixture で lineup → ht → ft の3カードが順に出ることを確認。

---

## セルフレビュー結果

- **spec網羅**: 保存(T1)/検知(T3)/生成(T2,T4,T6)/配信(T5)/UI(T8)/フック(T7)/運用(T9) を全カバー。
- **型整合**: `selectFixturesForAi`→`{fixtureId, phase}`、`maybeGenerateMatchAi`→`generateMatchAi` 同名一貫。`getFixtureDetail` の `ai` 要素は `{phase, summary, model, generated_at}` で T5↔T8 一致。
- **プレースホルダ無**: 各ステップに実コード／実コマンド／期待結果。
- **実装時の確認事項**: (a) `state_id==3`＝HT を SportMonks types で最終確認。(b) `sm_lineups.is_start` 実値(1/0)を seed で確認。(c) `screens-detail.jsx` のテーマキー名・TABS配列順・タブ描画分岐の実書式に合わせる。
