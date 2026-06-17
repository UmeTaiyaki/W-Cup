// PMSR インジェスト（成果物生成フェーズ）。
// hub→PDF取得→pdf.js(Chrome)でテキスト抽出&図表PNG化→構造化スタッツ→dist/ へ出力。
// クラウド書き込みはしない（publish.mjs が dist/ を R2/D1 に反映する）。
//
// 使い方:
//   node scripts/pmsr/ingest.mjs --all [--limit N]
//   node scripts/pmsr/ingest.mjs --match 11 --fixture-id 19427455
//   node scripts/pmsr/ingest.mjs --all --fixture-map scripts/pmsr/fixture-map.json
//
// fixture_id 解決の優先順:
//   1) --fixture-id（単一match指定時のみ）
//   2) --fixture-map <json>  [{ sm_fixture_id, home_code, away_code, date? }]
//   3) wrangler D1 から自動取得（--resolve-d1。CI/認証済み環境向け）

import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchHub } from "./hub.mjs";
import { parseStats, findMissing } from "./parse-stats.mjs";
import { buildFigureTargets } from "./figures.mjs";
import { launchChrome, openTarget, waitReady } from "./chrome.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../.."); // repo root
const VENDOR = join(ROOT, "node_modules/pdfjs-dist/legacy/build");
const WORK = join(__dir, ".work");
const DIST = join(__dir, "dist");
const PORT = 8741;

function parseArgs(argv) {
	const a = { limit: Infinity, resolveD1: false };
	for (let i = 0; i < argv.length; i++) {
		const v = argv[i];
		if (v === "--all") a.all = true;
		else if (v === "--match") a.match = Number(argv[++i]);
		else if (v === "--fixture-id") a.fixtureId = Number(argv[++i]);
		else if (v === "--fixture-map") a.fixtureMap = argv[++i];
		else if (v === "--limit") a.limit = Number(argv[++i]);
		else if (v === "--resolve-d1") a.resolveD1 = true;
	}
	return a;
}

