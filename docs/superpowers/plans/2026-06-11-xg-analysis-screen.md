# xG分析画面（C′案）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 試合詳細の xGタブを、xG系派生指標（xGoT/xGA/xG差/xG per shot/GK評価）を使い切る5セクションのフル分析ビューへ拡張する。

**Architecture:** 既存 `XgTab`（`public/screens-detail.jsx` 858行〜）の FTゲート（`isFinished` 早期return・commit aa8ab04）を土台に、FT分岐の中身を拡張。新データは既存 `foldStats(detail.stats)` から type_id で引く（新ヘルパ/新モジュール無し・DRY）。xGoT依存層は値が無ければ節ごと非描画（graceful degradation）。まず**frontend完結**で組み、xG系が `xgfixture` 経由でしか来ない場合のみ後追いで ingest 拡張。

**Tech Stack:** ブラウザ素 JSX（Babel UMD・ビルド無し）/ Cloudflare Pages Functions / D1(SQLite) / テスト=`node --test`（backendのみ）＋Playwright ハーネス（frontend）。

**設計正本:** `docs/superpowers/specs/2026-06-11-xg-analysis-screen-design.md`

---

## File Structure

- **Modify**: `public/screens-detail.jsx` — `XgTab`（858行〜）の FT分岐を拡張。直前に `XgShotQuality`/`XgGkValue` のインライン関数コンポーネントを追加。
- **Modify**: `public/index.html` — `screens-detail.jsx?v=N` をインクリメント。
- **Create (dev専用)**: `db/seed-xg-analysis.sql` — FT試合＋xG系フル/部分/欠如の検証用 seed。
- **Throwaway**: `public/_detail-harness.html` — 目視確認用（確認後削除・コミットしない）。
- **既存維持**: `foldStats`（710行）/`PlayerXgBar`（455行）/`MirrorBar` を再利用。

データ前提（`detail` の形）:
- `detail.fixture.home.xg` / `.away.xg` = base xG（`sm_fixtures.home_xg/away_xg`、`null` 可）
- `detail.fixture.home.score` / `.away.score` / `.team_id` / `.app_code` / `.name`
- `detail.fixture.status` = `"NS" | "LIVE" | "FT"`
- `detail.stats` = `[{ type_id, team_id, value }]`（`sm_stats` 全行）。xGoT=5305 / シュート=42 / 枠内=86 / xGA=9687
- `detail.lineups` = `[{ team_id, player_name, xg, ... }]`

---

## Task 1: 検証用 seed（FT＋xG系フル）

**Files:**
- Create: `db/seed-xg-analysis.sql`

xGoT/xGA/shots を含む FT試合を1つ作る。fixture_id=9100001。既存 `seed-detail-sample.sql`(9000001) と衝突しない番号。

- [ ] **Step 1: seed を書く**

```sql
-- dev専用: xG分析画面の検証用 FT試合（本番投入しない）
-- Brazil(home) 2-1 Morocco(away)。base xG + xGoT(5305) + shots(42)/枠内(86) + 選手xG。
-- 全テーブル updated_at は NOT NULL。INSERT OR REPLACE で冪等にする（既存seed慣習）。
DELETE FROM sm_stats   WHERE sm_fixture_id = 9100001;
DELETE FROM sm_lineups WHERE sm_fixture_id = 9100001;
DELETE FROM sm_fixtures WHERE sm_fixture_id = 9100001;

INSERT OR REPLACE INTO sm_fixtures
  (sm_fixture_id, starting_at, starting_at_ts, state_id, round_name, result_info,
   home_team_id, home_score, home_xg, away_team_id, away_score, away_xg, updated_at)
VALUES
  (9100001, '2026-06-20 19:00:00', 1782370800, 5, 'Group F', 'Brazil won',
   3, 2, 2.34, 7, 1, 0.88, 1782370800);   -- state_id=5 → FT

-- チーム統計（縦持ち）: type_id 42=シュート 86=枠内 5305=xGoT 45=支配率
INSERT OR REPLACE INTO sm_stats (sm_fixture_id, team_id, type_id, value, updated_at) VALUES
  (9100001, 3, 42, 15, 1782370800), (9100001, 7, 42, 8, 1782370800),     -- シュート
  (9100001, 3, 86, 7, 1782370800),  (9100001, 7, 86, 3, 1782370800),     -- 枠内
  (9100001, 3, 5305, 1.95, 1782370800), (9100001, 7, 5305, 0.62, 1782370800), -- xGoT
  (9100001, 3, 45, 58, 1782370800), (9100001, 7, 45, 42, 1782370800);    -- 支配率

-- 選手別xG（home上位）
INSERT OR REPLACE INTO sm_lineups
  (sm_fixture_id, team_id, player_id, player_name, jersey_number, position, formation_field, is_start, xg, updated_at)
VALUES
  (9100001, 3, 101, 'Vinícius Jr', 7, 'attacker', '4:1', 1, 0.71, 1782370800),
  (9100001, 3, 102, 'Rodrygo',     10, 'attacker', '4:2', 1, 0.54, 1782370800),
  (9100001, 7, 201, 'En-Nesyri',   19, 'attacker', '4:1', 1, 0.40, 1782370800);
```

