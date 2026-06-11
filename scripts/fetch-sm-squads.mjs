/**
 * fetch-sm-squads.mjs
 *
 * 概要:
 *   db/seed-team-map.sql からアプリの3文字コード↔SportMonks team_id マッピングを読み取り、
 *   SportMonks API から48カ国分の代表スクワッドを取得して scripts/data/sm-squads.json に保存する。
 *   取得したデータは propose-name-mapping.mjs の照合ステップで使用する。
 *
 * 必要環境変数:
 *   SPORTMONKS_TOKEN  — SportMonks の API トークン（必須）
 *
 * 実行方法:
 *   SPORTMONKS_TOKEN=xxx node scripts/fetch-sm-squads.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── 環境変数チェック ────────────────────────────────────────
const TOKEN = process.env.SPORTMONKS_TOKEN;
if (!TOKEN) {
  process.stderr.write(
    "エラー: 環境変数 SPORTMONKS_TOKEN が設定されていません。\n" +
      "実行方法: SPORTMONKS_TOKEN=xxx node scripts/fetch-sm-squads.mjs\n",
  );
  process.exit(1);
}

// ── seed-team-map.sql パース ────────────────────────────────
/**
 * SQL ファイルを読み込み、app_code が3文字の場合のみ { appCode, teamId } を返す。
 * app_code=NULL の行はスキップ。
 * 対象行パターン: UPDATE sm_teams SET app_code='XXX' WHERE sm_team_id=NNNNN;
 */
function parseTeamMap(sqlPath) {
  const sql = fs.readFileSync(sqlPath, "utf8");
  const re =
    /UPDATE\s+sm_teams\s+SET\s+app_code='([A-Za-z]{3})'\s+WHERE\s+sm_team_id=(\d+)/g;
  const teams = [];
  let m;
  while ((m = re.exec(sql)) !== null) {
    teams.push({ appCode: m[1].toUpperCase(), teamId: Number(m[2]) });
  }
  return teams;
}

// ── ユーティリティ ──────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── SportMonks スクワッド取得 ───────────────────────────────
/**
 * 1チーム分のスクワッドを取得し、プレイヤー配列を返す。
 * @param {number} teamId
 * @returns {Promise<Array<{player_id, jersey, name, pos}>>}
 */
async function fetchSquad(teamId) {
  const url = `https://api.sportmonks.com/v3/football/squads/teams/${teamId}?include=player&api_token=${TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const data = Array.isArray(json.data) ? json.data : [];

  return data
    .map((record) => {
      const player = record.player;
      if (!player) return null;
      const name = player.display_name || player.name;
      if (!name) return null;
      return {
        player_id: record.player_id ?? null,
        jersey: record.jersey_number ?? null,
        name,
        pos: record.position_id ?? null,
      };
    })
    .filter(Boolean);
}

// ── メイン処理 ─────────────────────────────────────────────
async function main() {
  const sqlPath = path.join(ROOT, "db", "seed-team-map.sql");
  const teams = parseTeamMap(sqlPath);

  if (teams.length === 0) {
    process.stderr.write(
      "エラー: seed-team-map.sql からチームマッピングを読み取れませんでした。\n",
    );
    process.exit(1);
  }

  process.stdout.write(`${teams.length} チームの取得を開始します...\n\n`);

  const result = {};
  let totalPlayers = 0;

  for (const { appCode, teamId } of teams) {
    try {
      const players = await fetchSquad(teamId);
      result[appCode] = players;
      totalPlayers += players.length;
      process.stdout.write(`${appCode}: ${players.length} 選手\n`);
    } catch (err) {
      process.stderr.write(
        `警告: ${appCode} (team_id=${teamId}) の取得に失敗しました: ${err.message}\n`,
      );
      result[appCode] = [];
    }

    // API への負荷を軽減するため 250ms 待機
    await sleep(250);
  }

  // ── 出力先ディレクトリ作成 ────────────────────────────────
  const dataDir = path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outPath = path.join(dataDir, "sm-squads.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

  process.stdout.write(
    `\n合計: ${totalPlayers} 選手 (${teams.length} チーム)\n` +
      `出力: ${outPath}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`致命的エラー: ${err.message}\n`);
  process.exit(1);
});
