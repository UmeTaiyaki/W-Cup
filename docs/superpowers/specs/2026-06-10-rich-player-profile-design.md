# リッチ選手プロフィール（キャリア/シーズン統計）＋控え発見性 — 設計

> ステータス: 設計確定（2026-06-10・ユーザー承認）。実APIプローブ(`scripts/sportmonks-player-probe.sh` で Ayase Ueda 21773355)で現契約の取得可否を確証済み。
> 対象: 試合詳細の布陣タブの **PlayerSheet（選手プロフィール）** と **控え表示の発見性**。予想/部屋・他タブは不変。

## 1. 背景 / 確定した実データ可否（現WC All-In契約）
PlayerSheet を「その試合のデータ」→「今までのデータ（キャリア/シーズン統計）」のリッチ表示へ。`/players/{id}` エンドポイント＋includes で実取得可を確認:
- ✅ 基本: name / image_path(顔写真) / height / weight / date_of_birth / nationality{name,image_path}
- ✅ `metadata` 利き足: `type_id=229` の `values`("right"/"left")
- ✅ `detailedPosition`: name（例 "Centre Forward"）。`position`/`detailed_position_id` も既定で来る
- ✅ `teams.team`: 所属チーム履歴（**現所属クラブ＋ロゴ**。Ueda=Feyenoord start 2023/end 2028。代表(Japan)も混在）
- ✅ `statistics.details`: シーズン別統計（**値は `{total:N}` / `{average,highest,lowest}` のオブジェクト**）。Ueda season 22294 例: 321 appearances{total:3} / 52 goals{total:8,goals:7,penalties:1} / 119 minutes{total:245} / 118 rating{average:6.95} / 80 passes{total:39} / 42 shots{total:4} / 86 on-target{total:2}。WC season 26618 は開幕前で details=0（開幕後に充填）
- ❌ **過去クラブ遍歴**: `transfers`=0（プラン外）。`teams` は現所属＋代表のみ＝**Kashima/Cercle Brugge等の遍歴は不可**
- ❌ **1試合ごとのMatch Stats**: `latest` は出場記録(formation_field/jersey 等)のみで **per-match成績(details)なし** → 安価に取得不可
- レート: player系は別枠（3000/時）・残2497/時で余裕。

## 2. スコープ（取れるデータで最大限）
**作る**:
1. ヘッダー: 顔写真＋氏名＋背番号＋現所属クラブ(ロゴ)＋国籍(旗/名)
2. Info カード: 身長/体重・年齢(dobから)・利き足・国籍・詳細ポジション
3. シーズン統計カード: シーズン選択（データのあるシーズンのみ）＋出場/ゴール/アシスト/評価/出場時間/警告/シュート/枠内/パス（取れた項目のみ）
4. 控え発見性の改善（布陣タブ）

**作らない（データ制約・YAGNI）**: 過去クラブ遍歴カード（現所属はヘッダーに出す）/ per-match Match Statsリスト。

## 3. アーキテクチャ = オンデマンド `/api/player`
選手データは大量＝fixtureに denormalize せず、**プロフィールを開いた時に取得**。
- **新規 `functions/api/player.js`**（Pages Function）: `?id=` 数値検証 → `WATCH_ENABLED` 配下 → `functions/_lib/sportmonks.js` の fetch で `GET /players/{id}?include=metadata;position;detailedPosition;nationality;teams.team;statistics.details;statistics.season` を取得 → `sm-player.js` で正規化 → JSON返却。障害/OFF時は `{enabled:false}` or `{profile:null}`(障害隔離・既存に波及させない)。
- **キャッシュ**: 選手bio/シーズン統計は変化が遅い → レスポンスに `Cache-Control: public, s-maxage=21600`(6h・エッジ)。同一idの再オープンはAPI消費ゼロ。
- **シークレット**: `SPORTMONKS_TOKEN` が必要。ローカルは `.dev.vars`、本番は **Pages に `secret put`**（/api/player が SportMonks を直叩く最初のPages Function＝新規シークレット設定が要る）。
- **新規 `functions/_lib/sm-player.js`**（純粋・テスト可）: SportMonks player レスポンス → `{ profile:{id,name,jersey?,image_path,height,weight,date_of_birth,preferred_foot,position,detailed_position,nationality_name,nationality_image,club_name,club_image}, seasons:[{season_id,season_name?,league_name?,stats:{appearances,goals,assists,minutes,rating,yellowcards,redcards,shots_total,shots_on_target,passes}}] }`。
  - 現所属クラブ: `teams` のうち `end` が最も未来(or null)のものを採用（Ueda=Feyenoord 2028）。
  - 利き足: metadata `type_id==229` の values。
  - stats マッピング(type_id→名前・値は `.total`、rating は `.average`): 321→appearances / 52→goals(.total) / 79→assists / 119→minutes / 118→rating(.average) / 84→yellowcards / 83→redcards / 42→shots_total / 86→shots_on_target / 80→passes。欠落typeは出さない。
  - seasons は details>0 のみ。`statistics.season` があれば season_name/league_name を付与（best-effort・無ければ season_id）。

