-- チームIDマッピング seed（観戦プラットフォーム P0）
-- アプリの3文字コード(FIFA) ↔ SportMonks team_id の対応。英語名で1対1照合して確定(2026-06-09)。
-- 適用順序: schema-watch.sql → season backfill(sm_teams投入) → 本 seed で app_code を付与。
-- ノックアウトのプレースホルダ枠(Winners Group A 等)は実チームでないため app_code=NULL のまま。
-- コード体系差(アプリFIFA vs SportMonks ISO)で短縮形が異なるのは4件のみ:
--   ALG↔DZA(Algeria) / HAI↔HTI(Haiti) / PAR↔PRY(Paraguay) / RSA↔ZAF(South Africa)
-- 残り44件は短縮形も一致。再適用しても安全(冪等な UPDATE)。

UPDATE sm_teams SET app_code='MEX' WHERE sm_team_id=18576; -- Mexico
UPDATE sm_teams SET app_code='KOR' WHERE sm_team_id=18567; -- Korea Republic
UPDATE sm_teams SET app_code='RSA' WHERE sm_team_id=18555; -- South Africa (ZAF)
UPDATE sm_teams SET app_code='CZE' WHERE sm_team_id=18718; -- Czech Republic
UPDATE sm_teams SET app_code='CAN' WHERE sm_team_id=18572; -- Canada
UPDATE sm_teams SET app_code='SUI' WHERE sm_team_id=18708; -- Switzerland
UPDATE sm_teams SET app_code='QAT' WHERE sm_team_id=18544; -- Qatar
UPDATE sm_teams SET app_code='BIH' WHERE sm_team_id=18625; -- Bosnia and Herzegovina
UPDATE sm_teams SET app_code='BRA' WHERE sm_team_id=18704; -- Brazil
UPDATE sm_teams SET app_code='MAR' WHERE sm_team_id=18551; -- Morocco
UPDATE sm_teams SET app_code='SCO' WHERE sm_team_id=18706; -- Scotland
UPDATE sm_teams SET app_code='HAI' WHERE sm_team_id=18804; -- Haiti (HTI)
UPDATE sm_teams SET app_code='USA' WHERE sm_team_id=18571; -- United States
UPDATE sm_teams SET app_code='AUS' WHERE sm_team_id=18730; -- Australia
UPDATE sm_teams SET app_code='PAR' WHERE sm_team_id=18723; -- Paraguay (PRY)
UPDATE sm_teams SET app_code='TUR' WHERE sm_team_id=18716; -- Türkiye
UPDATE sm_teams SET app_code='GER' WHERE sm_team_id=18660; -- Germany
UPDATE sm_teams SET app_code='ECU' WHERE sm_team_id=18573; -- Ecuador
UPDATE sm_teams SET app_code='CIV' WHERE sm_team_id=18560; -- Côte d'Ivoire
UPDATE sm_teams SET app_code='CUW' WHERE sm_team_id=18910; -- Curacao
UPDATE sm_teams SET app_code='NED' WHERE sm_team_id=18694; -- Netherlands
UPDATE sm_teams SET app_code='JPN' WHERE sm_team_id=18597; -- Japan
UPDATE sm_teams SET app_code='TUN' WHERE sm_team_id=18554; -- Tunisia
UPDATE sm_teams SET app_code='SWE' WHERE sm_team_id=18564; -- Sweden
UPDATE sm_teams SET app_code='BEL' WHERE sm_team_id=18743; -- Belgium
UPDATE sm_teams SET app_code='IRN' WHERE sm_team_id=18652; -- Iran
UPDATE sm_teams SET app_code='EGY' WHERE sm_team_id=18546; -- Egypt
UPDATE sm_teams SET app_code='NZL' WHERE sm_team_id=18613; -- New Zealand
UPDATE sm_teams SET app_code='ESP' WHERE sm_team_id=18710; -- Spain
UPDATE sm_teams SET app_code='URU' WHERE sm_team_id=15251; -- Uruguay
UPDATE sm_teams SET app_code='KSA' WHERE sm_team_id=18562; -- Saudi Arabia
UPDATE sm_teams SET app_code='CPV' WHERE sm_team_id=18823; -- Cape Verde Islands
UPDATE sm_teams SET app_code='FRA' WHERE sm_team_id=18647; -- France
UPDATE sm_teams SET app_code='SEN' WHERE sm_team_id=18558; -- Senegal
UPDATE sm_teams SET app_code='NOR' WHERE sm_team_id=18578; -- Norway
UPDATE sm_teams SET app_code='IRQ' WHERE sm_team_id=18600; -- Iraq
UPDATE sm_teams SET app_code='ARG' WHERE sm_team_id=18644; -- Argentina
UPDATE sm_teams SET app_code='AUT' WHERE sm_team_id=18643; -- Austria
UPDATE sm_teams SET app_code='ALG' WHERE sm_team_id=18620; -- Algeria (DZA)
UPDATE sm_teams SET app_code='JOR' WHERE sm_team_id=18559; -- Jordan
UPDATE sm_teams SET app_code='POR' WHERE sm_team_id=18701; -- Portugal
UPDATE sm_teams SET app_code='COL' WHERE sm_team_id=18720; -- Colombia
UPDATE sm_teams SET app_code='UZB' WHERE sm_team_id=18745; -- Uzbekistan
UPDATE sm_teams SET app_code='COD' WHERE sm_team_id=18552; -- Congo DR
UPDATE sm_teams SET app_code='ENG' WHERE sm_team_id=18645; -- England
UPDATE sm_teams SET app_code='CRO' WHERE sm_team_id=18588; -- Croatia
UPDATE sm_teams SET app_code='PAN' WHERE sm_team_id=18717; -- Panama
UPDATE sm_teams SET app_code='GHA' WHERE sm_team_id=18553; -- Ghana
