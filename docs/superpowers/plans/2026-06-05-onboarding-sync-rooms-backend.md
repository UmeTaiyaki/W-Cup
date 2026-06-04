# オンボーディング・同期コード・部屋 — バックエンド基盤 実装計画（Plan A）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ユーザー識別・同期コード・部屋を支える純ロジック（codes / users / rooms）と KV API（`/api/user`・`/api/room`）を、既存パターンに沿ってテスト駆動で実装する。

**Architecture:** 検証・生成ロジックは `functions/_lib/` の純関数として `node:test` で TDD。KV 入出力は `functions/api/*.js` の薄いハンドラに集約し（既存 `api/predictions.js` と同じ構造）、`wrangler pages dev` ＋ curl で手動検証する。データは既存 `CONFIG` KV ネームスペースに `user:` / `usercode:` / `room:` / `roomcode:` の4キーで保存。

**Tech Stack:** Cloudflare Pages Functions（ESM）、`node:test` + `node:assert/strict`、Web Crypto（`crypto.getRandomValues` / `randomUUID`）、KV（`env.CONFIG`）。

**仕様書:** `docs/superpowers/specs/2026-06-05-onboarding-sync-rooms-design.md`

**スコープ:** 本計画はバックエンドのみ。フロント（オンボーディング画面・同期UI・部屋UI）は後続の Plan B で扱う。

---

## ファイル構成

| ファイル | 種別 | 責務 |
|----------|------|------|
| `functions/_lib/ids.js` | 新規 | ランダム内部ID生成（純関数） |
| `functions/_lib/ids.test.js` | 新規 | ids のテスト |
| `functions/_lib/codes.js` | 新規 | 同期/参加コードの生成・整形・正規化（純関数） |
| `functions/_lib/codes.test.js` | 新規 | codes のテスト |
| `functions/_lib/users.js` | 新規 | User の生成・検証・上限値（純関数） |
| `functions/_lib/users.test.js` | 新規 | users のテスト |
| `functions/_lib/rooms.js` | 新規 | Room の生成・メンバー追加・上限値（純関数） |
| `functions/_lib/rooms.test.js` | 新規 | rooms のテスト |
| `functions/api/user.js` | 新規 | User の KV ハンドラ（create / setPred / sync / get） |
| `functions/api/room.js` | 新規 | Room の KV ハンドラ（create / join / get） |

既存の `functions/_lib/predictions.js`（`emptyPred` / `validatePred`）と `functions/_lib/http.js`（`json`）を再利用する。既存ファイルは変更しない。

テスト実行コマンド（全タスク共通）: `npm test`（= `node --test 'functions/**/*.test.js'`）。

---

## Task 1: 内部ID生成 `_lib/ids.js`

**Files:**
- Create: `functions/_lib/ids.js`
- Test: `functions/_lib/ids.test.js`

- [ ] **Step 1: Write the failing test**

