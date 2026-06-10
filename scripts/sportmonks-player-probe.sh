#!/usr/bin/env bash
#
# 選手プロフィール用データの「現契約での取得可否」を実APIで確認するプローブ。
# リッチなプロフィール(顔写真/利き足/キャリア履歴/シーズン統計/直近試合)が
# WC All-In プラン(league 732 スコープ)で実際に返るかを要約出力する。
#
# 使い方（トークンは表示されません）:
#   export SPORTMONKS_TOKEN="$(grep '^SPORTMONKS_TOKEN=' .dev.vars | cut -d= -f2-)"
#   bash scripts/sportmonks-player-probe.sh "Ueda"
# もしくは:
#   SPORTMONKS_TOKEN=xxxxx bash scripts/sportmonks-player-probe.sh "Mitoma"
#
set -uo pipefail
: "${SPORTMONKS_TOKEN:?環境変数 SPORTMONKS_TOKEN をセットしてください（例: export SPORTMONKS_TOKEN=\"\$(grep '^SPORTMONKS_TOKEN=' .dev.vars | cut -d= -f2-)\"）}"
NAME="${1:-Ueda}"
BASE="https://api.sportmonks.com/v3/football"
AUTH=(-H "Authorization: ${SPORTMONKS_TOKEN}")

echo "=== 0) rate limit ==="
curl -s "${AUTH[@]}" "$BASE/leagues?per_page=1" | jq '.rate_limit' 2>/dev/null

echo ""
if [[ "$NAME" =~ ^[0-9]+$ ]]; then
  PID="$NAME"
  echo "=== 1) player_id 直指定 = $PID ==="
else
  echo "=== 1) 名前検索: \"$NAME\" → 候補一覧（ID直指定で再実行推奨） ==="
  SEARCH=$(curl -s "${AUTH[@]}" "$BASE/players/search/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$NAME")")
  echo "$SEARCH" | jq -r '.data[]? | "\(.id)\t\(.name)\t\(.date_of_birth)"' 2>/dev/null | head -8
  # 名前に検索語を含む行を優先採用（無ければ先頭）
  PID=$(echo "$SEARCH" | jq -r --arg q "$NAME" '([.data[]? | select((.name|ascii_downcase)|contains($q|ascii_downcase))][0].id) // .data[0].id // empty' 2>/dev/null)
  echo "→ 採用 player_id = ${PID:-(なし)}（違う場合は ID を引数に: bash scripts/sportmonks-player-probe.sh 21773355）"
fi
[ -z "${PID:-}" ] && { echo "ヒットなし。別の名前/IDで再実行してください。"; exit 1; }

echo ""
echo "=== 2) フルプロフィール include 取得 ==="
INC="metadata;position;detailedPosition;nationality;teams.team;transfers.fromTeam;transfers.toTeam;statistics.details"
RESP=$(curl -s "${AUTH[@]}" "$BASE/players/$PID?include=$INC")

# API エラー(プラン外など)を表示
echo "$RESP" | jq -e '.message? // empty' >/dev/null 2>&1 && {
  echo "⚠️ API message: $(echo "$RESP" | jq -r '.message')"
}

echo ""
echo "=== 3) 取得可否サマリ（各includeが返ったか）==="
echo "$RESP" | jq -r '"基本: name=\(.data.name) 顔写真=\(.data.image_path!=null) 身長=\(.data.height) 体重=\(.data.weight) dob=\(.data.date_of_birth) 国籍=\(.data.nationality.name // "なし")"' 2>/dev/null
echo "--- 利き足(metadata) ---"
echo "$RESP" | jq -r '(.data.metadata // []) | if length==0 then "なし" else (.[] | "type_id \(.type_id) = \(.values)") end' 2>/dev/null
echo "--- キャリア: teams（所属チーム履歴＋ロゴ） ---"
echo "$RESP" | jq -r 'if (.data.teams|type)=="array" then "件数=\(.data.teams|length)" else "teams=なし(includeが返らない)" end' 2>/dev/null
echo "$RESP" | jq -r '(.data.teams // [])[]? | "  \(.team.name // "?")  logo=\(.team.image_path!=null)  start=\(.start // "?")  end=\(.end // "?")"' 2>/dev/null | head -6
echo "--- キャリア: transfers（移籍履歴） ---"
echo "$RESP" | jq -r 'if (.data.transfers|type)=="array" then "件数=\(.data.transfers|length)" else "transfers=なし(includeが返らない)" end' 2>/dev/null
echo "$RESP" | jq -r '(.data.transfers // [])[]? | "  \(.date // "?")  \(.fromTeam.name // "?") → \(.toTeam.name // "?")  type=\(.type_id)"' 2>/dev/null | head -6
echo "--- シーズン統計: statistics ---"
echo "$RESP" | jq -r 'if (.data.statistics|type)=="array" then "シーズン数=\(.data.statistics|length)" else "statistics=なし(includeが返らない＝プラン外の可能性)" end' 2>/dev/null
echo "$RESP" | jq -r '(.data.statistics // [])[]? | "  season_id=\(.season_id)  details件数=\(.details|length)"' 2>/dev/null | head -6

echo ""
echo "=== 4) シーズン統計の中身（details が最多のシーズンをサンプル）==="
echo "$RESP" | jq -r '
  (.data.statistics // []) | map(select((.details|length)>0)) | sort_by(-(.details|length)) | .[0] as $s
  | if $s == null then "中身のあるシーズンなし" else
      "採用 season_id=\($s.season_id) (details \($s.details|length)件)\n" +
      ([$s.details[] | "  type_id \(.type_id): \(.value)"] | join("\n"))
    end' 2>/dev/null | head -40
echo "（type_id 凡例: 52=goals 79=assists 80=passes 81/82=成功passes 84=yellowcards 83=redcards 42=shots-total 86=on-target 118=rating 119=minutes 321/322=appearances 9676=PPG）"

echo ""
echo "=== 5) latest（直近出場）の構造ダンプ＝1試合ごとの成績が含まれるか ==="
LATEST=$(curl -s "${AUTH[@]}" "$BASE/players/$PID?include=latest")
echo "latest 件数: $(echo "$LATEST" | jq '.data.latest|length' 2>/dev/null)"
echo "--- latest[0] のキー ---"
echo "$LATEST" | jq -r '.data.latest[0] | keys[]' 2>/dev/null
echo "--- latest[0] に details(per-match stat) があるか ---"
echo "$LATEST" | jq -r '.data.latest[0] | if has("details") then "details \( .details|length )件: " + ([.details[]? | "\(.type_id)=\(.value)"]|join(", ")) else "details なし" end' 2>/dev/null | head -c 500
echo ""
echo "--- latest[0] 生(先頭400字) ---"
echo "$LATEST" | jq -c '.data.latest[0]' 2>/dev/null | head -c 400

echo ""
echo "=== 完了。上記サマリを Claude に貼り戻してください（トークンは出力に含まれません）。 ==="
