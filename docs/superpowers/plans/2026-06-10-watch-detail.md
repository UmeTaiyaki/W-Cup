# 試合詳細画面（P2）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1試合の観戦・分析ビュー（スコア固定ヘッダー＋5タブ：タイムライン/スタッツ/xG/布陣/H2H）を新設し、ホーム・結果から開けるようにする。

**Architecture:** バックエンドは P0 の純粋関数＋runBatch 方式を踏襲し `sm_lineups`/`sm_player_stats` を追加、xG取得を `xGFixture` include に修正、`GET /api/fixture?id=` で1試合の詳細を配信。フロントは `public/screens-detail.jsx` を新設し、index.html の `Home` に `detailFixture` オーバーレイ状態と `window.WC.openDetail(id)` を足す。既存の予想/部屋/`kv` は不変、`WATCH_ENABLED` ゲート＋障害隔離。

**Tech Stack:** Cloudflare Pages Functions / D1(SQLite) / 別Worker(`worker-watch`) / ブラウザ内 React(Babel standalone, `window.WC` 名前空間) / テスト=`node --test`(node:test)。

**設計正本:** `docs/superpowers/specs/2026-06-10-watch-detail-design.md`
**視覚モック（確定・ローカル `.superpowers/brainstorm/10047-1781026960/content/`）:** `detail-tabs-v1.html`（タブ構成）/ `verify-result.html`（xGタブ）/ `detail-layout-v1.html`（各セクション意匠）。フロントの見た目はこれらを正本とする。

**重要な前提（検証済 2026-06-10）:**
- xG は `detail.xgfixture`（小文字キー・配列）で来る。各要素 `{ value, participant_id, location, type_id, fixture_id }`。`statistics` には xG(5304) は来ない。
- per-player xG は `lineups[].xglineup`（`{ value }`）。lineups は `formation_field`("2:3")/`jersey_number`/`type_id`(11=先発,12=控え)/`player_name`/`player_id`/`team_id`。
- per-player stats は `lineups[].details[]`（`{ type_id, data:{value} }`）。
- 実バインドは `env.DB`(D1)。real D1 id=`a149694b-686c-45a4-9130-01969cccd82a`。
- 2026実データは開幕(6/11)後。開発中はサンプル/2022で検証し、xG・lineupsの最終確認は実データで行う。
- ローカル dev サーバは `wrangler pages dev public`（tmux 内で起動: `tmux new-session -d -s dev "wrangler pages dev public"`）。

---

## File Structure

**バックエンド（P2a）**
- `db/schema-watch.sql`（Modify）— `sm_lineups` / `sm_player_stats` を追記。
- `functions/_lib/sm-ingest.js`（Modify）— `xgFor()` を xGFixture 読みに修正、`toLineupRows()`/`toPlayerStatRows()` 追加。
- `functions/_lib/sm-store.js`（Modify）— `lineupStatement`/`playerStatStatement` 追加、`fixtureDetailStatements()` を拡張。
- `functions/_lib/sm-sync.js`（Modify）— `FIXTURE_DETAIL_INCLUDE` 拡張、詳細同期対象の選定（ライブ＋直近終了）。
- `functions/_lib/sm-read.js`（Modify）— `getFixtureDetail(db, id)` 追加。
- `functions/api/fixture.js`（Create）— `GET /api/fixture?id=` 配信。
- 各 `*.test.js`（Modify/Create）— 純粋関数のテスト追加。

**フロント（P2b–P2d）**
- `public/data.js`（Modify）— LIVE 索引に `id`、`fixtureIdForMatch()`、`fetchFixtureDetail()`。
- `public/screens-detail.jsx`（Create）— `MatchDetailScreen` ＋ 小コンポーネント群（Header/TabBar/Timeline/Stats/Xg/Lineups/H2HPlaceholder）。
- `public/index.html`（Modify）— `detailFixture` 状態＋`openDetail` 登録＋レンダリング＋`screens-detail.jsx` 読み込み＋`?v=N` バンプ。
- `public/screens-home.jsx`（Modify）— カルーセル/`MatchRow` に onClick。
- `public/screens-knockout.jsx`（Modify）— KOカードに onClick。

---

# フェーズ P2a：バックエンド（データ基盤）

## Task 1: スキーマに sm_lineups / sm_player_stats を追加

**Files:**
- Modify: `db/schema-watch.sql`（末尾に追記）

- [ ] **Step 1: スキーマ追記**

`db/schema-watch.sql` の末尾に追記:

