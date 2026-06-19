# グループ突破/敗退の数学的確定（クリンチ）表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** グループステージ進行中に数学的に確定したチームを、結果タブの順位表に「確定バッジ」、トーナメント表に確定枠の実チーム名として表示する。

**Architecture:** 純ロジック関数 `computeClinchStatus`（残り試合の全 W/D/L シナリオ列挙による勝点ベース保守判定）を `public/lib/standings.js` に追加。これを①順位表UI（バッジ）と②実結果ブラケット（確定順位スロット）で再利用する。DB/API変更なし。

**Tech Stack:** Vanilla ESM（`public/lib/*.js`）、React via Babel（`public/*.jsx`）、テストは `node --test`。

## Global Constraints

- 確定判定は**勝点ベースの保守判定**。同点は「タイブレーク負け」とみなし、確定と表示したものは必ず正しいことを保証する。
- **FT 試合のみ決着済み**として扱う。LIVE・未開催は「残り試合（未確定）」扱い。
- 既存の純ロジック規約に従う: `public/lib/standings.js` は副作用なしESM、`isNum`/`generateFixtures` を再利用。
- jsx を変更したら `public/index.html` の該当 `?v=N` をインクリメント（デプロイ運用ルール）。
- スコープ外: 3位通過枠の確定判定、GD依存の確定、採点ロジックへの変更。

---

### Task 1: `computeClinchStatus`（クリンチ判定の純ロジック）

**Files:**
- Modify: `public/lib/standings.js`（末尾に追記、既存 `generateFixtures`/`isNum` を再利用）
- Test: `functions/_lib/clinch.test.js`（新規。`../../public/lib/standings.js` から import）

**Interfaces:**
- Consumes: `generateFixtures(members)`, `isNum(v)`（同一モジュール内の既存関数）
- Produces:
  - `computeClinchStatus(members: string[], matches: {a,b,ga,gb,status}[]): { [code]: { qualified: boolean, won: boolean, eliminated: boolean, secondLocked: boolean } }`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/clinch.test.js` を新規作成:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeClinchStatus } from "../../public/lib/standings.js";

const ft = (a, b, ga, gb) => ({ a, b, ga, gb, status: "FT" });

test("全試合FT: 1位確定・2位確定・敗退確定が正しく出る", () => {
	// W>X>Y>Z（W全勝, X はY,Zに勝ち, YはZに勝ち）
	const members = ["W", "X", "Y", "Z"];
	const matches = [
		ft("W", "X", 1, 0),
		ft("W", "Y", 1, 0),
		ft("W", "Z", 1, 0),
		ft("X", "Y", 1, 0),
		ft("X", "Z", 1, 0),
		ft("Y", "Z", 1, 0),
	];
	const s = computeClinchStatus(members, matches);
	assert.deepEqual(s.W, { qualified: true, won: true, eliminated: false, secondLocked: false });
	assert.deepEqual(s.X, { qualified: true, won: false, eliminated: false, secondLocked: true });
	assert.equal(s.Y.eliminated, true);
	assert.equal(s.Z.eliminated, true);
});

test("2節終了で首位は突破確定だが1位/2位未確定（保守）", () => {
	// 2節: W6(勝勝), X3, Y3, Z0。残り W-Z, X-Y。
	const members = ["W", "X", "Y", "Z"];
	const matches = [
		ft("W", "X", 1, 0),
		ft("Y", "Z", 1, 0),
		ft("W", "Y", 1, 0),
		ft("X", "Z", 1, 0),
	];
	const s = computeClinchStatus(members, matches);
	assert.equal(s.W.qualified, true); // 2位以内は確定
	assert.equal(s.W.won, false); // X が6で並びうる→1位確定にしない
	assert.equal(s.W.secondLocked, false);
	assert.equal(s.Z.eliminated, true); // 最大3、上に常時2チーム
});

test("1試合のみFTでは誰もクリンチしない（保守）", () => {
	const members = ["W", "X", "Y", "Z"];
	const matches = [ft("W", "X", 1, 0)];
	const s = computeClinchStatus(members, matches);
	for (const c of members) {
		assert.equal(s[c].qualified, false);
		assert.equal(s[c].won, false);
		assert.equal(s[c].eliminated, false);
	}
});

test("LIVE試合は未確定（残り）扱い", () => {
	const members = ["W", "X", "Y", "Z"];
	// W が X に LIVE で 5-0 でも確定に使わない
	const matches = [
		{ a: "W", b: "X", ga: 5, gb: 0, status: "LIVE" },
		ft("W", "Y", 1, 0),
		ft("W", "Z", 1, 0),
	];
	const s = computeClinchStatus(members, matches);
	// W は FT 2勝=6点だが X-W が未確定のため X も最大6到達可→1位確定にしない
	assert.equal(s.W.won, false);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test functions/_lib/clinch.test.js`
