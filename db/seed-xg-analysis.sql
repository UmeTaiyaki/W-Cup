-- dev専用: xG分析画面の検証用 FT試合（本番投入しない）
-- Brazil(home) 2-1 Morocco(away)。base xG + xGoT(5305) + shots(42)/枠内(86) + 選手xG。
DELETE FROM sm_stats   WHERE sm_fixture_id = 9100001;
DELETE FROM sm_lineups WHERE sm_fixture_id = 9100001;
DELETE FROM sm_fixtures WHERE sm_fixture_id = 9100001;

INSERT OR REPLACE INTO sm_fixtures
  (sm_fixture_id, starting_at, starting_at_ts, state_id, round_name, result_info,
   home_team_id, home_score, home_xg, away_team_id, away_score, away_xg, updated_at)
VALUES
  (9100001, '2026-06-20 19:00:00', 1782370800, 5, 'Group F', 'Brazil won',
   3, 2, 2.34, 7, 1, 0.88, 1782370800);   -- state_id=5 → FT

INSERT OR REPLACE INTO sm_stats (sm_fixture_id, team_id, type_id, value, updated_at) VALUES
  (9100001, 3, 42, 15, 1782370800), (9100001, 7, 42, 8, 1782370800),     -- シュート
  (9100001, 3, 86, 7, 1782370800),  (9100001, 7, 86, 3, 1782370800),     -- 枠内
  (9100001, 3, 5305, 1.95, 1782370800), (9100001, 7, 5305, 0.62, 1782370800), -- xGoT
  (9100001, 3, 45, 58, 1782370800), (9100001, 7, 45, 42, 1782370800);    -- 支配率

INSERT OR REPLACE INTO sm_lineups
  (sm_fixture_id, team_id, player_id, player_name, jersey_number, position, formation_field, is_start, xg, updated_at)
VALUES
  (9100001, 3, 101, 'Vinícius Jr', 7, 'attacker', '4:1', 1, 0.71, 1782370800),
  (9100001, 3, 102, 'Rodrygo',     10, 'attacker', '4:2', 1, 0.54, 1782370800),
  (9100001, 7, 201, 'En-Nesyri',   19, 'attacker', '4:1', 1, 0.40, 1782370800);
