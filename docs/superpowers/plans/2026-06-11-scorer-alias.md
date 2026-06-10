# 得点王エイリアス解決層 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 得点王の採点照合を「正規化＋エイリアス解決」に置き換え、SportMonks表記を採用しつつ既存予想を非破壊で守る。

**Architecture:** `scoring.js` に純関数 `normalize`/`canonicalKey`/`resolve` を追加し、`scoreMember` に第4引数 `aliasMap` を渡して得点王のみ解決後比較する。エイリアス表は config blob に格納し、`scorer-alias.js`（新規）の純関数で aliasMap 構築・upsert・自動突合する。配信は config API→data.js→`window.WC.ALIAS_MAP`、採点ラッパは index.html。管理画面に手動編集UIを追加。

**Tech Stack:** Vanilla ESM（`public/lib/*.js`）, React+Babel(standalone) for admin, Cloudflare Pages Functions, `node --test`。

**設計正本:** `docs/superpowers/specs/2026-06-11-scorer-alias-design.md`

---

## ファイル構成

| ファイル | 役割 | 変更 |
|---|---|---|
| `public/lib/scoring.js` | 採点純ロジック | `normalize`/`canonicalKey`/`resolve` 追加、`scoreMember` 第4引数 |
| `public/lib/scorer-alias.js` | エイリアス表の操作（新規） | `buildAliasMap`/`upsertAlias`/`rosterCanonicalSet`/`autoMatchScorer` |
| `functions/_lib/scoring.test.js` | 採点テスト | normalize/resolve/scoreMember ケース追加 |
| `functions/_lib/scorer-alias.test.js` | 表操作テスト（新規） | buildAliasMap/upsertAlias/autoMatch |
| `functions/_lib/validate.js` | config 検証 | `aliases` スキーマ追加・return 同梱 |
| `functions/_lib/validate.test.js` | 検証テスト | aliases 正常/異常 |
| `functions/_lib/defaults.js` | 既定config | `aliases: []` 追加 |
| `public/data.js` | config展開 | `window.WC.ALIASES`/`ALIAS_MAP` 設定 |
| `public/index.html` | 起動結線 | scorer-alias import・関数公開・採点ラッパ第4引数・`data.js?v` バンプ |
| `public/admin/admin.jsx` | 管理UI | 「得点王エイリアス」セクション＋旧データ登録導線 |

**テスト実行:** `npm test`（= `node --test 'functions/**/*.test.js'`）。単体は `node --test functions/_lib/<file>.test.js`。

---

## Task 1: normalize() — 文字列正規化

**Files:**
- Modify: `public/lib/scoring.js`
- Test: `functions/_lib/scoring.test.js`

- [ ] **Step 1: 失敗するテストを追加**（`functions/_lib/scoring.test.js` の import 行を更新し、末尾にテスト追加）

import 行を差し替え（この Task では `normalize` のみ追加。`canonicalKey`/`resolve` を今 import すると Task 2 まで未定義で ESM ロードが throw するため入れない）:
```js
import { SCORING, scoreMember, normalize } from '../../public/lib/scoring.js';
```
末尾に追加:
```js
test('normalize: 大文字化・アクセント除去・空白畳み', () => {
  assert.equal(normalize('Mbappé'), 'MBAPPE');
  assert.equal(normalize('  Vinícius   Júnior '), 'VINICIUS JUNIOR');
  assert.equal(normalize('MBAPPE (FRA)'), 'MBAPPE (FRA)');
  assert.equal(normalize(null), '');
});
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test functions/_lib/scoring.test.js`
Expected: FAIL（`normalize is not a function` / export されていない）

- [ ] **Step 3: 実装**（`public/lib/scoring.js` の `const KO_ROUNDS` 行の直後に追加）

```js
// 得点王照合用の文字列正規化（大文字化・アクセント除去・空白畳み）
// NFD 分解→ラテン系結合分音記号(U+0300–U+036F)のみ除去→末尾 NFC 再合成。
// 日本語の濁点/半濁点(U+3099/U+309A)は除去対象外。NFC で元表記に戻し round-trip を保証。
export function normalize(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
}
```

