// PMSR publish フェーズ: ingest が生成した dist/ を R2(図表PNG) と D1(sm_pmsr) へ反映する。
// wrangler CLI を使うため、認証済み環境（CI: CLOUDFLARE_API_TOKEN / ローカル: wrangler login）で実行。
//
// 使い方:
//   node scripts/pmsr/publish.mjs --local            # ローカルD1/R2へ（検証用）
//   node scripts/pmsr/publish.mjs --remote           # 本番D1/R2へ
//   node scripts/pmsr/publish.mjs --remote --fixture 19427455
//
// 冪等: sm_pmsr は ON CONFLICT で上書き。図表は同キーに put（上書き）。

import { readdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../..");
const DIST = join(__dir, "dist");
const DB = "wcup2026-db";
const BUCKET = "wcup2026-pmsr";

function parseArgs(argv) {
	const a = { remote: false };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--remote") a.remote = true;
		else if (argv[i] === "--local") a.remote = false;
		else if (argv[i] === "--fixture") a.fixture = argv[++i];
	}
	return a;
}

const sq = (s) => `'${String(s).replace(/'/g, "''")}'`; // SQL単一引用符エスケープ

// クラウドAPI起因の一時エラー（認可7403やネットワーク揺らぎ）に備え、指数バックオフで再試行。
// R2 put / D1 upsert はいずれも冪等なのでリトライ安全。
async function wrangler(args, { attempts = 4 } = {}) {
	let lastErr;
	for (let i = 1; i <= attempts; i++) {
		try {
			return execFileSync("wrangler", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
		} catch (e) {
			lastErr = e;
			if (i < attempts) {
				const wait = 1000 * 2 ** (i - 1);
				console.warn(`wrangler ${args[0]} ${args[1]} 失敗(${i}/${attempts}) → ${wait}ms後に再試行`);
				await sleep(wait);
			}
		}
	}
	throw lastErr;
}

async function publishFixture(fixtureId, scope) {
	const dir = join(DIST, fixtureId);
	const report = JSON.parse(await readFile(join(dir, "report.json"), "utf8"));

	// 図表PNGをR2へ
	for (const f of report.figures) {
		const key = `${fixtureId}/${f.key}.png`;
		await wrangler(["r2", "object", "put", `${BUCKET}/${key}`, "--file", join(dir, "figures", f.file), "--content-type", "image/png", scope]);
	}

	// sm_pmsr を upsert（data_json は API が展開する形に整形）
	const dataJson = JSON.stringify({
		header: report.header,
		possession: report.stats.possession,
		keyStats: report.stats.keyStats,
		phasesInPossession: report.stats.phasesInPossession,
		phasesOutOfPossession: report.stats.phasesOutOfPossession,
		pressure: report.stats.pressure,
	});
	const figuresJson = JSON.stringify(report.figures.map((f) => ({ key: f.key, ja: f.ja, side: f.side })));
	const now = Math.floor(Date.now() / 1000);
	const sql = `INSERT INTO sm_pmsr (sm_fixture_id, match_no, data_json, figures_json, pdf_url, updated_at)
VALUES (${Number(fixtureId)}, ${Number(report.match) || "NULL"}, ${sq(dataJson)}, ${sq(figuresJson)}, ${report.pdf_url ? sq(report.pdf_url) : "NULL"}, ${now})
ON CONFLICT(sm_fixture_id) DO UPDATE SET
  match_no=excluded.match_no, data_json=excluded.data_json, figures_json=excluded.figures_json,
  pdf_url=excluded.pdf_url, updated_at=excluded.updated_at;`;

	const tmp = await mkdtemp(join(tmpdir(), "pmsr-"));
	const sqlFile = join(tmp, `upsert-${fixtureId}.sql`);
	await writeFile(sqlFile, sql);
	await wrangler(["d1", "execute", DB, scope, "--file", sqlFile]);

	return { fixtureId, figures: report.figures.length };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const scope = args.remote ? "--remote" : "--local";

	let dirs = [];
	try {
		dirs = (await readdir(DIST, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
	} catch {
		console.error("dist/ がありません。先に ingest を実行してください。");
		process.exit(1);
	}
	if (args.fixture) dirs = dirs.filter((d) => d === String(args.fixture));
	if (!dirs.length) { console.log("対象なし"); return; }

	console.log(`publish (${scope}): ${dirs.length} 試合`);
	for (const fixtureId of dirs) {
		try {
			const r = await publishFixture(fixtureId, scope);
			console.log(`  fixture ${r.fixtureId}: 図表${r.figures}枚 + sm_pmsr upsert OK`);
		} catch (e) {
			console.error(`  fixture ${fixtureId}: FAIL`, e.message);
		}
	}
	console.log("完了");
}

main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
