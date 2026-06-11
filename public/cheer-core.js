/* 試合前 ご当地応援バトルのカウント管理（楽観的更新＋バッチ送信）。
   Babel前の普通の<script>で読み込み、window.WC.cheer に集約。
   - tap: 即ローカル加算＆購読者通知。送信は溜めて約2秒デバウンス or 保留>=10で即時。
   - 離脱時は sendBeacon で取りこぼし防止。
   - サーバ応答を確定値として、未送信の保留分を足し戻す。 */
(() => {
	window.WC = window.WC || {};

	const API = "/api/cheer";
	const FLUSH_MS = 2000;
	const FLUSH_AT = 10;

	const state = {}; // fixtureId -> {home, away}（表示用＝確定＋保留）
	const pending = {}; // fixtureId -> {home, away}（未送信deltaの蓄積）
	const subs = new Set();
	let timer = null;
	let enabled = true;

	function notify() {
		subs.forEach((fn) => {
			try {
				fn();
			} catch (e) {
				/* ignore subscriber error */
			}
		});
	}
	function zero() {
		return { home: 0, away: 0 };
	}
	function get(fixtureId) {
		return state[fixtureId] || zero();
	}
	function subscribe(fn) {
		subs.add(fn);
		return () => {
			subs.delete(fn);
		};
	}

	// 指定 fixture 群の確定値を取得し、保留分を足して表示状態へ反映。
	async function fetchCounts(ids) {
		if (!ids || !ids.length) return;
		try {
			const res = await fetch(API + "?fixtures=" + ids.join(","), {
				headers: { accept: "application/json" },
			});
			const data = await res.json();
			if (data && data.enabled === false) {
				enabled = false;
				return;
			}
			const counts = (data && data.counts) || {};
			ids.forEach((id) => {
				const c = counts[id] || zero();
				const p = pending[id] || zero();
				state[id] = { home: c.home + p.home, away: c.away + p.away };
			});
			notify();
		} catch (e) {
			/* ネットワーク失敗時はローカル状態を維持 */
		}
	}

	// 応援1回：即時にローカル反映し、送信をスケジュール。
	function tap(fixtureId, side) {
		if (side !== "home" && side !== "away") return;
		const s = state[fixtureId] || zero();
		state[fixtureId] = Object.assign({}, s, { [side]: s[side] + 1 });
		const p = pending[fixtureId] || zero();
		pending[fixtureId] = Object.assign({}, p, { [side]: p[side] + 1 });
		notify();
		schedule();
	}

	function pendingTotal() {
		let t = 0;
		for (const id in pending) t += pending[id].home + pending[id].away;
		return t;
	}

	function schedule() {
		if (pendingTotal() >= FLUSH_AT) {
			flush();
			return;
		}
		if (timer) return;
		timer = setTimeout(() => {
			timer = null;
			flush();
		}, FLUSH_MS);
	}

	// 保留deltaを fixture×side ごとに POST。成功時はサーバ確定値＋残り保留で再構成。
	async function flush() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		const ids = Object.keys(pending);
		for (const id of ids) {
			const p = pending[id];
			if (!p) continue;
			for (const side of ["home", "away"]) {
				const delta = p[side];
				if (delta <= 0) continue;
				p[side] = 0; // 楽観的に送信済みとみなす
				try {
					const res = await fetch(API, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							fixtureId: Number(id),
							side: side,
							delta: delta,
						}),
					});
					const data = await res.json();
					if (data && data.counts) {
						const still = pending[id] || zero();
						state[id] = {
							home: data.counts.home + still.home,
							away: data.counts.away + still.away,
						};
					}
				} catch (e) {
					p[side] += delta; // 失敗は保留へ戻して次回再送
				}
			}
			if (pending[id] && pending[id].home === 0 && pending[id].away === 0)
				delete pending[id];
		}
		notify();
	}

	// 離脱時の取りこぼし防止。残保留を sendBeacon で送る。
	function beaconFlush() {
		if (!navigator.sendBeacon) return;
		for (const id in pending) {
			const p = pending[id];
			for (const side of ["home", "away"]) {
				if (p[side] > 0) {
					const blob = new Blob(
						[
							JSON.stringify({
								fixtureId: Number(id),
								side: side,
								delta: p[side],
							}),
						],
						{
							type: "application/json",
						},
					);
					navigator.sendBeacon(API, blob);
					p[side] = 0;
				}
			}
		}
	}
	window.addEventListener("pagehide", beaconFlush);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") beaconFlush();
	});

	window.WC.cheer = {
		get: get,
		tap: tap,
		fetch: fetchCounts,
		flush: flush,
		subscribe: subscribe,
		isEnabled: () => enabled,
	};
})();
