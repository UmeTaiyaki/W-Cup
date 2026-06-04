# Plan B フェーズ1（オンボーディング/identity/同期）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログイン無しの匿名 identity（同期コード）でユーザーを識別し、初回はオンボーディング・ウィザード（名前→コア→オプション(スキップ可)→完了）、再訪はホーム直行、別端末は同期コードで復元できるフロントを実装する。

**Architecture:** `index.html` の `App()` を「identity ゲート付きルーター」にし、identity が無ければ `<Onboarding>`、有れば `<Home>` を描画。identity と予想保存は `public/identity.js`（`window.WC.Me`）に集約。既存の予想入力系 screens は `solo` フラグで単一ユーザー化して再利用。バックエンドは Plan A の `/api/user`（create/sync/setPred/get）をそのまま使い、User に `rooms[]` フィールドだけ追加（フェーズ2の配線に備える）。

**Tech Stack:** ビルドなし React 18（`<script type="text/babel">`）、`window.WC` 名前空間、Cloudflare Pages Functions、KV `CONFIG`、テストは node:test。

---

## File Structure

- `functions/_lib/users.js`（変更）: `rooms[]` を User モデルへ追加（make/validate/上限）。
- `functions/_lib/users.test.js`（変更）: rooms のテスト追加。
- `public/identity.js`（新規・plain IIFE → `window.WC.Me`）: identity の localStorage 管理・API・保存。
- `public/onboarding.jsx`（新規）: ウィザード＋別端末同期入力。
- `public/screens-core.jsx`（変更）: `InputScreen`/`SummaryScreen` に `solo` プロップ追加。
- `public/index.html`（変更）: `App()` をルーター化、`<Home>` 単一ユーザー shell、script 追加・`?v=` 更新。

---

## Task 1: User モデルに rooms[] を追加（バックエンド・TDD）

**Files:**
- Modify: `functions/_lib/users.js`
- Test: `functions/_lib/users.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/users.test.js` の末尾に追加:

```javascript
test('makeUser は rooms を空配列で初期化する', () => {
  const u = makeUser('たけし', 'ABCD2345');
  assert.deepEqual(u.rooms, []);
});

test('validateUser は rooms 欠損時に空配列を補完する', () => {
  const v = validateUser({ id: 'u1', name: 'のぞみ', code: 'ABCD2345' });
  assert.deepEqual(v.rooms, []);
});

test('validateUser は rooms の各要素を {id,code,name} へ正規化する', () => {
  const v = validateUser({
    id: 'u1', name: 'x', code: 'ABCD2345',
    rooms: [
      { id: 'r1', code: 'wxyz2345', name: ' 部屋A ', junk: 1 },
      { id: '', code: 'x', name: 'bad' },      // id 無し → 除外
      'not-an-object',                          // 非オブジェクト → 除外
    ],
  });
  assert.equal(v.rooms.length, 1);
  assert.deepEqual(v.rooms[0], { id: 'r1', code: 'WXYZ2345', name: '部屋A' });
});

test('validateUser は rooms を上限 maxRooms で丸める', () => {
  const many = Array.from({ length: USER_LIMITS.maxRooms + 5 },
    (_, i) => ({ id: `r${i}`, code: 'ABCD2345', name: `room${i}` }));
  const v = validateUser({ id: 'u1', name: 'x', code: 'ABCD2345', rooms: many });
  assert.equal(v.rooms.length, USER_LIMITS.maxRooms);
});

test('publicUser は rooms を含めない', () => {
  const u = makeUser('たけし', 'ABCD2345');
  u.rooms = [{ id: 'r1', code: 'WXYZ2345', name: '部屋A' }];
  const pub = publicUser(u);
  assert.ok(!('rooms' in pub), 'rooms を含んではいけない');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: 新規 5 テストが FAIL（`u.rooms` が undefined 等）。

- [ ] **Step 3: 最小実装**

`functions/_lib/users.js` を編集:

```javascript
export const USER_LIMITS = { name: 20, postBytes: 64 * 1024, maxRooms: 50, roomName: 30 };

