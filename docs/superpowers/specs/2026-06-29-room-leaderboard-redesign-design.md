# 部屋タブ「ポイント順位リーダーボード」中心への再構成

- 日付: 2026-06-29
- 対象: 部屋（ルーム）タブ `RoomCompareScreen`
- 関連メモリ: `wcup-onboarding-sync-rooms`, `wcup-deploy-flow`（jsx変更時 `?v=` 必須）

## 目的 / 背景

現状、部屋に入ると最初に表示されるのは「メンバー」タブ（メンバーアイコン＋選択者の予想サマリー）で、
肝心の「誰が予想ポイントで何位か」は3番目の `rank` サブタブに埋もれている。

ユーザー要望:
1. 入室直後に「予想のポイントで誰がどの順位か」が分かりやすいようにする。
2. 各メンバーのカードをタップすると、得点の内訳が一目で分かるようにする。

ブレインストーミングでの決定:
- 入室直後の表示は **順位（リーダーボード）を主役に全面再構成**。
- カードタップは **詳細画面へ遷移**（アコーディオンではない）。
- 詳細画面の中身は **内訳中心（得点ブレークダウン）**＋下に予想内容。
- 現状の「見比べ（compare）タブ」は **削除して順位に一本化**。
- スマホ最適化が前提。

## 現状の構造（調査結果）

- `public/screens-rooms.jsx`
  - `RoomCompareScreen`（284-395）: サブタブ `members`(既定)/`compare`/`rank` を切替。
  - 既定 `members` はメンバー丸アイコン＋選択者の `SummaryScreen`。
- `public/screens-rank.jsx`
  - `RankingScreen`（199-926）: 採点・並び替え・表彰台・順位色・内訳ミニバー・コア/総合(`division`)切替・
    アコーディオンで内訳（優勝/準優勝/得点王の HitBadge＋グループ順位/KO 内訳）を表示。
  - **`RankingScreen` は部屋専用**（`grep` 上 `screens-rooms.jsx:390` のみが利用）。他画面に影響しない。
- `public/lib/scoring.js` `scoreMember(pred)` が内訳付きスコアを返す
  （`core.{champion,runnerUp,topScorer}`, `option.{groupRank,knockout,rankHits,koHits{r32,r16,qf,sf},total}`,
   `coreTotal`, `grandTotal`）。
- `resultsLive` 判定（採点が意味を持つか）と `division`（コア/総合）は `RankingScreen` 内で算出済み。

## 設計

### 全体構造（`RoomCompareScreen` 再構成）

サブタブ（members/compare/rank）を廃止し、状態 `detail`（選択メンバーの文脈 or null）で2画面を切替:

- `detail === null`: **リーダーボード**（`RankingScreen` を `onSelectMember` 付きで描画）
- `detail !== null`: **メンバー詳細**

ヘッダー（← 一覧 / 部屋名 / 招待）と `InviteSheet`、ローディング/エラー、`state` 生成（メンバー色/イニシャル付与）は現状を踏襲。
`view`/`sel` ステートとサブタブUIは撤去。

### リーダーボード（`RankingScreen` 拡張）

`RankingScreen` に **任意 prop `onSelectMember`** を追加。後方互換のため未指定時は現状のアコーディオン動作を維持。

- `onSelectMember` 指定時:
  - 行クリックで `setOpen` の代わりに `onSelectMember(payload)` を呼ぶ。
  - 行内アコーディオン（`isOpen` 展開部）は描画しない。chevron は遷移アフォーダンスとして残す。
  - `payload = { id, member, rank, score, resultsLive, division }`
    （`rank` は `resultsLive` 時 1始まり、未確定時は `null`）。
- デスクトップ（`wide`）テーブル経路も同様に行クリックで `onSelectMember` を呼ぶ
  （部屋はモバイル主体だが両対応を保つ）。

内訳描画（HitBadge群＋グループ/KO内訳）は詳細画面と共有するため、共有コンポーネント
`window.WC.MemberBreakdown({ T, pred, score, R, showOption })` に切り出し、
`RankingScreen` のアコーディオンと詳細画面の双方から使う（重複防止・同期維持）。
切り出し後も既存アコーディオンの見た目が変わらないことを目視確認する。

### メンバー詳細画面（新規 `RoomMemberDetail`、`screens-rooms.jsx` 内）

スマホ最適化（全幅・縦スクロール・大きめタップ領域）:

1. 戻るバー: 「← 順位へ」（`detail` を null に戻す）。
2. ヘッダー: 順位メダル色＋順位番号（`resultsLive` 時のみ）／`Avatar`／名前（自分は「（あなた）」）／合計pt（大、Archivo）。
3. **内訳ブレークダウン**: `MemberBreakdown` を `showOption` 常時 true で表示
   （優勝 +25 / 準優勝 +15 / 得点王 +20 の的中、グループ順位 +N（的中数）、ノックアウト +N（16強/8強/4強/決勝の内訳））。
   採点前（全0pt）は `scoreMember` が0を返すため「+0」表示＋「結果待ち」文言で破綻なく見せる。
4. 区切り後、**予想内容**: 既存 `SummaryScreen`（`solo hideShare`）で当該メンバーの全予想を表示。

### キャッシュバスト

`public/index.html` の `screens-rank.jsx?v=10` → `?v=11`、`screens-rooms.jsx?v=11` → `?v=12`。

## 非対象（YAGNI）

- compare（横並び見比べ）機能の保持（削除）。
- 採点ロジック `scoreMember` の変更。
- 部屋API/データ構造の変更。
- メンバー詳細からの共有/招待導線追加。

## リスク / 確認

- `RankingScreen` の内訳切り出しでアコーディオン表示が変わらないこと（目視）。
- `RankingScreen` は部屋専用のため他画面影響なし（再確認済）。
- `division`（コア/総合）切替はリーダーボード側に残す。詳細は常に総合内訳を表示。
- 検証: 本番/プレビューで「入室→順位表示」「カードタップ→詳細（内訳＋予想）」「戻る」「自分強調」「採点前の結果待ち表示」をユーザーが確認。
