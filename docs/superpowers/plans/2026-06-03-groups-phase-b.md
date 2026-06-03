# Phase B（グループ順位・ノックアウト・新採点）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** コア予想（優勝/準優勝/得点王）はそのままに、やりたい人向けのオプション予想（グループ順位・3位割当・ノックアウト）と2部門ランキングを追加する。

**Architecture:** 純ロジック（対戦表導出・採点）を `public/lib/*.js` の ESM に切り出し、node `--test` で TDD する。ブラウザは `<script type="module">` で `window.WC` に注入。UI は既存の `screens-*.jsx`（Babel standalone・`window` グローバル）方式を踏襲し、「予想」タブをハブ化してオプション3画面へ遷移する。レスポンシブは既存 `modeFor`/`useContainerWidth` を流用。

**Tech Stack:** React 18 UMD + Babel standalone（ビルド無し）、Cloudflare Pages Functions（`functions/_lib` は ESM・既存テスト基盤）、localStorage 永続化、node:test。

参照spec: `docs/superpowers/specs/2026-06-03-groups-phase-b-design.md`

---

## File Structure

| ファイル | 区分 | 責務 |
|---|---|---|
| `public/lib/bracket.js` | 新規(ESM) | `BRACKET_STRUCTURE`, `WILDCARD_SLOTS`, `PERMITTED`, `deriveKnockout` |
| `public/lib/scoring.js` | 新規(ESM) | `SCORING`, `scoreMember`（2部門） |
| `functions/_lib/bracket.test.js` | 新規 | `deriveKnockout` の単体テスト |
| `functions/_lib/scoring.test.js` | 新規 | `scoreMember` の単体テスト |
| `public/data.js` | 改修 | `emptyPred` 拡張・旧 `scoreMember`/`R16_TEAMS`/`RESULT.bracket` 整理・`RESULT.knockout`/`GROUP_RESULT` 採点用・load マイグレーション |
| `functions/_lib/defaults.js` | 改修 | `result.knockout` 既定、`r16Teams` 撤去 |
| `functions/_lib/validate.js` | 改修 | `result.knockout` 検証、`r16Teams` 撤去 |
| `functions/_lib/validate.test.js` | 改修 | knockout 検証テスト追加・r16 テスト削除 |
| `public/index.html` | 改修 | lib モジュール注入、オプション画面のサブルーティング/ハンドラ |
| `public/screens-grouprank.jsx` | 新規 | グループ順位予想（順番タップ） |
| `public/screens-thirdwild.jsx` | 新規 | 3位ワイルドカード割当 |
| `public/screens-knockout.jsx` | 新規 | ノックアウト予想（モバイル=ステッパー / デスクトップ=フルブラケット） |
| `public/screens-core.jsx` | 改修 | `InputScreen` をハブ化（オプション入口カード） |
| `public/screens-rank.jsx` | 改修 | `RankingScreen` 2部門タブ化、新 `scoreMember` 返り値に対応 |
| `public/screens-bracket.jsx` | 削除 | 旧 R16 ブラケット撤去 |

---

## Task 1: 対戦表導出ロジック `bracket.js`

**Files:**
- Create: `public/lib/bracket.js`
- Test: `functions/_lib/bracket.test.js`

- [ ] **Step 1: テストを書く（失敗する）**

`functions/_lib/bracket.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRACKET_STRUCTURE, WILDCARD_SLOTS, PERMITTED, deriveKnockout } from '../../public/lib/bracket.js';

// 全12グループに1〜3位を入れたサンプル順位
const GR = {
  A: ['A1', 'A2', 'A3'], B: ['B1', 'B2', 'B3'], C: ['C1', 'C2', 'C3'],
  D: ['D1', 'D2', 'D3'], E: ['E1', 'E2', 'E3'], F: ['F1', 'F2', 'F3'],
  G: ['G1', 'G2', 'G3'], H: ['H1', 'H2', 'H3'], I: ['I1', 'I2', 'I3'],
  J: ['J1', 'J2', 'J3'], K: ['K1', 'K2', 'K3'], L: ['L1', 'L2', 'L3'],
};
// 8枠に許可グループの3位を1つずつ割当（重複なし）
const TA = { M1: 'A3', M2: 'C3', M7: 'B3', M8: 'E3', M11: 'F3', M12: 'H3', M15: 'G3', M16: 'D3' };

test('構造は16試合・ワイルドカード8枠', () => {
  assert.equal(BRACKET_STRUCTURE.r32.length, 16);
  assert.equal(WILDCARD_SLOTS.length, 8);
  assert.deepEqual(WILDCARD_SLOTS, ['M1', 'M2', 'M7', 'M8', 'M11', 'M12', 'M15', 'M16']);
});

test('PERMITTED は各ワイルドカード枠の許可グループ5つ', () => {
  assert.deepEqual(PERMITTED.M1, ['A', 'B', 'C', 'D', 'F']);
  assert.deepEqual(PERMITTED.M16, ['D', 'E', 'I', 'J', 'L']);
});

test('R32カードが順位予想と3位割当から組み上がる', () => {
  const d = deriveKnockout(GR, TA, {});
  // M3 = A2 vs B2（直接シード）
  assert.deepEqual(d.matches.r32[2], ['A2', 'B2']);
  // M1 = E1 vs ワイルドカード(A3)
  assert.deepEqual(d.matches.r32[0], ['E1', 'A3']);
  // M16 = K1 vs ワイルドカード(D3)
  assert.deepEqual(d.matches.r32[15], ['K1', 'D3']);
});

test('順位未入力のスロットは null カード', () => {
  const d = deriveKnockout({}, {}, {});
  assert.deepEqual(d.matches.r32[2], [null, null]);
});

test('勝者は対戦カードに含まれる場合のみ有効', () => {
  const ko = { r32: ['E1', 'I1', 'A2', 'F1', 'K2', 'H1', 'D1', 'G1', 'C1', 'E2', 'A1', 'L1', 'J1', 'D2', 'B1', 'K1'] };
  const d = deriveKnockout(GR, TA, ko);
  assert.equal(d.winners.r32[2], 'A2'); // A2 は M3 のカードに含まれる→有効
  // 不正な勝者は消える
  const bad = deriveKnockout(GR, TA, { r32: ['ZZ'] });
  assert.equal(bad.winners.r32[0], null);
});

test('上流の勝者から下流カードが組まれる（R16ペア）', () => {
  const ko = { r32: ['E1', 'I1', 'A2', 'F1', 'K2', 'H1', 'D1', 'G1', 'C1', 'E2', 'A1', 'L1', 'J1', 'D2', 'B1', 'K1'] };
  const d = deriveKnockout(GR, TA, ko);
  // R16 M1×M2 → 勝者 E1, I1
  assert.deepEqual(d.matches.r16[0], ['E1', 'I1']);
  assert.equal(d.matches.r16.length, 8);
  assert.equal(d.matches.sf.length, 2);
});

test('決勝進出者は sf 勝者（finalists）', () => {
  const ko = {
    r32: ['E1', 'I1', 'A2', 'F1', 'K2', 'H1', 'D1', 'G1', 'C1', 'E2', 'A1', 'L1', 'J1', 'D2', 'B1', 'K1'],
    r16: ['E1', 'F1', 'K2', 'D1', 'C1', 'A1', 'J1', 'B1'],
    qf: ['E1', 'K2', 'C1', 'J1'],
    sf: ['E1', 'C1'],
  };
  const d = deriveKnockout(GR, TA, ko);
  assert.deepEqual(d.finalists, ['E1', 'C1']);
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`Cannot find module '../../public/lib/bracket.js'`）

- [ ] **Step 3: 最小実装を書く**

`public/lib/bracket.js`:

```js
// ベスト32トーナメント構造と対戦表導出（純ロジック / ESM）
// seed: 'X1'|'X2'（グループX 1位/2位）または { wc: ['A',...] }（3位ワイルドカード枠）