- [ ] **Step 4: 合格を確認**

Run: `node --test functions/_lib/scoring.test.js`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add public/lib/scoring.js functions/_lib/scoring.test.js
git commit -m "feat(scoring): 得点王照合用 normalize を追加"
```

---

## Task 2: canonicalKey() と resolve()

**Files:**
- Modify: `public/lib/scoring.js`
- Test: `functions/_lib/scoring.test.js`

- [ ] **Step 1: 失敗するテストを追加**（`scoring.test.js`）

まず import 行を差し替え（`canonicalKey`/`resolve` を追加）:
```js
import { SCORING, scoreMember, normalize, canonicalKey, resolve } from '../../public/lib/scoring.js';
```
末尾にテストを追加:
```js
test('canonicalKey: NAME (CODE) を CODE::正規化名 に畳む', () => {
  assert.equal(canonicalKey('Mbappé (FRA)'), 'FRA::MBAPPE');
  assert.equal(canonicalKey('MBAPPE (FRA)'), 'FRA::MBAPPE');
  assert.equal(canonicalKey('ムバッペ'), 'ムバッペ'); // (CODE) 無しは normalize のみ
});

test('resolve: エイリアス優先・無ければ canonicalKey', () => {
  const map = { 'VINI JR. (BRA)': 'BRA::VINICIUS JUNIOR' };
  assert.equal(resolve('VINI JR. (BRA)', map), 'BRA::VINICIUS JUNIOR'); // 変種
  assert.equal(resolve('VINICIUS JUNIOR (BRA)', map), 'BRA::VINICIUS JUNIOR'); // 構造フォールバック
  assert.equal(resolve('Mbappé (FRA)', {}), 'FRA::MBAPPE'); // 表なしでもアクセント差吸収
  assert.equal(resolve('', map), '');
});
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test functions/_lib/scoring.test.js`
Expected: FAIL（`canonicalKey`/`resolve` 未定義）

- [ ] **Step 3: 実装**（`public/lib/scoring.js` の `normalize` 直後に追加）

```js
// "NAME (CODE)" を "CODE::正規化名" に畳む。(CODE) 無しは normalize のみ。
export function canonicalKey(input) {
  const s = String(input == null ? '' : input).trim();
  const m = s.match(/^(.+?)\s*\(([A-Za-z]{3})\)\s*$/);
  if (m) return `${m[2].toUpperCase()}::${normalize(m[1])}`;
  return normalize(s);
}

// 入力を canonical へ解決。エイリアス表（normalize(変種)→canonical）優先、無ければ構造畳み。
export function resolve(input, aliasMap = {}) {
  if (!input) return '';
  const norm = normalize(input);
  if (aliasMap && aliasMap[norm]) return aliasMap[norm];
  return canonicalKey(input);
}
```

- [ ] **Step 4: 合格を確認**

Run: `node --test functions/_lib/scoring.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add public/lib/scoring.js functions/_lib/scoring.test.js
git commit -m "feat(scoring): canonicalKey/resolve 解決層を追加"
```

---

## Task 3: scoreMember に aliasMap を組み込む

**Files:**
- Modify: `public/lib/scoring.js:12-19`
- Test: `functions/_lib/scoring.test.js`

- [ ] **Step 1: 失敗するテストを追加**（`scoring.test.js` 末尾）

```js
test('得点王: アクセント差のみは表なしで一致', () => {
  const s = scoreMember({ topScorer: 'Mbappé (FRA)' }, { topScorer: 'MBAPPE (FRA)' });
  assert.equal(s.core.topScorer, 20);
});

test('得点王: 変種は aliasMap 経由で一致', () => {
  const map = { 'VINI JR. (BRA)': 'BRA::VINICIUS JUNIOR' };
  const s = scoreMember({ topScorer: 'VINI JR. (BRA)' }, { topScorer: 'VINICIUS JUNIOR (BRA)' }, SCORING, map);
  assert.equal(s.core.topScorer, 20);
});

