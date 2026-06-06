# ホームタブ「試合日程」実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームタブを、管理画面の試合日程を見せる「直近フォーカス型・読み取り専用」の日程ビュー（フォーカス日のスワイプカルーセル＋翌日以降のタイムライン）に作り替える。

**Architecture:** 純ロジックは ESM モジュール `public/lib/schedule-view.js` に置き node テストで検証、表示は babel JSX `public/screens-home.jsx`。`index.html` のホーム描画を `SummaryScreen` から `HomeScreen` へ差し替える。`SummaryScreen` は部屋比較で使うため残す。

**Tech Stack:** React 18（CDN + babel）、ESM 純モジュール、`node --test`、Cloudflare Pages。テーマは `window.WC.THEMES.pitch`、チーム参照は `window.WC.TEAM[code]`。

---

## File Structure

- Create: `public/lib/schedule-view.js` — 純関数（`groupByDate` / `pickFocusDate` / `roundLabel` / `formatMatchTeam` / `jstToday`）。ESM export。
- Create: `functions/_lib/schedule-view.test.js` — 上記の node ユニットテスト（`../../public/lib/schedule-view.js` を import）。
- Create: `public/screens-home.jsx` — `HomeScreen` / `MatchCarousel` / `DayTimeline` / `MatchRow`。`Object.assign(window, { HomeScreen })`。
- Modify: `public/index.html` — module script に schedule-view の import + `Object.assign(window.WC, ...)`、babel script タグに `screens-home.jsx` 追加、ホーム描画分岐（462-463行）を `HomeScreen` に差し替え。
- Reference (変更しない): `public/screens-core.jsx`（SummaryScreen は残す）、`public/ui.jsx`（Card/Flag/Eyebrow/Icon）、`public/data.js`（TEAM/SCHEDULE）。

データ1件の形: `{ date:'2026-06-12', time:'04:00', round:'A', a:'MEX', b:'RSA', note:'Mexico City' }`。
ノックアウトは `a`/`b` がスロット表記（`1A`=グループA1位 / `2A`=2位 / `3XYZ…`=該当群3位 / `W73`=第73試合勝者 / `L73`=敗者）、`round` は `R32`/`R16`/`QF`/`SF`/`3rd`/`F`。

---

## Task 1: 純関数 `roundLabel` / `formatMatchTeam`

**Files:**
- Create: `public/lib/schedule-view.js`
- Test: `functions/_lib/schedule-view.test.js`

- [ ] **Step 1: 失敗するテストを書く**

Create `functions/_lib/schedule-view.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundLabel, formatMatchTeam } from '../../public/lib/schedule-view.js';

test('roundLabel: グループ記号は「グループX」', () => {
  assert.equal(roundLabel('A'), 'グループA');
  assert.equal(roundLabel('L'), 'グループL');
});

test('roundLabel: ノックアウトのラウンド名', () => {
  assert.equal(roundLabel('R32'), 'ベスト32');
  assert.equal(roundLabel('R16'), 'ベスト16');
  assert.equal(roundLabel('QF'), '準々決勝');
  assert.equal(roundLabel('SF'), '準決勝');
  assert.equal(roundLabel('3rd'), '3位決定戦');
  assert.equal(roundLabel('F'), '決勝');
});

test('roundLabel: 不明値はそのまま返す', () => {
  assert.equal(roundLabel('ZZ'), 'ZZ');
  assert.equal(roundLabel(''), '');
});

test('formatMatchTeam: 既知チームコードは確定扱い', () => {
  const teamMap = { MEX: { ja: 'メキシコ', flag: '🇲🇽' } };
  assert.deepEqual(formatMatchTeam('MEX', teamMap), {
    resolved: true, code: 'MEX', label: 'メキシコ', flag: '🇲🇽',
  });
});

test('formatMatchTeam: スロット表記は未確定ラベル', () => {
  assert.deepEqual(formatMatchTeam('1A', {}), {
    resolved: false, code: '1A', label: 'グループA 1位', flag: null,
  });
  assert.deepEqual(formatMatchTeam('2C', {}), {
    resolved: false, code: '2C', label: 'グループC 2位', flag: null,
  });
  assert.deepEqual(formatMatchTeam('W73', {}), {
    resolved: false, code: 'W73', label: '第73試合 勝者', flag: null,
  });
  assert.deepEqual(formatMatchTeam('L88', {}), {
    resolved: false, code: 'L88', label: '第88試合 敗者', flag: null,
  });
});

test('formatMatchTeam: 3位群スロットは「3位通過」表記', () => {
  const r = formatMatchTeam('3ABCD', {});
  assert.equal(r.resolved, false);
  assert.equal(r.label, '3位通過');
});

test('formatMatchTeam: 空や未知は未定', () => {
  assert.deepEqual(formatMatchTeam('', {}), {
    resolved: false, code: '', label: '未定', flag: null,
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/_lib/schedule-view.test.js`
Expected: FAIL（`Cannot find module '../../public/lib/schedule-view.js'`）