Expected: FAIL（`computeClinchStatus is not a function` / import エラー）

- [ ] **Step 3: 最小実装を追加**

`public/lib/standings.js` の末尾（`provisionalGroupResult` の後）に追記:

```js
// FT のみ決着済み。LIVE/未開催は残り（未確定）扱い。
function isSettled(m) {
	return m && m.status === "FT" && isNum(m.ga) && isNum(m.gb);
}
const _pairKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);

// members（最大4）と matches から各チームの突破/敗退クリンチ状態を返す。
// 残り試合（FT以外）の全 W/D/L シナリオ（3^n, n≤6）を列挙する勝点ベースの保守判定。
// 同点は「上位候補（>=）」として数え、確定と判定したものは必ず正しい。
// 返り値: { [code]: { qualified, won, eliminated, secondLocked } }
//   qualified    : 2位以内確定（突破確定）
//   won          : 単独1位確定
//   eliminated   : 2位以内不可能（敗退確定）
//   secondLocked : ちょうど2位で確定（ブラケットA2配置用）
export function computeClinchStatus(members = [], matches = []) {
	const teams = (members || []).filter(Boolean);
	const out = {};
	for (const c of teams)
		out[c] = { qualified: false, won: false, eliminated: false, secondLocked: false };
	if (teams.length < 2) return out;

	// 決着済み試合の確定勝点
	const basePts = {};
	for (const c of teams) basePts[c] = 0;
	const settled = new Set();
	for (const m of matches || []) {
		if (!isSettled(m)) continue;
		if (!(m.a in basePts) || !(m.b in basePts)) continue;
		settled.add(_pairKey(m.a, m.b));
		if (m.ga > m.gb) basePts[m.a] += 3;
		else if (m.ga < m.gb) basePts[m.b] += 3;
		else {
			basePts[m.a] += 1;
			basePts[m.b] += 1;
		}
	}

	// 残り試合 = 全ペアリング − 決着済み
	const remaining = generateFixtures(teams).filter(
		(p) => !settled.has(_pairKey(p.a, p.b)),
	);

	const agg = {};
	for (const c of teams) agg[c] = { maxGe: 0, minGt: Infinity };

	const n = remaining.length;
	const total = 3 ** n;
	for (let s = 0; s < total; s++) {
		const pts = { ...basePts };
		let x = s;
		for (let i = 0; i < n; i++) {
			const o = x % 3;
			x = (x / 3) | 0;
			const { a, b } = remaining[i];
			if (o === 0) pts[a] += 3; // home勝
			else if (o === 2) pts[b] += 3; // away勝
			else {
				pts[a] += 1; // 引分
				pts[b] += 1;
			}
		}
		for (const c of teams) {
			let ge = 0;
			let gt = 0;
			for (const d of teams) {
				if (d === c) continue;
				if (pts[d] >= pts[c]) ge++;
				if (pts[d] > pts[c]) gt++;
			}
			if (ge > agg[c].maxGe) agg[c].maxGe = ge;
			if (gt < agg[c].minGt) agg[c].minGt = gt;
		}
	}

	for (const c of teams) {
		const a = agg[c];
		if (a.minGt === Infinity) a.minGt = 0;
		out[c].qualified = a.maxGe <= 1; // 全シナリオで自分以上が1以下→top2確定
		out[c].won = a.maxGe === 0; // 全シナリオで自分以上が0→単独1位確定
		out[c].eliminated = a.minGt >= 2; // 全シナリオで自分超が2以上→top2不可
		out[c].secondLocked = out[c].qualified && a.minGt >= 1; // top2確定かつ常時1チーム上→ちょうど2位
	}
	return out;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test functions/_lib/clinch.test.js`
Expected: PASS（4 tests）

- [ ] **Step 5: 既存テストの回帰確認**

Run: `npm test`
Expected: 既存 `standings.test.js` 含め全 PASS

- [ ] **Step 6: コミット**

