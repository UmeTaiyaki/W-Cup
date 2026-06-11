// migrated payload から defaults.js 用のデータモジュール(squads.js / scorer-aliases.js)を生成。
// 正本(DEFAULT_CONFIG)をAPI表記へ更新するための一回限りのジェネレータ。
import { readFileSync, writeFileSync } from "node:fs";

const p = JSON.parse(readFileSync("scripts/data/config-v1-payload.json", "utf8"));

const squadsJs =
	"// 選手名簿（SportMonks API表記）。scripts/gen-defaults-data.mjs で生成。\n" +
	"// 旧背番号表記からの移行は scripts/squad-migrate.mjs + scorer-alias を参照。\n" +
	`export const SQUADS = ${JSON.stringify(p.squads, null, "\t")};\n`;
writeFileSync("functions/_lib/squads.js", squadsJs);

const aliasesJs =
	"// 得点王エイリアス（旧表記→canonical 橋渡し）。scripts/gen-defaults-data.mjs で生成。\n" +
	`export const SCORER_ALIASES = ${JSON.stringify(p.aliases, null, "\t")};\n`;
writeFileSync("functions/_lib/scorer-aliases.js", aliasesJs);

const n = Object.values(p.squads).reduce((a, l) => a + l.length, 0);
console.log(`squads.js: ${Object.keys(p.squads).length}か国/${n}選手`);
console.log(`scorer-aliases.js: ${p.aliases.length}件`);
