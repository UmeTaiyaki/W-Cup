# 試合前カード H2H 差し替え Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カルーセル試合前カードの「応援カウント＋比率バー」を、両代表の通算対戦成績（H2H: Win-Draw-Loss）バーに差し替える（応援ボタン・演出・シェアは維持）。

**Architecture:** 既存 `cheer` と同じ「Cron 事前取得 → D1 → API → クライアントプール → 描画」パターンを踏襲。SportMonks H2H を daily Cron（`worker-watch`）で取得し D1 `sm_h2h` に home 視点 W-D-L を保存、`/api/h2h` で配信、`CheerBar` がバーを描画。純関数（集計・パース）は `functions/_lib/sm-h2h.js` に隔離して単体テスト。

**Tech Stack:** Cloudflare Pages Functions + Workers（worker-watch）+ D1（wcup2026-db）/ React（Babel standalone, `.jsx`）/ `node:test`。

## Global Constraints

- 機能フラグ `H2H_ENABLED`。`!== "true"` で `/api/h2h` は `{ enabled:false }`、フロントはバー非表示（応援ボタンは表示）。cheer の `CHEER_ENABLED` と同方針。
- 障害隔離: テーブル未作成・API 失敗・解決不能 fixture は **例外を投げず**スキップ／空返却（200）。既存 cron・他 fixture を止めない。
- `cheer` バックエンド（D1 `cheer_counts` / `/api/cheer` / `functions/_lib/cheer.js` / `functions/api/cheer.js`）は**削除しない**。フロントから書き込みを止めるだけ。
- `.jsx` または `public/*.js` を変更したら `public/index.html` の対応する `?v=N` を必ずバンプ（[[wcup-deploy-flow]]）。
- D1 マイグレーションは CI 自動実行されない。本番反映は `npx wrangler d1 execute wcup2026-db --remote --file=...` を手動実行（残作業に明記）。
- 純関数（SQL 生成・集計・パース）はテスト可能な形で `_lib` に置き、D1/ネットワーク副作用と分離する（既存 sm-store/sm-sync の方針）。
- 向き（どちらの勝ち星か）は `app_code` で判定する。`home_code === a.code` のとき a=home 視点、そうでなければ反転して a 基準に揃える。

---

## File Structure

- Create: `functions/_lib/sm-h2h.js` — 純関数（`extractH2HResult` / `aggregateH2H` / `rowsToH2H` / `H2H_WINDOW_DAYS`）。
- Create: `functions/_lib/sm-h2h.test.js` — 上記純関数の単体テスト。
- Create: `functions/api/h2h.js` — `GET /api/h2h?fixtures=...` ハンドラ。
- Create: `functions/api/h2h.test.js` — ハンドラのフェイク D1 テスト。
- Create: `schema/0013_sm_h2h.sql` — `sm_h2h` テーブル DDL。
- Modify: `functions/_lib/sm-store.js` — `h2hStatement(row, updatedAt)` を追加・export。
- Modify: `functions/_lib/sm-sync.js` — `syncH2H(footballClient, db, now, opts)` を追加・export。
- Modify: `functions/_lib/sm-sync.test.js` — `syncH2H` のテストを追加。
- Modify: `worker-watch/src/index.js` — daily ブランチで `syncH2H` を呼ぶ。
- Modify: `worker-watch/wrangler.toml` — `[vars] H2H_ENABLED = "true"`。
- Modify: `wrangler.toml`（Pages）— `[vars] H2H_ENABLED = "true"`。
- Create: `public/h2h-core.js` — 読み取り専用クライアントプール `window.WC.h2h`。
- Modify: `public/screens-home.jsx` — `CheerBar` のバー差し替え・購読先変更・tap 書込除去。
- Modify: `public/cheer-share.js` — シェア画像のカウントバーを H2H バーに置換。
- Modify: `public/index.html` — `h2h-core.js` script 追加＋ `screens-home.jsx` / `cheer-share.js` の `?v` バンプ。

---

## Task 1: SportMonks H2H レスポンス probe（実形確定）

**Files:**
- Create: `scripts/h2h-probe/probe.mjs`（使い捨て。コミット任意）

**Interfaces:**
- Produces: SportMonks H2H レスポンスの実構造（`Task 2` の `extractH2HResult` パーサが消費するフィールド名を確定）。

- [ ] **Step 1: probe スクリプトを書く**

`scripts/h2h-probe/probe.mjs`:

```js
// 使い捨て: SportMonks H2H の実レスポンス構造を確認する。
// 実行: SPORTMONKS_TOKEN=xxx node scripts/h2h-probe/probe.mjs <teamId1> <teamId2>
const token = process.env.SPORTMONKS_TOKEN;
if (!token) throw new Error("SPORTMONKS_TOKEN required");
const [, , t1 = "18", t2 = "83"] = process.argv; // 既定は適当な2チーム
const base = "https://api.sportmonks.com/v3/football";
const url = `${base}/fixtures/head-to-head/${t1}/${t2}?include=participants;scores`;
const res = await fetch(url, { headers: { Authorization: token } });
console.log("status", res.status);
const body = await res.json();
const first = Array.isArray(body?.data) ? body.data[0] : null;
console.log("count", Array.isArray(body?.data) ? body.data.length : "n/a");
console.log("first fixture keys", first ? Object.keys(first) : null);
console.log(JSON.stringify(first, null, 2).slice(0, 4000));
```

- [ ] **Step 2: 実行して構造を確認**

Run: `SPORTMONKS_TOKEN=<secret> node scripts/h2h-probe/probe.mjs 18 83`
Expected: status 200。`data[]` に過去 fixtures。各 fixture の `participants[]`（`meta.location` が `home`/`away`、`id`=team id）と `scores[]`（`description`/`score.participant`/`score.goals`）の構造をメモする。
**確認事項**: 代表チーム ID 例（W杯出場国）でカバレッジ（count>0 か）を 2〜3 ペア試す。0 件が普通なら「初対戦」表示が主動線になる旨を Task 7 の文言で担保する。

- [ ] **Step 3: 確定構造を Task 2 のパーサに反映**