> ⚠️ 全テーブルに `updated_at INTEGER NOT NULL` がある（省略すると INSERT 失敗）。列定義は `db/schema-watch.sql:21-106`（sm_fixtures/sm_stats/sm_lineups）。team_id=3/7 はローカルD1の `sm_teams` に実在する id へ合わせる（`seed-team-map` 投入済みなら任意の実在 team_id を使う）。

- [ ] **Step 2: ローカルD1へ適用して読めるか確認**

Run:
```bash
wrangler d1 execute wcup2026-db --local --file db/schema-watch.sql
wrangler d1 execute wcup2026-db --local --file db/seed-xg-analysis.sql
wrangler d1 execute wcup2026-db --local --command "SELECT type_id,team_id,value FROM sm_stats WHERE sm_fixture_id=9100001 ORDER BY type_id;"
```
Expected: 5305/42/86/45 の行が home/away 分（8行）返る。

- [ ] **Step 3: Commit**

```bash
git add db/seed-xg-analysis.sql
git commit -m "test(detail): xG分析画面の検証用seed(FT+xGoT+shots)"
```

---

## Task 2: ① チームxGサマリーに xGoT / xGA / xG差 を追加

**Files:**
- Modify: `public/screens-detail.jsx`（`XgTab` の setup 部 869行付近、render の 2分割バー直後 1007行付近）

セクション1の 2分割バーの下に「xGoT / 被xG(xGA) / xG差」のミニグリッドを追加。値は `foldStats` から引き、xGA は相手xGから導出（9687があれば優先）。

- [ ] **Step 1: setup に派生値を追加**（`homeTeamId`/`awayTeamId` 定義の直後、869行付近）

```jsx
	// xG系派生（foldStats を再利用。null は描画側で畳む）
	const xgStatsByType = foldStats((detail && detail.stats) || [], homeTeamId, awayTeamId);
	const pick = (tid, side) => {
		const p = xgStatsByType[tid];
		return p && p[side] != null ? p[side] : null;
	};
	// xGoT: 5305（無ければ null）
	const homeXgot = pick(5305, "home");
	const awayXgot = pick(5305, "away");
	// 被xG(xGA): 9687 を優先、無ければ相手の base xG で導出
	const homeXga = pick(9687, "home") != null ? pick(9687, "home") : awayXg;
	const awayXga = pick(9687, "away") != null ? pick(9687, "away") : homeXg;
	// xG差（base xG 同士）
	const xgDiff =
		homeXg != null && awayXg != null ? homeXg - awayXg : null;
	const fmtXg = (v) => (v != null ? v.toFixed(2) : "–");
```

- [ ] **Step 2: 2分割バー直後（1007行 `</div>` の後、セクション2の前）にミニグリッドを挿入**

```jsx
				{/* xGoT / 被xG / xG差 ミニグリッド（値がある列だけ） */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-around",
						marginTop: 11,
						gap: 8,
						fontSize: 10,
						color: T.sub,
						textAlign: "center",
					}}
				>
					{(homeXgot != null || awayXgot != null) && (
						<div>
							<div style={{ fontWeight: 800, color: T.text, fontSize: 12 }}>
								{fmtXg(homeXgot)} / {fmtXg(awayXgot)}
							</div>
							<div>xGoT（枠内）</div>
						</div>
					)}
					{(homeXga != null || awayXga != null) && (
						<div>
							<div style={{ fontWeight: 800, color: T.text, fontSize: 12 }}>
								{fmtXg(homeXga)} / {fmtXg(awayXga)}
							</div>
							<div>被xG</div>
						</div>
					)}
					{xgDiff != null && (
						<div>
							<div style={{ fontWeight: 800, color: T.text, fontSize: 12 }}>
								{xgDiff > 0 ? "+" : ""}{xgDiff.toFixed(2)}
							</div>
							<div>xG差</div>
						</div>
					)}
				</div>
```

