-- 既存 D1 に列を追加するワンショット migration（local/prod）。
-- SQLite/D1 は ADD COLUMN IF NOT EXISTS 非対応。各 ALTER は独立実行され、
-- 既存列に当たると D1 はその時点で停止する（＝部分適用の恐れ）。
-- 一度だけ適用すること。再実行が必要なら PRAGMA table_info で現状を確認し、
-- 未適用の列だけを個別に流す。
ALTER TABLE sm_lineups ADD COLUMN date_of_birth TEXT;
ALTER TABLE sm_lineups ADD COLUMN height INTEGER;
ALTER TABLE sm_lineups ADD COLUMN weight INTEGER;
ALTER TABLE sm_lineups ADD COLUMN nationality_id INTEGER;
ALTER TABLE sm_lineups ADD COLUMN nationality_name TEXT;
ALTER TABLE sm_lineups ADD COLUMN detailed_position TEXT;
ALTER TABLE sm_lineups ADD COLUMN club_name TEXT;
ALTER TABLE sm_lineups ADD COLUMN club_image TEXT;
ALTER TABLE sm_events ADD COLUMN player_id INTEGER;
ALTER TABLE sm_events ADD COLUMN related_player_id INTEGER;