probe 結果が下記想定（v3 標準）と異なれば、`extractH2HResult` のフィールドアクセスを実形に合わせて修正する。想定:
- `fixture.participants[]`: `{ id, meta: { location: "home"|"away" } }`
- `fixture.scores[]`: `{ description: "CURRENT"|..., score: { participant: "home"|"away", goals: <int> } }` → `description === "CURRENT"` の home/away goals を最終スコアとする。

- [ ] **Step 4: コミット（probe を残す場合）**

```bash
git add scripts/h2h-probe/probe.mjs
git commit -m "chore(h2h): SportMonks H2Hレスポンス確認用probe"
```

---

## Task 2: 純関数ライブラリ `sm-h2h.js`（集計・パース・read 整形）

**Files:**
- Create: `functions/_lib/sm-h2h.js`
- Test: `functions/_lib/sm-h2h.test.js`

**Interfaces:**
- Consumes: Task 1 で確定した SportMonks fixture オブジェクト構造。
- Produces:
  - `extractH2HResult(fixture) -> { home_team_id:number, away_team_id:number, home_score:number, away_score:number } | null`
  - `aggregateH2H(homeTeamId:number, fixtures:Array) -> { home_wins:number, draws:number, away_wins:number, total:number }`（`fixtures` は SportMonks fixture 配列。内部で `extractH2HResult` を使い、`homeTeamId` 視点で集計）
  - `rowsToH2H(rows:Array) -> { [fixtureId:string]: { home_code, away_code, home_wins, draws, away_wins, total } }`
  - `H2H_WINDOW_DAYS = 7`（定数）

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-h2h.test.js`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	aggregateH2H,
	extractH2HResult,
	H2H_WINDOW_DAYS,
	rowsToH2H,
} from "./sm-h2h.js";

// v3 標準形の fixture を組む小ヘルパ
function fx(homeId, awayId, hg, ag) {
	return {
		participants: [
			{ id: homeId, meta: { location: "home" } },
			{ id: awayId, meta: { location: "away" } },
		],
		scores: [
			{ description: "CURRENT", score: { participant: "home", goals: hg } },
			{ description: "CURRENT", score: { participant: "away", goals: ag } },
		],
	};
}

test("extractH2HResult: home/away の team_id と最終スコアを抽出", () => {
	assert.deepEqual(extractH2HResult(fx(18, 83, 2, 1)), {
		home_team_id: 18,
		away_team_id: 83,
		home_score: 2,
		away_score: 1,
	});
});

test("extractH2HResult: 不完全な fixture は null", () => {
	assert.equal(extractH2HResult(null), null);
	assert.equal(extractH2HResult({ participants: [] }), null);
	assert.equal(
		extractH2HResult({ participants: [{ id: 1, meta: { location: "home" } }] }),
		null,
	);
});

test("aggregateH2H: home視点で勝/分/敗を集計", () => {
	const fixtures = [
		fx(18, 83, 2, 1), // 18 home win
		fx(83, 18, 0, 0), // draw
		fx(83, 18, 3, 1), // 18(away) lose
		fx(18, 83, 1, 1), // draw
	];
	// 18 視点: 1勝 2分 1敗
	assert.deepEqual(aggregateH2H(18, fixtures), {
		home_wins: 1,
		draws: 2,
		away_wins: 1,
		total: 4,
	});
});

test("aggregateH2H: スコア欠落/対象外チームはスキップ", () => {
	const bad = { participants: [], scores: [] };
	const notInvolved = fx(50, 60, 1, 0);
	const fixtures = [fx(18, 83, 1, 0), bad, notInvolved];
	assert.deepEqual(aggregateH2H(18, fixtures), {
		home_wins: 1,
		draws: 0,
		away_wins: 0,
		total: 1,
	});
});

test("aggregateH2H: 空配列はすべて0", () => {
	assert.deepEqual(aggregateH2H(18, []), {
		home_wins: 0,
		draws: 0,
		away_wins: 0,
		total: 0,
	});
});

test("rowsToH2H: 行を fixtureId キーへ整形", () => {
	const rows = [
		{
			fixture_id: 7,
			home_code: "JPN",
			away_code: "BRA",
			home_wins: 1,
			draws: 2,
			away_wins: 5,
			total: 8,
		},
	];
	assert.deepEqual(rowsToH2H(rows), {
		7: {
			home_code: "JPN",
			away_code: "BRA",
			home_wins: 1,
			draws: 2,
			away_wins: 5,
			total: 8,
		},
	});
	assert.deepEqual(rowsToH2H([]), {});
	assert.deepEqual(rowsToH2H(null), {});
});

test("H2H_WINDOW_DAYS は 7", () => {
	assert.equal(H2H_WINDOW_DAYS, 7);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/_lib/sm-h2h.test.js`
Expected: FAIL（`Cannot find module './sm-h2h.js'`）

- [ ] **Step 3: 実装する**

`functions/_lib/sm-h2h.js`:

