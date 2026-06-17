-- 0014: PMSR(FIFA公式 Post-Match Summary Report)の抽出データ。本番/テストD1へ手動適用。
-- 1試合=1行。数値スタッツと図表マニフェストをJSON blobで保持（D1書込みは試合確定時の1回のみ＝極小）。
-- 生成は scripts/pmsr のインジェスト（Chrome+pdf.js）。Worker側は配信のみ。
CREATE TABLE IF NOT EXISTS sm_pmsr (
  sm_fixture_id INTEGER PRIMARY KEY,
  match_no      INTEGER,                 -- FIFA公式のMatch番号（参照用）
  data_json     TEXT NOT NULL,           -- { header, possession, keyStats, phasesInPossession, phasesOutOfPossession }
  figures_json  TEXT NOT NULL,           -- [ { key, ja, side, url } ]  url=配信Functionの相対パス
  pdf_url       TEXT,                    -- 公式PDFの絶対URL（出典リンク）
  updated_at    INTEGER NOT NULL DEFAULT 0  -- epoch秒
);
