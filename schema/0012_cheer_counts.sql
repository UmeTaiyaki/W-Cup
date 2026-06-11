-- 試合前 ご当地応援バトルの集計テーブル。
-- ユーザー生成データ（SportMonks由来ではない）。watch cron は触らない。
-- 個票は持たず、fixture×side の累計のみ。試合前のみ加算（API側で開始済みを拒否）。
CREATE TABLE IF NOT EXISTS cheer_counts (
  fixture_id INTEGER NOT NULL,
  side       TEXT    NOT NULL CHECK (side IN ('home','away')),
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (fixture_id, side)
);
