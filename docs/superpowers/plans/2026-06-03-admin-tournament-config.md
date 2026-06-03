# 管理画面（大会設定の共有）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理者が `/admin` から大会設定（出場国・組み合わせ・正解・得点王候補・日程）を編集し、Cloudflare KV 経由で全参加者の予想アプリに反映できるようにする。

**Architecture:** 既存の静的 Pages サイトに Cloudflare Pages Functions（`functions/`）と KV を追加。設定は単一JSON（`config:v1`）として KV に保存。`GET /api/config`（公開）で配信、`PUT /api/config`（管理パスワード必須）で更新。予想アプリは起動時に設定を取得してハードコード値を上書きし、取得失敗時はデフォルトで動作。予想データは引き続き localStorage。

**Tech Stack:** Cloudflare Pages + Pages Functions (ESM JS) + KV / React 18 + Babel standalone (CDN, ビルド無し) / テストは Node 組み込み `node --test`（依存ゼロ）。

参照仕様: `docs/superpowers/specs/2026-06-03-admin-tournament-config-design.md`

---

## ファイル構成

| ファイル | 役割 | 区分 |
|---|---|---|
| `package.json` | `node --test` 用の最小設定（`"type":"module"`） | 新規 |
| `wrangler.toml` | Pages 出力ディレクトリ + KV バインド | 新規 |
| `functions/_lib/defaults.js` | デフォルト大会設定（サーバー側の正） | 新規 |
| `functions/_lib/validate.js` | 設定JSONの検証＋正規化（純関数） | 新規 |
| `functions/_lib/validate.test.js` | validate の単体テスト | 新規 |
| `functions/_lib/http.js` | JSONレスポンス補助 | 新規 |
| `functions/api/config.js` | `GET`/`PUT /api/config` | 新規 |
| `functions/api/auth.js` | `POST /api/auth`（パスワード照合） | 新規 |
| `public/data.js` | `DEFAULTS` 化＋`fetchConfig()` 追加 | 変更 |
| `public/index.html` | マウント時に `fetchConfig()` 呼び出し | 変更 |
| `public/admin/index.html` | 管理画面シェル（`/admin`） | 新規 |
| `public/admin/admin.jsx` | 管理UI本体 | 新規 |

---

## Task 0: プロジェクト土台（git / package.json / .gitignore）

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: git 初期化（未初期化の場合）**

Run:
```bash
cd /Users/hikaru/dev/W-Cup && git rev-parse --is-inside-work-tree 2>/dev/null || git init
```
Expected: 既に repo なら `true`、無ければ `Initialized empty Git repository`。

- [ ] **Step 2: `.gitignore` を作成**

```gitignore
node_modules/
.wrangler/
.dev.vars
*.log
.DS_Store
```

- [ ] **Step 3: `package.json` を作成**

```json
{
  "name": "wcup2026-yosou",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test functions/",
    "dev": "wrangler pages dev public",
    "deploy": "wrangler pages deploy public --project-name=wcup2026-yosou --commit-dirty=true"
  }
}
```

- [ ] **Step 4: コミット**

```bash
git add package.json .gitignore
git commit -m "chore: init git, package.json and gitignore"
```

---

## Task 1: デフォルト大会設定モジュール

`public/data.js` の現行ハードコード値をサーバー側の正として切り出す。

**Files:**
- Create: `functions/_lib/defaults.js`

- [ ] **Step 1: `functions/_lib/defaults.js` を作成**

`public/data.js` の以下を**そのままの値**で移植する:
- `TEAMS`（32件、`data.js` の8〜41行目）→ `teams`
- `R16_TEAMS`（`data.js` の62〜71行目）→ `r16Teams`（16コードのフラット配列）
- `SCORER_SUGGEST`（`data.js` の136〜139行目）→ `scorerSuggest`
- `RESULT`（`data.js` の83〜93行目）→ `result`

