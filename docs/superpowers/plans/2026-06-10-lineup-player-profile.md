# 布陣タブ強化（選手プロフィール＋カード/交代）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 試合詳細の布陣タブを、選手プロフィール（年齢/身長/国籍/クラブ等）＋ピッチ上のカード/交代表示＋控え強化に拡張する。

**Architecture:** データ方式A＝`sm_lineups`にbio列をdenormalize、`sm_events`に`player_id/related_player_id`追加。取り込みは既存の試合詳細同期に `lineups.player` includeを足すだけ。フロントは `screens-detail.jsx` のPlayerDot/BenchList/PlayerSheetを改修。バックエンドはTDD、フロントはローカルD1＋ハーネス(Playwright)で目視検証（リポジトリ規約: フロントは単体テスト無し・ハーネス検証）。

**Tech Stack:** Cloudflare Pages Functions / D1(SQLite) / node:test / React18 UMD + Babel(JSX) / wrangler / Playwright(python)

設計正本: `docs/superpowers/specs/2026-06-10-lineup-player-profile-design.md`

---

## File Structure

- `db/schema-watch.sql` — CREATE に新列追加（**新規DB用**）
- `db/migrate-lineup-profile.sql` — **新規**。既存D1(local/prod)への `ALTER TABLE ADD COLUMN`（冪等運用＝重複列エラーは無害）
- `functions/_lib/sm-ingest.js` — `toEventRows`(player_id追加)・`toLineupRows`(bio追加)
- `functions/_lib/sm-store.js` — `eventStatement`/`lineupStatement` のSQL+args拡張
- `functions/_lib/sm-sync.js` — `FIXTURE_DETAIL_INCLUDE` に `lineups.player;lineups.player.nationality`（＋best-effort `lineups.player.teams`）
- `functions/_lib/sm-ingest.test.js` / `sm-store.test.js` / `sm-sync.test.js` — テスト追加
- `db/seed-detail-live.sql` — 開発専用seed拡張（bio＋event player_id＋交代）
- `public/screens-detail.jsx` — 新ヘルパー `playerEventIndex` ＋ PlayerDot/BenchList/PlayerSheet 改修
- `public/index.html` — `screens-detail.jsx?v=8→9`

---

## Task 1: スキーマに新列を追加（fresh＋migration）

**Files:**
- Modify: `db/schema-watch.sql`（sm_lineups / sm_events の CREATE）
- Create: `db/migrate-lineup-profile.sql`

- [ ] **Step 1: `schema-watch.sql` の `sm_lineups` CREATE に列追加**

`xg REAL,` の直後に以下を追加（`updated_at`より前）:
```sql
  date_of_birth   TEXT,
  height          INTEGER,
  weight          INTEGER,
  nationality_id  INTEGER,
  nationality_name TEXT,
  detailed_position TEXT,
  club_name       TEXT,
  club_image      TEXT,
```

- [ ] **Step 2: `schema-watch.sql` の `sm_events` CREATE に列追加**

`related_player_name TEXT,` の直後に追加:
```sql
  player_id           INTEGER,
  related_player_id   INTEGER,
```

- [ ] **Step 3: migration ファイルを作成**

`db/migrate-lineup-profile.sql`:
```sql
-- 既存 D1 へ列追加（local/prod）。SQLite は ADD COLUMN IF NOT EXISTS 非対応＝
-- 既に適用済みのDBでは「duplicate column」エラーになるが無害（再実行しないこと）。
ALTER TABLE sm_lineups ADD COLUMN date_of_birth TEXT;
ALTER TABLE sm_lineups ADD COLUMN height INTEGER;
ALTER TABLE sm_lineups ADD COLUMN weight INTEGER;
ALTER TABLE sm_lineups ADD COLUMN nationality_id INTEGER;
ALTER TABLE sm_lineups ADD COLUMN nationality_name TEXT;
ALTER TABLE sm_lineups ADD COLUMN detailed_position TEXT;
ALTER TABLE sm_lineups ADD COLUMN club_name TEXT;
ALTER TABLE sm_lineups ADD COLUMN club_image TEXT;
ALTER TABLE sm_events ADD COLUMN player_id INTEGER;
ALTER TABLE sm_events ADD COLUMN related_player_id INTEGER;
```