```bash
git add public/lib/standings.js functions/_lib/clinch.test.js
git commit -m "feat(clinch): グループ突破/敗退の数学的クリンチ判定 computeClinchStatus を追加

Claude-Session: https://claude.ai/code/session_01NMCP5bWgxEYFeCVqamFb4h"
```

---

### Task 2: `computeAllClinch` と `clinchGroupRank`（全グループ集計とブラケット用順位）

**Files:**
- Modify: `public/lib/standings.js`（Task 1 の関数の後に追記）
- Test: `functions/_lib/clinch.test.js`（Task 1 のファイルに追記）

**Interfaces:**
- Consumes: `computeClinchStatus`（Task 1）
- Produces:
  - `computeAllClinch(groups: {[g]:string[]}, groupMatches: {[g]:match[]}): { [g]: { [code]: status } }`
  - `clinchGroupRank(groups, groupMatches, base: {[g]:string[]}): { [g]: [first|null, second|null, null] }`
    - `base`（GROUP_RESULT。全試合確定後の最終順位）に値があればそのグループは base 優先。

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/clinch.test.js` の末尾に追記:

```js
import {
	computeAllClinch,
	clinchGroupRank,
} from "../../public/lib/standings.js";

test("computeAllClinch はグループ毎に状態を返す", () => {
	const groups = { A: ["W", "X", "Y", "Z"] };
	const gm = {
		A: [
			ft("W", "X", 1, 0),
			ft("W", "Y", 1, 0),
			ft("W", "Z", 1, 0),
			ft("X", "Y", 1, 0),
			ft("X", "Z", 1, 0),
			ft("Y", "Z", 1, 0),
		],
	};
	const all = computeAllClinch(groups, gm);
	assert.equal(all.A.W.won, true);
	assert.equal(all.A.X.secondLocked, true);
});

test("clinchGroupRank は確定枠のみ埋める", () => {
	const groups = { A: ["W", "X", "Y", "Z"], B: ["P", "Q", "R", "S"] };
	const gm = {
		A: [
			ft("W", "X", 1, 0),
			ft("W", "Y", 1, 0),
			ft("W", "Z", 1, 0),
			ft("X", "Y", 1, 0),
			ft("X", "Z", 1, 0),
			ft("Y", "Z", 1, 0),
		],
		B: [], // 未消化
	};
	const rank = clinchGroupRank(groups, gm, {});
	assert.deepEqual(rank.A, ["W", "X", null]); // 1位/2位確定
	assert.deepEqual(rank.B, [null, null, null]); // 確定なし
});