```js
// 大会設定のデフォルト（KVが空のときのGETフォールバック＆管理画面の初期シード）
// 値は public/data.js の現行ハードコードと一致させること。
export const DEFAULT_CONFIG = {
  version: 1,
  updatedAt: null,
  teams: [
    { code: 'BRA', ja: 'ブラジル',       flag: '🇧🇷', c: '#FBE14B' },
    { code: 'ARG', ja: 'アルゼンチン',   flag: '🇦🇷', c: '#75AADB' },
    { code: 'FRA', ja: 'フランス',       flag: '🇫🇷', c: '#2D5BC4' },
    { code: 'ENG', ja: 'イングランド',   flag: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', c: '#E64A4A' },
    { code: 'ESP', ja: 'スペイン',       flag: '🇪🇸', c: '#E03A3A' },
    { code: 'GER', ja: 'ドイツ',         flag: '🇩🇪', c: '#3A3A3A' },
    { code: 'POR', ja: 'ポルトガル',     flag: '🇵🇹', c: '#1E8A4C' },
    { code: 'NED', ja: 'オランダ',       flag: '🇳🇱', c: '#F5821F' },
    { code: 'ITA', ja: 'イタリア',       flag: '🇮🇹', c: '#2C7DB5' },
    { code: 'BEL', ja: 'ベルギー',       flag: '🇧🇪', c: '#D62B30' },
    { code: 'CRO', ja: 'クロアチア',     flag: '🇭🇷', c: '#D1334A' },
    { code: 'URU', ja: 'ウルグアイ',     flag: '🇺🇾', c: '#4FA0DA' },
    { code: 'COL', ja: 'コロンビア',     flag: '🇨🇴', c: '#F4C430' },
    { code: 'USA', ja: 'アメリカ',       flag: '🇺🇸', c: '#3B4C99' },
    { code: 'MEX', ja: 'メキシコ',       flag: '🇲🇽', c: '#1E7C45' },
    { code: 'CAN', ja: 'カナダ',         flag: '🇨🇦', c: '#D9322E' },
    { code: 'JPN', ja: '日本',           flag: '🇯🇵', c: '#1B2A6B' },
    { code: 'KOR', ja: '韓国',           flag: '🇰🇷', c: '#C8334A' },
    { code: 'MAR', ja: 'モロッコ',       flag: '🇲🇦', c: '#16704A' },
    { code: 'SEN', ja: 'セネガル',       flag: '🇸🇳', c: '#1E8A4C' },
    { code: 'SUI', ja: 'スイス',         flag: '🇨🇭', c: '#D62B30' },
    { code: 'DEN', ja: 'デンマーク',     flag: '🇩🇰', c: '#C63A3A' },
    { code: 'ECU', ja: 'エクアドル',     flag: '🇪🇨', c: '#F4C430' },
    { code: 'NGA', ja: 'ナイジェリア',   flag: '🇳🇬', c: '#1E8A4C' },
    { code: 'AUS', ja: 'オーストラリア', flag: '🇦🇺', c: '#E0A100' },
    { code: 'SRB', ja: 'セルビア',       flag: '🇷🇸', c: '#B23A48' },
    { code: 'POL', ja: 'ポーランド',     flag: '🇵🇱', c: '#D6334C' },
    { code: 'GHA', ja: 'ガーナ',         flag: '🇬🇭', c: '#D6334C' },
    { code: 'EGY', ja: 'エジプト',       flag: '🇪🇬', c: '#C8334A' },
    { code: 'IRN', ja: 'イラン',         flag: '🇮🇷', c: '#1E8A4C' },
    { code: 'KSA', ja: 'サウジアラビア', flag: '🇸🇦', c: '#127A4A' },
    { code: 'NOR', ja: 'ノルウェー',     flag: '🇳🇴', c: '#C63A4A' },
  ],
  r16Teams: [
    'BRA', 'MAR', 'POR', 'USA', 'ARG', 'JPN', 'NED', 'MEX',
    'FRA', 'URU', 'ESP', 'CRO', 'ENG', 'BEL', 'GER', 'COL',
  ],
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
};
```

- [ ] **Step 2: 構文チェック**

Run: `node -e "import('./functions/_lib/defaults.js').then(m=>console.log(m.DEFAULT_CONFIG.teams.length, m.DEFAULT_CONFIG.r16Teams.length))"`
Expected: `32 16`

- [ ] **Step 3: コミット**

```bash
git add functions/_lib/defaults.js
git commit -m "feat: add default tournament config module"
```

---

## Task 2: 設定検証モジュール（TDD）

**Files:**
- Create: `functions/_lib/validate.test.js`
- Create: `functions/_lib/validate.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/validate.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from './validate.js';
import { DEFAULT_CONFIG } from './defaults.js';

test('デフォルト設定は妥当', () => {
  const r = validateConfig(DEFAULT_CONFIG);
  assert.equal(r.ok, true);
  assert.equal(r.value.teams.length, 32);
  assert.equal(r.value.r16Teams.length, 16);
});

test('teams が無いと失敗', () => {
  const r = validateConfig({ teams: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /teams/);
});

test('code 重複は失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }, { code: 'AAA', ja: 'B' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /重複|duplicate/);
});

test('result.champion が teams に無いと失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    result: { champion: 'ZZZ' },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /champion/);
});

test('r16Teams は 0 か 16 以外の長さで失敗', () => {
  const r = validateConfig({
    teams: [{ code: 'AAA', ja: 'A' }],
    r16Teams: ['AAA', 'AAA'],
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /r16Teams/);
});

test('欠損フィールドは正規化で補完される', () => {
  const r = validateConfig({ teams: [{ code: 'AAA', ja: 'A' }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.scorerSuggest, []);
  assert.deepEqual(r.value.result.bracket.r16, []);
  assert.equal(r.value.result.champion, null);
  assert.deepEqual(r.value.schedule, []);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test functions/`