- [ ] **Step 3: ハーネスで目視**（Task 6 の手順で `?fx=9100001`）

Expected: xGoT「1.95 / 0.62」、被xG「0.88 / 2.34」、xG差「+1.46」が表示される。

- [ ] **Step 4: Commit**

```bash
git add public/screens-detail.jsx
git commit -m "feat(detail): xGサマリーに xGoT/被xG/xG差 を追加(値があれば)"
```

---

## Task 3: ② 効率欄に「xGoT−xG」決定力の一文を追加

**Files:**
- Modify: `public/screens-detail.jsx`（`XgTab`・effLabel 付近 911行 と 効率欄 render 1048行付近）

xGoT が xG を上回るほど「枠内に良い形で持ち込めた（決定機の質が高い）」。xGoT があるときだけ一文を追記。

- [ ] **Step 1: 文言ヘルパを setup に追加**（effLabel 直後 911行付近）

```jsx
	// 決定力（xGoT−xG）: xGoT が無いチームは null
	function finishingNote(xg, xgot) {
		if (xg == null || xgot == null) return null;
		const d = xgot - xg;
		if (d > 0.3) return "枠内に良い形で持ち込んだ";
		if (d < -0.3) return "枠を捉えきれず";
		return null;
	}
	const homeFinish = finishingNote(homeXg, homeXgot);
	const awayFinish = finishingNote(awayXg, awayXgot);
```

- [ ] **Step 2: 効率欄の各 span（homeEff / awayEff ブロック）に追記**

home 側（1031行 `{homeEff && (...)}` の直後）:
```jsx
							{homeFinish && (
								<span style={{ display: "block", fontSize: 10, marginTop: 1, color: T.faint }}>
									{homeFinish}
								</span>
							)}
```
away 側（1043行 `{awayEff && (...)}` の直後）に同様（`awayFinish` を使う）:
```jsx
							{awayFinish && (
								<span style={{ display: "block", fontSize: 10, marginTop: 1, color: T.faint }}>
									{awayFinish}
								</span>
							)}
```

- [ ] **Step 3: ハーネス目視**

Expected: home（xG2.34→xGoT1.95、差-0.39）で「枠を捉えきれず」。away は差そのまま閾値内なら非表示。

- [ ] **Step 4: Commit**

```bash
git add public/screens-detail.jsx
git commit -m "feat(detail): 効率欄に決定力(xGoT-xG)の一文を追加"
```

---

## Task 4: ③ シュートの質（xG per shot）節を新設

**Files:**
- Modify: `public/screens-detail.jsx`（`XgTab` 直前にインライン関数コンポーネント追加、セクション3の前に挿入）

シュート1本あたりのxG＝そのチームの好機の質。`shots`=42、xG=base。0除算ガード必須。

- [ ] **Step 1: `XgShotQuality` を `function XgTab(` の直前（858行の前）に追加**

```jsx
// ③ シュートの質: xG per shot（= xG / シュート数）。shots か xG が欠ければ非表示。
function XgShotQuality({ T, homeName, awayName, homeXg, awayXg, homeShots, awayShots }) {
	const perShot = (xg, shots) =>
		xg != null && shots != null && shots > 0 ? xg / shots : null;
	const h = perShot(homeXg, homeShots);
	const a = perShot(awayXg, awayShots);
	if (h == null && a == null) return null;
	const cell = (label, v, sub) => (
		<div style={{ flex: 1, textAlign: "center" }}>
			<div style={{ fontSize: 9.5, color: T.sub }}>{label}</div>
			<div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>
				{v != null ? v.toFixed(2) : "–"}
			</div>
			<div style={{ fontSize: 9, color: T.faint }}>{sub}</div>
		</div>
	);
	return (
		<div
			style={{
				display: "flex",
				gap: 8,
				padding: "11px 12px",
				background: T.card,
				borderRadius: 12,
				border: `1px solid ${T.line}`,
				marginBottom: 14,
			}}
		>
			{cell(homeName, h, `${homeShots != null ? homeShots : "–"}本`)}
			<div style={{ alignSelf: "center", fontSize: 9.5, color: T.sub }}>xG / シュート</div>
			{cell(awayName, a, `${awayShots != null ? awayShots : "–"}本`)}
		</div>
	);
}
```