- [ ] **Step 3: 最小実装を書く**

Create `public/lib/schedule-view.js`:

```js
// 試合日程ビューの純ロジック（ブラウザ/Node 共有・ESM）

const ROUND_NAMES = {
  R32: 'ベスト32', R16: 'ベスト16', QF: '準々決勝',
  SF: '準決勝', '3rd': '3位決定戦', F: '決勝',
};

// round 記号 → 章ラベル
export function roundLabel(round) {
  if (round == null) return '';
  if (/^[A-L]$/.test(round)) return `グループ${round}`;
  return ROUND_NAMES[round] || round;
}

// a/b の表記（確定コード or スロット）を表示用に正規化
export function formatMatchTeam(code, teamMap = {}) {
  const c = code || '';
  const team = teamMap[c];
  if (team) {
    return { resolved: true, code: c, label: team.ja, flag: team.flag };
  }
  let label = '未定';
  let m;
  if ((m = /^([12])([A-L])$/.exec(c))) {
    label = `グループ${m[2]} ${m[1]}位`;
  } else if (/^3[A-L]{2,}$/.test(c)) {
    label = '3位通過';
  } else if ((m = /^W(\d+)$/.exec(c))) {
    label = `第${m[1]}試合 勝者`;
  } else if ((m = /^L(\d+)$/.exec(c))) {
    label = `第${m[1]}試合 敗者`;
  }
  return { resolved: false, code: c, label, flag: null };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/schedule-view.test.js`
Expected: PASS（7 tests）

- [ ] **Step 5: コミット**

```bash
git add public/lib/schedule-view.js functions/_lib/schedule-view.test.js
git commit -m "feat(home): 試合日程の表示ラベル純関数を追加"
```

---

## Task 2: 純関数 `groupByDate`

**Files:**
- Modify: `public/lib/schedule-view.js`
- Test: `functions/_lib/schedule-view.test.js`

- [ ] **Step 1: 失敗するテストを追記**

Append to `functions/_lib/schedule-view.test.js`:

```js
import { groupByDate } from '../../public/lib/schedule-view.js';

test('groupByDate: 日付昇順・各日内は時刻昇順', () => {
  const sched = [
    { date: '2026-06-13', time: '10:00', round: 'D', a: 'USA', b: 'PAR' },
    { date: '2026-06-12', time: '11:00', round: 'A', a: 'KOR', b: 'CZE' },
    { date: '2026-06-12', time: '04:00', round: 'A', a: 'MEX', b: 'RSA' },
  ];
  const out = groupByDate(sched);
  assert.deepEqual(out.map((g) => g.date), ['2026-06-12', '2026-06-13']);
  assert.deepEqual(out[0].matches.map((m) => m.time), ['04:00', '11:00']);
  assert.equal(out[0].matches.length, 2);
  assert.equal(out[1].matches.length, 1);
});

test('groupByDate: 同時刻試合も両方保持', () => {
  const sched = [
    { date: '2026-06-25', time: '04:00', round: 'B', a: 'SUI', b: 'CAN' },
    { date: '2026-06-25', time: '04:00', round: 'B', a: 'BIH', b: 'QAT' },
  ];
  const out = groupByDate(sched);
  assert.equal(out.length, 1);
  assert.equal(out[0].matches.length, 2);
});

test('groupByDate: date 欠落要素は末尾「日付未定」グループへ', () => {
  const sched = [
    { date: '2026-06-12', time: '04:00', round: 'A', a: 'MEX', b: 'RSA' },
    { time: '04:00', round: 'F', a: 'W101', b: 'W102' },
  ];
  const out = groupByDate(sched);
  assert.equal(out.length, 2);
  assert.equal(out[out.length - 1].date, null);
  assert.equal(out[out.length - 1].matches.length, 1);
});

test('groupByDate: 空配列は空配列', () => {
  assert.deepEqual(groupByDate([]), []);
  assert.deepEqual(groupByDate(null), []);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/_lib/schedule-view.test.js`
Expected: FAIL（`groupByDate is not a function`）

- [ ] **Step 3: 最小実装を追記**

Append to `public/lib/schedule-view.js`:

```js
// schedule を日付ごとにまとめ、日付昇順・各日内は時刻昇順で返す。
// date 欠落要素は末尾の { date: null } グループへ集約。
export function groupByDate(schedule) {
  const list = Array.isArray(schedule) ? schedule : [];
  const byDate = new Map();
  const undated = [];
  for (const m of list) {
    if (!m) continue;
    if (m.date) {
      if (!byDate.has(m.date)) byDate.set(m.date, []);
      byDate.get(m.date).push(m);
    } else {
      undated.push(m);
    }
  }
  const dates = [...byDate.keys()].sort();
  const byTime = (x, y) => (x.time || '').localeCompare(y.time || '');
  const out = dates.map((date) => ({
    date,
    matches: byDate.get(date).slice().sort(byTime),
  }));
  if (undated.length) out.push({ date: null, matches: undated.slice().sort(byTime) });
  return out;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/schedule-view.test.js`
Expected: PASS（全 11 tests）

- [ ] **Step 5: コミット**

```bash
git add public/lib/schedule-view.js functions/_lib/schedule-view.test.js
git commit -m "feat(home): 試合日程を日付ごとに整形する groupByDate を追加"
```

---

## Task 3: 純関数 `pickFocusDate` と `jstToday`

**Files:**
- Modify: `public/lib/schedule-view.js`
- Test: `functions/_lib/schedule-view.test.js`

- [ ] **Step 1: 失敗するテストを追記**

Append to `functions/_lib/schedule-view.test.js`:

```js
import { pickFocusDate, jstToday } from '../../public/lib/schedule-view.js';

const DATES = ['2026-06-12', '2026-06-13', '2026-06-25'];

test('pickFocusDate: 今日に試合があれば今日', () => {
  assert.equal(pickFocusDate(DATES, '2026-06-13'), '2026-06-13');
});

test('pickFocusDate: 今日に試合が無ければ次の試合日', () => {
  assert.equal(pickFocusDate(DATES, '2026-06-07'), '2026-06-12'); // 大会前
  assert.equal(pickFocusDate(DATES, '2026-06-20'), '2026-06-25'); // 休養日
});

test('pickFocusDate: 今日以降に試合が無ければ最後の試合日', () => {
  assert.equal(pickFocusDate(DATES, '2026-07-01'), '2026-06-25'); // 大会後
});

test('pickFocusDate: 空リストは null', () => {
  assert.equal(pickFocusDate([], '2026-06-12'), null);
  assert.equal(pickFocusDate(null, '2026-06-12'), null);
});

test('jstToday: ミリ秒からJSTの YYYY-MM-DD を返す', () => {
  // 2026-06-12T19:30:00Z = JST 2026-06-13 04:30 → '2026-06-13'
  assert.equal(jstToday(Date.parse('2026-06-12T19:30:00Z')), '2026-06-13');
  // 2026-06-12T14:00:00Z = JST 2026-06-12 23:00 → '2026-06-12'
  assert.equal(jstToday(Date.parse('2026-06-12T14:00:00Z')), '2026-06-12');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/_lib/schedule-view.test.js`