test('得点王: 別人は不一致', () => {
  const s = scoreMember({ topScorer: 'KANE (ENG)' }, { topScorer: 'MBAPPE (FRA)' });
  assert.equal(s.core.topScorer, 0);
});

test('得点王: aliasMap 省略時は従来挙動（完全一致相当）', () => {
  const s = scoreMember({ topScorer: 'ムバッペ' }, { topScorer: 'ムバッペ' });
  assert.equal(s.core.topScorer, 20);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test functions/_lib/scoring.test.js`
Expected: FAIL（「変種は aliasMap 経由で一致」が 0 になる。他は既存ロジックで通る可能性あり）

- [ ] **Step 3: 実装**（`public/lib/scoring.js`）

`scoreMember` のシグネチャを変更:
```js
export function scoreMember(pred = {}, result = {}, scoring = SCORING, aliasMap = {}) {
```
得点王の照合（現 16-19 行）を差し替え:
```js
  const topScorer =
    pred.topScorer && result.topScorer &&
    resolve(pred.topScorer, aliasMap) === resolve(result.topScorer, aliasMap)
      ? scoring.topScorer
      : 0;
```

- [ ] **Step 4: 合格を確認**

Run: `npm test`
Expected: PASS（既存テスト含め全件。`scoring.test.js` の従来ケースが回帰しないこと）

- [ ] **Step 5: コミット**

```bash
git add public/lib/scoring.js functions/_lib/scoring.test.js
git commit -m "feat(scoring): scoreMember に aliasMap を導入し得点王照合を解決層化"
```

---

## Task 4: scorer-alias.js — buildAliasMap / upsertAlias

**Files:**
- Create: `public/lib/scorer-alias.js`
- Test: `functions/_lib/scorer-alias.test.js`

- [ ] **Step 1: 失敗するテストを作成**（`functions/_lib/scorer-alias.test.js` 新規）

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAliasMap, upsertAlias } from '../../public/lib/scorer-alias.js';

const ALIASES = [
  { canonical: 'BRA::VINICIUS JUNIOR', variants: ['VINI JR. (BRA)', 'Vinícius Júnior'], smPlayerId: 12345 },
];

test('buildAliasMap: 変種を正規化キーで canonical に写像', () => {
  const map = buildAliasMap(ALIASES);
  assert.equal(map['VINI JR. (BRA)'], 'BRA::VINICIUS JUNIOR');
  assert.equal(map['VINICIUS JUNIOR'], 'BRA::VINICIUS JUNIOR'); // 'Vinícius Júnior' の正規化
});

test('buildAliasMap: 空/不正入力は空マップ', () => {
  assert.deepEqual(buildAliasMap(), {});
  assert.deepEqual(buildAliasMap([{ variants: ['X'] }]), {}); // canonical 無しは無視
});

test('upsertAlias: 新規 canonical を追加（非破壊）', () => {
  const next = upsertAlias(ALIASES, { canonical: 'ENG::KANE', variant: 'KANE (ENG)', smPlayerId: 99 });
  assert.equal(next.length, 2);
  assert.equal(ALIASES.length, 1); // 元配列は不変
  assert.deepEqual(next[1], { canonical: 'ENG::KANE', variants: ['KANE (ENG)'], smPlayerId: 99 });
});

test('upsertAlias: 既存 canonical へ変種を追記（重複は正規化で排除）', () => {
  const next = upsertAlias(ALIASES, { canonical: 'BRA::VINICIUS JUNIOR', variant: 'vini jr. (bra)' });
  assert.equal(next[0].variants.length, 2); // 'vini jr. (bra)' は既存 'VINI JR. (BRA)' と同一視され追記されない
});
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test functions/_lib/scorer-alias.test.js`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: 実装**（`public/lib/scorer-alias.js` 新規）

```js
// 得点王エイリアス表の操作（純関数・非破壊）。採点本体は scoring.js。
import { normalize } from './scoring.js';

// aliases[] → { normalize(変種): canonical } の検索マップ
export function buildAliasMap(aliases = []) {
  const map = {};
  for (const rec of aliases || []) {
    if (!rec || !rec.canonical) continue;
    for (const v of rec.variants || []) {
      const k = normalize(v);
      if (k) map[k] = rec.canonical;
    }
  }
  return map;
}

// canonical 単位で変種/ID を追記した新しい aliases 配列を返す（元配列は不変）
export function upsertAlias(aliases = [], { canonical, variant, smPlayerId } = {}) {
  if (!canonical) return (aliases || []).slice();
  const list = (aliases || []).map((r) => ({ ...r, variants: [...(r.variants || [])] }));
  let rec = list.find((r) => r.canonical === canonical);
  if (!rec) {
    rec = { canonical, variants: [] };
    list.push(rec);
  }
  if (variant && !rec.variants.some((v) => normalize(v) === normalize(variant))) {
    rec.variants.push(variant);
  }
  if (smPlayerId != null) rec.smPlayerId = smPlayerId;
  return list;
}
```

- [ ] **Step 4: 合格を確認**

Run: `node --test functions/_lib/scorer-alias.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add public/lib/scorer-alias.js functions/_lib/scorer-alias.test.js
git commit -m "feat(alias): エイリアス表の buildAliasMap/upsertAlias を追加"
```

---

## Task 5: scorer-alias.js — rosterCanonicalSet / autoMatchScorer

**Files:**
- Modify: `public/lib/scorer-alias.js`
- Test: `functions/_lib/scorer-alias.test.js`

- [ ] **Step 1: 失敗するテストを追加**（import 行を更新し末尾に追加）

import 行を差し替え:
```js
import { buildAliasMap, upsertAlias, rosterCanonicalSet, autoMatchScorer } from '../../public/lib/scorer-alias.js';
```
末尾に追加:
```js
const SQUADS = { FRA: [{ name: 'MBAPPE' }], BRA: [{ name: 'VINICIUS JUNIOR' }] };

test('rosterCanonicalSet: 名簿から canonical 集合を作る', () => {
  const set = rosterCanonicalSet(SQUADS);
  assert.ok(set.has('FRA::MBAPPE'));
  assert.ok(set.has('BRA::VINICIUS JUNIOR'));
});

test('autoMatchScorer: 名簿に解決できれば canonical、無ければ null', () => {
  const set = rosterCanonicalSet(SQUADS);
  const map = buildAliasMap([{ canonical: 'BRA::VINICIUS JUNIOR', variants: ['Vinícius Júnior'] }]);
  assert.equal(autoMatchScorer('Mbappé', map, set), 'FRA::MBAPPE'); // 正規化で名簿一致
  assert.equal(autoMatchScorer('Vinícius Júnior', map, set), 'BRA::VINICIUS JUNIOR'); // 変種経由
  assert.equal(autoMatchScorer('Unknown Player', map, set), null); // 未解決→手動へ
});
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test functions/_lib/scorer-alias.test.js`
Expected: FAIL（`rosterCanonicalSet`/`autoMatchScorer` 未定義）

- [ ] **Step 3: 実装**（`public/lib/scorer-alias.js`）

import 行を差し替え:
```js
import { normalize, canonicalKey, resolve } from './scoring.js';
```
末尾に追加:
```js
// 名簿(squads)の全選手を canonical 集合に。result/予想の保存形式 "NAME (CODE)" と同じ畳み方。
export function rosterCanonicalSet(squads = {}) {
  const set = new Set();
  for (const code of Object.keys(squads || {})) {
    for (const p of squads[code] || []) {
      if (p && p.name) set.add(canonicalKey(`${p.name} (${code})`));
    }
  }
  return set;
}

// SportMonks 等の選手名を解決し、名簿に存在すれば canonical、無ければ null（=手動突合送り）。
// (CODE)/エイリアスで国が確定すれば直接一致。裸の名前は名簿の "CODE::名前" 末尾一致が
// 一意なときだけ採用（同名が複数国にいる曖昧ケースは手動送りで null）。
export function autoMatchScorer(name, aliasMap = {}, rosterSet = new Set()) {
  if (!name) return null;
  const canon = resolve(name, aliasMap);
  if (rosterSet.has(canon)) return canon;
  if (!canon.includes('::')) {
    const sep = '::';
    const hits = [...rosterSet].filter((k) => k.slice(k.indexOf(sep) + sep.length) === canon);
    if (hits.length === 1) return hits[0];
  }
  return null;
}
```

- [ ] **Step 4: 合格を確認**

Run: `npm test`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add public/lib/scorer-alias.js functions/_lib/scorer-alias.test.js
git commit -m "feat(alias): rosterCanonicalSet/autoMatchScorer を追加"
```

---

## Task 6: validate.js に aliases スキーマ + defaults.js

**Files:**
- Modify: `functions/_lib/validate.js`（squads ブロック直後・return 文）
- Modify: `functions/_lib/defaults.js`
- Test: `functions/_lib/validate.test.js`

- [ ] **Step 1: 失敗するテストを追加**（`functions/_lib/validate.test.js` 末尾）

```js
test('aliases 正常系', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, aliases: [
    { canonical: 'BRA::VINICIUS JUNIOR', variants: ['VINI JR. (BRA)'], smPlayerId: 5 },
  ]});
  assert.equal(r.ok, true);
  assert.equal(r.value.aliases[0].canonical, 'BRA::VINICIUS JUNIOR');
});

