#!/usr/bin/env bash
#
# SportMonks 契約後チェック（W杯本大会 league=732 固定版）
# ・2026シーズン: 日程/対戦カードの取得可否（開幕前はxG/statsは空が正常）
# ・過去W杯(2022): xG・statistics が All-In で取れるかの本検証
#
# 使い方:
#   export SPORTMONKS_TOKEN="<ダッシュボードで発行したトークン>"
#   ./scripts/sportmonks-trial-check.sh
#
set -euo pipefail

: "${SPORTMONKS_TOKEN:?環境変数 SPORTMONKS_TOKEN をセットしてください (export SPORTMONKS_TOKEN=...) }"

BASE="https://api.sportmonks.com/v3/football"
AUTH=(-H "Authorization: ${SPORTMONKS_TOKEN}")

# 本大会の World Cup リーグを名前完全一致で特定（711=予選を除外）
WC_JSON=$(curl -s "${AUTH[@]}" "$BASE/leagues/search/World%20Cup")
LEAGUE_ID=$(echo "$WC_JSON" | jq -r '.data[]? | select(.name == "World Cup") | .id' | head -1)

hr() { printf '\n========== %s ==========\n' "$1"; }

hr "0. 本大会リーグ"
echo ">> league_id(World Cup 本大会): ${LEAGUE_ID:-(見つからず)}"

# --- シーズン一覧（732の正しいシーズン） -------------------------------------
hr "1. シーズン一覧 (2026=開催前 / 2022=検証用)"
SEAS_JSON=$(curl -s "${AUTH[@]}" "$BASE/leagues/${LEAGUE_ID}?include=seasons")
echo "$SEAS_JSON" | jq -r '.data.seasons[]? | "season_id=\(.id)\tname=\(.name)"'
SEASON_2026=$(echo "$SEAS_JSON" | jq -r '.data.seasons[]? | select(.name=="2026") | .id' | head -1)
SEASON_2022=$(echo "$SEAS_JSON" | jq -r '.data.seasons[]? | select(.name=="2022") | .id' | head -1)
echo ">> season 2026: ${SEASON_2026:-?}   /   season 2022(検証用): ${SEASON_2022:-?}"

# --- 2026: 日程・対戦カードが取れるか（実装の主データ） ----------------------
hr "2. 2026 日程/対戦カード (開幕前: scores/xGは空が正常)"
FX2026=$(curl -s "${AUTH[@]}" "$BASE/seasons/${SEASON_2026}?include=fixtures")
echo "2026 fixture件数: $(echo "$FX2026" | jq '(.data.fixtures // []) | length')"
echo "$FX2026" | jq -r '(.data.fixtures // [])[:3][] | "  \(.starting_at)  \(.name)"' 2>/dev/null || true

# --- 2022: xG / statistics が取れるか（契約価値の本検証） --------------------
hr "3. 過去W杯2022 で xG・statistics 検証 ★最重要"
FX2022=$(curl -s "${AUTH[@]}" "$BASE/seasons/${SEASON_2022}?include=fixtures")
# 完了済みの試合（配列末尾＝決勝に近い）を1件サンプル
FIXTURE_ID=$(echo "$FX2022" | jq -r '(.data.fixtures // []) | last | .id // empty')
echo ">> サンプル fixture_id(2022): ${FIXTURE_ID:-(取得できず)}"

if [ -n "${FIXTURE_ID:-}" ]; then
  echo "--- include=participants;scores;statistics;events;xGFixture ---"
  DETAIL=$(curl -s "${AUTH[@]}" \
    "$BASE/fixtures/${FIXTURE_ID}?include=participants;scores;statistics;events;xGFixture")
  echo "$DETAIL" | jq '{
    name: .data.name,
    has_scores:     ((.data.scores // []) | length > 0),
    has_statistics: ((.data.statistics // []) | length > 0),
    has_events:     ((.data.events // []) | length > 0),
    has_xg:         ((.data.xgfixture // .data.xGFixture // []) | length > 0)
  }'
  echo "--- xG生データ（include名/構造の確認用・先頭2件） ---"
  echo "$DETAIL" | jq '(.data.xgfixture // .data.xGFixture // "xgfixtureキー無し") | if type=="array" then .[:2] else . end'
fi

# --- レート制限 ---------------------------------------------------------------
hr "4. rate_limit"
echo "$DETAIL" | jq '.rate_limit // "（前リクエストにrate_limit無し）"' 2>/dev/null || \
  curl -s "${AUTH[@]}" "$BASE/leagues?per_page=1" | jq '.rate_limit'

hr "判定の見方"
echo "・2026 fixture件数 > 0 → 日程/対戦カードを実装に使える"
echo "・has_xg=true(2022) → All-InでW杯のxG取得可。詳細画面の核データが確保できる"
echo "・has_xg=false でも has_statistics=true なら、xGはinclude名違いの可能性 → 生データ欄を確認"
