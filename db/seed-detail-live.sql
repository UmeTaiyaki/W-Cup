-- 開発専用: LIVE(進行中)状態のモック試合。検証環境でライブUI/ポーリングを確認するため。
-- 本番には絶対投入しない。fixture_id 9000002 / 偽IDのため実データと衝突しない。
-- 適用: wrangler d1 execute wcup2026-db --local --file db/seed-detail-live.sql
-- ティッカー: bash scripts/mock-live-tick.sh 9000002  （別端末で実行＝擬似リアルタイム更新）

-- teams（seed-detail-sample と同じ JPN/GER を再利用。未適用でも単体で動くよう OR REPLACE）
INSERT OR REPLACE INTO sm_teams (sm_team_id, app_code, name, short_code, image_url, updated_at) VALUES
  (9100001, 'JPN', 'Japan',   'JPN', 'https://flagcdn.com/w160/jp.png', 1781000000),
  (9100002, 'GER', 'Germany', 'GER', 'https://flagcdn.com/w160/de.png', 1781000000);

-- LIVE fixture: state_id=3(後半=インプレー) / 進行中スコア 1-0 / xG途中値
INSERT OR REPLACE INTO sm_fixtures
  (sm_fixture_id, league_id, season_id, round_name, starting_at, starting_at_ts,
   state_id, state_short, home_team_id, away_team_id, home_score, away_score,
   home_xg, away_xg, venue, result_info, updated_at) VALUES
  (9000002, 732, 26618, 'Group F', '2026-06-11 19:00:00', 1781204400,
   3, 'INPLAY', 9100001, 9100002, 1, 0,
   0.92, 0.41, 'Mock Live Stadium', NULL, 1781000000);

-- events（進行中＝得点1・カード1のみ。ティッカーが追加していく）
INSERT OR REPLACE INTO sm_events
  (sm_event_id, sm_fixture_id, minute, extra_minute, type, type_id, team_id, player_name, related_player_name, sort_order, updated_at) VALUES
  (9300001, 9000002, 27, NULL, 'goal',       14, 9100001, 'Kaoru Mitoma',  NULL, 1620, 1781000000),
  (9300002, 9000002, 41, NULL, 'yellowcard', 19, 9100002, 'Joshua Kimmich', NULL, 2460, 1781000000);

-- team stats（途中経過）
INSERT OR REPLACE INTO sm_stats (sm_fixture_id, team_id, type_id, value, updated_at) VALUES
  (9000002, 9100001, 45, 55, 1781000000), (9000002, 9100002, 45, 45, 1781000000),
  (9000002, 9100001, 42, 6,  1781000000), (9000002, 9100002, 42, 4,  1781000000),
  (9000002, 9100001, 86, 3,  1781000000), (9000002, 9100002, 86, 1,  1781000000),
  (9000002, 9100001, 34, 2,  1781000000), (9000002, 9100002, 34, 3,  1781000000),
  (9000002, 9100001, 56, 5,  1781000000), (9000002, 9100002, 56, 7,  1781000000);

-- lineups（先発の一部＋per-player xG）
INSERT OR REPLACE INTO sm_lineups
  (sm_fixture_id, team_id, player_id, player_name, jersey_number, position, formation_field, is_start, xg, updated_at) VALUES
  (9000002, 9100001, 9410001, 'Gonda',        1, '24', '1:1', 1, NULL, 1781000000),
  (9000002, 9100001, 9410002, 'Sakai',        5, '25', '2:2', 1, NULL, 1781000000),
  (9000002, 9100001, 9410003, 'Wataru Endo',  6, '26', '3:2', 1, 0.10, 1781000000),
  (9000002, 9100001, 9410004, 'Kaoru Mitoma', 14,'27', '4:1', 1, 0.58, 1781000000),
  (9000002, 9100001, 9410005, 'Takuma Asano', 15,'27', '4:2', 1, 0.24, 1781000000),
  (9000002, 9100002, 9420001, 'Neuer',        1, '24', '1:1', 1, NULL, 1781000000),
  (9000002, 9100002, 9420002, 'Kimmich',      6, '26', '3:2', 1, 0.12, 1781000000),
  (9000002, 9100002, 9420003, 'Musiala',      10,'27', '4:1', 1, 0.29, 1781000000);

-- player stats（数名）
INSERT OR REPLACE INTO sm_player_stats (sm_fixture_id, player_id, type_id, value, updated_at) VALUES
  (9000002, 9410004, 42, 3, 1781000000), (9000002, 9410004, 86, 2, 1781000000), (9000002, 9410004, 118, 7.6, 1781000000),
  (9000002, 9420003, 42, 2, 1781000000), (9000002, 9420003, 118, 6.9, 1781000000);