// rooms 配列を {id, code, name} の形へ正規化（不正要素は除外、上限で丸め）。
function normalizeRooms(rooms) {
  if (!Array.isArray(rooms)) return [];
  const out = [];
  for (const r of rooms) {
    if (!r || typeof r !== 'object') continue;
    if (typeof r.id !== 'string' || !r.id) continue;
    const name = (typeof r.name === 'string' ? r.name.trim() : '').slice(0, USER_LIMITS.roomName);
    out.push({ id: r.id, code: normalizeCode(r.code), name });
    if (out.length >= USER_LIMITS.maxRooms) break;
  }
  return out;
}
```

`makeUser` の返却に `rooms: []` を追加（`pred: emptyPred(),` の次の行）:

```javascript
    pred: emptyPred(),
    rooms: [],
    updatedAt: new Date().toISOString(),
```

`validateUser` の返却に `rooms` を追加（`pred: validatePred(input.pred).value,` の次の行）:

```javascript
    pred: validatePred(input.pred).value,
    rooms: normalizeRooms(input.rooms),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null,
```

`publicUser` は変更不要（明示構築で rooms を含まない）。

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全テスト PASS（106 + 5 = 111）。

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/users.js functions/_lib/users.test.js
git commit -m "feat(user): User に rooms[] を追加（端末またぎの部屋引き継ぎ用）"
```

---

## Task 2: identity データ層（`public/identity.js`）

**Files:**
- Create: `public/identity.js`

**Note:** ビルドなし JSX のため自動テストは無し。Step では完全な実装コードを示し、Step 4 でブラウザ手動確認を行う。`/api/user` の応答形は Plan A 準拠（create/sync→`{userId, code, user}`、setPred→publicUser）。

- [ ] **Step 1: identity.js を作成**

`public/identity.js`:

```javascript
/* ============================================================
   W杯2026 — 匿名 identity（同期コード）データ層
   window.WC.Me に集約。Babel前の普通の<script>で読み込む。
   localStorage:
     wc2026_identity_v1 = {"userId","code"}
     wc2026_me_v1       = User キャッシュ JSON（即時描画用）
   ============================================================ */
(function () {
  const ID_KEY = 'wc2026_identity_v1';
  const ME_KEY = 'wc2026_me_v1';

  function load() {
    try {
      const raw = localStorage.getItem(ID_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      return (v && v.userId && v.code) ? { userId: v.userId, code: v.code } : null;
    } catch (e) { return null; }
  }
  function cachedUser() {
    try { const raw = localStorage.getItem(ME_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function saveIdentity(userId, code, user) {
    try {
      localStorage.setItem(ID_KEY, JSON.stringify({ userId, code }));
      if (user) localStorage.setItem(ME_KEY, JSON.stringify(user));
    } catch (e) {}
  }
  function cacheUser(user) {
    try { if (user) localStorage.setItem(ME_KEY, JSON.stringify(user)); } catch (e) {}
  }
  function clear() {
    try { localStorage.removeItem(ID_KEY); localStorage.removeItem(ME_KEY); } catch (e) {}
  }

  async function postOp(body) {
    const res = await fetch('/api/user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      keepalive: !!body.__keepalive,
    });
    if (!res.ok) {
      let msg = '通信に失敗しました'; let status = res.status;
      try { const e = await res.json(); if (e && e.error) msg = e.error; } catch (e2) {}
      const err = new Error(msg); err.status = status; throw err;
    }
    return res.json();
  }

  // 名前で新規作成。{userId, code, user} を保存して返す。
  async function create(name) {
    const out = await postOp({ op: 'create', name });
    saveIdentity(out.userId, out.code, out.user);
    return out;
  }
  // 同期コードで復元。{userId, code, user} を保存して返す。
  async function sync(code) {
    const out = await postOp({ op: 'sync', code });
    saveIdentity(out.userId, out.code, out.user);
    return out;
  }
  // 保存済み identity で最新 user を取得。失効(404)なら clear して null。
  async function refresh() {
    const id = load();
    if (!id) return null;
    try {
      const out = await postOp({ op: 'sync', code: id.code });
      saveIdentity(out.userId, out.code, out.user);
      return out.user;
    } catch (e) {
      if (e.status === 404) { clear(); return null; }
      return cachedUser(); // 通信失敗はキャッシュで継続
    }
  }

  // ---- 予想の debounce 保存（setPred は code 必須=本人確認）----
  let timer = null, pending = null;
  function scheduleSave(pred) {
    pending = pred;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flushSave, 700);
  }
  function flushSave() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending == null) return;
    const id = load(); const pred = pending; pending = null;
    if (!id) return;
    postOp({ op: 'setPred', userId: id.userId, code: id.code, pred })
      .then((u) => cacheUser(u))
      .catch((e) => console.error('予想の保存に失敗しました', e));
  }
  function flushBeacon() {
    if (pending == null) return;
    const id = load(); const pred = pending; pending = null;
    if (timer) { clearTimeout(timer); timer = null; }
    if (!id) return;
    try {
      const body = JSON.stringify({ op: 'setPred', userId: id.userId, code: id.code, pred });
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/user', blob);
      else postOp({ op: 'setPred', userId: id.userId, code: id.code, pred, __keepalive: true }).catch(() => {});
    } catch (e) {}
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushBeacon);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushBeacon();
    });
  }

  window.WC = window.WC || {};
  window.WC.Me = {
    load, cachedUser, clear, create, sync, refresh,
    scheduleSave, flushSave, flushBeacon, cacheUser,
  };
})();
```