- [ ] **Step 4: ローカルD1へ適用して列を確認**

Run:
```bash
npx wrangler d1 execute wcup2026-db --local --file db/migrate-lineup-profile.sql
npx wrangler d1 execute wcup2026-db --local --command "PRAGMA table_info(sm_lineups);" | grep -E "date_of_birth|club_name|nationality_name"
npx wrangler d1 execute wcup2026-db --local --command "PRAGMA table_info(sm_events);" | grep -E "player_id|related_player_id"
```
Expected: 追加列が表示される。

- [ ] **Step 5: Commit**
```bash
git add db/schema-watch.sql db/migrate-lineup-profile.sql
git commit -m "feat(watch): 布陣プロフィール用に sm_lineups(bio)/sm_events(player_id) 列追加"
```

---

## Task 2: toEventRows に player_id / related_player_id を写像（TDD）

**Files:**
- Modify: `functions/_lib/sm-ingest.js`（`toEventRows`）
- Test: `functions/_lib/sm-ingest.test.js`

- [ ] **Step 1: 失敗するテストを追加**

`sm-ingest.test.js` に追記（既存 `fixtureDetail` の events 要素は `player_id` を持つ前提。持たなければサンプルの該当eventに `player_id: 999, related_player_id: 888` を足してからテスト）:
```js
test("toEventRows maps player_id and related_player_id", () => {
	const detail = {
		id: 1,
		events: [
			{ id: 10, fixture_id: 1, type_id: 19, minute: 41, participant_id: 5,
			  player_id: 999, related_player_id: null },
			{ id: 11, fixture_id: 1, type_id: 18, minute: 70, participant_id: 5,
			  player_id: 100, related_player_id: 200 },
		],
	};
	const rows = toEventRows(detail);
	assert.equal(rows[0].player_id, 999);
	assert.equal(rows[0].related_player_id, null);
	assert.equal(rows[1].player_id, 100);
	assert.equal(rows[1].related_player_id, 200);
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: FAIL（`rows[0].player_id` が undefined）

- [ ] **Step 3: `toEventRows` の map オブジェクトに2行追加**

`related_player_name: e.related_player_name ?? null,` の直後に:
```js
			player_id: e.player_id ?? null,
			related_player_id: e.related_player_id ?? null,
```

- [ ] **Step 4: テスト実行して成功を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add functions/_lib/sm-ingest.js functions/_lib/sm-ingest.test.js
git commit -m "feat(watch): toEventRows に player_id/related_player_id を保持"
```

---

## Task 3: toLineupRows に bio を写像（TDD）

**Files:**
- Modify: `functions/_lib/sm-ingest.js`（`toLineupRows`）
- Test: `functions/_lib/sm-ingest.test.js`

