-- 既存 D1 に sm_lineups.player_image 列を追加するワンショット migration（local/prod）。
-- SQLite/D1 は ADD COLUMN IF NOT EXISTS 非対応。既に列が存在する場合は失敗するので
-- 一度だけ適用すること（PRAGMA table_info(sm_lineups) で未適用を確認してから流す）。
-- 顔写真URL（SportMonks lineups.player.image_path）をスタメン図で表示するため。
ALTER TABLE sm_lineups ADD COLUMN player_image TEXT;