- [ ] **Step 2: index.html に読み込みを追加（Task 5 で本格配線するが先に読み込む）**

`public/index.html` の `<script src="data.js?v=3"></script>` の直後に追加:

```html
  <script src="identity.js?v=1"></script>
```

- [ ] **Step 3: 構文確認**

Run: `node --check public/identity.js`
Expected: エラーなし（終了コード 0）。

- [ ] **Step 4: コミット**

```bash
git add public/identity.js public/index.html
git commit -m "feat(identity): 匿名 identity データ層 window.WC.Me を追加"
```

---

## Task 3: 単一ユーザー化フラグを screens に追加

**Files:**
- Modify: `public/screens-core.jsx`

`InputScreen`/`SummaryScreen` は多人数前提（削除UI・「仲間を切り替え」コピー・「みんなの優勝予想」）。`solo` プロップで単一ユーザー時にそれらを隠す。

- [ ] **Step 1: InputScreen に solo を追加**

`function InputScreen({ T, member, pred, setPick, onRemove, canRemove, goOption, wide = false })` を
`function InputScreen({ T, member, pred, setPick, onRemove, canRemove, goOption, wide = false, solo = false })` に変更。

説明文（`優勝・準優勝・得点王を選ぶと自動で保存。上の人物アイコンで仲間を切り替えられます。`）を solo で出し分け:

```jsx
      <p style={{ color: T.sub, fontSize: 13.5, lineHeight: 1.6, margin: '0 0 16px' }}>
        {solo ? '優勝・準優勝・得点王を選ぶと自動で保存されます。'
              : '優勝・準優勝・得点王を選ぶと自動で保存。上の人物アイコンで仲間を切り替えられます。'}</p>
```

「参加者の削除」ブロック全体（`{/* 参加者の削除 */}` の `<div>...</div>`）を solo のとき非表示にする。そのブロックを `{!solo && ( ... )}` で囲む。

- [ ] **Step 2: SummaryScreen に solo を追加**

`function SummaryScreen({ T, state, member, pred, goTab, goView, wide = false, dashboard = false })` を
`... dashboard = false, solo = false })` に変更。

`Everyone`/`ChampDist`（みんなの優勝予想・分布）と「ランキング」リンクは複数人前提のため、solo では描画しない。各 return 分岐で solo 時に `<Everyone/>`・`<Panel><Everyone/></Panel>`・`<ChampDist/>` を出さないようにする。モバイル return を例にすると:

```jsx
  // ----- モバイル（既存） -----
  return (
    <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Header />
      <PodiumHero />
      <Picks />
      <ViewOptionsBtn />
      {!solo && <Everyone />}
    </div>
  );
```

wide / dashboard 分岐でも同様に、右カラムの `<Panel><Everyone flush /></Panel>` と `<Panel><ChampDist /></Panel>` を `{!solo && ...}` で囲む（solo 時に右カラムが空なら左カラムのみで可）。

