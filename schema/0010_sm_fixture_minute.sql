-- 観戦プラットフォーム: 試合中の経過分表示用カラム追加
-- minute     : 進行中ピリオド(ticking)の経過分。未開始/ハーフタイム/終了時は NULL。
-- added_time : アディショナルタイム（分）。無い場合は NULL。
-- SportMonks fixture の periods include（ticking ピリオドの minutes / time_added）由来。
ALTER TABLE sm_fixtures ADD COLUMN minute INTEGER;
ALTER TABLE sm_fixtures ADD COLUMN added_time INTEGER;
