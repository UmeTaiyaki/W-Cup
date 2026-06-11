# 大会結果のSportMonks自動反映 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SportMonks（`sm_*` テーブル）から大会の順位表・優勝/準優勝・得点王・ブラケットを自動導出し、大会結果タブと予想採点に「手動上書き可」でリアルタイム反映する。

**Architecture:** Cron(`worker-watch`)で `sm_fixtures`＋新規 `sm_topscorers` を取り込む。導出専用 `GET /api/results` が純関数 `functions/_lib/sm-results.js` で採点が読む `result` 型へ変換する。クライアント `public/data.js` が `/api/results` を取得し「手動(非空) ?? 自動」で1点マージ。既存画面・`scoring.js` は無改修。

**Tech Stack:** Cloudflare Pages Functions / Workers (Cron) / D1 (SQLite) / 素の ESM 純関数 / `node --test`。

**Spec:** `docs/superpowers/specs/2026-06-11-results-auto-sync-design.md`

**前提知識（既存パターン）:**
- 純変換は `functions/_lib/sm-ingest.js`（`toFixtureRow` 等、副作用なし・欠損入力でも例外を投げない）。
- SQL生成は `functions/_lib/sm-store.js`（`{sql,args}` を返す純関数 + `ON CONFLICT` upsert）。D1 に触れるのは `runBatch` のみ。
- 同期オーケストレーションは `functions/_lib/sm-sync.js`（client/db 注入、例外を投げず結果オブジェクトを返す）。
- 配信読み取りは `functions/_lib/sm-read.js`（`statusFromState`, `listFixtures`, JOIN は `LEFT JOIN sm_teams ... app_code`）。
- state_id: `2/3/6/9`=インプレー, `5/7/8`=終了(FT), `1`=未開始。`isFinished`/`isInPlay` は `sm-sync.js` に既存。
- テストは各 `*.test.js` に `import { test } from "node:test"; import assert from "node:assert/strict";`。実行は `node --test functions/_lib/<name>.test.js`。
- **既知の制約**: `toFixtureRow` の `round_name` は現状 `null` 固定（P0で未解決）。ノックアウト導出のため本計画 Phase 1 で解決する。グループ判定は `round_name` 非依存（`config.groups` メンバーシップで突合）。

---

## ファイル構成

| ファイル | 区分 | 責務 |
|---|---|---|
| `functions/_lib/sm-ingest.js` | 改修 | `toFixtureRow` に round 解決を追加 / `toTopscorerRows` 追加 |
| `functions/_lib/sm-store.js` | 改修 | topscorers の upsert 文生成 `topscorersStatements` 追加 |
| `functions/_lib/sm-sync.js` | 改修 | round include 追加 / `syncTopscorers` 追加 |
| `db/schema-watch.sql` | 改修 | `sm_topscorers` テーブル追加 |
| `worker-watch/src/index.js` | 改修 | 日次＋ライブで `syncTopscorers` 呼び出し / 手動トリガ `action=topscorers` |
| `functions/_lib/sm-results.js` | 新規 | `sm_*` 行 → `result`/`groupMatches` 純導出（FT確定ルール） |
| `functions/_lib/sm-read.js` | 改修 | results 用クエリ `listTopscorers` 追加 |
| `functions/api/results.js` | 新規 | `GET /api/results`（WATCH_ENABLED ゲート＋導出＋短期キャッシュ） |
| `public/data.js` | 改修 | `fetchResults()`＋手動優先マージ |
| `public/index.html` | 改修 | 起動時 `fetchResults` 呼び出し＋ライブ中ポーリング |

各 `*.test.js` は対応実装の隣に作成/追記する。

---

## Phase 0: API 形状スパイク

### Task 1: SportMonks の round / topscorers レスポンス形状を実データで確認

**Files:**
- 参照のみ（記録は本計画のコメントとして該当タスクに反映）

- [ ] **Step 1: トークンの所在を確認**

Run: `grep -n SPORTMONKS_TOKEN .dev.vars worker-watch/.dev.vars 2>/dev/null`
Expected: いずれかに `SPORTMONKS_TOKEN=...` が存在。値はログ・コミットに残さない。

- [ ] **Step 2: round include 形状を取得（1試合）**

Run（`$T` にトークンを export して実行。出力はファイルに保存しコミットしない）:
```bash
export T=$(grep -h SPORTMONKS_TOKEN .dev.vars worker-watch/.dev.vars 2>/dev/null | head -1 | cut -d= -f2)
curl -s "https://api.sportmonks.com/v3/football/seasons/26618?include=fixtures.round;fixtures.stage&api_token=$T" \
  | python3 -m json.tool | sed -n '1,80p'
```
Expected: 各 fixture に `round: { id, name }` および/または `stage: { id, name }`。
**記録すべき値**: グループ戦の round/stage 名、ノックアウト（"Round of 32" / "Round of 16" / "Quarter-finals" / "Semi-finals" / "3rd Place Final" / "Final" 等）の実際の文字列。Task 2 と Task 8 の `ROUND_MAP` をこの実値に合わせる。

- [ ] **Step 3: topscorers 形状を取得**

Run:
```bash
curl -s "https://api.sportmonks.com/v3/football/seasons/26618/topscorers?include=player;participant&api_token=$T" \
  | python3 -m json.tool | sed -n '1,60p'
```
Expected: `data: [{ position, total, participant_id, player_id, type_id, player:{ name, ... }, participant:{ id, name, short_code, image_path } }]`。
**記録すべき値**: ゴール得点王を表す `type_id`（アシスト/カードと区別する識別子）。フィールド名 `total`（ゴール数）。Task 4 の `GOAL_TYPE_ID` と整形をこの実値に合わせる。

- [ ] **Step 4: 確認結果を Task 2 / Task 4 / Task 8 の定数コメントに反映（コミット不要・知見の共有のみ）**

---

## Phase 1: round_name の解決

### Task 2: season fixtures 同期に round/stage を含め、round_name を埋める

**Files:**
- Modify: `functions/_lib/sm-sync.js`（`SEASON_FIXTURES_INCLUDE`）
- Modify: `functions/_lib/sm-ingest.js`（`toFixtureRow` の `round_name`）
- Test: `functions/_lib/sm-ingest.test.js`

- [ ] **Step 1: 失敗するテストを書く（ingest が round.name を拾う）**