test('aliases 未指定なら空配列', () => {
  const r = validateConfig(DEFAULT_CONFIG);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.aliases, []);
});

test('aliases が非配列は失敗', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, aliases: {} });
  assert.equal(r.ok, false);
  assert.match(r.error, /aliases/);
});

test('aliases の canonical 欠落は失敗', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, aliases: [{ variants: ['X'] }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /canonical/);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test functions/_lib/validate.test.js`
Expected: FAIL（`r.value.aliases` が undefined／canonical 欠落でも ok:true）

- [ ] **Step 3a: 実装（validate.js）** — squads ブロック（`squads[code] = norm;` を閉じる `}` の直後、`return { ok: true, ...}` の直前）に追加

```js
  // aliases（得点王エイリアス。比較時のみ使用・予想/正解データは非破壊）
  const aliases = [];
  if (input.aliases != null) {
    if (!Array.isArray(input.aliases)) return { ok: false, error: 'aliases は配列が必要です' };
    for (const a of input.aliases) {
      if (!isObj(a) || !isStr(a.canonical) || !a.canonical.trim()) {
        return { ok: false, error: 'aliases の canonical が必要です' };
      }
      if (!Array.isArray(a.variants)) {
        return { ok: false, error: `aliases.variants は配列が必要です: ${a.canonical}` };
      }
      const variants = [];
      for (const v of a.variants) {
        if (!isStr(v) || !v.trim()) {
          return { ok: false, error: `aliases.variants に空文字: ${a.canonical}` };
        }
        variants.push(v.trim());
      }
      const rec = { canonical: a.canonical.trim(), variants };
      if (a.smPlayerId != null) {
        if (!Number.isInteger(a.smPlayerId) || a.smPlayerId < 0) {
          return { ok: false, error: `aliases.smPlayerId が不正です: ${a.canonical}` };
        }
        rec.smPlayerId = a.smPlayerId;
      }
      aliases.push(rec);
    }
  }
