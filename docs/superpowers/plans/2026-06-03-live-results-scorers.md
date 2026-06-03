# 試合結果のリーグ表表示＋得点ランキング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理画面でグループの試合スコア・ノックアウト実結果・得点者を入力し、アプリの「結果」タブ内3サブタブ（リーグ表／ノックアウト表／得点王）で読み取り専用表示する。

**Architecture:** 純ロジックを `public/lib/`（ESM・dual-use）に置き node `--test` で検証。KVスキーマを後方互換拡張し `validate.js`/`defaults.js` を更新。admin/アプリは既存の Babel + `window.WC` 橋渡しパターンに従う。採点ロジック（`scoring.js`）と既存 `deriveKnockout` は不変。

**Tech Stack:** React 18 UMD + Babel standalone（ブラウザ内JSX）、Cloudflare Pages Functions（ESM）、KV、node:test。

---

## File Structure

- `public/lib/standings.js`（新規）— `generateFixtures` / `computeStandings`。純ロジック。
- `public/lib/bracket.js`（変更）— `deriveKnockoutFromSets` を追加。既存関数は不変。
- `functions/_lib/defaults.js`（変更）— `groupMatches` / `scorers` / `result.thirdAssign` 既定値。
- `functions/_lib/validate.js`（変更）— 新フィールド検証。
- `functions/_lib/standings.test.js`（新規）/ `bracket-fromsets.test.js`（新規）/ `validate.test.js`（変更）。
- `public/data.js`（変更）— `window.WC` 初期化＋ `fetchConfig` 反映。
- `public/index.html`（変更）— module import 橋渡し＋タブ名「結果」。
- `public/screens-group.jsx`（変更）— サブタブ付き結果スクリーン（リーグ表・得点王・KO埋め込み）。
- `public/screens-optview.jsx`（変更）— `KnockoutView` を `window` へ公開。
- `public/admin/index.html`（変更）— module 橋渡し。
- `public/admin/admin.jsx`（変更）— 試合スコア入力・順位反映・3位枠割当・得点ランキング。

テスト実行: `npm test`（= `node --test 'functions/**/*.test.js'`）。

---

### Task 1: standings 純ロジック

**Files:**
- Create: `public/lib/standings.js`
- Test: `functions/_lib/standings.test.js`

- [ ] **Step 1: Write the failing test**

Create `functions/_lib/standings.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFixtures, computeStandings } from '../../public/lib/standings.js';

test('generateFixtures は4チームから6試合を生成', () => {
  const f = generateFixtures(['A', 'B', 'C', 'D']);
  assert.equal(f.length, 6);
  assert.deepEqual(f[0], { a: 'A', b: 'B' });
});

test('generateFixtures は空スロットを除いた組のみ生成', () => {
  const f = generateFixtures(['A', 'B', '', '']);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0], { a: 'A', b: 'B' });
});

test('computeStandings は勝点・得失点を集計しソート', () => {
  const members = ['A', 'B', 'C', 'D'];
  const matches = [
    { a: 'A', b: 'B', ga: 2, gb: 1 }, // A勝
    { a: 'A', b: 'C', ga: 1, gb: 1 }, // 分
    { a: 'A', b: 'D', ga: 3, gb: 0 }, // A勝
    { a: 'B', b: 'C', ga: 0, gb: 0 }, // 分
    { a: 'B', b: 'D', ga: 2, gb: 2 }, // 分
    { a: 'C', b: 'D', ga: 1, gb: 0 }, // C勝
  ];
  const rows = computeStandings(members, matches);
  assert.equal(rows[0].code, 'A');
  assert.equal(rows[0].pts, 7); // 2勝1分
  assert.equal(rows[0].gd, 4);
  assert.equal(rows[0].played, 3);
  assert.equal(rows[0].w, 2);
  assert.equal(rows[0].d, 1);
  assert.equal(rows[0].l, 0);
});

test('computeStandings は未消化試合を除外', () => {
  const rows = computeStandings(['A', 'B'], [{ a: 'A', b: 'B', ga: null, gb: null }]);
  assert.equal(rows[0].played, 0);
  assert.equal(rows[0].pts, 0);
});

test('computeStandings 同点は得失点差→総得点→登録順', () => {
  const members = ['A', 'B'];
  const matches = [{ a: 'A', b: 'B', ga: 5, gb: 5 }];
  const rows = computeStandings(members, matches);
  // 同勝点・同得失点・同総得点 → 登録順で A が先
  assert.equal(rows[0].code, 'A');
  assert.equal(rows[1].code, 'B');
});

test('computeStandings 試合ゼロでも全メンバーを返す', () => {
  const rows = computeStandings(['A', 'B', 'C', 'D'], []);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.played === 0));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL（`standings.js` が存在しない / import エラー）

- [ ] **Step 3: Write minimal implementation**

Create `public/lib/standings.js`:

```javascript
// グループ総当たりのフィクスチャ生成と順位表集計（純ロジック / ESM）