`functions/_lib/ids.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genId } from './ids.js';

test('genId は prefix で始まる文字列を返す', () => {
  const id = genId('u');
  assert.equal(typeof id, 'string');
  assert.ok(id.startsWith('u'));
  assert.ok(id.length > 1);
});

test('genId は prefix 省略時も空でない文字列を返す', () => {
  const id = genId();
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);
});

test('genId は呼ぶたびに異なる値を返す', () => {
  const a = genId('u');
  const b = genId('u');
  assert.notEqual(a, b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL（`Cannot find module './ids.js'` 等）

- [ ] **Step 3: Write minimal implementation**

`functions/_lib/ids.js`:
```js
// ランダムな内部ID生成（純関数）。crypto.randomUUID があれば優先利用。
// 既存 predictions.js の genId と同方針だが、prefix を引数化して再利用可能にした。
export function genId(prefix = '') {
  try {
    if (globalThis.crypto && globalThis.crypto.randomUUID) {
      return prefix + globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
  } catch (e) {
    // randomUUID 不可な環境はフォールバックへ
  }
  return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS（ids の3テストが緑）

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/ids.js functions/_lib/ids.test.js
git commit -m "feat: add genId helper for internal ids"
```

---

## Task 2: コード生成・整形・正規化 `_lib/codes.js`

同期コード（秘密）と参加コード（共有可）の両方に使う。紛らわしい文字（`0 1 I L O U`）を除いた30文字アルファベットで8文字、表示は `XXXX-XXXX`。

**Files:**
- Create: `functions/_lib/codes.js`
- Test: `functions/_lib/codes.test.js`

- [ ] **Step 1: Write the failing test**

`functions/_lib/codes.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  codeFromInts,
  generateCode,
  formatCode,
  normalizeCode,
} from './codes.js';

test('CODE_ALPHABET は紛らわしい文字 0 1 I L O U を含まない', () => {
  for (const ch of '01ILOU') {
    assert.ok(!CODE_ALPHABET.includes(ch), `${ch} が含まれている`);
  }
  assert.equal(CODE_ALPHABET.length, 30);
});

test('codeFromInts は整数列をアルファベットの文字に写す', () => {
  assert.equal(codeFromInts([0, 1, 2]), CODE_ALPHABET.slice(0, 3));
  // 範囲外も剰余で安全に写る
  assert.equal(codeFromInts([CODE_ALPHABET.length]), CODE_ALPHABET[0]);
});

test('formatCode は8文字をハイフンで二分する', () => {
  assert.equal(formatCode('9X2P3F7K'), '9X2P-3F7K');
});

test('formatCode は4文字以下はそのまま返す', () => {
  assert.equal(formatCode('ABC'), 'ABC');
});

test('normalizeCode は大文字化しハイフン・空白・対象外文字を除去する', () => {
  assert.equal(normalizeCode('9x2p-3f7k'), '9X2P3F7K');
  assert.equal(normalizeCode('  a b  '), 'AB');
  assert.equal(normalizeCode(null), '');
});

test('generateCode は長さ CODE_LENGTH でアルファベット内の文字のみ', () => {
  for (let i = 0; i < 20; i++) {
    const c = generateCode();
    assert.equal(c.length, CODE_LENGTH);
    for (const ch of c) assert.ok(CODE_ALPHABET.includes(ch), `${ch} が範囲外`);
    for (const bad of '01ILOU') assert.ok(!c.includes(bad));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL（`Cannot find module './codes.js'`）

- [ ] **Step 3: Write minimal implementation**

`functions/_lib/codes.js`:
```js
// 同期コード/参加コードの生成・整形・正規化（純関数）。
// 紛らわしい文字 0 1 I L O U を除外した30文字。8文字で約39bit。
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 8;

// 整数列をアルファベットの文字列へ（剰余で範囲内に丸める）。テスト容易性のため分離。
export function codeFromInts(ints) {
  const n = CODE_ALPHABET.length;
  return (Array.isArray(ints) ? ints : [])
    .map((v) => CODE_ALPHABET[((v % n) + n) % n])
    .join('');
}

// 暗号学的乱数でコード生成。Web Crypto が無ければ Math.random にフォールバック。
export function generateCode(len = CODE_LENGTH) {
  const n = CODE_ALPHABET.length;
  const out = [];
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    const buf = new Uint8Array(len);
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) out.push(CODE_ALPHABET[buf[i] % n]);
  } else {
    for (let i = 0; i < len; i++) out.push(CODE_ALPHABET[Math.floor(Math.random() * n)]);
  }
  return out.join('');
}

// 表示用にハイフンで二分（8文字 → XXXX-XXXX）。
export function formatCode(code) {
  const c = String(code || '');
  if (c.length <= 4) return c;
  const mid = Math.ceil(c.length / 2);
  return c.slice(0, mid) + '-' + c.slice(mid);
}

// 入力を正規化：大文字化し、アルファベット外（ハイフン・空白等）を除去。
export function normalizeCode(input) {
  return String(input || '')
    .toUpperCase()
    .split('')
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS（codes の6テストが緑）

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/codes.js functions/_lib/codes.test.js
git commit -m "feat: add code generation, formatting, normalization"
```

---

## Task 3: User 純ロジック `_lib/users.js`

**Files:**
- Create: `functions/_lib/users.js`
- Test: `functions/_lib/users.test.js`

- [ ] **Step 1: Write the failing test**

`functions/_lib/users.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, validateUser, USER_LIMITS } from './users.js';

test('makeUser は名前・コードから User を生成する', () => {
  const u = makeUser('  たけし  ', 'ABCD2345');
  assert.equal(u.version, 1);
  assert.ok(u.id.startsWith('u'));
  assert.equal(u.name, 'たけし'); // trim 済み
  assert.equal(u.code, 'ABCD2345');
  assert.equal(typeof u.updatedAt, 'string');
  // 空予想が入っている
  assert.equal(u.pred.champion, null);
  assert.equal(u.pred.topScorer, '');
});

test('makeUser は名前を上限長で丸める', () => {
  const long = 'あ'.repeat(50);
  const u = makeUser(long, 'ABCD2345');
  assert.equal(Array.from(u.name).length, USER_LIMITS.name);
});

test('makeUser は空名・非文字列を null で拒否する', () => {
  assert.equal(makeUser('   ', 'ABCD2345'), null);
  assert.equal(makeUser(null, 'ABCD2345'), null);
});

test('validateUser は保存済みドキュメントを安全な形へ正規化する', () => {
  const v = validateUser({
    id: 'u1', name: ' のぞみ ', code: 'abcd2345',
    pred: { champion: 'arg' },
  });
  assert.equal(v.id, 'u1');
  assert.equal(v.name, 'のぞみ');
  assert.equal(v.code, 'ABCD2345'); // 正規化される
  assert.equal(v.pred.champion, 'ARG');
});

test('validateUser は壊れた入力に null を返す', () => {
  assert.equal(validateUser(null), null);
  assert.equal(validateUser({ name: 'x' }), null); // id 欠落
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL（`Cannot find module './users.js'`）

- [ ] **Step 3: Write minimal implementation**

`functions/_lib/users.js`:
```js
// User（名前＋予想1つ＋同期コード）の生成・検証（純関数）。
// 認証なしエンドポイント向けに名前長・payload に上限を設ける。
import { genId } from './ids.js';
import { emptyPred, validatePred } from './predictions.js';
import { normalizeCode } from './codes.js';

export const USER_LIMITS = { name: 20, postBytes: 64 * 1024 };

const trimName = (name) => {
  if (typeof name !== 'string') return null;
  const nm = name.trim();
  if (!nm) return null;
  return Array.from(nm).slice(0, USER_LIMITS.name).join('');
};

// 名前とコードから新規 User を生成。名前不正なら null。
export function makeUser(name, code) {
  const nm = trimName(name);
  if (!nm) return null;
  return {
    version: 1,
    id: genId('u'),
    name: nm,
    code: normalizeCode(code),
    pred: emptyPred(),
    updatedAt: new Date().toISOString(),
  };
}

// 保存済み/受信した User を安全な形へ正規化。必須項目（id）が無ければ null。
export function validateUser(input) {
  if (!input || typeof input !== 'object') return null;
  if (typeof input.id !== 'string' || !input.id) return null;
  const nm = trimName(input.name) || '';
  return {
    version: 1,
    id: input.id,
    name: nm,
    code: normalizeCode(input.code),
    pred: validatePred(input.pred).value,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS（users の5テストが緑）

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/users.js functions/_lib/users.test.js
git commit -m "feat: add user model logic (makeUser, validateUser)"
```

---

## Task 4: Room 純ロジック `_lib/rooms.js`

**Files:**
- Create: `functions/_lib/rooms.js`
- Test: `functions/_lib/rooms.test.js`

- [ ] **Step 1: Write the failing test**

`functions/_lib/rooms.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoom, addMember, ROOM_LIMITS } from './rooms.js';

test('makeRoom は作成者を最初のメンバーにした Room を返す', () => {
  const r = makeRoom('会社の部屋', 'WXYZ2345', 'u1');
  assert.equal(r.version, 1);
  assert.ok(r.id.startsWith('r'));
  assert.equal(r.name, '会社の部屋');
  assert.equal(r.code, 'WXYZ2345');
  assert.deepEqual(r.members, ['u1']);
  assert.equal(r.ownerId, 'u1');
  assert.equal(typeof r.createdAt, 'string');
});

test('makeRoom は空名・owner欠落を null で拒否する', () => {
  assert.equal(makeRoom('  ', 'WXYZ2345', 'u1'), null);
  assert.equal(makeRoom('部屋', 'WXYZ2345', ''), null);
});

test('addMember は新規 userId を追加する（不変・新オブジェクト）', () => {
  const r = makeRoom('部屋', 'WXYZ2345', 'u1');
  const res = addMember(r, 'u2');
  assert.equal(res.ok, true);
  assert.deepEqual(res.room.members, ['u1', 'u2']);
  assert.deepEqual(r.members, ['u1']); // 元は不変
});

test('addMember は既存メンバーを重複追加しない', () => {
  const r = makeRoom('部屋', 'WXYZ2345', 'u1');
  const res = addMember(r, 'u1');
  assert.equal(res.ok, true);
  assert.deepEqual(res.room.members, ['u1']);
});

test('addMember は上限超過で ok:false を返す', () => {
  let r = makeRoom('部屋', 'WXYZ2345', 'u0');
  for (let i = 1; i < ROOM_LIMITS.members; i++) {
    r = addMember(r, 'u' + i).room;
  }
  assert.equal(r.members.length, ROOM_LIMITS.members);
  const res = addMember(r, 'overflow');
  assert.equal(res.ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL（`Cannot find module './rooms.js'`）

- [ ] **Step 3: Write minimal implementation**

`functions/_lib/rooms.js`:
```js
// Room（部屋名＋参加コード＋メンバーIDの配列）の生成・メンバー追加（純関数）。
import { genId } from './ids.js';
import { normalizeCode } from './codes.js';

export const ROOM_LIMITS = { name: 24, members: 50, postBytes: 16 * 1024 };

const trimName = (name) => {
  if (typeof name !== 'string') return null;
  const nm = name.trim();
  if (!nm) return null;
  return Array.from(nm).slice(0, ROOM_LIMITS.name).join('');
};

// 部屋名・参加コード・作成者IDから新規 Room を生成。作成者は最初のメンバー。
export function makeRoom(name, code, ownerId) {
  const nm = trimName(name);
  if (!nm) return null;
  if (typeof ownerId !== 'string' || !ownerId) return null;
  const now = new Date().toISOString();
  return {
    version: 1,
    id: genId('r'),
    name: nm,
    code: normalizeCode(code),
    members: [ownerId],
    ownerId,
    createdAt: now,
    updatedAt: now,
  };
}

// userId をメンバーに追加（不変）。重複は無視、上限超過は ok:false。
export function addMember(room, userId) {
  if (!room || typeof userId !== 'string' || !userId) {
    return { ok: false, room, reason: 'invalid' };
  }
  if (room.members.includes(userId)) {
    return { ok: true, room };
  }
  if (room.members.length >= ROOM_LIMITS.members) {
    return { ok: false, room, reason: 'full' };
  }
  return {
    ok: true,
    room: { ...room, members: [...room.members, userId], updatedAt: new Date().toISOString() },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS（rooms の5テストが緑）

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/rooms.js functions/_lib/rooms.test.js
git commit -m "feat: add room model logic (makeRoom, addMember)"
```

---

## Task 5: User API ハンドラ `functions/api/user.js`

KV 入出力のため `node:test` では検証せず（既存 `api/predictions.js` と同方針）、`wrangler pages dev` ＋ curl で手動検証する。

**Files:**
- Create: `functions/api/user.js`

- [ ] **Step 1: Implement the handler**

`functions/api/user.js`:
```js
import { json } from '../_lib/http.js';
import { makeUser, validateUser, USER_LIMITS } from '../_lib/users.js';
import { validatePred } from '../_lib/predictions.js';
import { generateCode, normalizeCode } from '../_lib/codes.js';

const uKey = (id) => `user:${id}`;
const ucKey = (code) => `usercode:${code}`;

async function readUser(env, id) {
  if (!id) return null;
  let stored = null;
  try {
    stored = await env.CONFIG.get(uKey(id));
  } catch (e) {
    console.error('user: KV read failed', e);
    return null;
  }
  if (!stored) return null;
  try {
    return validateUser(JSON.parse(stored));
  } catch (e) {
    console.error('user: stored JSON parse failed', e);
    return null;
  }
}

// 既存 usercode と衝突しないコードを採番（最大5回試行）。
async function uniqueUserCode(env) {
  for (let i = 0; i < 5; i++) {
    const c = generateCode();
    try {
      if (!(await env.CONFIG.get(ucKey(c)))) return c;
    } catch (e) {
      console.error('user: code uniqueness check failed', e);
      return c;
    }
  }
  return generateCode();
}

// GET /api/user?id=...  → User 取得
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const user = await readUser(env, url.searchParams.get('id'));
  if (!user) return json(404, { error: 'ユーザーが見つかりません' });
  return json(200, user);
}

// POST /api/user  { op: 'create' | 'setPred' | 'sync', ... }
export async function onRequestPost({ request, env }) {
  const cl = Number(request.headers.get('content-length') || 0);
  if (cl > USER_LIMITS.postBytes) return json(413, { error: 'データが大きすぎます' });

  let input;
  try {
    input = await request.json();
  } catch (e) {
    console.error('user POST: invalid json', e);
    return json(400, { error: 'JSONが不正です' });
  }

  const op = input && input.op;

  if (op === 'create') {
    const code = await uniqueUserCode(env);
    const user = makeUser(input.name, code);
    if (!user) return json(400, { error: '名前を入力してください' });
    try {
      await env.CONFIG.put(uKey(user.id), JSON.stringify(user));
      await env.CONFIG.put(ucKey(code), user.id);
    } catch (e) {
      console.error('user create: KV write failed', e);
      return json(500, { error: '保存に失敗しました' });
    }
    return json(200, { userId: user.id, code, user });
  }

  if (op === 'setPred') {
    const user = await readUser(env, input.userId);
    if (!user) return json(404, { error: 'ユーザーが見つかりません' });
    const next = { ...user, pred: validatePred(input.pred).value, updatedAt: new Date().toISOString() };
    try {
      await env.CONFIG.put(uKey(user.id), JSON.stringify(next));
    } catch (e) {
      console.error('user setPred: KV write failed', e);
      return json(500, { error: '保存に失敗しました' });
    }
    return json(200, next);
  }

  if (op === 'sync') {
    const code = normalizeCode(input.code);
    if (!code) return json(400, { error: 'コードを入力してください' });
    let id = null;
    try {
      id = await env.CONFIG.get(ucKey(code));
    } catch (e) {
      console.error('user sync: KV read failed', e);
      return json(500, { error: '読み込みに失敗しました' });
    }
    const user = await readUser(env, id);
    if (!user) return json(404, { error: 'コードに該当するユーザーがいません' });
    return json(200, { userId: user.id, code, user });
  }

  return json(400, { error: '不明な操作です' });
}
```

- [ ] **Step 2: Start local dev server**

Run（別ターミナル推奨）: `npm run dev`
Expected: `wrangler pages dev` が起動し `http://localhost:8788` 等で待受。

- [ ] **Step 3: Manually verify create → get → setPred → sync**

Run（`$PORT` は dev サーバのポートに置換）:
```bash
# create
RESP=$(curl -s -XPOST localhost:8788/api/user -H 'content-type: application/json' -d '{"op":"create","name":"たけし"}')
echo "$RESP"
UID=$(echo "$RESP" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).userId))')
CODE=$(echo "$RESP" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).code))')

# get
curl -s "localhost:8788/api/user?id=$UID"; echo

# setPred
curl -s -XPOST localhost:8788/api/user -H 'content-type: application/json' \
  -d "{\"op\":\"setPred\",\"userId\":\"$UID\",\"pred\":{\"champion\":\"arg\"}}"; echo

# sync（コードから復元、champion が ARG で返ること）
curl -s -XPOST localhost:8788/api/user -H 'content-type: application/json' \
  -d "{\"op\":\"sync\",\"code\":\"$CODE\"}"; echo
```
Expected:
- create が `{userId, code, user}` を返す
- get が同じ user を返す
- setPred 後の user.pred.champion が `"ARG"`
- sync が同じ userId と `pred.champion="ARG"` を返す
- 存在しないコードで sync → 404 `{ "error": "コードに該当するユーザーがいません" }`

- [ ] **Step 4: Commit**

```bash
git add functions/api/user.js
git commit -m "feat: add user API (create, setPred, sync, get)"
```

---

## Task 6: Room API ハンドラ `functions/api/room.js`

**Files:**
- Create: `functions/api/room.js`

- [ ] **Step 1: Implement the handler**

`functions/api/room.js`:
```js
import { json } from '../_lib/http.js';
import { makeRoom, addMember, ROOM_LIMITS } from '../_lib/rooms.js';
import { validateUser } from '../_lib/users.js';
import { generateCode, normalizeCode } from '../_lib/codes.js';

const rKey = (id) => `room:${id}`;
const rcKey = (code) => `roomcode:${code}`;
const uKey = (id) => `user:${id}`;

async function readRoom(env, id) {
  if (!id) return null;
  let stored = null;
  try {
    stored = await env.CONFIG.get(rKey(id));
  } catch (e) {
    console.error('room: KV read failed', e);
    return null;
  }
  if (!stored) return null;
  try {
    const r = JSON.parse(stored);
    if (!r || !Array.isArray(r.members)) return null;
    return r;
  } catch (e) {
    console.error('room: stored JSON parse failed', e);
    return null;
  }
}

async function readUser(env, id) {
  try {
    const s = await env.CONFIG.get(uKey(id));
    return s ? validateUser(JSON.parse(s)) : null;
  } catch (e) {
    console.error('room: member read failed', e);
    return null;
  }
}

// 既存 roomcode と衝突しないコードを採番（最大5回試行）。
async function uniqueRoomCode(env) {
  for (let i = 0; i < 5; i++) {
    const c = generateCode();
    try {
      if (!(await env.CONFIG.get(rcKey(c)))) return c;
    } catch (e) {
      console.error('room: code uniqueness check failed', e);
      return c;
    }
  }
  return generateCode();
}

// GET /api/room?id=...  → { room, members: User[] }（見比べボード用）
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const room = await readRoom(env, url.searchParams.get('id'));
  if (!room) return json(404, { error: '部屋が見つかりません' });
  const members = (await Promise.all(room.members.map((uid) => readUser(env, uid)))).filter(Boolean);
  return json(200, { room, members });
}

// POST /api/room  { op: 'create' | 'join', ... }
export async function onRequestPost({ request, env }) {
  const cl = Number(request.headers.get('content-length') || 0);
  if (cl > ROOM_LIMITS.postBytes) return json(413, { error: 'データが大きすぎます' });

  let input;
  try {
    input = await request.json();
  } catch (e) {
    console.error('room POST: invalid json', e);
    return json(400, { error: 'JSONが不正です' });
  }

  const op = input && input.op;

  if (op === 'create') {
    if (typeof input.userId !== 'string' || !input.userId) {
      return json(400, { error: 'ユーザーが不明です' });
    }
    const code = await uniqueRoomCode(env);
    const room = makeRoom(input.name, code, input.userId);
    if (!room) return json(400, { error: '部屋名を入力してください' });
    try {
      await env.CONFIG.put(rKey(room.id), JSON.stringify(room));
      await env.CONFIG.put(rcKey(code), room.id);
    } catch (e) {
      console.error('room create: KV write failed', e);
      return json(500, { error: '保存に失敗しました' });
    }
    return json(200, { roomId: room.id, code, room });
  }

  if (op === 'join') {
    if (typeof input.userId !== 'string' || !input.userId) {
      return json(400, { error: 'ユーザーが不明です' });
    }
    const code = normalizeCode(input.code);
    if (!code) return json(400, { error: 'コードを入力してください' });
    let roomId = null;
    try {
      roomId = await env.CONFIG.get(rcKey(code));
    } catch (e) {
      console.error('room join: KV read failed', e);
      return json(500, { error: '読み込みに失敗しました' });
    }
    const room = await readRoom(env, roomId);
    if (!room) return json(404, { error: 'コードに該当する部屋がありません' });
    const res = addMember(room, input.userId);
    if (!res.ok) return json(409, { error: '部屋が満員です' });
    try {
      await env.CONFIG.put(rKey(room.id), JSON.stringify(res.room));
    } catch (e) {
      console.error('room join: KV write failed', e);
      return json(500, { error: '保存に失敗しました' });
    }
    return json(200, { roomId: room.id, room: res.room });
  }

  return json(400, { error: '不明な操作です' });
}
```

- [ ] **Step 2: Manually verify create → join → get**

前提: Task 5 の手動検証で得た2人ぶんの userId（`$U1`, `$U2`）を用意（無ければ create を2回実行）。dev サーバ起動中（`npm run dev`）。

Run:
```bash
# 部屋作成（U1 が作成者）
RR=$(curl -s -XPOST localhost:8788/api/room -H 'content-type: application/json' \
  -d "{\"op\":\"create\",\"userId\":\"$U1\",\"name\":\"会社の部屋\"}")
echo "$RR"
RID=$(echo "$RR" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).roomId))')
RCODE=$(echo "$RR" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).code))')

# U2 が参加
curl -s -XPOST localhost:8788/api/room -H 'content-type: application/json' \
  -d "{\"op\":\"join\",\"userId\":\"$U2\",\"code\":\"$RCODE\"}"; echo

# 見比べボード取得（members に U1,U2 の User が並ぶ）
curl -s "localhost:8788/api/room?id=$RID"; echo
```
Expected:
- create が `{roomId, code, room}`、room.members が `["$U1"]`
- join 後の room.members が `["$U1","$U2"]`
- get が `{ room, members }` を返し、members に2人ぶんの User（name/pred 付き）が入る
- 存在しないコードで join → 404 `{ "error": "コードに該当する部屋がありません" }`

- [ ] **Step 3: Commit**

```bash
git add functions/api/room.js
git commit -m "feat: add room API (create, join, get with members)"
```

---

## 完了条件（Plan A）

- `npm test` が全て緑（ids / codes / users / rooms ＋ 既存テスト）。
- `/api/user` が create / get / setPred / sync を、`/api/room` が create / join / get を期待通り返す（手動検証済み）。
- 既存ファイル（`predictions.js` 他）は無改変。

## 次の計画（Plan B・本計画の対象外）

フロント実装: 起動時ルーティング（localStorage 判定）、オンボーディング・ウィザード（名前→コア→オプション(スキップ可)→完了）、同期コード表示（コピー＋QR）と別端末同期入力、部屋の作成/参加/見比べビュー。Plan A の API を `window.WC` 経由で接続する。