```js
// 試合前カード H2H（過去対戦）の純粋ヘルパ群（D1/環境に依存しない）。
// API ハンドラ（functions/api/h2h.js）と Cron 同期（sm-sync.js syncH2H）から利用。
// SportMonks のレスポンス整形・集計・D1 read 整形をここに隔離して単体テストする。

// 取得対象 fixture の窓（現在〜N日後の未開始試合のみ H2H を事前取得）。
export const H2H_WINDOW_DAYS = 7;

// SportMonks fixture（participants;scores include）から最終結果を正規化。
// home/away の team_id と CURRENT スコアが揃わなければ null（集計でスキップ）。
export function extractH2HResult(fixture) {
	const parts = fixture && Array.isArray(fixture.participants)
		? fixture.participants
		: null;
	if (!parts) return null;
	let homeId = null;
	let awayId = null;
	for (const p of parts) {
		const loc = p && p.meta && p.meta.location;
		if (loc === "home") homeId = p.id;
		else if (loc === "away") awayId = p.id;
	}
	if (!Number.isFinite(homeId) || !Number.isFinite(awayId)) return null;

	const scores = Array.isArray(fixture.scores) ? fixture.scores : [];
	let hg = null;
	let ag = null;
	for (const s of scores) {
		if (!s || s.description !== "CURRENT" || !s.score) continue;
		if (s.score.participant === "home") hg = s.score.goals;
		else if (s.score.participant === "away") ag = s.score.goals;
	}
	if (!Number.isFinite(hg) || !Number.isFinite(ag)) return null;
	return {
		home_team_id: homeId,
		away_team_id: awayId,
		home_score: hg,
		away_score: ag,
	};
}

// homeTeamId 視点で過去対戦の勝/分/敗を集計。対象外/欠損 fixture はスキップ。
export function aggregateH2H(homeTeamId, fixtures) {
	const out = { home_wins: 0, draws: 0, away_wins: 0, total: 0 };
	for (const f of fixtures || []) {
		const r = extractH2HResult(f);
		if (!r) continue;
		// homeTeamId がこの試合のどちら側だったかを判定し、その視点の得失で勝敗。
		let forGoals;
		let againstGoals;
		if (r.home_team_id === homeTeamId) {
			forGoals = r.home_score;
			againstGoals = r.away_score;
		} else if (r.away_team_id === homeTeamId) {
			forGoals = r.away_score;
			againstGoals = r.home_score;
		} else {
			continue; // homeTeamId が関与しない試合は除外
		}
		out.total += 1;
		if (forGoals > againstGoals) out.home_wins += 1;
		else if (forGoals < againstGoals) out.away_wins += 1;
		else out.draws += 1;
	}
	return out;
}

// sm_h2h の行配列を { "<fixtureId>": {home_code, away_code, W-D-L, total} } へ整形。
export function rowsToH2H(rows) {
	const out = {};
	for (const r of rows || []) {
		out[String(r.fixture_id)] = {
			home_code: r.home_code ?? null,
			away_code: r.away_code ?? null,
			home_wins: r.home_wins ?? 0,
			draws: r.draws ?? 0,
			away_wins: r.away_wins ?? 0,
			total: r.total ?? 0,
		};
	}
	return out;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-h2h.test.js`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/sm-h2h.js functions/_lib/sm-h2h.test.js
git commit -m "feat(h2h): H2H集計・パース純関数ライブラリ"
```

---

## Task 3: D1 スキーマ `sm_h2h`

**Files:**
- Create: `schema/0013_sm_h2h.sql`

**Interfaces:**
- Produces: テーブル `sm_h2h(fixture_id PK, home_code, away_code, home_wins, draws, away_wins, total, updated_at)`。

- [ ] **Step 1: マイグレーション SQL を書く**

`schema/0013_sm_h2h.sql`:

```sql
-- 試合前カード H2H（過去対戦 通算W-D-L）。worker-watch の daily Cron が upsert、
-- /api/h2h が read。home_code/away_code は sm_teams.app_code（向き判定用）。
CREATE TABLE IF NOT EXISTS sm_h2h (
  fixture_id  INTEGER PRIMARY KEY,
  home_code   TEXT,
  away_code   TEXT,
  home_wins   INTEGER NOT NULL DEFAULT 0,
  draws       INTEGER NOT NULL DEFAULT 0,
  away_wins   INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT
);
```

- [ ] **Step 2: ローカルで構文確認（任意・wrangler があれば）**

Run: `npx wrangler d1 execute wcup2026-db --local --file=schema/0013_sm_h2h.sql`
Expected: エラーなく完了（ローカル D1 にテーブル作成）。wrangler 未設定環境ではスキップ可。

- [ ] **Step 3: コミット**

```bash
git add schema/0013_sm_h2h.sql
git commit -m "feat(h2h): sm_h2h テーブルのマイグレーション追加"
```

---

## Task 4: `sm_h2h` upsert 文（`sm-store.js`）

**Files:**
- Modify: `functions/_lib/sm-store.js`

**Interfaces:**
- Produces: `h2hStatement(row, updatedAt) -> { sql, args }`。`row = { fixture_id, home_code, away_code, home_wins, draws, away_wins, total }`。

- [ ] **Step 1: 既存パターンを確認**

`functions/_lib/sm-store.js:16-25` の `teamStatement` と同形（`INSERT ... ON CONFLICT(pk) DO UPDATE SET ...`）で実装する。

- [ ] **Step 2: `h2hStatement` を追加・export**

`functions/_lib/sm-store.js`（`teamStatement` の近くに追加）:

```js
export function h2hStatement(row, updatedAt) {
	return {
		sql: `INSERT INTO sm_h2h
            (fixture_id, home_code, away_code, home_wins, draws, away_wins, total, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(fixture_id) DO UPDATE SET
            home_code=excluded.home_code, away_code=excluded.away_code,
            home_wins=excluded.home_wins, draws=excluded.draws,
            away_wins=excluded.away_wins, total=excluded.total,
            updated_at=excluded.updated_at`,
		args: [
			row.fixture_id,
			row.home_code ?? null,
			row.away_code ?? null,
			row.home_wins ?? 0,
			row.draws ?? 0,
			row.away_wins ?? 0,
			row.total ?? 0,
			updatedAt,
		],
	};
}
```

> 既存ファイルが `export function teamStatement` 形式か（先頭で `function` 定義し末尾で一括 export か）を確認し、ファイルの export スタイルに合わせること。`sm-store.js` は各 statement を `function` 定義しているので、`runBatch` 等の export 形式に倣って `export function h2hStatement` で公開する。

- [ ] **Step 3: 構文・既存テストが壊れないことを確認**

Run: `node --test functions/_lib/sm-store.test.js`
Expected: PASS（既存テストに影響なし）

- [ ] **Step 4: コミット**

```bash
git add functions/_lib/sm-store.js
git commit -m "feat(h2h): sm_h2h の upsert文(h2hStatement)を追加"
```

---

## Task 5: Cron 同期 `syncH2H`（`sm-sync.js`）＋テスト

**Files:**
- Modify: `functions/_lib/sm-sync.js`
- Modify: `functions/_lib/sm-sync.test.js`

**Interfaces:**
- Consumes: `aggregateH2H`（Task 2）、`h2hStatement`（Task 4）、`runBatch`/`runChunked`（既存 sm-sync 内 import）、`H2H_WINDOW_DAYS`（Task 2）。
- Produces: `syncH2H(footballClient, db, now, { windowDays = H2H_WINDOW_DAYS } = {}) -> { count:number, error?:string }`。
  - `now` は epoch 秒（既存 sync と同じ）。
  - 対象抽出: `sm_fixtures` から `state_id = 1`（NS）かつ `starting_at_ts BETWEEN now AND now + windowDays*86400`。
  - 各 fixture で `footballClient.get('fixtures/head-to-head/{home}/{away}', { include: 'participants;scores' })` を取得 → `aggregateH2H(home_team_id, body.data)`。
  - `home_team_id`/`away_team_id` を `sm_teams.app_code` に解決（1クエリでまとめ引き）。解決不能はスキップ。
  - `h2hStatement` で upsert（`runChunked` か `runBatch`）。

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-sync.test.js` に追記（先頭の import に `syncH2H` を加える）:

