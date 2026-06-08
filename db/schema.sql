-- 永続データ（user/room/config）の D1 スキーマ。
-- KV のキー空間をそのまま単一テーブルに写す。JSON はパースせず v に丸ごと格納（KV と同形）。
-- updated_at は doc.updatedAt のミラーで、d1-store.js の update() の compare-and-swap に使う。
CREATE TABLE IF NOT EXISTS kv (
  k          TEXT PRIMARY KEY,
  v          TEXT NOT NULL,
  updated_at TEXT
);
