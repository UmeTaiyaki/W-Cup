# KV → D1 無停止移行 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 永続データ（`user:` / `usercode:` / `room:` / `roomcode:` / `config:v1`）の保存先を Workers KV から D1 へ、**既存ユーザーに一切影響を出さず（無停止・無データ消失・再ログイン不要）** に載せ替える。動機は無料枠の書き込み上限（KV 1,000/日 → D1 100,000 行/日 ≒ 100倍）と強整合性。

**Architecture:** expand/contract（並行稼働）方式で段階移行する。`functions/_lib/store.js` の `getStore(env)` を唯一の差し替え点とし、各フェーズは独立デプロイ・即ロールバック可能。読み取り元の切替は環境変数フラグ（`STORE_READ_BACKEND`）で行い、コード再デプロイ無しに戻せる。

**Tech Stack:** Cloudflare Pages Functions（ESM）、D1（SQLite, `wrangler.toml` の `[[d1_databases]]` バインド `DB`）、`node --test`。既存の `store` インターフェース（`getRaw/putRaw/getJSON/putJSON/update`）は不変に保ち、呼び出し側（API ハンドラ）は無改修。

**前提（完了済み）:** 全ハンドラが `getStore(env)` 経由でKVにアクセスする地ならしは commit `235bd0d`（branch `refactor/kv-access-via-store`）で完了済み。本計画はその上に乗る。

**対象外（意図的にKVのまま）:** `session:` / `otp:` / challenge など `expirationTtl` 依存の揮発データ。D1 に TTL が無いため移行しない。`config.js` の `verifySession(env.CONFIG, …)` も KV 直のまま。`caches.default` の config エッジキャッシュ（s-maxage=60）はバックエンド非依存なので不変。

---

## データモデル（D1 スキーマ）

KV のキー空間をそのまま単一テーブルに写す。JSON はパースせず TEXT 列に丸ごと格納（KV と同形＝移行コスト最小・採点/検証ロジック不変）。

```sql
CREATE TABLE IF NOT EXISTS kv (
  k          TEXT PRIMARY KEY,
  v          TEXT NOT NULL,
  updated_at TEXT          -- doc.updatedAt をミラー（楽観ロックの版比較・運用観測用、無くても可）
);
```

- キーは現行のまま（`user:<id>` / `usercode:<code>` / `room:<id>` / `roomcode:<code>` / `config:v1`）。
- `.list()` は現行コードで未使用 → 全件走査が無いので D1 でも主キー単純引きだけで成立する。
- 読み = `SELECT v FROM kv WHERE k=?1`、書き = `INSERT INTO kv(k,v,updated_at) VALUES(?1,?2,?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at`（アトミック UPSERT）。

---

## File Structure

- Create: `functions/_lib/d1-store.js` — D1 バインディングを `store` インターフェース（`getRaw/putRaw/getJSON/putJSON/update`）に適合させるアダプタ。`update()` は D1 トランザクション/`updated_at` 比較で実装（KV の best-effort 楽観ロックより強い直列化）。
- Create: `functions/_lib/dual-store.js` — 二重書き込みストア。`put*` は KV と D1 の両方へ書き、`get*` は `readBackend`（'kv'|'d1'）に従って選んだ側から読む。`update()` は読み側で read-modify-write し、書き込みは両系へ反映。
- Modify: `functions/_lib/store.js` — `getStore(env)` を、`env.STORE_READ_BACKEND` と D1 バインド有無を見てバックエンドを選ぶ実装に拡張（KV単独 / 二重書き込み / D1単独 を切替）。**唯一の差し替え点。**
- Modify: `wrangler.toml` — `[[d1_databases]]`（binding=`DB`）追加、`[vars] STORE_READ_BACKEND` 追加。
- Create: `scripts/backfill-kv-to-d1.mjs` — 既存 KV 全キーを列挙して D1 へコピーする冪等バックフィル＋差分検証スクリプト（`wrangler kv key list` / D1 `wrangler d1 execute`）。
- Create: `functions/_lib/d1-store.test.js` / `functions/_lib/dual-store.test.js` — フェイク D1（`prepare/bind/first/run` を模した Map ベース）でユニット検証。既存 `store.test.js` のフェイクKVと同方針。

---

## Task 1: D1 スキーマと D1 ストアアダプタ

**Files:** Create `functions/_lib/d1-store.js`, Test `functions/_lib/d1-store.test.js`

- [ ] **Step 1: 失敗するテストを書く** — フェイク D1 を用意し、`createD1Store(db)` が `getRaw/putRaw` ラウンドトリップ、`getJSON` 不正JSONで null、`update()` の競合再適用（`updated_at` 版比較）を満たすことを表明（`store.test.js` の対応ケースを移植）。
- [ ] **Step 2: 実装** — UPSERT/SELECT を `db.prepare(...).bind(...).first()/run()` で実装。`update()` は `BEGIN IMMEDIATE` 相当（D1 batch/transaction）で read→mutate→write を直列化。`store.js` と同じ戻り値契約（`{ok,changed,reason,value}`）を厳守。
- [ ] **Step 3: テスト緑** — `npm test`。インターフェース等価性を `store.test.js` と対称に確認。

