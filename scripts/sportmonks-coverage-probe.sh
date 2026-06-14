#!/usr/bin/env bash
#
# 戦術分析カバレッジ・プローブ（使い捨て）
# 目的: SportMonks All-In で「戦術分析官が見るデータ」をどこまで取れるかを実機確定する。
#   1) チーム統計 type_id → 名称（パス/クロス/タックル/PPDA素材 等の所在）
#   2) 選手別 details type_id → 名称（選手評価データの粒度）
#   3) events（タイムライン）件数・種別・座標の有無
#   4) シュート単位 / 座標 / pressure / trends include の可否
#   5) トラッキング/ヒートマップ/平均ポジション系 include の可否
#
# 使い方:
#   SPORTMONKS_TOKEN=$(grep '^SPORTMONKS_TOKEN=' .dev.vars | cut -d= -f2- | tr -d '\n\r') \
#     bash scripts/sportmonks-coverage-probe.sh [fixture_id]
# 注意: トークンは絶対に出力しない。
set -uo pipefail
: "${SPORTMONKS_TOKEN:?SPORTMONKS_TOKEN をセットしてください}"

BASE="https://api.sportmonks.com/v3/football"
CORE="https://api.sportmonks.com/v3/core"
AUTH=(-H "Authorization: ${SPORTMONKS_TOKEN}")
FX="${1:-19609127}"   # 既定: 2026開幕戦 Mexico vs South Africa

echo "########## fixture=${FX} ##########"

resolve_types() {
  for id in $1; do
    curl -s "${AUTH[@]}" "$CORE/types/$id" \
      | jq -r '.data | "  \(.id)\t\(.name) [\(.developer_name // "")]"' 2>/dev/null
  done
}

echo
echo "===== 1) チーム統計 type_id → 名称 ====="
STAT=$(curl -s "${AUTH[@]}" "$BASE/fixtures/$FX?include=statistics")
IDS=$(echo "$STAT" | jq -r '[.data.statistics[]?.type_id] | unique | sort | .[]')
echo "count=$(echo "$IDS" | grep -c . )"
resolve_types "$IDS"

echo
echo "===== 2) 選手別 lineups.details type_id → 名称 ====="
LU=$(curl -s "${AUTH[@]}" "$BASE/fixtures/$FX?include=lineups.details")
PIDS=$(echo "$LU" | jq -r '[.data.lineups[]?.details[]?.type_id] | unique | sort | .[]')
echo "count=$(echo "$PIDS" | grep -c . )"
resolve_types "$PIDS"

echo
echo "===== 3) events（タイムライン）件数・種別・座標 ====="
EV=$(curl -s "${AUTH[@]}" "$BASE/fixtures/$FX?include=events.type")
echo "events count: $(echo "$EV" | jq '[.data.events[]?] | length')"
echo "$EV" | jq -r '[.data.events[]? | {id:.type_id, n:(.type.name // "?")}] | unique_by(.id) | sort_by(.id) | .[] | "  \(.id)\t\(.n)"'
echo "-- event[0] の全キー（座標/分/選手の有無）--"
echo "$EV" | jq -r '.data.events[0] // {} | keys'

echo
echo "===== 4) シュート単位 / 座標 / pressure / trends include ====="
for inc in shots pressure trends xGFixture commentaries; do
  R=$(curl -s "${AUTH[@]}" "$BASE/fixtures/$FX?include=$inc")
  M=$(echo "$R" | jq -r '.message // empty')
  if [ -n "$M" ]; then
    echo "  $inc: ✗ $M"
  else
    echo "  $inc: $(echo "$R" | jq -rc '.data | to_entries | map(select(.value|type=="array")) | map({(.key):(.value|length)}) | add // "(配列include無し)"')"
  fi
done
echo "-- shots[0] のキー（座標 x/y があるか）--"
curl -s "${AUTH[@]}" "$BASE/fixtures/$FX?include=shots" | jq -r '(.data.shots // [])[0] // "shots include無し" | if type=="object" then keys else . end'

echo
echo "===== 5) トラッキング/ヒートマップ/平均ポジション系 include ====="
for inc in trackingdata heatmap positions formations periods.statistics; do
  R=$(curl -s "${AUTH[@]}" "$BASE/fixtures/$FX?include=$inc")
  M=$(echo "$R" | jq -r '.message // empty')
  if [ -n "$M" ]; then echo "  $inc: ✗ $M"; else echo "  $inc: ✓ 取得可"; fi
done

echo
echo "########## done ##########"