Expected: FAIL（`Cannot find module './validate.js'` 系）

- [ ] **Step 3: `functions/_lib/validate.js` を実装**

```js
// 大会設定JSONの検証＋正規化。純関数。
// 返り値: { ok: true, value } | { ok: false, error }
const CODE_RE = /^[A-Za-z]{2,4}$/;
const isStr = (v) => typeof v === 'string';
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function validateConfig(input) {
  if (!isObj(input)) return { ok: false, error: 'config はオブジェクトである必要があります' };

  // teams
  if (!Array.isArray(input.teams) || input.teams.length === 0) {
    return { ok: false, error: 'teams は1件以上の配列が必要です' };
  }
  const codes = new Set();
  const teams = [];
  for (const t of input.teams) {
    if (!isObj(t) || !isStr(t.code) || !CODE_RE.test(t.code)) {
      return { ok: false, error: `teams の code が不正です: ${JSON.stringify(t)}` };
    }
    const code = t.code.toUpperCase();
    if (codes.has(code)) return { ok: false, error: `teams の code が重複しています: ${code}` };
    if (!isStr(t.ja) || !t.ja.trim()) return { ok: false, error: `teams の ja(名前) が必要です: ${code}` };
    codes.add(code);
    teams.push({ code, ja: t.ja.trim(), flag: isStr(t.flag) ? t.flag : '', c: isStr(t.c) ? t.c : '#888888' });
  }
  const known = (c) => codes.has(c);

  // r16Teams（0 または 16、空文字スロット許容、非空は既知コード）
  let r16Teams = [];
  if (input.r16Teams != null) {
    if (!Array.isArray(input.r16Teams)) return { ok: false, error: 'r16Teams は配列が必要です' };
    if (input.r16Teams.length !== 0 && input.r16Teams.length !== 16) {
      return { ok: false, error: 'r16Teams は16要素（または空）が必要です' };
    }
    for (const c of input.r16Teams) {
      if (c !== '' && !(isStr(c) && known(c.toUpperCase()))) {
        return { ok: false, error: `r16Teams に未登録コード: ${c}` };
      }
    }
    r16Teams = input.r16Teams.map((c) => (c ? c.toUpperCase() : ''));
  }

  // scorerSuggest
  let scorerSuggest = [];
  if (input.scorerSuggest != null) {
    if (!Array.isArray(input.scorerSuggest) || input.scorerSuggest.some((s) => !isStr(s))) {
      return { ok: false, error: 'scorerSuggest は文字列配列が必要です' };
    }
    scorerSuggest = input.scorerSuggest.map((s) => s.trim()).filter(Boolean);
  }

  // result
  const ri = isObj(input.result) ? input.result : {};
  const champion = ri.champion == null || ri.champion === '' ? null : String(ri.champion).toUpperCase();
  const runnerUp = ri.runnerUp == null || ri.runnerUp === '' ? null : String(ri.runnerUp).toUpperCase();
  if (champion && !known(champion)) return { ok: false, error: `result.champion が未登録: ${champion}` };
  if (runnerUp && !known(runnerUp)) return { ok: false, error: `result.runnerUp が未登録: ${runnerUp}` };
  const bi = isObj(ri.bracket) ? ri.bracket : {};
  const bracket = {};
  for (const r of ['r16', 'qf', 'sf', 'final']) {
    const arr = Array.isArray(bi[r]) ? bi[r] : [];
    for (const c of arr) {
      if (!(isStr(c) && known(c.toUpperCase()))) return { ok: false, error: `result.bracket.${r} に未登録コード: ${c}` };
    }
    bracket[r] = arr.map((c) => c.toUpperCase());
  }
  const topScorer = isStr(ri.topScorer) ? ri.topScorer.trim() : '';
  const result = { champion, runnerUp, topScorer, bracket };

  // schedule（緩め）
  let schedule = [];
  if (input.schedule != null) {
    if (!Array.isArray(input.schedule)) return { ok: false, error: 'schedule は配列が必要です' };
    schedule = input.schedule.map((s) => ({
      date: isStr(s?.date) ? s.date : '',
      round: isStr(s?.round) ? s.round : '',
      a: isStr(s?.a) ? s.a : '',
      b: isStr(s?.b) ? s.b : '',
      note: isStr(s?.note) ? s.note : '',
    }));
  }

  return { ok: true, value: { version: 1, updatedAt: null, teams, r16Teams, scorerSuggest, result, schedule } };
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test functions/`
Expected: PASS（全テスト pass、`# fail 0`）

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/validate.js functions/_lib/validate.test.js
git commit -m "feat: add config validation with tests"
```

---

## Task 3: HTTP補助 + 設定エンドポイント

**Files:**
- Create: `functions/_lib/http.js`
- Create: `functions/api/config.js`

- [ ] **Step 1: `functions/_lib/http.js` を作成**

```js
export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
```

- [ ] **Step 2: `functions/api/config.js` を作成**

```js
import { DEFAULT_CONFIG } from '../_lib/defaults.js';
import { validateConfig } from '../_lib/validate.js';
import { json } from '../_lib/http.js';