- [ ] **Step 3: 構文確認（Babel変換可能か）**

Run: `node -e "require('@babel/core')" 2>/dev/null || echo "babel無し→ブラウザ確認に委ねる"`
（ローカルに babel が無ければ Task 5 のブラウザ確認で担保。最低限 `grep -c "solo" public/screens-core.jsx` で 2 箇所以上の追加を確認。）

- [ ] **Step 4: コミット**

```bash
git add public/screens-core.jsx
git commit -m "feat(screens): InputScreen/SummaryScreen に solo（単一ユーザー）対応を追加"
```

---

## Task 4: オンボーディング・ウィザード（`public/onboarding.jsx`）

**Files:**
- Create: `public/onboarding.jsx`

**Props:** `<Onboarding T={T} onDone={(user) => ...} />`。`onDone` で App がホームへ遷移する。内部 state: `step`（`'name'|'sync'|'core'|'option'|'done'`）、`me`（作成済み User）、`pred`、`busy`、`err`。

**再利用:** コア step は `TeamPicker`/`ScorerPicker`（ui.jsx）。オプション step は `GroupRankScreen`/`ThirdWildScreen`/`KnockoutScreen`（screens-*）。保存は `window.WC.Me`。

- [ ] **Step 1: onboarding.jsx を作成**

骨子（スタイルは既存 screens/Sheet の流儀＝`T.card`/`T.accent`/角丸/`boxShadow: inset 0 0 0 1px T.line` に合わせる）:

```jsx
/* ============================================================
   オンボーディング・ウィザード（名前→コア→オプション→完了）＋別端末同期
   ============================================================ */
function Onboarding({ T, onDone }) {
  const { useState } = React;
  const [step, setStep] = useState('name');     // name | sync | core | option | done
  const [me, setMe] = useState(null);           // 作成済み User
  const [pred, setPred] = useState(() => window.WC.emptyPred());
  const [optScreen, setOptScreen] = useState(null); // grouprank|thirdwild|knockout|null
  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const member = me ? { id: me.id, name: me.name, c: T.accent, initial: Array.from(me.name)[0] || '?' } : null;

  function persistPred(next) { setPred(next); window.WC.Me.scheduleSave(next); }
  function setPick(field, value) { persistPred({ ...pred, [field]: value }); }
  function setGroupRank(k, arr) { persistPred({ ...pred, groupRank: { ...(pred.groupRank||{}), [k]: arr } }); }
  function setThirdAssign(slot, code) {
    const ta = { ...(pred.thirdAssign||{}) };
    if (code) Object.keys(ta).forEach((s) => { if (s !== slot && ta[s] === code) ta[s] = null; });
    ta[slot] = code; persistPred({ ...pred, thirdAssign: ta });
  }
  function setKnockout(w) { persistPred({ ...pred, knockout: w }); }

  async function commitName() {
    const nm = name.trim(); if (!nm || busy) return;
    setBusy(true); setErr('');
    try {
      const out = await window.WC.Me.create(nm);
      setMe(out.user); setPred(out.user.pred || window.WC.emptyPred()); setStep('core');
    } catch (e) { setErr(e.message || '作成に失敗しました'); }
    finally { setBusy(false); }
  }
  async function commitSync() {
    const c = codeInput.trim(); if (!c || busy) return;
    setBusy(true); setErr('');
    try { const out = await window.WC.Me.sync(c); onDone(out.user); }
    catch (e) { setErr(e.status === 404 ? 'コードに該当するユーザーがいません' : (e.message || '復元に失敗しました')); }
    finally { setBusy(false); }
  }
  function finish() { window.WC.Me.flushSave(); onDone({ ...me, pred }); }

  // --- 各 step の描画（name/sync/core/option/done）---
  // name : 名前入力 + 「はじめる」 + 「別の端末から続ける」リンク(→ step='sync')
  // sync : コード入力 + 「復元する」 + 「戻る」(→ step='name')
  // core : <InputScreen solo T member pred setPick goOption=()=>setStep('option')
  //         onRemove/ canRemove は使わない(solo) /> + 下部に「次へ（オプション予想）」
  //         ※ core では goOption を「オプションへ」に流用せず、専用の「次へ」ボタンで step='option'
  // option : optScreen により <GroupRankScreen>/<ThirdWildScreen>/<KnockoutScreen>、
  //          null のときオプション選択メニュー + 「スキップして完了」(→ step='done')
  // done : 完了メッセージ + 同期コード(コピー) + 注意文 + 「はじめる」(finish)
  // ... 実装は既存 Sheet/ボタンのスタイルに合わせる ...

  return <OnboardingView {/* step, handlers, T, ... */} />;
}
Object.assign(window, { Onboarding });
```