Expected: FAIL（`pickFocusDate is not a function`）

- [ ] **Step 3: 最小実装を追記**

Append to `public/lib/schedule-view.js`:

```js
// 並んだ試合日リスト（昇順想定）から、今日 or それ以降で最初の試合日を返す。
// 今日以降に無ければ最後の試合日。リストが空なら null。
export function pickFocusDate(dateList, today) {
  const dates = (Array.isArray(dateList) ? dateList : []).filter(Boolean).slice().sort();
  if (!dates.length) return null;
  for (const d of dates) {
    if (d >= today) return d;
  }
  return dates[dates.length - 1];
}

// エポックミリ秒 → JST(UTC+9) の 'YYYY-MM-DD'。引数省略時は現在時刻。
export function jstToday(nowMs = Date.now()) {
  const jst = new Date(nowMs + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/schedule-view.test.js`
Expected: PASS（全 16 tests）

- [ ] **Step 5: コミット**

```bash
git add public/lib/schedule-view.js functions/_lib/schedule-view.test.js
git commit -m "feat(home): フォーカス日決定とJST日付の純関数を追加"
```

---

## Task 4: ESM 関数を index.html で window.WC へ橋渡し

**Files:**
- Modify: `public/index.html`（module script、52-63行付近）

- [ ] **Step 1: import を追加**

`public/index.html` の module script 内、`import { canvasToBlob, ... } from './lib/share-image.js';` の次の行に追記:

```js
    import { groupByDate, pickFocusDate, roundLabel, formatMatchTeam, jstToday } from './lib/schedule-view.js';
```

- [ ] **Step 2: window.WC へ公開**

同 module script の 2 つ目の `Object.assign(window.WC, {...})` の直後に追記:

```js
    Object.assign(window.WC, { groupByDate, pickFocusDate, roundLabel, formatMatchTeam, jstToday });
```

- [ ] **Step 3: 構文確認（ローカル起動して読み込みエラーが無いこと）**

Run: `node --check public/lib/schedule-view.js`
Expected: 何も出力されず終了コード 0（構文OK）

- [ ] **Step 4: コミット**

```bash
git add public/index.html
git commit -m "feat(home): schedule-view 純関数を window.WC へ公開"
```

---

## Task 5: `MatchRow`（タイムライン1行）と `screens-home.jsx` 雛形

**Files:**
- Create: `public/screens-home.jsx`

- [ ] **Step 1: `MatchRow` と最小 `HomeScreen` を作成**

Create `public/screens-home.jsx`:

```jsx
/* ホームタブ：試合日程ビュー（読み取り専用・直近フォーカス型） */

// 小さな旗 or 未確定プレースホルダ
function MiniFlag({ T, team, size = 20 }) {
  const box = {
    width: size, height: size, borderRadius: size * 0.3, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)', fontSize: size * 0.95, lineHeight: 1,
  };
  if (team.resolved) return <div style={box}><span style={{ transform: 'scale(1.3)' }}>{team.flag}</span></div>;
  return <div style={{ ...box, color: T.faint, fontSize: size * 0.6 }}>?</div>;
}

// タイムライン1行：時刻 / A vs B / 章ラベル
function MatchRow({ T, match, last }) {
  const teamMap = window.WC.TEAM || {};
  const a = window.WC.formatMatchTeam(match.a, teamMap);
  const b = window.WC.formatMatchTeam(match.b, teamMap);
  const label = window.WC.roundLabel(match.round);
  const sideStyle = { fontWeight: 800, fontSize: 13, color: T.text, whiteSpace: 'nowrap' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 4px',
      borderBottom: last ? 'none' : `1px solid ${T.line}`,
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, width: 46, flexShrink: 0 }}>
        {match.time || '--:--'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <MiniFlag T={T} team={a} />
        <span style={sideStyle}>{a.resolved ? a.code : a.label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.faint, padding: '0 6px' }}>vs</span>
        <span style={sideStyle}>{b.resolved ? b.code : b.label}</span>
        <MiniFlag T={T} team={b} />
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
        background: 'rgba(255,255,255,0.06)', color: T.sub, border: `1px solid ${T.line}`,
        flexShrink: 0, marginLeft: 8,
      }}>{label}</span>
    </div>
  );
}

function HomeScreen({ T }) {
  return <div style={{ color: T.text }}>準備中</div>;
}

Object.assign(window, { HomeScreen, MatchRow });
```

