/* 試合前カード H2H（過去対戦 通算W-D-L）の読み取り専用プール。
   Babel前の普通の<script>で読み込み、window.WC.h2h に集約。
   - fetch: /api/h2h?fixtures= をまとめて取得しキャッシュ。
   - get: fixtureId の {home_code,away_code,home_wins,draws,away_wins,total} or null。
   書き込みは無い（応援カウントとは別物）。 */
(() => {
	window.WC = window.WC || {};

	const API = "/api/h2h";
	const state = {}; // fixtureId -> H2Hオブジェクト or null（取得済みを記録）
	const subs = new Set();
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
	function get(fixtureId) {
		return state[fixtureId] || null;
	}
	function subscribe(fn) {
		subs.add(fn);
		return () => subs.delete(fn);
	}

	async function fetchH2H(ids) {
		if (!enabled || !ids || !ids.length) return;
		// 未取得のものだけ問い合わせる（H2Hはほぼ静的＝再取得不要）。
		const need = ids.filter((id) => !(id in state));
		if (!need.length) return;
		try {
			const res = await fetch(API + "?fixtures=" + need.join(","), {
				headers: { accept: "application/json" },
			});
			const data = await res.json();
			if (data && data.enabled === false) {
				enabled = false;
				return;
			}
			const h2h = (data && data.h2h) || {};
			need.forEach((id) => {
				state[id] = h2h[id] || null; // 行なしは null（初対戦）として確定
			});
			notify();
		} catch (e) {
			/* ネットワーク失敗時は未取得のまま（次回再試行） */
		}
	}

	window.WC.h2h = {
		get: get,
		fetch: fetchH2H,
		subscribe: subscribe,
		isEnabled: () => enabled,
	};
})();