実装メモ（重要な配線のみ・スタイルは既存準拠）:
- **進捗表示**: 上部に「①名前 ②予想 ③完了」程度のステップインジケータ（任意、簡素で可）。
- **core step**: `InputScreen` を `solo` で使うと「オプション予想の入口」カードが出る。オンボーディングでは optScreen 遷移を `goOption={(s)=>{ setOptScreen(s); setStep('option'); }}` に繋ぐ。コア3つの下に進む「次へ」ボタン（`step='option'` でなく直接 `step='done'` への近道として「スキップして完了」もここに置いてよい）。シンプルにするなら core 画面の最下部に主ボタン「次へ」→ `step='option'`。
- **option step / null メニュー**: 「グループ順位」「3位ワイルドカード」「ノックアウト」を選ぶと該当 screen、各 screen の `goBack` は `()=>setOptScreen(null)`。メニュー画面に「スキップして完了」主ボタン → `setStep('done')`。
- **done step の同期コード表示**: `formatCode`（`window.WC` に無ければ `code` を4-4でハイフン整形する小関数を onboarding 内に置く）でコード表示。コピーは `navigator.clipboard.writeText(me.code)`。注意文: 「このブラウザを変えると消えます。コードを無くすと復元できません。」
- **エラー表示**: `err` を name/sync step の入力下に赤系（`#FF6B6B`）で表示。
- `busy` 中はボタン無効＋ラベルを「…」に。

完全なスタイル付き JSX は既存 `screens-core.jsx`（ボタン/カード/Sheet）と `index.html` の「参加者を追加」Sheet を手本に実装する。

- [ ] **Step 2: index.html に読み込みを追加**

`public/index.html` の screens 読み込み群（`screens-optview.jsx` の行の後など、App より前）に追加:

```html
  <script type="text/babel" src="onboarding.jsx?v=1"></script>
```

- [ ] **Step 3: 構文確認**

Run: `grep -c "function Onboarding" public/onboarding.jsx`
Expected: `1`。（Babel構文の最終確認は Task 6 のブラウザ。）

- [ ] **Step 4: コミット**

```bash
git add public/onboarding.jsx public/index.html
git commit -m "feat(onboarding): オンボーディング・ウィザード＋別端末同期画面を追加"
```

---

## Task 5: App() をルーター化し、単一ユーザー Home を実装

**Files:**
- Modify: `public/index.html`（`App()` と script `?v=`）

現状 `App()` は旧共有ボード（members 切替・addMember・`/api/predictions`）。これを「identity ゲート付きルーター」に作り替え、ホームを単一ユーザー化する。

- [ ] **Step 1: ルーター化**

`App()` の冒頭を identity 判定に変更:

```jsx
    function App() {
      const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
      const T = useTheme(t);  // ↓ テーマ合成を関数化（既存ロジックを移設）
      const [route, setRoute] = useState(() => window.WC.Me.load() ? 'home' : 'onboarding');
      const [me, setMe] = useState(() => window.WC.Me.cachedUser());

      useEffect(() => {
        window.WC.fetchConfig();           // 既存：チーム/結果/名簿の取得
        if (route === 'home') {
          window.WC.Me.refresh().then((u) => {
            if (u) setMe(u);
            else { setRoute('onboarding'); setMe(null); }  // 失効
          });
        }
      }, []);

      if (route === 'onboarding') {
        return <ThemeFrame T={T} t={t} setTweak={setTweak}>
          <Onboarding T={T} onDone={(u) => { setMe(u); setRoute('home'); }} />
        </ThemeFrame>;
      }
      if (!me) return <ThemeFrame T={T} t={t} setTweak={setTweak}><Splash T={T} /></ThemeFrame>;
      return <Home T={T} t={t} setTweak={setTweak} me={me} setMe={setMe}
        onSignOut={() => { window.WC.Me.clear(); setMe(null); setRoute('onboarding'); }} />;
    }
```

