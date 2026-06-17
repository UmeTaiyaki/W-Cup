// Chrome headless を CDP(DevTools Protocol)で実時間制御する薄いドライバ。
// pdf.js の Worker は --virtual-time-budget とデッドロックするため、実時間でポーリングする。
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium-browser",
	"/usr/bin/chromium",
].filter(Boolean);

export async function launchChrome({ port = 9333, userDataDir = "/tmp/pmsr-chrome", attempts = 2 } = {}) {
	const bin = CHROME_CANDIDATES[0];
	let lastErr = "起動理由不明";

	for (let attempt = 1; attempt <= attempts; attempt++) {
		const proc = spawn(bin, [
			"--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
			// CI(GitHub Actions)の小さい /dev/shm と権限制約で即クラッシュするのを防ぐ。
			"--no-sandbox", "--disable-dev-shm-usage",
			"--remote-debugging-port=" + port,
			"--user-data-dir=" + userDataDir,
			"about:blank",
		], { stdio: ["ignore", "ignore", "pipe"], detached: true });

		// 失敗診断のため stderr を保持しつつ、Chrome の早期終了を検知する。
		let stderr = "";
		proc.stderr?.on("data", (d) => { stderr += d; if (stderr.length > 4000) stderr = stderr.slice(-4000); });
		let exited = false, exitInfo = "";
		proc.on("exit", (code, sig) => { exited = true; exitInfo = `code=${code} signal=${sig}`; });
		proc.on("error", (e) => { exited = true; exitInfo = `spawn失敗: ${e.message}`; });

		let ver = null;
		for (let i = 0; i < 120; i++) { // 最大30秒待つ（CIのコールドスタート対策）
			if (exited) break;
			try { ver = await (await fetch(`http://localhost:${port}/json/version`)).json(); break; }
			catch { await sleep(250); }
		}
		if (ver) return { proc, port };

		try { process.kill(-proc.pid); } catch {}
		lastErr = exited
			? `Chromeが起動直後に終了 (${exitInfo}) ${stderr.trim()}`
			: `CDPポート ${port} が30秒以内に応答せず ${stderr.trim()}`;
		if (attempt < attempts) await sleep(1000);
	}
	throw new Error("Chrome CDP起動失敗: " + lastErr.trim());
}

// 1つのターゲット(タブ)を開いて CDP セッションを張る。
export async function openTarget(port, url) {
	const tgt = await (await fetch(
		`http://localhost:${port}/json/new?${encodeURIComponent(url)}`,
		{ method: "PUT" },
	)).json();
	const ws = new WebSocket(tgt.webSocketDebuggerUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

	let msgId = 0;
	const pending = new Map();
	ws.onmessage = (ev) => {
		const m = JSON.parse(ev.data);
		if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
	};
	const send = (method, params) => new Promise((resolve) => {
		const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params }));
	});

	await send("Page.enable", {});
	await send("Runtime.enable", {});

	const evalJs = async (expr, awaitPromise = false) => {
		const r = await send("Runtime.evaluate", { expression: expr, awaitPromise, returnByValue: true });
		if (r.result && r.result.exceptionDetails) {
			throw new Error("eval: " + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
		}
		return r.result && r.result.result ? r.result.result.value : undefined;
	};

	const navigate = async (toUrl) => { await send("Page.navigate", { url: toUrl }); };
	const close = () => ws.close();
	return { send, evalJs, navigate, close, targetId: tgt.id };
}

// __status が "ready" になるまで実時間ポーリング（PDF読み込み完了待ち）。
export async function waitReady(session, { timeoutMs = 30000, intervalMs = 250 } = {}) {
	const n = Math.ceil(timeoutMs / intervalMs);
	for (let i = 0; i < n; i++) {
		const status = await session.evalJs("window.__status || ''");
		if (status === "ready") return;
		if (String(status).startsWith("ERR")) throw new Error("render page " + status);
		await sleep(intervalMs);
	}
	throw new Error("PDF読み込みタイムアウト");
}
