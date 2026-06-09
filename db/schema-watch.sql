-- D1 schema for the watch platform (観戦プラットフォーム / P0 データ基盤)
-- 接頭辞 sm_ = SportMonks 由来データ。既存 kv テーブルとは物理的に独立し、
-- 既存ユーザー（予想/部屋/同期/config）には一切影響しない（追加のみ）。
-- 適用: wrangler d1 execute wcup2026-db --file db/schema-watch.sql
-- 参照設計: docs/superpowers/specs/2026-06-09-watch-platform-design.md §5

-- 1) チームIDマッピング（結節点）
--    SportMonks team_id ↔ アプリの3文字コード(MEX 等)。app_code は対応付け前は NULL。
CREATE TABLE IF NOT EXISTS sm_teams (
  sm_team_id INTEGER PRIMARY KEY,   -- SportMonks の team id
  app_code   TEXT,                  -- アプリ内コード(MEX/RSA…)。未マッピングは NULL
  name       TEXT NOT NULL,
  short_code TEXT,                  -- SportMonks の短縮表記
  image_url  TEXT,
  updated_at INTEGER NOT NULL
);
-- app_code 逆引き（fixtures→defaults の対戦カード突合に使用）
CREATE INDEX IF NOT EXISTS idx_sm_teams_app_code ON sm_teams (app_code);

-- 2) 試合（W杯2026 = 104件想定）
CREATE TABLE IF NOT EXISTS sm_fixtures (
  sm_fixture_id  INTEGER PRIMARY KEY,
  league_id      INTEGER,
  season_id      INTEGER,
  round_name     TEXT,                 -- "Group A" / "Round of 16" 等
  starting_at    TEXT,                 -- ISO 文字列(SportMonks 原形)
  starting_at_ts INTEGER,              -- 並べ替え用の epoch 秒
  state_id       INTEGER,              -- 1=未開始 2/3/6/9=インプレー 5/7/8=終了
  state_short    TEXT,                 -- NS/INPLAY/HT/FT 等(任意・表示補助)
  home_team_id   INTEGER,
  away_team_id   INTEGER,
  home_score     INTEGER,
  away_score     INTEGER,
  home_xg        REAL,                 -- 試合終了後 xG(type_id=5304)。実値includeは未解決→当面NULL可
  away_xg        REAL,
  venue          TEXT,
  result_info    TEXT,                 -- "Morocco won after penalties." 等の勝敗テキスト
  updated_at     INTEGER NOT NULL
);
-- ホーム日程カルーセルの時刻順 / ライブ抽出(state_id)用
CREATE INDEX IF NOT EXISTS idx_sm_fixtures_ts    ON sm_fixtures (starting_at_ts);
CREATE INDEX IF NOT EXISTS idx_sm_fixtures_state ON sm_fixtures (state_id);

-- 3) タイムライン（得点/カード/交代）
--    SportMonks の event id を PK にし、再取得時は upsert で冪等更新。
CREATE TABLE IF NOT EXISTS sm_events (
  sm_event_id         INTEGER PRIMARY KEY,
  sm_fixture_id       INTEGER NOT NULL,
  minute              INTEGER,
  extra_minute        INTEGER,
  type                TEXT,            -- goal/card/substitution 等(正規化名)
  type_id             INTEGER,         -- SportMonks 原 type_id
  team_id             INTEGER,
  player_name         TEXT,
  related_player_name TEXT,            -- アシスト/交代相手 等
  sort_order          INTEGER,         -- 表示順(minute×60+extra など)
  updated_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sm_events_fixture ON sm_events (sm_fixture_id);

-- 4) スタッツ・xG（縦持ち = 項目が増えてもスキーマ不変）
--    (fixture, team, type) で一意 → 再取得は upsert で冪等更新。
CREATE TABLE IF NOT EXISTS sm_stats (
  sm_fixture_id INTEGER NOT NULL,
  team_id       INTEGER NOT NULL,
  type_id       INTEGER NOT NULL,     -- 例: xG=5304、その他スタッツ各種
  value         REAL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (sm_fixture_id, team_id, type_id)
);
CREATE INDEX IF NOT EXISTS idx_sm_stats_fixture ON sm_stats (sm_fixture_id);

-- 5) type_id ↔ 名称マスタ（types エンドポイントの長TTLキャッシュ）
CREATE TABLE IF NOT EXISTS sm_types (
  type_id    INTEGER PRIMARY KEY,
  code       TEXT,
  name       TEXT,
  updated_at INTEGER NOT NULL
);
