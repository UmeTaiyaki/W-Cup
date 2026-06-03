# Phase A: グループ（48カ国・12組）対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 出場国を2026公式の48カ国・12グループ（A〜L）に刷新し、管理画面でグループ表（所属＋最終順位）を編集、予想アプリに読み取り専用「グループ」タブを追加する（旧トーナメントタブは非表示）。

**Architecture:** KV共有設定（`config:v1`）に `groups`/`groupResult` を後方互換で追加。サーバー検証（`validate.js`）を拡張し、デフォルト（`defaults.js`）とブラウザ側フォールバック（`data.js`）を48カ国＋グループに更新。予想アプリは新規 `GroupScreen` でリーグ表を表示。採点・ユーザーのグループ順位予想・ベスト32は Phase B（本計画では非対象）。

**Tech Stack:** Cloudflare Pages Functions (ESM JS) + KV / React 18 + Babel standalone (CDN, ビルド無し) / テストは `node --test`（`npm test`）。

参照仕様: `docs/superpowers/specs/2026-06-03-groups-phase-a-design.md`

---

## ファイル構成

| ファイル | 役割 | 区分 |
|---|---|---|
| `functions/_lib/defaults.js` | デフォルトを48カ国＋groups＋空groupResultに更新 | 変更 |
| `functions/_lib/validate.js` | groups/groupResult の検証・正規化を追加 | 変更 |
| `functions/_lib/validate.test.js` | 新フィールドのテスト追加 | 変更 |
| `public/data.js` | TEAMSを48に更新、`GROUPS`/`GROUP_RESULT` 追加＋fetchConfig取り込み | 変更 |
| `public/ui.jsx` | Iconに `grid` を追加 | 変更 |
| `public/screens-group.jsx` | GroupScreen（リーグ表） | 新規 |
| `public/index.html` | タブを bracket→group、renderScreen/showSwitcher、script include | 変更 |
| `public/admin/admin.jsx` | グループ表UI、afterLogin正規化、R16セクション削除 | 変更 |

**正準データ（このplan内の唯一の真実）:** 48カ国の `code/ja/flag/c` と `groups` 所属は **Task 1 に全量を記載**。Task 3（data.js）はこの値を転記する。

---

## Task 1: デフォルトを48カ国・12グループに更新

**Files:**
- Modify: `functions/_lib/defaults.js`

- [ ] **Step 1: `DEFAULT_CONFIG` を全置換**

`functions/_lib/defaults.js` の `export const DEFAULT_CONFIG = {...};` を以下で**全置換**する。ENG/SCO の旗はタグ列。

