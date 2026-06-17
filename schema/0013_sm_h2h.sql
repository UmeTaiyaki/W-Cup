-- 試合前カード H2H（過去対戦 通算W-D-L）。worker-watch の daily Cron が upsert、
-- /api/h2h が read。home_code/away_code は sm_teams.app_code（向き判定用）。
CREATE TABLE IF NOT EXISTS sm_h2h (
  fixture_id  INTEGER PRIMARY KEY,
  home_code   TEXT,
  away_code   TEXT,
  home_wins   INTEGER NOT NULL DEFAULT 0,
  draws       INTEGER NOT NULL DEFAULT 0,
  away_wins   INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT
);