- [ ] **Step 1: 失敗するテストを追加**
```js
test("toLineupRows maps player bio from lineups.player", () => {
	const detail = {
		id: 1,
		lineups: [{
			fixture_id: 1, team_id: 5, player_id: 100, player_name: "Test Player",
			jersey_number: 9, position_id: 27, formation_field: "4:1", type_id: 11,
			detailed_position: "Centre Forward",
			player: {
				date_of_birth: "1997-05-20", height: 180, weight: 75, nationality_id: 32,
				nationality: { name: "Japan" },
				teams: [{ name: "Brighton", image_path: "https://cdn/club.png", meta: { active: true } }],
			},
		}],
	};
	const r = toLineupRows(detail)[0];
	assert.equal(r.date_of_birth, "1997-05-20");
	assert.equal(r.height, 180);
	assert.equal(r.weight, 75);
	assert.equal(r.nationality_id, 32);
	assert.equal(r.nationality_name, "Japan");
	assert.equal(r.detailed_position, "Centre Forward");
	assert.equal(r.club_name, "Brighton");
	assert.equal(r.club_image, "https://cdn/club.png");
});

test("toLineupRows tolerates missing bio (null)", () => {
	const r = toLineupRows({ id: 1, lineups: [{ player_id: 1, team_id: 5, type_id: 12 }] })[0];
	assert.equal(r.date_of_birth, null);
	assert.equal(r.nationality_name, null);
	assert.equal(r.club_name, null);
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: FAIL

- [ ] **Step 3: `toLineupRows` に bio 写像とヘルパーを追加**

`toLineupRows` の `.map((l) => ({ ... }))` 内、`xg:` 行の直後に追加:
```js
			date_of_birth: l?.player?.date_of_birth ?? null,
			height: l?.player?.height ?? null,
			weight: l?.player?.weight ?? null,
			nationality_id: l?.player?.nationality_id ?? null,
			nationality_name: l?.player?.nationality?.name ?? null,
			detailed_position:
				l.detailed_position ?? l?.player?.detailedposition?.name ?? null,
			club_name: activeClub(l)?.name ?? null,
			club_image: activeClub(l)?.image_path ?? null,
```

`toLineupRows` 関数の直前に、現所属クラブ抽出ヘルパーを追加:
```js
// lineups.player.teams から現所属クラブ（meta.active=true 優先・無ければ先頭）を返す。
function activeClub(l) {
	const teams = Array.isArray(l?.player?.teams) ? l.player.teams : [];
	if (teams.length === 0) return null;
	return teams.find((t) => t?.meta?.active === true) ?? teams[0] ?? null;
}
```

- [ ] **Step 4: テスト実行して成功を確認**

Run: `node --test functions/_lib/sm-ingest.test.js`
Expected: PASS（既存testも緑）

- [ ] **Step 5: Commit**
```bash
git add functions/_lib/sm-ingest.js functions/_lib/sm-ingest.test.js
git commit -m "feat(watch): toLineupRows に選手bio(年齢/身長/国籍/クラブ)を写像"
```

---

## Task 4: sm-store の event/lineup upsert を新列対応（TDD）

**Files:**
- Modify: `functions/_lib/sm-store.js`（`eventStatement` / `lineupStatement`）
- Test: `functions/_lib/sm-store.test.js`

- [ ] **Step 1: 失敗するテストを追加**

`sm-store.test.js` の import に `fixtureDetailStatements` が無ければ追加し、以下を追記:
```js
test("lineup statement includes bio columns and args", () => {
	const detail = { id: 1,
		lineups: [{ fixture_id: 1, team_id: 5, player_id: 100, type_id: 11,
			player: { date_of_birth: "1997-05-20", height: 180, weight: 75,
				nationality_id: 32, nationality: { name: "Japan" }, teams: [] } }] };
	const sts = fixtureDetailStatements(detail, 1781000000);
	const lu = sts.find((s) => s.sql.includes("INTO sm_lineups"));
	assert.ok(lu.sql.includes("date_of_birth"));
	assert.ok(lu.sql.includes("nationality_name"));
	assert.ok(lu.sql.includes("club_name"));
	assert.ok(lu.args.includes("Japan"));
});

