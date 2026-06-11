#!/usr/bin/env bash
#
# xGoT 取得可否プローブ（C′案 xG分析画面 設計用）
# 目的: xGoT(5305)/xGA(9687)/npxG(7943) が All-In で
#       チーム単位 / 選手単位で実際に返るかを確定する。
#   A) statistics 配列に xG系 type_id が含まれるか（チーム単位）
#   B) xGFixture include が xG系を運ぶか
#   C) lineups.details/xglineup に選手別 xG系があるか
#   D) 5305 等のカタログ名称
#
# 使い方（W-Cup ルートで）:
#   SPORTMONKS_TOKEN=$(grep '^SPORTMONKS_TOKEN=' .dev.vars | cut -d= -f2- | tr -d '\n\r') \
#     bash scripts/sportmonks-xgot-probe.sh [fixture_id]
#
# 注意: トークンは絶対に出力しない。
set -uo pipefail
: "${SPORTMONKS_TOKEN:?SPORTMONKS_TOKEN をセットしてください}"

BASE="https://api.sportmonks.com/v3/football"
CORE="https://api.sportmonks.com/v3/core"
AUTH=(-H "Authorization: ${SPORTMONKS_TOKEN}")
FX="${1:-18452339}"  # 既定: 2022 Morocco vs Spain

echo "########## fixture=${FX} ##########"
echo
echo "=== A) statistics の全 type_id ==="
curl -s "${AUTH[@]}" "$BASE/fixtures/${FX}?include=statistics" \
  | jq -r '[.data.statistics[]?.type_id] | unique | sort | @json'
echo
echo "=== B) xGFixture include（type_id × location × value）==="
curl -s "${AUTH[@]}" "$BASE/fixtures/${FX}?include=xGFixture" \
  | jq -r '.data.xgfixture[]? | "type_id=\(.type_id) loc=\(.location) value=\(.data.value // .value)"' \
  | sort | uniq -c
echo
echo "=== C) lineups details の type_id（選手別 xG系の有無）==="
curl -s "${AUTH[@]}" "$BASE/fixtures/${FX}?include=lineups.details.type;lineups.xglineup" \
  | jq -r '[.data.lineups[]?.details[]?.type_id] | unique | sort | @json'
echo
echo "=== D) types カタログ: xG系名称 ==="
for id in 5304 5305 7943 9687; do
  curl -s "${AUTH[@]}" "$CORE/types/${id}" \
    | jq -r '.data | "  \(.id): \(.name) [\(.developer_name // "")]"'
done
echo
echo "########## done ##########"
