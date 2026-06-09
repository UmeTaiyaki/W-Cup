# W杯統合観戦プラットフォーム 設計（進行中 / WIP）

> ステータス: **P0 データ基盤 code-complete（263 tests green・未デプロイ）**。次は P1/P2 or P0デプロイ。
> 作成: 2026-06-09 / 更新: 2026-06-09 / API: SportMonks W杯2026 All-In（契約済み）

## 1. ビジョン

「W杯はこれだけ見ておけばいい」**統合観戦プラットフォーム**にする。
予想機能は数ある機能の一つとして温存し、観戦・分析体験を主役に育てる。

## 2. スコープ

### 触らないゾーン（現状維持・絶対）
- **予想タブ（`input`）** … コードもデータも一切変更しない
- **部屋タブ（`rooms`）** … 同上

### 強化ゾーン
- **ホームタブ（`summary` = HomeScreen）** … 試合日程 → **ライブ経過**（試合状態＋スコア）
- **大会結果タブ（`group` = GroupScreen）** … 順位/ノックアウト/得点王を実績で自動更新 ＋ **試合詳細画面（新設）**
- **ニュース（新規）** … 日本語ニュース（別サブシステム・後フェーズ）

現状タブ定義: `public/index.html:622-628`（summary/input/rooms/group/account）

## 3. フェーズ分解

| フェーズ | 内容 | 依存 |
|---|---|---|
| **P0 データ基盤**（最初に必須） | SportMonks → Cron Worker → D1取り込み → `/api`配信。画面変化なし | — |
| **P1 ホームのライブ化** | 日程カルーセルに試合状態（前半/HT/後半/終了）＋ライブスコア | P0 |
| **P2 大会結果タブ強化＋試合詳細画面** ★最重要 | 順位/得点王/ブラケット自動更新＋試合詳細（観戦ビュー）新設 | P0 |
| **P3 日本語ニュース** | SportMonksに無い→別ソース要・独立リサーチ | 独立 |

関心が強いのは **P0 + P2**。

## 4. 既存ユーザー影響ゼロの不変条件（全フェーズの絶対前提）

1. 既存 `kv` テーブル（予想/部屋/同期コード/config）はスキーマも中身も**不変**。観戦データは別テーブル追加のみ
2. 予想（`input`）/部屋（`rooms`）画面のコードパス不変
3. **障害隔離**：SportMonks不調や観戦機能のバグが、予想/部屋/同期に波及しない。データが無くても既存画面は動く
4. 別Cron・別API・別テーブルで、既存リソース（`/api/config`・KV/D1書き込み枠）を圧迫しない
5. フィーチャーフラグで観戦機能だけ ON/OFF できる

## 5. DB設計（決定: B = 正規化テーブル新設）

同一 D1（`wcup2026-db`）に、接頭辞 `sm_` で既存と分離して追加。既存 `kv` テーブルとは物理的に独立。

| テーブル | 役割 | 主なカラム |
|---|---|---|
| `sm_teams` | チームIDマッピング（**結節点**） | sm_team_id(SportMonks) / app_code(MEX等) / name / image_url |
| `sm_fixtures` | 試合（104） | sm_fixture_id / starting_at / state_id(1未開始…5終了) / home/away_team_id / home/away_score / **home/away_xg** / round_name / venue / updated_at |
| `sm_events` | ②タイムライン | minute / type(goal/card/sub) / team_id / player_name |
| `sm_stats` | ③スタッツ・④xG（**縦持ち**） | sm_fixture_id / team_id / **type_id** / value（xG=type_id 5304） |
| `sm_lineups` | ⑤布陣 | team_id / player_name / number / position / grid |
| `news` | ⑦ニュース（後フェーズ・枠だけ） | title / url / source / published_at / fixture_id |
| `sm_types` | type_id↔名前マスタキャッシュ | type_id / code / name |

- ⑥H2Hは `sm_fixtures` から過去対戦を導出（専用テーブル不要）
- **設計判断**：既存 `config:v1` を壊さず並行追加／スタッツは type_id ベースの縦持ち（項目増でもスキーマ不変）／既存表示の繋ぎ替えは P2 で慎重に

## 6. 試合詳細画面 ★★最重要パート★★

**アプリの核。時間をかけて慎重に、妥協なく最高品質で作る（ユーザー強調 2026-06-09）。拙速に実装しない。**
土台（P0）を固めてから、このページにじっくり注力する。

載せる要素（**全部入れる**・縦スクロール1画面で合意、モック好評）:
1. ライブスコア＆試合状態
2. タイムライン（得点・カード・交代）
3. チームスタッツ比較
4. xG（期待得点）
5. ラインナップ／フォーメーション図
6. H2H（過去対戦）
7. 関連ニュース（日本語・後フェーズ、枠を先に用意）

## 7. SportMonks API 確定値（検証済み 2026-06-08）