test("event statement includes player_id columns and args", () => {
	const detail = { id: 1,
		events: [{ id: 9, fixture_id: 1, type_id: 18, participant_id: 5,
			player_id: 100, related_player_id: 200 }] };
	const sts = fixtureDetailStatements(detail, 1781000000);
	const ev = sts.find((s) => s.sql.includes("INTO sm_events"));
	assert.ok(ev.sql.includes("player_id"));
	assert.ok(ev.sql.includes("related_player_id"));
	assert.ok(ev.args.includes(100));
	assert.ok(ev.args.includes(200));
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `node --test functions/_lib/sm-store.test.js`
Expected: FAIL

- [ ] **Step 3: `eventStatement` を拡張**

INSERT 列に `player_id, related_player_id` を追加、VALUES の `?` を2つ追加、ON CONFLICT に `player_id=excluded.player_id, related_player_id=excluded.related_player_id,` を追加、args に `row.player_id ?? null, row.related_player_id ?? null,` を `row.sort_order,` の後（`updatedAt` 前）に追加:
```sql
            (sm_event_id, sm_fixture_id, minute, extra_minute, type, type_id,
             team_id, player_name, related_player_name, player_id, related_player_id,
             sort_order, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```
ON CONFLICT 句に追記:
```sql
            player_id=excluded.player_id, related_player_id=excluded.related_player_id,
```
args（順序厳守）: `... row.related_player_name, row.player_id ?? null, row.related_player_id ?? null, row.sort_order, updatedAt`

- [ ] **Step 4: `lineupStatement` を拡張**

INSERT 列に bio 8列を追加、VALUES に `?`×8追加、ON CONFLICT に各列の `col=excluded.col`（bioは `COALESCE(excluded.col, sm_lineups.col)` で既存保持）を追加、args に対応値を `row.xg,` の後（`updatedAt` 前）に追加:
```sql
            (sm_fixture_id, team_id, player_id, player_name, jersey_number,
             position, formation_field, is_start, xg,
             date_of_birth, height, weight, nationality_id, nationality_name,
             detailed_position, club_name, club_image, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```
ON CONFLICT 追記（bioは欠落同期で消さないよう COALESCE）:
```sql
            date_of_birth=COALESCE(excluded.date_of_birth, sm_lineups.date_of_birth),
            height=COALESCE(excluded.height, sm_lineups.height),
            weight=COALESCE(excluded.weight, sm_lineups.weight),
            nationality_id=COALESCE(excluded.nationality_id, sm_lineups.nationality_id),
            nationality_name=COALESCE(excluded.nationality_name, sm_lineups.nationality_name),
            detailed_position=COALESCE(excluded.detailed_position, sm_lineups.detailed_position),
            club_name=COALESCE(excluded.club_name, sm_lineups.club_name),
            club_image=COALESCE(excluded.club_image, sm_lineups.club_image),
```
args（順序厳守・`row.xg,` の後）:
```js
			row.date_of_birth ?? null, row.height ?? null, row.weight ?? null,
			row.nationality_id ?? null, row.nationality_name ?? null,
			row.detailed_position ?? null, row.club_name ?? null, row.club_image ?? null,
```

- [ ] **Step 5: テスト実行して成功を確認**

Run: `node --test functions/_lib/sm-store.test.js`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add functions/_lib/sm-store.js functions/_lib/sm-store.test.js
git commit -m "feat(watch): sm-store の event/lineup upsert を player_id/bio 列に対応"
```

---

## Task 5: 同期 include に lineups.player を追加（TDD）

**Files:**
- Modify: `functions/_lib/sm-sync.js`（`FIXTURE_DETAIL_INCLUDE`）
- Test: `functions/_lib/sm-sync.test.js`

- [ ] **Step 1: 失敗するテストを追加**
```js
test("FIXTURE_DETAIL_INCLUDE requests player profile for lineups", () => {
	assert.ok(FIXTURE_DETAIL_INCLUDE.includes("lineups.player"));
	assert.ok(FIXTURE_DETAIL_INCLUDE.includes("lineups.player.nationality"));
});
```
（`FIXTURE_DETAIL_INCLUDE` がtestにimportされていなければ追加）

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `node --test functions/_lib/sm-sync.test.js`
Expected: FAIL

- [ ] **Step 3: include 文字列を拡張**

`FIXTURE_DETAIL_INCLUDE` の末尾 `lineups.xglineup` の後に追加（クラブは best-effort で `lineups.player.teams` も付与）:
```js
export const FIXTURE_DETAIL_INCLUDE =
	"participants;scores;statistics;events;events.type;events.player;xGFixture;lineups;lineups.details;lineups.xglineup;lineups.player;lineups.player.nationality;lineups.player.teams";
```

- [ ] **Step 4: テスト実行して成功を確認**

Run: `node --test functions/_lib/sm-sync.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add functions/_lib/sm-sync.js functions/_lib/sm-sync.test.js
git commit -m "feat(watch): 試合詳細 include に lineups.player(プロフィール/国籍/クラブ)追加"
```

---

## Task 6: 開発用seedを拡張（bio＋event player_id＋交代）

**Files:**
- Modify: `db/seed-detail-live.sql`

- [ ] **Step 1: lineups INSERT に bio 列と値を追加**

`db/seed-detail-live.sql` の `INSERT OR REPLACE INTO sm_lineups (...)` の列リストへ
`xg,` の後に `date_of_birth, height, weight, nationality_id, nationality_name, detailed_position, club_name, club_image,` を追加し、**先発の代表数名**（例: Mitoma 9410008・Musiala 9420008）の VALUES に実値を、残りは `NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,` を `xg値,` と `updated_at` の間に挿入。Mitoma 例:
```sql
  (9000002, 9100001, 9410008, 'Kaoru Mitoma', 14, '26', '4:1', 1, 0.58,
   '1997-05-20', 178, 73, 32, 'Japan', 'Left Winger', 'Brighton', NULL, 1781000000),
```
（他選手は bio を NULL 8個で埋める。列数を必ず合わせる）

- [ ] **Step 2: events INSERT に player_id/related_player_id 列と交代イベントを追加**

`INSERT OR REPLACE INTO sm_events (...)` の列リストに `related_player_name,` の後へ `player_id, related_player_id,` を追加。既存2イベントへ player_id を付与（Mitoma=9410008 等）、related_player_id は NULL。さらに**交代イベント1件**を追加（先発Asano 9410011 OUT・控えUeda 9410013 IN・67分）:
```sql
  (9300003, 9000002, 67, NULL, 'substitution', 18, 9100001, 'Ritsu Doan', 'Takuma Asano', 4020,
   9410013, 9410011, 1781000000),
```
（type_id 18=SUBSTITUTION。player_id=IN(Ueda 9410013) related_player_id=OUT(Asano 9410011)。seedの実選手IDに合わせる）

- [ ] **Step 3: ローカルD1へ再適用して件数確認**

Run:
```bash
npx wrangler d1 execute wcup2026-db --local --file db/seed-detail-live.sql
npx wrangler d1 execute wcup2026-db --local --command "SELECT player_name, club_name, nationality_name FROM sm_lineups WHERE sm_fixture_id=9000002 AND club_name IS NOT NULL;"
npx wrangler d1 execute wcup2026-db --local --command "SELECT type, player_id, related_player_id FROM sm_events WHERE sm_fixture_id=9000002 AND type='substitution';"
```
Expected: bio付き選手と交代イベントが返る。

- [ ] **Step 4: Commit**
```bash
git add db/seed-detail-live.sql
git commit -m "chore(watch): 開発用seedに選手bio・event player_id・交代を追加"
```

---

## Task 7: フロント — 選手イベント索引ヘルパー

**Files:**
- Modify: `public/screens-detail.jsx`（新関数 `playerEventIndex`）

> フロントはリポジトリ規約により単体テスト無し。実装後 Task 11 のハーネスで検証。

- [ ] **Step 1: `playerEventIndex` を追加**

`function LineupTab(` の直前に追加:
```jsx
// detail.events を player_id で索引化。各選手の {cards:[{type,minute}], subOff, subOn} を返す。
// player_id 欠落の旧データは player_name フォールバック（完全一致のみ）。
function playerEventIndex(events) {
	const byId = {};
	const byName = {};
	const ensure = (map, key) => {
		if (key == null) return null;
		if (!map[key]) map[key] = { cards: [], subOff: null, subOn: null };
		return map[key];
	};
	(events || []).forEach((e) => {
		const t = e.type;
		if (t === "yellowcard" || t === "redcard" || t === "yellowredcard") {
			const slot = ensure(byId, e.player_id) || ensure(byName, e.player_name);
			if (slot) slot.cards.push({ type: t, minute: e.minute });
		} else if (t === "substitution") {
			const inSlot = ensure(byId, e.player_id) || ensure(byName, e.player_name);
			if (inSlot) inSlot.subOn = e.minute;
			const outSlot =
				ensure(byId, e.related_player_id) || ensure(byName, e.related_player_name);
			if (outSlot) outSlot.subOff = e.minute;
		}
	});
	return { byId, byName };
}

// 1選手のイベント要約を索引から取り出す（player_id優先・名前フォールバック）。
function playerEvents(index, player) {
	return (
		(index.byId && index.byId[player.player_id]) ||
		(index.byName && index.byName[player.player_name]) ||
		{ cards: [], subOff: null, subOn: null }
	);
}
```

- [ ] **Step 2: ブートスモーク（compileのみ）**

Run:
```bash
node -e "require('@babel/core').transformFileSync('public/screens-detail.jsx',{presets:['@babel/preset-react']}); console.log('compile OK')" 2>/dev/null || npx babel public/screens-detail.jsx >/dev/null && echo "compile OK"
```
Expected: `compile OK`（構文エラー無し）

- [ ] **Step 3: Commit**
```bash
git add public/screens-detail.jsx
git commit -m "feat(watch): 布陣用に選手イベント索引(playerEventIndex)を追加"
```

---

## Task 8: フロント — PlayerDot のxGをカード/交代に置換

**Files:**
- Modify: `public/screens-detail.jsx`（`PlayerDot` / 呼び出し側 `FormationPitch`）

- [ ] **Step 1: `FormationPitch` から各ドットへイベント要約を渡す**

`FormationPitch({ T, starters, onTapPlayer })` の先頭で索引を作り、`placed.map` 内の `<PlayerDot ... />` に `ev={playerEvents(evIndex, p)}` を渡す。索引は `FormationPitch` 引数に `events` を追加して受け取る（`LineupTab` から `<FormationPitch ... events={detail.events} />` を渡す）。
```jsx
function FormationPitch({ T, starters, onTapPlayer, events }) {
	const evIndex = playerEventIndex(events);
	// ...既存...
	// <PlayerDot> 呼び出しに ev を追加:
	//   <PlayerDot key={...} T={T} player={p} ev={playerEvents(evIndex, p)} topPct={...} leftPct={...} onTap={onTapPlayer} />
```

- [ ] **Step 2: `PlayerDot` で xGチップを削除し、カード/交代バッジを描画**

`PlayerDot({ T, player, topPct, leftPct, onTap })` を `PlayerDot({ T, player, ev, topPct, leftPct, onTap })` に変更。`const hasXg = ...` と「xG チップ」JSXブロックを削除し、代わりに背番号丸の中（`position: relative` の子）へ:
```jsx
				{/* カード（最重を優先表示: 赤系 > 黄） */}
				{ev && ev.cards && ev.cards.length > 0 && (
					<div style={{ position: "absolute", top: -6, right: -6, fontSize: 12, lineHeight: 1 }}>
						{ev.cards.some((c) => c.type === "redcard" || c.type === "yellowredcard")
							? "🟥"
							: "🟨"}
					</div>
				)}
				{/* 交代OUT（先発が退く） */}
				{ev && ev.subOff != null && (
					<div style={{ position: "absolute", bottom: -7, right: -8,
						background: "rgba(255,90,90,0.92)", color: "#1a0c0c", fontSize: 7.5,
						fontWeight: 900, padding: "0 3px", borderRadius: 5 }}>
						↓{ev.subOff}'
					</div>
				)}
```

- [ ] **Step 3: compileスモーク**

Run: `npx babel public/screens-detail.jsx >/dev/null && echo "compile OK"`
Expected: `compile OK`

- [ ] **Step 4: Commit**
```bash
git add public/screens-detail.jsx
git commit -m "feat(watch): 布陣ドットのxGをカード/交代表示に置換"
```

---

## Task 9: フロント — BenchList に出場(↑)を表示

**Files:**
- Modify: `public/screens-detail.jsx`（`BenchList` / 呼び出し側）

- [ ] **Step 1: `BenchList` にイベント索引を渡し ↑ を描画**

`BenchList({ T, bench, onTapPlayer })` を `BenchList({ T, bench, onTapPlayer, events })` に変更。先頭に `const evIndex = playerEventIndex(events);`。各 bench 行の position 表示の前（`marginLeft:"auto"` の position spanの直前）に、出場時間バッジを追加:
```jsx
						{(() => {
							const e = playerEvents(evIndex, p);
							return e.subOn != null ? (
								<span style={{ fontSize: 10, fontWeight: 900, color: T.accent, marginLeft: "auto" }}>
									↑{e.subOn}'
								</span>
							) : null;
						})()}
```
（position span の `marginLeft:"auto"` は、↑がある場合は↑側に寄せるため position 側を `marginLeft: 8` に変更）。`LineupTab` の `<BenchList ... />` に `events={detail.events}` を渡す。

- [ ] **Step 2: compileスモーク**

Run: `npx babel public/screens-detail.jsx >/dev/null && echo "compile OK"`
Expected: `compile OK`

- [ ] **Step 3: Commit**
```bash
git add public/screens-detail.jsx
git commit -m "feat(watch): 控えリストに出場時間(↑)を表示"
```

---

## Task 10: フロント — PlayerSheet を選手プロフィールに拡張

**Files:**
- Modify: `public/screens-detail.jsx`（`PlayerSheet` / 呼び出し側で events を渡す）

- [ ] **Step 1: `PlayerSheet` に bio セクションとこの試合セクションを追加**

`PlayerSheet({ T, player, playerStats, onClose })` を `PlayerSheet({ T, player, playerStats, events, onClose })` に変更。年齢算出ヘルパーを `function PlayerSheet` の直前に追加:
```jsx
// "YYYY-MM-DD" → 満年齢（タイムゾーン非依存の単純年差）。不正は null。
function ageFromDob(dob) {
	if (!dob) return null;
	const m = String(dob).match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return null;
	const y = +m[1], mo = +m[2], d = +m[3];
	const now = new Date();
	let age = now.getFullYear() - y;
	const mm = now.getMonth() + 1, dd = now.getDate();
	if (mm < mo || (mm === mo && dd < d)) age -= 1;
	return age >= 0 && age < 130 ? age : null;
}
```
`{/* スタッツ本体 */}` の `xG 行` ブロックの**前**に bio 行群を追加（欠落は出さない）:
```jsx
						{/* プロフィール */}
						{(() => {
							const age = ageFromDob(player.date_of_birth);
							const pos = player.detailed_position || player.position;
							const rows = [];
							if (pos) rows.push(["ポジション", `${pos}　#${player.jersey_number ?? "-"}`]);
							if (age != null || player.height || player.weight)
								rows.push(["年齢/身長/体重",
									`${age != null ? age + "歳" : "-"} / ${player.height ? player.height + "cm" : "-"} / ${player.weight ? player.weight + "kg" : "-"}`]);
							if (player.nationality_name) rows.push(["国籍", player.nationality_name]);
							if (player.club_name) rows.push(["所属クラブ", player.club_name]);
							return rows.map(([k, v]) => (
								<div key={k} style={{ display: "flex", justifyContent: "space-between",
									padding: "9px 0", borderBottom: "1px solid " + T.line, fontSize: 13 }}>
									<span style={{ color: T.sub, fontWeight: 700 }}>{k}</span>
									<span style={{ fontWeight: 800, color: T.text }}>{v}</span>
								</div>
							));
						})()}
						{/* この試合: カード/交代 */}
						{(() => {
							const idx = playerEventIndex(events);
							const e = playerEvents(idx, player);
							const items = [];
							e.cards.forEach((c) =>
								items.push([c.type === "yellowcard" ? "イエロー" : "レッド/退場", `${c.minute}'`]));
							if (e.subOff != null) items.push(["交代OUT", `${e.subOff}'`]);
							if (e.subOn != null) items.push(["交代IN", `${e.subOn}'`]);
							return items.map(([k, v], i) => (
								<div key={"ev" + i} style={{ display: "flex", justifyContent: "space-between",
									padding: "9px 0", borderBottom: "1px solid " + T.line, fontSize: 13 }}>
									<span style={{ color: T.sub, fontWeight: 700 }}>{k}</span>
									<span style={{ fontWeight: 800, color: T.text }}>{v}</span>
								</div>
							));
						})()}
```

- [ ] **Step 2: `LineupTab` から PlayerSheet に events を渡す**

`LineupTab` 内の `<PlayerSheet ... />` 呼び出しに `events={detail.events}` を追加（`playerStats={playerStats}` の隣）。

- [ ] **Step 3: compileスモーク**

Run: `npx babel public/screens-detail.jsx >/dev/null && echo "compile OK"`
Expected: `compile OK`

- [ ] **Step 4: Commit**
```bash
git add public/screens-detail.jsx
git commit -m "feat(watch): PlayerSheetを選手プロフィール(bio＋この試合)に拡張"
```

---

## Task 11: ハーネス目視検証 ＋ ?v バンプ

**Files:**
- Modify: `public/index.html`（`?v=8→9`）
- 一時: `public/_detail-harness.html`（本番禁止・検証後削除）

- [ ] **Step 1: ローカル環境を整える**

Run（schema差分は Task1 で適用済・seed は Task6 で適用済の前提。未適用なら再実行）:
```bash
npx wrangler d1 execute wcup2026-db --local --file db/migrate-lineup-profile.sql 2>/dev/null || true
npx wrangler d1 execute wcup2026-db --local --file db/seed-detail-live.sql
```
dev server（:8800 が無ければ起動）: `npx wrangler pages dev public --port 8800`

- [ ] **Step 2: ハーネスとPlaywrightで布陣タブを撮影**

`public/_detail-harness.html`（既存手順）を用意し、Playwrightで `?fx=9000002` → 布陣タブ → 日本側ドット（Mitomaにカード/交代があれば表示）→ Mitomaをタップしてプロフィール（ポジション/年齢/国籍/クラブ＋この試合）→ 控えの ↑ を撮影。スクショ3枚（pitch / profile / bench）。`service_workers="block"` 必須。

- [ ] **Step 3: 目視チェック（人間/エージェント）**
  - ドット: xGチップが消え、カード/交代↓が出る
  - プロフィール: ポジション・年齢・身長/体重・国籍・所属クラブ・この試合のカード/交代
  - 控え: 出場者に ↑分

- [ ] **Step 4: `?v` バンプ＋ハーネス削除**

`public/index.html` の `screens-detail.jsx?v=8` を `?v=9` に変更。`rm public/_detail-harness.html`。

- [ ] **Step 5: Commit**
```bash
git add public/index.html
git commit -m "chore(watch): screens-detail ?v=9（布陣プロフィール反映）"
```

---

## Task 12: 全テスト＋最終確認

- [ ] **Step 1: 全テスト緑**

Run: `npm test`
Expected: 既存286 ＋ 新規（ingest×3, store×2, sync×1）= すべて pass・fail 0

- [ ] **Step 2: 作業ツリーにハーネスが残っていないか確認**

Run: `git status --porcelain | grep _detail-harness && echo "REMOVE IT" || echo "clean"`
Expected: `clean`

- [ ] **Step 3: （任意）PR更新 or 新規PR**

`git push` 後、PR本文に布陣プロフィール機能を追記、または新規PR作成。

---

## Notes
- 本番D1へは `db/migrate-lineup-profile.sql` を**一度だけ**適用（再実行は重複列エラー＝無害だが避ける）。worker-watch 再デプロイで include 変更が反映。
- jsx変更につき `index.html` の `?v` 必須（[[wcup-deploy-flow]]）。
- 予想/部屋は不変（布陣タブのみ改修）。