補助コンポーネント（同 script 内に定義）:
- `useTheme(t)`: 既存の「テーマ合成」ブロック（`base`→`T`、accent から `accentInk` 算出）を関数化して返す。
- `ThemeFrame`: 既存の最外殻（`#0b0d12` 背景・`#wc-app-root`・プレビュー枠・`<TweaksPanel>`）を包む薄いラッパ。Onboarding/Splash/Home を `children` として中央に表示。Tweaks の preview 幅対応は維持。
- `Splash`: ロード中の簡素なプレースホルダ（ロゴ＋スピナ文言）。

- [ ] **Step 2: Home（単一ユーザー shell）を実装**

`Home` は現 `App()` のモバイル/デスクトップ shell を流用しつつ、members 機構を撤去する:

```jsx
    function Home({ T, t, setTweak, me, setMe, onSignOut }) {
      const [tab, setTab] = useState('summary');     // summary | input | group | account
      const [optScreen, setOptScreen] = useState(null);
      const pred = me.pred || window.WC.emptyPred();
      const member = { id: me.id, name: me.name, c: T.accent, initial: Array.from(me.name)[0] || '?' };

      function persist(nextPred) {
        const next = { ...me, pred: nextPred };
        setMe(next);                          // 楽観更新
        window.WC.Me.scheduleSave(nextPred);  // debounce 保存
      }
      function setPick(f, v) { persist({ ...pred, [f]: v }); }
      function setGroupRank(k, arr) { persist({ ...pred, groupRank: { ...(pred.groupRank||{}), [k]: arr } }); }
      function setThirdAssign(slot, code) {
        const ta = { ...(pred.thirdAssign||{}) };
        if (code) Object.keys(ta).forEach((s)=>{ if (s!==slot && ta[s]===code) ta[s]=null; });
        ta[slot]=code; persist({ ...pred, thirdAssign: ta });
      }
      function setKnockout(w) { persist({ ...pred, knockout: w }); }
      function goTab(id) { setOptScreen(null); setTab(id); }

      // state 互換シム（既存 screens が state.members/preds を参照するため）
      const soloState = { current: me.id, members: [member], preds: { [me.id]: pred } };

      const TABS = [
        { id: 'summary', label: 'ホーム', icon: 'trophy' },
        { id: 'input',   label: '予想',   icon: 'edit' },
        { id: 'group',   label: '大会結果', icon: 'grid' },
        { id: 'account', label: 'アカウント', icon: 'people' },
      ];

      function renderScreen(wide) {
        if (tab === 'summary') return <SummaryScreen solo T={T} state={soloState} member={member}
          pred={pred} goTab={goTab} wide={wide} />;
        if (tab === 'input') {
          if (optScreen === 'grouprank') return <GroupRankScreen T={T} member={member} pred={pred}
            setGroupRank={setGroupRank} goBack={() => setOptScreen(null)} wide={wide} />;
          if (optScreen === 'thirdwild') return <ThirdWildScreen T={T} member={member} pred={pred}
            setThirdAssign={setThirdAssign} goBack={() => setOptScreen(null)} wide={wide} />;
          if (optScreen === 'knockout') return <KnockoutScreen T={T} member={member} pred={pred}
            setKnockout={setKnockout} goBack={() => setOptScreen(null)} wide={wide} />;
          return <InputScreen solo T={T} member={member} pred={pred} setPick={setPick}
            goOption={setOptScreen} wide={wide} />;
        }
        if (tab === 'group') return <GroupScreen T={T} wide={wide} />;
        if (tab === 'account') return <AccountScreen T={T} me={me} onSignOut={onSignOut} />;
        return null;
      }
      // ... 既存 App() の mobileShell/desktopShell を流用。ただし:
      //   - members 切替 switcher・参加者追加(adding/Sheet)・doReset を撤去
      //   - Sidebar の members/current/setCurrent/onAdd/onReset は使わない（Sidebar を簡素版に）
      //   - RightRail はランキング前提のため solo では非表示
      // 最外殻(ThemeFrame 相当)は App 側で包む。
    }
```

