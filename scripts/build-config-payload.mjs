// 現行 config:v1 に migrated の squads/aliases を差し替えた、KV投入用ペイロードを生成。
// 採点や予想に効く result/schedule/groups 等は現行を保持し、squads と aliases だけ更新する。
//
// 手順:
//   1) 現行configを取得: curl -s https://<本番 or preview>/api/config > scripts/data/current-config.json
//   2) このスクリプト: node scripts/build-config-payload.mjs
//      → scripts/data/config-v1-payload.json を生成
//   3) 検証(テスト/preview KV): wrangler kv key put --binding=<KV> --preview config:v1 --path scripts/data/config-v1-payload.json
//      → wrangler pages dev で名簿表示と採点を確認
//   4) 本番反映: wrangler kv key put --binding=<KV> config:v1 --path scripts/data/config-v1-payload.json
import { readFileSync, writeFileSync } from "node:fs";

const dir = "scripts/data";
let current;
try {
	current = JSON.parse(readFileSync(`${dir}/current-config.json`, "utf8"));
} catch (e) {
	console.error(
		`現行configが読めません: ${dir}/current-config.json\n先に: curl -s https://<host>/api/config > ${dir}/current-config.json`,
	);
	process.exit(1);
}
const migrated = JSON.parse(readFileSync(`${dir}/migrated.json`, "utf8"));

// squads と aliases だけ差し替え。他フィールド(result/schedule/groups/groupResult等)は現行維持。
const payload = { ...current, squads: migrated.squads, aliases: migrated.aliases };

writeFileSync(`${dir}/config-v1-payload.json`, JSON.stringify(payload));

const squadCount = Object.values(migrated.squads).reduce((n, a) => n + a.length, 0);
console.log("=== KV投入用ペイロード生成 ===");
console.log(`  squads: ${Object.keys(migrated.squads).length}か国 / ${squadCount}選手`);
console.log(`  aliases: ${migrated.aliases.length}件`);
console.log("  result/schedule/groups 等は現行configを保持");
console.log(`  出力: ${dir}/config-v1-payload.json`);
console.log("次: テスト/preview KV へ put → wrangler pages dev で検証 → 本番 KV へ put");