```sql
-- 6) ラインナップ（布陣図）
--    (fixture, player) で一意。formation_field はグリッド座標("2:3")。
CREATE TABLE IF NOT EXISTS sm_lineups (
  sm_fixture_id   INTEGER NOT NULL,
  team_id         INTEGER NOT NULL,
  player_id       INTEGER NOT NULL,
  player_name     TEXT,
  jersey_number   INTEGER,
  position        TEXT,                 -- position 名 or position_id 文字列
  formation_field TEXT,                 -- "2:3" 等。控え/不明は NULL
  is_start        INTEGER,              -- 1=先発(type_id 11) 0=控え(12)
  xg              REAL,                 -- per-player xG(lineups.xglineup)。無ければ NULL
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (sm_fixture_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_sm_lineups_fixture ON sm_lineups (sm_fixture_id);

-- 7) 選手別スタッツ（縦持ち＝項目増でもスキーマ不変）
CREATE TABLE IF NOT EXISTS sm_player_stats (
  sm_fixture_id INTEGER NOT NULL,
  player_id     INTEGER NOT NULL,
  type_id       INTEGER NOT NULL,
  value         REAL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (sm_fixture_id, player_id, type_id)
);
CREATE INDEX IF NOT EXISTS idx_sm_player_stats_fixture ON sm_player_stats (sm_fixture_id);
```

- [ ] **Step 2: ローカル D1 に適用して構文検証**

Run: `wrangler d1 execute wcup2026-db --local --file db/schema-watch.sql`
Expected: エラーなく完了（IF NOT EXISTS で冪等）。

- [ ] **Step 3: Commit**

```bash
git add db/schema-watch.sql
git commit -m "feat(watch): P2 schema sm_lineups/sm_player_stats 追加"
```

## Task 2: xgFor() を xGFixture 読みに修正（既存バグ修正）

**Files:**
- Modify: `functions/_lib/sm-ingest.js:40-44`（`xgFor`）
- Test: `functions/_lib/sm-ingest.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`sm-ingest.test.js` の `fixtureDetail` サンプルの `xgfixture: []` を実構造に差し替え、テストを追加:

```javascript
// 差し替え: xgfixture を実構造に（fixtureDetail 内の `xgfixture: [],` を以下へ）
xgfixture: [
  { participant_id: 18551, location: 'home', type_id: 5304, value: 1.84 },
  { participant_id: 18710, location: 'away', type_id: 5304, value: 1.21 },
],

// 追加テスト
test('toFixtureRow: xG は xgfixture(location) から取る', () => {
  const row = toFixtureRow(fixtureDetail);
  assert.equal(row.home_xg, 1.84);
  assert.equal(row.away_xg, 1.21);
});

