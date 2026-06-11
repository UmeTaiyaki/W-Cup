# 試合前 ご当地応援バトル — 設計spec

- 日付: 2026-06-12
- ブランチ: `feat/pre-match-cheer`
- ステータス: 設計合意済み → 実装計画へ

## 1. 目的とスコープ

ホームのカルーセルに出ている**キックオフ前の試合**に対し、ユーザーが何回でもどちらかのチームを応援でき、その盛り上がりを「応援バトルバー」で常時可視化する。応援した瞬間は国ごとに異なる「ご当地セレブレーション」が再生され、その演出と国文字（例: `GO JAPAN!`）を合成した画像をSNSへ共有できる。

### やること
- カルーセルの**未開始試合のみ**に応援UI（バトルバー＋応援ボタン）を表示
- 誰でも何回でも応援可（ユーザー識別・ログイン不要）
- 応援タップでご当地セレブレーション演出
- ご当地演出＋国文字を合成したシェア画像の生成・共有

### やらないこと（明確な非スコープ）
- **試合開始（LIVE）以降は応援UI・バトルバー・数を一切表示しない**。LIVE中は既存のライブスコア表示のまま
- 個人別の投票履歴・重複防止（何回でも押せる前提なので不要）
- ランキング・部屋連携・採点への反映（本機能は採点と無関係）

## 2. 表示条件

`MatchCarousel`（`public/screens-home.jsx`）のカードは現在:
- `live = liveForMatch(cur)` が取れる（LIVE/FT）→ ライブスコア表示
- 取れない（試合前）→ キックオフ時刻／カウントダウン表示

応援UIは**後者（試合前）の分岐にのみ**描画する。`live` が出た時点で応援UIは自然に消える。さらにサーバー側でも開始済みfixtureへの加算は拒否し、整合性を担保する（§5）。

対象試合の識別は既存の `window.WC.fixtureIdForMatch(match)`（= `sm_fixture_id`）を使う。

## 3. データモデル（D1）

KV（書込1,000/日）は不適。主ストアの**D1**に集計のみを持つ。**個票は保存しない**。

新マイグレーション `schema/0012_cheer_counts.sql`:

```sql
CREATE TABLE IF NOT EXISTS cheer_counts (
  fixture_id INTEGER NOT NULL,
  side       TEXT    NOT NULL CHECK (side IN ('home','away')),
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (fixture_id, side)
);
```

- `sm_` 接頭辞は付けない（SportMonks由来ではなくユーザー生成のため。watch cron は `sm_*` のみ触る規約と衝突させない）
- 開始後の掃除は将来cronで任意（表示に無関係なので必須ではない）

## 4. 書き込み戦略（最重要）

**楽観的更新 ＋ バッチ送信**で、連打を試合あたり数秒に1回の書き込みへ集約する。

- タップ → 即座にローカルでバー／数を更新（体感ゼロ遅延）
- 送信は溜める: **約2秒ごと、または保留delta一定数ごと**に1リクエスト
- 離脱時（`visibilitychange`/`pagehide`）は `navigator.sendBeacon` で取りこぼし防止
- サーバーは `count = count + delta`（delta上限クランプ）

採用理由（代替比較）:
- (1) **D1バッチ加算（採用）**: 既存スタックのみ。D1の書込上限に十分収まる
- (2) Durable Object: 真のライブカウンタで最速だが新インフラ。今回の規模では過剰
- (3) KV: 書込1,000/日で破綻。不採用

## 5. API（Pages Functions）

新規 `functions/api/cheer.js`。フィーチャーフラグ `CHEER_ENABLED`（`WATCH_ENABLED` と同パターン）。OFF時は `{ enabled:false }` を返し既存挙動に無影響。

### GET `/api/cheer?fixtures=<id,id,...>`
- 指定fixtureの集計を返す
- レスポンス: `{ enabled:true, counts: { "<fixtureId>": { home: <n>, away: <n> } } }`
- キャッシュ: `s-maxage≈10, stale-while-revalidate≈30`
- クライアントは**試合前fixtureのみ**問い合わせ、カルーセル表示中だけ15〜30秒ポーリング