- [ ] **Step 2: babel スクリプトタグを index.html に追加**

`public/index.html` の `<script type="text/babel" src="screens-rooms.jsx?v=9"></script>` の次の行に追記:

```html
  <script type="text/babel" src="screens-home.jsx?v=1"></script>
```

- [ ] **Step 3: 構文確認**

Run: `npx --yes @babel/cli@7 --presets @babel/preset-react public/screens-home.jsx -o /dev/null 2>&1 | head` （`npx` が無い環境ではスキップし目視確認）
Expected: エラー出力なし

- [ ] **Step 4: コミット**

```bash
git add public/screens-home.jsx public/index.html
git commit -m "feat(home): 試合日程の MatchRow と screens-home 雛形を追加"
```

---

## Task 6: `DayTimeline`（翌日以降の日付グループ一覧）

**Files:**
- Modify: `public/screens-home.jsx`

- [ ] **Step 1: `DayTimeline` を追加し `HomeScreen` に組み込む**

`public/screens-home.jsx` の `function HomeScreen` の直前に `DayTimeline` を追加:

```jsx
// 日本語の曜日付き日付表記（'2026-06-13' → '6月13日(土)'）
function formatDateJa(dateStr) {
  if (!dateStr) return '日付未定';
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}月${d}日(${wd})`;
}