```

- [ ] **Step 3b: 実装（validate.js return）** — return 文に `aliases` を追加

```js
  return { ok: true, value: { version: 1, updatedAt: null, teams, result, schedule, groups, groupResult, groupMatches, scorers, squads, aliases } };
```

- [ ] **Step 3c: 実装（defaults.js）** — `scorers: [],` の行の直後に追加

```js
  aliases: [],
```

- [ ] **Step 4: 合格を確認**

Run: `npm test`
Expected: PASS（全件。既存 validate テストも不変で通る）

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/validate.js functions/_lib/validate.test.js functions/_lib/defaults.js
git commit -m "feat(config): aliases スキーマ検証と既定値を追加"
```

---

## Task 7: 配信結線（data.js / index.html）

**Files:**
- Modify: `public/data.js`（squads 展開の直後）
- Modify: `public/index.html:81`（import）, `92`（Object.assign）, `94`（採点ラッパ）, `58`（`data.js?v` バンプ）

> 注: `functions/api/config.js` は stored body をそのまま返すため、Task 6 で `aliases` が validate 同梱されれば API 追加変更は不要。

- [ ] **Step 1: index.html の import と公開を更新**

`public/index.html:81` を差し替え:
```html
    import { SCORING, scoreMember, normalize, canonicalKey, resolve } from './lib/scoring.js';
```
`import { drawShareCard } ...` 群の近く（他 import の末尾）に追加:
```html
    import { buildAliasMap, upsertAlias, rosterCanonicalSet, autoMatchScorer } from './lib/scorer-alias.js';
```
`Object.assign(window.WC, { ... SCORING, generateFixtures, computeStandings });` の後に1行追加:
```js
    Object.assign(window.WC, { normalize, canonicalKey, resolve, buildAliasMap, upsertAlias, rosterCanonicalSet, autoMatchScorer });
```