`functions/_lib/sm-ingest.test.js` に追記:
```javascript
import { toFixtureRow } from "./sm-ingest.js";

test("toFixtureRow は round.name を round_name に採用", () => {
  const row = toFixtureRow({
    id: 1, participants: [], scores: [],
    round: { id: 9, name: "Round of 16" },
  });
  assert.equal(row.round_name, "Round of 16");
});

test("toFixtureRow は round が無ければ stage.name にフォールバック", () => {
  const row = toFixtureRow({ id: 2, participants: [], scores: [], stage: { name: "Group Stage" } });
  assert.equal(row.round_name, "Group Stage");
});

test("toFixtureRow は round/stage どちらも無ければ null", () => {
  const row = toFixtureRow({ id: 3, participants: [], scores: [] });
  assert.equal(row.round_name, null);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: FAIL（`round_name` が null 固定のため "Round of 16" と一致しない）

- [ ] **Step 3: 最小実装（`toFixtureRow` の round_name 行を置換）**

`functions/_lib/sm-ingest.js` の `round_name: null, // round_id は別 include...` を次へ:
```javascript
		round_name: detail?.round?.name ?? detail?.stage?.name ?? null,
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: PASS

- [ ] **Step 5: season include に round/stage を追加**

`functions/_lib/sm-sync.js` の該当行を置換:
```javascript
export const SEASON_FIXTURES_INCLUDE = "fixtures.participants;fixtures.round;fixtures.stage";
```
（補足: `fixtureStatement` の `round_name=COALESCE(excluded.round_name, sm_fixtures.round_name)` により、live同期で round が null でも既存値が保持される。よって live include の変更は不要。）

- [ ] **Step 6: コミット**

```bash
git add functions/_lib/sm-ingest.js functions/_lib/sm-ingest.test.js functions/_lib/sm-sync.js
git commit -m "feat(sm): fixtureのround_nameをround/stage includeから解決"
```

---

## Phase 2: 得点王（sm_topscorers）の取り込み

### Task 3: sm_topscorers スキーマ追加

**Files:**
- Modify: `db/schema-watch.sql`

- [ ] **Step 1: テーブル定義を末尾に追記**

`db/schema-watch.sql` の末尾に追記:
```sql
-- 8) 得点王（season topscorers。fixtures からは導出不可のため専用取得）
--    player_id を PK に upsert。app_code は sm_teams 経由ではなく participant から保持。
CREATE TABLE IF NOT EXISTS sm_topscorers (
  season_id   INTEGER NOT NULL,
  player_id   INTEGER NOT NULL,
  player_name TEXT,
  team_id     INTEGER,
  app_code    TEXT,            -- participant→sm_teams.app_code 解決後に埋まる(未解決はNULL)
  goals       INTEGER,
  position    INTEGER,         -- 公式順位(1=トップ)
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_sm_topscorers_pos ON sm_topscorers (season_id, position);
```

- [ ] **Step 2: ローカル/テスト D1 に適用できる構文かを確認（dry: SQLite で実行）**

Run: `sqlite3 /tmp/smtest.db < db/schema-watch.sql && echo OK && rm -f /tmp/smtest.db`
Expected: `OK`（構文エラーなし）

- [ ] **Step 3: コミット**

```bash
git add db/schema-watch.sql
git commit -m "feat(db): sm_topscorers テーブル追加"
```

### Task 4: toTopscorerRows（純変換）

**Files:**
- Modify: `functions/_lib/sm-ingest.js`
- Test: `functions/_lib/sm-ingest.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-ingest.test.js` に追記:
```javascript
import { toTopscorerRows } from "./sm-ingest.js";

test("toTopscorerRows は goals 種別のみ抽出し goals/position/player を整形", () => {
  const rows = toTopscorerRows({
    data: [
      { position: 1, total: 5, type_id: 208, player_id: 11, participant_id: 99,
        player: { name: "A. Striker" }, participant: { id: 99, short_code: "BRA", name: "Brazil" } },
      { position: 1, total: 4, type_id: 209, player_id: 11, participant_id: 99,
        player: { name: "A. Striker" } }, // アシスト種別 → 除外
    ],
  }, 26618);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    season_id: 26618, player_id: 11, player_name: "A. Striker",
    team_id: 99, app_code: null, goals: 5, position: 1,
  });
});

