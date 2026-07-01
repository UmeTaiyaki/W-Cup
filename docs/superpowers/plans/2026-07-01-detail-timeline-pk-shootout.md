# 試合詳細タイムライン PK戦セクション Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 試合詳細「タイムライン」タブで、PK戦（ペナルティシュートアウト）を通常イベントから分離し、蹴った順に成功/失敗と累積スコアを見せる専用セクションを描画する。

**Architecture:** 振り分け＋累積スコア算出を純粋関数 `public/lib/shootout.js`（単一正本・ESM）に閉じ、`node --test` で単体テスト。ブラウザへは既存 `public/lib/*` と同様に index.html のインラインモジュールが `window.WC` へ載せ、`text/babel` の `screens-detail.jsx` が `window.WC.xxx` で参照する。描画は既存 `TimelineTab` の左右レイアウト・中心線様式を踏襲。

**Tech Stack:** ブラウザ配信 React（`@babel/standalone`、バンドラ無し）／ Cloudflare Pages Functions ／ `node --test`（`node:test` + `node:assert/strict`）。

## Global Constraints

- 純粋関数はブラウザ/Node 共有の ESM。壊れた/欠損入力でも例外を投げず空配列 or 不変カウントで返す（既存 `functions/_lib` の障害隔離方針）。
- PK戦の type は `"pen_shootout_goal"`（成功）/ `"pen_shootout_miss"`（失敗）の2つのみ。通常PK（`"penalty"` / `"missed_penalty"`）は PK戦ではなく、本編タイムラインに残す（変更しない）。
- 累積スコア・見出しスコアは常にホーム–アウェイ視点（`ev.team_id === fx.home.team_id` が home）。
- `public/index.html` の jsx 変更時は `?v=N` バンプ必須（デプロイ運用メモ準拠）。
- テストは `functions/_lib/*.test.js` が `../../public/lib/xxx.js` を import する既存パターンに一致させる（例: `functions/_lib/schedule-view.test.js`）。

---

### Task 1: 純粋関数 `buildShootoutTimeline`（振り分け＋ソート＋累積スコア）

**Files:**
- Create: `public/lib/shootout.js`
- Test: `functions/_lib/shootout.test.js`

**Interfaces:**
- Consumes: なし（純粋関数）。入力イベントは `toEventRows`（`functions/_lib/sm-ingest.js`）が返す形 `{ sm_event_id, type, team_id, player_name, minute, extra_minute, sort_order, ... }`。
- Produces:
  - `isShootoutEvent(type: string) -> boolean`
  - `buildShootoutTimeline(events: object[], homeTeamId: number) -> Array<{ ev: object, running: {home: number, away: number} }>`
    - `ev.type ∈ {"pen_shootout_goal","pen_shootout_miss"}` のみ抽出
    - `sort_order` 昇順 → `sm_event_id` 昇順で安定ソート（`minute` は使わない）
    - `running[i]` = i本目（0始まり）を蹴り終えた直後の累積成功数。成功(`pen_shootout_goal`)のみ蹴ったチーム側 +1。

- [ ] **Step 1: Write the failing test**

`functions/_lib/shootout.test.js` を新規作成:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildShootoutTimeline, isShootoutEvent } from "../../public/lib/shootout.js";

const HOME = 10;
const AWAY = 20;

test("isShootoutEvent: PK戦 type のみ true", () => {
	assert.equal(isShootoutEvent("pen_shootout_goal"), true);
	assert.equal(isShootoutEvent("pen_shootout_miss"), true);
	assert.equal(isShootoutEvent("penalty"), false);
	assert.equal(isShootoutEvent("missed_penalty"), false);
	assert.equal(isShootoutEvent("goal"), false);
	assert.equal(isShootoutEvent(null), false);
});

test("buildShootoutTimeline: PK戦以外は除外される", () => {
	const events = [
		{ sm_event_id: 1, type: "goal", team_id: HOME, sort_order: 1 },
		{ sm_event_id: 2, type: "pen_shootout_goal", team_id: HOME, sort_order: 2 },
	];
	const rows = buildShootoutTimeline(events, HOME);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].ev.sm_event_id, 2);
});

