-- seed-detail-sample.sql
-- 開発専用サンプル seed（本番適用禁止）
-- 1試合フルデータ: sm_fixture_id=9000001 (JPN 2-1 GER)
-- 適用: wrangler d1 execute wcup2026-db --local --file db/seed-detail-sample.sql
--   または: sqlite3 /tmp/seedcheck.db < db/schema-watch.sql && sqlite3 /tmp/seedcheck.db < db/seed-detail-sample.sql

-- -------------------------------------------------------------------------
-- 1) sm_teams (2 rows)
-- -------------------------------------------------------------------------
INSERT OR REPLACE INTO sm_teams (sm_team_id, app_code, name, short_code, image_url, updated_at) VALUES
  (9100001, 'JPN', 'Japan', 'JPN', 'https://flagcdn.com/w160/jp.png', 1781000000),
  (9100002, 'GER', 'Germany', 'GER', 'https://flagcdn.com/w160/de.png', 1781000000);

-- -------------------------------------------------------------------------
-- 2) sm_fixtures (1 row): FT, JPN 2-1 GER, Group F
-- -------------------------------------------------------------------------
INSERT OR REPLACE INTO sm_fixtures (
  sm_fixture_id, league_id, season_id, round_name,
  starting_at, starting_at_ts,
  state_id, state_short,
  home_team_id, away_team_id,
  home_score, away_score,
  home_xg, away_xg,
  venue, result_info, updated_at
) VALUES (
  9000001, 999, 9999, 'Group F',
  '2026-06-15T18:00:00+00:00', 1781568000,
  5, 'FT',
  9100001, 9100002,
  2, 1,
  1.84, 1.21,
  'Sample Stadium', NULL, 1781620000
);

-- -------------------------------------------------------------------------
-- 3) sm_events (~5 rows): goals / cards / substitution
-- type_id: 14=goal, 19=yellowcard, 18=substitution
-- sort_order = minute * 60 + extra_minute
-- -------------------------------------------------------------------------
INSERT OR REPLACE INTO sm_events (sm_event_id, sm_fixture_id, minute, extra_minute, type, type_id, team_id, player_name, related_player_name, sort_order, updated_at) VALUES
  (9200001, 9000001, 23,  NULL, 'goal',         14, 9100001, 'Takuma Asano',    'Wataru Endo',    1380,  1781620000),
  (9200002, 9000001, 45,  3,    'goal',         14, 9100002, 'Thomas Müller',   NULL,             2703,  1781620000),
  (9200003, 9000001, 55,  NULL, 'yellowcard',   19, 9100002, 'Leon Goretzka',   NULL,             3300,  1781620000),
  (9200004, 9000001, 67,  NULL, 'substitution', 18, 9100001, 'Kaoru Mitoma',    'Junya Ito',      4020,  1781620000),
  (9200005, 9000001, 78,  NULL, 'goal',         14, 9100001, 'Ritsu Doan',      'Kaoru Mitoma',   4680,  1781620000);

-- -------------------------------------------------------------------------
-- 4) sm_stats (both teams): possession / shots / shots-on-target / corners / fouls
-- type_id: 45=possession, 42=shots, 86=shots-on-target, 34=corners, 56=fouls
-- -------------------------------------------------------------------------
INSERT OR REPLACE INTO sm_stats (sm_fixture_id, team_id, type_id, value, updated_at) VALUES
  (9000001, 9100001, 45,  58.0, 1781620000),
  (9000001, 9100002, 45,  42.0, 1781620000),
  (9000001, 9100001, 42,  11.0, 1781620000),
  (9000001, 9100002, 42,   9.0, 1781620000),
  (9000001, 9100001, 86,   5.0, 1781620000),
  (9000001, 9100002, 86,   3.0, 1781620000),
  (9000001, 9100001, 34,   4.0, 1781620000),
  (9000001, 9100002, 34,   6.0, 1781620000),
  (9000001, 9100001, 56,   8.0, 1781620000),
  (9000001, 9100002, 56,  12.0, 1781620000);

-- -------------------------------------------------------------------------
-- 5) sm_lineups: home (9100001) 先発 4 + 控え 1, away (9100002) 先発 3 + 控え 1
-- formation_field: row:col (1=GK row, 2=DF, 3=MF, 4=FW)
-- -------------------------------------------------------------------------
INSERT OR REPLACE INTO sm_lineups (sm_fixture_id, team_id, player_id, player_name, jersey_number, position, formation_field, is_start, xg, updated_at) VALUES
  -- JPN 先発
  (9000001, 9100001, 9300001, 'Shuichi Gonda',   1,  'G',  '1:1', 1, NULL, 1781620000),
  (9000001, 9100001, 9300002, 'Hiroki Sakai',    5,  'D',  '2:1', 1, NULL, 1781620000),
  (9000001, 9100001, 9300003, 'Wataru Endo',     6,  'M',  '3:1', 1, 0.08, 1781620000),
  (9000001, 9100001, 9300004, 'Takuma Asano',    15, 'F',  '4:1', 1, 0.62, 1781620000),
  (9000001, 9100001, 9300005, 'Ritsu Doan',      9,  'F',  '4:2', 1, 0.73, 1781620000),
  -- JPN 控え
  (9000001, 9100001, 9300006, 'Junya Ito',       16, 'F',  NULL,  0, NULL, 1781620000),
  -- GER 先発
  (9000001, 9100002, 9300011, 'Manuel Neuer',    1,  'G',  '1:1', 1, NULL, 1781620000),
  (9000001, 9100002, 9300012, 'Leon Goretzka',   8,  'M',  '3:1', 1, 0.15, 1781620000),
  (9000001, 9100002, 9300013, 'Thomas Müller',   25, 'F',  '4:1', 1, 0.44, 1781620000),
  -- GER 控え
  (9000001, 9100002, 9300014, 'Kai Havertz',     14, 'F',  NULL,  0, NULL, 1781620000);

-- -------------------------------------------------------------------------
-- 6) sm_player_stats: type_id 42=shots, 86=shots-on-target, 118=rating
-- -------------------------------------------------------------------------
INSERT OR REPLACE INTO sm_player_stats (sm_fixture_id, player_id, type_id, value, updated_at) VALUES
  (9000001, 9300004, 42,   3.0, 1781620000),
  (9000001, 9300004, 86,   2.0, 1781620000),
  (9000001, 9300004, 118,  8.1, 1781620000),
  (9000001, 9300005, 42,   2.0, 1781620000),
  (9000001, 9300005, 86,   2.0, 1781620000),
  (9000001, 9300005, 118,  7.9, 1781620000),
  (9000001, 9300013, 42,   3.0, 1781620000),
  (9000001, 9300013, 86,   1.0, 1781620000),
  (9000001, 9300013, 118,  7.2, 1781620000);