### POST `/api/cheer`
- ボディ: `{ fixtureId:int, side:"home"|"away", delta:int }`
- バリデーション: `side` 限定、`delta` を `1..MAX_DELTA(=20)` にクランプ、`fixtureId` 整数
- **開始済み拒否**: `sm_fixtures.state_id` を引き、未開始（NS）でなければ加算せず現値を返す（試合前限定の整合性）
- UPSERT加算 → 当該fixtureの新しい `{home,away}` を返す
- 濫用対策: deltaクランプ＋既存 `functions/_lib/ratelimit.js` でIP単位の緩い上限。Turnstileトークンはセッション初回など低頻度で検証（任意・段階導入）。個票を持たないため最悪でも「数字が増えるだけ」で被害限定

## 6. フロント構成（多数の小ファイル）

- `public/cheer-core.js`（新規）: カウント状態管理、楽観的更新、バッチ送信、ポーリング、`sendBeacon`フラッシュ。`window.WC.cheer.*` に公開
- `public/cheer-theme.js`（新規）: ご当地テーマ表（§7）
- `public/cheer-share.js`（新規）: Canvasシェア画像生成（§8）
- `public/screens-home.jsx`: `MatchCarousel` の試合前分岐に `CheerBar` コンポーネント（バトルバー＋数＋応援ボタン＋シェアボタン）を追加。演出オーバーレイもここで描画

バッチ集約のコアは純粋関数（保留deltaのマージ）として実装し、テスト可能にする。

## 7. ご当地テーマ

`public/cheer-theme.js`:

```js
// 例
const THEME = {
  JPN: { cry:"GO JAPAN!",  accent:"#ff3b6b", colors:["#bc002d","#ffffff","#ff7a96"], motifs:["🌸","🎌"], rays:true },
  BRA: { cry:"VAI BRASIL!", accent:"#2ec27e", colors:["#2ec27e","#ffd84d","#1f8f5a"], motifs:["⚽","🟡","🟢"], rays:false },
  // ...主要国から作り込み
};
const DEFAULT_THEME = (team) => ({
  cry: `GO ${team.code}!`, accent: "#b6ff60",
  colors: ["#b6ff60","#ffffff","#caff7a"], motifs:["🎉","⚽"], rays:false,
});
```

- **未定義国でも `DEFAULT_THEME` で破綻しない**ことを必須要件とする
- 48カ国は主要国から順次拡充（初期は主要国＋デフォルトで全試合機能）

## 8. シェア画像生成

`public/cheer-share.js`、Canvas 2Dで縦型（1080×1350）を描画:
- 背景: テーマ `colors` のグラデ＋薄い `motifs` パターン（`rays:true` は放射光）
- 上部ラベル: `FIFA WORLD CUP 2026` / ラウンド・節
- 両国旗（既存の旗描画ソースを流用。emoji glyph 描画 or 旗画像アセット — 実装時に確認）
- 中央に大きな国文字 `cry`（グロー付き）
- 応援バトルバー（％）と両国カウント
- 「★ あなたは 🇯🇵 を応援」バッジ
- 下部: ハッシュタグ（`#W杯予想 #<国> #WorldCup2026`）＋アプリ名
- 出力: `canvas.toBlob` → `navigator.share({ files:[png] })`。非対応環境はダウンロード保存にフォールバック

## 9. テスト

- `functions/api/cheer.test.js`（`node --test`、フェイクD1）: deltaクランプ、UPSERT加算、複数fixture読み出し、不正side/fixture、`CHEER_ENABLED` OFF、開始済みfixtureの加算拒否
- バッチ集約の純粋関数ユニット（保留deltaマージ・上限・フラッシュ境界）

## 10. ロールアウト

1. マイグレーション適用（`cheer_counts`）
2. `functions/api/cheer.js` 追加（`CHEER_ENABLED` 既定OFF）
3. フロント追加（OFF時は描画しない）
4. テストKVで動作確認 → デプロイ
5. `CHEER_ENABLED="true"` で有効化
6. jsx変更のため `index.html` の `?v=N` を更新（運用規約）

## 11. オープン項目（実装時に確定）

- Canvasで描く国旗のソース（既存 `<Flag>` が emoji か画像か）
- Turnstile検証の頻度（初回のみ/一定間隔/なし）の最終判断
- 開始後 `cheer_counts` の掃除cronを入れるか（任意）
- ご当地テーマの初期収録国リスト