- `AccountScreen`（新規・同 script 内）: 同期コードを `XXXX-XXXX` 表示＋コピー、注意文（「ブラウザを変えると消える/無くすと復元不可」）、`onSignOut`（このブラウザの identity を消す）ボタン。フェーズ2で部屋一覧をここ or 専用タブに出す。
- Sidebar はメンバー欄を持つため、Home では `members={[]}` を渡す簡素運用か、`solo` 対応の分岐を `app-shell.jsx` 側に小さく足す（メンバー欄と「サンプルに戻す」を非表示）。最小実装としては Home 用の軽量ナビを Home 内にインラインで持ってもよい。

- [ ] **Step 3: 旧共有ボード経路の撤去確認**

`App()` 内の `addMember`/`removeMember`/`commitAdd`/`doReset`/`setCurrent`/`fetchPredictions` 呼び出し・`adding`/`newName` state・参加者追加 Sheet を Home/App から除去（または未使用化）。`grep -n "fetchPredictions\|addMember\|doReset" public/index.html` で App 経路に残っていないこと（data.js 側の定義は残置で可）。

- [ ] **Step 4: script の ?v= を更新**

`public/index.html` で変更したファイルの版を上げる（例: `data.js?v=3`→据え置き可、`identity.js?v=1`、`onboarding.jsx?v=1`、`screens-core.jsx?v=2`→`?v=3`）。`_headers` で no-cache だが本番反映の確実性のため変更ファイルはバンプする。

- [ ] **Step 5: コミット**

```bash
git add public/index.html public/app-shell.jsx
git commit -m "feat(app): App をルーター化し単一ユーザー Home/アカウントを実装"
```

---

## Task 6: ローカル動作確認（手動・受け入れ基準）

**Files:** なし（確認のみ）

- [ ] **Step 1: dev サーバ起動**

Run: `npm run dev`（`wrangler pages dev public`）。表示された URL を開く。
（KV `CONFIG` は wrangler のローカル KV か、未バインドなら `/api/*` が 500/未定義になる点に注意。必要なら `--kv CONFIG` を付すか、本番デプロイで確認。）

- [ ] **Step 2: 受け入れ基準の手動チェック**

- [ ] 初回（localStorage 空）でオンボーディングが出る。名前→コア→（オプションをスキップ）→完了 まで進める。
- [ ] 完了画面に同期コードと「ブラウザを変えると消える」注意が出る。コピーできる。
- [ ] リロードでオンボーディングをスキップしホーム直行。
- [ ] ホームで優勝/準優勝/得点王を編集 → リロード後も保持される（setPred 保存）。
- [ ] 別ブラウザ（or シークレット窓）で「別の端末から続ける」→ 同期コード入力 → 予想が復元される。
- [ ] アカウントタブで同期コードを再表示できる。

- [ ] **Step 3: 全自動テスト再確認**

Run: `npm test`
Expected: 全 PASS（111）。

- [ ] **Step 4: 手動確認の結果を記録してコミット（必要なら微修正）**

問題があれば該当 Task に戻って修正。OK なら本フェーズ完了。

---

## Self-Review メモ
- spec §3（rooms[]）→ Task 1。§4.1（WC.Me）→ Task 2。§5.2 ウィザード→ Task 4。§5.1 ルーティング/§5.3 ホーム/アカウント→ Task 5。§5.4 同期→ Task 4（sync step）。§8 テスト→ Task 1 / Task 6。
- フェーズ2（部屋）は本計画外（別計画）。完了画面/ホームの「部屋」CTA はフェーズ2で追加。
- JSX のスタイル詳細は既存 screens 準拠のため、各 Task の Step では配線ロジックを完全に示し、装飾は手本ファイルを参照する方針（ビルドなし＝自動テスト不可のため Task 6 の手動確認で品質担保）。
