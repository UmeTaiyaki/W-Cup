#!/usr/bin/env bash
#
# 開発専用: ローカル D1 の LIVE モック試合を定期更新し、擬似リアルタイムを再現する。
# フロントは /api/live と /api/fixture を 10 秒ポーリングするので、ここでの更新が UI に反映される。
# 本番には絶対使わない（--local 固定。--remote は付けない）。
#
# 前提: db/seed-detail-live.sql をローカル D1 に適用済み。別端末で dev サーバ稼働:
#   wrangler d1 execute wcup2026-db --local --file db/seed-detail-live.sql
#   wrangler pages dev public --port 8799   # 8788 は別アプリが常駐のため空きポート推奨
#
# 使い方: bash scripts/mock-live-tick.sh [fixture_id=9000002] [interval_sec=10] [ticks=12]
set -uo pipefail

FX="${1:-9000002}"
INT="${2:-10}"
TICKS="${3:-12}"
DB="wcup2026-db"

sql() { wrangler d1 execute "$DB" --local --command "$1" >/dev/null 2>&1; }

echo "mock-live-tick: fixture=$FX interval=${INT}s ticks=$TICKS  (LOCAL D1 のみ)"
min=45
for i in $(seq 1 "$TICKS"); do
  min=$(( min + 3 ))
  now=$(date +%s)
  if (( i % 3 == 0 )); then
    # 3 tick ごとに得点（home/away 交互）＋ ゴールイベント追加
    if (( (i/3) % 2 == 0 )); then
      sql "UPDATE sm_fixtures SET home_score=home_score+1, home_xg=ROUND(COALESCE(home_xg,0)+0.3,2), updated_at=$now WHERE sm_fixture_id=$FX;"
      team=9100001; who='Mock Scorer JPN'
    else
      sql "UPDATE sm_fixtures SET away_score=away_score+1, away_xg=ROUND(COALESCE(away_xg,0)+0.3,2), updated_at=$now WHERE sm_fixture_id=$FX;"
      team=9100002; who='Mock Scorer GER'
    fi
    eid=$(( 9390000 + i ))
    sql "INSERT OR REPLACE INTO sm_events (sm_event_id, sm_fixture_id, minute, extra_minute, type, type_id, team_id, player_name, related_player_name, sort_order, updated_at) VALUES ($eid,$FX,$min,NULL,'goal',14,$team,'$who',NULL,$(( min*60 )),$now);"
    echo "  tick $i (min~$min): ⚽ GOAL team=$team"
  else
    sql "UPDATE sm_fixtures SET updated_at=$now WHERE sm_fixture_id=$FX;"
    echo "  tick $i (min~$min): tick"
  fi
  sleep "$INT"
done
echo "done. インプレーのまま。終了状態にするには: wrangler d1 execute $DB --local --command \"UPDATE sm_fixtures SET state_id=5 WHERE sm_fixture_id=$FX;\""