export const BRACKET_STRUCTURE = {
  r32: [
    { id: 'M1',  top: 'E1', bottom: { wc: ['A', 'B', 'C', 'D', 'F'] } },
    { id: 'M2',  top: 'I1', bottom: { wc: ['C', 'D', 'F', 'G', 'H'] } },
    { id: 'M3',  top: 'A2', bottom: 'B2' },
    { id: 'M4',  top: 'F1', bottom: 'C2' },
    { id: 'M5',  top: 'K2', bottom: 'L2' },
    { id: 'M6',  top: 'H1', bottom: 'J2' },
    { id: 'M7',  top: 'D1', bottom: { wc: ['B', 'E', 'F', 'I', 'J'] } },
    { id: 'M8',  top: 'G1', bottom: { wc: ['A', 'E', 'H', 'I', 'J'] } },
    { id: 'M9',  top: 'C1', bottom: 'F2' },
    { id: 'M10', top: 'E2', bottom: 'I2' },
    { id: 'M11', top: 'A1', bottom: { wc: ['C', 'E', 'F', 'H', 'I'] } },
    { id: 'M12', top: 'L1', bottom: { wc: ['E', 'H', 'I', 'J', 'K'] } },
    { id: 'M13', top: 'J1', bottom: 'H2' },
    { id: 'M14', top: 'D2', bottom: 'G2' },
    { id: 'M15', top: 'B1', bottom: { wc: ['E', 'F', 'G', 'I', 'J'] } },
    { id: 'M16', top: 'K1', bottom: { wc: ['D', 'E', 'I', 'J', 'L'] } },
  ],
};

export const WILDCARD_SLOTS = BRACKET_STRUCTURE.r32
  .filter((m) => typeof m.bottom === 'object')
  .map((m) => m.id);

export const PERMITTED = BRACKET_STRUCTURE.r32.reduce((acc, m) => {
  if (typeof m.bottom === 'object') acc[m.id] = m.bottom.wc;
  return acc;
}, {});

// seed トークン → チームコード
function seedTeam(seed, groupRank, thirdAssign, slotId) {
  if (typeof seed === 'string') {
    const g = seed[0];
    const pos = Number(seed[1]); // 1 or 2
    const order = groupRank[g] || [];
    return order[pos - 1] || null;
  }
  return thirdAssign[slotId] || null; // ワイルドカード
}

// 勝者配列 [w0,w1,...] → 次ラウンドのカード [[w0,w1],...]
function pair(winners) {
  const m = [];
  for (let i = 0; i < winners.length; i += 2) m.push([winners[i] || null, winners[i + 1] || null]);
  return m;
}

// 勝者を len 個に整え、各カードに含まれない勝者は null に消す
function sanitize(arr, matches, len) {
  const w = (arr || []).slice(0, len);
  while (w.length < len) w.push(null);
  return w.map((t, i) => (t && matches[i] && matches[i].includes(t) ? t : null));
}