```js
import { syncH2H } from "./sm-sync.js";

// syncH2H 用フェイク: sm_fixtures（対象抽出）、sm_teams（app_code解決）、sm_h2h（upsert記録）
function fakeH2HDB({ fixtures = [], teams = {} } = {}) {
	const h2hUpserts = [];
	const make = (sql) => ({
		sql,
		args: [],
		bind(...a) {
			this.args = a;
			return this;
		},
		async all() {
			if (/FROM sm_fixtures/i.test(this.sql)) return { results: fixtures };
			if (/FROM sm_teams/i.test(this.sql)) {
				const ids = this.args.map(Number);
				const results = ids
					.filter((id) => id in teams)
					.map((id) => ({ sm_team_id: id, app_code: teams[id] }));
				return { results };
			}
			return { results: [] };
		},
		async run() {
			if (/INSERT INTO sm_h2h/i.test(this.sql)) h2hUpserts.push(this.args);
			return { success: true, meta: { changes: 1 } };
		},
	});
	return {
		prepare: (sql) => make(sql),
		async batch(stmts) {
			for (const s of stmts) await s.run();
			return [];
		},
		_h2hUpserts: h2hUpserts,
	};
}

// participants;scores 形の fixture を返す SportMonks クライアントのモック。
function fakeH2HClient(byPair) {
	return {
		async get(path) {
			const m = path.match(/head-to-head\/(\d+)\/(\d+)/);
			const key = m ? `${m[1]}-${m[2]}` : "";
			return { data: byPair[key] || [] };
		},
	};
}

function fxScore(homeId, awayId, hg, ag) {
	return {
		participants: [
			{ id: homeId, meta: { location: "home" } },
			{ id: awayId, meta: { location: "away" } },
		],
		scores: [
			{ description: "CURRENT", score: { participant: "home", goals: hg } },
			{ description: "CURRENT", score: { participant: "away", goals: ag } },
		],
	};
}

test("syncH2H: 未開始かつ窓内のfixtureをH2H集計してupsert", async () => {
	const now = 1_000_000;
	const db = fakeH2HDB({
		fixtures: [
			{
				sm_fixture_id: 7,
				home_team_id: 18,
				away_team_id: 83,
				state_id: 1,
				starting_at_ts: now + 3600,
			},
		],
		teams: { 18: "JPN", 83: "BRA" },
	});
	const client = fakeH2HClient({
		"18-83": [fxScore(18, 83, 1, 0), fxScore(83, 18, 2, 2)],
	});
	const res = await syncH2H(client, db, now);
	assert.equal(res.count, 1);
	// upsert 引数: [fixture_id, home_code, away_code, home_wins, draws, away_wins, total, updated_at]
	const up = db._h2hUpserts[0];
	assert.equal(up[0], 7);
	assert.equal(up[1], "JPN");
	assert.equal(up[2], "BRA");
	assert.deepEqual(up.slice(3, 7), [1, 1, 0, 2]); // 18視点: 1勝1分0敗 total2
});

test("syncH2H: app_code 解決不能の fixture はスキップ", async () => {
	const now = 1_000_000;
	const db = fakeH2HDB({
		fixtures: [
			{
				sm_fixture_id: 9,
				home_team_id: 18,
				away_team_id: 999,
				state_id: 1,
				starting_at_ts: now + 3600,
			},
		],
		teams: { 18: "JPN" }, // 999 未解決
	});
	const client = fakeH2HClient({ "18-999": [fxScore(18, 999, 1, 0)] });
	const res = await syncH2H(client, db, now);
	assert.equal(res.count, 0);
	assert.equal(db._h2hUpserts.length, 0);
});

test("syncH2H: 取得失敗でも例外を投げず error を返す", async () => {
	const now = 1_000_000;
	const db = fakeH2HDB({
		fixtures: [
			{
				sm_fixture_id: 7,
				home_team_id: 18,
				away_team_id: 83,
				state_id: 1,
				starting_at_ts: now + 3600,
			},
		],
		teams: { 18: "JPN", 83: "BRA" },
	});
	const client = {
		async get() {
			throw new Error("boom");
		},
	};
	const res = await syncH2H(client, db, now);
	// 1件取得失敗 → スキップして count 0、全体は例外にしない
	assert.equal(res.count, 0);
	assert.ok(db._h2hUpserts.length === 0);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/_lib/sm-sync.test.js`
Expected: FAIL（`syncH2H` 未 export）

- [ ] **Step 3: `syncH2H` を実装する**

`functions/_lib/sm-sync.js` の import に追加:

```js
import { aggregateH2H, H2H_WINDOW_DAYS } from "./sm-h2h.js";
import { h2hStatement } from "./sm-store.js";
```

（既存 import 行に合わせて統合すること。`runBatch` は既に import 済み。`runChunked` を使う場合も既存定義を流用。）

ファイル末尾付近に追加:

