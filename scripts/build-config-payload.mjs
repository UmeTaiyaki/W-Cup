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
import { validateConfig } from "../functions/_lib/validate.js";

const dir = "scripts/data";
const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
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

// SM由来名の余分な空白を整形（wrangler kv直書きは validate.js のtrimを経由しないため自前で）。
const trimmedSquads = {};
for (const code of Object.keys(migrated.squads)) {
	trimmedSquads[code] = (migrated.squads[code] || []).map((p) => ({
		...p,
		name: clean(p.name),
	}));
}

// squads と aliases だけ差し替え。他フィールド(result/schedule/groups/groupResult等)は現行維持。
const payload = { ...current, squads: trimmedSquads, aliases: migrated.aliases };

// 直書き前に validate.js で構造検証（KVへ不正データを入れない）。
const v = validateConfig(payload);
if (!v.ok) {
	console.error(`ペイロードが validate を通りません: ${v.error}`);
	process.exit(1);
}

writeFileSync(`${dir}/config-v1-payload.json`, JSON.stringify(payload));

const squadCount = Object.values(migrated.squads).reduce((n, a) => n + a.length, 0);
console.log("=== KV投入用ペイロード生成 ===");
console.log(`  squads: ${Object.keys(migrated.squads).length}か国 / ${squadCount}選手`);
console.log(`  aliases: ${migrated.aliases.length}件`);
console.log("  result/schedule/groups 等は現行configを保持");
console.log(`  出力: ${dir}/config-v1-payload.json`);
console.log("次: テスト/preview KV へ put → wrangler pages dev で検証 → 本番 KV へ put");