test("toTopscorerRows は壊れた入力でも例外を投げず空配列", () => {
  assert.deepEqual(toTopscorerRows(null, 26618), []);
  assert.deepEqual(toTopscorerRows({ data: "x" }, 26618), []);
});
```
（注: `type_id: 208` は Task 1 スパイクで確認したゴール得点王の実 type_id に合わせること。`app_code` は participant.short_code を採点が使う3文字コードに変換できないため、ここでは null とし、配信時に sm_teams JOIN で解決する。）

- [ ] **Step 2: 失敗を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: FAIL（`toTopscorerRows` 未定義）

- [ ] **Step 3: 実装を追記（`sm-ingest.js` 末尾）**

```javascript
// season topscorers data[] → sm_topscorers 行（純変換）
// ゴール得点王のみ抽出（GOAL_TYPE_ID）。アシスト/カード種別は除外。
// app_code は participant→sm_teams の解決を要するため取り込み時は null、配信側 JOIN で埋める。
export const GOAL_TYPE_ID = 208; // Task1スパイクで確認した「ゴール」種別 type_id
export function toTopscorerRows(body, seasonId) {
	const list = Array.isArray(body?.data) ? body.data : [];
	return list
		.filter((d) => d?.player_id != null && d?.type_id === GOAL_TYPE_ID)
		.map((d) => ({
			season_id: seasonId ?? null,
			player_id: d.player_id,
			player_name: d?.player?.name ?? null,
			team_id: d?.participant_id ?? d?.participant?.id ?? null,
			app_code: null,
			goals: typeof d.total === "number" ? d.total : null,
			position: typeof d.position === "number" ? d.position : null,
		}));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/sm-ingest.js functions/_lib/sm-ingest.test.js
git commit -m "feat(sm): topscorers の純変換 toTopscorerRows"
```

### Task 5: topscorersStatements（upsert 文生成）

**Files:**
- Modify: `functions/_lib/sm-store.js`
- Test: `functions/_lib/sm-store.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-store.test.js` に追記:
```javascript
import { topscorersStatements } from "./sm-store.js";

test("topscorersStatements は player ごとに upsert 文を生成", () => {
  const specs = topscorersStatements(
    [{ season_id: 26618, player_id: 11, player_name: "A", team_id: 99, app_code: null, goals: 5, position: 1 }],
    1700,
  );
  assert.equal(specs.length, 1);
  assert.match(specs[0].sql, /INSERT INTO sm_topscorers/);
  assert.match(specs[0].sql, /ON CONFLICT\(season_id, player_id\) DO UPDATE/);
  assert.deepEqual(specs[0].args, [26618, 11, "A", 99, null, 5, 1, 1700]);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test functions/_lib/sm-store.test.js`
Expected: FAIL（`topscorersStatements` 未定義）

- [ ] **Step 3: 実装を追記（`sm-store.js`）**

`toTopscorerRows` を import に追加し、文生成を追記:
```javascript
function topscorerStatement(row, updatedAt) {
	return {
		sql: `INSERT INTO sm_topscorers
            (season_id, player_id, player_name, team_id, app_code, goals, position, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(season_id, player_id) DO UPDATE SET
            player_name=excluded.player_name, team_id=excluded.team_id,
            app_code=COALESCE(excluded.app_code, sm_topscorers.app_code),
            goals=excluded.goals, position=excluded.position,
            updated_at=excluded.updated_at`,
		args: [row.season_id, row.player_id, row.player_name, row.team_id,
			row.app_code, row.goals, row.position, updatedAt],
	};
}

// sm_topscorers 行配列 → upsert 文配列（純粋）
export function topscorersStatements(rows, updatedAt) {
	const list = Array.isArray(rows) ? rows : [];
	return list.map((r) => topscorerStatement(r, updatedAt));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-store.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/sm-store.js functions/_lib/sm-store.test.js
git commit -m "feat(sm): sm_topscorers upsert 文生成"
```

### Task 6: syncTopscorers（同期オーケストレーション）

**Files:**
- Modify: `functions/_lib/sm-sync.js`
- Test: `functions/_lib/sm-sync.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-sync.test.js` に追記（既存のモック流儀に合わせる）:
```javascript
import { syncTopscorers } from "./sm-sync.js";

test("syncTopscorers は topscorers を取得し upsert 件数を返す", async () => {
  const calls = [];
  const football = {
    get: async (path, opts) => {
      calls.push({ path, opts });
      return { data: [
        { position: 1, total: 5, type_id: 208, player_id: 11, participant_id: 99, player: { name: "A" } },
      ] };
    },
  };
  const batched = [];
  const db = { batch: async (s) => batched.push(s), prepare: () => ({ bind: () => ({}) }) };
  const r = await syncTopscorers(football, db, 26618, 1700);
  assert.equal(r.count, 1);
  assert.match(calls[0].path, /seasons\/26618\/topscorers/);
});

test("syncTopscorers は fetch 失敗でも例外を投げず error を返す", async () => {
  const football = { get: async () => { throw new Error("boom"); } };
  const db = { batch: async () => {}, prepare: () => ({ bind: () => ({}) }) };
  const r = await syncTopscorers(football, db, 26618, 1700);
  assert.equal(r.count, 0);
  assert.equal(r.error, "boom");
});
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test functions/_lib/sm-sync.test.js`
Expected: FAIL（`syncTopscorers` 未定義）

- [ ] **Step 3: 実装を追記（`sm-sync.js`）**

import に `topscorersStatements` を追加、`toTopscorerRows` を `sm-ingest.js` から import し、関数を追記:
```javascript
import { toTopscorerRows } from "./sm-ingest.js";
// ↑ファイル先頭の import 群に追加（topscorersStatements は ./sm-store.js から）

// season topscorers を取得し sm_topscorers へ upsert。得点王導出の元データ。
export async function syncTopscorers(footballClient, db, seasonId, now) {
	let body;
	try {
		body = await footballClient.get(`seasons/${seasonId}/topscorers`, {
			include: "player;participant",
		});
	} catch (e) {
		console.error("syncTopscorers: fetch failed", seasonId, e?.message);
		return { count: 0, error: e?.message };
	}
	const rows = toTopscorerRows(body, seasonId);
	if (!rows.length) return { count: 0 };
	try {
		await runChunked(db, topscorersStatements(rows, now));
		return { count: rows.length };
	} catch (e) {
		console.error("syncTopscorers: upsert failed", e?.message);
		return { count: 0, error: e?.message };
	}
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-sync.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/sm-sync.js functions/_lib/sm-sync.test.js
git commit -m "feat(sm): syncTopscorers 同期"
```

### Task 7: worker-watch から syncTopscorers を駆動

**Files:**
- Modify: `worker-watch/src/index.js`

- [ ] **Step 1: import に追加**

`worker-watch/src/index.js` の sm-sync import に `syncTopscorers` を加える。

- [ ] **Step 2: 日次ブロックに追加**

日次（`event.cron === "0 3 * * *"`）の `syncSeasonFixtures` 直後に:
```javascript
			const ts = await syncTopscorers(football, env.DB, SEASON_2026, now);
			console.log(`watch-cron daily: topscorers=${ts.count}${ts.error ? " err=" + ts.error : ""}`);
```

- [ ] **Step 3: ライブ（毎分）ブロックに追加**

毎分側の detail 同期 try ブロックの後（同 else 節の末尾）に:
```javascript
			const tsLive = await syncTopscorers(football, env.DB, SEASON_2026, now);
			if (tsLive.error) console.error("watch-cron: topscorers err=" + tsLive.error);
```

- [ ] **Step 4: 手動トリガに action を追加**

`fetch` ハンドラの `action === "live"` 分岐の後に:
```javascript
			if (action === "topscorers") {
				const r = await syncTopscorers(football, env.DB, SEASON_2026, now);
				return Response.json({ ok: true, ...r });
			}
```

- [ ] **Step 5: バンドルが通ることを確認**

Run: `cd worker-watch && npx wrangler deploy --dry-run --outdir /tmp/wt-out 2>&1 | tail -5; cd ..`
Expected: ビルド成功（`Total Upload` 行が出る／構文エラーが無い）。

- [ ] **Step 6: コミット**

```bash
git add worker-watch/src/index.js
git commit -m "feat(watch): Cron 日次/毎分で syncTopscorers を駆動"
```

---

## Phase 3: 導出ロジック sm-results.js（純関数・FT確定ルール）

導出の入力行は `sm-read.js` の `mapFixtureRow` 形（`{ status, round_name, home:{app_code,score}, away:{app_code,score}, ... }`）と、`sm_topscorers` 行（`{ player_name, app_code, goals, position }`）を想定する。

### Task 8: ROUND_MAP と FT 判定ヘルパ

**Files:**
- Create: `functions/_lib/sm-results.js`
- Test: `functions/_lib/sm-results.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-results.test.js`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { roundKey, isFinalRound } from "./sm-results.js";

test("roundKey は SportMonks round 名をアプリの r32/r16/qf/sf へ写像", () => {
  assert.equal(roundKey("Round of 32"), "r32");
  assert.equal(roundKey("Round of 16"), "r16");
  assert.equal(roundKey("Quarter-finals"), "qf");
  assert.equal(roundKey("Semi-finals"), "sf");
  assert.equal(roundKey("Group A"), null);
});

test("isFinalRound は決勝のみ true（3位決定戦は除外）", () => {
  assert.equal(isFinalRound("Final"), true);
  assert.equal(isFinalRound("3rd Place Final"), false);
  assert.equal(isFinalRound("Semi-finals"), false);
});
```
（注: 文字列は Task 1 スパイクの実値に合わせること。表記ゆれ対策で小文字化＋記号除去して突合する。）

- [ ] **Step 2: 失敗を確認**

Run: `node --test functions/_lib/sm-results.test.js`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: 実装**

`functions/_lib/sm-results.js`:
```javascript
// sm_* 行 → 採点が読む result/groupMatches への純導出（観戦プラットフォーム / 大会結果自動反映）
// 不変条件: 副作用なし。壊れた/欠損入力でも例外を投げず空・null で返す（障害隔離）。
// FT確定ルール: 採点に効く確定値は status==="FT" の試合からのみ。順位表表示はライブ込み。

// 突合用に round 名を正規化（小文字化・英数のみ）
function normRound(s) {
	return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// SportMonks round 名 → アプリのノックアウト到達キー。グループ戦・決勝・3位決定は null。
export function roundKey(roundName) {
	const n = normRound(roundName);
	if (n === "roundof32") return "r32";
	if (n === "roundof16") return "r16";
	if (n === "quarterfinals") return "qf";
	if (n === "semifinals") return "sf";
	return null;
}

// 決勝のみ true。"3rd Place Final" を誤検出しないため完全一致で判定。
export function isFinalRound(roundName) {
	return normRound(roundName) === "final";
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-results.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/sm-results.js functions/_lib/sm-results.test.js
git commit -m "feat(results): round マッピングと FT 判定ヘルパ"
```

### Task 9: deriveGroupMatches（順位表表示・ライブ込み）

**Files:**
- Modify: `functions/_lib/sm-results.js`
- Test: `functions/_lib/sm-results.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { deriveGroupMatches } from "./sm-results.js";

const groups = { A: ["MEX", "KOR", "RSA", "CZE"] };

test("deriveGroupMatches はグループ内対戦のスコアを {a,b,ga,gb} で返す（ライブ込み）", () => {
  const fixtures = [
    { status: "FT", home: { app_code: "MEX", score: 2 }, away: { app_code: "KOR", score: 1 } },
    { status: "LIVE", home: { app_code: "RSA", score: 0 }, away: { app_code: "CZE", score: 0 } },
    { status: "NS", home: { app_code: "MEX", score: null }, away: { app_code: "RSA", score: null } },
    { status: "FT", home: { app_code: "BRA", score: 1 }, away: { app_code: "MAR", score: 0 } }, // 別グループ→除外
  ];
  const gm = deriveGroupMatches(fixtures, groups);
  assert.equal(gm.A.length, 2); // FT + LIVE（NS はスコア null）
  assert.deepEqual(gm.A[0], { a: "MEX", b: "KOR", ga: 2, gb: 1 });
  assert.deepEqual(gm.A[1], { a: "RSA", b: "CZE", ga: 0, gb: 0 });
});
```

- [ ] **Step 2: 失敗を確認 → Step 3: 実装**

Run: `node --test functions/_lib/sm-results.test.js` → FAIL

`sm-results.js` に追記:
```javascript
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// 各グループに属する fixtures（両 app_code が同一グループ）のスコアを {a,b,ga,gb} 配列で返す。
// 順位表「表示」用なのでライブ(LIVE/FT)のスコアを含める。NS/スコア欠落は除外。
export function deriveGroupMatches(fixtures, groups) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const out = {};
	for (const g of Object.keys(groups || {})) {
		const members = new Set((groups[g] || []).filter(Boolean));
		out[g] = [];
		for (const fx of list) {
			const a = fx?.home?.app_code, b = fx?.away?.app_code;
			if (!a || !b || !members.has(a) || !members.has(b)) continue;
			const ga = fx?.home?.score, gb = fx?.away?.score;
			if (!isNum(ga) || !isNum(gb)) continue;
			out[g].push({ a, b, ga, gb });
		}
	}
	return out;
}
```

- [ ] **Step 4: PASS 確認 → Step 5: コミット**

Run: `node --test functions/_lib/sm-results.test.js` → PASS
```bash
git add functions/_lib/sm-results.js functions/_lib/sm-results.test.js
git commit -m "feat(results): グループ対戦スコア導出（ライブ込み）"
```

### Task 10: deriveGroupResult（採点用・全試合FTのグループのみ上位3）

**Files:**
- Modify: `functions/_lib/sm-results.js`
- Test: `functions/_lib/sm-results.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { deriveGroupResult } from "./sm-results.js";

test("deriveGroupResult は全6試合FTのグループだけ上位3コードを返す", () => {
  const full = [];
  const m = (a, b, ga, gb) => ({ status: "FT", home: { app_code: a, score: ga }, away: { app_code: b, score: gb } });
  // A: 6試合すべてFT（MEX全勝, KOR2位, RSA3位）
  full.push(m("MEX","KOR",2,0), m("MEX","RSA",2,0), m("MEX","CZE",2,0),
            m("KOR","RSA",1,0), m("KOR","CZE",1,0), m("RSA","CZE",1,0));
  const gr = deriveGroupResult(full, { A: ["MEX","KOR","RSA","CZE"] });
  assert.deepEqual(gr.A, ["MEX","KOR","RSA"]);
});

test("deriveGroupResult は未完（FT<6）のグループは空配列", () => {
  const partial = [{ status: "FT", home: { app_code: "MEX", score: 1 }, away: { app_code: "KOR", score: 0 } }];
  const gr = deriveGroupResult(partial, { A: ["MEX","KOR","RSA","CZE"] });
  assert.deepEqual(gr.A, []);
});
```

- [ ] **Step 2: 失敗を確認 → Step 3: 実装**

Run → FAIL。`sm-results.js` に追記（順位計算は既存 `computeStandings` と同一ロジックを内蔵）:
```javascript
// 勝点→得失点差→総得点→登録順。FT試合のみ集計（採点用）。
function standingsFT(members, fixtures) {
	const order = (members || []).filter(Boolean);
	const row = {};
	order.forEach((c, i) => { row[c] = { c, pts: 0, gf: 0, ga: 0, _i: i }; });
	for (const fx of fixtures || []) {
		if (fx?.status !== "FT") continue;
		const a = fx?.home?.app_code, b = fx?.away?.app_code;
		const ga = fx?.home?.score, gb = fx?.away?.score;
		if (!row[a] || !row[b] || !isNum(ga) || !isNum(gb)) continue;
		row[a].gf += ga; row[a].ga += gb; row[b].gf += gb; row[b].ga += ga;
		if (ga > gb) row[a].pts += 3; else if (ga < gb) row[b].pts += 3;
		else { row[a].pts += 1; row[b].pts += 1; }
	}
	return order.map((c) => row[c]).sort((x, y) =>
		y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x._i - y._i);
}

// 全6試合（4チーム総当たり）がFTのグループのみ、上位3コードを返す。未完は空配列。
export function deriveGroupResult(fixtures, groups) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const out = {};
	for (const g of Object.keys(groups || {})) {
		const members = (groups[g] || []).filter(Boolean);
		const ftCount = list.filter((fx) => {
			if (fx?.status !== "FT") return false;
			const a = fx?.home?.app_code, b = fx?.away?.app_code;
			return members.includes(a) && members.includes(b);
		}).length;
		const expected = (members.length * (members.length - 1)) / 2;
		out[g] = ftCount >= expected && expected > 0
			? standingsFT(members, list).slice(0, 3).map((r) => r.c)
			: [];
	}
	return out;
}
```

- [ ] **Step 4: PASS 確認 → Step 5: コミット**

Run → PASS
```bash
git add functions/_lib/sm-results.js functions/_lib/sm-results.test.js
git commit -m "feat(results): グループ順位の確定導出（全試合FT条件）"
```

### Task 11: deriveChampion（決勝→優勝/準優勝・FTのみ）

**Files:**
- Modify: `functions/_lib/sm-results.js`
- Test: `functions/_lib/sm-results.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { deriveChampion } from "./sm-results.js";

test("deriveChampion は決勝FTから勝者=champion・敗者=runnerUp", () => {
  const fixtures = [
    { status: "FT", round_name: "Final", home: { app_code: "ARG", score: 3 }, away: { app_code: "FRA", score: 1 } },
  ];
  assert.deepEqual(deriveChampion(fixtures), { champion: "ARG", runnerUp: "FRA" });
});

test("deriveChampion は決勝が未FTなら null/null", () => {
  const fixtures = [
    { status: "LIVE", round_name: "Final", home: { app_code: "ARG", score: 0 }, away: { app_code: "FRA", score: 0 } },
  ];
  assert.deepEqual(deriveChampion(fixtures), { champion: null, runnerUp: null });
});
```

- [ ] **Step 2: 失敗を確認 → Step 3: 実装**

```javascript
// 決勝(FT)から優勝・準優勝を決める。未FT/同点(PK決着含む result_info 未対応)は null。
// 注: PK 決着は home_score==away_score になりうるが、SportMonks の CURRENT スコアは
// 延長まで反映され PK は別。確実な勝者判定は今後 result_info 解析で補強（YAGNI: まずスコア差）。
export function deriveChampion(fixtures) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const fin = list.find((fx) => isFinalRound(fx?.round_name) && fx?.status === "FT");
	if (!fin) return { champion: null, runnerUp: null };
	const ha = fin?.home?.app_code, aa = fin?.away?.app_code;
	const hs = fin?.home?.score, as = fin?.away?.score;
	if (!ha || !aa || !isNum(hs) || !isNum(as) || hs === as)
		return { champion: null, runnerUp: null };
	return hs > as ? { champion: ha, runnerUp: aa } : { champion: aa, runnerUp: ha };
}
```

- [ ] **Step 4: PASS 確認 → Step 5: コミット**

```bash
git add functions/_lib/sm-results.js functions/_lib/sm-results.test.js
git commit -m "feat(results): 決勝から優勝/準優勝の導出"
```

### Task 12: deriveKnockout / deriveBracket（到達チーム＋ラウンド勝者）

**Files:**
- Modify: `functions/_lib/sm-results.js`
- Test: `functions/_lib/sm-results.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { deriveKnockout, deriveBracket } from "./sm-results.js";

const koFixtures = [
  { status: "FT", round_name: "Round of 16", home: { app_code: "ARG", score: 2 }, away: { app_code: "MEX", score: 0 } },
  { status: "FT", round_name: "Round of 16", home: { app_code: "FRA", score: 1 }, away: { app_code: "ESP", score: 0 } },
  { status: "FT", round_name: "Quarter-finals", home: { app_code: "ARG", score: 1 }, away: { app_code: "FRA", score: 0 } },
];

test("deriveKnockout は各ラウンドに到達した app_code 群（重複なし）", () => {
  const ko = deriveKnockout(koFixtures);
  assert.deepEqual(ko.r16.sort(), ["ARG","ESP","FRA","MEX"].sort());
  assert.deepEqual(ko.qf.sort(), ["ARG","FRA"].sort());
  assert.deepEqual(ko.r32, []);
  assert.deepEqual(ko.sf, []);
});

test("deriveBracket はラウンドFT勝者コードを返す", () => {
  const b = deriveBracket(koFixtures);
  assert.deepEqual(b.r16.sort(), ["ARG","FRA"].sort());
  assert.deepEqual(b.qf, ["ARG"]);
});
```

- [ ] **Step 2: 失敗を確認 → Step 3: 実装**

```javascript
const KO_ROUNDS = ["r32", "r16", "qf", "sf"];

// 各ノックアウト round に「登場した」app_code 群（到達チーム。採点 knockout 用）。
export function deriveKnockout(fixtures) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const out = { r32: new Set(), r16: new Set(), qf: new Set(), sf: new Set() };
	for (const fx of list) {
		const k = roundKey(fx?.round_name);
		if (!k || !out[k]) continue;
		const a = fx?.home?.app_code, b = fx?.away?.app_code;
		if (a) out[k].add(a);
		if (b) out[k].add(b);
	}
	return Object.fromEntries(KO_ROUNDS.map((k) => [k, [...out[k]]]));
}

// 各ラウンドのFT勝者コード（ブラケット表示用）。final は決勝勝者1名。
export function deriveBracket(fixtures) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const winner = (fx) => {
		const hs = fx?.home?.score, as = fx?.away?.score;
		if (fx?.status !== "FT" || !isNum(hs) || !isNum(as) || hs === as) return null;
		return hs > as ? fx.home.app_code : fx.away.app_code;
	};
	const out = { r16: [], qf: [], sf: [], final: [] };
	for (const fx of list) {
		const w = winner(fx);
		if (!w) continue;
		const k = roundKey(fx?.round_name);
		if (k === "r16" || k === "qf" || k === "sf") out[k].push(w);
		else if (isFinalRound(fx?.round_name)) out.final.push(w);
	}
	return out;
}
```

- [ ] **Step 4: PASS 確認 → Step 5: コミット**

```bash
git add functions/_lib/sm-results.js functions/_lib/sm-results.test.js
git commit -m "feat(results): ノックアウト到達/ブラケット勝者の導出"
```

### Task 13: deriveTopScorer（"名前 (CODE)" 整形）

**Files:**
- Modify: `functions/_lib/sm-results.js`
- Test: `functions/_lib/sm-results.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { deriveTopScorer } from "./sm-results.js";

test("deriveTopScorer は position 最小（goals 最大）を '名前 (CODE)' で返す", () => {
  const rows = [
    { player_name: "B", app_code: "FRA", goals: 4, position: 2 },
    { player_name: "A. Striker", app_code: "ARG", goals: 6, position: 1 },
  ];
  assert.equal(deriveTopScorer(rows), "A. Striker (ARG)");
});

test("deriveTopScorer は app_code 欠落なら名前のみ", () => {
  assert.equal(deriveTopScorer([{ player_name: "X", app_code: null, goals: 3, position: 1 }]), "X");
});

test("deriveTopScorer は空なら空文字", () => {
  assert.equal(deriveTopScorer([]), "");
});
```

- [ ] **Step 2: 失敗を確認 → Step 3: 実装**

```javascript
// sm_topscorers 行（配信側で app_code 解決済み）→ 採点 result.topScorer 文字列。
// 採点 resolve() は "NAME (CODE)" を CODE::正規化名 へ畳むため、この形式に合わせる。
export function deriveTopScorer(rows) {
	const list = Array.isArray(rows) ? rows.slice() : [];
	if (!list.length) return "";
	list.sort((a, b) =>
		(a?.position ?? 1e9) - (b?.position ?? 1e9) || (b?.goals ?? 0) - (a?.goals ?? 0));
	const top = list[0];
	const name = top?.player_name ?? "";
	if (!name) return "";
	return top?.app_code ? `${name} (${top.app_code})` : name;
}
```

- [ ] **Step 4: PASS 確認 → Step 5: コミット**

```bash
git add functions/_lib/sm-results.js functions/_lib/sm-results.test.js
git commit -m "feat(results): 得点王の表示文字列導出"
```

### Task 14: deriveResult（合成）

**Files:**
- Modify: `functions/_lib/sm-results.js`
- Test: `functions/_lib/sm-results.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { deriveResult } from "./sm-results.js";

test("deriveResult は各導出を 1 つの result 型に束ねる", () => {
  const fixtures = [
    { status: "FT", round_name: "Final", home: { app_code: "ARG", score: 1 }, away: { app_code: "FRA", score: 0 } },
  ];
  const topscorers = [{ player_name: "A", app_code: "ARG", goals: 5, position: 1 }];
  const r = deriveResult(fixtures, topscorers, { A: ["MEX","KOR","RSA","CZE"] });
  assert.equal(r.champion, "ARG");
  assert.equal(r.runnerUp, "FRA");
  assert.equal(r.topScorer, "A (ARG)");
  assert.ok(r.groupResult && r.knockout && r.bracket);
});
```

- [ ] **Step 2: 失敗を確認 → Step 3: 実装**

```javascript
// 全導出を採点が読む result 型に束ねる。groupMatches は順位表表示用に別で返す。
export function deriveResult(fixtures, topscorers, groups) {
	const { champion, runnerUp } = deriveChampion(fixtures);
	return {
		champion,
		runnerUp,
		topScorer: deriveTopScorer(topscorers),
		groupResult: deriveGroupResult(fixtures, groups),
		knockout: deriveKnockout(fixtures),
		bracket: deriveBracket(fixtures),
	};
}
```

- [ ] **Step 4: PASS 確認 → Step 5: コミット**

```bash
git add functions/_lib/sm-results.js functions/_lib/sm-results.test.js
git commit -m "feat(results): deriveResult 合成"
```

---

## Phase 4: 配信 /api/results

### Task 15: sm-read に topscorers 読み取りを追加（app_code 解決込み）

**Files:**
- Modify: `functions/_lib/sm-read.js`
- Test: `functions/_lib/sm-read.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-read.test.js` に追記（既存のモック db 流儀に合わせる）:
```javascript
import { listTopscorers } from "./sm-read.js";

test("listTopscorers は sm_topscorers を順位順で返す", async () => {
  const db = {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [
          { player_name: "A", app_code: "ARG", goals: 6, position: 1 },
        ] }),
      }),
    }),
  };
  const rows = await listTopscorers(db, 26618);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].app_code, "ARG");
});
```

- [ ] **Step 2: 失敗を確認 → Step 3: 実装**

`sm-read.js` に追記（topscorers.team_id を sm_teams.app_code で解決。取り込み時 null の app_code をここで埋める）:
```javascript
const TOPSCORERS_SQL = `
  SELECT t.player_name, t.goals, t.position,
         COALESCE(t.app_code, m.app_code) AS app_code
  FROM sm_topscorers t
  LEFT JOIN sm_teams m ON m.sm_team_id = t.team_id
  WHERE t.season_id = ?
  ORDER BY t.position ASC
  LIMIT ?`;

export async function listTopscorers(db, seasonId, { limit = 30 } = {}) {
	const res = await db.prepare(TOPSCORERS_SQL).bind(seasonId, limit).all();
	return Array.isArray(res?.results) ? res.results : [];
}
```

- [ ] **Step 4: PASS 確認 → Step 5: コミット**

```bash
git add functions/_lib/sm-read.js functions/_lib/sm-read.test.js
git commit -m "feat(read): listTopscorers（app_code を sm_teams で解決）"
```

### Task 16: GET /api/results エンドポイント

**Files:**
- Create: `functions/api/results.js`
- Test: `functions/api/results.test.js`

- [ ] **Step 1: 失敗するテストを書く**

既存 `functions/api/fixture.test.js` / `live.test.js` の流儀に合わせる。`functions/api/results.test.js`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "./results.js";

const fixturesRows = (rows) => ({
  prepare: (sql) => ({
    bind: () => ({ all: async () => ({ results: sql.includes("sm_topscorers") ? [] : rows }) }),
  }),
});

test("WATCH_ENABLED 未設定なら enabled:false", async () => {
  const res = await onRequestGet({ env: {}, request: new Request("https://x/api/results") });
  const body = await res.json();
  assert.equal(body.enabled, false);
});

test("有効時は result/groupMatches を返す", async () => {
  const env = {
    WATCH_ENABLED: "true",
    DB: fixturesRows([
      { sm_fixture_id: 1, state_id: 5, round_name: "Final",
        home_team_id: 1, home_app: "ARG", home_score: 1,
        away_team_id: 2, away_app: "FRA", away_score: 0 },
    ]),
  };
  const res = await onRequestGet({ env, request: new Request("https://x/api/results") });
  const body = await res.json();
  assert.equal(body.enabled, true);
  assert.equal(body.result.champion, "ARG");
});
```

- [ ] **Step 2: 失敗を確認 → Step 3: 実装**

既存 `functions/api/live.js` のゲート・エラー隔離・`json()` ヘルパ流儀に合わせる。`config` の `groups` は導出に必須なので `DEFAULT_CONFIG.groups` をフォールボールに使う（手動で groups を変えていても、グループ構成は固定運用前提）。`functions/api/results.js`:
```javascript
import { json } from "../_lib/http.js";
import { listFixtures, listTopscorers } from "../_lib/sm-read.js";
import { deriveResult, deriveGroupMatches } from "../_lib/sm-results.js";
import { DEFAULT_CONFIG } from "../_lib/defaults.js";

const SEASON_2026 = 26618;

export async function onRequestGet(context) {
	const { env } = context;
	if (env.WATCH_ENABLED !== "true")
		return json(200, { enabled: false, result: null, groupMatches: null });
	if (!env.DB)
		return json(200, { enabled: true, result: null, groupMatches: null, note: "no-db" });
	try {
		const groups = DEFAULT_CONFIG.groups;
		const fixtures = await listFixtures(env.DB, { limit: 200 });
		const topscorers = await listTopscorers(env.DB, SEASON_2026);
		const result = deriveResult(fixtures, topscorers, groups);
		const groupMatches = deriveGroupMatches(fixtures, groups);
		return json(200,
			{ enabled: true, result, groupMatches, updatedAt: null },
			{ "cache-control": "public, s-maxage=30, stale-while-revalidate=60" });
	} catch (e) {
		console.error("api/results failed", e?.message);
		return json(200, { enabled: true, result: null, groupMatches: null, note: "error" });
	}
}
```

- [ ] **Step 4: PASS 確認**

Run: `node --test functions/api/results.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/api/results.js functions/api/results.test.js
git commit -m "feat(api): GET /api/results（導出配信・WATCH_ENABLED ゲート）"
```

---

## Phase 5: クライアント統合（手動優先マージ＋ポーリング）

### Task 17: data.js に fetchResults と手動優先マージを追加

**Files:**
- Modify: `public/data.js`

マージ規約: `fetchConfig` が先に `window.WC.RESULT`（手動）/`GROUP_MATCHES`/`GROUP_RESULT` を確定 → `fetchResults` は **空のフィールドだけ** 自動値で埋める（手動が非空なら手動を残す）。

- [ ] **Step 1: 空判定ヘルパとマージ関数を追加**

`public/data.js` の `fetchLive` 定義の直後に追記:
```javascript
	// ---- 大会結果の自動反映（/api/results）----------------------
	// 手動(config.result)が非空なら手動優先。空フィールドだけ自動導出で埋める。
	function _isEmptyVal(v) {
		if (v == null || v === "") return true;
		if (Array.isArray(v)) return v.length === 0;
		return false;
	}
	// 浅いフィールド単位の「手動 ?? 自動」。object 値（groupResult/knockout/bracket）は
	// キー単位で再帰的に空判定して埋める。
	function _mergePreferManual(manual, auto) {
		if (!auto || typeof auto !== "object") return manual;
		const out = Array.isArray(manual) ? manual.slice() : { ...(manual || {}) };
		for (const k of Object.keys(auto)) {
			const mv = out[k];
			const av = auto[k];
			if (av && typeof av === "object" && !Array.isArray(av)) {
				out[k] = _mergePreferManual(mv || {}, av);
			} else if (_isEmptyVal(mv)) {
				out[k] = av;
			}
		}
		return out;
	}
	window.WC.fetchResults = async function fetchResults() {
		try {
			const res = await fetch("/api/results", { cache: "no-store" });
			if (!res.ok) return false;
			const data = await res.json();
			if (!data || data.enabled === false || !data.result) return false;
			// result（champion/runnerUp/topScorer/groupResult/knockout/bracket）を手動優先マージ
			window.WC.RESULT = _mergePreferManual(window.WC.RESULT || {}, data.result);
			if (data.result.groupResult) {
				window.WC.GROUP_RESULT = window.WC.RESULT.groupResult;
			}
			// groupMatches（順位表表示）も手動優先で埋める
			if (data.groupMatches) {
				window.WC.GROUP_MATCHES = _mergePreferManual(
					window.WC.GROUP_MATCHES || {}, data.groupMatches);
			}
			return true;
		} catch (e) {
			return false;
		}
	};
```

- [ ] **Step 2: 構文チェック（node で読み込み確認は不可なので lint 相当の確認）**

Run: `node -e "require('fs').readFileSync('public/data.js','utf8'); console.log('readable')"` （構文の目視確認）
Run: `npx prettier --check public/data.js || npx prettier --write public/data.js`
Expected: フォーマット整合（プロジェクトの PostToolUse Prettier フックと一致）。

- [ ] **Step 3: コミット**

```bash
git add public/data.js
git commit -m "feat(data): fetchResults と大会結果の手動優先マージ"
```

### Task 18: 起動シーケンスとライブ中ポーリングを配線

**Files:**
- Modify: `public/index.html`（`useEffect` 起動ブロック / バージョンクエリ）

- [ ] **Step 1: 起動時に fetchResults を呼ぶ**

`public/index.html` の `window.WC.fetchLive().then(...)` を次へ置換（config→results→live の順。results は live より前に手動の空を埋める）:
```javascript
          // 大会結果の自動導出を取得（手動の空フィールドを埋める）。OFF/失敗は手動のまま。
          window.WC.fetchResults().then(() => {
            setConfigLoaded((v) => !v);
            // 観戦ライブ（状態＋スコア）を取得。完了で再レンダリングして反映。
            window.WC.fetchLive().then(() => setConfigLoaded((v) => !v));
          });
```

- [ ] **Step 2: ライブ中のポーリングを追加**

同 `useEffect` 内、`fetchConfig().then(...)` ブロックの後に追記（`window.WC.LIVE` に1件でもあればライブ中とみなし 45 秒間隔で results＋live を再取得）:
```javascript
        const pollId = setInterval(() => {
          const hasLive = window.WC.LIVE && Object.values(window.WC.LIVE)
            .some((x) => x && x.status === "LIVE");
          if (!hasLive) return; // 非ライブ時はポーリングしない
          window.WC.fetchResults().then(() => setConfigLoaded((v) => !v));
          window.WC.fetchLive().then(() => setConfigLoaded((v) => !v));
        }, 45000);
```
そして同 `useEffect` の `return`（クリーンアップ）がある場合は `clearInterval(pollId)` を加える。無ければ末尾に:
```javascript
        return () => clearInterval(pollId);
```
（注: 既存 useEffect の依存配列は `[]`。`return` が既にあれば統合する。）

- [ ] **Step 3: jsx キャッシュバスター更新（必須・運用ルール）**

`public/index.html` 内の data.js 読み込み `?v=N` を +1 する（メモリ「デプロイ運用フロー」の jsx 変更時ルール）。
Run: `grep -n "data.js?v=" public/index.html`
該当の `?v=<N>` を `?v=<N+1>` に更新。

- [ ] **Step 4: 手動確認（ローカル）**

Run: `npx wrangler pages dev public --compatibility-date=2024-01-01` を tmux で起動し、ブラウザで大会結果タブを開く。`WATCH_ENABLED` 未設定なら従来表示（手動のみ）、設定時は自動マージが反映されることを確認。
Expected: OFF で従来どおり / ON で空フィールドが自動値で埋まる。

- [ ] **Step 5: コミット**

```bash
git add public/index.html
git commit -m "feat(app): 起動時 fetchResults とライブ中ポーリング配線（?v 更新）"
```

---

## Phase 6: サーバ側採点の確認と適用

### Task 19: rooms 等のサーバ側採点で result を使う箇所を確認し、必要なら同一導出を適用

**Files:**
- 調査: `functions/_lib/rooms.js` / `functions/api/room.js` / `functions/_lib/predictions.js` / `functions/_lib/scoring.test.js`
- （必要時）Modify: 上記サーバ採点経路

- [ ] **Step 1: サーバ側で result/groupResult/scorers を使った採点・集計があるか確認**

Run: `grep -rn "scoreMember\|result\b\|groupResult\|topScorer\|champion" functions/_lib/rooms.js functions/api/room.js functions/_lib/predictions.js`
判定:
- **クライアントだけが採点している**（サーバは予想保存・ランキング素材の受け渡しのみ）→ 追加実装不要。Step 3 へ。
- **サーバが `scoreMember` 等で `result` を参照して順位を計算している** → Step 2。

- [ ] **Step 2: サーバ採点が手動 config.result を読んでいる箇所を、導出マージ後の result に差し替える**

該当サーバ経路で `config.result` を取得している箇所の直後に、`WATCH_ENABLED` 有効時のみ導出をマージする（`/api/results` と同じ `deriveResult`/`deriveGroupMatches` と手動優先マージを再利用）。具体的なマージ関数はサーバ用に `functions/_lib/sm-results.js` に `mergeResultPreferManual(manual, auto)` を追加し、`public/data.js` の `_mergePreferManual` と同一ロジックにする（DRY: ロジックは1か所、クライアントは同等の薄い実装）。

- [ ] **Step 3: 全テスト緑を確認**

Run: `node --test functions/_lib/*.test.js functions/api/*.test.js`
Expected: 全 PASS（既存 + 新規）。

- [ ] **Step 4: コミット**

```bash
git add -A
git commit -m "feat(score): サーバ側採点への大会結果自動反映（必要時）"
```

---

## デプロイ（実装完了後・別途ユーザー判断）

1. 本番 D1 に新テーブル: `wrangler d1 execute wcup2026-db --file db/schema-watch.sql --remote`
2. `worker-watch` 再デプロイ: `cd worker-watch && wrangler deploy`
3. topscorers 初回 backfill: `GET /?action=topscorers&key=<WATCH_CRON_KEY>`
4. Pages 再デプロイ（`/api/results`＋フロント）。`WATCH_ENABLED=true` は既に wrangler.toml に設定済み。
5. 大会結果タブで自動マージ表示を確認。誤りがあれば管理画面の手入力で上書き。

---

## Self-Review チェック結果

- **Spec coverage**: 順位表(Task 9)/得点王(Task 3-6,13,15)/優勝・準優勝(Task 11)/ブラケット・到達(Task 12)/手動優先マージ(Task 17,19)/ライブ中ポーリング(Task 18)/採点連動(Task 17 でクライアント、Task 19 でサーバ)/FT確定ルール(Task 10,11,12)/round 解決(Task 2,8)/エラー隔離(Task 16) — 全要件にタスク対応あり。
- **Placeholder scan**: コード断片は全て実コード。スパイク依存の定数(`GOAL_TYPE_ID`, ROUND文字列)は実値を入れた上で「Task 1 で確認」と明記（TODO ではなく検証）。
- **Type consistency**: 導出は一貫して `mapFixtureRow` 形（`status`/`round_name`/`home.app_code`/`home.score`）を入力に取る。`deriveResult` の戻りは採点 `scoreMember` が読む `{champion, runnerUp, topScorer, groupResult, knockout, bracket}` と一致。`roundKey`/`isFinalRound`/`deriveGroupResult`/`deriveChampion`/`deriveKnockout`/`deriveBracket`/`deriveTopScorer`/`deriveGroupMatches`/`deriveResult` の名称はファイル間で一致。
