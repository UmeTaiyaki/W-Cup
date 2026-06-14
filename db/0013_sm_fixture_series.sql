-- 0013: 試合時系列(モメンタム/フロー)用テーブル。本番/テストD1へ手動適用。
CREATE TABLE IF NOT EXISTS sm_fixture_series (
  sm_fixture_id INTEGER PRIMARY KEY,
  series_json   TEXT NOT NULL,
  updated_at    INTEGER NOT NULL
);
