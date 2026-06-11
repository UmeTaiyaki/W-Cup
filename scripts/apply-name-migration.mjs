// 照合確定後の適用ステップ。名簿をAPI表記へ改名し、綴りが変わった選手のエイリアスを自動生成する。
// 予想/正解データは不変。出力 squads/aliases を管理画面 or config PUT で取り込む。
//
// 使い方:
//   node scripts/apply-name-migration.mjs                         # defaults.js の squads を対象
//   node scripts/apply-name-migration.mjs --config dump.json      # /api/config のダンプを対象(squads/aliases を引き継ぐ)
//   node scripts/apply-name-migration.mjs --mapping path.json     # 既定: scripts/data/name-mapping.proposed.json
// 出力: scripts/data/migrated.json = { squads, aliases, report }
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG } from "../functions/_lib/defaults.js";
import { migrateSquads } from "./squad-migrate.mjs";

function arg(name, fallback) {
	const i = process.argv.indexOf(name);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function main() {
	const configPath = arg("--config", null);
	const mappingPath = arg("--mapping", "scripts/data/name-mapping.proposed.json");

	let squads = DEFAULT_CONFIG.squads;
	let baseAliases = DEFAULT_CONFIG.aliases || [];
	if (configPath) {
		const cfg = JSON.parse(readFileSync(configPath, "utf8"));
		squads = cfg.squads && typeof cfg.squads === "object" ? cfg.squads : squads;
		baseAliases = Array.isArray(cfg.aliases) ? cfg.aliases : [];
	}

	let mapping;
	try {
		mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
	} catch (e) {
		console.error(
			`マッピングが読めません: ${mappingPath}\n先に fetch-sm-squads → propose-name-mapping を実行し、低信頼/未マッチを手動修正してください。`,
		);
		process.exit(1);
	}

	const { squads: nextSquads, aliases, report } = migrateSquads(
		squads,
		mapping,
		baseAliases,
	);

	mkdirSync("scripts/data", { recursive: true });
	writeFileSync(
		"scripts/data/migrated.json",
		JSON.stringify({ squads: nextSquads, aliases }, null, 2),
	);

	console.log("=== 適用結果 ===");
	console.log(`改名: ${report.renamed}  エイリアス生成: ${report.aliased}  アクセントのみ(不要): ${report.accentOnly}  対象外: ${report.unchanged}`);
	console.log(`エイリアス総数: ${aliases.length}`);
	console.log("出力: scripts/data/migrated.json （squads/aliases を管理画面 or config PUT で取り込み）");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