test("buildShootoutTimeline: sort_order 昇順に並ぶ（順不同入力）", () => {
	const events = [
		{ sm_event_id: 30, type: "pen_shootout_goal", team_id: AWAY, sort_order: 3 },
		{ sm_event_id: 10, type: "pen_shootout_goal", team_id: HOME, sort_order: 1 },
		{ sm_event_id: 20, type: "pen_shootout_goal", team_id: AWAY, sort_order: 2 },
	];
	const rows = buildShootoutTimeline(events, HOME);
	assert.deepEqual(
		rows.map((r) => r.ev.sm_event_id),
		[10, 20, 30],
	);
});

test("buildShootoutTimeline: 全成功交互の累積スコア", () => {
	const events = [
		{ sm_event_id: 1, type: "pen_shootout_goal", team_id: HOME, sort_order: 1 },
		{ sm_event_id: 2, type: "pen_shootout_goal", team_id: AWAY, sort_order: 2 },
		{ sm_event_id: 3, type: "pen_shootout_goal", team_id: HOME, sort_order: 3 },
	];
	const rows = buildShootoutTimeline(events, HOME);
	assert.deepEqual(rows.map((r) => r.running), [
		{ home: 1, away: 0 },
		{ home: 1, away: 1 },
		{ home: 2, away: 1 },
	]);
});

test("buildShootoutTimeline: 失敗ではスコアが増えない", () => {
	const events = [
		{ sm_event_id: 1, type: "pen_shootout_goal", team_id: HOME, sort_order: 1 },
		{ sm_event_id: 2, type: "pen_shootout_miss", team_id: AWAY, sort_order: 2 },
		{ sm_event_id: 3, type: "pen_shootout_miss", team_id: HOME, sort_order: 3 },
		{ sm_event_id: 4, type: "pen_shootout_goal", team_id: AWAY, sort_order: 4 },
	];
	const rows = buildShootoutTimeline(events, HOME);
	assert.deepEqual(rows.map((r) => r.running), [
		{ home: 1, away: 0 },
		{ home: 1, away: 0 },
		{ home: 1, away: 0 },
		{ home: 1, away: 1 },
	]);
});

test("buildShootoutTimeline: 空/PK戦0件は空配列", () => {
	assert.deepEqual(buildShootoutTimeline([], HOME), []);
	assert.deepEqual(
		buildShootoutTimeline([{ sm_event_id: 1, type: "goal", team_id: HOME }], HOME),
		[],
	);
});