export function deriveKnockout(groupRank = {}, thirdAssign = {}, knockout = {}) {
  const r32m = BRACKET_STRUCTURE.r32.map((m) => [
    seedTeam(m.top, groupRank, thirdAssign, m.id),
    seedTeam(m.bottom, groupRank, thirdAssign, m.id),
  ]);
  const r32w = sanitize(knockout.r32, r32m, 16);

  const r16m = pair(r32w);
  const r16w = sanitize(knockout.r16, r16m, 8);

  const qfm = pair(r16w);
  const qfw = sanitize(knockout.qf, qfm, 4);

  const sfm = pair(qfw);
  const sfw = sanitize(knockout.sf, sfm, 2);

  return {
    matches: { r32: r32m, r16: r16m, qf: qfm, sf: sfm },
    winners: { r32: r32w, r16: r16w, qf: qfw, sf: sfw },
    finalists: sfw,
  };
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `npm test`
Expected: PASS（bracket.test.js の全テスト）

- [ ] **Step 5: コミット**

```bash
git add public/lib/bracket.js functions/_lib/bracket.test.js
git commit -m "feat: bracket structure and knockout derivation (Phase B)"
```

---

## Task 2: 採点ロジック `scoring.js`

**Files:**
- Create: `public/lib/scoring.js`
- Test: `functions/_lib/scoring.test.js`

- [ ] **Step 1: テストを書く（失敗する）**

`functions/_lib/scoring.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCORING, scoreMember } from '../../public/lib/scoring.js';

const RESULT = {
  champion: 'ARG', runnerUp: 'FRA', topScorer: 'ムバッペ',
  groupResult: { A: ['MEX', 'KOR', 'RSA', 'CZE'], F: ['NED', 'JPN', 'TUN', 'SWE'] },
  knockout: {
    r32: ['ARG', 'FRA', 'BRA', 'ESP'],
    r16: ['ARG', 'BRA'],
    qf: ['ARG'],
    sf: ['ARG'],
  },
};

test('配点定数', () => {
  assert.equal(SCORING.champion, 25);
  assert.equal(SCORING.runnerUp, 15);
  assert.equal(SCORING.topScorer, 20);
  assert.equal(SCORING.rankHit, 1);
  assert.equal(SCORING.koHit, 1);
});

test('コア満点', () => {
  const s = scoreMember({ champion: 'ARG', runnerUp: 'FRA', topScorer: 'ムバッペ' }, RESULT);
  assert.equal(s.core.total, 60);
  assert.equal(s.coreTotal, 60);
  assert.equal(s.optionTotal, 0);
  assert.equal(s.grandTotal, 60);
});

test('得点王は前後空白を無視して一致', () => {
  const s = scoreMember({ topScorer: ' ムバッペ ' }, RESULT);
  assert.equal(s.core.topScorer, 20);
});

test('オプション未着手なら grandTotal === coreTotal', () => {
  const s = scoreMember({ champion: 'ARG' }, RESULT);
  assert.equal(s.coreTotal, 25);
  assert.equal(s.grandTotal, 25);
});

test('グループ順位は位置ピタリで +1（1〜3位のみ）', () => {
  const pred = { groupRank: { A: ['MEX', 'KOR', 'XXX'], F: ['NED', 'SWE', 'TUN'] } };
  const s = scoreMember(pred, RESULT);
  // A: 1位MEX○ 2位KOR○ 3位XXX× = 2点 / F: 1位NED○ 2位SWE× 3位TUN× = 1点
  assert.equal(s.option.groupRank, 3);
  assert.equal(s.option.rankHits, 3);
});

test('ノックアウトは到達ラウンドごとに +1', () => {
  const pred = {
    knockout: {
      r32: ['ARG', 'FRA', 'XXX'], // ARG○ FRA○ XXX× = 2
      r16: ['ARG'],               // ○ = 1
      qf: ['BRA'],                // × = 0
      sf: ['ARG'],                // ○ = 1
    },
  };
  const s = scoreMember(pred, RESULT);
  assert.equal(s.option.knockout, 4);
  assert.deepEqual(s.option.koHits, { r32: 2, r16: 1, qf: 0, sf: 1 });
});

test('総合は コア + オプション', () => {
  const pred = {
    champion: 'ARG',
    groupRank: { A: ['MEX', 'KOR', 'RSA'] }, // 3点
    knockout: { r32: ['ARG'] },              // 1点
  };
  const s = scoreMember(pred, RESULT);
  assert.equal(s.coreTotal, 25);
  assert.equal(s.optionTotal, 4);
  assert.equal(s.grandTotal, 29);
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`Cannot find module '../../public/lib/scoring.js'`）

- [ ] **Step 3: 最小実装を書く**

`public/lib/scoring.js`:

```js
// 2部門採点（純ロジック / ESM）
export const SCORING = {
  champion: 25,
  runnerUp: 15,
  topScorer: 20,
  rankHit: 1, // グループ順位ピタリ1チーム
  koHit: 1,   // ノックアウト到達1チーム
};

const KO_ROUNDS = ['r32', 'r16', 'qf', 'sf'];

export function scoreMember(pred = {}, result = {}, scoring = SCORING) {
  // ---- コア ----
  const champion = pred.champion && pred.champion === result.champion ? scoring.champion : 0;
  const runnerUp = pred.runnerUp && pred.runnerUp === result.runnerUp ? scoring.runnerUp : 0;
  const topScorer =
    pred.topScorer && result.topScorer && pred.topScorer.trim() === result.topScorer.trim()
      ? scoring.topScorer
      : 0;
  const coreTotal = champion + runnerUp + topScorer;

  // ---- オプション：グループ順位 ----
  let rankPts = 0;
  let rankHits = 0;
  const gr = pred.groupRank || {};
  const grRes = result.groupResult || {};
  for (const k of Object.keys(grRes)) {
    const mine = gr[k] || [];
    const act = grRes[k] || [];
    for (let i = 0; i < 3; i++) {
      if (mine[i] && act[i] && mine[i] === act[i]) {
        rankPts += scoring.rankHit;
        rankHits += 1;
      }
    }
  }

  // ---- オプション：ノックアウト到達 ----
  let koPts = 0;
  const koHits = { r32: 0, r16: 0, qf: 0, sf: 0 };
  const ko = pred.knockout || {};
  const koRes = result.knockout || {};
  for (const r of KO_ROUNDS) {
    const mine = ko[r] || [];
    const act = new Set(koRes[r] || []);
    for (const t of mine) {
      if (t && act.has(t)) {
        koPts += scoring.koHit;
        koHits[r] += 1;
      }
    }
  }

  const optionTotal = rankPts + koPts;
  return {
    core: { champion, runnerUp, topScorer, total: coreTotal },
    option: { groupRank: rankPts, knockout: koPts, total: optionTotal, rankHits, koHits },
    coreTotal,
    optionTotal,
    grandTotal: coreTotal + optionTotal,
  };
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `npm test`
Expected: PASS（scoring.test.js の全テスト）

- [ ] **Step 5: コミット**

```bash
git add public/lib/scoring.js functions/_lib/scoring.test.js
git commit -m "feat: two-division scoring logic (Phase B)"
```

---

## Task 3: KV 検証・既定値の knockout 対応

**Files:**
- Modify: `functions/_lib/validate.js`
- Modify: `functions/_lib/defaults.js`
- Modify: `functions/_lib/validate.test.js`

採点の「答え合わせ」用に `result.knockout`（r32/r16/qf/sf の到達チーム集合）を設定スキーマへ追加し、未使用の `r16Teams` を撤去する。

- [ ] **Step 1: テストを更新（失敗する）**

`functions/_lib/validate.test.js` の `r16Teams` 関連テスト（`'r16Teams は 0 か 16 以外の長さで失敗'` とその周辺）を削除し、末尾に追加:

```js
test('result.knockout は既知コードのみ許容し正規化', () => {
  const r = validateConfig({
    teams: [{ code: 'ARG', ja: 'A' }, { code: 'FRA', ja: 'F' }],
    result: { knockout: { r32: ['arg', 'fra'], r16: ['ARG'], qf: [], sf: [] } },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.result.knockout.r32, ['ARG', 'FRA']);
  assert.deepEqual(r.value.result.knockout.sf, []);
});

test('result.knockout に未登録コードは失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'ARG', ja: 'A' }],
    result: { knockout: { r32: ['ZZZ'] } },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /knockout/);
});
```

`'デフォルト設定は妥当'` テストの `assert.equal(r.value.r16Teams.length, 0);` 行を削除し、代わりに:

```js
  assert.ok(r.value.result.knockout);
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`r16Teams` 未定義参照 or `knockout` が検証されていない）

- [ ] **Step 3: 実装を更新**

`functions/_lib/validate.js`:
- L29-41 の `r16Teams` ブロックを丸ごと削除。
- `result` ブロック（L52-68）の `bracket` 検証はそのまま残してよい（後方互換）。その直後、`const topScorer = ...; const result = {...}` の組み立てを次に差し替え:

```js
  // knockout（採点用の到達チーム集合。各ラウンドは既知コードのみ。空可）
  const ki = isObj(ri.knockout) ? ri.knockout : {};
  const knockout = {};
  for (const r of ['r32', 'r16', 'qf', 'sf']) {
    const arr = Array.isArray(ki[r]) ? ki[r] : [];
    for (const c of arr) {
      if (!(isStr(c) && known(c.toUpperCase()))) {
        return { ok: false, error: `result.knockout.${r} に未登録コード: ${c}` };
      }
    }
    knockout[r] = arr.map((c) => c.toUpperCase());
  }
  const topScorer = isStr(ri.topScorer) ? ri.topScorer.trim() : '';
  const result = { champion, runnerUp, topScorer, bracket, knockout };
```

- 返り値（L132）から `r16Teams` を削除:

```js
  return { ok: true, value: { version: 1, updatedAt: null, teams, scorerSuggest, result, schedule, groups, groupResult } };
```

`functions/_lib/defaults.js`:
- `r16Teams: [],`（L87）を削除。
- `result` オブジェクト（L75-85）に `knockout` を追加:

```js
  result: {
    champion: 'ARG',
    runnerUp: 'FRA',
    topScorer: 'ムバッペ',
    bracket: { r16: [], qf: [], sf: [], final: [] },
    knockout: { r32: [], r16: [], qf: [], sf: [] },
  },
```

- [ ] **Step 4: 実行して成功を確認**

Run: `npm test`
Expected: PASS（validate.test.js 全テスト）

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/validate.js functions/_lib/defaults.js functions/_lib/validate.test.js
git commit -m "feat: validate result.knockout, drop unused r16Teams (Phase B)"
```

---

## Task 4: `data.js` の予想モデル拡張とロジック注入

**Files:**
- Modify: `public/data.js`
- Modify: `public/index.html`

旧 `scoreMember`/`R16_TEAMS`/`RESULT.bracket` を整理し、`emptyPred` にオプション3フィールドを追加。新ロジックは ESM を `index.html` の module スクリプトで `window.WC` に注入する。

- [ ] **Step 1: `emptyPred` を拡張**

`public/data.js` の `emptyPred`（L198-203）を差し替え:

```js
  function emptyPred() {
    return {
      champion: null, runnerUp: null, topScorer: '',
      groupRank: { A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], I: [], J: [], K: [], L: [] },
      thirdAssign: { M1: null, M2: null, M7: null, M8: null, M11: null, M12: null, M15: null, M16: null },
      knockout: { r32: [], r16: [], qf: [], sf: [] },
    };
  }
```

- [ ] **Step 2: `load()` にマイグレーションを追加**

`public/data.js` の `load()`（L205-225）の `if (raw) { const s = JSON.parse(raw);` ブロック内、`if (!s.preds[s.current]) ...` の前に挿入:

```js
        // Phase B: 旧予想にオプションフィールドを補完
        const blank = emptyPred();
        Object.keys(s.preds || {}).forEach((id) => {
          const p = s.preds[id] || {};
          s.preds[id] = {
            champion: p.champion ?? null,
            runnerUp: p.runnerUp ?? null,
            topScorer: p.topScorer ?? '',
            groupRank: p.groupRank || JSON.parse(JSON.stringify(blank.groupRank)),
            thirdAssign: p.thirdAssign || { ...blank.thirdAssign },
            knockout: p.knockout || JSON.parse(JSON.stringify(blank.knockout)),
          };
        });
```

- [ ] **Step 3: 旧 scoreMember と R16 を撤去し、RESULT を更新**

`public/data.js`:
- `const R16_TEAMS = [];`（L77）を削除。
- `SCORING`（L96-101）を削除（`scoring.js` に移管）。
- `RESULT`（L105-115）の `bracket` を `knockout` 採点用データへ差し替え:

```js
  const RESULT = {
    champion: 'ARG',
    runnerUp: 'FRA',
    topScorer: 'ムバッペ',
    groupResult: {},
    knockout: { r32: [], r16: [], qf: [], sf: [] },
  };
```

- `scoreMember` 関数定義（L264-286）を削除。
- `window.WC = {...}` のエクスポート（L288-292）を差し替え（`R16_TEAMS`/`SCORING`/`scoreMember` を除外）:

```js
  window.WC = {
    TEAMS, TEAM, MEMBERS, MEMBER_COLORS, GROUPS, GROUP_RESULT: {},
    RESULT, SEED, SCORER_SUGGEST, THEMES,
    load, save, reset, emptyPred, addMember, removeMember,
  };
```

- `fetchConfig`（L297-320）内の `if (Array.isArray(cfg.r16Teams) ...)` ブロックを削除し、`result` 取り込みの直後に knockout を RESULT へ反映する行を追加:

```js
      if (cfg.result && typeof cfg.result === 'object') {
        window.WC.RESULT = { ...window.WC.RESULT, ...cfg.result };
      }
      if (cfg.groupResult && typeof cfg.groupResult === 'object') {
        window.WC.GROUP_RESULT = cfg.groupResult;
        window.WC.RESULT = { ...window.WC.RESULT, groupResult: cfg.groupResult };
      }
```

（注：`SEED` 内の各メンバーの旧 `bracket` は無害なので残置可。`screen` 側では参照しない。）

- [ ] **Step 4: `index.html` にロジック注入とラッパを追加**

`public/index.html` の `<script src="data.js"></script>`（L39）の直後に追加:

```html
  <script type="module">
    import { BRACKET_STRUCTURE, WILDCARD_SLOTS, PERMITTED, deriveKnockout } from './lib/bracket.js';
    import { SCORING, scoreMember } from './lib/scoring.js';
    window.WC = window.WC || {};
    Object.assign(window.WC, { BRACKET_STRUCTURE, WILDCARD_SLOTS, PERMITTED, deriveKnockout, SCORING });
    // 採点は RESULT を結果として渡す薄いラッパに統一（既存呼び出し scoreMember(pred) を維持）
    window.WC.scoreMember = (pred) => scoreMember(pred, window.WC.RESULT, SCORING);
  </script>
```

- [ ] **Step 5: 手動確認（既存テストは緑のまま）**

Run: `npm test`
Expected: PASS（既存 + Task1〜3 のテスト）

Run: `npm run dev` → ブラウザでアプリを開き、コンソールで `window.WC.deriveKnockout && window.WC.SCORING && window.WC.scoreMember` が全て定義済みであること、既存のホーム/予想/グループ/ランキングがエラーなく表示されることを確認。

- [ ] **Step 6: コミット**

```bash
git add public/data.js public/index.html
git commit -m "feat: extend prediction model and inject Phase B logic (data layer)"
```

---

## Task 5: グループ順位予想画面 `screens-grouprank.jsx`

**Files:**
- Create: `public/screens-grouprank.jsx`
- Modify: `public/index.html`

順番タップ式。タップ順に1〜3位、4位は残り自動。`groupRank[K]` は選択コードの順序配列（最大3）。

- [ ] **Step 1: コンポーネントを作成**

`public/screens-grouprank.jsx`:

```jsx
/* ============================================================
   画面: グループ順位予想（順番タップ式・オプション）
   props: T, member, pred, setGroupRank(groupKey, codeArray), goBack
   ============================================================ */
function GroupRankScreen({ T, member, pred, setGroupRank, goBack, wide = false }) {
  const GK = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const groups = window.WC.GROUPS || {};
  const TEAM = window.WC.TEAM || {};
  const gr = pred.groupRank || {};

  const doneCount = GK.filter((k) => (gr[k] || []).length >= 3).length;

  // タップ：選択済みなら解除（後続繰り上げ）、未選択かつ3未満なら末尾追加
  function tap(k, code) {
    const cur = (gr[k] || []).slice();
    const idx = cur.indexOf(code);
    if (idx >= 0) { cur.splice(idx, 1); }
    else if (cur.length < 3) { cur.push(code); }
    setGroupRank(k, cur);
  }

  const posMeta = (i) => i === 0 ? { n: '1', c: T.gold } : i === 1 ? { n: '2', c: T.silver } : { n: '3', c: T.sub };

  const Card = ({ k }) => {
    const members = (groups[k] || []).filter(Boolean);
    const order = (gr[k] || []).filter(Boolean);
    const auto4 = order.length === 3 ? members.find((c) => !order.includes(c)) : null;
    return (
      <div style={{ background: T.card, borderRadius: 18, padding: 14, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 15, color: T.accent }}>GROUP {k}</span>
          <span style={{ fontSize: 11, color: order.length >= 3 ? T.accent : T.faint, fontWeight: 700 }}>
            {order.length >= 3 ? '完了' : `${order.length}/3`}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {members.map((code) => {
            const tm = TEAM[code]; if (!tm) return null;
            const i = order.indexOf(code);
            const picked = i >= 0;
            const meta = picked ? posMeta(i) : null;
            const isAuto = code === auto4;
            return (
              <button key={code} onClick={() => tap(k, code)} disabled={isAuto} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                border: 'none', cursor: isAuto ? 'default' : 'pointer', fontFamily: 'inherit',
                background: picked ? `${meta.c}1A` : 'rgba(255,255,255,0.03)',
                opacity: isAuto ? 0.5 : 1,
                borderRadius: 10, padding: '8px 10px',
                boxShadow: picked ? `inset 0 0 0 1px ${meta.c}59` : 'none' }}>
                <span style={{ fontSize: 20 }}>{tm.flag}</span>
                <span style={{ fontWeight: 700, color: T.text, fontSize: 14, flex: 1, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{tm.ja}</span>
                {picked && <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 12, color: meta.c,
                  background: `${meta.c}22`, borderRadius: 6, padding: '3px 8px' }}>{meta.n}位</span>}
                {isAuto && <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 12, color: T.faint }}>4位</span>}
                {!picked && !isAuto && <span style={{ fontSize: 12, color: T.faint }}>タップ</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: wide ? '4px 0 24px' : '4px 16px 16px' }}>
      <button onClick={goBack} style={{ border: 'none', background: 'transparent', color: T.accent,
        fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', marginBottom: 6 }}>
        <Icon name="chevron" size={15} color={T.accent} style={{ transform: 'rotate(180deg)' }} />予想ハブに戻る
      </button>
      <Eyebrow T={T}>OPTION · {member.name}</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 3, marginBottom: 4 }}>
        <div style={{ fontSize: wide ? 26 : 22, fontWeight: 800, color: T.text }}>グループ順位予想</div>
        <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 15,
          color: doneCount === 12 ? T.accent : T.text }}>{doneCount}<span style={{ color: T.faint, fontSize: 12 }}>/12組</span></span>
      </div>
      <p style={{ color: T.sub, fontSize: 13, lineHeight: 1.55, margin: '0 0 14px' }}>
        各組をタップした順に1位→2位→3位。もう一度タップで取消。3位まで決めると4位は自動です。</p>
      <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(auto-fill, minmax(240px, 1fr))' : '1fr', gap: 12 }}>
        {GK.map((k) => <Card key={k} k={k} />)}
      </div>
    </div>
  );
}

Object.assign(window, { GroupRankScreen });
```

- [ ] **Step 2: `index.html` で読み込む**

`public/index.html` の screens 読み込み群（`screens-group.jsx` の近く）に追加（既存の `<script type="text/babel" src="screens-group.jsx"></script>` の直後）:

```html
  <script type="text/babel" src="screens-grouprank.jsx"></script>
```

（配線は Task 8 のハブ化でまとめて行う。本タスクではファイル作成と読込のみ。）

- [ ] **Step 3: 手動確認**

Run: `npm run dev` → コンソールで `window.GroupRankScreen` が関数として定義済みであることを確認（描画はハブ配線後）。

- [ ] **Step 4: コミット**

```bash
git add public/screens-grouprank.jsx public/index.html
git commit -m "feat: group-rank prediction screen (tap-order)"
```

---

## Task 6: 3位ワイルドカード割当画面 `screens-thirdwild.jsx`

**Files:**
- Create: `public/screens-thirdwild.jsx`
- Modify: `public/index.html`

8枠それぞれに、許可グループの3位（`groupRank[g][2]`）を割当。使用済み・未予想は無効。

- [ ] **Step 1: コンポーネントを作成**

`public/screens-thirdwild.jsx`:

```jsx
/* ============================================================
   画面: 3位ワイルドカード割当（オプション）
   props: T, member, pred, setThirdAssign(slotId, code|null), goBack
   ============================================================ */
function ThirdWildScreen({ T, member, pred, setThirdAssign, goBack, wide = false }) {
  const SLOTS = window.WC.WILDCARD_SLOTS || [];
  const PERMITTED = window.WC.PERMITTED || {};
  const TEAM = window.WC.TEAM || {};
  const gr = pred.groupRank || {};
  const ta = pred.thirdAssign || {};
  const [openSlot, setOpenSlot] = React.useState(null);

  const usedCodes = SLOTS.map((s) => ta[s]).filter(Boolean);
  const doneCount = usedCodes.length;

  // ある枠で選べる候補：許可グループの3位コード（存在するもの）
  function candidates(slot) {
    return (PERMITTED[slot] || [])
      .map((g) => ({ g, code: (gr[g] || [])[2] || null }))
      .filter((x) => x.code);
  }

  function choose(slot, code) {
    setThirdAssign(slot, code);
    setOpenSlot(null);
  }

  const Slot = ({ slot }) => {
    const code = ta[slot];
    const tm = code ? TEAM[code] : null;
    return (
      <button onClick={() => setOpenSlot(slot)} style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        background: T.card, borderRadius: 16, padding: '12px 14px',
        boxShadow: `inset 0 0 0 1px ${code ? T.accent + '55' : T.line}` }}>
        <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 12, color: T.faint, width: 30 }}>{slot}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: T.faint, fontFamily: 'Archivo', letterSpacing: 0.5 }}>
            {(PERMITTED[slot] || []).join('/')} の3位</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 20 }}>{tm ? tm.flag : '⚪️'}</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: code ? T.text : T.faint }}>
              {tm ? tm.ja : 'タップして選ぶ'}</span>
          </div>
        </div>
        <Icon name="chevron" size={18} color={T.faint} />
      </button>
    );
  };

  const cand = openSlot ? candidates(openSlot) : [];

  return (
    <div style={{ padding: wide ? '4px 0 24px' : '4px 16px 16px' }}>
      <button onClick={goBack} style={{ border: 'none', background: 'transparent', color: T.accent,
        fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', marginBottom: 6 }}>
        <Icon name="chevron" size={15} color={T.accent} style={{ transform: 'rotate(180deg)' }} />予想ハブに戻る
      </button>
      <Eyebrow T={T}>OPTION · {member.name}</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 3, marginBottom: 4 }}>
        <div style={{ fontSize: wide ? 26 : 22, fontWeight: 800, color: T.text }}>3位ワイルドカード</div>
        <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 15,
          color: doneCount === 8 ? T.accent : T.text }}>{doneCount}<span style={{ color: T.faint, fontSize: 12 }}>/8枠</span></span>
      </div>
      <p style={{ color: T.sub, fontSize: 13, lineHeight: 1.55, margin: '0 0 14px' }}>
        ベスト32の8枠に、各グループ3位のうち1チームを割り当てます。各チームは1枠だけ。先にグループ順位予想で3位を決めておく必要があります。</p>
      <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(auto-fill, minmax(260px, 1fr))' : '1fr', gap: 10 }}>
        {SLOTS.map((s) => <Slot key={s} slot={s} />)}
      </div>

      {/* 選択シート */}
      {openSlot && (
        <div onClick={() => setOpenSlot(null)} style={{ position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520,
            background: T.panel, borderRadius: '20px 20px 0 0', padding: 18, maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.text, marginBottom: 4 }}>
              {openSlot}：{(PERMITTED[openSlot] || []).join('/')} の3位</div>
            <p style={{ color: T.faint, fontSize: 12.5, margin: '0 0 12px' }}>使用済み・3位未予想のチームは選べません。</p>
            {ta[openSlot] && (
              <button onClick={() => choose(openSlot, null)} style={{ width: '100%', border: 'none',
                borderRadius: 12, padding: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800,
                fontSize: 14, background: T.panel2, color: T.sub, marginBottom: 8 }}>この枠を空にする</button>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {cand.map(({ g, code }) => {
                const tm = TEAM[code];
                const usedElsewhere = usedCodes.includes(code) && ta[openSlot] !== code;
                return (
                  <button key={code} onClick={() => !usedElsewhere && choose(openSlot, code)} disabled={usedElsewhere}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      border: 'none', cursor: usedElsewhere ? 'default' : 'pointer', fontFamily: 'inherit',
                      background: T.card, borderRadius: 12, padding: '11px 13px', opacity: usedElsewhere ? 0.4 : 1,
                      boxShadow: ta[openSlot] === code ? `inset 0 0 0 1px ${T.accent}` : `inset 0 0 0 1px ${T.line}` }}>
                    <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 12, color: T.accent, width: 18 }}>{g}</span>
                    <span style={{ fontSize: 20 }}>{tm ? tm.flag : '🏳️'}</span>
                    <span style={{ fontWeight: 700, color: T.text, fontSize: 14, flex: 1 }}>{tm ? tm.ja : code}</span>
                    {usedElsewhere && <span style={{ fontSize: 11, color: T.faint }}>使用済み</span>}
                  </button>
                );
              })}
              {cand.length === 0 && <div style={{ color: T.faint, fontSize: 13, padding: '8px 0' }}>
                このグループ群の3位がまだ予想されていません。先にグループ順位予想を進めてください。</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ThirdWildScreen });
```

- [ ] **Step 2: `index.html` で読み込む**

`screens-grouprank.jsx` の読込直後に追加:

```html
  <script type="text/babel" src="screens-thirdwild.jsx"></script>
```

- [ ] **Step 3: 手動確認**

Run: `npm run dev` → コンソールで `window.ThirdWildScreen` が定義済みであることを確認。

- [ ] **Step 4: コミット**

```bash
git add public/screens-thirdwild.jsx public/index.html
git commit -m "feat: third-place wildcard assignment screen"
```

---

## Task 7: ノックアウト予想画面 `screens-knockout.jsx`

**Files:**
- Create: `public/screens-knockout.jsx`
- Delete: `public/screens-bracket.jsx`
- Modify: `public/index.html`

`deriveKnockout` を使い、対戦カードは自動。ユーザーは勝者タップのみ。モバイル=ラウンド送りステッパー、デスクトップ=フルブラケット。

- [ ] **Step 1: コンポーネントを作成**

`public/screens-knockout.jsx`:

```jsx
/* ============================================================
   画面: ノックアウト予想（オプション）
   対戦カードは groupRank+thirdAssign から自動導出。勝者をタップ。
   モバイル=ラウンド送りステッパー / デスクトップ=フルブラケット
   props: T, member, pred, setKnockout(winners), goBack, wide, availWidth
   ============================================================ */
function KnockoutScreen({ T, member, pred, setKnockout, goBack, wide = false, availWidth = 0 }) {
  const ROUNDS = ['r32', 'r16', 'qf', 'sf'];
  const LABELS = { r32: 'ベスト32', r16: 'ベスト16', qf: '準々決勝', sf: '準決勝' };
  const LENS = { r32: 16, r16: 8, qf: 4, sf: 2 };
  const der = window.WC.deriveKnockout(pred.groupRank || {}, pred.thirdAssign || {}, pred.knockout || {});
  const champ = pred.champion ? window.WC.TEAM[pred.champion] : null;

  // 勝者を選んで整合を取り直して保存
  function pick(round, matchIdx, team) {
    if (!team) return;
    const ko = JSON.parse(JSON.stringify(pred.knockout || {}));
    ROUNDS.forEach((r) => {
      ko[r] = (ko[r] || []).slice(0, LENS[r]);
      while (ko[r].length < LENS[r]) ko[r].push(null);
    });
    ko[round][matchIdx] = team;
    const d = window.WC.deriveKnockout(pred.groupRank || {}, pred.thirdAssign || {}, ko);
    setKnockout(d.winners);
  }

  const TeamBtn = ({ team, isWinner, dimmed, onClick, half }) => (
    <button onClick={onClick} disabled={!team} style={{
      display: 'flex', alignItems: 'center', gap: 7, width: '100%', height: half,
      border: 'none', background: isWinner ? T.accent : 'transparent',
      cursor: team ? 'pointer' : 'default', padding: '0 9px', fontFamily: 'inherit',
      borderRadius: isWinner ? 9 : 0, opacity: dimmed ? 0.4 : 1, minWidth: 0 }}>
      <span style={{ fontSize: 17, flexShrink: 0 }}>{team ? window.WC.TEAM[team]?.flag : '⚪️'}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', flex: 1, textAlign: 'left',
        color: isWinner ? T.accentInk : (team ? T.text : T.faint) }}>
        {team ? window.WC.TEAM[team]?.ja : '未定'}</span>
      {isWinner && <Icon name="check" size={13} color={T.accentInk} sw={2.6} />}
    </button>
  );

  const Header = () => (
    <div style={{ padding: wide ? '4px 0 12px' : '4px 16px 12px' }}>
      <button onClick={goBack} style={{ border: 'none', background: 'transparent', color: T.accent,
        fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', marginBottom: 6 }}>
        <Icon name="chevron" size={15} color={T.accent} style={{ transform: 'rotate(180deg)' }} />予想ハブに戻る
      </button>
      <Eyebrow T={T}>KNOCKOUT · {member.name}</Eyebrow>
      <div style={{ fontSize: wide ? 26 : 22, fontWeight: 800, color: T.text, marginTop: 3 }}>ノックアウト予想</div>
      <p style={{ color: T.faint, fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
        対戦カードはグループ順位予想と3位割当から自動で決まります。各試合で勝者をタップ。決勝の勝敗は「優勝予想」（コア）で決まります。</p>
    </div>
  );

  // ===== モバイル：ラウンド送りステッパー =====
  if (!wide) {
    const [ri, setRi] = React.useState(0);
    const round = ROUNDS[ri];
    const matches = der.matches[round];
    const winners = der.winners[round];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Header />
        <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 13, color: T.accent, letterSpacing: 1 }}>
            {LABELS[round]}</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {ROUNDS.map((r, i) => (
              <div key={r} onClick={() => setRi(i)} style={{ width: i === ri ? 18 : 7, height: 7, borderRadius: 4,
                background: i === ri ? T.accent : T.line, cursor: 'pointer', transition: '.2s' }} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {matches.map((teams, idx) => {
              const w = winners[idx];
              return (
                <div key={idx} style={{ background: T.card, borderRadius: 12, padding: 4,
                  boxShadow: `inset 0 0 0 1px ${w ? T.accent + '66' : T.line}` }}>
                  <TeamBtn team={teams[0]} isWinner={w && w === teams[0]} dimmed={w && w !== teams[0]}
                    onClick={() => pick(round, idx, teams[0])} half={40} />
                  <div style={{ height: 1, background: T.line, margin: '0 8px' }} />
                  <TeamBtn team={teams[1]} isWinner={w && w === teams[1]} dimmed={w && w !== teams[1]}
                    onClick={() => pick(round, idx, teams[1])} half={40} />
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '10px 16px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)', borderTop: `1px solid ${T.line}` }}>
          <button onClick={() => setRi(Math.max(0, ri - 1))} disabled={ri === 0} style={{
            flex: 1, border: 'none', borderRadius: 13, padding: '13px', fontFamily: 'inherit', fontWeight: 800,
            fontSize: 14, cursor: ri === 0 ? 'default' : 'pointer', opacity: ri === 0 ? 0.4 : 1,
            background: T.panel2, color: T.sub }}>前へ</button>
          {ri < ROUNDS.length - 1 ? (
            <button onClick={() => setRi(ri + 1)} style={{ flex: 2, border: 'none', borderRadius: 13, padding: '13px',
              fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer',
              background: T.accent, color: T.accentInk }}>次のラウンドへ</button>
          ) : (
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: T.card, borderRadius: 13, boxShadow: `inset 0 0 0 1px ${T.gold}55` }}>
              <Icon name="trophy" size={16} color={T.gold} />
              <span style={{ fontSize: 13, fontWeight: 800, color: champ ? T.text : T.faint }}>
                優勝予想：{champ ? champ.ja : '未選択'}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== デスクトップ：フルブラケット =====
  const rowH = 44, cardH = 40, colW = 150, stepX = 186, LABEL_H = 28;
  const canvasH = 16 * rowH;
  const centerY = (r, idx) => {
    const span = Math.pow(2, r);
    return (span * (2 * idx + 1)) / 2 * rowH;
  };
  const colX = (r) => r * stepX;
  const champX = 4 * stepX;
  const contentW = champX + colW;
  const fitScale = availWidth ? Math.max(0.5, Math.min(1.2, (availWidth - 8) / contentW)) : 1;

  const connectors = [];
  [1, 2, 3].forEach((r) => {
    const n = LENS[ROUNDS[r]];
    for (let i = 0; i < n; i++) {
      const px = colX(r), py = centerY(r, i);
      const childBaseX = colX(r - 1) + colW;
      const midX = childBaseX + (stepX - colW) / 2;
      [2 * i, 2 * i + 1].forEach((ci) => {
        connectors.push(`M ${childBaseX} ${centerY(r - 1, ci)} H ${midX} V ${py} H ${px}`);
      });
    }
  });
  connectors.push(`M ${colX(3) + colW} ${centerY(3, 0)} H ${champX}`);

  const MatchCard = ({ round, r, idx }) => {
    const teams = der.matches[round][idx];
    const w = der.winners[round][idx];
    return (
      <div style={{ position: 'absolute', left: colX(r), top: centerY(r, idx) - cardH / 2,
        width: colW, height: cardH, background: T.card, borderRadius: 11,
        boxShadow: `inset 0 0 0 1px ${w ? T.accent + '66' : T.line}`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 3, gap: 2 }}>
        <TeamBtn team={teams[0]} isWinner={w && w === teams[0]} dimmed={w && w !== teams[0]}
          onClick={() => pick(round, idx, teams[0])} half={cardH / 2 - 3} />
        <div style={{ height: 1, background: T.line, margin: '0 6px' }} />
        <TeamBtn team={teams[1]} isWinner={w && w === teams[1]} dimmed={w && w !== teams[1]}
          onClick={() => pick(round, idx, teams[1])} half={cardH / 2 - 3} />
      </div>
    );
  };

  return (
    <div>
      <Header />
      <div style={{ padding: '0 0 8px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: contentW * fitScale, height: (canvasH + LABEL_H) * fitScale }}>
          <div style={{ position: 'relative', width: contentW, height: canvasH + LABEL_H,
            transform: `scale(${fitScale})`, transformOrigin: 'top left' }}>
            {ROUNDS.map((r, i) => (
              <div key={r} style={{ position: 'absolute', top: 4, left: colX(i), width: colW, textAlign: 'center',
                fontFamily: 'Archivo', fontWeight: 800, fontSize: 10, letterSpacing: 1.2, color: T.sub }}>{LABELS[r]}</div>
            ))}
            <div style={{ position: 'absolute', top: 4, left: champX, width: colW, textAlign: 'center',
              fontFamily: 'Archivo', fontWeight: 800, fontSize: 10, letterSpacing: 1.2, color: T.gold }}>優勝</div>
            <div style={{ position: 'absolute', top: LABEL_H, left: 0, width: contentW, height: canvasH }}>
              <svg width={contentW} height={canvasH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {connectors.map((d, i) => <path key={i} d={d} fill="none" stroke={T.line} strokeWidth="1.5" />)}
              </svg>
              {ROUNDS.map((round, r) => der.matches[round].map((_, idx) => (
                <MatchCard key={round + idx} round={round} r={r} idx={idx} />
              )))}
              <div style={{ position: 'absolute', left: champX, top: centerY(3, 0) - 40, width: colW, height: 80,
                borderRadius: 14, background: champ ? `linear-gradient(160deg, ${T.gold}33, ${T.card})` : T.card,
                boxShadow: `inset 0 0 0 1.5px ${champ ? T.gold : T.line}`, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <Icon name="trophy" size={20} color={T.gold} />
                <div style={{ fontSize: 22 }}>{champ ? champ.flag : '🏆'}</div>
                <div style={{ fontWeight: 800, fontSize: 12, color: champ ? T.text : T.faint }}>
                  {champ ? champ.ja : '優勝予想'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { KnockoutScreen });
```

- [ ] **Step 2: 旧ブラケットを削除し読み込みを差し替え**

`public/screens-bracket.jsx` を削除:

```bash
git rm public/screens-bracket.jsx
```

`public/index.html`：
- `<script type="text/babel" src="screens-bracket.jsx"></script>` の行を `screens-knockout.jsx` に差し替え:

```html
  <script type="text/babel" src="screens-knockout.jsx"></script>
```

- [ ] **Step 3: 手動確認**

Run: `npm run dev` → コンソールで `window.KnockoutScreen` 定義済み、`window.deriveBracket`（旧）参照箇所が残っていないことを `grep -rn deriveBracket public/` で確認（0件であること）。

```bash
grep -rn "deriveBracket\|BracketScreen\|R16_TEAMS" public/
```
Expected: 0件

- [ ] **Step 4: コミット**

```bash
git add public/screens-knockout.jsx public/index.html
git commit -m "feat: knockout prediction screen (hybrid), remove legacy bracket"
```

---

## Task 8: 「予想」タブのハブ化とサブルーティング

**Files:**
- Modify: `public/screens-core.jsx`
- Modify: `public/index.html`

`InputScreen` にオプション入口カードを追加。`index.html` にサブ画面の状態とハンドラを追加。

- [ ] **Step 1: `InputScreen` にオプションセクションを追加**

`public/screens-core.jsx` の `InputScreen` 内、決勝トーナメント案内の `div`（「決勝トーナメントの予想は近日対応予定です。」を含むブロック、L267-272）を次に差し替え:

```jsx
      {/* オプション予想の入口 */}
      <div style={{ marginTop: 22 }}>
        <div style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 11, letterSpacing: 1.4,
          color: T.accent, marginBottom: 10 }}>■ オプション予想（やりたい人）</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OptionCard T={T} emoji="📊" title="グループ順位予想" sub={`12組の1〜3位 · ${grDone}/12組`}
            onClick={() => goOption('grouprank')} />
          <OptionCard T={T} emoji="🎯" title="3位ワイルドカード" sub={`8枠に3位を割当 · ${taDone}/8枠`}
            onClick={() => goOption('thirdwild')} />
          <OptionCard T={T} emoji="🏟" title="ノックアウト予想" sub={koReady ? 'ベスト32→決勝' : '先にグループ順位予想を'}
            onClick={() => koReady && goOption('knockout')} disabled={!koReady} />
        </div>
      </div>
```

`InputScreen` のシグネチャに `goOption` を追加し、進捗値を算出（関数冒頭、`const [sheet, ...]` の前後）:

```jsx
function InputScreen({ T, member, pred, setPick, onRemove, canRemove, goOption, wide = false }) {
  const gr = pred.groupRank || {};
  const ta = pred.thirdAssign || {};
  const grDone = ['A','B','C','D','E','F','G','H','I','J','K','L'].filter((k) => (gr[k] || []).length >= 3).length;
  const taDone = (window.WC.WILDCARD_SLOTS || []).filter((s) => ta[s]).length;
  const koReady = grDone === 12 && taDone === 8;
```

ファイル末尾の `Object.assign(window, { SummaryScreen, InputScreen });` の前に `OptionCard` を追加:

```jsx
function OptionCard({ T, emoji, title, sub, onClick, disabled = false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
      border: 'none', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
      background: T.card, borderRadius: 14, padding: '13px 14px', opacity: disabled ? 0.55 : 1,
      boxShadow: `inset 0 0 0 1px ${T.line}` }}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: T.text }}>{title}</div>
        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 1 }}>{sub}</div>
      </div>
      <Icon name="chevron" size={18} color={T.faint} />
    </button>
  );
}
```

- [ ] **Step 2: `index.html` にサブ画面状態とハンドラを追加**

`public/index.html` の `App()` 内、`const [tab, setTab] = useState('summary');`（L69）の直後に追加:

```jsx
      const [optScreen, setOptScreen] = useState(null); // 'grouprank' | 'thirdwild' | 'knockout' | null
```

`setBracket`（L103-105）を削除し、次のハンドラに差し替え:

```jsx
      function setGroupRank(groupKey, codeArray) {
        const groupRank = { ...(pred.groupRank || {}), [groupKey]: codeArray };
        persist({ ...state, preds: { ...state.preds, [state.current]: { ...pred, groupRank } } });
      }
      function setThirdAssign(slotId, code) {
        const thirdAssign = { ...(pred.thirdAssign || {}), [slotId]: code };
        persist({ ...state, preds: { ...state.preds, [state.current]: { ...pred, thirdAssign } } });
      }
      function setKnockout(winners) {
        persist({ ...state, preds: { ...state.preds, [state.current]: { ...pred, knockout: winners } } });
      }
```

`renderScreen`（L138-147）を差し替え（input でオプション画面を分岐）:

```jsx
      function renderScreen(wide) {
        if (tab === 'summary') return <SummaryScreen T={T} state={state} member={member} pred={pred}
          goTab={setTab} wide={wide} dashboard={wide && t.dtLayout === 'dashboard'} />;
        if (tab === 'input') {
          if (optScreen === 'grouprank') return <GroupRankScreen T={T} member={member} pred={pred}
            setGroupRank={setGroupRank} goBack={() => setOptScreen(null)} wide={wide} />;
          if (optScreen === 'thirdwild') return <ThirdWildScreen T={T} member={member} pred={pred}
            setThirdAssign={setThirdAssign} goBack={() => setOptScreen(null)} wide={wide} />;
          if (optScreen === 'knockout') return <KnockoutScreen T={T} member={member} pred={pred}
            setKnockout={setKnockout} goBack={() => setOptScreen(null)} wide={wide} availWidth={contentAvail} />;
          return <InputScreen T={T} member={member} pred={pred} setPick={setPick}
            onRemove={removeMember} canRemove={state.members.length > 1} goOption={setOptScreen} wide={wide} />;
        }
        if (tab === 'group') return <GroupScreen T={T} wide={wide} />;
        if (tab === 'compare') return <CompareScreen T={T} state={state} goTab={setTab} wide={wide} />;
        if (tab === 'rank') return <RankingScreen T={T} state={state} wide={wide} />;
        return null;
      }
```

タブ切替時にオプション画面をリセットするため、`setTab` を使う箇所のうちメンバー切替/タブ変更で `optScreen` を閉じる。`MOBILE_TABS`/`DESKTOP_TABS` のタブボタン `onClick` は `setTab(tb.id)` を呼ぶので、`App` 内に小ヘルパを追加し置換:

```jsx
      function goTab(id) { setOptScreen(null); setTab(id); }
```

そして `renderScreen` 内および Sidebar/タブバーへ渡す `setTab`/`goTab` を `goTab` に統一する（`<window.Sidebar ... setTab={goTab} ...>`、モバイルタブバーの `onClick={() => goTab(tb.id)}`、各 Screen の `goTab={goTab}`）。`setCurrent` でもオプション画面を閉じる:

```jsx
      function setCurrent(id) { setOptScreen(null); persist({ ...state, current: id }); }
```

- [ ] **Step 3: 手動確認**

Run: `npm run dev` → モバイル幅で「予想」タブ → オプション3カードが表示。グループ順位予想を12組・3位割当8枠まで進めると「ノックアウト予想」が解放され、ステッパーで勝者選択→保存される（リロードで保持）。デスクトップ幅でフルブラケット表示。「戻る」「タブ切替」「メンバー切替」でハブに戻ること。

- [ ] **Step 4: コミット**

```bash
git add public/screens-core.jsx public/index.html
git commit -m "feat: prediction hub with option entries and sub-routing"
```

---

## Task 9: ランキングの2部門タブ化

**Files:**
- Modify: `public/screens-rank.jsx`

新 `scoreMember` の返り値（`coreTotal`/`grandTotal`/`option`）に合わせ、コア部門/総合部門のタブを追加。

- [ ] **Step 1: `RankingScreen` を部門対応に書き換え**

`public/screens-rank.jsx` の `RankingScreen` を次の方針で改修（モバイル/デスクトップ共通の先頭ロジック）。関数冒頭を差し替え:

```jsx
function RankingScreen({ T, state, wide = false }) {
  const M = state.members;
  const R = window.WC.RESULT;
  const [division, setDivision] = React.useState('core'); // 'core' | 'grand'
  const keyOf = (s) => division === 'core' ? s.coreTotal : s.grandTotal;
  const scored = M.map((m) => ({ m, s: window.WC.scoreMember(state.preds[m.id]) }))
    .sort((a, b) => keyOf(b.s) - keyOf(a.s));
  const [open, setOpen] = React.useState(null);
  const maxTotal = Math.max(1, ...scored.map((x) => keyOf(x.s)));
  const rankColor = (i) => i === 0 ? T.gold : i === 1 ? T.silver : i === 2 ? T.boot : T.faint;
```

`RankingScreen` 内に部門タブ部品を追加（`HitBadge` 定義の近く）:

```jsx
  const DivisionTabs = () => (
    <div style={{ display: 'flex', gap: 6, margin: '12px 0 4px' }}>
      {[['core', 'コア部門'], ['grand', '総合部門']].map(([id, label]) => (
        <button key={id} onClick={() => setDivision(id)} style={{
          border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 13,
          padding: '8px 14px', borderRadius: 11,
          background: division === id ? `${T.accent}1A` : 'transparent',
          boxShadow: division === id ? `inset 0 0 0 1px ${T.accent}3D` : `inset 0 0 0 1px ${T.line}`,
          color: division === id ? T.accent : T.sub }}>{label}</button>
      ))}
    </div>
  );
```

`Podium`・モバイルの表彰台・各行のスコア表示は `item.s.total` 参照を `keyOf(item.s)` に置換。詳細展開の内訳は次に統一（既存 `HitBadge` 群の置換）:

```jsx
              {isOpen && (
                <div style={{ padding: '0 14px 14px 48px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
                    <HitBadge ok={p.champion === R.champion} label={`優勝 +${item.s.core.champion}`} />
                    <HitBadge ok={p.runnerUp === R.runnerUp} label={`準優勝 +${item.s.core.runnerUp}`} />
                    <HitBadge ok={p.topScorer && R.topScorer && p.topScorer.trim() === R.topScorer.trim()}
                      label={`得点王 +${item.s.core.topScorer}`} />
                  </div>
                  {division === 'grand' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12.5, color: T.sub }}>
                      <span>順位的中 <b style={{ color: T.text }}>+{item.s.option.groupRank}</b>（{item.s.option.rankHits}）</span>
                      <span>ノックアウト <b style={{ color: T.text }}>+{item.s.option.knockout}</b>
                        <span style={{ color: T.faint }}>（16強{item.s.option.koHits.r32}・8強{item.s.option.koHits.r16}・4強{item.s.option.koHits.qf}・決勝{item.s.option.koHits.sf}）</span></span>
                    </div>
                  )}
                </div>
              )}
```

内訳バー（モバイルの `[['champion',...],['bracket',...]]`）は次に置換:

```jsx
                    {[['champion', T.gold, item.s.core.champion], ['runnerUp', T.silver, item.s.core.runnerUp],
                      ['topScorer', T.boot, item.s.core.topScorer],
                      ...(division === 'grand' ? [['option', T.accent, item.s.option.total]] : [])].map(([k, c, v]) => (
                      <div key={k} style={{ width: `${(v / maxTotal) * 100}%`, background: c }} />
                    ))}
```

デスクトップ `RankTable` の `CatCell`（トーナメント列）と合計列も `keyOf`/`item.s.option` 参照へ更新し、テーブル末尾の合計を `keyOf(item.s)` に。`DivisionTabs` を `Banner` の直後（wide）と見出し直後（モバイル）に挿入。`Legend` の `['トーナメント', T.accent, '+2〜10']` を `['オプション', T.accent, 'グループ+ノックアウト']` に置換。

> 実装メモ：`item.s.total`/`item.s.bracket`/`item.s.bracketHits` の旧参照は全て新返り値（`core`/`option`/`coreTotal`/`grandTotal`）に置換すること。`grep -n "\.total\|bracketHits\|\.bracket\b" public/screens-rank.jsx` で残りを潰す。

- [ ] **Step 2: 手動確認**

Run: `npm run dev` → ランキングタブで「コア部門/総合部門」を切替。コア部門は全員コア点で並び、総合部門ではオプションを入力したメンバーが加点され並び替わる。展開で内訳（優勝/準優勝/得点王＋総合時に順位・ノックアウト）が表示。

`grep -n "bracketHits\|s\.total\|s\.bracket" public/screens-rank.jsx`
Expected: 0件（全て新返り値に移行済み）

- [ ] **Step 3: コミット**

```bash
git add public/screens-rank.jsx
git commit -m "feat: two-division ranking (core / grand total)"
```

---

## Task 10: RightRail の採点参照を更新（デスクトップ右レール）

**Files:**
- Modify: `public/app-shell.jsx`

`RightRail` も `scoreMember` を呼ぶ（`screens-rank` と同じ）。返り値変更に追従。

- [ ] **Step 1: 参照を更新**

`public/app-shell.jsx` の `RightRail` 内、ミニランキングのソート（L128-129）を差し替え:

```jsx
  const scored = state.members.map((m) => ({ m, s: window.WC.scoreMember(state.preds[m.id]) }))
    .sort((a, b) => b.s.grandTotal - a.s.grandTotal);
```

同関数内、各行のスコア表示 `x.s.total`（L190 付近）を `x.s.grandTotal` に置換。

- [ ] **Step 2: 手動確認**

Run: `npm run dev` → デスクトップのスプリットレイアウト（Tweaksで split）で右レールのミニランキングがエラーなく表示されること。

`grep -n "s\.total" public/app-shell.jsx`
Expected: 0件

- [ ] **Step 3: コミット**

```bash
git add public/app-shell.jsx
git commit -m "fix: update RightRail scoring to grandTotal"
```

---

## Task 11: 最終検証

- [ ] **Step 1: 全テスト**

Run: `npm test`
Expected: PASS（bracket / scoring / validate 全て）

- [ ] **Step 2: 旧参照の一掃確認**

Run:
```bash
grep -rn "R16_TEAMS\|deriveBracket\|BracketScreen\|r16Teams\|\.bracketHits" public/ functions/
```
Expected: 0件（`SEED` 内の旧 `bracket` データのみ残置可。関数/コンポーネント参照は0）

- [ ] **Step 3: 手動E2E（モバイル＆デスクトップ）**

Run: `npm run dev`
確認項目:
1. コア予想（優勝/準優勝/得点王）が従来どおり選べる。
2. オプション：グループ順位（順番タップ・4位自動）→ 3位割当（許可グループ・重複不可）→ ノックアウト（ステッパー/ブラケット、勝者タップ）。
3. リロードで全予想が保持される（localStorage）。
4. ランキング：コア部門/総合部門タブが切替わり、加点が反映。
5. 新規メンバー追加 → オプション未入力でも総合部門でコア点ぶん表示（不利なし）。

- [ ] **Step 4: 設計メモリ更新（任意）**

`wcup-bracket-2026.md` の Phase B 節へ「実装完了」を追記（実装者が最後に行う）。

---

## Self-Review 結果（plan作成者チェック済み）

- **spec網羅**: 3位手動割当(Task6)、順番タップ順位UI(Task5)、ハイブリッドKO(Task7)、2部門採点(Task2,9)、ハブ化ナビ(Task8)、データモデル拡張(Task4)、KV検証(Task3)、3位決定戦除外(Task2でsfまで)、admin実結果入力は後続(spec §1 スコープ外)＝計画に含めず明記。全カバー。
- **プレースホルダ**: 各コード手順は完全コードを記載。TODO/TBD無し。
- **型整合**: `scoreMember` 返り値（`core`/`option`/`coreTotal`/`optionTotal`/`grandTotal`）は Task2 定義と Task9/10 参照で一致。`deriveKnockout` 返り値（`matches`/`winners`/`finalists`）は Task1 定義と Task7 参照で一致。`setGroupRank/setThirdAssign/setKnockout` は Task8 定義と Task5/6/7 props で一致。`WILDCARD_SLOTS`/`PERMITTED` は Task1 と Task6/8 で一致。