- [ ] **Step 2: 採点ラッパに第4引数を追加**（`public/index.html:94`）

```js
    window.WC.scoreMember = (pred) => scoreMember(pred, window.WC.RESULT, SCORING, window.WC.ALIAS_MAP || {});
```

- [ ] **Step 3: data.js で ALIASES/ALIAS_MAP を設定**（`public/data.js` の `if (cfg.squads ...) window.WC.SQUADS = cfg.squads;` の直後に追加）

```js
			if (Array.isArray(cfg.aliases)) {
				window.WC.ALIASES = cfg.aliases;
				window.WC.ALIAS_MAP = window.WC.buildAliasMap
					? window.WC.buildAliasMap(cfg.aliases)
					: {};
			}
```

- [ ] **Step 4: キャッシュバスティング**（`public/index.html:58`）

`data.js?v=12` を `data.js?v=13` に更新。

- [ ] **Step 5: 結線の手動確認**

Run: `npx wrangler pages dev public --port 8788`（別ターミナル推奨）
ブラウザで `http://localhost:8788` を開き、DevTools コンソールで:
```js
window.WC.ALIAS_MAP            // {} もしくはエイリアス由来のマップ（throw しないこと）
typeof window.WC.scoreMember   // 'function'
```
Expected: `scoreMember` が存在し、ランキング画面（順位タブ）がエラーなく描画される。

- [ ] **Step 6: コミット**

```bash
git add public/index.html public/data.js
git commit -m "feat(alias): ALIAS_MAP 配信と採点ラッパ結線"
```

---

## Task 8: 管理画面「得点王エイリアス」セクション

**Files:**
- Modify: `public/admin/admin.jsx`（得点王 `<Section>` の直後に新 `<Section>` を追加）

> admin.jsx は `window.WC.canonicalKey` / `upsertAlias` / `normalize` を利用（Task 7 で公開済み）。保存は既存の config PUT 経路に `aliases` を含める（admin の保存 payload に `aliases` を追加）。

- [ ] **Step 1: 保存 payload に aliases を含める**

`admin.jsx` の config 保存（PUT）を組み立てる箇所（`result: { ... }` を含む payload オブジェクト、`admin.jsx:570` 付近）に `aliases: cfg.aliases || []` を追加。例:
```js
        aliases: Array.isArray(cfg.aliases) ? cfg.aliases : [],
```

- [ ] **Step 2: エイリアス編集セクションを追加**（得点王 `</Section>` の直後）