- league_id=**732**（World Cup 本大会）/ 2026 season_id=**26618**（fixture 104件・対戦カードがアプリと一致）/ 2022 season_id=18017（xG検証用）
- xG/statistics/events/scores 取得可。fixture詳細 `include=participants;scores;statistics;events;xGFixture`
- **xG の正しい type_id = 5304**（※生データで見えた 34 は別物）
- ライブ: Webhook無し→ `/livescores/latest` を**10秒間隔**ポーリング、state_id でライブ/終了制御（書き込み節約）
- ウィジェットは別課金のため不採用、REST API直叩き
- 検証スクリプト: `scripts/sportmonks-trial-check.sh`（`SPORTMONKS_TOKEN` 環境変数で実行）

## 8. 未決事項 → 主要論点は確定（2026-06-09）

- [x] **テーブル粒度** → **コア先行**（`sm_teams/fixtures/events/stats/types`）。lineups/news は P2/P3
- [x] **Cron Worker構成** → **別Worker＋Cron Trigger**（`worker-watch/`・同一 `wcup2026-db`）
- [x] **フィーチャーフラグ** → **`WATCH_ENABLED`**（`/api/live` のみON/OFF・OFF時は既存完全同一）
- [x] **ライブxG** → **不要（試合後で十分）＝アドオン不要**
- [ ] **ライブポーリング間隔**：Cron最小1分の制約 → **C案=1分間隔で着工**（必要時 A=内部10秒ループ/B=DO Alarm へ昇格）
- [ ] 試合詳細画面レイアウト（最重要・P2）／ ホームのライブ表示の見せ方（P1）
- [ ] **Components の使い方** → 本番埋め込まず「API学習/設計支援ツール」として include・スキーマ確定に活用（All-In含有・追加コストなし）

## 8.5 コードベース実態（2026-06-09 確認）

- ストレージは既に**完全D1**（`STORE_READ_BACKEND=d1-only`・KV未使用）。D1は `kv` 汎用1枚のみで `sm_*` 未作成 → B案は実態と整合・既存無影響が自然成立
- 配信は `/api/config` GET→`getConfig()`→`config:v1`。store抽象は `getStore(env)`→`dualStore`。`json(status,body,headers)`（status先頭）
- Pages（`wcup2026-yosou`）ゆえ Cron Trigger 不可 → 観戦Cronは別Worker必須

## 8.6 P0 実装 → ✅ code-complete（2026-06-09・263 tests green）

1. ✅ `db/schema-watch.sql`（`sm_teams/fixtures/events/stats/types`＋`result_info`）。適用・冪等・実INSERT・JOIN検証
2. ✅ `functions/_lib/sportmonks.js`（fetch注入・include手組み・SportmonksError）。11 tests
3. ✅ `sm-ingest.js`(JSON→行 純粋変換)＋`sm-store.js`(upsert文＋runBatch)。18 tests＋実sqlite冪等検証
4. ✅ `sm-sync.js`(orchestration)＋`worker-watch/`(scheduled毎分=live/日次=types＋手動fetch)。7 tests＋バンドル成功
5. ✅ `sm-read.js`＋`functions/api/live.js`（`WATCH_ENABLED`・障害隔離）。4 tests＋JOIN実データ検証

**実データ検証(fixture 18452339 Morocco-Spain 2022)で確定**: 最終スコア=`scores.description="CURRENT"`(type_id 1525) / event type 14=Goal,18=Sub,19=Yellow,20=Red,22/23=PK / **type_id 34=Corners（xGではない・前回宿題解決）** / participants[].meta.location=home/away・image_path=ロゴ。

### デプロイ手順（ops・未実施。実行はユーザー判断）

```bash
wrangler d1 execute wcup2026-db --file db/schema-watch.sql --remote   # 1) 本番D1にsm_*作成
cd worker-watch && wrangler secret put SPORTMONKS_TOKEN && wrangler secret put WATCH_CRON_KEY  # 2) Secret
wrangler deploy                                                       # 3) Worker(要database_id差替)
# 4) スケジュール backfill: GET /?action=season&key=...（104試合＋112チーム投入）
wrangler d1 execute wcup2026-db --file db/seed-team-map.sql --remote   # 5) app_code マッピング付与(48/48検証済)
# 6) 準備OKで Pages WATCH_ENABLED=true（OFFの間 /api/live は enabled:false＝既存無影響）
```

### xG 実値の未解決（フォロー）

type_id=5304 はカタログ実在だが 2022 fixture の statistics/xGFixture に現れず。`sm_stats` は縦持ちゆえ正しい include 判明後に5304行が増えるだけで**スキーマ/コード変更不要**（`toFixtureRow` が home/away_xg を自動充填）。2026本番データで要再確認。

## 9. 関連

- メモリ: `wcup-livescore-sportmonks.md`（最新の決定はここにも記録）
- 既存データ層: `functions/_lib/store.js`(KV) / `d1-store.js` / `dual-store.js`（現在 `STORE_READ_BACKEND=d1-only`）
- ブラウザモック: `.superpowers/brainstorm/`（gitignore済み・サーバー要再起動で閲覧）
