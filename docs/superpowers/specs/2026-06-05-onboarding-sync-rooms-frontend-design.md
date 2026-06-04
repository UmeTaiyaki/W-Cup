# Plan B: オンボーディング・同期・部屋 フロントエンド設計

- 日付: 2026-06-05
- 対象アプリ: W杯予想（Cloudflare Pages `wcup2026-yosou`、KV `CONFIG`）
- 親 spec: `2026-06-05-onboarding-sync-rooms-design.md`（全体設計）
- Plan A（バックエンド）: 完了済み（`functions/api/user.js`・`room.js`、`_lib/codes/users/rooms`）
- ステータス: 設計確定（実装計画へ）

## 1. 目的とスコープ

親 spec の「ログイン無し（匿名同期コード）でユーザー識別＋端末またぎ同期＋部屋で見比べ」を、フロントエンドで実体化する。現状フロント（`index.html` の `App()`）は旧「全員共有ボード（`members[]`＋`preds{}`、メンバー切替、`/api/predictions`）」モデルのため、これを**単一ユーザー identity ＋ 部屋**モデルへ作り替える。

段階的に実装する:
- **フェーズ1**: ルーティング（identity ゲート）＋オンボーディング・ウィザード＋identity/予想保存＋別端末同期。
- **フェーズ2**: 部屋（作成・参加・見比べビュー）。

### 対象外（YAGNI）
- QRコード（v1はコピーのみ）。
- 部屋の退出・削除。
- 旧 `/api/predictions` 共有ボードのデータ移行（親 spec 通り破棄）。
- 本人認証（同期コードの bearer 保護のみ）。

## 2. 採用アプローチ

`App()` を薄い「identity ゲート付きルーター」にし、画面群を別ファイルへ抽出する（小ファイル・関心分離）。既存の予想入力系 screens（`InputScreen`/`GroupRankScreen`/`ThirdWildScreen`/`KnockoutScreen`/`SummaryScreen`/`GroupScreen`）は、`me` から作った擬似 `member`（`{id, name, c}`）を渡して再利用する。見比べ系（`CompareScreen`/`RankingScreen`）はフェーズ2で部屋メンバーを与えて再利用する。

不採用: 既存 `members[]` 機構へ me を1人だけ流し込む案（誤ったモデルを温存しspecと矛盾）、App全面書き換え案（高リスク・段階方針に反する）。

## 3. バックエンド差分（User に rooms[] を追加）

Plan A の `User` に所属部屋を持たせ、同期で端末をまたいで引き継げるようにする。

```
User = { version, id, name, code, pred, rooms: [{ id, code, name }], updatedAt }
```

- `_lib/users.js`
  - `makeUser`: `rooms: []` を初期化。
  - `validateUser`: `rooms` 欠損時は `[]` を補完（後方互換）。要素は `{id, code, name}` を検証・正規化、件数上限（`USER_LIMITS.maxRooms`、例: 50）。
  - `publicUser`: `code` に加え **`rooms` も除去**（同室者へ他人の所属部屋を漏らさない）。
- `functions/api/user.js`
  - 起動時ロードは `GET ?id`（publicUser）ではなく **`POST sync {code}`** を用いる。sync は full user（`code`・`rooms` 込み）を返すため、本人だけが自分の部屋一覧を取得でき、第三者は `GET ?id` で rooms を見られない。`GET ?id` は publicUser のまま（部屋ビュー等の他者参照用）。
- `functions/api/room.js`（フェーズ2で配線）
  - `create`/`join` 成功時、対象 User を読み、`rooms` に `{id, code, name}` を重複なく追記して保存（端末またぎ実現）。失敗してもルーム作成/参加自体は成立させる（best-effort、`console.error`）。
- テスト（`users.test.js`）: rooms の初期化・補完・上限・`publicUser` 除去を node:test で追加。

## 4. フロント構成

| ファイル | 役割 | フェーズ |
|---|---|---|
| `public/identity.js`（新規・plain IIFE → `window.WC.Me`） | localStorage の `{userId, code}` 管理、me キャッシュ、`create`/`sync`/`setPred` API、debounce 保存、`sendBeacon` フラッシュ | 1 |
| `public/onboarding.jsx`（新規） | ウィザード（名前→コア→オプション(スキップ可)→完了）＋別端末同期入力 | 1 |
| `public/index.html` `App()` | 薄いルーター: identity 無→`<Onboarding>` / 有→`<Home>` | 1 |
| `<Home>`（`app-shell.jsx` 付近に抽出 or App内） | 既存タブshellを単一ユーザー化（メンバー切替撤去、`me.pred` 編集、アカウント=同期コード表示） | 1 |
| `public/screens-rooms.jsx`（新規） | 部屋: 作成/参加/見比べ（`CompareScreen`/`RankingScreen` を room.members で再利用） | 2 |

`index.html` の `<script type="text/babel">` 読み込み順に `identity.js`（plainは module前）・`onboarding.jsx`・（2で）`screens-rooms.jsx` を追加し、`?v=` を更新する。

### 4.1 `window.WC.Me` API（identity.js）

