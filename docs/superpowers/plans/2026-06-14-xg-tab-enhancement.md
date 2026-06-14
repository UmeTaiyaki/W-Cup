# xGタブ強化（フル分析コンパニオン化）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 試合詳細xGタブを、土台の取り込みギャップを直したうえで「素人でもわかるフル分析コンパニオン」（xG/xGoT/被xG/xG差/xPTS/npxG/セットプレー内訳/GK評価/選手別/モメンタム/流れ）へ強化する。

**Architecture:** ①バックエンド取り込み層で `xgfixture` を `sm_stats` に流し込み（スキーマ無変更）、`xgFor` の type_id バグを修正、時系列(pressure/trends)を新 `sm_fixture_series`（1行JSON, FT時1回）に保存。②フロントは `XgTab` を小コンポーネントへ分割し、既存の消灯セクションを点灯＋新セクション追加＋全セクションに「端的1行＋改行して例：」解説を付与。ライブは1–7（速報注記）、FTのみ 8–9。

**Tech Stack:** Cloudflare Pages Functions（D1）, worker-watch（Cron Worker）, バニラJSX（`public/screens-detail.jsx`、Babel standalone）, テスト=`node:test`（バックエンドのみ。フロントはシード＋ブラウザハーネス目視）。

設計正本: `docs/superpowers/specs/2026-06-14-xg-tab-enhancement-design.md`

---

## File Structure

**バックエンド（取り込み・保存・読み出し）:**
- `functions/_lib/sm-ingest.js` — 純粋変換。`toXgStatRows`（新）・`xgFor`修正・`toSeriesRow`（新）
- `functions/_lib/sm-store.js` — D1文生成。`seriesStatement`（新）・`fixtureDetailStatements`に xgstat 行追加・`fixtureSeriesStatements`（新）
- `functions/_lib/sm-sync.js` — API同期。`syncFixtureSeries`（新）
- `functions/_lib/sm-read.js` — `getFixtureDetail` に `series` 追加
- `db/schema-watch.sql` ＋ `db/0013_sm_fixture_series.sql` — 新テーブル
- `worker-watch/src/index.js` — FT時の series 書き込みステップ追加

**フロントエンド（`public/screens-detail.jsx` 内）:**
- `XgSectionHead`（新・共通解説ヘッダ）
- `XgBreakdown`（新・3 内訳）/ `XgNpxg`（新・4）/ `XgMomentum`（新・8）/ `XgFlow`（新・9）
- `XgTab`（改修・順序/ゲート/xPTS/選手別xGoT/解説）
- `public/index.html` — `screens-detail.jsx?v=N` bump
- `db/seed-xg-analysis.sql` — xgfixture由来 sm_stats 行＋series サンプル

**テスト:** `functions/_lib/sm-ingest.test.js` / `sm-store.test.js` / `sm-sync.test.js` / `sm-read.test.js` に追記。

---

## Task 1: `toXgStatRows` — xgfixture を sm_stats 行へ

**Files:**
- Modify: `functions/_lib/sm-ingest.js`（`xgFor` の直後に追加）
- Modify: `functions/_lib/sm-store.js:231` `fixtureDetailStatements`
- Test: `functions/_lib/sm-ingest.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-ingest.test.js` の import に `toXgStatRows` を追加し、末尾に追記:

