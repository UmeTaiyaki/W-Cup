-- 既存 D1 に PK戦スコア列を追加するワンショット migration（local/prod）。
-- KO戦のPK決着で勝者を確実に判定/表示するため（CURRENT は延長までで同点になる）。
-- SQLite/D1 は ADD COLUMN IF NOT EXISTS 非対応。一度だけ適用すること。
ALTER TABLE sm_fixtures ADD COLUMN home_pen INTEGER;
ALTER TABLE sm_fixtures ADD COLUMN away_pen INTEGER;