```
WC.Me = {
  load(),                       // localStorage の {userId, code} を返す（無ければ null）
  cachedUser(),                 // 直近の me キャッシュ（即時描画用、無ければ null）
  create(name) -> {userId,code,user},   // POST /api/user {op:'create'} ＋ 保存
  sync(code)   -> {userId,code,user},   // POST /api/user {op:'sync'}   ＋ 保存
  refresh()    -> user,         // 保存済み code で sync し最新 me を取得（404→clear）
  scheduleSave(pred),           // debounce で setPred {userId, code, pred}
  flushSave(), flushBeacon(),   // 離脱時フラッシュ（既存 data.js パターンを踏襲）
  clear(),                      // localStorage と キャッシュを破棄（失効時）
}
```
- 保存キー: `wc2026_identity_v1`（`{userId, code}`）、`wc2026_me_v1`（me キャッシュ JSON）。
- 失敗時 `console.error`、ユーザー向けは呼び出し側でトースト/アラート（既存流儀）。

## 5. フェーズ1 体験フロー

### 5.1 ルーティング
起動 → `WC.Me.load()`。
- 無 → `<Onboarding>`（step=`name`）。
- 有 → `WC.Me.cachedUser()` があれば即 `<Home>` 描画 → 裏で `refresh()`。
  - `refresh()` が 404（コード失効/KV初期化）→ `clear()` して `<Onboarding>` へ。
  - 通信エラー → キャッシュ表示のまま（再試行可）。

### 5.2 オンボーディング・ウィザード
1. **名前**: ニックネーム入力 → `create(name)` → `{userId, code}` 保存・me セット・次へ（壁なし）。画面下に「別の端末から続ける」リンク（→ 5.4）。
2. **コア予想**: 優勝 → 準優勝 → 得点王（`InputScreen` 流用）。編集は `scheduleSave` で保存。
3. **オプション予想**: グループ順位 / サードプレイス / トーナメント（既存 screens 流用）。**「スキップして完了」**で4へ。
4. **完了**: 完了メッセージ ＋ 同期コード表示（コピー、「**このブラウザを変えると消えます／無くすと復元できません**」を明示）＋「はじめる」。（フェーズ2で「部屋を作る/参加する」CTAを追加）

### 5.3 ホーム（単一ユーザー）
- タブ: **ホーム / 予想 / 大会結果 / アカウント**（フェーズ2で **部屋** を追加）。
- メンバー切替・追加（switcher / `adding`）を撤去。`SummaryScreen`/`InputScreen` には `member = {id: me.id, name: me.name, c: 派生色}` を渡して再利用。
- 予想編集: 楽観更新で `me.pred` を反映 → `scheduleSave`。
- **アカウント**タブ: 同期コードを再表示（後から確認用）＋注意文。
- 旧 `doReset`（全員共有のサンプル戻し）・`compare`/`rank` タブはフェーズ1では非表示（rank/compare は部屋前提＝フェーズ2）。

### 5.4 別端末同期
オンボーディング step=name の「別の端末から続ける」→ コード入力 → `sync(code)` → 保存 → `<Home>`。404/エラーは画面内にメッセージ表示。

## 6. フェーズ2 部屋
- **作成**: 部屋名入力 → `POST /api/room {op:'create', userId, name}` → `{roomId, code, room}`。ローカル `me.rooms` に追記、参加コード表示（コピー）。
- **参加**: 参加コード入力 → `POST /api/room {op:'join', userId, code}` → room。`me.rooms` に追記。
- **見比べビュー**: `GET /api/room?id=` → `{room, members: publicUser[]}`。`members` を `{members[], preds{}}` 形へ整形し、既存 `CompareScreen`/`RankingScreen` に与えて再利用。自分の予想のみ編集可（他者は閲覧のみ）。
- 完了画面・ホームに「部屋を作る/参加する」導線を追加。

## 7. データフロー / エラー処理
- 楽観更新 → `me.pred` ローカル反映 → debounce `setPred {userId, code, pred}`。離脱時 `sendBeacon`（既存パターン流用）。
- `setPred` は `code` を要求（既存 IDOR 防止）。クライアントは localStorage の `code` を使用。
- API 失敗は `console.error` ＋ ユーザー向けトースト/アラート。`sync` の 404（失効）と通信失敗を区別して扱う。
- 入力上限はバックエンド `USER_LIMITS`/`ROOM_LIMITS` を主防御とする。

## 8. テスト
- バックエンド: `users.test.js` に rooms[] の make/validate/public 除去/上限テストを追加（node:test、純ロジック）。`npm test` が全通すること。
- フロント（ビルドなしJSX）: 自動テストなし → 実機（`wrangler pages dev public` / webapp-testing）で受け入れ基準を手動確認。

## 9. 受け入れ基準
- 初回アクセスで 名前 → コア →（オプションをスキップ可）→ 完了 までウィザードで進める。
- 完了画面に同期コードと「ブラウザを変えると消える」注意が出る。
- 再訪（同ブラウザ）でオンボーディングをスキップしホームに直行する。
- 別ブラウザで同期コードを入力すると自分の予想が復元される。
- ホームで自分の予想を編集でき、リロード後も保持される。
- （フェーズ2）部屋を作成して参加コードを発行でき、別ユーザーがそのコードで参加でき、見比べビューで全員の予想を見比べられ、自分の予想のみ編集できる。
- （フェーズ2）同期コードで別端末に移ると、参加中の部屋も引き継がれる。
- `users.test.js` の rooms 関連テストが通る。

## 10. リスク・留意点
- 同期コードを無くすと復元不可（仕様。完了画面で明示）。
- bearer コードのため、コードを知る人はなりすませる（厳密性が要るなら別途認証）。
- 起動時 sync は1リクエスト増だが、rooms/最新 pred 取得のため許容。通信失敗時はキャッシュ表示。
- 既存 screens の単一ユーザー化で、member 由来の色/イニシャルは me から派生して与える。
- 旧 `/api/predictions` バックエンドは未使用のまま残置（削除は別タスク）。