## Task 2: 二重書き込みストア

**Files:** Create `functions/_lib/dual-store.js`, Test `functions/_lib/dual-store.test.js`

- [ ] **Step 1: 失敗するテストを書く** — `createDualStore({kv, d1, readBackend})`: `put*` は kv・d1 双方に書く / `get*` は readBackend 側から読む / d1 書き込み失敗時も kv は成功させ握りつぶさずログ（KVが当面の正のため可用性を落とさない）/ `update()` は readBackend を正として read-modify-write し両系へ反映。
- [ ] **Step 2: 実装。** **Step 3: テスト緑。**

## Task 3: getStore の切替実装（差し替え点）

**Files:** Modify `functions/_lib/store.js`, `wrangler.toml`

- [ ] **Step 1:** `wrangler.toml` に `[[d1_databases]] binding="DB"`（本番ID / preview ID）と `[vars] STORE_READ_BACKEND="kv"` を追加。
- [ ] **Step 2:** `getStore(env)` を次の分岐に拡張（既定は現状維持＝KV単独）:
  - `DB` バインド無し → 従来どおり `createStore(env.CONFIG)`（KV単独）。
  - `DB` 有り & `STORE_READ_BACKEND!=='d1-only'` → `createDualStore({kv:env.CONFIG, d1:env.DB, readBackend: env.STORE_READ_BACKEND==='d1'?'d1':'kv'})`。
  - `STORE_READ_BACKEND==='d1-only'` → `createD1Store(env.DB)`（KV書き込み停止）。
- [ ] **Step 3:** 既存 `store.test.js` 含め `npm test` 全緑。API ハンドラは無改修であることを確認（差分が `_lib` と `wrangler.toml` のみ）。

## Task 4: バックフィル＋検証スクリプト

**Files:** Create `scripts/backfill-kv-to-d1.mjs`

- [ ] **Step 1:** KV 全キー列挙（`wrangler kv key list --namespace-id=<id>`）→ 各値を取得 → D1 へ UPSERT（冪等。再実行で重複・破壊しない）。揮発キー（`session:`/`otp:`/challenge）は除外。
- [ ] **Step 2:** 検証モード — KV と D1 の (key,value) 全件突合し、差分件数を出力（0 件を移行完了条件とする）。取りこぼし検知のため件数サマリを必ずログ（無音の打ち切り禁止）。

---

## デプロイ手順（各段が独立・即ロールバック可）

各段ごとに「デプロイ → 数日 KV書き込み数と差分を観測 → 次段」。`STORE_READ_BACKEND` は `wrangler pages secret`/vars で切替でき、**コード再デプロイ無しに前段へ戻せる**。

- [ ] **段1（二重書き込み開始）:** Task 1–3 を `STORE_READ_BACKEND="kv"`（読み=KV）でデプロイ。以後の全書き込みが D1 にも入る。ユーザー無影響。
- [ ] **段2（バックフィル）:** Task 4 を実行し既存データを D1 へコピー。検証モードで差分 0 を確認。ユーザー無影響。
- [ ] **段3（読み切替）:** `STORE_READ_BACKEND="d1"` に変更（読み=D1、書きは両系継続）。数日観測。問題あれば `="kv"` へ即時ロールバック。ユーザー無影響。
- [ ] **段4（KV撤去）:** 安定確認後 `STORE_READ_BACKEND="d1-only"`（KV書き込み停止）。さらに安定後、`getStore` から二重書き込み経路と KV バインド（永続データ分）を削除する後片付けコミット。揮発データ用の `CONFIG` KV は残す。

## 受け入れ基準（Definition of Done）

- [ ] `npm test` 全緑（既存 + 新規 d1/dual ストアテスト）。
- [ ] 段2でバックフィル差分 0 件をログで確認。
- [ ] 段3でローカル `wrangler pages dev`（D1 ローカル）にて config/user/room の読み書き往復・room join 楽観ロックを node fetch で確認（curl はサンドボックス deny のため不可）。
- [ ] 既存ユーザーの同期コードでログイン継続・予想/部屋データが保持されること（再ログイン不要）。
- [ ] API ハンドラ（`functions/api/*`）の差分が無いこと（差し替え点は `_lib` と `wrangler.toml` のみ）。

## リスクと対応

- **D1 プライマリのリージョン:** 作成時の初回アクセス地で決まる。利用者が日本中心なので近接リージョンになるよう留意（必要なら作成手順で制御）。グローバル展開時は D1 read replication（Sessions API）を検討。
- **二重書き込み期間の一時的書き込み増:** D1 無料枠 10万行/日が十分吸収。KV 書き込みも従来比で増えない（同じ回数を両系に出すだけ）。
- **KV 結果整合 vs D1 強整合:** 段3まで読みは KV のため挙動不変。切替後はむしろ `update()` の競合が D1 トランザクションで確実に直列化され改善。
- **ロールバック:** 段3までは読み元フラグを戻すだけで完全復旧（KV が常に最新）。段4以降は KV 書き込みを止めるため、戻すなら段4直前へ。
