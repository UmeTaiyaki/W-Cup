# 布陣タブ強化: 選手プロフィール＋カード/交代表示 — 設計

> ステータス: 設計確定（2026-06-10・ユーザー承認）。データ方式=A（sm_lineups に bio 列追加）。
> 対象: 試合詳細画面（P2 watch-detail）の **布陣タブのみ**。予想/部屋は不変。

## 1. 目的 / スコープ
布陣タブを「分析官も満足する」深さに引き上げる。3点:
1. **控えセクション強化**: スタメン下の既存 `BenchList` を維持しつつ、出場した控えに `↑<分>` を付与。
2. **ピッチ上の選手ドット表示の変更**: xG チップを廃止し、**イエロー/レッドカード**と**交代時間**を表示。
3. **選手タップでプロフィール**: 既存 `PlayerSheet` を選手プロフィールに拡張。

触らない: 予想タブ(`input`)・部屋タブ(`rooms`)。布陣以外のタブ(タイムライン/スタッツ/xG/H2H)はロジック不変。

## 2. データ方式 = A（sm_lineups に denormalize）
SportMonks 確認済み(MCP api-3-0): プロフィールは `lineups.player` include でlineupにネストして取得可。カード/交代は `events`(player_id/related_player_id/minute/info)。

### 2.1 スキーマ差分 `db/schema-watch.sql`
- `sm_lineups` に列追加（すべて NULL 許容・後方互換）:
  - `date_of_birth TEXT` / `height INTEGER` / `weight INTEGER`
  - `nationality_id INTEGER` / `nationality_name TEXT`
  - `detailed_position TEXT`（詳細ポジションラベル。例: 右SB）
  - `club_name TEXT` / `club_image TEXT`（所属クラブ・最善努力）
- `sm_events` に列追加:
  - `player_id INTEGER` / `related_player_id INTEGER`
- 既存本番 D1 へは `ALTER TABLE ... ADD COLUMN`（IF NOT EXISTS 不可のため、適用済み判定 or 冪等スクリプトで対応）。新規は CREATE 内に含める。

### 2.2 取り込み `functions/_lib/sm-*.js`
- `sm-sync.js` の `FIXTURE_DETAIL_INCLUDE` に追加: `lineups.player;lineups.player.nationality`（＋可能なら `lineups.player.teams` でクラブ）。深さ制約で `teams` が取れない場合はクラブを空のままにし機能継続。
- `sm-ingest.js`:
  - `toLineupRows`: `l.player` から dob/height/weight/nationality_id を、`l.player.nationality.name` から nationality_name を、`l.detailed_position`(または `l.player.detailedposition`) から detailed_position を、`l.player.teams`(現所属) から club_name/club_image を写像。欠落は null。
  - `toEventRows`: `e.player_id`・`e.related_player_id` を保持（現状は捨てている＝バグの是正）。
- `sm-store.js`: lineup/event upsert を新列対応（bio は COALESCE で既存保持しつつ更新）。
- `sm-read.js`: `SELECT *` 経由で新列はそのままフロントへ渡る（追加変更ほぼ不要）。

## 3. フロント `public/screens-detail.jsx`

### 3.1 イベント→選手の索引（新ヘルパー）
- `detail.events` を player_id でグルーピングし、各選手の {cards:[{type,minute}], subOff:minute|null, subOn:minute|null} を算出。
  - yellowcard/redcard/yellowredcard → cards に追加。
  - substitution: player_id=IN(subOn=minute)、related_player_id=OUT(subOff=minute)。
- player_id 欠落の古いデータ用に player_name フォールバックも用意（最善努力）。

### 3.2 PlayerDot（②）
- xG チップ廃止。代わりに（対象=ピッチ上のドット＝先発）:
  - カードあり → 右上に 🟨/🟥 small badge（複数は最重を優先: 赤 > 黄2枚 > 黄）。
  - subOff あり（先発がOUT）→ 背番号下/右下に `↓67'`。
  - 注: 控えのIN(`↑`)はピッチに置かれない（formation_field NULL）ため BenchList 側で表示（§3.3）。
