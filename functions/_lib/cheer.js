// 試合前 ご当地応援バトルの純粋ヘルパ群（D1/環境に依存しない）。
// API ハンドラ（functions/api/cheer.js）から利用し、単体テストもここで完結させる。

export const MAX_DELTA = 20;

// sm-read.js の statusFromState と同じ状態分類。開始済み = LIVE か FT。
const LIVE_STATES = new Set([2, 3, 6, 9]);
const FT_STATES = new Set([5, 7, 8]);

// 1リクエストで加算できる delta を 1..MAX_DELTA に丸める。
// 不正値・0・負数は 1 に、巨大値は上限にクランプ（濫用での一発水増しを防ぐ）。
export function clampDelta(n) {
	const x = Math.floor(Number(n));
	if (!Number.isFinite(x) || x < 1) return 1;
	return Math.min(x, MAX_DELTA);
}

export function isSide(s) {
	return s === "home" || s === "away";
}

// "1,2,x,2" → [1,2]（正の整数のみ・重複排除・最大60件）。
export function parseFixtures(str) {
	if (typeof str !== "string" || !str) return [];
	const out = [];
	for (const part of str.split(",")) {
		const n = Number(part.trim());
		if (Number.isInteger(n) && n > 0) out.push(n);
	}
	return [...new Set(out)].slice(0, 60);
}

// cheer_counts の行配列を { "<fixtureId>": { home, away } } へ集約。欠けた side は 0。
export function rowsToCounts(rows) {
	const counts = {};
	for (const r of rows || []) {
		const fid = String(r.fixture_id);
		if (!counts[fid]) counts[fid] = { home: 0, away: 0 };
		if (r.side === "home" || r.side === "away")
			counts[fid][r.side] = r.count ?? 0;
	}
	return counts;
}

// state_id から「試合が開始済みか」を判定。LIVE/FT のみ true。
// NS(=1) や null/未知は false（＝試合前扱い→応援を許可）。
export function isStarted(stateId) {
	return LIVE_STATES.has(stateId) || FT_STATES.has(stateId);
}