// 4チーム（空スロット可）から総当たり6試合のペアを生成
export function generateFixtures(members = []) {
  const teams = (members || []).filter(Boolean);
  const out = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      out.push({ a: teams[i], b: teams[j] });
    }
  }
  return out;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// members: コード配列（空スロット可）, matches: [{a,b,ga,gb}]
// 返り値: [{code, played, w, d, l, gf, ga, gd, pts}] を勝点→得失点差→総得点→登録順でソート
export function computeStandings(members = [], matches = []) {
  const order = (members || []).filter(Boolean);
  const row = {};
  order.forEach((code, i) => {
    row[code] = { code, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, _i: i };
  });
  for (const m of matches || []) {
    if (!m || !row[m.a] || !row[m.b]) continue;
    if (!isNum(m.ga) || !isNum(m.gb)) continue; // 未消化
    const A = row[m.a], B = row[m.b];
    A.played++; B.played++;
    A.gf += m.ga; A.ga += m.gb;
    B.gf += m.gb; B.ga += m.ga;
    if (m.ga > m.gb) { A.w++; B.l++; A.pts += 3; }
    else if (m.ga < m.gb) { B.w++; A.l++; B.pts += 3; }
    else { A.d++; B.d++; A.pts++; B.pts++; }
  }
  const rows = order.map((c) => {
    const r = row[c];
    return { ...r, gd: r.gf - r.ga };
  });
  rows.sort((x, y) =>
    y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x._i - y._i);
  return rows.map(({ _i, ...r }) => r);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS（standings 関連6件 + 既存テスト）

- [ ] **Step 5: Commit**

```bash
git add public/lib/standings.js functions/_lib/standings.test.js
git commit -m "feat: add standings pure logic (fixtures + league table)"
```

---

### Task 2: deriveKnockoutFromSets 純ロジック

**Files:**
- Modify: `public/lib/bracket.js`（末尾に追加）
- Test: `functions/_lib/bracket-fromsets.test.js`

- [ ] **Step 1: Write the failing test**

Create `functions/_lib/bracket-fromsets.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveKnockoutFromSets } from '../../public/lib/bracket.js';

// 各組1〜4位（M1..M16 の seed を満たす最小データ）
const GR = {
  A: ['A1', 'A2', 'A3', 'A4'], B: ['B1', 'B2', 'B3', 'B4'],
  C: ['C1', 'C2', 'C3', 'C4'], D: ['D1', 'D2', 'D3', 'D4'],
  E: ['E1', 'E2', 'E3', 'E4'], F: ['F1', 'F2', 'F3', 'F4'],
  G: ['G1', 'G2', 'G3', 'G4'], H: ['H1', 'H2', 'H3', 'H4'],
  I: ['I1', 'I2', 'I3', 'I4'], J: ['J1', 'J2', 'J3', 'J4'],
  K: ['K1', 'K2', 'K3', 'K4'], L: ['L1', 'L2', 'L3', 'L4'],
};

test('到達集合から対戦カードの勝者を整列する', () => {
  // M1: E1 vs (wc) → thirdAssign 未設定なら bottom=null。E1 が集合にいれば勝者
  const der = deriveKnockoutFromSets(GR, {}, { r32: ['E1'] });
  const m1Idx = 0;
  assert.deepEqual(der.matches.r32[m1Idx], ['E1', null]);
  assert.equal(der.winners.r32[m1Idx], 'E1');
});

test('r32勝者がr16カードへ伝播する', () => {
  // M3: A2 vs B2, M4: F1 vs C2 → r16[1] は M3勝者 × M4勝者
  const der = deriveKnockoutFromSets(GR, {}, {
    r32: ['A2', 'F1'], // M3勝者=A2, M4勝者=F1
    r16: ['A2'],       // r16カード(A2 vs F1)の勝者=A2
  });
  assert.deepEqual(der.matches.r16[1], ['A2', 'F1']);
  assert.equal(der.winners.r16[1], 'A2');
});

test('空集合なら勝者なし', () => {
  const der = deriveKnockoutFromSets(GR, {}, {});
  assert.ok(der.winners.r32.every((w) => w === null));
});

test('3位枠割当でワイルドカード席が埋まる', () => {
  const der = deriveKnockoutFromSets(GR, { M1: 'A3' }, { r32: ['A3'] });
  assert.deepEqual(der.matches.r32[0], ['E1', 'A3']);
  assert.equal(der.winners.r32[0], 'A3');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL（`deriveKnockoutFromSets` 未エクスポート）

- [ ] **Step 3: Write minimal implementation**

Append to `public/lib/bracket.js`:

```javascript

// admin の「到達チーム集合」(順不同) を deriveKnockout の対戦カードに整列しつつ
// 実結果ブラケットを構築する。既存 deriveKnockout は不変。
export function deriveKnockoutFromSets(groupRank = {}, thirdAssign = {}, sets = {}) {
  const rounds = ['r32', 'r16', 'qf', 'sf'];
  const knockout = {};
  let der = deriveKnockout(groupRank, thirdAssign, knockout);
  for (const r of rounds) {
    const set = new Set(sets[r] || []);
    knockout[r] = der.matches[r].map((m) => m.find((t) => t && set.has(t)) || null);
    der = deriveKnockout(groupRank, thirdAssign, knockout);
  }
  return der;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/lib/bracket.js functions/_lib/bracket-fromsets.test.js
git commit -m "feat: derive actual knockout bracket from reached-team sets"
```

---

### Task 3: KVスキーマ拡張（defaults + validate）

**Files:**
- Modify: `functions/_lib/defaults.js:75-87`（result/末尾）
- Modify: `functions/_lib/validate.js`
- Test: `functions/_lib/validate.test.js`（追加）

- [ ] **Step 1: Write the failing test**

Append to `functions/_lib/validate.test.js`:

```javascript
test('groupMatches: 既知コード・整数スコアは妥当', () => {
  const r = validateConfig({
    ...DEFAULT_CONFIG,
    groupMatches: { A: [{ a: 'MEX', b: 'KOR', ga: 2, gb: 1 }] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.groupMatches.A[0].ga, 2);
});

test('groupMatches: 未登録コードは失敗', () => {
  const r = validateConfig({
    ...DEFAULT_CONFIG,
    groupMatches: { A: [{ a: 'ZZZ', b: 'KOR', ga: 1, gb: 0 }] },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /groupMatches/);
});

test('groupMatches: null スコアは未消化として許容', () => {
  const r = validateConfig({
    ...DEFAULT_CONFIG,
    groupMatches: { A: [{ a: 'MEX', b: 'KOR', ga: null, gb: null }] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.groupMatches.A[0].ga, null);
});

test('scorers: name+goals は妥当', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, scorers: [{ name: 'X', goals: 3 }] });
  assert.equal(r.ok, true);
  assert.equal(r.value.scorers[0].goals, 3);
});

test('scorers: 負の得点は失敗', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, scorers: [{ name: 'X', goals: -1 }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /scorers/);
});

test('result.thirdAssign: 既知コード・正しいスロットは妥当', () => {
  const r = validateConfig({
    ...DEFAULT_CONFIG,
    result: { ...DEFAULT_CONFIG.result, thirdAssign: { M1: 'BRA' } },
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.result.thirdAssign.M1, 'BRA');
});

test('result.thirdAssign: 不正スロットキーは失敗', () => {
  const r = validateConfig({
    ...DEFAULT_CONFIG,
    result: { ...DEFAULT_CONFIG.result, thirdAssign: { ZZ: 'BRA' } },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /thirdAssign/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL（新フィールドが value に無い / 検証未実装）

- [ ] **Step 3a: Update defaults**

In `functions/_lib/defaults.js`, change the `result` object to include `thirdAssign` and add `groupMatches`/`scorers`. Replace lines 75-88 (the `result: {...}, schedule: []`) with:

```javascript
  result: {
    champion: 'ARG',
    runnerUp: 'FRA',
    topScorer: 'ムバッペ',
    bracket: {
      r16:   ['BRA', 'POR', 'ARG', 'NED', 'FRA', 'ESP', 'ENG', 'GER'],
      qf:    ['BRA', 'ARG', 'FRA', 'ENG'],
      sf:    ['ARG', 'FRA'],
      final: ['ARG'],
    },
    knockout: { r32: [], r16: [], qf: [], sf: [] },
    thirdAssign: {},
  },
  groupMatches: {},
  scorers: [],
  schedule: [],
};
```

- [ ] **Step 3b: Update validate.js**

In `functions/_lib/validate.js`, add `WILDCARD_SLOTS` import at top (after line 5):

```javascript
import { WILDCARD_SLOTS } from '../../public/lib/bracket.js';
```

Add `thirdAssign` validation inside the `result` block — after the `knockout` loop (after current line 63, before `const topScorer`):

```javascript
  // thirdAssign（実際の3位枠割当。キーは WILDCARD_SLOTS、値は既知コード。空可）
  const tai = isObj(ri.thirdAssign) ? ri.thirdAssign : {};
  const thirdAssign = {};
  for (const k of Object.keys(tai)) {
    if (!WILDCARD_SLOTS.includes(k)) {
      return { ok: false, error: `result.thirdAssign に不正なスロット: ${k}` };
    }
    const v = tai[k];
    if (v == null || v === '') continue;
    if (!(isStr(v) && known(v.toUpperCase()))) {
      return { ok: false, error: `result.thirdAssign.${k} に未登録コード: ${v}` };
    }
    thirdAssign[k] = v.toUpperCase();
  }
```

Change the `result` assembly (current line 65) to include `thirdAssign`:

```javascript
  const result = { champion, runnerUp, topScorer, bracket, knockout, thirdAssign };
```

Add `groupMatches` and `scorers` validation before the final `return` (after the `groupResult` block, current line 127). Insert:

```javascript
  // groupMatches（各組の試合スコア。a/b は既知コード、ga/gb は null か 0〜99 整数）
  const GROUP_KEYS2 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const groupMatches = {};
  if (input.groupMatches != null) {
    if (!isObj(input.groupMatches)) return { ok: false, error: 'groupMatches はオブジェクトが必要です' };
    for (const k of Object.keys(input.groupMatches)) {
      if (!GROUP_KEYS2.includes(k)) return { ok: false, error: `groupMatches に不正なキー: ${k}` };
      const arr = input.groupMatches[k];
      if (!Array.isArray(arr)) return { ok: false, error: `groupMatches.${k} は配列が必要です` };
      const norm = [];
      for (const m of arr) {
        if (!isObj(m)) return { ok: false, error: `groupMatches.${k} の要素が不正です` };
        const a = isStr(m.a) ? m.a.toUpperCase() : '';
        const b = isStr(m.b) ? m.b.toUpperCase() : '';
        if (!known(a) || !known(b)) return { ok: false, error: `groupMatches.${k} に未登録コード` };
        const sc = (v) => (v == null || v === '' ? null : v);
        const ga = sc(m.ga), gb = sc(m.gb);
        const okScore = (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 99);
        if (!okScore(ga) || !okScore(gb)) return { ok: false, error: `groupMatches.${k} のスコアが不正です` };
        norm.push({ a, b, ga, gb });
      }
      groupMatches[k] = norm;
    }
  }

  // scorers（得点ランキング。name 非空、goals 非負整数）
  let scorers = [];
  if (input.scorers != null) {
    if (!Array.isArray(input.scorers)) return { ok: false, error: 'scorers は配列が必要です' };
    for (const s of input.scorers) {
      if (!isObj(s) || !isStr(s.name) || !s.name.trim()) {
        return { ok: false, error: 'scorers の name が必要です' };
      }
      const goals = s.goals;
      if (!Number.isInteger(goals) || goals < 0) {
        return { ok: false, error: `scorers の goals が不正です: ${s.name}` };
      }
      scorers.push({ name: s.name.trim(), goals });
    }
  }
```

Change the final `return` (current line 129) to include the new fields:

```javascript
  return { ok: true, value: { version: 1, updatedAt: null, teams, scorerSuggest, result, schedule, groups, groupResult, groupMatches, scorers } };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS（既存 + 新規すべて）

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/defaults.js functions/_lib/validate.js functions/_lib/validate.test.js
git commit -m "feat: validate groupMatches, scorers, result.thirdAssign in config"
```

---

### Task 4: data.js（window.WC 初期化 + fetchConfig 反映）

**Files:**
- Modify: `public/data.js:271-301`

- [ ] **Step 1: Update window.WC init**

In `public/data.js`, find the `window.WC = { ... }` block (line ~271) and add `GROUP_MATCHES: {}, SCORERS: []`:

```javascript
  window.WC = {
    TEAMS, TEAM, MEMBERS, MEMBER_COLORS, GROUPS, GROUP_RESULT: {},
    RESULT, SEED, SCORER_SUGGEST, THEMES,
    GROUP_MATCHES: {}, SCORERS: [],
    load, save, reset, emptyPred, addMember, removeMember,
  };
```

- [ ] **Step 2: Ensure RESULT has thirdAssign default**

In `public/data.js`, locate the `RESULT` object definition (line ~94, the active result with `topScorer: 'ムバッペ'`). Ensure it includes `thirdAssign: {}`. Add the property to the `RESULT` literal (alongside `knockout`/`bracket`):

```javascript
    thirdAssign: {},
```

(If `RESULT` does not currently have a `knockout`/`thirdAssign`, add `thirdAssign: {}` so `window.WC.RESULT.thirdAssign` is always defined.)

- [ ] **Step 3: Wire fetchConfig**

In `fetchConfig`, after the `groupResult` block (line ~300), add:

```javascript
      if (cfg.groupMatches && typeof cfg.groupMatches === 'object') {
        window.WC.GROUP_MATCHES = cfg.groupMatches;
      }
      if (Array.isArray(cfg.scorers)) window.WC.SCORERS = cfg.scorers;
```

(`cfg.result.thirdAssign` is already merged via the existing `window.WC.RESULT = { ...RESULT, ...cfg.result }` line.)

- [ ] **Step 4: Commit**

```bash
git add public/data.js
git commit -m "feat: expose GROUP_MATCHES/SCORERS and merge from config"
```

---

### Task 5: index.html（module 橋渡し + タブ名「結果」）

**Files:**
- Modify: `public/index.html:41-44`（module）, `:145,151`（タブラベル）

- [ ] **Step 1: Add lib imports & bridge**

In `public/index.html` `<script type="module">` (lines 41-44), update to:

```javascript
    import { BRACKET_STRUCTURE, WILDCARD_SLOTS, PERMITTED, deriveKnockout, deriveKnockoutFromSets } from './lib/bracket.js';
    import { SCORING, scoreMember } from './lib/scoring.js';
    import { generateFixtures, computeStandings } from './lib/standings.js';
    window.WC = window.WC || {};
    Object.assign(window.WC, { BRACKET_STRUCTURE, WILDCARD_SLOTS, PERMITTED, deriveKnockout, deriveKnockoutFromSets, SCORING, generateFixtures, computeStandings });
```

- [ ] **Step 2: Rename tab label**

In `MOBILE_TABS` (line 145) and `DESKTOP_TABS` (line 151), change `label: 'グループ'` to `label: '結果'` (keep `id: 'group'`, `icon: 'grid'`):

```javascript
        { id: 'group', label: '結果', icon: 'grid' },
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: bridge standings/knockout helpers; rename tab to 結果"
```

---

### Task 6: screens-optview.jsx（KnockoutView を window へ公開）

**Files:**
- Modify: `public/screens-optview.jsx:321`

- [ ] **Step 1: Export KnockoutView**

Change the last line (321) from:

```javascript
Object.assign(window, { OptionViewScreen });
```

to:

```javascript
Object.assign(window, { OptionViewScreen, KnockoutView });
```

- [ ] **Step 2: Commit**

```bash
git add public/screens-optview.jsx
git commit -m "refactor: expose KnockoutView for reuse in results screen"
```

---

### Task 7: screens-group.jsx（結果スクリーン・3サブタブ）

**Files:**
- Modify: `public/screens-group.jsx`（全面書き換え）

- [ ] **Step 1: Rewrite GroupScreen with sub-tabs**

Replace the entire content of `public/screens-group.jsx` with:

```javascript
// 結果スクリーン（読み取り専用）: グループリーグ / ノックアウト / 得点王 の3サブタブ。
function GroupScreen({ T, wide = false }) {
  const [sub, setSub] = React.useState('league'); // 'league' | 'ko' | 'scorer'
  const SUBS = [
    { id: 'league', label: 'グループリーグ' },
    { id: 'ko', label: 'ノックアウト' },
    { id: 'scorer', label: '得点王' },
  ];

  const SubTabs = () => (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {SUBS.map((s) => {
        const active = sub === s.id;
        return (
          <button key={s.id} onClick={() => setSub(s.id)} style={{
            border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 999,
            padding: '8px 16px', fontWeight: 800, fontSize: 13.5,
            background: active ? T.accent : T.card,
            color: active ? T.accentInk : T.sub,
            boxShadow: active ? 'none' : `inset 0 0 0 1px ${T.line}`, transition: '.15s' }}>
            {s.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ padding: wide ? '4px 0 24px' : '4px 16px 16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 11, letterSpacing: 1.4, color: T.faint }}>RESULTS</div>
        <div style={{ fontSize: wide ? 24 : 20, fontWeight: 800, color: T.text, marginTop: 2 }}>大会結果</div>
      </div>
      <SubTabs />
      {sub === 'league' && <LeagueTables T={T} />}
      {sub === 'ko' && <KnockoutResults T={T} />}
      {sub === 'scorer' && <ScorerRanking T={T} />}
    </div>
  );
}

// ---- ①グループリーグ（フルリーグ表）----
function LeagueTables({ T }) {
  const GK = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const groups = window.WC.GROUPS || {};
  const matches = window.WC.GROUP_MATCHES || {};
  const gr = window.WC.GROUP_RESULT || {};
  const TEAM = window.WC.TEAM || {};
  const compute = window.WC.computeStandings;

  const Card = ({ k }) => {
    const members = (groups[k] || []).filter(Boolean);
    const ms = matches[k] || [];
    const hasScores = ms.some((m) => typeof m.ga === 'number' && typeof m.gb === 'number');
    const rows = hasScores && compute ? compute(members, ms) : null;
    // フォールバック: 最終順位の並び（数値なし）
    const order = (gr[k] || []).filter(Boolean);
    const fallback = order.length ? [...order, ...members.filter((c) => !order.includes(c))] : members;

    return (
      <div style={{ background: T.card, borderRadius: 18, padding: 14, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 15, color: T.accent }}>GROUP {k}</span>
        </div>
        {rows ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Archivo', fontWeight: 800,
              fontSize: 10, color: T.faint, padding: '0 4px 6px' }}>
              <span style={{ width: 16 }} /><span style={{ flex: 1 }} />
              <span style={{ width: 28, textAlign: 'center' }}>勝点</span>
              <span style={{ width: 18, textAlign: 'center' }}>試</span>
              <span style={{ width: 46, textAlign: 'center' }}>勝分敗</span>
              <span style={{ width: 30, textAlign: 'right' }}>得失</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {rows.map((r, i) => {
                const tm = TEAM[r.code]; if (!tm) return null;
                const posColor = i === 0 ? T.gold : i === 1 ? T.silver : i < 2 ? T.sub : T.faint;
                return (
                  <div key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <span style={{ width: 16, textAlign: 'center', fontFamily: 'Archivo', fontWeight: 800, color: posColor }}>{i + 1}</span>
                    <span style={{ fontSize: 18 }}>{tm.flag}</span>
                    <span style={{ fontWeight: 700, color: T.text, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tm.ja}</span>
                    <span style={{ width: 28, textAlign: 'center', fontWeight: 900, color: T.text }}>{r.pts}</span>
                    <span style={{ width: 18, textAlign: 'center', color: T.sub }}>{r.played}</span>
                    <span style={{ width: 46, textAlign: 'center', color: T.sub, fontSize: 12 }}>{r.w}-{r.d}-{r.l}</span>
                    <span style={{ width: 30, textAlign: 'right', color: T.sub, fontSize: 12 }}>{r.gd > 0 ? '+' : ''}{r.gd}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {fallback.map((code) => {
              const tm = TEAM[code]; if (!tm) return null;
              const pos = order.length ? order.indexOf(code) : -1;
              const posColor = pos === 0 ? T.gold : pos === 1 ? T.silver : pos >= 0 ? T.sub : T.faint;
              return (
                <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 18, textAlign: 'center', fontFamily: 'Archivo', fontWeight: 800, fontSize: 13, color: posColor }}>{pos >= 0 ? pos + 1 : '–'}</span>
                  <span style={{ fontSize: 20 }}>{tm.flag}</span>
                  <span style={{ fontWeight: 700, color: T.text, fontSize: 14, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tm.ja}</span>
                </div>
              );
            })}
            {fallback.length === 0 && <div style={{ color: T.faint, fontSize: 13 }}>未設定</div>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
      {GK.map((k) => <Card key={k} k={k} />)}
    </div>
  );
}

// ---- ②ノックアウト（ホームと同じ KnockoutView を実結果で）----
function KnockoutResults({ T }) {
  const R = window.WC.RESULT || {};
  const gr = window.WC.GROUP_RESULT || {};
  const TEAM = window.WC.TEAM || {};
  const ROUNDS = ['r32', 'r16', 'qf', 'sf'];
  const LABELS = { r32: 'ベスト32', r16: 'ベスト16', qf: '準々決勝', sf: '準決勝' };
  const der = window.WC.deriveKnockoutFromSets
    ? window.WC.deriveKnockoutFromSets(gr, R.thirdAssign || {}, R.knockout || {})
    : null;
  const champ = R.champion ? TEAM[R.champion] : null;
  const koAny = der && ROUNDS.some((r) => (der.winners[r] || []).some(Boolean));

  if (!der || (!koAny && !champ)) {
    return (
      <div style={{ background: T.card, borderRadius: 16, padding: '26px 18px', textAlign: 'center',
        boxShadow: `inset 0 0 0 1px ${T.line}`, color: T.faint, fontSize: 14, fontWeight: 700 }}>
        ノックアウトの結果はまだありません
      </div>
    );
  }
  return <window.KnockoutView T={T} der={der} champ={champ} ROUNDS={ROUNDS} LABELS={LABELS} />;
}

// ---- ③得点王ランキング ----
function ScorerRanking({ T }) {
  const scorers = [...(window.WC.SCORERS || [])]
    .filter((s) => s && s.name)
    .sort((a, b) => (b.goals || 0) - (a.goals || 0));
  if (scorers.length === 0) {
    return (
      <div style={{ background: T.card, borderRadius: 16, padding: '26px 18px', textAlign: 'center',
        boxShadow: `inset 0 0 0 1px ${T.line}`, color: T.faint, fontSize: 14, fontWeight: 700 }}>
        得点者はまだ登録されていません
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {scorers.map((s, i) => (
        <div key={s.name + i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: T.card,
          borderRadius: 12, padding: '11px 15px', boxShadow: `inset 0 0 0 1px ${T.line}` }}>
          <span style={{ width: 24, textAlign: 'center', fontFamily: 'Archivo', fontWeight: 900, fontSize: 16,
            color: i === 0 ? T.gold : i === 1 ? T.silver : i === 2 ? '#CD7F32' : T.faint }}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 700, color: T.text, fontSize: 15 }}>{s.name}</span>
          <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 18, color: T.accent }}>{s.goals}</span>
          <span style={{ fontSize: 12, color: T.faint, fontWeight: 700 }}>得点</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add public/screens-group.jsx
git commit -m "feat: results screen with league/knockout/scorer sub-tabs"
```

---

### Task 8: admin/index.html（module 橋渡し）

**Files:**
- Modify: `public/admin/index.html:21-22`

- [ ] **Step 1: Add module bridge**

In `public/admin/index.html`, add a `<script type="module">` before the babel admin.jsx script (after line 21, before line 22):

```html
  <script type="module">
    import { WILDCARD_SLOTS, PERMITTED } from '../lib/bracket.js';
    import { generateFixtures, computeStandings } from '../lib/standings.js';
    window.WC = window.WC || {};
    Object.assign(window.WC, { WILDCARD_SLOTS, PERMITTED, generateFixtures, computeStandings });
  </script>
```

- [ ] **Step 2: Commit**

```bash
git add public/admin/index.html
git commit -m "feat: bridge standings/bracket helpers into admin"
```

---

### Task 9: admin.jsx（試合スコア・順位反映・3位枠・得点ランキング）

**Files:**
- Modify: `public/admin/admin.jsx`

- [ ] **Step 1: Normalize new fields in afterLogin**

In `Admin()`'s `afterLogin`, extend the `cfg` normalization (around line 227-234). Add to the `result` object `thirdAssign`, and add top-level `groupMatches`/`scorers`:

```javascript
      const thirdAssign = baseResult.thirdAssign && typeof baseResult.thirdAssign === 'object' ? baseResult.thirdAssign : {};
      const cfg = {
        ...raw,
        result: { champion: baseResult.champion ?? null, runnerUp: baseResult.runnerUp ?? null, topScorer: baseResult.topScorer ?? '', knockout, thirdAssign },
        scorerSuggest: Array.isArray(raw.scorerSuggest) ? raw.scorerSuggest : [],
        schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
        groups: raw.groups && typeof raw.groups === 'object' ? raw.groups : {},
        groupResult: raw.groupResult && typeof raw.groupResult === 'object' ? raw.groupResult : {},
        groupMatches: raw.groupMatches && typeof raw.groupMatches === 'object' ? raw.groupMatches : {},
        scorers: Array.isArray(raw.scorers) ? raw.scorers : [],
      };
```

- [ ] **Step 2: Add Editor helpers for matches/scorers/thirdAssign**

In `Editor()`, after the existing `upKnockout`/`toggleKnockout` helpers (around line 92), add:

```javascript
  // ---- グループ試合スコア ----
  function fixturesFor(k) {
    const members = (cfg.groups[k] || []).filter(Boolean);
    const gen = window.WC?.generateFixtures ? window.WC.generateFixtures(members) : [];
    const existing = cfg.groupMatches[k] || [];
    const find = (a, b) => existing.find((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
    return gen.map(({ a, b }) => {
      const e = find(a, b);
      return { a, b, ga: e ? (e.a === a ? e.ga : e.gb) : null, gb: e ? (e.a === a ? e.gb : e.ga) : null };
    });
  }
  function setMatchScore(k, idx, side, val) {
    setCfg((c) => {
      const list = fixturesForCfg(c, k);
      const v = val === '' ? null : Math.max(0, Math.min(99, parseInt(val, 10) || 0));
      list[idx] = { ...list[idx], [side]: v };
      return { ...c, groupMatches: { ...c.groupMatches, [k]: list } };
    });
  }
  // setCfg 内で最新 cfg からfixtureを得るための純関数
  function fixturesForCfg(c, k) {
    const members = (c.groups[k] || []).filter(Boolean);
    const gen = window.WC?.generateFixtures ? window.WC.generateFixtures(members) : [];
    const existing = c.groupMatches[k] || [];
    const find = (a, b) => existing.find((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
    return gen.map(({ a, b }) => {
      const e = find(a, b);
      return { a, b, ga: e ? (e.a === a ? e.ga : e.gb) : null, gb: e ? (e.a === a ? e.gb : e.ga) : null };
    });
  }
  function applyStandingsToRank(k) {
    setCfg((c) => {
      const members = (c.groups[k] || []).filter(Boolean);
      const rows = window.WC?.computeStandings ? window.WC.computeStandings(members, fixturesForCfg(c, k)) : [];
      const top = rows.map((r) => r.code).slice(0, 4);
      return { ...c, groupResult: { ...c.groupResult, [k]: top } };
    });
  }

  // ---- 3位枠割当 ----
  function setThird(slot, code) {
    setCfg((c) => ({ ...c, result: { ...c.result, thirdAssign: { ...c.result.thirdAssign, [slot]: code || undefined } } }));
  }

  // ---- 得点ランキング ----
  function addScorer() { setCfg((c) => ({ ...c, scorers: [...c.scorers, { name: '', goals: 0 }] })); }
  function setScorer(i, patch) { setCfg((c) => ({ ...c, scorers: c.scorers.map((s, j) => (j === i ? { ...s, ...patch } : s)) })); }
  function delScorer(i) { setCfg((c) => ({ ...c, scorers: c.scorers.filter((_, j) => j !== i) })); }
```

- [ ] **Step 3: Add score inputs + standings reflect into the group section**

In the group section render (inside the `GROUP_KEYS.map`), after the 最終順位 block (after current line 143's closing `</div>` of ranks), add the fixtures editor. Insert before the closing `</div>` of the group item:

```javascript
              <div style={{ fontSize: 12, color: '#9aa', margin: '10px 0 4px' }}>試合スコア</div>
              {fixturesFor(k).map((m, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 13 }}>
                  <span style={{ width: 130, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {teams.find((t) => t.code === m.a)?.flag} {teams.find((t) => t.code === m.a)?.ja}</span>
                  <input type="number" min="0" max="99" value={m.ga ?? ''} onChange={(e) => setMatchScore(k, idx, 'ga', e.target.value)} style={{ ...inputStyle, width: 48, textAlign: 'center' }} />
                  <span>-</span>
                  <input type="number" min="0" max="99" value={m.gb ?? ''} onChange={(e) => setMatchScore(k, idx, 'gb', e.target.value)} style={{ ...inputStyle, width: 48, textAlign: 'center' }} />
                  <span style={{ width: 130, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {teams.find((t) => t.code === m.b)?.flag} {teams.find((t) => t.code === m.b)?.ja}</span>
                </div>
              ))}
              <button onClick={() => applyStandingsToRank(k)} style={{ ...inputStyle, cursor: 'pointer', marginTop: 6 }}>順位表から最終順位に反映</button>
```

Note: `teams` is already in scope in `Editor`. `members`/`ranks` references already exist.

- [ ] **Step 4: Add 3位枠割当 UI into the 正解 section**

In the 正解（勝敗）section, after the knockout rounds `.map` (after current line 176's closing `)`), add before the section close:

```javascript
        <div style={{ fontSize: 13, color: '#9aa', margin: '12px 0 6px', fontWeight: 800 }}>実際の3位枠割当（ノックアウト表の対戦カード用）</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {(window.WC?.WILDCARD_SLOTS || []).map((slot) => {
            const permitted = (window.WC?.PERMITTED || {})[slot] || [];
            const opts = teams.filter((t) => {
              const g = Object.keys(cfg.groups).find((gk) => (cfg.groups[gk] || []).includes(t.code));
              return g && permitted.includes(g);
            });
            return (
              <label key={slot} style={{ fontSize: 12 }}>{slot} <span style={{ color: '#6a7' }}>({permitted.join('/')})</span><br />
                <select value={cfg.result.thirdAssign[slot] || ''} onChange={(e) => setThird(slot, e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  {opts.map((t) => <option key={t.code} value={t.code}>{t.flag} {t.ja}</option>)}
                </select>
              </label>
            );
          })}
        </div>
```

- [ ] **Step 5: Add 得点ランキング section**

Add a new `<Section>` after the 得点王候補 section (after current line 187):

```javascript
      <Section title="得点ランキング（実際の得点数）">
        {cfg.scorers.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <input value={s.name} placeholder="選手名" onChange={(e) => setScorer(i, { name: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            <input type="number" min="0" value={s.goals} onChange={(e) => setScorer(i, { goals: Math.max(0, parseInt(e.target.value, 10) || 0) })} style={{ ...inputStyle, width: 70, textAlign: 'center' }} />
            <span style={{ fontSize: 12, color: '#9aa' }}>点</span>
            <button onClick={() => delScorer(i)} style={{ ...inputStyle, cursor: 'pointer', color: '#FF6B6B' }}>削除</button>
          </div>
        ))}
        <button onClick={addScorer} style={{ ...inputStyle, cursor: 'pointer', marginTop: 6 }}>＋ 得点者を追加</button>
      </Section>
```

- [ ] **Step 6: Verify save sends new fields**

`save()` already PUTs the whole `cfg`. Since `cfg` now contains `groupMatches`/`scorers` and `result.thirdAssign`, no change needed. But ensure `groupMatches` is populated from edits: `setMatchScore` writes `cfg.groupMatches[k]`. Confirm the validate.js accepts the shape (a/b uppercase, ga/gb null|int).

- [ ] **Step 7: Commit**

```bash
git add public/admin/admin.jsx
git commit -m "feat(admin): group match scores, rank reflect, third-place assign, scorer ranking"
```

---

### Task 10: 検証スモーク & デプロイ

**Files:** none (verification)

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: PASS（standings 6 + bracket-fromsets 4 + validate 新7 + 既存すべて）

- [ ] **Step 2: Headless smoke (optional but recommended)**

Run `wrangler pages dev public` locally, open `/`, switch to 結果 tab, verify 3 sub-tabs render without console errors; open `/admin`, log in, verify score inputs / third-assign / scorer list render. Verify 0 console errors.

- [ ] **Step 3: Deploy**

Run: `npm run deploy`
Expected: Cloudflare Pages にデプロイ成功（URL 出力）。

- [ ] **Step 4: Final commit (if any pending)**

```bash
git add -A && git commit -m "chore: live results + scorer ranking ready" || true
```
```
```

---

## Self-Review

**Spec coverage:**
- 結果タブ3サブタブ → Task 7 ✓ / タブ名「結果」→ Task 5 ✓
- フルリーグ表（自動集計）→ Task 1 (logic) + Task 7 (UI) ✓
- ノックアウト＝KnockoutView 実結果 → Task 2 (deriveKnockoutFromSets) + Task 6 (export) + Task 7 (KnockoutResults) ✓
- 得点王ランキング → Task 7 (ScorerRanking) + Task 9 (admin) ✓
- 最終順位 自動算出＋手動上書き → Task 9 Step 3 (applyStandingsToRank) ✓
- result.thirdAssign → Task 3 (validate/defaults) + Task 4 (data) + Task 9 (admin) ✓
- groupMatches/scorers スキーマ → Task 3 ✓ / data 反映 → Task 4 ✓
- 検証＋デプロイ → Task 10 ✓

**Placeholder scan:** 各 step に実コードを記載済み。「適切に」等の曖昧表現なし。

**Type consistency:** `computeStandings(members, matches)` 戻り値 `{code,played,w,d,l,gf,ga,gd,pts}` を Task 1/7/9 で一致使用。`deriveKnockoutFromSets(groupRank, thirdAssign, sets)` を Task 2/7 で一致。`window.KnockoutView` props `{T, der, champ, ROUNDS, LABELS}` は screens-optview.jsx の定義と一致。