- [ ] **Step 2: setup で shots を引く**（Task 2 の `pick` を使い、869行付近に追記）

```jsx
	const homeShots = pick(42, "home");
	const awayShots = pick(42, "away");
```

- [ ] **Step 3: セクション3（選手別xG・1052行 `{hasPlayerXg && (` の直前）に挿入**

```jsx
				<XgShotQuality
					T={T}
					homeName={homeName}
					awayName={awayName}
					homeXg={homeXg}
					awayXg={awayXg}
					homeShots={homeShots}
					awayShots={awayShots}
				/>
```

- [ ] **Step 4: ハーネス目視**

Expected: home 2.34/15=0.16・「15本」、away 0.88/8=0.11・「8本」。shots 欠如 seed では節ごと消える。

- [ ] **Step 5: Commit**

```bash
git add public/screens-detail.jsx
git commit -m "feat(detail): シュートの質(xG per shot)節を追加"
```

---

## Task 5: ④ GK評価（防いだ失点）節を新設【xGoT依存】

**Files:**
- Modify: `public/screens-detail.jsx`（`XgShotQuality` の隣にインライン追加、③の後に挿入）

「相手のxGoT − 自分が喫した失点」＝GKが防いだ失点の目安。xGoT が無ければ `null` を返し非描画。

- [ ] **Step 1: `XgGkValue` を追加（`XgShotQuality` の直後）**

```jsx
// ④ GK評価: 防いだ失点 ≒ 相手xGoT − 失点。xGoT が無ければ null（節ごと非表示）。
function XgGkValue({ T, homeName, awayName, homeXgot, awayXgot, homeScore, awayScore }) {
	// home GK は away の攻撃（awayXgot）に対峙し、失点は awayScore
	const homeSaved =
		awayXgot != null && awayScore != null ? awayXgot - awayScore : null;
	const awaySaved =
		homeXgot != null && homeScore != null ? homeXgot - homeScore : null;
	if (homeSaved == null && awaySaved == null) return null;
	const cell = (teamName, saved) => (
		<div style={{ flex: 1, textAlign: "center" }}>
			<div style={{ fontSize: 9.5, color: T.sub }}>{teamName} GK</div>
			<div
				style={{
					fontSize: 16,
					fontWeight: 800,
					color: saved != null && saved > 0 ? T.accent : T.text,
				}}
			>
				{saved != null ? (saved > 0 ? "+" : "") + saved.toFixed(2) : "–"}
			</div>
			<div style={{ fontSize: 9, color: T.faint }}>防いだ失点</div>
		</div>
	);
	return (
		<div
			style={{
				display: "flex",
				gap: 8,
				padding: "11px 12px",
				background: T.card,
				borderRadius: 12,
				border: `1px solid ${T.line}`,
				marginBottom: 14,
			}}
		>
			{cell(homeName, homeSaved)}
			<div style={{ alignSelf: "center", fontSize: 9.5, color: T.sub }}>GK評価</div>
			{cell(awayName, awaySaved)}
		</div>
	);
}
```

- [ ] **Step 2: ③の挿入箇所の直後に節を追加**

```jsx
				<XgGkValue
					T={T}
					homeName={homeName}
					awayName={awayName}
					homeXgot={homeXgot}
					awayXgot={awayXgot}
					homeScore={homeScore}
					awayScore={awayScore}
				/>
```

- [ ] **Step 3: ハーネス目視（フル seed と xGoT欠如 seed の2回）**

Expected（フル）: home GK = awayXgot0.62 − 失点1 = 「-0.38」、away GK = homeXgot1.95 − 失点2 = 「-0.05」。
Expected（xGoT欠如 seed: 5305行を削除）: ④節が**丸ごと消える**（プレースホルダも出ない）。

- [ ] **Step 4: Commit**

```bash
git add public/screens-detail.jsx
git commit -m "feat(detail): GK評価(防いだ失点)節を追加(xGoTがある時のみ)"
```

---

## Task 6: degradation 検証 ＋ ?v バンプ

**Files:**
- Modify: `public/index.html`（`screens-detail.jsx?v=N` を +1）
- Throwaway: `public/_detail-harness.html`（確認後削除）

3状態 × 3データパターンで「壊れない」ことを確認する。

- [ ] **Step 1: 使い捨てハーネスを作る**