const KEY = 'config:v1';

export async function onRequestGet({ env }) {
  let stored = null;
  try { stored = await env.CONFIG.get(KEY); } catch (e) { stored = null; }
  const body = stored || JSON.stringify(DEFAULT_CONFIG);
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function onRequestPut({ request, env }) {
  const auth = request.headers.get('authorization') || '';
  const pass = auth.replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_PASSWORD || pass !== env.ADMIN_PASSWORD) {
    return json(401, { error: 'パスワードが違います' });
  }
  let input;
  try { input = await request.json(); } catch (e) { return json(400, { error: 'JSONが不正です' }); }
  const res = validateConfig(input);
  if (!res.ok) return json(400, { error: res.error });
  const value = { ...res.value, version: 1, updatedAt: new Date().toISOString() };
  try {
    await env.CONFIG.put(KEY, JSON.stringify(value));
  } catch (e) {
    return json(500, { error: '保存に失敗しました' });
  }
  return json(200, { ok: true, updatedAt: value.updatedAt });
}
```

- [ ] **Step 3: コミット**

```bash
git add functions/_lib/http.js functions/api/config.js
git commit -m "feat: add /api/config GET and PUT endpoints"
```

---

## Task 4: 認証エンドポイント

**Files:**
- Create: `functions/api/auth.js`

- [ ] **Step 1: `functions/api/auth.js` を作成**

```js
import { json } from '../_lib/http.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json(400, { ok: false }); }
  const ok = !!env.ADMIN_PASSWORD && body && body.password === env.ADMIN_PASSWORD;
  return json(ok ? 200 : 401, { ok });
}
```

- [ ] **Step 2: コミット**

```bash
git add functions/api/auth.js
git commit -m "feat: add /api/auth password verification endpoint"
```

---

## Task 5: 予想アプリのデータ層に fetchConfig を追加

**Files:**
- Modify: `public/data.js`

- [ ] **Step 1: `window.WC` に `SCHEDULE` と `fetchConfig` を追加**

`public/data.js` の `window.WC = { ... }`（266〜269行目）に `SCHEDULE: []` を追記し、その直前に以下の関数を追加する。`TEAMS/TEAM/R16_TEAMS/RESULT/SCORER_SUGGEST` は `const` のため上書き可能な形に変えず、`window.WC` のプロパティを差し替える方式にする。

`window.WC = {...}` 定義の直後（270行目 `})();` の直前）に以下を追加:
```js
  // ---- 共有設定の取得（KVバックエンド）----------------------
  // 取得成功時に window.WC の各データを上書き。失敗時はデフォルト維持。
  window.WC.SCHEDULE = [];
  window.WC.fetchConfig = async function fetchConfig() {
    try {
      const res = await fetch('/api/config', { cache: 'no-store' });
      if (!res.ok) return false;
      const cfg = await res.json();
      if (Array.isArray(cfg.teams) && cfg.teams.length) {
        window.WC.TEAMS = cfg.teams;
        const map = {};
        cfg.teams.forEach((t) => { map[t.code] = t; });
        window.WC.TEAM = map;
      }
      if (Array.isArray(cfg.r16Teams) && cfg.r16Teams.length === 16) {
        window.WC.R16_TEAMS = cfg.r16Teams;
      }
      if (Array.isArray(cfg.scorerSuggest)) window.WC.SCORER_SUGGEST = cfg.scorerSuggest;
      if (cfg.result && typeof cfg.result === 'object') window.WC.RESULT = cfg.result;
      if (Array.isArray(cfg.schedule)) window.WC.SCHEDULE = cfg.schedule;
      return true;
    } catch (e) {
      return false;
    }
  };
