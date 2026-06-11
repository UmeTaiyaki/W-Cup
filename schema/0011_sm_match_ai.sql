-- 試合ライフサイクル連動 AI分析（lineup/ht/ft をフェーズごと1行・冪等保存）
CREATE TABLE IF NOT EXISTS sm_match_ai (
  sm_fixture_id INTEGER NOT NULL,
  phase         TEXT    NOT NULL,        -- 'lineup' | 'ht' | 'ft'
  summary       TEXT,                    -- 成功まで NULL（数行サマリー本文）
  model         TEXT,                    -- 'gemini-2.5-pro'
  attempts      INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL DEFAULT 0, -- epoch秒
  PRIMARY KEY (sm_fixture_id, phase)
);
CREATE INDEX IF NOT EXISTS idx_sm_match_ai_fixture ON sm_match_ai (sm_fixture_id);
