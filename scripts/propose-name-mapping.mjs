/**
 * propose-name-mapping.mjs
 *
 * 概要:
 *   現在の名簿（functions/_lib/defaults.js の DEFAULT_CONFIG.squads）と
 *   SportMonks API から取得したスクワッド（scripts/data/sm-squads.json）を照合し、
 *   { CODE: { 旧名: 新名 } } 形式のマッピング案を scripts/data/name-mapping.proposed.json に出力する。
 *   低信頼度・未マッチの選手はレビューリストとして stdout に表示する。
 *   出力 JSON を人間が確認・修正した後、scripts/squad-migrate.mjs に渡して適用する。
 *
 * 前提:
 *   scripts/fetch-sm-squads.mjs を先に実行して scripts/data/sm-squads.json を生成すること。
 *
 * 実行方法:
 *   node scripts/propose-name-mapping.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalize } from "../public/lib/scoring.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── 純粋照合ロジック（エクスポート / ユニットテスト対象）───────────

/**
 * 旧ジャージ名（oldName）を SportMonks スクワッド配列と照合する。
 *
 * - HIGH: normalize(p.name) がトークンとして oldName の normalize 形を含む選手が
 *         ちょうど1名 → { newName: p.name, confidence: "high" }
 * - LOW : 上記が複数名 → 先頭を返しつつ confidence: "low"
 * - null: 1名も合致しない
 *
 * @param {string} oldName - 旧名簿上の選手名（例 "MBAPPE", "VINI JR."）
 * @param {Array<{name: string, jersey?: number|null, player_id?: number|null, pos?: number|null}>} smPlayers
 * @returns {{ newName: string, confidence: "high" | "low" } | null}
 */
export function matchPlayer(oldName, smPlayers) {
  const o = normalize(oldName); // 例: "MBAPPE", "VINI JR"

  const matches = smPlayers.filter((p) => {
    const s = normalize(p.name); // 例: "KYLIAN MBAPPE"
    // トークンマッチ: s を空白分割したトークン群に o が完全一致するか、
    // または s === o（単語そのものが一致）
    if (s === o) return true;
    const tokens = s.split(" ");
    return tokens.includes(o);
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) {
    return { newName: matches[0].name, confidence: "high" };
  }
  // 複数マッチ → ambiguous
  return { newName: matches[0].name, confidence: "low" };
}

/**
 * 全チームの旧名簿と SportMonks スクワッドを照合してマッピング案とレビュー情報を返す。
 *
 * @param {{ [code: string]: Array<{name: string, pos?: string, club?: string}> }} squads
 *   旧名簿（DEFAULT_CONFIG.squads と同形）
 * @param {{ [code: string]: Array<{name: string, jersey?: number|null, player_id?: number|null}> }} smSquads
 *   SportMonks から取得したスクワッド（sm-squads.json と同形）
 * @returns {{
 *   mapping: { [code: string]: { [oldName: string]: string } },
 *   review: {
 *     high: number,
 *     low: Array<{code: string, oldName: string, candidate: string}>,
 *     unmatched: Array<{code: string, oldName: string}>
 *   }
 * }}
 */
export function proposeMapping(squads, smSquads) {
  const mapping = {};
  const review = { high: 0, low: [], unmatched: [] };

  for (const code of Object.keys(squads)) {
    const players = squads[code] || [];
    const smPlayers = smSquads[code] || [];
    const codeMapping = {};

    for (const player of players) {
      if (!player || !player.name) continue;
      const oldName = player.name;

      const hit = matchPlayer(oldName, smPlayers);

      if (hit === null) {
        review.unmatched.push({ code, oldName });
        continue;
      }

      if (hit.confidence === "low") {
        review.low.push({ code, oldName, candidate: hit.newName });
        continue;
      }

      // high confidence
      // newName が oldName と完全一致 → ノイズになるためスキップ
      if (hit.newName === oldName) continue;

      codeMapping[oldName] = hit.newName;
      review.high++;
    }

    mapping[code] = codeMapping;
  }

  return { mapping, review };
}

// ── CLI エントリポイント ────────────────────────────────────
async function main() {
  // defaults.js から現在の名簿を読み込む
  const defaultsPath = path.join(ROOT, "functions", "_lib", "defaults.js");
  const { DEFAULT_CONFIG } = await import(defaultsPath);
  const squads = DEFAULT_CONFIG.squads || {};

  // sm-squads.json を読み込む
  const smSquadsPath = path.join(__dirname, "data", "sm-squads.json");
  if (!fs.existsSync(smSquadsPath)) {
    process.stderr.write(
      "エラー: scripts/data/sm-squads.json が見つかりません。\n" +
        "先に以下を実行してください:\n" +
        "  SPORTMONKS_TOKEN=xxx node scripts/fetch-sm-squads.mjs\n",
    );
    process.exit(1);
  }

  const smSquads = JSON.parse(fs.readFileSync(smSquadsPath, "utf8"));

  // 照合実行
  const { mapping, review } = proposeMapping(squads, smSquads);

  // 出力先ディレクトリ確保
  const dataDir = path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // マッピング案を JSON に書き出す
  const outPath = path.join(dataDir, "name-mapping.proposed.json");
  fs.writeFileSync(outPath, JSON.stringify(mapping, null, 2), "utf8");

  // レビューサマリーを stdout に表示
  process.stdout.write("=== 照合結果サマリー ===\n\n");
  process.stdout.write(`高信頼度マッチ (自動マッピング): ${review.high} 件\n`);
  process.stdout.write(
    `低信頼度マッチ (要確認):         ${review.low.length} 件\n`,
  );
  process.stdout.write(
    `未マッチ (要手動対応):            ${review.unmatched.length} 件\n\n`,
  );

  if (review.low.length > 0) {
    process.stdout.write(
      "【要確認】低信頼度マッチ（同姓の選手が複数いるため曖昧）:\n",
    );
    for (const { code, oldName, candidate } of review.low) {
      process.stdout.write(`  ${code}  ${oldName}  →  候補: ${candidate}\n`);
    }
    process.stdout.write("\n");
  }

  if (review.unmatched.length > 0) {
    process.stdout.write(
      "【要手動対応】未マッチ（SportMonks スクワッドに見つからなかった選手）:\n",
    );
    for (const { code, oldName } of review.unmatched) {
      process.stdout.write(`  ${code}  ${oldName}\n`);
    }
    process.stdout.write("\n");
  }

  process.stdout.write(
    "低信頼度・未マッチの選手は、出力ファイルを手動で編集してから適用してください。\n",
  );
  process.stdout.write(`出力: ${outPath}\n`);
}

// import.meta.url を使ってメインスクリプトとして実行された場合のみ main() を呼ぶ
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main().catch((err) => {
    process.stderr.write(`致命的エラー: ${err.message}\n`);
    process.exit(1);
  });
}