test('toFixtureRow: xgfixture 欠落でも xG は null（障害隔離）', () => {
  const row = toFixtureRow({ ...fixtureDetail, xgfixture: undefined });
  assert.equal(row.home_xg, null);
  assert.equal(row.away_xg, null);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: FAIL（現状 `xgFor` は statistics を見るため home_xg=null）。

- [ ] **Step 3: 最小実装（xgFor 修正）**

`functions/_lib/sm-ingest.js` の `xgFor` を差し替え:

```javascript
// xG は xGFixture include（レスポンスキー xgfixture・配列）から location で取る。
// 各要素例: { participant_id, location, type_id, value }。statistics には来ない。
function xgFor(detail, location) {
  const xg = Array.isArray(detail?.xgfixture)
    ? detail.xgfixture
    : (Array.isArray(detail?.xGFixture) ? detail.xGFixture : []);
  const hit = xg.find((x) => x?.location === location);
  if (!hit) return null;
  return hit.value ?? hit?.data?.value ?? null;
}
```

（`const XG_TYPE_ID = 5304;` は未使用になるため削除可。）

- [ ] **Step 4: テスト成功を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: PASS（全テスト緑）。

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/sm-ingest.js functions/_lib/sm-ingest.test.js
git commit -m "fix(watch): xG取得を xGFixture include に修正(statistics 5304は来ない)"
```

## Task 3: toLineupRows() 追加

**Files:**
- Modify: `functions/_lib/sm-ingest.js`
- Test: `functions/_lib/sm-ingest.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`sm-ingest.test.js` の `fixtureDetail` に `lineups` を追加し、テストを書く:

```javascript
// fixtureDetail に追加
lineups: [
  { id: 1, team_id: 18551, player_id: 501, player_name: 'Bono', jersey_number: 1,
    formation_field: '1:1', type_id: 11, position_id: 24, xglineup: { value: 0.0 } },
  { id: 2, team_id: 18551, player_id: 502, player_name: 'Hakimi', jersey_number: 2,
    formation_field: '2:4', type_id: 11, position_id: 25, xglineup: { value: 0.12 },
    details: [ { type_id: 42, data: { value: 3 } }, { type_id: 86, data: { value: 1 } } ] },
  { id: 3, team_id: 18710, player_id: 601, player_name: 'Morata', jersey_number: 7,
    formation_field: null, type_id: 12, position_id: 27, xglineup: null },
],

// テスト
test('toLineupRows: 先発/控えを type_id で判定し formation_field を保持', () => {
  const rows = toLineupRows(fixtureDetail);
  assert.equal(rows.length, 3);
  const hakimi = rows.find((r) => r.player_id === 502);
  assert.equal(hakimi.is_start, 1);
  assert.equal(hakimi.formation_field, '2:4');
  assert.equal(hakimi.jersey_number, 2);
  assert.equal(hakimi.xg, 0.12);
  const morata = rows.find((r) => r.player_id === 601);
  assert.equal(morata.is_start, 0);
  assert.equal(morata.formation_field, null);
  assert.equal(morata.xg, null);
});

test('toLineupRows: lineups 欠落で空配列（障害隔離）', () => {
  assert.deepEqual(toLineupRows({}), []);
});
```

import 行に `toLineupRows` を追加。

- [ ] **Step 2: テスト失敗を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: FAIL（`toLineupRows is not a function`）。

- [ ] **Step 3: 最小実装**

`functions/_lib/sm-ingest.js` に追加（`export`）:

```javascript
// lineups[] → sm_lineups 行。type_id 11=先発/12=控え。xg は xglineup.value。
export function toLineupRows(detail) {
  const lineups = Array.isArray(detail?.lineups) ? detail.lineups : [];
  return lineups
    .filter((l) => l?.player_id != null)
    .map((l) => ({
      sm_fixture_id: l.fixture_id ?? detail?.id ?? null,
      team_id: l.team_id ?? null,
      player_id: l.player_id,
      player_name: l.player_name ?? null,
      jersey_number: l.jersey_number ?? null,
      position: l.position_id != null ? String(l.position_id) : null,
      formation_field: l.formation_field ?? null,
      is_start: l.type_id === 11 ? 1 : (l.type_id === 12 ? 0 : null),
      xg: l?.xglineup?.value ?? null,
    }));
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/sm-ingest.js functions/_lib/sm-ingest.test.js
git commit -m "feat(watch): toLineupRows 追加(布陣・先発控え・per-player xG)"
```

## Task 4: toPlayerStatRows() 追加

**Files:**
- Modify: `functions/_lib/sm-ingest.js`
- Test: `functions/_lib/sm-ingest.test.js`

- [ ] **Step 1: 失敗するテストを書く**

Task3 で Hakimi に追加した `details` を使ってテスト:

```javascript
test('toPlayerStatRows: details を (fixture,player,type) 縦持ちに展開', () => {
  const rows = toPlayerStatRows(fixtureDetail);
  const shots = rows.find((r) => r.player_id === 502 && r.type_id === 42);
  assert.equal(shots.value, 3);
  assert.equal(shots.sm_fixture_id, 18452339);
});

test('toPlayerStatRows: details 無しは空（障害隔離）', () => {
  assert.deepEqual(toPlayerStatRows({}), []);
});
```

import に `toPlayerStatRows` 追加。

- [ ] **Step 2: テスト失敗を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: FAIL（未定義）。

- [ ] **Step 3: 最小実装**

```javascript
// lineups[].details[] → sm_player_stats 行（縦持ち）
export function toPlayerStatRows(detail) {
  const lineups = Array.isArray(detail?.lineups) ? detail.lineups : [];
  const rows = [];
  for (const l of lineups) {
    if (l?.player_id == null) continue;
    const details = Array.isArray(l.details) ? l.details : [];
    for (const d of details) {
      if (d?.type_id == null) continue;
      rows.push({
        sm_fixture_id: l.fixture_id ?? detail?.id ?? null,
        player_id: l.player_id,
        type_id: d.type_id,
        value: d?.data?.value ?? null,
      });
    }
  }
  return rows;
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/sm-ingest.js functions/_lib/sm-ingest.test.js
git commit -m "feat(watch): toPlayerStatRows 追加(選手別スタッツ縦持ち)"
```

## Task 5: sm-store に lineup/playerStat upsert を追加し fixtureDetailStatements を拡張

**Files:**
- Modify: `functions/_lib/sm-store.js`
- Test: `functions/_lib/sm-store.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`sm-store.test.js` に（サンプル fixtureDetail に lineups を加えた上で）:

```javascript
test('fixtureDetailStatements: lineups/player_stats の upsert を含む', () => {
  const stmts = fixtureDetailStatements(fixtureDetail, 1700000000);
  const sqls = stmts.map((s) => s.sql).join('\n');
  assert.ok(sqls.includes('INSERT INTO sm_lineups'));
  assert.ok(sqls.includes('INSERT INTO sm_player_stats'));
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node --test functions/_lib/sm-store.test.js`
Expected: FAIL（sm_lineups 文が無い）。

- [ ] **Step 3: 最小実装**

`functions/_lib/sm-store.js`：import に `toLineupRows, toPlayerStatRows` を追加し、文生成を追加:

```javascript
function lineupStatement(row, updatedAt) {
  return {
    sql: `INSERT INTO sm_lineups
            (sm_fixture_id, team_id, player_id, player_name, jersey_number,
             position, formation_field, is_start, xg, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(sm_fixture_id, player_id) DO UPDATE SET
            team_id=excluded.team_id, player_name=excluded.player_name,
            jersey_number=excluded.jersey_number, position=excluded.position,
            formation_field=excluded.formation_field, is_start=excluded.is_start,
            xg=COALESCE(excluded.xg, sm_lineups.xg), updated_at=excluded.updated_at`,
    args: [row.sm_fixture_id, row.team_id, row.player_id, row.player_name,
      row.jersey_number, row.position, row.formation_field, row.is_start, row.xg, updatedAt],
  };
}

function playerStatStatement(row, updatedAt) {
  return {
    sql: `INSERT INTO sm_player_stats (sm_fixture_id, player_id, type_id, value, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(sm_fixture_id, player_id, type_id) DO UPDATE SET
            value=excluded.value, updated_at=excluded.updated_at`,
    args: [row.sm_fixture_id, row.player_id, row.type_id, row.value, updatedAt],
  };
}
```

`fixtureDetailStatements` を:

```javascript
export function fixtureDetailStatements(detail, updatedAt) {
  return [
    ...toTeamRows(detail).map((r) => teamStatement(r, updatedAt)),
    fixtureStatement(toFixtureRow(detail), updatedAt),
    ...toEventRows(detail).map((r) => eventStatement(r, updatedAt)),
    ...toStatRows(detail).map((r) => statStatement(r, updatedAt)),
    ...toLineupRows(detail).map((r) => lineupStatement(r, updatedAt)),
    ...toPlayerStatRows(detail).map((r) => playerStatStatement(r, updatedAt)),
  ];
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `node --test functions/_lib/sm-store.test.js`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/sm-store.js functions/_lib/sm-store.test.js
git commit -m "feat(watch): sm-store に lineups/player_stats upsert を追加"
```

## Task 6: sm-sync の include 拡張と詳細同期対象の選定

**Files:**
- Modify: `functions/_lib/sm-sync.js:11-14`
- Test: `functions/_lib/sm-sync.test.js`

- [ ] **Step 1: include 定数を拡張**

```javascript
export const FIXTURE_DETAIL_INCLUDE =
  'participants;scores;statistics;events;events.type;events.player;xGFixture;lineups;lineups.details;lineups.xglineup';
```

- [ ] **Step 2: 失敗するテストを書く（既存 syncFixtureDetail のシグネチャに合わせる）**

```javascript
test('syncFixtureDetail: 拡張 include(lineups/xGFixture)で取得', async () => {
  let calledInclude = null;
  const footballClient = { get: async (_p, opts) => { calledInclude = opts.include; return { data: { id: 1, participants: [] } }; } };
  const db = { prepare: () => ({ bind: () => ({}) }), batch: async () => [] };
  await syncFixtureDetail({ footballClient, db, fixtureId: 1, now: 1 });
  assert.ok(calledInclude.includes('lineups'));
  assert.ok(calledInclude.includes('xGFixture'));
});
```

- [ ] **Step 3: テスト緑を確認**

Run: `node --test functions/_lib/sm-sync.test.js`
Expected: PASS。

- [ ] **Step 4: 詳細同期対象セレクタ（純粋関数＋テスト）**

```javascript
test('selectFixturesForDetailSync: ライブと直近終了を選ぶ', () => {
  const rows = [ { sm_fixture_id: 1, state_id: 3 }, { sm_fixture_id: 2, state_id: 1 }, { sm_fixture_id: 3, state_id: 5 } ];
  const ids = selectFixturesForDetailSync(rows).map((r) => r.sm_fixture_id);
  assert.deepEqual(ids.sort(), [1, 3]);
});
```

実装:

```javascript
const LIVE_STATES = new Set([2, 3, 6, 9]);
const DONE_STATES = new Set([5, 7, 8]);
export function selectFixturesForDetailSync(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((r) => LIVE_STATES.has(r?.state_id) || DONE_STATES.has(r?.state_id));
}
```

- [ ] **Step 5: worker-watch の scheduled に配線**

`worker-watch/src` 毎分ハンドラで、`sm_fixtures` から当日±1日を引き `selectFixturesForDetailSync` で絞り、各 id を `syncFixtureDetail`（件数上限でレート配慮）。既存 live 同期の隣に追加。

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/sm-sync.js functions/_lib/sm-sync.test.js worker-watch/src
git commit -m "feat(watch): 詳細同期の include拡張＋ライブ/直近終了の対象選定"
```

## Task 7: sm-read に getFixtureDetail() を追加

**Files:**
- Modify: `functions/_lib/sm-read.js`
- Test: `functions/_lib/sm-read.test.js`

- [ ] **Step 1: 失敗するテストを書く**

fake D1 を注入。`makeFakeDb` は sql のテーブル名で結果を出し分けるヘルパ（テスト内定義）:

```javascript
test('getFixtureDetail: fixture/events/stats/lineups を束ねて返す', async () => {
  const db = makeFakeDb({
    fixture: [{ sm_fixture_id: 1, home_team_id: 10, away_team_id: 20, home_score: 2, away_score: 1,
      home_xg: 1.8, away_xg: 1.2, state_id: 5, home_name: 'A', away_name: 'B' }],
    events: [{ sm_event_id: 9, sm_fixture_id: 1, minute: 12, type: 'goal', team_id: 10, player_name: 'X' }],
    stats: [{ sm_fixture_id: 1, team_id: 10, type_id: 45, value: 58 }],
    lineups: [{ sm_fixture_id: 1, team_id: 10, player_id: 100, player_name: 'X', jersey_number: 7,
      formation_field: '2:3', is_start: 1, xg: 0.6 }],
    playerStats: [{ sm_fixture_id: 1, player_id: 100, type_id: 42, value: 3 }],
  });
  const out = await getFixtureDetail(db, 1);
  assert.equal(out.fixture.id, 1);
  assert.equal(out.events.length, 1);
  assert.equal(out.lineups[0].xg, 0.6);
  assert.equal(out.player_stats[0].value, 3);
});

test('getFixtureDetail: 不在 id は null（障害隔離）', async () => {
  const db = makeFakeDb({ fixture: [] });
  assert.equal(await getFixtureDetail(db, 999), null);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node --test functions/_lib/sm-read.test.js`
Expected: FAIL（未定義）。

- [ ] **Step 3: 最小実装**

`functions/_lib/sm-read.js` に追加（`mapFixtureRow` を再利用）:

```javascript
const FIXTURE_ONE_SQL = `
  SELECT f.sm_fixture_id, f.starting_at, f.starting_at_ts, f.state_id, f.round_name, f.result_info,
    f.home_team_id, f.home_score, f.home_xg, f.away_team_id, f.away_score, f.away_xg,
    h.name AS home_name, h.short_code AS home_short, h.image_url AS home_img, h.app_code AS home_app,
    a.name AS away_name, a.short_code AS away_short, a.image_url AS away_img, a.app_code AS away_app
  FROM sm_fixtures f
  LEFT JOIN sm_teams h ON h.sm_team_id = f.home_team_id
  LEFT JOIN sm_teams a ON a.sm_team_id = f.away_team_id
  WHERE f.sm_fixture_id = ?`;

export async function getFixtureDetail(db, id) {
  const fxRes = await db.prepare(FIXTURE_ONE_SQL).bind(id).all();
  const fxRow = (Array.isArray(fxRes?.results) ? fxRes.results : [])[0];
  if (!fxRow) return null;
  const fixture = mapFixtureRow(fxRow);
  const all = async (sql) => {
    const r = await db.prepare(sql).bind(id).all();
    return Array.isArray(r?.results) ? r.results : [];
  };
  const events = await all('SELECT * FROM sm_events WHERE sm_fixture_id = ? ORDER BY sort_order ASC, minute ASC');
  const stats = await all('SELECT * FROM sm_stats WHERE sm_fixture_id = ?');
  const lineups = await all('SELECT * FROM sm_lineups WHERE sm_fixture_id = ?');
  const player_stats = await all('SELECT * FROM sm_player_stats WHERE sm_fixture_id = ?');
  return { fixture, events, stats, lineups, player_stats };
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `node --test functions/_lib/sm-read.test.js`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/sm-read.js functions/_lib/sm-read.test.js
git commit -m "feat(watch): sm-read.getFixtureDetail(1試合の詳細を束ねて返す)"
```

## Task 8: GET /api/fixture エンドポイント

**Files:**
- Create: `functions/api/fixture.js`
- 参照: `functions/api/live.js`（同型のゲート＋障害隔離）

- [ ] **Step 1: 実装**

```javascript
// GET /api/fixture?id=<sm_fixture_id> — 1試合の詳細配信（観戦プラットフォーム P2）
// WATCH_ENABLED ゲート＋障害隔離: OFF/未マイグレーション/失敗時も既存挙動に波及しない。
import { json } from '../_lib/http.js'
import { getFixtureDetail } from '../_lib/sm-read.js'

export async function onRequestGet(context) {
  const { env, request } = context
  if (env.WATCH_ENABLED !== 'true') {
    return json(200, { enabled: false, detail: null }, { 'cache-control': 'public, s-maxage=60' })
  }
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return json(400, { enabled: true, detail: null, error: 'invalid id' })
  }
  if (!env.DB) {
    return json(200, { enabled: true, detail: null, note: 'no-db' })
  }
  try {
    const detail = await getFixtureDetail(env.DB, id)
    return json(200, { enabled: true, detail }, {
      'cache-control': 'public, s-maxage=15, stale-while-revalidate=60',
    })
  } catch (err) {
    console.error('GET /api/fixture failed:', err?.message)
    return json(200, { enabled: true, detail: null, note: 'unavailable' })
  }
}
```

- [ ] **Step 2: ローカル疎通確認**

dev サーバを tmux で起動（`tmux new-session -d -s dev "wrangler pages dev public"`）し、`.dev.vars` に `WATCH_ENABLED=true`。
Run: `curl 'http://localhost:8788/api/fixture?id=1'`
Expected: seed があれば `{enabled:true, detail:{...}}`、無ければ `detail:null`。

- [ ] **Step 3: Commit**

```bash
git add functions/api/fixture.js
git commit -m "feat(watch): GET /api/fixture?id= 配信(WATCH_ENABLED+障害隔離)"
```

## Task 9: P2a 全テスト緑＋ローカル seed で結合確認

- [ ] **Step 1: 全テスト**

Run: `npm test`
Expected: 既存＋新規すべて PASS。

- [ ] **Step 2: ローカルD1にサンプル fixture を seed**

`db/seed-detail-sample.sql`（Create・開発用）に1試合分の sm_fixtures/sm_events/sm_stats/sm_lineups/sm_player_stats の INSERT を用意し適用:

Run: `wrangler d1 execute wcup2026-db --local --file db/seed-detail-sample.sql`
→ `curl 'http://localhost:8788/api/fixture?id=<seed id>'` で全要素が返ることを確認。

- [ ] **Step 3: Commit**

```bash
git add db/seed-detail-sample.sql
git commit -m "chore(watch): 開発用 詳細サンプル seed"
```

---

# フェーズ P2b：画面土台（ヘッダー＋タイムライン/スタッツ/xG）

> 視覚の正本: `.superpowers/brainstorm/10047-1781026960/content/detail-tabs-v1.html` と `verify-result.html`。
> テーマ `T` は既存どおり props で受ける。`window.WC` 経路を踏襲。

## Task 10: data.js に fixtureId 解決と詳細取得を追加

**Files:**
- Modify: `public/data.js`（LIVE 索引・`liveForMatch` 付近 183-233 行）

- [ ] **Step 1: LIVE 索引に id を追加**

`fetchLive()` の index 構築で `id: fx.id` を保持:

```javascript
index[key] = {
  id: fx.id,                       // sm_fixture_id（詳細画面遷移に使用）
  status: fx.status, state_id: fx.state_id,
  result_info: fx.result_info || null,
  scores: { [ha]: fx.home.score, [aa]: fx.away.score },
};
```

- [ ] **Step 2: fixtureIdForMatch / fetchFixtureDetail 追加**

```javascript
// schedule の1試合(app_codeペア)→ sm_fixture_id（未マッチは null）
window.WC.fixtureIdForMatch = function fixtureIdForMatch(match) {
  if (!match || !window.WC.LIVE) return null;
  const key = window.WC.liveKey(match.a, match.b);
  const live = key ? window.WC.LIVE[key] : null;
  return live && live.id != null ? live.id : null;
};

// /api/fixture?id= を取得。失敗/OFF時は null（既存に波及させない）
window.WC.fetchFixtureDetail = async function fetchFixtureDetail(id) {
  try {
    const res = await fetch('/api/fixture?id=' + encodeURIComponent(id), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.enabled === false) return null;
    return data.detail || null;
  } catch (e) { return null; }
};
```

- [ ] **Step 3: 手動確認＋Commit**

ブラウザのコンソールで `window.WC.fetchFixtureDetail(<seed id>)` が detail を返すことを確認。

```bash
git add public/data.js
git commit -m "feat(watch): fixtureIdForMatch/fetchFixtureDetail と LIVE索引にid追加"
```

## Task 11: screens-detail.jsx 土台（MatchDetailScreen＋ヘッダー＋タブバー）

**Files:**
- Create: `public/screens-detail.jsx`
- Modify: `public/index.html`（`screens-detail.jsx?v=N` 追加＋`?v` 全バンプ）

- [ ] **Step 1: スケルトン実装**

`public/screens-detail.jsx`（小コンポーネントに分割。`detail-tabs-v1.html` の意匠）:

```jsx
/* 試合詳細画面（観戦プラットフォーム P2）。読み取り専用・タブ切替。 */
function DetailHeader({ T, fx }) {
  // 旗・チーム名・スコア・状態(LIVE分/FT/KO時刻)・会場。fx=detail.fixture。
  // home/away の app_code から window.WC.TEAM で旗・日本語名を解決。意匠は .hero2。
}

function DetailTabBar({ T, tab, setTab }) {
  const TABS = [
    { id: 'timeline', label: 'タイムライン' },
    { id: 'stats', label: 'スタッツ' },
    { id: 'xg', label: 'xG' },
    { id: 'lineup', label: '布陣' },
    { id: 'h2h', label: 'H2H' },
  ];
  // .tabbar 意匠。アクティブ=accent。
}

function MatchDetailScreen({ T, fixtureId, goBack }) {
  const [detail, setDetail] = React.useState(null);
  const [tab, setTab] = React.useState('timeline');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      const d = await window.WC.fetchFixtureDetail(fixtureId);
      if (!alive) return;
      setDetail(d); setLoading(false);
    };
    load();
    const t = setInterval(load, 10000); // ライブ中のみ意味を持つ（NS/FTは値不変）
    return () => { alive = false; clearInterval(t); };
  }, [fixtureId]);

  if (loading) return <DetailSkeleton T={T} goBack={goBack} />;
  if (!detail) return <DetailUnavailable T={T} goBack={goBack} />;

  return (
    <div>
      <button onClick={goBack} aria-label="戻る">‹ 戻る</button>
      <DetailHeader T={T} fx={detail.fixture} />
      <DetailTabBar T={T} tab={tab} setTab={setTab} />
      {tab === 'timeline' && <TimelineTab T={T} detail={detail} />}
      {tab === 'stats' && <StatsTab T={T} detail={detail} />}
      {tab === 'xg' && <XgTab T={T} detail={detail} />}
      {tab === 'lineup' && <LineupTab T={T} detail={detail} />}
      {tab === 'h2h' && <H2HPlaceholder T={T} />}
    </div>
  );
}

Object.assign(window, { MatchDetailScreen });
```

`DetailSkeleton`/`DetailUnavailable`/`H2HPlaceholder`（「準備中」枠）も最小実装。各タブは後続 Task で中身を実装（この段では空の `div` でよい）。

- [ ] **Step 2: index.html に読み込み追加＋?v バンプ**

jsx 読み込み群に `screens-detail.jsx?v=N` を追加し、全 jsx の `?v` を +1。

- [ ] **Step 3: Commit**

```bash
git add public/screens-detail.jsx public/index.html
git commit -m "feat(watch): 試合詳細画面の土台(ヘッダー/タブバー/スケルトン)"
```

## Task 12: index.html に detailFixture オーバーレイと openDetail を配線

**Files:**
- Modify: `public/index.html`（`Home` 567-720 行付近）

- [ ] **Step 1: 状態とオープナー**

`Home` に追加（`roomView` と同様）:

```javascript
const [detailFixture, setDetailFixture] = useState(null); // sm_fixture_id or null
useEffect(() => {
  window.WC.openDetail = (id) => { if (id != null) setDetailFixture(id); };
  return () => { delete window.WC.openDetail; };
}, []);
```

`renderScreen` 先頭で詳細最優先:

```javascript
function renderScreen(wide) {
  if (detailFixture != null) {
    return <window.MatchDetailScreen T={T} fixtureId={detailFixture} goBack={() => setDetailFixture(null)} />;
  }
  /* ...既存... */
}
```

スクロールキーに `detailFixture` を含める。

- [ ] **Step 2: 手動確認**

コンソールで `window.WC.openDetail(<seed id>)` → 詳細に切替、「戻る」で戻る。

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(watch): detailFixtureオーバーレイ＋window.WC.openDetail配線"
```

## Task 13: タイムラインタブ

**Files:**
- Modify: `public/screens-detail.jsx`（`TimelineTab`）

- [ ] **Step 1: 実装**

`detail.events`（minute/type/team_id/player_name/related_player_name）を中央線で home/away 左右振り分け。意匠は `.tl2`。アイコン: goal=⚽ / yellowcard=🟨 / redcard=🟥 / substitution=🔁（in=player_name/out=related_player_name）。team_id→home/away は `detail.fixture.home.team_id` と突合。空なら「イベントはまだありません」枠。

- [ ] **Step 2: seed で目視確認＋Commit**

```bash
git add public/screens-detail.jsx
git commit -m "feat(watch): 詳細タイムラインタブ"
```

## Task 14: スタッツタブ（ミラーバー＋自動読み解き）

**Files:**
- Modify: `public/screens-detail.jsx`（`StatsTab`、`statInsight` ヘルパ）

- [ ] **Step 1: type_id ラベルマップを seed/2022実データで確定**

ローカル seed/2022 fixture の `sm_stats` を `SELECT DISTINCT type_id` で確認し `sm_types` の名称で日本語ラベル対応付け（例 45=ボール支配/42=シュート/86=枠内/34=コーナー/56=ファウル 等）。

- [ ] **Step 2: 実装**

`detail.stats`（縦持ち type_id/team_id/value）を home/away ペアに畳み込み、ラベルマップ順に `.stat2` ミラーバー表示。末尾に**自動読み解き文**（分析官トーン）を純粋関数 `statInsight(home, away)` で1〜2文生成（支配率・シュート・xG から）。

- [ ] **Step 3: 目視確認＋Commit**

```bash
git add public/screens-detail.jsx
git commit -m "feat(watch): スタッツタブ(ミラーバー＋自動読み解き)"
```

## Task 15: xGタブ（チーム合計＋効率＋選手別xG）

**Files:**
- Modify: `public/screens-detail.jsx`（`XgTab`）

- [ ] **Step 1: 実装（意匠 `verify-result.html`）**

- チーム合計: `detail.fixture.home.xg`/`away.xg`。両方 null なら「xGデータは試合後に表示」枠。
- 効率: 実得点 `home.score`/`away.score` と xG の対比＋読み解き（over/under）。
- 選手別xG: `detail.lineups` を team 毎に `xg` 降順、上位を横バー表示。

- [ ] **Step 2: 目視確認＋Commit**

```bash
git add public/screens-detail.jsx
git commit -m "feat(watch): xGタブ(合計+効率+選手別xG内訳)"
```

---

# フェーズ P2c：布陣タブ

## Task 16: 布陣タブ（フォーメーション図＋選手詳細シート）

**Files:**
- Modify: `public/screens-detail.jsx`（`LineupTab`、`FormationPitch`、`PlayerSheet`）

- [ ] **Step 1: formation_field の座標化を実データで確認**

seed/実データで `formation_field`("行:列") の値域を確認し、行(守備→攻撃)・列をピッチ寸法に写像する関数を確定。

- [ ] **Step 2: FormationPitch 実装**

`detail.lineups` の `is_start===1` を `formation_field` でピッチ配置（home 下半分・away 上半分 or 切替）。背番号＋姓を点に表示。控えは下にリスト。先発が11人乗ることを目視確認。

- [ ] **Step 3: PlayerSheet（選手タップ詳細）**

選手タップで `detail.player_stats`（player_id 一致）を type_id ラベル付き表示（評価/シュート/パス/xG 等）。`SquadSheet`（screens-group.jsx）のシート挙動を参考に。

- [ ] **Step 4: 目視確認＋Commit**

```bash
git add public/screens-detail.jsx
git commit -m "feat(watch): 布陣タブ(フォーメーション図＋選手詳細シート)"
```

---

# フェーズ P2d：入口配線＋仕上げ

## Task 17: 3つの入口に openDetail を配線

**Files:**
- Modify: `public/screens-home.jsx`（`MatchCarousel` のカード、`MatchRow`）
- Modify: `public/screens-knockout.jsx`（KOカード）

- [ ] **Step 1: ホームのカルーセル＆タイムライン行**

`MatchCarousel` のカードと `MatchRow` に、タップで `window.WC.openDetail?.(window.WC.fixtureIdForMatch(match))` を呼ぶ onClick を付与（fixtureId が null は無反応＝未マッチ/プレースホルダは開かない）。cursor とアクセシビリティ（role=button）も付与。

- [ ] **Step 2: ノックアウト表**

`screens-knockout.jsx`（結果ブラケットの KnockoutView）の各試合カードに、app_code 両方確定時のみ同様の onClick。

- [ ] **Step 3: 目視確認＋Commit**

実際に3入口からタップして詳細が開くことを確認。

```bash
git add public/screens-home.jsx public/screens-knockout.jsx
git commit -m "feat(watch): 詳細画面への3入口(カルーセル/日程行/KO表)を配線"
```

## Task 18: 状態の作り込みと仕上げ

**Files:**
- Modify: `public/screens-detail.jsx`、`public/index.html`

- [ ] **Step 1: 各状態**

- NS（未開始）: スコア無し→KO時刻。タイムライン/スタッツ/xG は「試合開始後に表示」枠。布陣は `lineups` 空なら「発表後に表示」枠。
- LIVE: ヘッダー LIVE 分数・10秒ポーリング・スコア即時。
- FT: 最終スコア＋全要素。
- 各タブのデータ欠落で空状態を明示（既存に波及しない）。

- [ ] **Step 2: 遷移アニメ＆スクロール**

オーバーレイ表示時のフェード/スライド（既存 `wcPop` 流用）。詳細を開いたらスクロール最上部へ。

- [ ] **Step 3: 全テスト＋目視回帰**

Run: `npm test`（緑維持）。予想/部屋/ホーム/結果が従来どおり動くこと、`WATCH_ENABLED=false` で入口が fixtureId=null となり詳細が開かないことを確認。

- [ ] **Step 4: ?v バンプ確認＋Commit**

```bash
git add public/screens-detail.jsx public/index.html
git commit -m "feat(watch): 詳細画面の状態作り込み(NS/LIVE/FT/空)＋遷移仕上げ"
```

## Task 19: デプロイ（ユーザー判断）

- [ ] 本番D1へ schema 追記分適用: `wrangler d1 execute wcup2026-db --file db/schema-watch.sql --remote`（IF NOT EXISTS で既存無影響）
- [ ] worker-watch 再デプロイ（詳細同期配線反映）: `cd worker-watch && wrangler deploy`
- [ ] main へマージ→Pages 自動デプロイ。`WATCH_ENABLED` は既に true。
- [ ] 開幕後の実データで xG（xGFixture）・lineups・stats type_id を最終確認し、ラベルマップ/座標化を微調整。

---

## Self-Review（spec 対応確認）

- spec §2 スコープ: ①②③（Task13/14）④xG（Task15）⑤布陣（Task16）⑥H2H枠（Task11）⑦廃止 ✔
- spec §4.1 xG修正（Task2）/§4.2 include（Task6）/§4.3 schema（Task1）/§4.4 ingest+store（Task3-5）/§4.5 api+read（Task7-8）✔
- spec §3 アーキ（Task11-12）/§5 フロント配線（Task10,17）✔
- spec §6 不変条件: WATCH_ENABLED（Task8,18）・障害隔離（Task7,8,10）・既存不変（予想/部屋に触れるTask無し）✔
- spec §7 実装順＝本計画のフェーズ順 ✔ / §8 検証現実（Task9 seed・Task19 実データ確認）✔ / §9 テスト（各Task TDD）✔
- 型整合: `fixtureDetailStatements`/`getFixtureDetail`/`fetchFixtureDetail`/`fixtureIdForMatch`/`openDetail`/`MatchDetailScreen` は定義Taskと利用Taskで名称一致 ✔