`public/_detail-harness.html` を React18 UMD + Babel + `data.js` + `ui.jsx` + `screens-detail.jsx` で組み、`window.WC.fetchFixtureDetail` を seed相当のJSONで stub するか、ローカルD1＋`/api/fixture?id=9100001` を読む。`?fx=9100001` で `MatchDetailScreen` を描画。（既存 PR #6 の `_mock-demo.html` 方式を踏襲）

- [ ] **Step 2: dev サーバ＋ローカルD1で起動**

Run:
```bash
wrangler d1 execute wcup2026-db --local --file db/seed-xg-analysis.sql
wrangler pages dev public --port 8799
```
（8788 は別アプリ常駐のため 8799）

- [ ] **Step 3: Playwright で3パターン目視**（`service_workers="block"` 必須）

1. **フル**（seed そのまま・FT）: ①xGoT/被xG/xG差、②決定力文、③xG/shot、④GK評価、⑤選手別xG が全表示。
2. **xGoT欠如**: `DELETE FROM sm_stats WHERE sm_fixture_id=9100001 AND type_id=5305;` → ①xGoTセルと②決定力文と④節が消え、xG/被xG/xG差/③/⑤は残る。レイアウト崩れ無し。
3. **xG全欠如**（NS/LIVE）: fixture を `state_id=1`(NS) に更新 → 既存プレースホルダ「xGデータは試合後に表示されます」。
   ```bash
   wrangler d1 execute wcup2026-db --local --command "UPDATE sm_fixtures SET state_id=1 WHERE sm_fixture_id=9100001;"
   ```

Expected: 各パターンでコンソールエラー無し・レイアウト健全。

- [ ] **Step 4: ハーネス削除＋?v バンプ＋既存テスト**

Run:
```bash
rm public/_detail-harness.html
npm test
```
Expected: 既存テスト（286+）緑。`public/index.html` の `screens-detail.jsx?v=N` を +1。

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "chore(detail): xG分析画面 ?v バンプ"
```

---

## Task 7: 開幕後データ確認（マイルストーン・実データ依存）

**Files:**
- 参照: `scripts/sportmonks-xgot-probe.sh`
- 条件付き Modify: `functions/_lib/sm-ingest.js`（`xgFor` 拡張）/ `functions/_lib/sm-ingest.test.js`

2026の試合がFTになったら実データで xG系の所在を確定する。**frontendは既に degradation で安全**なので、これはブロッキングではなく確認＋必要時のみ backend 追加。

- [ ] **Step 1: 実 fixture で所在確認**

Run（FTになった2026 fixture id を使う）:
```bash
SPORTMONKS_TOKEN=$(grep '^SPORTMONKS_TOKEN=' .dev.vars | cut -d= -f2- | tr -d '\n\r') \
  bash scripts/sportmonks-xgot-probe.sh <FT_fixture_id>
```
判定:
- **A) statistics に 5305 あり** → backend改修**不要**。`sm_stats` 経由で既にフロント到達。Task 7 完了。
- **B) xgfixture にのみ xG系あり** → Step 2 へ（ingest 拡張）。

- [ ] **Step 2（Bのみ）: `xgFor` を xG-family 収集に拡張（TDD）**

`functions/_lib/sm-ingest.test.js` に「xgfixture の 5305/9687 を sm_stats 行として出力する」テストを先に書き（RED）、`toStatRows` か新関数で xgfixture 由来の xG系を `sm_stats` 相当へ流す実装（GREEN）。`node --test` で確認。その後 `worker-watch` 再デプロイ。

- [ ] **Step 3: 本番目視**

本番でFT試合の xGタブを開き、xGoT依存層（①xGoTセル/②決定力/④GK評価）が点灯することを確認。点かない指標は degradation で畳まれていること（壊れない）を確認。

---

## Self-Review 結果

- **Spec coverage**: §3.3の各セクション→Task2(①)/Task3(②)/Task4(③)/Task5(④)、⑤は変更不要(白線未実装)、§3.4状態→既存FTゲート+Task6、§4 degradation→各Taskのrender-if+Task6、§7→Task7。網羅。
- **Placeholder scan**: 無し（全Stepに実コード/実コマンド）。
- **Type consistency**: `pick(tid, side)`/`foldStats` 戻り `{home,away}`/`homeXgot`/`homeShots` を全Taskで一貫使用。`XgShotQuality`/`XgGkValue` の props 名は呼び出しと一致。