```js
// 大会設定のデフォルト（KVが空のときのGETフォールバック＆管理画面の初期シード）
// teams/groups の値は public/data.js と一致させること（Task 3 で転記）。
export const DEFAULT_CONFIG = {
  version: 1,
  updatedAt: null,
  teams: [
    { code: 'MEX', ja: 'メキシコ',             flag: '🇲🇽', c: '#1E7C45' },
    { code: 'KOR', ja: '韓国',                 flag: '🇰🇷', c: '#C8334A' },
    { code: 'RSA', ja: '南アフリカ',           flag: '🇿🇦', c: '#007A4D' },
    { code: 'CZE', ja: 'チェコ',               flag: '🇨🇿', c: '#2C5BB5' },
    { code: 'CAN', ja: 'カナダ',               flag: '🇨🇦', c: '#D9322E' },
    { code: 'SUI', ja: 'スイス',               flag: '🇨🇭', c: '#D62B30' },
    { code: 'QAT', ja: 'カタール',             flag: '🇶🇦', c: '#8A1538' },
    { code: 'BIH', ja: 'ボスニア・ヘルツェゴビナ', flag: '🇧🇦', c: '#2E4A9E' },
    { code: 'BRA', ja: 'ブラジル',             flag: '🇧🇷', c: '#FBE14B' },
    { code: 'MAR', ja: 'モロッコ',             flag: '🇲🇦', c: '#16704A' },
    { code: 'SCO', ja: 'スコットランド',       flag: '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', c: '#2A5BA8' },
    { code: 'HAI', ja: 'ハイチ',               flag: '🇭🇹', c: '#1E50E6' },
    { code: 'USA', ja: 'アメリカ',             flag: '🇺🇸', c: '#3B4C99' },
    { code: 'AUS', ja: 'オーストラリア',       flag: '🇦🇺', c: '#E0A100' },
    { code: 'PAR', ja: 'パラグアイ',           flag: '🇵🇾', c: '#C8334A' },
    { code: 'TUR', ja: 'トルコ',               flag: '🇹🇷', c: '#E03A3A' },
    { code: 'GER', ja: 'ドイツ',               flag: '🇩🇪', c: '#3A3A3A' },
    { code: 'ECU', ja: 'エクアドル',           flag: '🇪🇨', c: '#F4C430' },
    { code: 'CIV', ja: 'コートジボワール',     flag: '🇨🇮', c: '#F5821F' },
    { code: 'CUW', ja: 'キュラソー',           flag: '🇨🇼', c: '#1B2A6B' },
    { code: 'NED', ja: 'オランダ',             flag: '🇳🇱', c: '#F5821F' },
    { code: 'JPN', ja: '日本',                 flag: '🇯🇵', c: '#1B2A6B' },
    { code: 'TUN', ja: 'チュニジア',           flag: '🇹🇳', c: '#C8334A' },
    { code: 'SWE', ja: 'スウェーデン',         flag: '🇸🇪', c: '#2C7DB5' },
    { code: 'BEL', ja: 'ベルギー',             flag: '🇧🇪', c: '#D62B30' },
    { code: 'IRN', ja: 'イラン',               flag: '🇮🇷', c: '#1E8A4C' },
    { code: 'EGY', ja: 'エジプト',             flag: '🇪🇬', c: '#C8334A' },
    { code: 'NZL', ja: 'ニュージーランド',     flag: '🇳🇿', c: '#1B2A6B' },
    { code: 'ESP', ja: 'スペイン',             flag: '🇪🇸', c: '#E03A3A' },
    { code: 'URU', ja: 'ウルグアイ',           flag: '🇺🇾', c: '#4FA0DA' },
    { code: 'KSA', ja: 'サウジアラビア',       flag: '🇸🇦', c: '#127A4A' },
    { code: 'CPV', ja: 'カーボベルデ',         flag: '🇨🇻', c: '#2D5BC4' },
    { code: 'FRA', ja: 'フランス',             flag: '🇫🇷', c: '#2D5BC4' },
    { code: 'SEN', ja: 'セネガル',             flag: '🇸🇳', c: '#1E8A4C' },
    { code: 'NOR', ja: 'ノルウェー',           flag: '🇳🇴', c: '#C63A4A' },
    { code: 'IRQ', ja: 'イラク',               flag: '🇮🇶', c: '#C8334A' },
    { code: 'ARG', ja: 'アルゼンチン',         flag: '🇦🇷', c: '#75AADB' },
    { code: 'AUT', ja: 'オーストリア',         flag: '🇦🇹', c: '#E64A4A' },
    { code: 'ALG', ja: 'アルジェリア',         flag: '🇩🇿', c: '#16704A' },
    { code: 'JOR', ja: 'ヨルダン',             flag: '🇯🇴', c: '#C8334A' },
    { code: 'POR', ja: 'ポルトガル',           flag: '🇵🇹', c: '#1E8A4C' },
    { code: 'COL', ja: 'コロンビア',           flag: '🇨🇴', c: '#F4C430' },
    { code: 'UZB', ja: 'ウズベキスタン',       flag: '🇺🇿', c: '#2C7DB5' },
    { code: 'COD', ja: 'DRコンゴ',             flag: '🇨🇩', c: '#2C9A4A' },
    { code: 'ENG', ja: 'イングランド',         flag: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', c: '#E64A4A' },
    { code: 'CRO', ja: 'クロアチア',           flag: '🇭🇷', c: '#D1334A' },
    { code: 'PAN', ja: 'パナマ',               flag: '🇵🇦', c: '#C8334A' },
    { code: 'GHA', ja: 'ガーナ',               flag: '🇬🇭', c: '#D6334C' },
  ],
  groups: {
    A: ['MEX', 'KOR', 'RSA', 'CZE'],
    B: ['CAN', 'SUI', 'QAT', 'BIH'],
    C: ['BRA', 'MAR', 'SCO', 'HAI'],
    D: ['USA', 'AUS', 'PAR', 'TUR'],
    E: ['GER', 'ECU', 'CIV', 'CUW'],
    F: ['NED', 'JPN', 'TUN', 'SWE'],
    G: ['BEL', 'IRN', 'EGY', 'NZL'],
    H: ['ESP', 'URU', 'KSA', 'CPV'],
    I: ['FRA', 'SEN', 'NOR', 'IRQ'],
    J: ['ARG', 'AUT', 'ALG', 'JOR'],
    K: ['POR', 'COL', 'UZB', 'COD'],
    L: ['ENG', 'CRO', 'PAN', 'GHA'],
  },
  groupResult: { A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], I: [], J: [], K: [], L: [] },
  scorerSuggest: [
    'ムバッペ', 'ハーランド', 'メッシ', 'ヴィニシウス', 'ヤマル',
    'ベリンガム', 'ケイン', 'グリーズマン', 'ラウタロ', '三笘',
  ],
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
  },
  schedule: [],
  r16Teams: [],
};
```