```js
// 試合前カード用 H2H 同期。未開始かつ窓内の sm_fixtures について SportMonks H2H を取得し、
// home_team_id 視点の通算 W-D-L を sm_h2h へ upsert。障害は隔離（例外を投げない）。
export async function syncH2H(
	footballClient,
	db,
	now,
	{ windowDays = H2H_WINDOW_DAYS } = {},
) {
	let targets;
	try {
		const until = now + windowDays * 86400;
		const r = await db
			.prepare(
				`SELECT sm_fixture_id, home_team_id, away_team_id
         FROM sm_fixtures
         WHERE state_id = 1 AND starting_at_ts IS NOT NULL
           AND starting_at_ts BETWEEN ? AND ?`,
			)
			.bind(now, until)
			.all();
		targets = r?.results || [];
	} catch (e) {
		console.error("syncH2H: select targets failed", e?.message);
		return { count: 0, error: e?.message };
	}
	if (!targets.length) return { count: 0 };

	// app_code 解決テーブルを 1 クエリで用意。
	const ids = [
		...new Set(
			targets.flatMap((t) => [t.home_team_id, t.away_team_id]).filter(Boolean),
		),
	];
	const codeById = {};
	try {
		const ph = ids.map(() => "?").join(",");
		const tr = await db
			.prepare(
				`SELECT sm_team_id, app_code FROM sm_teams WHERE sm_team_id IN (${ph})`,
			)
			.bind(...ids)
			.all();
		for (const row of tr?.results || []) codeById[row.sm_team_id] = row.app_code;
	} catch (e) {
		console.error("syncH2H: team code resolve failed", e?.message);
		return { count: 0, error: e?.message };
	}

	const updatedAt = new Date(now * 1000).toISOString();
	const specs = [];
	for (const t of targets) {
		const homeCode = codeById[t.home_team_id];
		const awayCode = codeById[t.away_team_id];
		if (!homeCode || !awayCode) continue; // 向き判定不能はスキップ
		let body;
		try {
			body = await footballClient.get(
				`fixtures/head-to-head/${t.home_team_id}/${t.away_team_id}`,
				{ include: "participants;scores" },
			);
		} catch (e) {
			console.error(
				`syncH2H: fetch failed fixture=${t.sm_fixture_id}`,
				e?.message,
			);
			continue; // 1件の失敗で全体を止めない
		}
		const data = Array.isArray(body?.data) ? body.data : [];
		const agg = aggregateH2H(t.home_team_id, data);
		specs.push(
			h2hStatement(
				{
					fixture_id: t.sm_fixture_id,
					home_code: homeCode,
					away_code: awayCode,
					home_wins: agg.home_wins,
					draws: agg.draws,
					away_wins: agg.away_wins,
					total: agg.total,
				},
				updatedAt,
			),
		);
	}
	if (!specs.length) return { count: 0 };
	try {
		await runBatch(db, specs);
		return { count: specs.length };
	} catch (e) {
		console.error("syncH2H: upsert failed", e?.message);
		return { count: 0, error: e?.message };
	}
}
```

> 注意: `runBatch(db, specs)` は既存ヘルパ（`sm-sync.js` 冒頭で import 済み）。フェイク DB の `batch()` がこれを満たす。`runChunked` を使う実装なら chunk サイズに合わせること。実装後、テストの `_h2hUpserts` が拾えるよう `h2hStatement` の `.run()` が呼ばれる経路（`runBatch`→`db.batch`）を確認する。

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-sync.test.js`
Expected: PASS（新規 3 件＋既存すべて）

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/sm-sync.js functions/_lib/sm-sync.test.js
git commit -m "feat(h2h): Cron用 syncH2H（未開始試合のH2H事前取得）"
```

---

## Task 6: `/api/h2h` ハンドラ＋テスト

**Files:**
- Create: `functions/api/h2h.js`
- Create: `functions/api/h2h.test.js`

**Interfaces:**
- Consumes: `rowsToH2H`（Task 2）、`parseFixtures`（既存 `functions/_lib/cheer.js` の export を再利用）、`json`（`functions/_lib/http.js`）。
- Produces: `onRequestGet(context) -> Response`。`{ enabled, h2h: { [fixtureId]: {...} } }`。

- [ ] **Step 1: 失敗するテストを書く**

`functions/api/h2h.test.js`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "./h2h.js";

function fakeDB(rowsByFixture = {}) {
	const make = (sql) => ({
		sql,
		args: [],
		bind(...a) {
			this.args = a;
			return this;
		},
		async all() {
			if (/FROM sm_h2h/i.test(this.sql)) {
				const ids = this.args.map(Number);
				const results = ids
					.filter((id) => id in rowsByFixture)
					.map((id) => ({ fixture_id: id, ...rowsByFixture[id] }));
				return { results };
			}
			return { results: [] };
		},
	});
	return { prepare: (sql) => make(sql) };
}

const getReq = (qs) => ({ url: "https://x/api/h2h" + (qs ? "?" + qs : "") });

test("GET: H2H_ENABLED 未設定なら enabled:false", async () => {
	const res = await onRequestGet({ env: {}, request: getReq("fixtures=7") });
	const body = await res.json();
	assert.equal(body.enabled, false);
});

test("GET: 正常時は fixtureId キーで W-D-L を返す", async () => {
	const env = {
		H2H_ENABLED: "true",
		DB: fakeDB({
			7: {
				home_code: "JPN",
				away_code: "BRA",
				home_wins: 1,
				draws: 2,
				away_wins: 5,
				total: 8,
			},
		}),
	};
	const res = await onRequestGet({ env, request: getReq("fixtures=7,8") });
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.deepEqual(body.h2h["7"], {
		home_code: "JPN",
		away_code: "BRA",
		home_wins: 1,
		draws: 2,
		away_wins: 5,
		total: 8,
	});
	assert.equal(body.h2h["8"], undefined); // 行なしは含めない
});