test("clinchGroupRank は base(GROUP_RESULT) を優先する", () => {
	const groups = { A: ["W", "X", "Y", "Z"] };
	const gm = { A: [] };
	const base = { A: ["Y", "Z", "W"] };
	const rank = clinchGroupRank(groups, gm, base);
	assert.deepEqual(rank.A, ["Y", "Z", "W"]);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test functions/_lib/clinch.test.js`
Expected: FAIL（`computeAllClinch is not a function`）

- [ ] **Step 3: 最小実装を追加**

`public/lib/standings.js` の `computeClinchStatus` の後に追記:

```js
// 全グループのクリンチ状態を一括算出。
// 返り値: { [g]: { [code]: {qualified, won, eliminated, secondLocked} } }
export function computeAllClinch(groups = {}, groupMatches = {}) {
	const out = {};
	for (const g of Object.keys(groups || {})) {
		out[g] = computeClinchStatus(
			(groups[g] || []).filter(Boolean),
			(groupMatches || {})[g] || [],
		);
	}
	return out;
}

// ブラケット用：確定スロットのみ埋めた groupRank を返す。
// base[g]（GROUP_RESULT。全試合確定後の最終順位）に値があればそれを優先、
// 無ければクリンチ判定で 1位確定→[0]、2位確定→[1] のみ埋める（3位は常に null）。
// 返り値: { [g]: [first|null, second|null, null] }
export function clinchGroupRank(groups = {}, groupMatches = {}, base = {}) {
	const out = {};
	const clinch = computeAllClinch(groups, groupMatches);
	for (const g of Object.keys(groups || {})) {
		const b = (base || {})[g];
		if (Array.isArray(b) && b.filter(Boolean).length) {
			out[g] = b.slice();
			continue;
		}
		const st = clinch[g] || {};
		let first = null;
		let second = null;
		for (const c of Object.keys(st)) {
			if (st[c].won) first = c;
			else if (st[c].secondLocked) second = c;
		}
		out[g] = [first, second, null];
	}
	return out;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test functions/_lib/clinch.test.js`
Expected: PASS（7 tests）

- [ ] **Step 5: コミット**

```bash
git add public/lib/standings.js functions/_lib/clinch.test.js
git commit -m "feat(clinch): computeAllClinch と clinchGroupRank を追加

Claude-Session: https://claude.ai/code/session_01NMCP5bWgxEYFeCVqamFb4h"
```

---

### Task 3: `window.WC` 配線と順位表バッジ表示

**Files:**
- Modify: `public/index.html:91`（import 行）, `public/index.html:101`（Object.assign 行）, `public/index.html:134`（screens-group.jsx の `?v` バンプ）
- Modify: `public/screens-group.jsx`（`LeagueTables` の `Card` 内に確定バッジ）

**Interfaces:**
- Consumes: `window.WC.computeClinchStatus`（Task 1）
- Produces: 順位表行に確定バッジ（UI、自動テストなし→手動確認）

- [ ] **Step 1: lib 関数を `window.WC` に公開する**

`public/index.html:91` を編集:

```js
    import { generateFixtures, computeStandings, provisionalGroupResult, computeClinchStatus, computeAllClinch, clinchGroupRank } from './lib/standings.js';
```

`public/index.html:101` の `Object.assign(window.WC, { ... })` に `computeClinchStatus, computeAllClinch, clinchGroupRank` を追加:

```js
    Object.assign(window.WC, { BRACKET_STRUCTURE, WILDCARD_SLOTS, PERMITTED, deriveKnockout, deriveKnockoutFromSets, deriveKnockoutAuto, resolveThirdAssign, THIRD_ALLOCATION, thirdAllocation, SCORING, generateFixtures, computeStandings, provisionalGroupResult, computeClinchStatus, computeAllClinch, clinchGroupRank });
```

- [ ] **Step 2: `Card` 内でクリンチ状態を算出**

`public/screens-group.jsx` の `Card` コンポーネント先頭（`const rows = standingsByGroup[k];` の直後、`public/screens-group.jsx:296` 付近）に追記:

```jsx
		const clinch = window.WC.computeClinchStatus
			? window.WC.computeClinchStatus(members, matches[k] || [])
			: {};
```

- [ ] **Step 3: 行に確定バッジを挿入**

`public/screens-group.jsx` の `rows.map((r, i) => {` ブロック内、`const adv = isAdvancing(k, i);`（`public/screens-group.jsx:385` 付近）の直後にバッジ定義を追加:

```jsx
									const cs = clinch[r.code] || {};
									const badge = cs.won
										? { t: "1位確定", c: T.gold }
										: cs.qualified
											? { t: "突破", c: ADV_GREEN }
											: cs.eliminated
												? { t: "敗退", c: T.faint }
												: null;
```

同ブロック内の「チーム名 span」（`{tm.ja}` を含む `<span onClick={() => setDetailCode(r.code)} ...>` 要素。`public/screens-group.jsx:417-431` 付近）の**直後**（勝点 span の前）にバッジ要素を挿入:

```jsx
										{badge && (
											<span
												style={{
													flexShrink: 0,
													fontFamily: "Archivo",
													fontWeight: 900,
													fontSize: 9,
													lineHeight: 1,
													padding: "2px 5px",
													borderRadius: 6,
													color: badge.c,
													background: badge.c + "22",
												}}
											>
												{badge.t}
											</span>
										)}
```

- [ ] **Step 4: `?v` をバンプ**

`public/index.html:134` を編集:

```html
  <script type="text/babel" src="screens-group.jsx?v=16"></script>
```

- [ ] **Step 5: 手動確認**

Run: `npm run dev`（ローカル）→ 結果タブ→グループリーグを開く。
Expected:
- スコアのあるグループで、1位確定チームに金色「1位確定」、突破確定（非1位）に緑「突破」、敗退確定にグレー「敗退」チップが表示される。
- 確定していないチームにはバッジが出ない。レイアウト（勝点/試合数列）が崩れない。
- スコア未取得時はバッジなしで従来表示。

> 開幕後の実データで確認できない場合は、ブラウザのコンソールで `window.WC.computeClinchStatus(window.WC.GROUPS.A, window.WC.GROUP_MATCHES.A)` を実行し、A組（MEX 等）の状態が妥当か確認する。

- [ ] **Step 6: コミット**

```bash
git add public/index.html public/screens-group.jsx
git commit -m "feat(clinch): 結果タブ順位表に突破/敗退/1位の確定バッジを表示

Claude-Session: https://claude.ai/code/session_01NMCP5bWgxEYFeCVqamFb4h"
```

---

### Task 4: トーナメント表に確定チームを配置

**Files:**
- Modify: `public/screens-group.jsx`（`KnockoutResults` の `gr` 算出。`public/screens-group.jsx:585-587` 付近）
- Modify: `public/index.html:134`（既に Task 3 で v16 済み。`KnockoutResults` も同ファイルなので追加バンプ不要）

**Interfaces:**
- Consumes: `window.WC.clinchGroupRank`（Task 2）, `window.WC.GROUPS`, `window.WC.GROUP_MATCHES`, `window.WC.GROUP_RESULT`
- Produces: 実結果ブラケットの確定スロット（A1/A2 等）に実チーム名

- [ ] **Step 1: `KnockoutResults` の groupRank をクリンチでマージ**

`public/screens-group.jsx` の `KnockoutResults` 内、現状の:

```jsx
	const R = window.WC.RESULT || {};
	const gr = window.WC.GROUP_RESULT || {};
```

を以下に変更（`base` を確定クリンチでマージ。`clinchGroupRank` 不在時は従来どおり）:

```jsx
	const R = window.WC.RESULT || {};
	const baseGr = window.WC.GROUP_RESULT || {};
	// 全試合確定前でも、数学的に順位確定した枠（1位/2位確定）は実チームを配置する。
	const gr = window.WC.clinchGroupRank
		? window.WC.clinchGroupRank(
				window.WC.GROUPS || {},
				window.WC.GROUP_MATCHES || {},
				baseGr,
			)
		: baseGr;
```

以降の `ta`（`resolveThirdAssign(gr, ...)`）と `der`（`deriveKnockoutFromSets(gr, ta, ...)`）はそのまま `gr` を使うため変更不要。3位枠は `R.thirdGroups`（8組確定時のみ）に依存するため、確定前は従来どおり null のまま。

- [ ] **Step 2: 手動確認**

Run: `npm run dev` → 結果タブ→ノックアウトを開く。
Expected:
- 1位確定グループの「○組1位」枠、2位確定グループの「○組2位」枠に実チーム名（国旗）が表示される。
- 未確定の枠は従来どおり出自ラベル（例「A組1位」）のまま。
- 3位ワイルドカード枠は全試合確定までプレースホルダのまま。

> 実データで未確定の場合、コンソールで `window.WC.clinchGroupRank(window.WC.GROUPS, window.WC.GROUP_MATCHES, window.WC.GROUP_RESULT)` を実行し、確定枠のみ埋まることを確認する。

- [ ] **Step 3: 全テスト回帰**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 4: コミット**

```bash
git add public/screens-group.jsx
git commit -m "feat(clinch): トーナメント表に順位確定チームを実結果として配置

Claude-Session: https://claude.ai/code/session_01NMCP5bWgxEYFeCVqamFb4h"
```

---

## Self-Review

**Spec coverage:**
- §3 クリンチ判定 → Task 1（`computeClinchStatus`）+ Task 2（`computeAllClinch`）。残り試合導出・FT限定・3^n列挙・4判定すべて実装。✓
- §4 結果タブバッジ（突破/敗退/1位確定）→ Task 3。✓
- §5 トーナメント表（won→A1, secondLocked→A2, 3位枠従来どおり）→ Task 2（`clinchGroupRank`）+ Task 4。✓
- §6 データフロー（GROUPS+GROUP_MATCHES のみ、API/DB変更なし）→ 全タスクで遵守。✓
- §7 エッジ（空グループ/未取得/片側欠落/LIVE単調）→ Task 1 実装＋テストで担保。✓
- §8 スコープ外（3位確定/GD確定/採点）→ 計画に含めず。✓
- §9 影響ファイル → standings.js, clinch.test.js, screens-group.jsx, index.html すべてカバー。✓

**Placeholder scan:** プレースホルダなし。全ステップに実コード/実コマンド/期待値あり。UIタスクは自動テスト不可のため手動確認手順＋コンソール検証を明示。

**Type consistency:** `computeClinchStatus` の返り値キー `{qualified, won, eliminated, secondLocked}` は Task 1/2/3/4 で一貫。`clinchGroupRank` の返り値 `[first, second, null]` は `deriveKnockoutFromSets` が期待する `groupRank[g][pos-1]` 形式（既存 `seedTeam`）と整合。