- [ ] **Step 2: チーム数・グループ・所属コードの整合チェック**

Run:
```bash
node -e "import('./functions/_lib/defaults.js').then(m=>{const c=m.DEFAULT_CONFIG;const codes=new Set(c.teams.map(t=>t.code));const dup=c.teams.length-codes.size;const gk=Object.keys(c.groups);const flat=gk.flatMap(k=>c.groups[k]);const bad=flat.filter(x=>!codes.has(x));console.log('teams',c.teams.length,'dup',dup,'groups',gk.length,'members',flat.length,'badMembers',bad.length)})"
```
Expected: `teams 48 dup 0 groups 12 members 48 badMembers 0`

- [ ] **Step 3: コミット**

```bash
git add functions/_lib/defaults.js
git commit -m "feat: update defaults to 48 teams and 12 groups (2026)"
```

---

## Task 2: 検証に groups/groupResult を追加（TDD）

**Files:**
- Modify: `functions/_lib/validate.test.js`
- Modify: `functions/_lib/validate.js`

- [ ] **Step 1: 失敗するテストを追加**

`functions/_lib/validate.test.js` の末尾（最後の `test(...)` の後）に追記:
```js
test('groups: 妥当な所属は通り正規化される', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }, { code: 'BBB', ja: 'B' }],
    groups: { A: ['aaa', 'BBB'] },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.groups.A, ['AAA', 'BBB']);
});

test('groups: 未登録コードは失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    groups: { A: ['ZZZ'] },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /groups/);
});

test('groups: 不正なキーは失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    groups: { Z: ['AAA'] },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /groups/);
});

test('groupResult: 所属外コードは失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }, { code: 'BBB', ja: 'B' }],
    groups: { A: ['AAA'] },
    groupResult: { A: ['BBB'] },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /groupResult/);
});

test('groupResult: 所属内コードは通る', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }, { code: 'BBB', ja: 'B' }],
    groups: { A: ['AAA', 'BBB'] },
    groupResult: { A: ['BBB', 'AAA'] },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.groupResult.A, ['BBB', 'AAA']);
});

test('groups/groupResult 省略時は空オブジェクト', () => {
  const r = validateConfig({ teams: [{ code: 'AAA', ja: 'A' }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.groups, {});
  assert.deepEqual(r.value.groupResult, {});
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL（新規6テストが失敗。`r.value.groups` が undefined 等）

- [ ] **Step 3: `validate.js` に検証を追加**

`functions/_lib/validate.js` の `// schedule（緩め）` ブロックの**直後**、`return { ok: true, value: {...} }` の**直前**に以下を挿入:
```js
  // groups（A〜L、各コードは teams 内。空文字スロット許容）
  const GROUP_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const groups = {};
  if (input.groups != null) {
    if (!isObj(input.groups)) return { ok: false, error: 'groups はオブジェクトが必要です' };
    for (const k of Object.keys(input.groups)) {
      if (!GROUP_KEYS.includes(k)) return { ok: false, error: `groups に不正なキー: ${k}` };
      const arr = input.groups[k];
      if (!Array.isArray(arr)) return { ok: false, error: `groups.${k} は配列が必要です` };
      const norm = [];
      for (const c of arr) {
        if (c === '') { norm.push(''); continue; }
        if (!(isStr(c) && known(c.toUpperCase()))) return { ok: false, error: `groups.${k} に未登録コード: ${c}` };
        norm.push(c.toUpperCase());
      }
      groups[k] = norm;
    }
  }

  // groupResult（各コードは対応 groups[k] の所属内。空文字スロット許容）
  const groupResult = {};
  if (input.groupResult != null) {
    if (!isObj(input.groupResult)) return { ok: false, error: 'groupResult はオブジェクトが必要です' };
    for (const k of Object.keys(input.groupResult)) {
      if (!GROUP_KEYS.includes(k)) return { ok: false, error: `groupResult に不正なキー: ${k}` };
      const arr = input.groupResult[k];
      if (!Array.isArray(arr)) return { ok: false, error: `groupResult.${k} は配列が必要です` };
      const members = new Set((groups[k] || []).filter(Boolean));
      const norm = [];
      for (const c of arr) {
        if (c === '') { norm.push(''); continue; }
        const up = isStr(c) ? c.toUpperCase() : '';
        if (!up || !members.has(up)) return { ok: false, error: `groupResult.${k} に所属外コード: ${c}` };
        norm.push(up);
      }
      groupResult[k] = norm;
    }
  }
```

