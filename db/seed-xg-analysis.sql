-- dev専用: xG分析画面の検証用 FT試合（本番投入しない）
-- Brazil(home) 2-1 Morocco(away)。base xG + xGoT(5305) + shots(42)/枠内(86) + 選手xG
-- + npxG(7943)/内訳(7945/7942/7941/7940)/xPTS(7939)/被xG(9687) + 選手別xGoT(sm_player_stats) + 時系列(sm_fixture_series)。
DELETE FROM sm_stats        WHERE sm_fixture_id = 9100001;
DELETE FROM sm_lineups      WHERE sm_fixture_id = 9100001;
DELETE FROM sm_player_stats WHERE sm_fixture_id = 9100001;
DELETE FROM sm_fixture_series WHERE sm_fixture_id = 9100001;
DELETE FROM sm_fixtures     WHERE sm_fixture_id = 9100001;

INSERT OR REPLACE INTO sm_fixtures
  (sm_fixture_id, starting_at, starting_at_ts, state_id, round_name, result_info,
   home_team_id, home_score, home_xg, away_team_id, away_score, away_xg, updated_at)
VALUES
  (9100001, '2026-06-20 19:00:00', 1782370800, 5, 'Group F', 'Brazil won',
   3, 2, 2.34, 7, 1, 0.88, 1782370800);   -- state_id=5 → FT

INSERT OR REPLACE INTO sm_stats (sm_fixture_id, team_id, type_id, value, updated_at) VALUES
  (9100001, 3, 42, 15, 1782370800), (9100001, 7, 42, 8, 1782370800),       -- シュート
  (9100001, 3, 86, 7, 1782370800),  (9100001, 7, 86, 3, 1782370800),       -- 枠内
  (9100001, 3, 45, 58, 1782370800), (9100001, 7, 45, 42, 1782370800),      -- 支配率
  (9100001, 3, 5305, 1.95, 1782370800), (9100001, 7, 5305, 0.62, 1782370800), -- xGoT
  (9100001, 3, 9687, 0.88, 1782370800), (9100001, 7, 9687, 2.34, 1782370800), -- 被xG(=相手xG)
  (9100001, 3, 7943, 2.10, 1782370800), (9100001, 7, 7943, 0.88, 1782370800), -- npxG
  (9100001, 3, 7939, 2.40, 1782370800), (9100001, 7, 7939, 0.50, 1782370800), -- xPTS
  (9100001, 3, 7945, 1.80, 1782370800), (9100001, 7, 7945, 0.70, 1782370800), -- オープンプレー
  (9100001, 3, 7942, 0.30, 1782370800), (9100001, 7, 7942, 0.18, 1782370800), -- CK
  (9100001, 3, 7941, 0.15, 1782370800),                                       -- FK
  (9100001, 3, 7940, 0.24, 1782370800);                                       -- PK

INSERT OR REPLACE INTO sm_lineups
  (sm_fixture_id, team_id, player_id, player_name, jersey_number, position, formation_field, is_start, xg, updated_at)
VALUES
  (9100001, 3, 101, 'Vinícius Jr', 7, 'attacker', '4:1', 1, 0.71, 1782370800),
  (9100001, 3, 102, 'Rodrygo',     10, 'attacker', '4:2', 1, 0.54, 1782370800),
  (9100001, 7, 201, 'En-Nesyri',   19, 'attacker', '4:1', 1, 0.40, 1782370800);

-- 選手別xGoT(5305)。Task14 の細バーは sm_player_stats を読む（sm_lineups.xg とは別経路）。
INSERT OR REPLACE INTO sm_player_stats (sm_fixture_id, player_id, type_id, value, updated_at) VALUES
  (9100001, 101, 5305, 0.58, 1782370800),
  (9100001, 102, 5305, 0.41, 1782370800),
  (9100001, 201, 5305, 0.30, 1782370800);

-- 時系列(モメンタム/フロー)。pressure と flow(shots/possession/attacks) を home/away で。
INSERT OR REPLACE INTO sm_fixture_series (sm_fixture_id, series_json, updated_at) VALUES
  (9100001,
   '{"pressure":[{"minute":10,"home":35,"away":18},{"minute":25,"home":52,"away":12},{"minute":45,"home":28,"away":30},{"minute":65,"home":60,"away":15},{"minute":85,"home":48,"away":22}],"flow":{"shots":[{"minute":15,"home":4,"away":1},{"minute":45,"home":8,"away":4},{"minute":90,"home":15,"away":8}],"possession":[{"minute":15,"home":61,"away":39},{"minute":45,"home":57,"away":43},{"minute":90,"home":58,"away":42}],"attacks":[{"minute":15,"home":22,"away":9},{"minute":45,"home":55,"away":30},{"minute":90,"home":98,"away":51}]}}',
   1782370800);