```javascript
import { toXgStatRows } from "./sm-ingest.js";

test("toXgStatRows: xgfixture を {fixture,team,type_id,value} 行へ畳む", () => {
	const detail = {
		id: 19609127,
		xgfixture: [
			{ participant_id: 18555, location: "home", type_id: 5304, value: 0.4263 },
			{ participant_id: 18576, location: "away", type_id: 5304, value: 0.0407 },
			{ participant_id: 18555, location: "home", type_id: 5305, data: { value: 0.4158 } },
			{ participant_id: null, location: "home", type_id: 7939, value: 1.65 }, // participant欠落→skip
		],
	};
	const rows = toXgStatRows(detail);
	assert.deepEqual(rows, [
		{ sm_fixture_id: 19609127, team_id: 18555, type_id: 5304, value: 0.4263 },
		{ sm_fixture_id: 19609127, team_id: 18576, type_id: 5304, value: 0.0407 },
		{ sm_fixture_id: 19609127, team_id: 18555, type_id: 5305, value: 0.4158 },
	]);
});

test("toXgStatRows: xgfixture 無しは空配列", () => {
	assert.deepEqual(toXgStatRows({ id: 1 }), []);
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: FAIL（`toXgStatRows is not a function` / not exported）

- [ ] **Step 3: 最小実装**

`functions/_lib/sm-ingest.js` の `xgFor` 関数（67–77行付近）の直後に追加:

```javascript
// xGFixture include（配列キー xgfixture）を sm_stats 縦持ち行へ畳む。
// 各要素: { participant_id, location, type_id, value | data.value }。statistics には来ないため別経路。
export function toXgStatRows(detail) {
	const xg = Array.isArray(detail?.xgfixture)
		? detail.xgfixture
		: Array.isArray(detail?.xGFixture)
			? detail.xGFixture
			: [];
	const fixtureId = detail?.id ?? null;
	return xg
		.filter((x) => x?.type_id != null && x?.participant_id != null)
		.map((x) => ({
			sm_fixture_id: x.fixture_id ?? fixtureId,
			team_id: x.participant_id,
			type_id: x.type_id,
			value: x.value ?? x?.data?.value ?? null,
		}));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: PASS

- [ ] **Step 5: `fixtureDetailStatements` に組み込む**

`functions/_lib/sm-store.js` 冒頭の import（`toStatRows` 等が並ぶ箇所）に `toXgStatRows` を追加。`fixtureDetailStatements`（231行）の stmts.push 内、`toStatRows(detail).map(...)` 行の直後に追加:

```javascript
		...toXgStatRows(detail).map((r) => statStatement(r, updatedAt)),
```

（`statStatement` を再利用。type_id が衝突しないので同じ sm_stats へ別行として入る。）

- [ ] **Step 6: 全テスト確認 ＆ コミット**

Run: `npm test`
Expected: PASS（既存も維持）

```bash
git add functions/_lib/sm-ingest.js functions/_lib/sm-ingest.test.js functions/_lib/sm-store.js
git commit -m "feat(xg): xgfixtureをsm_statsへ取り込み(xGoT/被xG/xG差等を点灯)"
```

---

## Task 2: `xgFor` を type_id=5304 で絞る（潜在バグ修正）

**Files:**
- Modify: `functions/_lib/sm-ingest.js:67` `xgFor`
- Test: `functions/_lib/sm-ingest.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`sm-ingest.test.js` に追記（`toFixtureRow` は import 済）:

```javascript
test("toFixtureRow: home_xg は xgfixture の type_id=5304 を拾う(先頭の別type_idに釣られない)", () => {
	const detail = {
		id: 1,
		participants: [
			{ id: 10, meta: { location: "home" } },
			{ id: 20, meta: { location: "away" } },
		],
		xgfixture: [
			{ participant_id: 10, location: "home", type_id: 7939, value: 1.65 }, // xPTS が先頭
			{ participant_id: 10, location: "home", type_id: 5304, value: 0.4263 }, // 本命xG
			{ participant_id: 20, location: "away", type_id: 5304, value: 0.0407 },
		],
	};
	const row = toFixtureRow(detail);
	assert.equal(row.home_xg, 0.4263);
	assert.equal(row.away_xg, 0.0407);
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: FAIL（`home_xg` が 1.65 になる）

- [ ] **Step 3: `xgFor` を修正**

`functions/_lib/sm-ingest.js` の `xgFor`（67行）を置換:

```javascript
// base xG は xGFixture の type_id=5304 を location で取る。
// xgfixture は1サイド十数 type_id を含むため type_id を必ず絞る（最初の1件依存はバグ）。
const XG_BASE_TYPE_ID = 5304;
function xgFor(detail, location) {
	const xg = Array.isArray(detail?.xgfixture)
		? detail.xgfixture
		: Array.isArray(detail?.xGFixture)
			? detail.xGFixture
			: [];
	const hit = xg.find(
		(x) => x?.location === location && x?.type_id === XG_BASE_TYPE_ID,
	);
	if (!hit) return null;
	return hit.value ?? hit?.data?.value ?? null;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/sm-ingest.js functions/_lib/sm-ingest.test.js
git commit -m "fix(xg): xgForをtype_id=5304で絞りbase xG誤取得を修正"
```

---

## Task 3: `sm_fixture_series` テーブル

**Files:**
- Modify: `db/schema-watch.sql`（sm_highlights の後ろに追加）
- Create: `db/0013_sm_fixture_series.sql`

- [ ] **Step 1: schema-watch.sql に定義追加**

`db/schema-watch.sql` 末尾（最後のテーブル定義の後）に追加:

```sql
-- 試合の時系列（pressure/trends）を1 fixture=1行のJSONで保持。FT時に一度だけ書く（rows-written節約）。
CREATE TABLE IF NOT EXISTS sm_fixture_series (
  sm_fixture_id INTEGER PRIMARY KEY,
  series_json   TEXT NOT NULL,
  updated_at    INTEGER NOT NULL
);
```

- [ ] **Step 2: マイグレーションファイル作成**

`db/0013_sm_fixture_series.sql`:

```sql
-- 0013: 試合時系列(モメンタム/フロー)用テーブル。本番/テストD1へ手動適用。
CREATE TABLE IF NOT EXISTS sm_fixture_series (
  sm_fixture_id INTEGER PRIMARY KEY,
  series_json   TEXT NOT NULL,
  updated_at    INTEGER NOT NULL
);
```

- [ ] **Step 3: コミット**

```bash
git add db/schema-watch.sql db/0013_sm_fixture_series.sql
git commit -m "feat(xg): sm_fixture_series テーブル追加(時系列JSON)"
```

> 注: D1への適用はデプロイ運用フロー（[[wcup-deploy-flow]]）に従い、マージ後に本番/テストD1へ `wrangler d1 execute` で手動実行する。Task 17 のチェックリストで再掲。

---

## Task 4: `toSeriesRow` — pressure/trends を表示用JSONへ

**Files:**
- Modify: `functions/_lib/sm-ingest.js`（`toXgStatRows` の後ろ）
- Test: `functions/_lib/sm-ingest.test.js`

時系列blob v1 = `{ pressure:[{minute,home,away}], flow:{ shots:[{minute,home,away}], possession:[...], attacks:[...] } }`。trends は type_id 42=Shots/45=Possession%/43=Attacks を使用。home/away は participants の meta.location で判定。periods 前後半比較は v1 スコープ外（YAGNI）。

- [ ] **Step 1: 失敗するテストを書く**

import に `toSeriesRow` を追加し追記:

```javascript
import { toSeriesRow } from "./sm-ingest.js";

test("toSeriesRow: pressure/trends を home/away の時系列JSONへ畳む", () => {
	const detail = {
		id: 9,
		participants: [
			{ id: 100, meta: { location: "home" } },
			{ id: 200, meta: { location: "away" } },
		],
		pressure: [
			{ participant_id: 100, minute: 7, pressure: 0 },
			{ participant_id: 200, minute: 7, pressure: 48.67 },
			{ participant_id: 100, minute: 21, pressure: 30 },
		],
		trends: [
			{ participant_id: 100, type_id: 42, minute: 64, value: 20 },
			{ participant_id: 200, type_id: 42, minute: 64, value: 6 },
			{ participant_id: 100, type_id: 45, minute: 64, value: 56 },
			{ participant_id: 200, type_id: 45, minute: 64, value: 44 },
			{ participant_id: 100, type_id: 43, minute: 64, value: 95 },
			{ participant_id: 100, type_id: 999, minute: 64, value: 1 }, // 対象外type→無視
		],
	};
	const s = toSeriesRow(detail);
	assert.deepEqual(s.pressure, [
		{ minute: 7, home: 0, away: 48.67 },
		{ minute: 21, home: 30, away: null },
	]);
	assert.deepEqual(s.flow.shots, [{ minute: 64, home: 20, away: 6 }]);
	assert.deepEqual(s.flow.possession, [{ minute: 64, home: 56, away: 44 }]);
	assert.deepEqual(s.flow.attacks, [{ minute: 64, home: 95, away: null }]);
});

test("toSeriesRow: データ無しは空構造", () => {
	const s = toSeriesRow({ id: 1, participants: [] });
	assert.deepEqual(s, { pressure: [], flow: { shots: [], possession: [], attacks: [] } });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: FAIL（`toSeriesRow is not a function`）

- [ ] **Step 3: 最小実装**

`functions/_lib/sm-ingest.js` の `toXgStatRows` の後ろに追加:

```javascript
// 時系列(pressure/trends)を home/away の分単位系列へ畳む（sm_fixture_series.series_json 用）。
// flow の trends type_id: 42=Shots Total / 45=Ball Possession% / 43=Attacks（累積カウント）。
const FLOW_TYPES = Object.freeze({ shots: 42, possession: 45, attacks: 43 });

function foldByMinute(rows, homeId, awayId, valueKey) {
	const byMin = new Map();
	for (const r of rows) {
		const m = r?.minute;
		if (m == null) continue;
		if (!byMin.has(m)) byMin.set(m, { minute: m, home: null, away: null });
		const slot = byMin.get(m);
		if (r.participant_id === homeId) slot.home = r[valueKey] ?? null;
		else if (r.participant_id === awayId) slot.away = r[valueKey] ?? null;
	}
	return [...byMin.values()].sort((a, b) => a.minute - b.minute);
}

export function toSeriesRow(detail) {
	const { home, away } = participantsByLocation(detail);
	const homeId = home?.id ?? null;
	const awayId = away?.id ?? null;
	const pressure = foldByMinute(
		Array.isArray(detail?.pressure) ? detail.pressure : [],
		homeId,
		awayId,
		"pressure",
	);
	const trends = Array.isArray(detail?.trends) ? detail.trends : [];
	const flowFor = (typeId) =>
		foldByMinute(
			trends.filter((t) => t?.type_id === typeId),
			homeId,
			awayId,
			"value",
		);
	return {
		pressure,
		flow: {
			shots: flowFor(FLOW_TYPES.shots),
			possession: flowFor(FLOW_TYPES.possession),
			attacks: flowFor(FLOW_TYPES.attacks),
		},
	};
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/sm-ingest.js functions/_lib/sm-ingest.test.js
git commit -m "feat(xg): toSeriesRowでpressure/trendsを時系列JSONへ"
```

---

## Task 5: `sm_fixture_series` の upsert文

**Files:**
- Modify: `functions/_lib/sm-store.js`
- Test: `functions/_lib/sm-store.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-store.test.js` の import に `fixtureSeriesStatements` を追加し追記:

```javascript
import { fixtureSeriesStatements } from "./sm-store.js";

test("fixtureSeriesStatements: series_json を1行 upsert", () => {
	const detail = {
		id: 9,
		participants: [
			{ id: 100, meta: { location: "home" } },
			{ id: 200, meta: { location: "away" } },
		],
		pressure: [{ participant_id: 100, minute: 7, pressure: 5 }],
		trends: [],
	};
	const specs = fixtureSeriesStatements(detail, 1700);
	assert.equal(specs.length, 1);
	assert.match(specs[0].sql, /INSERT INTO sm_fixture_series/);
	assert.match(specs[0].sql, /ON CONFLICT\(sm_fixture_id\) DO UPDATE/);
	assert.equal(specs[0].args[0], 9);
	const parsed = JSON.parse(specs[0].args[1]);
	assert.deepEqual(parsed.pressure, [{ minute: 7, home: 5, away: null }]);
	assert.equal(specs[0].args[2], 1700);
});

test("fixtureSeriesStatements: fixture id 無しは空", () => {
	assert.deepEqual(fixtureSeriesStatements({}, 1), []);
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test functions/_lib/sm-store.test.js`
Expected: FAIL（`fixtureSeriesStatements is not a function`）

- [ ] **Step 3: 実装**

`functions/_lib/sm-store.js` 冒頭 import に `toSeriesRow` を追加。`fixtureDetailStatements` の後（typeStatements の前あたり）に追加:

```javascript
function seriesStatement(fixtureId, seriesJson, updatedAt) {
	return {
		sql: `INSERT INTO sm_fixture_series (sm_fixture_id, series_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(sm_fixture_id) DO UPDATE SET
            series_json=excluded.series_json, updated_at=excluded.updated_at`,
		args: [fixtureId, seriesJson, updatedAt],
	};
}

// 時系列(series)を1行 upsert する文配列。fixture id 無しは空。
export function fixtureSeriesStatements(detail, updatedAt) {
	const fixtureId = detail?.id ?? null;
	if (fixtureId == null) return [];
	const series = toSeriesRow(detail);
	return [seriesStatement(fixtureId, JSON.stringify(series), updatedAt)];
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-store.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/sm-store.js functions/_lib/sm-store.test.js
git commit -m "feat(xg): sm_fixture_series upsert文を追加"
```

---

## Task 6: `syncFixtureSeries` — FT時の一発取得＋保存

**Files:**
- Modify: `functions/_lib/sm-sync.js`
- Test: `functions/_lib/sm-sync.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-sync.test.js` の import に `syncFixtureSeries` を追加し追記（既存テストの fake client パターンに合わせる。fake は `get(path,{include})` で `{data}` を返し、`runBatch` 用に `db.batch`/`prepare` をスタブ）:

```javascript
import { syncFixtureSeries } from "./sm-sync.js";

test("syncFixtureSeries: pressure;trends;periods.statistics を取得し series を1行書く", async () => {
	let captured = null;
	const client = {
		async get(path, opts) {
			captured = { path, include: opts?.include };
			return {
				data: {
					id: 9,
					participants: [
						{ id: 100, meta: { location: "home" } },
						{ id: 200, meta: { location: "away" } },
					],
					pressure: [{ participant_id: 100, minute: 7, pressure: 5 }],
					trends: [],
				},
			};
		},
	};
	const writes = [];
	const db = {
		prepare: (sql) => ({ bind: (...args) => ({ sql, args }) }),
		batch: async (stmts) => {
			writes.push(...stmts);
			return [];
		},
	};
	const r = await syncFixtureSeries(client, db, 9, 1700);
	assert.equal(r.ok, true);
	assert.equal(captured.path, "fixtures/9");
	assert.equal(captured.include, "pressure;trends;periods.statistics");
	assert.equal(writes.length, 1);
});
```

（`runBatch` の内部が `db.prepare().bind()` → `db.batch()` を使う前提。既存 `runBatch` 実装に合わせて db スタブを調整すること。既存 `sm-sync.test.js` の他テストで使っている db スタブを再利用するのが確実。）

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test functions/_lib/sm-sync.test.js`
Expected: FAIL（`syncFixtureSeries is not a function`）

- [ ] **Step 3: 実装**

`functions/_lib/sm-sync.js` の import に `fixtureSeriesStatements` を追加。`syncFixtureDetail` の後ろに追加:

```javascript
// 時系列include。通常detailには足さず（ライブpayload肥大回避）、FT時にこの関数で一発取得する。
export const FIXTURE_SERIES_INCLUDE = "pressure;trends;periods.statistics";

// FT後に pressure/trends を一発取得し sm_fixture_series へ1行 upsert（書き込み一度きり想定）。
export async function syncFixtureSeries(footballClient, db, fixtureId, now) {
	let body;
	try {
		body = await footballClient.get(`fixtures/${fixtureId}`, {
			include: FIXTURE_SERIES_INCLUDE,
		});
	} catch (e) {
		console.error("syncFixtureSeries: fetch failed", fixtureId, e?.message);
		return { ok: false, error: e?.message };
	}
	const detail = body?.data;
	if (!detail) return { ok: false, error: "no data" };
	try {
		await runBatch(db, fixtureSeriesStatements(detail, now));
		return { ok: true, fixtureId };
	} catch (e) {
		console.error("syncFixtureSeries: upsert failed", fixtureId, e?.message);
		return { ok: false, error: e?.message };
	}
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-sync.test.js`
Expected: PASS

- [ ] **Step 5: 全テスト ＆ コミット**

Run: `npm test`
Expected: PASS

```bash
git add functions/_lib/sm-sync.js functions/_lib/sm-sync.test.js
git commit -m "feat(xg): syncFixtureSeriesでFT時に時系列を取得保存"
```

---

## Task 7: worker-watch に series 書き込みステップ（一度きり）

**Files:**
- Modify: `worker-watch/src/index.js`（detail サイクル内、スコア自己修復ステップの近く）

スコア自己修復（state 5/7/8 で home_score が NULL を拾う）と同じ要領で、「終了済みかつ `sm_fixture_series` 未保存」の fixture を数件拾って `syncFixtureSeries` を呼ぶ。

- [ ] **Step 1: import 追加**

`worker-watch/src/index.js` 上部の sm-sync からの import に `syncFixtureSeries` を追加。

- [ ] **Step 2: series 書き込みステップを追加**

スコア自己修復ブロック（`SELECT sm_fixture_id FROM sm_fixtures WHERE state_id IN (5,7,8) AND home_score IS NULL ...` のブロック）の直後に追加:

```javascript
				// 時系列(series)を終了試合に一度だけ書く。未保存(LEFT JOIN で series 行が無い)ものだけ対象。
				try {
					const seriesTargets = await env.DB.prepare(
						`SELECT f.sm_fixture_id FROM sm_fixtures f
						 LEFT JOIN sm_fixture_series s ON s.sm_fixture_id = f.sm_fixture_id
						 WHERE f.state_id IN (5,7,8) AND s.sm_fixture_id IS NULL
						 ORDER BY f.starting_at_ts DESC LIMIT 6`,
					).all();
					const rows = Array.isArray(seriesTargets?.results)
						? seriesTargets.results
						: [];
					for (const row of rows) {
						const sr = await syncFixtureSeries(
							football,
							env.DB,
							row.sm_fixture_id,
							now,
						);
						if (!sr.ok) {
							console.error(
								`watch-cron: series sync failed fixture=${row.sm_fixture_id} err=${sr.error}`,
							);
						}
					}
					if (rows.length > 0) {
						console.log(`watch-cron: series synced=${rows.length}`);
					}
				} catch (e) {
					console.error("watch-cron: series sync error", e?.message);
				}
```

> `sm_fixture_series` 未作成のD1では LEFT JOIN が失敗するため try/catch で隔離（テーブル適用前でも他処理に波及しない）。`now`/`football` は当該スコープの既存変数名に合わせること。

- [ ] **Step 3: 構文チェック ＆ コミット**

Run: `node --check worker-watch/src/index.js`
Expected: エラー無し

```bash
git add worker-watch/src/index.js
git commit -m "feat(xg): worker-watchでFT試合の時系列を一度だけ取り込み"
```

---

## Task 8: `getFixtureDetail` に `series` を追加

**Files:**
- Modify: `functions/_lib/sm-read.js:147` `getFixtureDetail`
- Test: `functions/_lib/sm-read.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/sm-read.test.js` に、`sm_fixture_series` を含む fake DB で `getFixtureDetail` が `series`（パース済オブジェクト）を返すことを確認するテストを追記（既存テストの DB スタブ形に合わせる）:

```javascript
test("getFixtureDetail: series_json をパースして series で返す", async () => {
	const db = makeFakeDb({
		// 既存ヘルパに合わせ、FIXTURE_ONE_SQL が1行返り、sm_fixture_series が1行返るよう設定
		fixture: { sm_fixture_id: 9, home_team_id: 100, away_team_id: 200 },
		series: [{ series_json: JSON.stringify({ pressure: [{ minute: 7, home: 5, away: 1 }], flow: { shots: [], possession: [], attacks: [] } }) }],
	});
	const detail = await getFixtureDetail(db, 9);
	assert.deepEqual(detail.series.pressure, [{ minute: 7, home: 5, away: 1 }]);
});

test("getFixtureDetail: series 行が無ければ series=null", async () => {
	const db = makeFakeDb({ fixture: { sm_fixture_id: 9 }, series: [] });
	const detail = await getFixtureDetail(db, 9);
	assert.equal(detail.series, null);
});
```

> 既存 `sm-read.test.js` の DB スタブ実装に合わせて `makeFakeDb` 相当を使う。既存テストが SQL 文字列で分岐するスタブなら、`sm_fixture_series` を含む SELECT に対して series 行を返すよう分岐を追加すること。

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test functions/_lib/sm-read.test.js`
Expected: FAIL（`detail.series` が undefined）

- [ ] **Step 3: 実装**

`functions/_lib/sm-read.js` の `getFixtureDetail` 内、`highlight` 取得ブロックの後、`return` の直前に追加:

```javascript
	// 時系列(モメンタム/フロー)。テーブル未作成や読み失敗でも例外を投げず null（障害隔離）。
	let series = null;
	try {
		const seriesRows = await all(
			"SELECT series_json FROM sm_fixture_series WHERE sm_fixture_id = ?",
		);
		if (seriesRows.length > 0 && seriesRows[0]?.series_json) {
			series = JSON.parse(seriesRows[0].series_json);
		}
	} catch (e) {
		console.error("getFixtureDetail: series read failed", e?.message);
	}
```

そして `return` を変更:

```javascript
	return { fixture, events, stats, lineups, player_stats, ai, highlight, series };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/sm-read.test.js`
Expected: PASS

- [ ] **Step 5: 全テスト ＆ コミット**

Run: `npm test`
Expected: PASS

```bash
git add functions/_lib/sm-read.js functions/_lib/sm-read.test.js
git commit -m "feat(xg): getFixtureDetailがseries(時系列JSON)を返す"
```

---

## Task 9: `XgSectionHead` 共通解説ヘッダ（フロント）

**Files:**
- Modify: `public/screens-detail.jsx`（`XgTab` の手前、`PlayerXgBar` 付近に追加）

各セクションの「見出し＋端的1行解説＋改行して緑字 例：＋任意バッジ」を統一描画する小コンポーネント。

- [ ] **Step 1: コンポーネント追加**

`public/screens-detail.jsx` の `XgShotQuality`（1184行付近）の手前に追加:

```jsx
// セクション共通の解説ヘッダ。desc=端的1行、example=改行して緑字「例：」、badge=NEW/FT等(任意)。
function XgSectionHead({ T, n, title, desc, example, badge }) {
	return (
		<div style={{ margin: "16px 0 6px" }}>
			<div
				style={{
					fontSize: 11,
					fontWeight: 800,
					color: T.text,
					display: "flex",
					alignItems: "center",
					gap: 6,
				}}
			>
				{n != null && (
					<span
						style={{
							background: T.accent,
							color: "#0e1a14",
							borderRadius: "50%",
							width: 16,
							height: 16,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: 9,
							fontWeight: 800,
						}}
					>
						{n}
					</span>
				)}
				{title}
				{badge && (
					<span
						style={{
							fontSize: 8.5,
							background: T.accent,
							color: "#0e1a14",
							fontWeight: 800,
							borderRadius: 3,
							padding: "0 4px",
						}}
					>
						{badge}
					</span>
				)}
			</div>
			{desc && (
				<div style={{ fontSize: 10.5, color: T.sub, lineHeight: 1.45, marginTop: 2 }}>
					{desc}
					{example && (
						<span
							style={{ display: "block", color: T.accent, fontWeight: 700, marginTop: 1 }}
						>
							例：{example}
						</span>
					)}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 2: 構文チェック ＆ コミット**

Run: `node --check public/screens-detail.jsx` が使えない（JSX）ため、`npx babel --presets @babel/preset-react public/screens-detail.jsx > /dev/null` で構文確認（babel が無ければ Step を飛ばし Task 17 のハーネス目視でまとめて確認）。

```bash
git add public/screens-detail.jsx
git commit -m "feat(xg): XgSectionHead共通解説ヘッダを追加"
```

---

## Task 10: セクション1拡張（xPTS追加）＋表示ゲート変更＋解説

**Files:**
- Modify: `public/screens-detail.jsx` `XgTab`（1379–1470行付近）

ねらい: ①`isFinished` ハードゲートを「xG present で表示／ライブは速報注記」に変更、②サマリーに xPTS(7939) を追加、③`XgSectionHead` で解説付与。

- [ ] **Step 1: pick に xPTS と npxG を追加**

`XgTab` 内 `homeXgot`/`awayXgot` を定義している箇所（1389行付近）に追加:

```jsx
	const homeXpts = pick(7939, "home");
	const awayXpts = pick(7939, "away");
	const homeNpxg = pick(7943, "home");
	const awayNpxg = pick(7943, "away");
```

- [ ] **Step 2: 表示ゲートを変更**

現行の早期 return（`const isFinished = fx && fx.status === "FT"; if (!isFinished || (homeXg == null && awayXg == null)) { ... }`、1455行付近）を置換:

```jsx
	const isFinished = fx && fx.status === "FT";
	const isLive = fx && (fx.status === "LIVE" || fx.status === "HT");
	// xG が1つも無い時だけプレースホルダ。ライブでも xG があれば 1–7 を出す（速報）。
	if (homeXg == null && awayXg == null) {
		return (
			<div style={{ padding: "40px 16px", textAlign: "center", color: T.faint, fontSize: 13, fontWeight: 700 }}>
				xGデータは試合中〜試合後に表示されます
			</div>
		);
	}
```

> `fx.status` の取り得る値（"FT"/"LIVE"/"HT"/"NS" 等）は現行 detail マッピングに準拠。実値が異なる場合は `XgTab` 冒頭で `fx.status` を確認して調整。

- [ ] **Step 3: ライブ速報注記をサマリーの直前に追加**

セクション1のチーム合計バンド（`<div>` で `linear-gradient` のband）を出す直前に追加:

```jsx
			{isLive && (
				<div style={{ fontSize: 10, color: T.faint, textAlign: "center", marginBottom: 8 }}>
					⚡ 速報値（試合中は変動します）
				</div>
			)}
			<XgSectionHead
				T={T}
				n={1}
				title="チームxGサマリー"
				desc="決定機の“質”の合計。"
				example="xG0.43＝この内容なら平均0.4点ペース。実際は2点→効率よく決めた"
			/>
```

- [ ] **Step 4: ミニグリッドに xPTS 列を追加**

サマリーバンド内の「xGoT / 被xG / xG差」ミニグリッド（`{xgDiff != null && (...)}` の後）に追加:

```jsx
						{(homeXpts != null || awayXpts != null) && (
							<div>
								<div style={{ fontWeight: 800, color: T.text, fontSize: 12 }}>
									{fmtXg(homeXpts)} / {fmtXg(awayXpts)}
								</div>
								<div>xPTS（期待勝点）</div>
							</div>
						)}
```

- [ ] **Step 5: ハーネス目視（Task 17 後で実施）／コミット**

```bash
git add public/screens-detail.jsx
git commit -m "feat(xg): サマリーにxPTS追加・ライブ表示ゲート化・解説付与"
```

---

## Task 11: セクション3 `XgBreakdown`（xG内訳 オープン/CK/FK/PK）

**Files:**
- Modify: `public/screens-detail.jsx`（`XgSectionHead` の後ろに追加 ＋ `XgTab` 内で描画）

type_id: 7945=オープン / 7942=CK / 7941=FK / 7940=PK。

- [ ] **Step 1: コンポーネント追加**

```jsx
// セクション3: xG内訳（好機の出どころ）。値がある列だけ出す。
function XgBreakdown({ T, homeName, awayName, parts }) {
	// parts: [{label, home, away}]
	const shown = parts.filter((p) => p.home != null || p.away != null);
	if (shown.length === 0) return null;
	const fmt = (v) => (v != null ? v.toFixed(2) : "–");
	return (
		<div style={{ background: T.card || "rgba(255,255,255,0.03)", borderRadius: 10, padding: "8px 10px" }}>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
				{shown.map((p) => (
					<span key={p.label} style={{ fontSize: 10, color: T.sub }}>
						{p.label}{" "}
						<b style={{ color: T.text }}>{fmt(p.home)}</b>
						<span style={{ color: T.faint }}> / {fmt(p.away)}</span>
					</span>
				))}
			</div>
			<div style={{ fontSize: 9, color: T.faint, marginTop: 4 }}>
				{homeName} / {awayName}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: `XgTab` で描画**

セクション2（効率）の後、`XgShotQuality` の前に追加。pick 定義の近くで内訳値を用意:

```jsx
	const breakdownParts = [
		{ label: "オープン", home: pick(7945, "home"), away: pick(7945, "away") },
		{ label: "CK", home: pick(7942, "home"), away: pick(7942, "away") },
		{ label: "FK", home: pick(7941, "home"), away: pick(7941, "away") },
		{ label: "PK", home: pick(7940, "home"), away: pick(7940, "away") },
	];
	const hasBreakdown = breakdownParts.some((p) => p.home != null || p.away != null);
```

描画（JSX return 内、セクション2の後）:

```jsx
				{hasBreakdown && (
					<>
						<XgSectionHead T={T} n={3} title="xG内訳" badge="NEW"
							desc="好機の出どころ。"
							example="オープン0.35＝流れの中で作れた／CK0.05＝セットプレーは僅か" />
						<XgBreakdown T={T} homeName={homeName} awayName={awayName} parts={breakdownParts} />
					</>
				)}
```

- [ ] **Step 3: コミット**

```bash
git add public/screens-detail.jsx
git commit -m "feat(xg): セクション3 xG内訳(オープン/CK/FK/PK)を追加"
```

---

## Task 12: セクション4 `XgNpxg`（PK除くxG）

**Files:**
- Modify: `public/screens-detail.jsx`

- [ ] **Step 1: `XgTab` で描画（軽量なのでインライン）**

セクション3の後に追加（`homeNpxg`/`awayNpxg` は Task 10 で定義済）:

```jsx
				{(homeNpxg != null || awayNpxg != null) && (
					<>
						<XgSectionHead T={T} n={4} title="npxG（PK除く）" badge="NEW"
							desc="PKを除いたxG＝地力。"
							example="xG1.5でもPK1本(0.8)込みなら実力分は0.7" />
						<div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "8px 10px", fontSize: 11, color: T.text, fontWeight: 700 }}>
							{fmtXg(homeNpxg)} <span style={{ color: T.faint, fontWeight: 400 }}>vs</span> {fmtXg(awayNpxg)}
						</div>
					</>
				)}
```

- [ ] **Step 2: コミット**

```bash
git add public/screens-detail.jsx
git commit -m "feat(xg): セクション4 npxGを追加"
```

---

## Task 13: セクション5・6 に解説付与（点灯確認）

**Files:**
- Modify: `public/screens-detail.jsx`（`XgShotQuality`/`XgGkValue` の呼び出し前に `XgSectionHead`）

セクション5(`XgShotQuality`)・6(`XgGkValue`)は実装済。Task 1 で xGoT が点灯するため `XgGkValue` も自動表示される。ここでは解説ヘッダを足すだけ。GK の公式指標 9686 への切替は符号定義が未確定のため v1 では行わず、既存の「xGoT−失点」算出を維持する。

- [ ] **Step 1: 解説ヘッダを挿入**

`<XgShotQuality .../>` の直前:

```jsx
				<XgSectionHead T={T} n={5} title="シュートの質（1本あたり）"
					desc="1本がどれだけ良い形か。"
					example="0.06＝遠めの薄い形／0.30＝決定機級" />
```

`<XgGkValue .../>` の直前:

```jsx
				<XgSectionHead T={T} n={6} title="GK評価"
					desc="防いだ失点の量。"
					example="+0.58＝0.58点ぶん好セーブ／マイナスは取りこぼし" />
```

> `XgShotQuality`/`XgGkValue` が内部に独自見出しを持つ場合は重複を避けるため内部見出しを削るか、`XgSectionHead` 側に寄せる（実装時に該当コンポーネントを確認）。

- [ ] **Step 2: コミット**

```bash
git add public/screens-detail.jsx
git commit -m "feat(xg): セクション5/6に素人向け解説を付与"
```

---

## Task 14: セクション7 選手別に xGoT オーバーレイ＋解説

**Files:**
- Modify: `public/screens-detail.jsx` `PlayerXgBar` ＋ `XgTab` の選手別ブロック

選手別 xGoT は `player_stats` の type_id=5305。現状 `lineups[].xg`（5304）のみ使用。`detail.player_stats` から各選手の 5305 を引いて細バーを重ねる。

- [ ] **Step 1: 選手別 xGoT マップを作る**

`XgTab` 内、選手別セクションの準備（`withXg` 付近、1455行付近）に追加:

```jsx
	const playerStats = (detail && detail.player_stats) || [];
	const xgotByPlayer = {};
	playerStats.forEach((r) => {
		if (r.type_id === 5305 && r.player_id != null) xgotByPlayer[r.player_id] = r.value;
	});
```

- [ ] **Step 2: `PlayerXgBar` に xgot を渡して細バーを重ねる**

`PlayerXgBar` 定義に `xgot` prop を追加し、xG バーの下（または内側）に半透明の細バーを描画:

```jsx
// 既存の xG バーの直後に追加（maxXg を共有してスケール一致）
{xgot != null && xgot > 0 && (
	<div style={{ height: 3, marginTop: 1, background: "rgba(226,240,228,0.5)", borderRadius: 2, width: `${Math.min(100, (xgot / maxXg) * 100)}%` }} />
)}
```

呼び出し側（`homeTopPlayers.map(...)` と away 側）に `xgot={xgotByPlayer[p.player_id]}` を追加。

- [ ] **Step 3: 選手別セクションの見出しを `XgSectionHead` に差し替え**

既存の「選手別xG（誰が好機を作ったか）」見出しを次に置換（home/away それぞれの上に1回ずつ、または共通で1回）:

```jsx
				<XgSectionHead T={T} n={7} title="選手別 xG / xGoT" badge="NEW"
					desc="誰が好機を作ったか（細バー＝枠内xGoT）。"
					example="0.70＝1人で“ほぼ1点級”の機会を作った" />
```

- [ ] **Step 4: コミット**

```bash
git add public/screens-detail.jsx
git commit -m "feat(xg): セクション7に選手別xGoTオーバーレイと解説を追加"
```

---

## Task 15: セクション8 `XgMomentum`（pressure・FTのみ）

**Files:**
- Modify: `public/screens-detail.jsx`

`detail.series.pressure` = `[{minute, home, away}]`。home優勢=上、away優勢=下に振れる純差分ラインを SVG で描く。

- [ ] **Step 1: コンポーネント追加**

```jsx
// セクション8: モメンタム（pressure の home-away 差分ライン）。FTのみ。
function XgMomentum({ T, series }) {
	const pts = (series && Array.isArray(series.pressure) ? series.pressure : []).filter(
		(p) => p && p.minute != null,
	);
	if (pts.length < 2) return null;
	const W = 300, H = 70, mid = H / 2;
	const maxAbs = Math.max(
		1,
		...pts.map((p) => Math.abs((p.home || 0) - (p.away || 0))),
	);
	const maxMin = Math.max(...pts.map((p) => p.minute));
	const coords = pts.map((p) => {
		const x = (p.minute / maxMin) * W;
		const net = (p.home || 0) - (p.away || 0);
		const y = mid - (net / maxAbs) * (mid - 4);
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	});
	return (
		<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 70, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
			<line x1="0" y1={mid} x2={W} y2={mid} stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
			<polyline points={coords.join(" ")} fill="none" stroke={T.accent} strokeWidth="2" />
		</svg>
	);
}
```

- [ ] **Step 2: `XgTab` で描画（FTのみ）**

選手別セクションの後、return 末尾付近に追加:

```jsx
				{isFinished && detail.series && (
					<>
						<XgSectionHead T={T} n={8} title="モメンタム（勢い）" badge="FT"
							desc="押してた時間帯。"
							example={`山が上側＝その時間は${homeName}が攻勢`} />
						<XgMomentum T={T} series={detail.series} />
					</>
				)}
```

- [ ] **Step 3: コミット**

```bash
git add public/screens-detail.jsx
git commit -m "feat(xg): セクション8 モメンタム(pressure)を追加"
```

---

## Task 16: セクション9 `XgFlow`（trends・タブ切替・FTのみ）

**Files:**
- Modify: `public/screens-detail.jsx`

`detail.series.flow` = `{shots, possession, attacks}`、各 `[{minute,home,away}]`。タブで切替、初期=累積シュート。

- [ ] **Step 1: コンポーネント追加**

```jsx
// セクション9: 試合の流れ（trends）。shots/possession/attacks をタブ切替。FTのみ。
function XgFlow({ T, series }) {
	const flow = (series && series.flow) || {};
	const tabs = [
		{ key: "shots", label: "累積シュート" },
		{ key: "possession", label: "支配率" },
		{ key: "attacks", label: "攻撃" },
	].filter((t) => Array.isArray(flow[t.key]) && flow[t.key].length >= 2);
	const [active, setActive] = React.useState(tabs[0] ? tabs[0].key : null);
	if (!active) return null;
	const pts = flow[active];
	const W = 300, H = 60;
	const maxMin = Math.max(...pts.map((p) => p.minute));
	const maxVal = Math.max(1, ...pts.map((p) => Math.max(p.home || 0, p.away || 0)));
	const line = (side, color, dash) => {
		const coords = pts.map((p) => {
			const x = (p.minute / maxMin) * W;
			const y = H - ((p[side] || 0) / maxVal) * (H - 4);
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		});
		return <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth="1.8" strokeDasharray={dash || "0"} />;
	};
	return (
		<div>
			<div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
				{tabs.map((t) => (
					<button key={t.key} onClick={() => setActive(t.key)}
						style={{
							fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
							border: "none", cursor: "pointer",
							background: active === t.key ? T.accent : "rgba(255,255,255,0.06)",
							color: active === t.key ? "#0e1a14" : T.sub,
						}}>
						{t.label}
					</button>
				))}
			</div>
			<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 60, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
				{line("home", T.accent)}
				{line("away", "rgba(226,240,228,0.5)")}
			</svg>
		</div>
	);
}
```

> `React.useState`/`React.useEffect` がプロジェクトでどう参照されるか（`window.React` 等）を `screens-detail.jsx` 既存フックの書き方に合わせること。

- [ ] **Step 2: `XgTab` で描画（FTのみ）**

セクション8の後に追加:

```jsx
				{isFinished && detail.series && (
					<>
						<XgSectionHead T={T} n={9} title="試合の流れ" badge="FT"
							desc="支配/シュートの推移。"
							example="右肩上がり＝後半に圧力を強めた" />
						<XgFlow T={T} series={detail.series} />
					</>
				)}
```

- [ ] **Step 3: コミット**

```bash
git add public/screens-detail.jsx
git commit -m "feat(xg): セクション9 試合の流れ(trends・タブ切替)を追加"
```

---

## Task 17: シード更新・index.html ?v bump・ハーネス目視

**Files:**
- Modify: `db/seed-xg-analysis.sql`
- Modify: `public/index.html`（`screens-detail.jsx?v=N`）

- [ ] **Step 1: seed に xgfixture由来 sm_stats 行と series を追加**

`db/seed-xg-analysis.sql` に、検証 fixture へ向けて以下を追加（既存の seed fixture id に合わせる）:

```sql
-- xGファミリ(チーム系) を sm_stats へ（点灯確認用）
INSERT OR REPLACE INTO sm_stats (sm_fixture_id, team_id, type_id, value, updated_at) VALUES
 (<FX>, <HOME>, 5305, 0.4158, 1700), (<FX>, <AWAY>, 5305, 0.0, 1700),
 (<FX>, <HOME>, 9687, 0.0407, 1700), (<FX>, <AWAY>, 9687, 0.4263, 1700),
 (<FX>, <HOME>, 7943, 0.4263, 1700), (<FX>, <AWAY>, 7943, 0.0407, 1700),
 (<FX>, <HOME>, 7945, 0.351, 1700), (<FX>, <HOME>, 7942, 0.051, 1700),
 (<FX>, <HOME>, 7941, 0.024, 1700), (<FX>, <HOME>, 7940, 0.0, 1700),
 (<FX>, <HOME>, 7939, 1.65, 1700), (<FX>, <AWAY>, 7939, 0.72, 1700);
-- 時系列サンプル
INSERT OR REPLACE INTO sm_fixture_series (sm_fixture_id, series_json, updated_at) VALUES
 (<FX>, '{"pressure":[{"minute":7,"home":0,"away":48.6},{"minute":21,"home":30,"away":15},{"minute":64,"home":40,"away":10}],"flow":{"shots":[{"minute":30,"home":4,"away":1},{"minute":64,"home":20,"away":6}],"possession":[{"minute":64,"home":56,"away":44}],"attacks":[{"minute":64,"home":95,"away":40}]}}', 1700);
```

`<FX>/<HOME>/<AWAY>` は seed の既存値に置換。

- [ ] **Step 2: index.html の ?v を bump**

`public/index.html` 内 `screens-detail.jsx?v=N` の N を現行+1 に。

```bash
grep -n "screens-detail.jsx?v=" public/index.html
```

- [ ] **Step 3: ローカルでハーネス目視（D1不要なら seed + wrangler pages dev）**

Run: `wrangler pages dev public --port 8799`（必要に応じ）。試合詳細xGタブで以下を確認:
- ライブ状態: 1–7 が「⚡速報値」付きで表示、8–9 は非表示
- FT状態: 1–9 全表示、8 モメンタム・9 流れ（タブ切替）が描画
- degradation: series=null / 一部 type_id 欠如でも各セクションが個別に畳まれ画面が壊れない

- [ ] **Step 4: コミット**

```bash
git add db/seed-xg-analysis.sql public/index.html
git commit -m "chore(xg): seed更新とindex.html ?v bump"
```

---

## Task 18: 仕上げ（全テスト・PR）

- [ ] **Step 1: 全テスト**

Run: `npm test`
Expected: 全 PASS（新規 ingest/store/sync/read テスト含む）

- [ ] **Step 2: D1マイグレーション手順を PR 説明に明記**

PR 本文に「マージ後、本番＋テストD1へ `db/0013_sm_fixture_series.sql` を `wrangler d1 execute` で適用」を記載（[[wcup-deploy-flow]]）。`WATCH_ENABLED` は既存のまま。新フラグ不要。

- [ ] **Step 3: PR 作成**

```bash
git push -u origin <branch>
gh pr create --title "feat(xg): xGタブをフル分析コンパニオン化（xGoT/npxG/内訳/GK/選手別/モメンタム）" --body "<spec/planへの参照と test plan>"
```

---

## Self-Review（記入済）

- **Spec coverage**: §5.1 取り込み層→Task1,2,4,5,6,7 / §5.2 データモデル→Task3 / §5.1 read→Task8 / §5.3 フロント→Task9–16 / §5.4 順序・コピー→Task10–16 / §6 コスト（write-once）→Task7 / §7 テスト→各Task TDD＋Task17,18 / §8 スコープ外（xGレース・前後半xG・座標・予想部屋）→未実装で順守。
- **Placeholder scan**: `<FX>/<HOME>/<AWAY>`（Task17）と `<branch>`（Task18）は seed/環境依存の実値プレースホルダで意図的。`makeFakeDb`（Task8）は既存テストスタブに合わせる旨を明記。コードを伴う step は全て実コードを記載。
- **Type consistency**: `toXgStatRows`/`toSeriesRow`/`fixtureSeriesStatements`/`syncFixtureSeries`/`XgSectionHead`/`XgBreakdown`/`XgNpxg`/`XgMomentum`/`XgFlow` の名称・引数を全タスクで一致。series 形 `{pressure:[{minute,home,away}], flow:{shots,possession,attacks}}` は Task4/5/8/15/16 で一致。`detail.series` の参照キーも一致。
- **既知の実装時確認点**: ①`fx.status` の実値、②`React` フック参照法、③`XgShotQuality`/`XgGkValue` の内部見出し重複、④`sm-read.test.js`/`sm-sync.test.js` の既存スタブ形 — いずれも該当 Task に注記済。