test("buildShootoutTimeline: 壊れた入力でも例外なし・カウント不変", () => {
	assert.deepEqual(buildShootoutTimeline(null, HOME), []);
	assert.deepEqual(buildShootoutTimeline(undefined, HOME), []);
	const events = [
		{ sm_event_id: 1, type: "pen_shootout_goal", team_id: null, sort_order: 1 },
		{ sm_event_id: 2, type: "pen_shootout_goal", team_id: HOME, sort_order: 2 },
	];
	const rows = buildShootoutTimeline(events, HOME);
	// team_id=null は home でも away でもないので加算されない
	assert.deepEqual(rows.map((r) => r.running), [
		{ home: 0, away: 0 },
		{ home: 1, away: 0 },
	]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test functions/_lib/shootout.test.js`
Expected: FAIL（`Cannot find module '../../public/lib/shootout.js'` 相当）

- [ ] **Step 3: Write minimal implementation**

`public/lib/shootout.js` を新規作成:

```js
// PK戦（ペナルティシュートアウト）タイムラインの純ロジック（ブラウザ/Node 共有・ESM）。
// 入力は toEventRows（functions/_lib/sm-ingest.js）形のイベント配列。
// 不変条件: 壊れた/欠損入力でも例外を投げず、空配列 or カウント不変で返す。

// PK戦イベントの type（成功/失敗）。通常PK（penalty/missed_penalty）は含めない。
const SHOOTOUT_TYPES = new Set(["pen_shootout_goal", "pen_shootout_miss"]);

export function isShootoutEvent(type) {
	return SHOOTOUT_TYPES.has(type);
}

// events からPK戦のみ抽出→蹴った順にソート→各行に累積スコアを添えて返す。
// 返り値: [{ ev, running: {home, away} }, ...]（蹴った順）。
export function buildShootoutTimeline(events, homeTeamId) {
	const list = Array.isArray(events) ? events : [];
	const kicks = list
		.filter((e) => e && isShootoutEvent(e.type))
		.sort(
			(a, b) =>
				(a.sort_order ?? 0) - (b.sort_order ?? 0) ||
				(a.sm_event_id ?? 0) - (b.sm_event_id ?? 0),
		);
	let home = 0;
	let away = 0;
	return kicks.map((ev) => {
		if (ev.type === "pen_shootout_goal") {
			if (ev.team_id === homeTeamId) home += 1;
			else if (ev.team_id != null) away += 1;
		}
		return { ev, running: { home, away } };
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test functions/_lib/shootout.test.js`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add public/lib/shootout.js functions/_lib/shootout.test.js
git commit -m "feat(detail): PK戦タイムラインの純ロジック buildShootoutTimeline

Claude-Session: https://claude.ai/code/session_01GaZNk2PzDBmKKKQJJTTgEw"
```

---

### Task 2: TimelineTab にPK戦セクションを描画＋ブラウザ配線

**Files:**
- Modify: `public/index.html`（インラインモジュールに import + `window.WC` 公開、`screens-detail.jsx?v=43` → `?v=44`）
- Modify: `public/screens-detail.jsx`（`TimelineTab` = 806-1041 付近）

**Interfaces:**
- Consumes: Task 1 の `window.WC.buildShootoutTimeline(events, homeTeamId)` / `window.WC.isShootoutEvent(type)`。既存 `IcoSoccerBall` / `IcoMissedPen`（同ファイル内）。既存テーマ `T.bg/T.line/T.sub/T.text/T.faint`。`fx.home.pen_score` / `fx.away.pen_score`。
- Produces: なし（UI 末端）。

- [ ] **Step 1: index.html にライブラリを import して window.WC へ公開**

`public/index.html` の ai-analysis.js import 行（97行目付近）の直後に1行追加:

```js
    import { validateDoc, validateTeam, unknownPicks, getTeamAnalysis, hasAnalysis } from './lib/ai-analysis.js';
    import { buildShootoutTimeline, isShootoutEvent } from './lib/shootout.js';
```

そして `Object.assign(window.WC, { ... })` 群の最後（104行目 `autoMatchScorer });` の直後）に1行追加:

```js
    Object.assign(window.WC, { normalize, canonicalKey, resolve, buildAliasMap, upsertAlias, rosterCanonicalSet, autoMatchScorer });
    Object.assign(window.WC, { buildShootoutTimeline, isShootoutEvent });
```

- [ ] **Step 2: index.html の screens-detail.jsx キャッシュバスターをバンプ**

`public/index.html` 141行目:

```
  <script type="text/babel" src="screens-detail.jsx?v=43"></script>
```
を
```
  <script type="text/babel" src="screens-detail.jsx?v=44"></script>
```
に変更。

- [ ] **Step 3: TimelineTab で本編イベントとPK戦を分離**

`public/screens-detail.jsx` の `TimelineTab`。現状 808-810 行:

```jsx
	const events = (detail && detail.events) || [];
	const fx = detail && detail.fixture;
	const homeTeamId = fx && fx.home && fx.home.team_id;
```

の直後に、PK戦の抽出を追加する（`window.WC` フォールバック込み）:

```jsx
	const events = (detail && detail.events) || [];
	const fx = detail && detail.fixture;
	const homeTeamId = fx && fx.home && fx.home.team_id;

	// PK戦（ペナルティシュートアウト）は本編タイムラインから分離して専用セクションで描画する。
	const wc = (typeof window !== "undefined" && window.WC) || {};
	const isShootout = wc.isShootoutEvent || (() => false);
	const shootoutRows = wc.buildShootoutTimeline
		? wc.buildShootoutTimeline(events, homeTeamId)
		: [];
	// 見出しスコア: pen_score があればそれを、無ければ明細の最終累積スコアでフォールバック。
	const penHome = fx && fx.home ? fx.home.pen_score : null;
	const penAway = fx && fx.away ? fx.away.pen_score : null;
	const lastRun = shootoutRows.length
		? shootoutRows[shootoutRows.length - 1].running
		: null;
	const penLabel =
		penHome != null && penAway != null
			? `${penHome}-${penAway}`
			: lastRun
				? `${lastRun.home}-${lastRun.away}`
				: "";
	const showShootout = shootoutRows.length > 0 || penLabel !== "";
```

- [ ] **Step 4: 本編ソートからPK戦を除外**

同 `TimelineTab` 内、現状 877-882 行:

```jsx
	const sorted = [...events].sort(
		(a, b) =>
			(a.minute ?? 0) - (b.minute ?? 0) ||
			(a.extra_minute ?? 0) - (b.extra_minute ?? 0) ||
			(a.sort_order ?? 0) - (b.sort_order ?? 0),
	);
```

を、PK戦を除外するよう変更:

```jsx
	const sorted = [...events]
		.filter((e) => !isShootout(e.type))
		.sort(
			(a, b) =>
				(a.minute ?? 0) - (b.minute ?? 0) ||
				(a.extra_minute ?? 0) - (b.extra_minute ?? 0) ||
				(a.sort_order ?? 0) - (b.sort_order ?? 0),
		);
```

- [ ] **Step 5: 空判定を「本編もPK戦も無い」時のみに変更**

同 `TimelineTab` 内、現状 884 行:

```jsx
	if (sorted.length === 0) {
```
を
```jsx
	if (sorted.length === 0 && !showShootout) {
```
に変更（PK戦だけあって本編0件でも空表示にしない）。

- [ ] **Step 6: 本編タイムラインを条件描画にし、PK戦セクションを追加**

同 `TimelineTab` の `return`。現状 904-1039 行は:

```jsx
	return (
		<div style={{ padding: "14px" }}>
			{/* 中心ライン付き タイムライン */}
			<div style={{ position: "relative" }}>
```
で始まり、`sorted.map(...)` を含む中心線ブロックを `</div>` で閉じ、最後に `</div>` で閉じている。

これを次のように変更する。(a) 本編ブロックを `{sorted.length > 0 && ( ... )}` で包み、(b) その直後にPK戦セクションを追加する。

まず 904-907 行の開始を:

```jsx
	return (
		<div style={{ padding: "14px" }}>
			{/* 中心ライン付き タイムライン（本編。PK戦は除外済み） */}
			{sorted.length > 0 && (
			<div style={{ position: "relative" }}>
```

に変更（`{sorted.length > 0 && (` の行を挿入。以降の中心線ブロックはインデントそのままでよい）。

次に、本編の中心線ブロックを閉じる `</div>`（現状 1038 行、`{sorted.map(...)}` を閉じた直後の `</div>`）の後ろに `)}` を足し、続けてPK戦セクションを挿入する。現状 1037-1040 行:

```jsx
					})}
				</div>
			</div>
		);
	}
```

を、次に置き換える:

```jsx
					})}
				</div>
			)}

			{/* PK戦（ペナルティシュートアウト）専用セクション */}
			{showShootout && (
				<div style={{ marginTop: sorted.length > 0 ? 18 : 0 }}>
					{/* 見出し: ── PK戦 3-2 ── */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							margin: "6px 0 12px",
						}}
					>
						<div style={{ flex: 1, height: 1, background: T.line }} />
						<span
							style={{
								fontSize: 11,
								fontWeight: 800,
								color: T.sub,
								whiteSpace: "nowrap",
							}}
						>
							{penLabel ? `PK戦 ${penLabel}` : "PK戦"}
						</span>
						<div style={{ flex: 1, height: 1, background: T.line }} />
					</div>

					{/* 明細（中心線つき。本編と同じ左右レイアウト） */}
					<div style={{ position: "relative" }}>
						<div
							style={{
								position: "absolute",
								left: "50%",
								top: 4,
								bottom: 4,
								width: 2,
								transform: "translateX(-50%)",
								background: T.line,
							}}
						/>
						{shootoutRows.map(({ ev, running }, i) => {
							const isHome = ev.team_id === homeTeamId;
							const success = ev.type === "pen_shootout_goal";
							const icon = success ? <IcoSoccerBall /> : <IcoMissedPen />;
							const nameStyle = {
								fontWeight: 700,
								color: success ? T.text : T.sub,
							};
							const iconNode = (
								<span style={{ display: "inline-flex", alignItems: "center" }}>
									{icon}
								</span>
							);
							return (
								<div
									key={ev.sm_event_id || `pk-${i}`}
									style={{
										display: "flex",
										alignItems: "center",
										margin: "11px 0",
										fontSize: 12,
										position: "relative",
									}}
								>
									{/* ホーム側 (左) */}
									<div
										style={{
											flex: 1,
											display: "flex",
											alignItems: "center",
											gap: 6,
											justifyContent: "flex-end",
											paddingRight: 38,
											textAlign: "right",
										}}
									>
										{isHome && (
											<>
												<span style={nameStyle}>{ev.player_name}</span>
												{iconNode}
											</>
										)}
									</div>

									{/* 中心: 累積スコア */}
									<span
										style={{
											position: "absolute",
											left: "50%",
											transform: "translateX(-50%)",
											fontSize: 9.5,
											fontWeight: 800,
											color: T.sub,
											background: T.bg,
											padding: "2px 3px",
											minWidth: 32,
											textAlign: "center",
											zIndex: 1,
										}}
									>
										{running.home}-{running.away}
									</span>

									{/* アウェイ側 (右) */}
									<div
										style={{
											flex: 1,
											display: "flex",
											alignItems: "center",
											gap: 6,
											justifyContent: "flex-start",
											paddingLeft: 38,
										}}
									>
										{!isHome && (
											<>
												{iconNode}
												<span style={nameStyle}>{ev.player_name}</span>
											</>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 7: 構文チェック（babel でパースできるか）**

Run: `npx --yes @babel/core@7 --presets @babel/preset-react public/screens-detail.jsx > /dev/null && echo OK`
Expected: `OK`（構文エラーなし）。
※ `@babel/preset-react` が未導入で失敗する場合は代替として `node --check` は JSX 非対応のため使えない。その場合はこの step をスキップし、Step 8 のブラウザ手動確認に委ねる（構文崩れは即座にタイムライン白画面で判明する）。

- [ ] **Step 8: 全テスト＋手動確認の指示を残してコミット**

Run: `npm test`
Expected: 既存全 PASS ＋ Task 1 の shootout.test.js が PASS。

手動確認（開発者が実施）:
- ローカル/preview で任意の試合詳細を開き、通常タイムラインが従来通り表示され、PK戦がある試合でのみ下部に「PK戦 X-Y」セクションが出ること。
- 実PK戦データは R32 以降でのみ発生するため、本番反映後の probe 確認を別途行う（メモリ運用に従う）。

```bash
git add public/index.html public/screens-detail.jsx
git commit -m "feat(detail): タイムラインにPK戦セクション（累積スコア表示）

Claude-Session: https://claude.ai/code/session_01GaZNk2PzDBmKKKQJJTTgEw"
```

---

## Self-Review

**Spec coverage:**
- A 振り分け → Task 1（`isShootoutEvent`）＋ Task 2 Step 4。✓
- B セクション描画（見出し／左右／アイコン／累積チップ） → Task 2 Step 6。✓
- C 蹴った順（sort_order→sm_event_id） → Task 1 実装＋テスト。✓
- D 純粋関数・単一正本・window.WC 公開 → Task 1 ＋ Task 2 Step 1。✓
- E graceful degradation（PK戦なし非表示／スコア先行・明細遅延／例外なし） → Task 1 テスト（壊れ入力）＋ Task 2 Step 3・5（`showShootout`/`penLabel` フォールバック）。✓
- テスト → Task 1 Step 1（7 ケース）。✓
- リリース（?v バンプ／index 配線） → Task 2 Step 1・2。✓

**Placeholder scan:** プレースホルダなし。全コード掲載済み。

**Type consistency:** `buildShootoutTimeline` / `isShootoutEvent` の名称・引数・返り値（`{ ev, running:{home,away} }`）は Task 1 定義と Task 2 参照で一致。`penHome/penAway/penLabel/showShootout/shootoutRows` は Task 2 内で定義→使用が一致。