## 4. フロント
- **`data.js`**: `window.WC.fetchPlayerProfile(id)` 追加（`/api/player?id=` を `cache:"no-store"`で取得、`{enabled:false}`/失敗は null）。
- **`screens-detail.jsx` PlayerSheet 改修**:
  - 開いたら `player.player_id` で `fetchPlayerProfile` を非同期取得（loading skeleton）。
  - 取得成功: 新レイアウト（ヘッダー写真/クラブ/国籍 → Info → シーズン統計＋セレクタ）。
  - **「この試合」セクション(ゴール/カード/交代・xG/shots/rating from sm_player_stats)は撤去**（ユーザー要望=今までのデータ重視）。
  - 取得失敗/OFF/未マッチ: **lineup 行の bio(sm_lineups の既存列)へグレースフルフォールバック**（現状の簡易表示）。
  - ピッチのドット(カード/交代)・タイムラインは不変（この試合情報はそちらに残る）。
- **`ageFromDob`/`TeamCrest`/`Flag` は流用**。顔写真は `image_path`(失敗時イニシャル/旗)。

## 5. 控え発見性（①）
布陣ピッチが縦長(`paddingBottom:133%`)で控えが折り返しの下＝見えない。改善:
- ピッチの縦横比を少し縮める（例 `paddingBottom:120%`）か、控え見出しを目立たせ「控え (N)」件数表示＋区切り強化。タブ本体はスクロール可のまま。最小変更で発見性を上げる（レイアウト破壊しない）。

## 6. モック/検証
- 本番/プレビューの `_mock-demo.html` は **`window.WC.fetchPlayerProfile` も stub**（Ueda の実データ相当の固定JSONを埋め込み）＝デプロイ版でも token 無しでプロフィール表示可。
- ローカル実API検証: 開発seedの1選手(例 控えに Ueda)を **実 player_id 21773355** にして、dev server(`.dev.vars` の token)経由で `/api/player?id=21773355` が実データを返すのを Playwright で目視（curlはツール側denyだがdev server自身の外部fetchは別プロセス＝可）。
- テスト: `sm-player.js` 正規化(現所属クラブ判定・利き足・stats type_id写像・値オブジェクト .total/.average・seasons空除外)＋ `functions/api/player.js`(id検証/WATCH_ENABLED/障害隔離) を node:test で。

## 7. エッジケース
- WC season は開幕前 details=0 → seasons から除外（空シーズンは出さない）。表示シーズン既定=**データのある最新シーズン**。
- 写真/クラブロゴ読込失敗 → フォールバック（イニシャル/旗・名前のみ）。
- player_id がモックの偽ID → /api/player 空 → フォールバック表示。
- レート/障害 → 既存に波及させない（fixture詳細の表示は無影響）。

## 8. 実装順
1. 控え発見性（小・UI）。2. `sm-player.js` 正規化(TDD)。3. `functions/api/player.js`(TDD)。4. `data.js` fetchPlayerProfile。5. PlayerSheet 改修(この試合撤去→リッチ)。6. `_mock-demo.html` の player stub。7. ローカル実API＋ハーネス目視・`?v`バンプ。
- 本番反映時: Pages に `SPORTMONKS_TOKEN` secret 設定が必須（手順を残す）。

## 9. 関連
[[wcup-watch-platform]] / [[wcup-livescore-sportmonks]]（type_id・include）。前段=`2026-06-10-lineup-player-profile-design.md`（bio列・カード/交代）。
