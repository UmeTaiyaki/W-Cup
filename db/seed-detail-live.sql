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

-- events（進行中＝得点1・カード1・交代1。ティッカーが追加していく）
INSERT OR REPLACE INTO sm_events
  (sm_event_id, sm_fixture_id, minute, extra_minute, type, type_id, team_id, player_name, related_player_name, player_id, related_player_id, sort_order, updated_at) VALUES
  (9300001, 9000002, 27, NULL, 'goal',         14, 9100001, 'Kaoru Mitoma',   NULL,             9410008, NULL,    1620, 1781000000),
  (9300002, 9000002, 41, NULL, 'yellowcard',   19, 9100002, 'Joshua Kimmich', NULL,             9420002, NULL,    2460, 1781000000),
  (9300003, 9000002, 67, NULL, 'substitution', 18, 9100001, 'Ueda',           'Takuma Asano',   9410013, 9410011, 4020, 1781000000);

-- team stats（途中経過）
INSERT OR REPLACE INTO sm_stats (sm_fixture_id, team_id, type_id, value, updated_at) VALUES
  (9000002, 9100001, 45, 55, 1781000000), (9000002, 9100002, 45, 45, 1781000000),
  (9000002, 9100001, 42, 6,  1781000000), (9000002, 9100002, 42, 4,  1781000000),
  (9000002, 9100001, 86, 3,  1781000000), (9000002, 9100002, 86, 1,  1781000000),
  (9000002, 9100001, 34, 2,  1781000000), (9000002, 9100002, 34, 3,  1781000000),
  (9000002, 9100001, 56, 5,  1781000000), (9000002, 9100002, 56, 7,  1781000000);

-- lineups（先発11＋控え・per-player xG）
-- formation_field = "row:col"。row 1=GK→数字が大きいほど前線。col はそのライン内の連番(1..N)。
-- home(JPN) 4-2-3-1（5段）/ away(GER) 4-3-3（4段）。position 24=GK/25=DF/26=MF/27=FW。
INSERT OR REPLACE INTO sm_lineups
  (sm_fixture_id, team_id, player_id, player_name, jersey_number, position, formation_field, is_start, xg, date_of_birth, height, weight, nationality_id, nationality_name, detailed_position, club_name, club_image, updated_at) VALUES
  -- JPN 先発11（4-2-3-1: GK / DF4 / DM2 / AM3 / FW1）
  (9000002, 9100001, 9410001, 'Gonda',        12,'24', '1:1', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100001, 9410002, 'Sakai',         5, '25', '2:1', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100001, 9410003, 'Itakura',       3, '25', '2:2', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100001, 9410004, 'Yoshida',       4, '25', '2:3', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100001, 9410005, 'Nagatomo',      2, '25', '2:4', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100001, 9410006, 'Wataru Endo',   6, '26', '3:1', 1, 0.10, '1993-02-09', 178, 76, 392, 'Japan', 'Defensive Midfield', 'Liverpool',       NULL, 1781000000),
  (9000002, 9100001, 9410007, 'Morita',       13, '26', '3:2', 1, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100001, 9410008, 'Kaoru Mitoma', 14, '26', '4:1', 1, 0.58, '1997-05-20', 178, 73, 392, 'Japan', 'Left Winger',        'Brighton',        NULL, 1781000000),
  (9000002, 9100001, 9410009, 'Kamada',        8, '26', '4:2', 1, 0.22, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100001, 9410010, 'Ritsu Doan',    9, '26', '4:3', 1, 0.31, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100001, 9410011, 'Takuma Asano', 15, '27', '5:1', 1, 0.24, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  -- JPN 控え3（formation_field NULL = ベンチ）
  (9000002, 9100001, 9410012, 'Ito',          16, '26', NULL,  0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100001, 9410013, 'Ueda',         20, '27', NULL,  0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100001, 9410014, 'Tomiyasu',     19, '25', NULL,  0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  -- GER 先発11（4-3-3: GK / DF4 / MF3 / FW3）
  (9000002, 9100002, 9420001, 'Neuer',         1, '24', '1:1', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100002, 9420002, 'Kimmich',       6, '25', '2:1', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100002, 9420003, 'Ruediger',      2, '25', '2:2', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100002, 9420004, 'Tah',           4, '25', '2:3', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100002, 9420005, 'Raum',         22, '25', '2:4', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100002, 9420006, 'Andrich',      23, '26', '3:1', 1, 0.07, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100002, 9420007, 'Goretzka',      8, '26', '3:2', 1, 0.18, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100002, 9420008, 'Musiala',      10, '26', '3:3', 1, 0.29, '2003-02-26', 184, 72,  11, 'Germany', 'Attacking Midfield', 'Bayern München', NULL, 1781000000),
  (9000002, 9100002, 9420009, 'Sane',         19, '27', '4:1', 1, 0.41, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100002, 9420010, 'Havertz',       7, '27', '4:2', 1, 0.36, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100002, 9420011, 'Wirtz',        17, '27', '4:3', 1, 0.27, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  -- GER 控え2
  (9000002, 9100002, 9420012, 'Fuellkrug',     9, '27', NULL,  0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000),
  (9000002, 9100002, 9420013, 'Gundogan',     21, '26', NULL,  0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1781000000);

-- player stats（数名・type_id 42=shots / 86=on-target / 118=rating）
INSERT OR REPLACE INTO sm_player_stats (sm_fixture_id, player_id, type_id, value, updated_at) VALUES
  (9000002, 9410008, 42, 4, 1781000000), (9000002, 9410008, 86, 2, 1781000000), (9000002, 9410008, 118, 7.8, 1781000000),
  (9000002, 9410010, 42, 2, 1781000000), (9000002, 9410010, 86, 1, 1781000000),
  (9000002, 9420008, 42, 3, 1781000000), (9000002, 9420008, 86, 1, 1781000000), (9000002, 9420008, 118, 6.9, 1781000000);