- xG はドットから消えるが「xGタブ」「プロフィール」には残す。

### 3.3 BenchList（①）
- 既存「控え」を維持。各控えに position に加え、subOn があれば `↑<分>`（and 交代相手名があれば併記）。タップ→プロフィール（変更なし）。

### 3.4 PlayerSheet → 選手プロフィール（③④）
- ヘッダー: 背番号＋氏名＋国籍旗（nationality_name から、無ければ team flag）。
- **bio セクション**（lineup 行の新列から。欠落行は出さない）:
  - ポジション（detailed_position・無ければ position）＋背番号
  - 年齢（date_of_birth から算出。JST 非依存の単純年差）＋身長(cm)＋体重(kg)
  - 国籍（nationality_name）
  - 所属クラブ（club_name・club_image。無ければ「—」）
- **この試合セクション**: 3.1 の索引から ゴール/カード/交代(時間) ＋ 既存 `sm_player_stats`(シュート/レーティング等)。
- 顔写真は載せない。

## 4. 導出・ルックアップ
- 年齢: `date_of_birth`(YYYY-MM-DD) から年差で算出（クライアント側・タイムゾーン非依存）。
- ポジションラベル: lineup の position / detailed_position をそのまま使用（SportMonks がラベル解決済みのものを取り込み時に保存）。
- 国籍名: `lineups.player.nationality.name`。取れなければ nationality_id を表示しない。

## 5. モック / 検証 / テスト
- `db/seed-detail-live.sql`(開発専用) を拡張: 数名に dob/height/weight/nationality_name/detailed_position/club を付与、`sm_events` に player_id/related_player_id と**交代イベント1件**を追加（ドット/プロフィール/ベンチの全表示を検証可能に）。
- 検証: ローカル D1 ＋ ハーネス(`public/_detail-harness.html`) ＋ Playwright スクショで、ドットのカード/交代・プロフィール・控えの ↑ を目視。
- テスト追加: `toLineupRows`(bio写像)・`toEventRows`(player_id保持)・sm-store upsert・sm-read passthrough・イベント索引ヘルパー。既存286件＋新規。緑維持。

## 6. エッジケース
- NS（lineup 未確定）/ bio 欠落 → 該当行を出さずグレースフル。
- カード複数・退場（赤）→ バッジは最重(赤>黄2>黄)を優先表示、詳細はプロフィールで列挙。
- player_id 欠落の旧データ → player_name フォールバック（完全一致時のみ）。
- クラブが include 深さで取得不可 → 「—」表示で機能継続（後追いで別取得可）。

## 7. スコープ外（YAGNI）
- 顔写真、市場価値、トロフィー、過去シーズン成績、移籍履歴。
- 名前マッチの高度な正規化（player_id があれば不要）。

## 8. 実装順（段階・各段テスト緑）
1. backend: schema 差分 → sm-ingest(toLineupRows/toEventRows) → sm-store → sm-sync include → 単体テスト。
2. seed 拡張（bio＋交代＋player_id）。
3. front: イベント索引ヘルパー → PlayerDot（カード/交代）→ BenchList（↑）。
4. front: PlayerSheet → プロフィール（bio＋この試合）。
5. ハーネス目視 → `?v` バンプ → コミット。

## 9. ブランチ / フラグ
- 実装は現 `chore/mock-live-tools`（PR #5 の詳細画面の上）から派生した新ブランチで行う（または #5 マージ後に main 派生）。
- 追加列・追加表示のみ＝フィーチャーフラグ不要（`WATCH_ENABLED` 配下で従来どおり）。本番 D1 には ALTER で列追加。

## 10. 関連
[[wcup-watch-platform]] / [[wcup-livescore-sportmonks]]（include・xG・events 定義）/ [[wcup-deploy-flow]]（jsx変更 ?v 必須）