```jsx
      <Section title="得点王エイリアス">
        <p style={{ fontSize: 12, color: '#9aa', margin: '0 0 8px' }}>
          表記ゆれ（旧予想・SportMonks名）を正規キーに畳んで採点一致させる。予想/正解データは変更しません。
        </p>
        {(cfg.aliases || []).map((a, i) => (
          <div key={i} style={{ border: '1px solid #243', borderRadius: 8, padding: 8, marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{a.canonical}</div>
            <div style={{ fontSize: 12, color: '#9cf', margin: '4px 0' }}>
              変種: {(a.variants || []).join(' / ') || '（なし）'}
              {a.smPlayerId != null && <span style={{ color: '#7a7' }}>　smId:{a.smPlayerId}</span>}
            </div>
            <button onClick={() => upAliases((cfg.aliases || []).filter((_, j) => j !== i))}
              style={{ fontSize: 12 }}>削除</button>
          </div>
        ))}
        <button onClick={() => {
          const code = window.prompt('国コード(例: BRA)');
          const name = window.prompt('正式名（名簿の選手名）');
          const variant = window.prompt('変種（旧表記/別表記。例: VINI JR. (BRA)）');
          if (!code || !name) return;
          const canonical = window.WC.canonicalKey(`${name} (${code})`);
          upAliases(window.WC.upsertAlias(cfg.aliases || [], { canonical, variant: variant || '' }));
        }} style={{ fontSize: 13 }}>＋ エイリアス追加</button>
      </Section>
```

- [ ] **Step 3: upAliases ヘルパを追加**（他の `upResult` 等の定義近く）

```js
  const upAliases = (aliases) => setCfg((c) => ({ ...c, aliases }));
```
（`setCfg` / `cfg` の取得方法は同ファイルの `upResult` 実装に合わせること。`upResult` がどう `cfg` を更新しているかを確認し、同じ更新関数を使う。）

- [ ] **Step 4: 旧データ登録導線**（得点王セクションの「（旧データ）」option 付近, `admin.jsx:428`）

`cfg.result.topScorer && !knownScorerValues.has(...)` の表示の隣に、旧表記をエイリアスへ送るボタンを追加:
```jsx
          {cfg.result.topScorer && !knownScorerValues.has(cfg.result.topScorer) && (
            <button onClick={() => {
              const name = window.prompt('この旧表記を割り当てる正式名（名簿の選手名）');
              const code = window.prompt('国コード(例: FRA)');
              if (!name || !code) return;
              const canonical = window.WC.canonicalKey(`${name} (${code})`);
              upAliases(window.WC.upsertAlias(cfg.aliases || [], { canonical, variant: cfg.result.topScorer }));
            }} style={{ fontSize: 11, marginLeft: 6 }}>エイリアスに登録</button>
          )}
```

- [ ] **Step 5: 手動確認**

Run: `npx wrangler pages dev public --port 8788`
`http://localhost:8788/admin/` を開き（ログイン後）:
1. 「得点王エイリアス」セクションが表示される。
2. 「＋ エイリアス追加」で BRA / VINICIUS JUNIOR / `VINI JR. (BRA)` を入力 → 一覧に `BRA::VINICIUS JUNIOR` が出る。
3. 保存（既存の保存ボタン）→ リロードしてエイリアスが残る。
4. 順位タブで、`VINI JR. (BRA)` を予想したメンバーと正解 `VINICIUS JUNIOR (BRA)` が一致して +20 されることを確認。

Expected: 上記すべて成立。コンソールにエラーが出ない。

- [ ] **Step 6: コミット**

```bash
git add public/admin/admin.jsx
git commit -m "feat(admin): 得点王エイリアス編集セクションと旧データ登録導線を追加"
```

---

## 完了基準
- `npm test` 全件 PASS（既存テスト回帰なし）。
- 管理画面でエイリアスの追加/削除/保存ができ、配信後に採点へ反映される。
- aliasMap 空・表記差なしの場合は現行と同一の採点結果（非破壊）。
- 予想/正解の KV 保存データは無変更。

## デプロイ
- PR を作成 → preview で順位タブ・管理画面を確認 → main へマージで本番反映（GitHub Actions）。
- 変更ファイルのうち `data.js` は `?v=13` バンプ済み。`scoring.js`/`scorer-alias.js` は index.html のモジュール import（既存運用と同様、HTML 再取得で反映）。