// 翌日以降の日付グループを順に表示
function DayTimeline({ T, groups }) {
  if (!groups.length) return null;
  return (
    <div>
      {groups.map((g) => (
        <div key={g.date || 'tbd'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 4px 8px' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: T.accent }} />
            <span style={{ fontWeight: 800, fontSize: 13, color: T.text }}>{formatDateJa(g.date)}</span>
            <span style={{ fontSize: 11, color: T.faint }}>{g.matches.length}試合</span>
          </div>
          <Card T={T} style={{ padding: '4px 12px' }}>
            {g.matches.map((m, i) => (
              <MatchRow key={i} T={T} match={m} last={i === g.matches.length - 1} />
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `HomeScreen` を仮実装してタイムラインを表示**

`public/screens-home.jsx` の `function HomeScreen({ T }) { ... }` を置き換え:

```jsx
function HomeScreen({ T }) {
  const schedule = window.WC.SCHEDULE || [];
  const groups = window.WC.groupByDate(schedule);

  if (!groups.length) {
    return (
      <div style={{ padding: '40px 8px', textAlign: 'center', color: T.sub }}>
        日程は準備中です
      </div>
    );
  }

  const focusDate = window.WC.pickFocusDate(groups.map((g) => g.date), window.WC.jstToday());
  const focusIdx = groups.findIndex((g) => g.date === focusDate);
  const rest = groups.slice(focusIdx + 1);

  return (
    <div>
      <DayTimeline T={T} groups={rest} />
    </div>
  );
}
```

- [ ] **Step 3: ローカルで目視確認**

Run: `npm run dev`（別ターミナル）→ ブラウザで `http://localhost:8788` を開き、オンボーディングを抜けてホームタブを表示。
Expected: 翌日以降の日付ごとに試合行が並ぶ（時刻・コード・章ラベル）。コンソールエラーなし。

- [ ] **Step 4: コミット**

```bash
git add public/screens-home.jsx
git commit -m "feat(home): 翌日以降の日付タイムライン DayTimeline を追加"
```

---

## Task 7: `MatchCarousel`（フォーカス日のスワイプカルーセル）

**Files:**
- Modify: `public/screens-home.jsx`

- [ ] **Step 1: `MatchCarousel` を追加**

`public/screens-home.jsx` の `function HomeScreen` の直前に追加:

```jsx
// 日数差（'YYYY-MM-DD' 同士）。today→focus が何日後か。
function daysUntil(today, focus) {
  if (!today || !focus) return 0;
  const a = Date.UTC(...today.split('-').map(Number).map((n, i) => i === 1 ? n - 1 : n));
  const b = Date.UTC(...focus.split('-').map(Number).map((n, i) => i === 1 ? n - 1 : n));
  return Math.round((b - a) / 86400000);
}

// フォーカス日の試合をスワイプ/矢印/ドットで切替表示
function MatchCarousel({ T, dateStr, matches, today }) {
  const [idx, setIdx] = React.useState(0);
  const touch = React.useRef(null);
  const n = matches.length;
  const cur = matches[Math.min(idx, n - 1)];
  const teamMap = window.WC.TEAM || {};
  const a = window.WC.formatMatchTeam(cur.a, teamMap);
  const b = window.WC.formatMatchTeam(cur.b, teamMap);
  const diff = daysUntil(today, dateStr);
  const countdown = diff <= 0 ? '本日' : `あと${diff}日`;

  const go = (delta) => setIdx((p) => Math.max(0, Math.min(n - 1, p + delta)));
  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touch.current = null;
  };

  const arrow = (dir, on) => (
    <div onClick={() => on && go(dir === '‹' ? -1 : 1)} style={{
      width: 30, height: 30, borderRadius: 15, flexShrink: 0,
      border: `1px solid ${T.line}`, background: 'rgba(255,255,255,0.04)',
      color: on ? T.text : T.faint, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 15, cursor: on ? 'pointer' : 'default',
      opacity: on ? 1 : 0.35, userSelect: 'none',
    }}>{dir}</div>
  );

  const side = (team) => (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <Flag code={team.resolved ? team.code : ''} size={48} T={T} />
      <div style={{ fontWeight: 800, fontSize: 13, color: T.text, marginTop: 6 }}>
        {team.resolved ? team.code : team.label}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '2px 6px 8px' }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: T.text }}>📅 {formatDateJa(dateStr)} の試合</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.faint }}>{Math.min(idx + 1, n)} / {n}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {n > 1 && arrow('‹', idx > 0)}
        <Card T={T} style={{ flex: 1, borderColor: 'rgba(182,255,60,0.30)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
              background: 'rgba(182,255,60,0.14)', color: T.accent, border: '1px solid rgba(182,255,60,0.25)',
            }}>{window.WC.roundLabel(cur.round)}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.faint }}>{countdown}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {side(a)}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 23, fontWeight: 800, color: T.text }}>{cur.time || '--:--'}</div>
              <div style={{ fontSize: 10, color: T.faint }}>KICK OFF</div>
            </div>
            {side(b)}
          </div>
          {cur.note && (
            <div style={{ textAlign: 'center', fontSize: 11, color: T.faint, marginTop: 14 }}>📍 {cur.note}</div>
          )}
        </Card>
        {n > 1 && arrow('›', idx < n - 1)}
      </div>
      {n > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
          {matches.map((_, i) => (
            <span key={i} style={{
              width: i === idx ? 18 : 7, height: 7, borderRadius: 4,
              background: i === idx ? T.accent : 'rgba(255,255,255,0.18)', transition: 'all .2s',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `HomeScreen` にカルーセルを組み込む**

`public/screens-home.jsx` の `HomeScreen` の return 部分を置き換え（focusDate/focusIdx/rest 算出はそのまま）:

```jsx
  const focusGroup = groups[focusIdx];
  const today = window.WC.jstToday();

  return (
    <div>
      <MatchCarousel T={T} dateStr={focusGroup.date} matches={focusGroup.matches} today={today} />
      <DayTimeline T={T} groups={rest} />
    </div>
  );
```

- [ ] **Step 3: ローカルで目視確認**

Run: `npm run dev` → ホームタブを表示。
Expected: 上部にフォーカス日のカルーセル（旗大・時刻・会場・章・カウントダウン）。矢印/ドットで当日他試合へ切替、モバイル幅ではスワイプで切替。下に翌日以降のタイムライン。

- [ ] **Step 4: コミット**

```bash
git add public/screens-home.jsx
git commit -m "feat(home): フォーカス日のスワイプカルーセル MatchCarousel を追加"
```

---

## Task 8: ホームタブの描画を HomeScreen へ差し替え

**Files:**
- Modify: `public/index.html`（462-463行）

- [ ] **Step 1: ホーム描画分岐を差し替える**

`public/index.html` の以下（462-463行）:

```jsx
        if (tab === 'summary') return <SummaryScreen solo T={T} state={soloState} member={member}
          pred={pred} goTab={goTab} wide={wide} />;
```

を次に置き換える:

```jsx
        if (tab === 'summary') return <HomeScreen T={T} wide={wide} />;
```

- [ ] **Step 2: 全テストを実行（回帰確認）**

Run: `npm test`
Expected: schedule-view を含む全テスト PASS。

- [ ] **Step 3: ローカルで受け入れ確認**

Run: `npm run dev` → ホームタブが日程ビューになっていること、部屋タブの比較画面（`RoomCompareScreen`）で従来の予想サマリーが壊れていないことを確認。
Expected:
- ホーム＝カルーセル＋タイムライン（旧優勝サマリーは出ない）
- 部屋の比較は従来どおり（SummaryScreen 温存）
- コンソールエラーなし

- [ ] **Step 4: コミット**

```bash
git add public/index.html
git commit -m "feat(home): ホームタブを試合日程ビュー(HomeScreen)に切り替え"
```

---

## Task 9: キャッシュバスター更新と最終確認

**Files:**
- Modify: `public/index.html`（screens-core.jsx の `?v=` など、変更ファイルのクエリ）

- [ ] **Step 1: 変更したJSXのキャッシュバスターを上げる**

`public/index.html` で、内容を変更した／新規追加した babel スクリプトのクエリを更新:
- 新規: `screens-home.jsx?v=1`（Task 5 で追加済みなら据え置き）

（注: `screens-core.jsx` は本変更で中身を変えていないため `?v=13` のまま。変更したファイルのみ上げる。）

- [ ] **Step 2: 全テスト最終実行**

Run: `npm test`
Expected: 全 PASS。

- [ ] **Step 3: 受け入れ条件チェック（目視）**

`npm run dev` で以下を確認:
- [ ] ホームでフォーカス日（今日 or 次の試合日）の試合がカルーセル表示
- [ ] スワイプ/矢印/ドットで当日の他試合に切替できる
- [ ] カルーセル下に翌日以降の全日程が日付ごとに並び末尾まで見られる
- [ ] 旧ホームコンテンツ（優勝サマリー等）が表示されない
- [ ] ノックアウト（スロット表記）の行が「グループA 1位」等で表示されクラッシュしない
- [ ] 部屋の比較画面が従来どおり動く

- [ ] **Step 4: コミット**

```bash
git add public/index.html
git commit -m "chore(home): 試合日程ビューのキャッシュバスター更新"
```

---

## 完了条件

- `npm test` が全 PASS（schedule-view の 16 ユニットテスト含む）。
- ホームタブが直近フォーカス型の試合日程ビューになっている。
- 部屋比較（SummaryScreen）が回帰していない。
- デプロイは `npm run deploy`（ユーザー判断で実施）。