そして最終の `return` を次に変更（`groups, groupResult` を追加）:
```js
  return { ok: true, value: { version: 1, updatedAt: null, teams, r16Teams, scorerSuggest, result, schedule, groups, groupResult } };
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS（既存6＋新規6＝12テスト、`# fail 0`）

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/validate.js functions/_lib/validate.test.js
git commit -m "feat: validate groups and groupResult in config"
```

---

## Task 3: data.js を48カ国＋GROUPS対応に更新

**Files:**
- Modify: `public/data.js`

- [ ] **Step 1: 内部 `TEAMS` を48カ国に置換**

`public/data.js` の `const TEAMS = [ ... ];`（8〜41行目相当）を、**Task 1 の `teams` 配列と同一の値**で置換する（オブジェクト形式 `{ code, ja, flag, c }` はそのまま。Task 1 の48件をそのまま転記）。

- [ ] **Step 2: 内部 `R16_TEAMS` を空配列にし、`GROUPS` デフォルトを追加**

`public/data.js` の `const R16_TEAMS = [ ... ];` を次に置換:
```js
  const R16_TEAMS = []; // Phase A では未使用（Phase B で再設計）
```
さらに同ファイル内、`const SCORING = {` の**直前**に以下を追加（Task 1 の `groups` と同一値）:
```js
  // ---- グループ（A〜L 各4チーム。所属の単一の真実）----------
  const GROUPS = {
    A: ['MEX', 'KOR', 'RSA', 'CZE'],
    B: ['CAN', 'SUI', 'QAT', 'BIH'],
    C: ['BRA', 'MAR', 'SCO', 'HAI'],
    D: ['USA', 'AUS', 'PAR', 'TUR'],
    E: ['GER', 'ECU', 'CIV', 'CUW'],
    F: ['NED', 'JPN', 'TUN', 'SWE'],
    G: ['BEL', 'IRN', 'EGY', 'NZL'],
    H: ['ESP', 'URU', 'KSA', 'CPV'],
    I: ['FRA', 'SEN', 'NOR', 'IRQ'],
    J: ['ARG', 'AUT', 'ALG', 'JOR'],
    K: ['POR', 'COL', 'UZB', 'COD'],
    L: ['ENG', 'CRO', 'PAN', 'GHA'],
  };
```

- [ ] **Step 3: `window.WC` export に GROUPS/GROUP_RESULT を追加**

`public/data.js` の `window.WC = { ... };` のキー一覧に `GROUPS, GROUP_RESULT: {},` を追加する。具体的には `R16_TEAMS, SCORING, RESULT,` を含む行に `GROUPS,` を加え、末尾付近に `GROUP_RESULT: {},` を加える。例:
```js
  window.WC = {
    TEAMS, TEAM, MEMBERS, MEMBER_COLORS, R16_TEAMS, GROUPS, GROUP_RESULT: {},
    SCORING, RESULT, SEED, SCORER_SUGGEST, THEMES,
    load, save, reset, scoreMember, emptyPred, addMember, removeMember,
  };
```

- [ ] **Step 4: `fetchConfig` に groups/groupResult 取り込みを追加**

`public/data.js` の `window.WC.fetchConfig` 内、`if (Array.isArray(cfg.schedule)) window.WC.SCHEDULE = cfg.schedule;` の**直後**に追加:
```js
      if (cfg.groups && typeof cfg.groups === 'object') window.WC.GROUPS = cfg.groups;
      if (cfg.groupResult && typeof cfg.groupResult === 'object') window.WC.GROUP_RESULT = cfg.groupResult;
```

- [ ] **Step 5: 構文・整合チェック**

Run: `node --check public/data.js`
Expected: exit 0（無出力）

Run:
```bash
node -e "global.window={};global.localStorage={getItem(){return null},setItem(){},removeItem(){}};require('./public/data.js');const w=window.WC;console.log('teams',w.TEAMS.length,'groups',Object.keys(w.GROUPS).length,'gr',typeof w.GROUP_RESULT)"
```
※ `package.json` は `"type":"module"` のため `require` は使えません。代わりに上記が失敗した場合は次で確認:
```bash
node --input-type=commonjs -e "global.window={};global.localStorage={getItem(){return null},setItem(){},removeItem(){}};require('/Users/hikaru/dev/W-Cup/public/data.js');const w=window.WC;console.log('teams',w.TEAMS.length,'groups',Object.keys(w.GROUPS).length)"
```
Expected: `teams 48 groups 12`（`--input-type=commonjs` で require 可能）

- [ ] **Step 6: コミット**

```bash
git add public/data.js
git commit -m "feat: 48 teams and GROUPS fallback in data layer"
```

---

## Task 4: GroupScreen と「グループ」タブ

**Files:**
- Create: `public/screens-group.jsx`
- Modify: `public/ui.jsx`
- Modify: `public/index.html`

- [ ] **Step 1: `public/ui.jsx` の Icon に `grid` を追加**

`public/ui.jsx` のアイコン定義（`bracket:` の行、14行目付近）の**直後**に追加:
```js
    grid: <g {...p}><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></g>,
```

- [ ] **Step 2: `public/screens-group.jsx` を作成**

```jsx
// グループステージのリーグ表（読み取り専用）。window.WC.GROUPS / GROUP_RESULT を表示。
function GroupScreen({ T, wide = false }) {
  const GK = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const groups = window.WC.GROUPS || {};
  const gr = window.WC.GROUP_RESULT || {};
  const TEAM = window.WC.TEAM || {};

  const Card = ({ k }) => {
    const members = (groups[k] || []).filter(Boolean);
    const order = (gr[k] || []).filter(Boolean);
    const rest = order.length ? members.filter((c) => !order.includes(c)) : members;
    const list = order.length ? [...order, ...rest] : members;
    return (
      <div style={{ background: T.card, borderRadius: 18, padding: 14, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 15, color: T.accent }}>GROUP {k}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {list.map((code) => {
            const tm = TEAM[code];
            if (!tm) return null;
            const pos = order.length ? order.indexOf(code) : -1;
            const posColor = pos === 0 ? T.gold : pos === 1 ? T.silver : pos >= 0 ? T.sub : T.faint;
            return (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 18, textAlign: 'center', fontFamily: 'Archivo', fontWeight: 800,
                  fontSize: 13, color: posColor }}>{pos >= 0 ? pos + 1 : '–'}</span>
                <span style={{ fontSize: 20 }}>{tm.flag}</span>
                <span style={{ fontWeight: 700, color: T.text, fontSize: 14, flex: 1, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{tm.ja}</span>
              </div>
            );
          })}
          {list.length === 0 && <div style={{ color: T.faint, fontSize: 13 }}>未設定</div>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: wide ? '4px 0 24px' : '4px 16px 16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 11, letterSpacing: 1.4, color: T.faint }}>GROUP STAGE</div>
        <div style={{ fontSize: wide ? 24 : 20, fontWeight: 800, color: T.text, marginTop: 2 }}>グループリーグ</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
        {GK.map((k) => <Card key={k} k={k} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `public/index.html` に script include を追加**

`<script type="text/babel" src="screens-rank.jsx"></script>` の**直後**に追加:
```html
  <script type="text/babel" src="screens-group.jsx"></script>
```

- [ ] **Step 4: タブ定義を bracket→group に変更**

`public/index.html` の `MOBILE_TABS` 内
```js
        { id: 'bracket', label: 'トーナメント', icon: 'bracket' },
```
を
```js
        { id: 'group', label: 'グループ', icon: 'grid' },
```
に変更。`DESKTOP_TABS` 内
```js
        { id: 'bracket', label: 'トーナメント', icon: 'bracket' },
```
を
```js
        { id: 'group', label: 'グループ', icon: 'grid' },
```
に変更。

- [ ] **Step 5: renderScreen と showSwitcher を更新**

`public/index.html` の `renderScreen` 内
```js
        if (tab === 'bracket') return <BracketScreen T={T} member={member} pred={pred}
          setBracket={setBracket} wide={wide} availWidth={contentAvail} />;
```
を
```js
        if (tab === 'group') return <GroupScreen T={T} wide={wide} />;
```
に変更。さらに
```js
      const showSwitcher = tab === 'summary' || tab === 'input' || tab === 'bracket';
```
を
```js
      const showSwitcher = tab === 'summary' || tab === 'input';
```
に変更。

- [ ] **Step 6: 配信・描画確認**

Run:
```bash
cd /Users/hikaru/dev/W-Cup/public && (python3 -m http.server 8799 >/tmp/h.log 2>&1 &) ; sleep 1
curl -s -o /dev/null -w "group:%{http_code}\n" http://localhost:8799/screens-group.jsx
curl -s -o /dev/null -w "index:%{http_code}\n" http://localhost:8799/index.html
pkill -f "http.server 8799"
```
Expected: `group:200` `index:200`

Run（ヘッドレスでグループ表描画とトーナメント非表示を確認）:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cd /Users/hikaru/dev/W-Cup/public && (python3 -m http.server 8799 >/tmp/h.log 2>&1 &) ; sleep 1
"$CH" --headless=new --disable-gpu --no-sandbox --window-size=1366,820 --virtual-time-budget=7000 --dump-dom "http://localhost:8799/" 2>/dev/null > /tmp/g.html
grep -c 'グループ' /tmp/g.html; grep -c 'トーナメント' /tmp/g.html
pkill -f "http.server 8799"
```
Expected: `グループ` のヒットが1以上、`トーナメント` のヒットが0（タブから消えている。`/api/config` は404でデフォルトのGROUPS表示）。

- [ ] **Step 7: コミット**

```bash
git add public/ui.jsx public/screens-group.jsx public/index.html
git commit -m "feat: add group standings tab, hide tournament tab"
```

---

## Task 5: 管理画面をグループ表UIに

**Files:**
- Modify: `public/admin/admin.jsx`

- [ ] **Step 1: `afterLogin` の正規化に groups/groupResult を追加**

`public/admin/admin.jsx` の `afterLogin` 内、イミュータブルに構築している `const cfg = { ...raw, ... }` オブジェクトに次の2プロパティを追加（`schedule:` の行の後など、オブジェクト内）:
```js
        groups: raw.groups && typeof raw.groups === 'object' ? raw.groups : {},
        groupResult: raw.groupResult && typeof raw.groupResult === 'object' ? raw.groupResult : {},
```

- [ ] **Step 2: Editor にグループ更新ヘルパを追加**

`public/admin/admin.jsx` の `Editor` コンポーネント内、`function up(patch) { ... }` の定義の**直後**に追加:
```js
  const GROUP_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  function setGroupMember(k, i, code) {
    setCfg((c) => {
      const g = { ...c.groups, [k]: [...(c.groups[k] || ['', '', '', ''])] };
      g[k][i] = code || '';
      return { ...c, groups: g };
    });
  }
  function setGroupRank(k, i, code) {
    setCfg((c) => {
      const gr = { ...c.groupResult, [k]: [...(c.groupResult[k] || ['', '', '', ''])] };
      gr[k][i] = code || '';
      return { ...c, groupResult: gr };
    });
  }
```

- [ ] **Step 3: 「グループ」セクションを追加**

`public/admin/admin.jsx` の Editor の `return (...)` 内、出場国の `<Section title={...出場国...}>` の**直前**に以下を挿入:
```jsx
      <Section title="グループ（所属＋最終順位）">
        {GROUP_KEYS.map((k) => {
          const members = cfg.groups[k] || ['', '', '', ''];
          const memberTeams = teams.filter((t) => (cfg.groups[k] || []).includes(t.code));
          const ranks = cfg.groupResult[k] || [];
          return (
            <div key={k} style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #222' }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>グループ {k}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {[0, 1, 2, 3].map((i) => (
                  <TeamSelect key={i} teams={teams} value={members[i]} onChange={(c) => setGroupMember(k, i, c)} />
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#9aa', marginBottom: 4 }}>最終順位</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[0, 1, 2, 3].map((i) => (
                  <label key={i} style={{ fontSize: 13 }}>{i + 1}位{' '}
                    <TeamSelect teams={memberTeams} value={ranks[i]} onChange={(c) => setGroupRank(k, i, c)} />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </Section>
```

- [ ] **Step 4: 「R16 組み合わせ」セクションを削除**

`public/admin/admin.jsx` の `<Section title="R16 組み合わせ（8試合）"> ... </Section>` のブロック全体を削除する（Phase B で再設計）。`r16` / `setR16` のローカル変数・関数もこのセクションでのみ使用しているため、未使用になるものは削除する（`const r16 = ...` と `function setR16(...)`）。

- [ ] **Step 5: 配信・描画確認**

Run:
```bash
cd /Users/hikaru/dev/W-Cup/public && (python3 -m http.server 8799 >/tmp/h.log 2>&1 &) ; sleep 1
curl -s -o /dev/null -w "adminjsx:%{http_code}\n" http://localhost:8799/admin/admin.jsx
pkill -f "http.server 8799"
```
Expected: `adminjsx:200`

- [ ] **Step 6: コミット**

```bash
git add public/admin/admin.jsx
git commit -m "feat: group-table admin UI, remove R16 section"
```

---

## Task 6: ローカル結合テスト → デプロイ

**Files:** なし（検証とデプロイ）

- [ ] **Step 1: `wrangler pages dev` 起動**

Run（バックグラウンド）: `npx wrangler pages dev public --port 8788 --ip 127.0.0.1`
（`.dev.vars` の `ADMIN_PASSWORD` が読まれる。`wrangler.toml` の KV バインド `CONFIG` が local KV としてエミュレート）
Expected: `Ready on http://127.0.0.1:8788`、バインド一覧に `env.CONFIG` と `env.ADMIN_PASSWORD`。

- [ ] **Step 2: GET が48カ国＋groups を返す**

Run（curl不可環境のため Chrome 経由）:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CH" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=5000 --dump-dom "http://127.0.0.1:8788/api/config" 2>/dev/null | sed 's/<[^>]*>//g' | grep -o '"groups"' | head -1
```
Expected: `"groups"` を含む（48カ国＋groups のデフォルトが返る）。

- [ ] **Step 3: グループ往復保存を確認（同一オリジン fetch テストページ）**

一時ファイル `public/__gtest.html` を作成:
```html
<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre id="o">run</pre>
<script>
const PW='localtest123';
async function run(){
  const cfg=await (await fetch('/api/config',{cache:'no-store'})).json();
  cfg.groupResult=cfg.groupResult||{}; cfg.groupResult.A=[cfg.groups.A[1],cfg.groups.A[0]];
  const p=await fetch('/api/config',{method:'PUT',headers:{'authorization':'Bearer '+PW,'content-type':'application/json'},body:JSON.stringify(cfg)});
  const pb=await p.json();
  const after=await (await fetch('/api/config',{cache:'no-store'})).json();
  document.getElementById('o').textContent='R '+JSON.stringify({put:p.status,ok:pb.ok,a:after.groupResult.A});
}
run().catch(e=>document.getElementById('o').textContent='ERR '+e);
</script></body></html>
```
Run:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CH" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=8000 --dump-dom "http://127.0.0.1:8788/__gtest.html" 2>/dev/null | sed 's/<[^>]*>//g' | grep -o 'R {.*}' | head -1
rm -f /Users/hikaru/dev/W-Cup/public/__gtest.html
```
Expected: `R {"put":200,"ok":true,"a":["KOR","MEX"]}`（A組の順位を 2番目→1番目で保存し、GETで反映）。

- [ ] **Step 4: アプリ画面の確認**

Run:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CH" --headless=new --disable-gpu --no-sandbox --window-size=1366,820 --virtual-time-budget=8000 --dump-dom "http://127.0.0.1:8788/" 2>/dev/null > /tmp/app.html
grep -c 'GROUP A\|グループリーグ' /tmp/app.html
"$CH" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=7000 --dump-dom "http://127.0.0.1:8788/admin/" 2>/dev/null | grep -o '管理ログイン' | head -1
```
Expected: 1行目が1以上（グループ表が描画）、2行目に `管理ログイン`。停止: `pkill -f "wrangler pages dev"`。

- [ ] **Step 5: 本番デプロイ**

Run: `npx wrangler pages deploy public --project-name=wcup2026-yosou --commit-dirty=true`
Expected: `Deployment complete!` と URL。

- [ ] **Step 6: 本番確認**

Run:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CH" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=6000 --dump-dom "https://wcup2026-yosou.pages.dev/api/config" 2>/dev/null | sed 's/<[^>]*>//g' | grep -o '"groups"' | head -1
"$CH" --headless=new --disable-gpu --no-sandbox --window-size=1366,820 --virtual-time-budget=8000 --dump-dom "https://wcup2026-yosou.pages.dev/" 2>/dev/null | grep -o 'グループリーグ' | head -1
```
Expected: `"groups"` と `グループリーグ` が出る。
注意: 本番KVに旧スキーマ（groups無し）が保存済みの場合は GET がそれを返し groups が欠落する。その場合は `/admin` でログイン→保存し直して移行（または本番KVの該当キーを削除してデフォルトに戻す）。

- [ ] **Step 7: 最終コミット**

```bash
git add -A
git commit -m "feat: groups phase A (48 teams, 12 groups, admin + display)" || echo "nothing to commit"
```

---

## 自己レビュー結果

- **仕様カバレッジ**: 48カ国・12グループ刷新(Task1,3) / groups・groupResult 検証(Task2) / data.js 取り込み(Task3) / グループタブ＋GroupScreen(Task4) / 旧トーナメント非表示(Task4 showSwitcher・tabs・renderScreen) / admin グループ表UI＋R16削除(Task5) / 結合・デプロイ(Task6) — 仕様の全節に対応。
- **非スコープ明示**: ユーザーのグループ順位予想・ベスト32・3位枠・採点刷新・旧BracketScreen撤去は Phase B（タスクに含めない）。
- **型/名称整合**: 設定キー `groups`(A〜L→code配列) / `groupResult`(同) / `window.WC.GROUPS`・`GROUP_RESULT` / `validateConfig` 返り値に `groups,groupResult` 追加 / `GroupScreen({T,wide})` / タブ id `group`・icon `grid` を全タスクで統一。
- **プレースホルダ**: 各コードステップに完全コード。48カ国データは Task1 に全量記載し Task3 はそこからの転記指示（具体ファイル・配列を明示）。
- **環境差異**: `node --test` はグロブ指定（`npm test`）、`require` は `--input-type=commonjs`、`curl` 不可のため Chrome 経由、を各所に明記。
