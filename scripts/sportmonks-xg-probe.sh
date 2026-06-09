#!/usr/bin/env bash
#
# SportMonks 詳細画面データ・プローブ（P2 設計用）
# 目的: 試合詳細画面の各要素に必要なデータが All-In で取れるかを実検証する。
#   - チーム合計xG (statistics type_id=5304)
#   - スタッツの全 type_id（スタッツタブで何を出せるか）
#   - イベントの全 type_id（タイムラインで何を出せるか）
#   - ★シュート単位データ / 座標 / 時系列xG（xGレース・シュート一覧の可否）
#   - ラインナップ / フォーメーション（布陣タブの可否）
#
# 使い方:
#   export SPORTMONKS_TOKEN="<トークン>"   # もしくは下行に直接前置
#   ./scripts/sportmonks-xg-probe.sh
#   SPORTMONKS_TOKEN=xxx ./scripts/sportmonks-xg-probe.sh
#
# 注意: トークンは絶対に出力しない。
set -uo pipefail

: "${SPORTMONKS_TOKEN:?環境変数 SPORTMONKS_TOKEN をセットしてください}"

BASE="https://api.sportmonks.com/v3/football"
AUTH=(-H "Authorization: ${SPORTMONKS_TOKEN}")

hr()  { printf '\n========== %s ==========\n' "$1"; }
sub() { printf '\n----- %s -----\n' "$1"; }

# fixture詳細を1つの include で取得して中身を要約する関数
# $1=include名（カンマ/セミコロン区切り可） $2=見出し
probe_include() {
  local inc="$1" title="$2"
  sub "include=${inc}  [${title}]"
  local resp
  resp=$(curl -s "${AUTH[@]}" "$BASE/fixtures/${FIXTURE_ID}?include=${inc}")
  # エラー（無効include等）の検出
  local err
  err=$(echo "$resp" | jq -r '.message // empty' 2>/dev/null)
  if [ -n "$err" ]; then
    echo "  ✗ APIエラー/不可: $err"
    return
  fi
  # include名はレスポンスでは小文字キーになることが多いので両対応で拾う
  echo "$resp" | jq '
    .data
    | to_entries
    | map(select(.value | (type=="array" or type=="object")))
    | map({key, kind:(.value|type), len:(if (.value|type)=="array" then (.value|length) else null end)})
  ' 2>/dev/null || echo "  (jq解析不可・生レスポンス先頭) $(echo "$resp" | head -c 300)"
}

# ---------------------------------------------------------------------------
hr "0. リーグ/シーズン解決（2022検証用 fixture を取る）"
WC_JSON=$(curl -s "${AUTH[@]}" "$BASE/leagues/search/World%20Cup")
LEAGUE_ID=$(echo "$WC_JSON" | jq -r '.data[]? | select(.name == "World Cup") | .id' | head -1)
SEAS_JSON=$(curl -s "${AUTH[@]}" "$BASE/leagues/${LEAGUE_ID}?include=seasons")
SEASON_2022=$(echo "$SEAS_JSON" | jq -r '.data.seasons[]? | select(.name=="2022") | .id' | head -1)
echo ">> league_id=${LEAGUE_ID:-?}  season_2022=${SEASON_2022:-?}"

FX2022=$(curl -s "${AUTH[@]}" "$BASE/seasons/${SEASON_2022}?include=fixtures")
# 決勝に近い完了試合を1件
FIXTURE_ID=$(echo "$FX2022" | jq -r '(.data.fixtures // []) | last | .id // empty')
FIXTURE_NM=$(echo "$FX2022" | jq -r '(.data.fixtures // []) | last | .name // empty')
echo ">> 検証 fixture_id=${FIXTURE_ID:-(取得不可)}  name=${FIXTURE_NM:-?}"
[ -z "${FIXTURE_ID:-}" ] && { echo "fixture取得不可。終了。"; exit 1; }

# ---------------------------------------------------------------------------
hr "1. スタッツ type_id 一覧（スタッツタブで出せる項目）"
STAT=$(curl -s "${AUTH[@]}" "$BASE/fixtures/${FIXTURE_ID}?include=statistics.type")
echo "statistics件数: $(echo "$STAT" | jq '(.data.statistics // []) | length')"
echo "--- 出現する type_id と名前（重複排除） ---"
echo "$STAT" | jq -r '
  (.data.statistics // [])
  | map({id:.type_id, name:(.type.name // .type.code // "?")})
  | unique_by(.id) | sort_by(.id)
  | .[] | "  type_id=\(.id)\t\(.name)"' 2>/dev/null || echo "  (解析不可)"
echo "--- xG(5304) は出現するか ---"
echo "$STAT" | jq '[(.data.statistics // [])[] | select(.type_id==5304)] | {found:(length>0), rows:.[0:2]}'

# ---------------------------------------------------------------------------
hr "2. イベント type_id 一覧（タイムラインで出せる項目）"
EV=$(curl -s "${AUTH[@]}" "$BASE/fixtures/${FIXTURE_ID}?include=events.type")
echo "events件数: $(echo "$EV" | jq '(.data.events // []) | length')"
echo "$EV" | jq -r '
  (.data.events // [])
  | map({id:.type_id, name:(.type.name // .type.code // "?")})
  | unique_by(.id) | sort_by(.id)
  | .[] | "  type_id=\(.id)\t\(.name)"' 2>/dev/null || echo "  (解析不可)"
echo "--- イベント1件の全フィールド（座標/分/関連選手の有無確認） ---"
echo "$EV" | jq '(.data.events // [])[0] // "events無し"'

# ---------------------------------------------------------------------------
hr "3. ★シュート単位 / 時系列xG / 座標 の可否（xGレース・シュート一覧の核）"
# SportMonks で存在しうる shot/expected 系 include を片っ端から検証
for inc in \
  "xGFixture" \
  "expected" \
  "shots" \
  "pressure" \
  "trends" \
  "scores" ; do
  probe_include "$inc" "shot/xG候補"
done
echo
echo "--- xGFixture の構造サンプル（時系列・選手別が含まれるか） ---"
curl -s "${AUTH[@]}" "$BASE/fixtures/${FIXTURE_ID}?include=xGFixture" \
  | jq '(.data.xgfixture // .data.xGFixture // "xGFixtureキー無し") | if type=="array" then .[0:3] else . end'

# ---------------------------------------------------------------------------
hr "4. ラインナップ / フォーメーション（布陣タブ）"
probe_include "lineups" "ラインナップ"
probe_include "formations" "フォーメーション"
echo "--- lineups 1件のフィールド（背番号/ポジション/grid座標の有無） ---"
curl -s "${AUTH[@]}" "$BASE/fixtures/${FIXTURE_ID}?include=lineups" \
  | jq '(.data.lineups // [])[0] // "lineups無し"'

# ---------------------------------------------------------------------------
hr "5. rate_limit"
curl -s "${AUTH[@]}" "$BASE/leagues?per_page=1" | jq '.rate_limit'

hr "判定の見方"
echo "・3で shots/expected が len>0 → シュート単位xG可 → xGレース＋シュート一覧(Bリッチ)が作れる"
echo "・3が全て不可/0 かつ 1で5304あり → xGはチーム合計のみ(A) で確定"
echo "・2のイベントに座標/関連選手があれば タイムラインを充実できる"
echo "・4で lineups に grid/number/position があれば 布陣図(後続スコープ)が実装できる"