```

注意: `window.WC` のキー（`TEAMS, TEAM, R16_TEAMS, RESULT, SCORER_SUGGEST`）は既存のまま。`scoreMember` は `RESULT` を関数内で `window.WC` 経由ではなくクロージャ変数 `RESULT` で参照している（242〜264行目）。**そのため `scoreMember` 内の `RESULT` 参照を `window.WC.RESULT` に置き換える**。

- [ ] **Step 2: `scoreMember` を `window.WC.RESULT` 参照に変更**

`public/data.js` の `scoreMember`（242〜264行目）内:
- `if (pred.champion === RESULT.champion)` → `if (pred.champion === window.WC.RESULT.champion)`
- `if (pred.runnerUp === RESULT.runnerUp)` → `... window.WC.RESULT.runnerUp ...`
- `RESULT.topScorer` → `window.WC.RESULT.topScorer`
- `const rb = RESULT.bracket;` → `const rb = window.WC.RESULT.bracket;`

`window.WC` 構築前にこの関数が呼ばれることはない（`scoreMember` は React 描画時のみ呼ばれる）ため安全。

- [ ] **Step 3: 構文チェック**

Run: `node -e "global.window={};global.localStorage={getItem(){return null},setItem(){},removeItem(){}};require('./public/data.js');console.log(typeof window.WC.fetchConfig, window.WC.TEAMS.length)"`
Expected: `function 32`

- [ ] **Step 4: コミット**

```bash
git add public/data.js
git commit -m "feat: fetch shared config from backend in data layer"
```

---

## Task 6: 予想アプリ起動時に設定を取得

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: `App` のマウント時に `fetchConfig` を呼び再描画**

`public/index.html` の `function App() {` 内、`const [newName, setNewName] = useState('');`（state宣言の最後）の直後に追加:
```js
      const [, setCfgLoaded] = useState(0);
      useEffect(() => {
        let alive = true;
        window.WC.fetchConfig().then((ok) => { if (alive && ok) setCfgLoaded((n) => n + 1); });
        return () => { alive = false; };
      }, []);
```

`useEffect` は冒頭の `const { useState, useEffect, useRef } = React;` で既に取得済み。設定取得後に state を更新することで `TEAMS/RESULT` 上書き後の再描画が走る。予想（localStorage）には影響しない。

- [ ] **Step 2: ローカル配信で動作確認（フォールバック）**

Run:
```bash
cd /Users/hikaru/dev/W-Cup/public && (python3 -m http.server 8799 >/tmp/h.log 2>&1 &) ; sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8799/index.html
pkill -f "http.server 8799"
```
Expected: `200`（`/api/config` は404になるが `fetchConfig` は false を返しデフォルト描画でアプリは正常）。

- [ ] **Step 3: コミット**

```bash
git add public/index.html
git commit -m "feat: load shared config on app mount"
```

---

## Task 7: 管理画面 `/admin`

**Files:**
- Create: `public/admin/index.html`
- Create: `public/admin/admin.jsx`

- [ ] **Step 1: `public/admin/index.html` を作成**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>管理画面 — W杯2026 予想</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Zen Kaku Gothic New', system-ui, sans-serif; background: #0b0d12; color: #F3F7F2; -webkit-font-smoothing: antialiased; }
  input, select, button, textarea { font-family: inherit; }
  a { color: #B6FF3C; }
</style>
</head>
<body>
  <div id="root"></div>
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
  <script type="text/babel" src="admin.jsx"></script>
</body>
</html>
```

- [ ] **Step 2: `public/admin/admin.jsx` を作成**

```jsx
const { useState, useEffect } = React;

const ROUNDS = [
  { key: 'r16', label: 'ベスト16進出（8）' },
  { key: 'qf', label: 'ベスト8進出（4）' },
  { key: 'sf', label: 'ベスト4進出（2）' },
  { key: 'final', label: '決勝進出/優勝（1）' },
];

function api(path, opts) {
  return fetch(path, { cache: 'no-store', ...opts });
}

function Login({ onOk }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setErr('');
    try {
      const r = await api('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      if (r.ok) { onOk(pw); } else { setErr('パスワードが違います'); }
    } catch (e) { setErr('通信エラー'); }
    setBusy(false);
  }
  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 24 }}>
      <h1 style={{ fontSize: 20 }}>管理ログイン</h1>
      <input type="password" value={pw} autoFocus placeholder="管理パスワード"
        onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #333', background: '#13241C', color: '#fff', fontSize: 16 }} />
      {err && <p style={{ color: '#FF6B6B', fontSize: 13 }}>{err}</p>}
      <button onClick={submit} disabled={busy || !pw} style={{ marginTop: 14, width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#B6FF3C', color: '#0A1410', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>ログイン</button>
      <p style={{ marginTop: 18 }}><a href="/">← 予想アプリに戻る</a></p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ background: '#13241C', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, padding: 18, marginBottom: 18 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>{title}</h2>
      {children}
    </section>
  );
}

const inputStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid #333', background: '#0f1a15', color: '#fff', fontSize: 14 };

function TeamSelect({ teams, value, onChange, allowEmpty = true }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value || null)} style={inputStyle}>
      {allowEmpty && <option value="">—</option>}
      {teams.map((t) => <option key={t.code} value={t.code}>{t.flag} {t.ja} ({t.code})</option>)}
    </select>
  );
}

function Editor({ password, initial }) {
  const [cfg, setCfg] = useState(initial);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const teams = cfg.teams;

  function up(patch) { setCfg((c) => ({ ...c, ...patch })); }
  function upResult(patch) { setCfg((c) => ({ ...c, result: { ...c.result, ...patch } })); }
  function upBracket(round, arr) { setCfg((c) => ({ ...c, result: { ...c.result, bracket: { ...c.result.bracket, [round]: arr } } })); }

  // 出場国
  function setTeam(i, patch) { up({ teams: teams.map((t, j) => (j === i ? { ...t, ...patch } : t)) }); }
  function addTeam() { up({ teams: [...teams, { code: '', ja: '', flag: '', c: '#888888' }] }); }
  function delTeam(i) { up({ teams: teams.filter((_, j) => j !== i) }); }

  // R16
  const r16 = cfg.r16Teams.length === 16 ? cfg.r16Teams : Array(16).fill('');
  function setR16(i, code) { const next = [...r16]; next[i] = code || ''; up({ r16Teams: next }); }

  // bracket toggle
  function toggleBracket(round, code) {
    const cur = cfg.result.bracket[round] || [];
    upBracket(round, cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]);
  }

  // scorerSuggest chips
  const [chip, setChip] = useState('');
  function addChip() { const v = chip.trim(); if (v && !cfg.scorerSuggest.includes(v)) up({ scorerSuggest: [...cfg.scorerSuggest, v] }); setChip(''); }
  function delChip(v) { up({ scorerSuggest: cfg.scorerSuggest.filter((s) => s !== v) }); }

  // schedule
  const sched = cfg.schedule || [];
  function setSched(i, patch) { up({ schedule: sched.map((s, j) => (j === i ? { ...s, ...patch } : s)) }); }
  function addSched() { up({ schedule: [...sched, { date: '', round: '', a: '', b: '', note: '' }] }); }
  function delSched(i) { up({ schedule: sched.filter((_, j) => j !== i) }); }

  async function save() {
    setBusy(true); setMsg('');
    try {
      const r = await api('/api/config', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + password }, body: JSON.stringify(cfg) });
      const data = await r.json();
      if (r.ok) setMsg('✅ 保存しました（' + data.updatedAt + '）');
      else setMsg('❌ ' + (data.error || '保存失敗'));
    } catch (e) { setMsg('❌ 通信エラー'); }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 18px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 22 }}>大会設定 管理</h1>
        <a href="/">予想アプリ →</a>
      </div>

      <Section title={`出場国（${teams.length}）`}>
        {teams.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <input value={t.code} placeholder="CODE" onChange={(e) => setTeam(i, { code: e.target.value.toUpperCase() })} style={{ ...inputStyle, width: 70 }} />
            <input value={t.ja} placeholder="国名" onChange={(e) => setTeam(i, { ja: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            <input value={t.flag} placeholder="🏳" onChange={(e) => setTeam(i, { flag: e.target.value })} style={{ ...inputStyle, width: 60 }} />
            <input type="color" value={t.c || '#888888'} onChange={(e) => setTeam(i, { c: e.target.value })} style={{ width: 36, height: 34, padding: 0, border: 'none', background: 'none' }} />
            <button onClick={() => delTeam(i)} style={{ ...inputStyle, cursor: 'pointer', color: '#FF6B6B' }}>削除</button>
          </div>
        ))}
        <button onClick={addTeam} style={{ ...inputStyle, cursor: 'pointer', marginTop: 6 }}>＋ 出場国を追加</button>
      </Section>

      <Section title="R16 組み合わせ（8試合）">
        {Array.from({ length: 8 }).map((_, m) => (
          <div key={m} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ width: 40, color: '#9aa' }}>M{m}</span>
            <TeamSelect teams={teams} value={r16[m * 2]} onChange={(c) => setR16(m * 2, c)} />
            <span>vs</span>
            <TeamSelect teams={teams} value={r16[m * 2 + 1]} onChange={(c) => setR16(m * 2 + 1, c)} />
          </div>
        ))}
      </Section>

      <Section title="正解（勝敗）">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <label>優勝 <TeamSelect teams={teams} value={cfg.result.champion} onChange={(c) => upResult({ champion: c })} /></label>
          <label>準優勝 <TeamSelect teams={teams} value={cfg.result.runnerUp} onChange={(c) => upResult({ runnerUp: c })} /></label>
          <label>得点王 <input list="scorers" value={cfg.result.topScorer} onChange={(e) => upResult({ topScorer: e.target.value })} style={inputStyle} />
            <datalist id="scorers">{cfg.scorerSuggest.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
        </div>
        {ROUNDS.map((r) => (
          <div key={r.key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: '#9aa', marginBottom: 4 }}>{r.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {teams.map((t) => {
                const on = (cfg.result.bracket[r.key] || []).includes(t.code);
                return (
                  <button key={t.code} onClick={() => toggleBracket(r.key, t.code)} style={{ ...inputStyle, cursor: 'pointer', background: on ? '#B6FF3C' : '#0f1a15', color: on ? '#0A1410' : '#ccc', fontWeight: on ? 800 : 400 }}>{t.flag} {t.code}</button>
                );
              })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="得点王候補（将来の選手名簿の足場）">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {cfg.scorerSuggest.map((s) => (
            <span key={s} style={{ ...inputStyle, display: 'inline-flex', gap: 6 }}>{s}<a onClick={() => delChip(s)} style={{ cursor: 'pointer' }}>×</a></span>
          ))}
        </div>
        <input value={chip} placeholder="名前を追加" onChange={(e) => setChip(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addChip(); }} style={inputStyle} />
        <button onClick={addChip} style={{ ...inputStyle, cursor: 'pointer', marginLeft: 6 }}>追加</button>
      </Section>

      <Section title="試合日程（参考）">
        {sched.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={s.date} onChange={(e) => setSched(i, { date: e.target.value })} style={inputStyle} />
            <input value={s.round} placeholder="GL/R16..." onChange={(e) => setSched(i, { round: e.target.value })} style={{ ...inputStyle, width: 90 }} />
            <input value={s.a} placeholder="A" onChange={(e) => setSched(i, { a: e.target.value })} style={{ ...inputStyle, width: 80 }} />
            <span>vs</span>
            <input value={s.b} placeholder="B" onChange={(e) => setSched(i, { b: e.target.value })} style={{ ...inputStyle, width: 80 }} />
            <input value={s.note} placeholder="メモ" onChange={(e) => setSched(i, { note: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => delSched(i)} style={{ ...inputStyle, cursor: 'pointer', color: '#FF6B6B' }}>削除</button>
          </div>
        ))}
        <button onClick={addSched} style={{ ...inputStyle, cursor: 'pointer', marginTop: 6 }}>＋ 試合を追加</button>
      </Section>

      <div style={{ position: 'sticky', bottom: 0, background: '#0b0d12', padding: '14px 0', borderTop: '1px solid #222' }}>
        <button onClick={save} disabled={busy} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#B6FF3C', color: '#0A1410', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>{busy ? '保存中…' : '保存する'}</button>
        {msg && <p style={{ textAlign: 'center', marginTop: 8 }}>{msg}</p>}
      </div>
    </div>
  );
}

function Admin() {
  const [password, setPassword] = useState('');
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function afterLogin(pw) {
    setPassword(pw); setLoading(true);
    try {
      const r = await api('/api/config');
      const data = await r.json();
      // 正規化（欠損フィールド補完）
      data.result = data.result || { champion: null, runnerUp: null, topScorer: '', bracket: {} };
      data.result.bracket = data.result.bracket || {};
      ['r16', 'qf', 'sf', 'final'].forEach((k) => { data.result.bracket[k] = data.result.bracket[k] || []; });
      data.r16Teams = data.r16Teams && data.r16Teams.length === 16 ? data.r16Teams : Array(16).fill('');
      data.scorerSuggest = data.scorerSuggest || [];
      data.schedule = data.schedule || [];
      setCfg(data);
    } catch (e) { /* 失敗時は再ログイン */ }
    setLoading(false);
  }

  if (!cfg) return <Login onOk={afterLogin} />;
  if (loading) return <p style={{ padding: 40 }}>読み込み中…</p>;
  return <Editor password={password} initial={cfg} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Admin />);
```

- [ ] **Step 3: 構文確認（Babel変換できること）**

Run:
```bash
cd /Users/hikaru/dev/W-Cup/public && (python3 -m http.server 8799 >/tmp/h.log 2>&1 &) ; sleep 1
curl -s -o /dev/null -w "admin:%{http_code}\n" http://localhost:8799/admin/index.html
curl -s -o /dev/null -w "jsx:%{http_code}\n" http://localhost:8799/admin/admin.jsx
pkill -f "http.server 8799"
```
Expected: `admin:200` `jsx:200`

- [ ] **Step 4: コミット**

```bash
git add public/admin/index.html public/admin/admin.jsx
git commit -m "feat: add password-gated admin page"
```

---

## Task 8: KV・Secret・wrangler 設定

**Files:**
- Create: `wrangler.toml`

- [ ] **Step 1: KV 名前空間を作成**

Run: `npx wrangler kv namespace create wcup2026_config`
Expected: 出力に `id = "xxxxxxxx"` が表示される。**この id を控える**。

- [ ] **Step 2: `wrangler.toml` を作成（id を差し込む）**

```toml
name = "wcup2026-yosou"
pages_build_output_dir = "public"
compatibility_date = "2026-01-01"

[[kv_namespaces]]
binding = "CONFIG"
id = "ここに Step 1 の id"
```

- [ ] **Step 3: 管理パスワードを Secret 登録**

Run: `npx wrangler pages secret put ADMIN_PASSWORD --project-name=wcup2026-yosou`
Expected: 値の入力プロンプト → 設定完了メッセージ。
（ローカル `wrangler pages dev` 用に `.dev.vars` に `ADMIN_PASSWORD=ローカル用パス` を作成。`.gitignore` 済み）

- [ ] **Step 4: コミット**

```bash
git add wrangler.toml
git commit -m "chore: add wrangler config with KV binding"
```

---

## Task 9: ローカル結合テスト → デプロイ

**Files:** なし（検証とデプロイ）

- [ ] **Step 1: `wrangler pages dev` で Functions+KV を起動**

Run: `npx wrangler pages dev public --kv CONFIG` をバックグラウンドで起動（ローカルKVは自動エミュレート）。`.dev.vars` の `ADMIN_PASSWORD` が読まれる。
Expected: `http://localhost:8788` で待受。

- [ ] **Step 2: GET がデフォルトを返す**

Run: `curl -s http://localhost:8788/api/config | head -c 120`
Expected: `{"version":1,...` で `teams` を含むJSON。

- [ ] **Step 3: 認証チェック**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8788/api/auth -H 'content-type: application/json' -d '{"password":"wrong"}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8788/api/auth -H 'content-type: application/json' -d '{"password":"<.dev.varsの値>"}'
```
Expected: `401` then `200`。

- [ ] **Step 4: PUT の認証・検証・保存**

Run:
```bash
# 不正パスワード → 401
curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://localhost:8788/api/config -H 'authorization: Bearer wrong' -d '{}'
# 正常 → 200（取得した config をそのまま書き戻す）
curl -s http://localhost:8788/api/config > /tmp/cfg.json
curl -s -X PUT http://localhost:8788/api/config -H "authorization: Bearer <.dev.varsの値>" -H 'content-type: application/json' --data-binary @/tmp/cfg.json
```
Expected: `401`、続いて `{"ok":true,"updatedAt":"..."}`。

- [ ] **Step 5: 保存値が GET に反映**

Run: `curl -s http://localhost:8788/api/config | grep -o '"updatedAt":"[^"]*"'`
Expected: `null` ではない ISO 日時。停止: `pkill -f "wrangler pages dev"`。

- [ ] **Step 6: 予想アプリ画面の結合確認（任意・ヘッドレス）**

`wrangler pages dev` 起動中に、ヘッドレスChromeで `http://localhost:8788/` と `http://localhost:8788/admin/` を開き、(1)予想アプリが描画される (2)管理画面でログイン→保存ができることを目視/スクショ確認。

- [ ] **Step 7: 本番デプロイ**

Run: `npx wrangler pages deploy public --project-name=wcup2026-yosou --commit-dirty=true`
Expected: `Deployment complete!` と URL。`functions/` が Functions として、KV バインドが適用される。
本番で `https://wcup2026-yosou.pages.dev/admin` にアクセスし、設定保存→トップ再読込で反映を確認。

- [ ] **Step 8: 最終コミット**

```bash
git add -A
git commit -m "feat: shared tournament config admin (KV-backed)"
```

---

## 自己レビュー結果

- **仕様カバレッジ**: 保存方式(KV=Task1,3,8) / GET公開・PUT認証(Task3) / auth(Task4) / 管理画面(Task7) / アプリ反映＋フォールバック(Task5,6) / 出場国・組み合わせ・正解・候補・日程(Task7) / デプロイ手順(Task8,9) — 仕様の全節に対応タスクあり。
- **スコープ外の明示**: 全選手名簿プルダウン・予想共有(D1)・日程のアプリ本体表示は将来フェーズ（実装タスクに含めない）。
- **型/名称整合**: `validateConfig`→`{ok,value,error}`、設定キー `teams/r16Teams/scorerSuggest/result{champion,runnerUp,topScorer,bracket{r16,qf,sf,final}}/schedule`、KVキー `config:v1`、バインド `CONFIG`、Secret `ADMIN_PASSWORD` を全タスクで統一。
- **プレースホルダ**: 各コードステップは完全なコードを記載。大配列(出場国/結果)は Task1 に実値を全掲載。