// ── 静的HTTPサーバ（render-app.html / vendor / pdfs を同一オリジンで配信） ──
const MIME = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".pdf": "application/pdf" };
function startServer() {
	const server = createServer(async (req, res) => {
		try {
			const url = new URL(req.url, `http://localhost:${PORT}`);
			let file = null;
			if (url.pathname === "/render-app.html") file = join(__dir, "render-app.html");
			else if (url.pathname.startsWith("/vendor/")) file = join(VENDOR, url.pathname.slice("/vendor/".length));
			else if (url.pathname.startsWith("/pdfs/")) file = join(WORK, "pdfs", url.pathname.slice("/pdfs/".length));
			if (!file || !existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
			const ext = file.slice(file.lastIndexOf("."));
			const body = await readFile(file);
			res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
			res.end(body);
		} catch (e) { res.writeHead(500); res.end(String(e)); }
	});
	return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

// wrangler はクラウドAPI起因の一時エラー（認可7403やネットワーク揺らぎ）を返すことがある。
// PMSRは冪等なので、指数バックオフで数回リトライしてから諦める。
async function runWrangler(argv, { attempts = 4 } = {}) {
	let lastErr;
	for (let i = 1; i <= attempts; i++) {
		try {
			return execFileSync("wrangler", argv, { encoding: "utf8", cwd: ROOT });
		} catch (e) {
			lastErr = e;
			if (i < attempts) {
				const wait = 1000 * 2 ** (i - 1);
				console.warn(`wrangler ${argv[0]} ${argv[1]} 失敗(${i}/${attempts}) → ${wait}ms後に再試行`);
				await sleep(wait);
			}
		}
	}
	throw lastErr;
}

// ── fixture_id 解決 ──
async function buildResolver(args) {
	if (args.fixtureMap) {
		const map = JSON.parse(readFileSync(args.fixtureMap, "utf8"));
		return (m, header) => {
			const hit = map.find((r) =>
				String(r.home_code).toUpperCase() === m.homeCode &&
				String(r.away_code).toUpperCase() === m.awayCode &&
				(!r.date || !header.date || r.date === header.date));
			return hit ? Number(hit.sm_fixture_id) : null;
		};
	}
	if (args.resolveD1) {
		// wrangler 経由で sm_fixtures×sm_teams を引いてトリコード→fixture_id を解く。
		const sql = "SELECT f.sm_fixture_id AS id, h.short_code AS home, a.short_code AS away " +
			"FROM sm_fixtures f LEFT JOIN sm_teams h ON h.sm_team_id=f.home_team_id " +
			"LEFT JOIN sm_teams a ON a.sm_team_id=f.away_team_id";
		const out = await runWrangler(["d1", "execute", "wcup2026-db", "--remote", "--json", "--command", sql]);
		const rows = JSON.parse(out)?.[0]?.results || [];
		return (m) => {
			const hit = rows.find((r) => String(r.home).toUpperCase() === m.homeCode && String(r.away).toUpperCase() === m.awayCode);
			return hit ? Number(hit.id) : null;
		};
	}
	if (args.fixtureId) return () => args.fixtureId;
	return () => null;
}

async function processMatch(session, m, fixtureId) {
	await session.navigate(`http://localhost:${PORT}/render-app.html?pdf=/pdfs/${encodeURIComponent(m.file)}`);
	await waitReady(session);

	const text = await session.evalJs("window.__allText()", true);
	const stats = parseStats(text);
	const missing = findMissing(stats);
	const header = stats.header;

	const pageTexts = await session.evalJs("window.__pageTexts()", true);
	const targets = buildFigureTargets(pageTexts, header.home, header.away);

	const outDir = join(DIST, String(fixtureId));
	await mkdir(join(outDir, "figures"), { recursive: true });

	const figures = [];
	for (const t of targets) {
		const cropArg = t.crop ? `[${t.crop.join(",")}]` : "null";
		const dataUrl = await session.evalJs(`window.__render(${t.page}, ${cropArg}, 3)`, true);
		const b64 = String(dataUrl).replace(/^data:image\/png;base64,/, "");
		const fname = `${t.key}.png`;
		await writeFile(join(outDir, "figures", fname), Buffer.from(b64, "base64"));
		figures.push({ key: t.key, ja: t.ja, side: t.side, file: fname });
	}

	const report = {
		sm_fixture_id: fixtureId,
		match: m.match,
		home_code: m.homeCode,
		away_code: m.awayCode,
		pdf_url: m.pdfUrl,
		header,
		stats: { possession: stats.possession, keyStats: stats.keyStats, phasesInPossession: stats.phasesInPossession, phasesOutOfPossession: stats.phasesOutOfPossession, pressure: stats.pressure },
		figures,
		missing,
	};
	await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2));
	return { fixtureId, match: m.match, figures: figures.length, missing: missing.length };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.all && !args.match) { console.error("--all か --match <n> を指定"); process.exit(2); }

	// 作業/出力ディレクトリは毎回まっさらにする（古い試合や検証用の残骸を publish しないため）。
	await rm(WORK, { recursive: true, force: true });
	await rm(DIST, { recursive: true, force: true });
	await mkdir(join(WORK, "pdfs"), { recursive: true });
	await mkdir(DIST, { recursive: true });

	console.log("hub取得中...");
	let matches = await fetchHub();
	if (args.match) matches = matches.filter((m) => m.match === args.match);
	matches = matches.slice(0, args.limit);
	console.log(`対象 ${matches.length} 試合`);
	if (!matches.length) { console.log("対象なし"); return; }

	const resolve = await buildResolver(args);
	const server = await startServer();
	const chrome = await launchChrome({ port: 9333 });
	const session = await openTarget(9333, "about:blank");

	const summary = [];
	try {
		for (const m of matches) {
			// PDFをworkへDL
			const res = await fetch(m.pdfUrl);
			if (!res.ok) { console.log(`M${m.match}: PDF取得失敗 ${res.status}`); continue; }
			m.file = `M${String(m.match).padStart(2, "0")}.pdf`;
			await writeFile(join(WORK, "pdfs", m.file), Buffer.from(await res.arrayBuffer()));

			// header.date 解決のため一度開いてから fixtureId を確定（mapはdate併用可）
			await session.navigate(`http://localhost:${PORT}/render-app.html?pdf=/pdfs/${encodeURIComponent(m.file)}`);
			await waitReady(session);
			const header = parseStats(await session.evalJs("window.__allText()", true)).header;
			const fixtureId = resolve(m, header);
			if (!fixtureId) { console.log(`M${m.match} (${m.homeCode} v ${m.awayCode}): fixture_id未解決 → スキップ`); continue; }

			const r = await processMatch(session, m, fixtureId);
			summary.push(r);
			console.log(`M${r.match} → fixture ${r.fixtureId}: 図表${r.figures}枚 / 欠損${r.missing}`);
		}
	} finally {
		session.close();
		try { process.kill(-chrome.proc.pid); } catch {}
		server.close();
	}

	await writeFile(join(DIST, "manifest.json"), JSON.stringify({ generatedFrom: "fifatrainingcentre", count: summary.length, reports: summary }, null, 2));
	console.log(`\n完了: ${summary.length} 試合を dist/ に出力`);
}

main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