test("GET: DB 無し/fixtures 空なら enabled:true・空", async () => {
	const res = await onRequestGet({
		env: { H2H_ENABLED: "true" },
		request: getReq(""),
	});
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.deepEqual(body.h2h, {});
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/api/h2h.test.js`
Expected: FAIL（`./h2h.js` 未作成）

- [ ] **Step 3: ハンドラを実装する**

`functions/api/h2h.js`:

```js
// GET /api/h2h — 試合前カードの H2H（過去対戦 通算W-D-L）配信API。
// フィーチャーフラグ H2H_ENABLED が 'true' のときのみ稼働（CHEER_ENABLED と同方針）。
// OFF時/未マイグレーション時/クエリ失敗時は空で返し、既存挙動に一切影響しない。

import { parseFixtures } from "../_lib/cheer.js";
import { json } from "../_lib/http.js";
import { rowsToH2H } from "../_lib/sm-h2h.js";

const GET_CACHE = "public, s-maxage=300, stale-while-revalidate=600";

function disabled() {
	return json(
		200,
		{ enabled: false, h2h: {} },
		{ "cache-control": "public, s-maxage=60" },
	);
}

// GET /api/h2h?fixtures=<id,id,...> → { enabled, h2h:{ "<fixtureId>":{home_code,away_code,home_wins,draws,away_wins,total} } }
export async function onRequestGet(context) {
	const { env, request } = context;
	if (env.H2H_ENABLED !== "true") return disabled();

	const url = new URL(request.url);
	const fixtures = parseFixtures(url.searchParams.get("fixtures") || "");
	if (!env.DB || fixtures.length === 0) {
		return json(200, { enabled: true, h2h: {} }, { "cache-control": GET_CACHE });
	}

	try {
		const placeholders = fixtures.map(() => "?").join(",");
		const sql = `SELECT fixture_id, home_code, away_code, home_wins, draws, away_wins, total
                 FROM sm_h2h WHERE fixture_id IN (${placeholders})`;
		const res = await env.DB.prepare(sql)
			.bind(...fixtures)
			.all();
		const h2h = rowsToH2H(res?.results || []);
		return json(200, { enabled: true, h2h }, { "cache-control": GET_CACHE });
	} catch (err) {
		// sm_h2h 未作成や一時障害でも 200・空で返す（障害隔離）
		console.error("GET /api/h2h failed:", err?.message);
		return json(
			200,
			{ enabled: true, h2h: {} },
			{ "cache-control": "public, s-maxage=10" },
		);
	}
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/api/h2h.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/api/h2h.js functions/api/h2h.test.js
git commit -m "feat(h2h): /api/h2h 配信エンドポイント"
```

---

## Task 7: worker-watch daily ブランチへ `syncH2H` を配線

**Files:**
- Modify: `worker-watch/src/index.js`
- Modify: `worker-watch/wrangler.toml`

**Interfaces:**
- Consumes: `syncH2H`（Task 5）。`env.H2H_ENABLED`。

- [ ] **Step 1: import に `syncH2H` を追加**

`worker-watch/src/index.js` の `sm-sync.js` import 群（`syncTypes` 等が並ぶブロック, 16-24 行付近）に `syncH2H` を追加する:

```js
import {
	selectFixturesForDetailSync,
	shouldRunInterval,
	syncFixtureDetail,
	syncFixtureSeries,
	syncH2H,
	syncLive,
	syncSeasonFixtures,
	syncTopscorers,
	syncTypes,
} from "../../functions/_lib/sm-sync.js";
```

- [ ] **Step 2: daily ブランチに H2H 同期を追加**

`worker-watch/src/index.js` の `if (event.cron === "0 3 * * *") { ... }` ブロック内、`syncTopscorers` のログ出力直後に追加:

```js
		if (env.H2H_ENABLED === "true") {
			const h = await syncH2H(football, env.DB, now);
			console.log(
				`watch-cron daily: h2h=${h.count}${h.error ? " err=" + h.error : ""}`,
			);
		}
```

- [ ] **Step 3: フラグを wrangler.toml に追加**

`worker-watch/wrangler.toml` の `[vars]` に追記:

```toml
H2H_ENABLED = "true"
```

- [ ] **Step 4: 構文確認（worker のテストがあれば）**

Run: `node --check worker-watch/src/index.js`
Expected: 構文エラーなし。

- [ ] **Step 5: コミット**

```bash
git add worker-watch/src/index.js worker-watch/wrangler.toml
git commit -m "feat(h2h): worker-watch daily で syncH2H を駆動（H2H_ENABLED）"
```

---

## Task 8: クライアントプール `public/h2h-core.js`

**Files:**
- Create: `public/h2h-core.js`

**Interfaces:**
- Produces: `window.WC.h2h = { get(fixtureId), fetch(ids), subscribe(fn), isEnabled() }`。
  - `get(fixtureId) -> { home_code, away_code, home_wins, draws, away_wins, total } | null`
  - `fetch(ids)` は `/api/h2h?fixtures=...` を読み、`enabled:false` なら以後 disabled。

- [ ] **Step 1: 実装する**

`public/h2h-core.js`（`cheer-core.js` を範に、読み取り専用へ簡素化）:

```js
/* 試合前カード H2H（過去対戦 通算W-D-L）の読み取り専用プール。
   Babel前の普通の<script>で読み込み、window.WC.h2h に集約。
   - fetch: /api/h2h?fixtures= をまとめて取得しキャッシュ。
   - get: fixtureId の {home_code,away_code,home_wins,draws,away_wins,total} or null。
   書き込みは無い（応援カウントとは別物）。 */
(() => {
	window.WC = window.WC || {};

	const API = "/api/h2h";
	const state = {}; // fixtureId -> H2Hオブジェクト or null（取得済みを記録）
	const subs = new Set();
	let enabled = true;

	function notify() {
		subs.forEach((fn) => {
			try {
				fn();
			} catch (e) {
				/* ignore subscriber error */
			}
		});
	}
	function get(fixtureId) {
		return state[fixtureId] || null;
	}
	function subscribe(fn) {
		subs.add(fn);
		return () => subs.delete(fn);
	}

	async function fetchH2H(ids) {
		if (!enabled || !ids || !ids.length) return;
		// 未取得のものだけ問い合わせる（H2Hはほぼ静的＝再取得不要）。
		const need = ids.filter((id) => !(id in state));
		if (!need.length) return;
		try {
			const res = await fetch(API + "?fixtures=" + need.join(","), {
				headers: { accept: "application/json" },
			});
			const data = await res.json();
			if (data && data.enabled === false) {
				enabled = false;
				return;
			}
			const h2h = (data && data.h2h) || {};
			need.forEach((id) => {
				state[id] = h2h[id] || null; // 行なしは null（初対戦）として確定
			});
			notify();
		} catch (e) {
			/* ネットワーク失敗時は未取得のまま（次回再試行） */
		}
	}

	window.WC.h2h = {
		get: get,
		fetch: fetchH2H,
		subscribe: subscribe,
		isEnabled: () => enabled,
	};
})();
```

- [ ] **Step 2: コミット**

```bash
git add public/h2h-core.js
git commit -m "feat(h2h): h2h-core クライアントプール（読み取り専用）"
```

---

## Task 9: `CheerBar` のバー差し替え（`screens-home.jsx`）

**Files:**
- Modify: `public/screens-home.jsx`（`CheerBar`, 469-710 付近）

**Interfaces:**
- Consumes: `window.WC.h2h`（Task 8）、`window.WC.fixtureIdForMatch`（既存）。
- 維持: `celebrate`/`onCheer` の演出、`userSide`、`onShare`、`cheerBtnStyle`。

- [ ] **Step 1: 購読先を h2h に変更**

`CheerBar` 冒頭（470-486 付近）を変更:

```jsx
function CheerBar({ T, match, a, b }) {
	const fixtureId = window.WC.fixtureIdForMatch
		? window.WC.fixtureIdForMatch(match)
		: null;
	const overlayRef = React.useRef(null);
	const [, force] = React.useState(0);
	const [userSide, setUserSide] = React.useState(null);

	React.useEffect(() => {
		if (fixtureId == null || !window.WC.h2h) return;
		window.WC.h2h.fetch([fixtureId]);
		return window.WC.h2h.subscribe(() => force((x) => x + 1));
	}, [fixtureId]);

	if (fixtureId == null || !window.WC.h2h) return null;

	// 過去対戦（通算W-D-L）。null=初対戦/未取得。
	const h2h = window.WC.h2h.get(fixtureId);
	const aColor = "#ff7a96";
	const bColor = "#7aa0ff";
	// 向き解決: home_code が a.code なら home視点=a視点。違えば反転して a 基準に揃える。
	let aWins = 0;
	let draws = 0;
	let bWins = 0;
	let total = 0;
	if (h2h && h2h.total > 0) {
		const aIsHome = h2h.home_code === a.code;
		aWins = aIsHome ? h2h.home_wins : h2h.away_wins;
		bWins = aIsHome ? h2h.away_wins : h2h.home_wins;
		draws = h2h.draws;
		total = h2h.total;
	}
	// シェアする側＝最後に押した側。未選択なら対戦成績で優勢な側を既定にする。
	const shareSide = userSide || (aWins >= bWins ? "home" : "away");
	const shareTeam = shareSide === "home" ? a : b;
```

> `celebrate` 関数（494-570 付近）は**変更しない**。

- [ ] **Step 2: `onCheer` から tap 書き込みを除去**

`onCheer`（572-576 付近）を変更（D1 書き込み停止、演出のみ）:

```jsx
	function onCheer(side) {
		setUserSide(side);
		celebrate(side);
	}
```

- [ ] **Step 3: `onShare` から counts を外し h2h を渡す**

`onShare`（577-586 付近）を変更:

```jsx
	function onShare() {
		if (!window.WC.cheerShare) return;
		window.WC.cheerShare.share({
			a,
			b,
			side: shareSide,
			h2h: { aWins, draws, bWins, total },
			roundLabel: window.WC.roundLabel ? window.WC.roundLabel(match.round) : "",
		});
	}
```

- [ ] **Step 4: 比率バー＋カウント行を W-D-L バーへ差し替え**

`return (...)` 内、比率バー（610-634 付近）＋カウント行（635-652 付近）の 2 ブロックを次に置換（`overlayRef` の div と、その下のボタン群 div は維持）:

```jsx
				<div
					style={{
						fontSize: 10,
						fontWeight: 700,
						color: T.sub,
						letterSpacing: 0.4,
						marginBottom: 6,
						position: "relative",
						zIndex: 1,
					}}
				>
					通算対戦成績
				</div>
				{total > 0 ? (
					<>
						<div
							style={{
								height: 8,
								borderRadius: 999,
								background: "#23262d",
								overflow: "hidden",
								display: "flex",
								position: "relative",
								zIndex: 1,
							}}
						>
							<div
								style={{
									width: `${(aWins / total) * 100}%`,
									background: "linear-gradient(90deg,#ff3b6b,#ff7a96)",
									transition: "width .4s",
								}}
							/>
							<div
								style={{
									width: `${(draws / total) * 100}%`,
									background: "#5b606b",
								}}
							/>
							<div
								style={{
									width: `${(bWins / total) * 100}%`,
									background: "linear-gradient(90deg,#5b82e6,#a9c4ff)",
								}}
							/>
						</div>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								fontSize: 11,
								fontWeight: 700,
								marginTop: 4,
								position: "relative",
								zIndex: 1,
							}}
						>
							<span style={{ color: aColor }}>
								{a.resolved ? a.code : a.label} {aWins}勝
							</span>
							<span style={{ color: T.sub }}>{draws}分</span>
							<span style={{ color: bColor }}>
								{bWins}勝 {b.resolved ? b.code : b.label}
							</span>
						</div>
					</>
				) : (
					<div
						style={{
							fontSize: 12,
							color: T.sub,
							textAlign: "center",
							padding: "6px 0",
							position: "relative",
							zIndex: 1,
						}}
					>
						初対戦（過去対戦データなし）
					</div>
				)}
```

- [ ] **Step 5: ビルド可否を目視確認**

Run: `npx prettier --check public/screens-home.jsx`（あれば）。無ければ手で括弧整合を確認。
Expected: 構文エラーなし。`celebrate`/ボタン群/`overlayRef` が残っていること、`window.WC.cheer` への参照が `CheerBar` から消えていることを確認。

- [ ] **Step 6: コミット**

```bash
git add public/screens-home.jsx
git commit -m "feat(h2h): CheerBarのカウントバーを通算W-D-Lバーへ差し替え（演出維持）"
```

---

## Task 10: シェア画像のバーを H2H に置換（`cheer-share.js`）

**Files:**
- Modify: `public/cheer-share.js`（`draw` 116-232 付近、`share` 283-305 付近）

**Interfaces:**
- Consumes: `opts.h2h = { aWins, draws, bWins, total }`（Task 9 が渡す）。`opts.counts` は廃止。
- 注意: `draw` は現在 `opts.counts` を分解しているので `h2h` ベースへ置換。a 視点で固定（CheerBar が既に a 基準に整形済み）。

- [ ] **Step 1: `draw` のバー描画を W-D-L へ置換**

`public/cheer-share.js` の `draw`（115-116 付近）の分解と、バー描画（195-232 付近）を変更。分解を:

```js
	function draw(ctx, opts, images) {
		const { theme, a, b, side } = opts;
		const h2h = opts.h2h || { aWins: 0, draws: 0, bWins: 0, total: 0 };
```

バー描画ブロック（195-232 付近）を次に置換:

```js
		// バー（通算W-D-L: a勝 / 分 / b勝）
		const total = Math.max(1, h2h.total);
		const aR = h2h.aWins / total;
		const dR = h2h.draws / total;
		const barX = 130,
			barY = 720,
			barW = W - 260,
			barH = 44;
		ctx.save();
		roundRect(ctx, barX, barY, barW, barH, barH / 2);
		ctx.clip();
		ctx.fillStyle = "#1b1e24";
		ctx.fillRect(barX, barY, barW, barH);
		ctx.fillStyle = "#ff3b6b";
		ctx.fillRect(barX, barY, barW * aR, barH);
		ctx.fillStyle = "#5b606b";
		ctx.fillRect(barX + barW * aR, barY, barW * dR, barH);
		ctx.fillStyle = "#5b82e6";
		ctx.fillRect(barX + barW * (aR + dR), barY, barW * (1 - aR - dR), barH);
		ctx.restore();
		// 数値（コードのみ・絵文字なし）
		ctx.fillStyle = "#ff7a96";
		ctx.textAlign = "left";
		ctx.font = "800 36px system-ui, sans-serif";
		ctx.fillText((a.code || "") + " " + h2h.aWins + "勝", barX, barY + 92);
		ctx.fillStyle = "#cfd3da";
		ctx.textAlign = "center";
		ctx.fillText(h2h.draws + "分", barX + barW / 2, barY + 92);
		ctx.fillStyle = "#a9c4ff";
		ctx.textAlign = "right";
		ctx.fillText(h2h.bWins + "勝 " + (b.code || ""), barX + barW, barY + 92);
```

> `total === 0`（初対戦）の場合でも `Math.max(1, ...)` でゼロ割回避し、全勝0でグレー地のみ表示。見出し等は既存のまま。`opts.counts` への参照が `draw` から消えていることを確認。

- [ ] **Step 2: `share` の opts コメントを更新**

`share`（283 付近）のコメントを `// opts: { a, b, side, h2h, roundLabel }` に更新（実体は opts をそのまま draw へ渡すso機能変更なし）。

- [ ] **Step 3: 既存 share テストの確認・調整**

Run: `node --test functions/_lib/share-model.test.js`
Expected: PASS。`share-model.test.js` が `counts` に依存していれば、`h2h` 形へ最小修正（テストが `cheer-share.js` の `draw` を直接呼ぶ構成かを確認し、呼ぶなら opts を `h2h` 形へ置換）。`cheer-share.js` 自体は Canvas 依存でユニットテスト対象外なら、テスト変更は不要。

- [ ] **Step 4: コミット**

```bash
git add public/cheer-share.js
git commit -m "feat(h2h): シェア画像のカウントバーを通算W-D-Lへ置換"
```

---

## Task 11: `index.html` の script 追加と `?v` バンプ

**Files:**
- Modify: `public/index.html`（62-140 付近）

- [ ] **Step 1: h2h-core.js を追加し、変更ファイルの `?v` をバンプ**

`public/index.html`:
- `cheer-core.js?v=1` の行の直後に追加: `<script src="h2h-core.js?v=1"></script>`
- `cheer-share.js?v=5` → `cheer-share.js?v=6`
- `screens-home.jsx?v=19` → `screens-home.jsx?v=20`

```html
  <script src="cheer-theme.js?v=4"></script>
  <script src="cheer-core.js?v=1"></script>
  <script src="h2h-core.js?v=1"></script>
  <script src="cheer-share.js?v=6"></script>
```

（`screens-home.jsx` の行も `?v=20` へ。）

- [ ] **Step 2: コミット**

```bash
git add public/index.html
git commit -m "chore(h2h): index.html に h2h-core 追加＋screens-home/cheer-share の ?v バンプ"
```

---

## Task 12: 全体テストと最終確認

**Files:** なし（検証のみ）

- [ ] **Step 1: 関連テストを一括実行**

Run: `node --test functions/_lib/sm-h2h.test.js functions/api/h2h.test.js functions/_lib/sm-sync.test.js functions/_lib/sm-store.test.js functions/_lib/cheer.test.js functions/api/cheer.test.js`
Expected: 全 PASS（cheer 系はバックエンド温存のため不変で PASS）。

- [ ] **Step 2: リポジトリ標準のテストコマンドがあれば実行**

Run: `npm test`（`package.json` の test スクリプトを確認して実行）
Expected: 既存スイートが緑。

- [ ] **Step 3: worker 構文確認**

Run: `node --check worker-watch/src/index.js`
Expected: エラーなし。

---

## 残作業（実装後・本番反映）

1. **D1 マイグレーション本番実行**（CI 未実行）:
   `npx wrangler d1 execute wcup2026-db --remote --file=schema/0013_sm_h2h.sql`
2. **worker-watch 再デプロイ**（`H2H_ENABLED="true"` 反映＝Cron 有効化）。
3. **Pages 側 `wrangler.toml`** に `H2H_ENABLED="true"`、preview/本番に反映。
4. PR → preview 確認 → main マージで本番（[[wcup-deploy-flow]]）。初回 daily Cron（03:00 UTC）まで `sm_h2h` は空＝フロントは「初対戦」表示で graceful。手動トリガで即時投入も可。
5. **大会後** は `H2H_ENABLED` を OFF にして Cron 負荷を落とす。

## Self-Review（記録）

- スペック各節 → タスク対応: データ取得=Task5/7、API=Task6、D1=Task3/4、フロント描画=Task9、シェア=Task10、エラー処理=Task2/5/6/9 のガード、テスト=Task2/5/6/12。probe（リスク節）=Task1。`index.html ?v`（Global Constraints）=Task11。
- プレースホルダ無し（全 step に実コード/実コマンド）。
- 型整合: `aggregateH2H`/`h2hStatement`/`rowsToH2H`/`syncH2H`/`window.WC.h2h.get` のフィールド名（`home_wins/draws/away_wins/total/home_code/away_code`）を全タスクで統一。フロントは `aWins/draws/bWins/total` に a 基準で写像（Task9）し、シェア（Task10）も同名で受ける。
