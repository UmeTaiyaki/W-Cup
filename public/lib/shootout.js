// PK戦（ペナルティシュートアウト）タイムラインの純ロジック（ブラウザ/Node 共有・ESM）。
// 入力は toEventRows（functions/_lib/sm-ingest.js）形のイベント配列。
// 不変条件: 壊れた/欠損入力でも例外を投げず、空配列 or カウント不変で返す。

// PK戦イベントの type（成功/失敗）。通常PK（penalty/missed_penalty）は含めない。
const SHOOTOUT_TYPES = new Set(["pen_shootout_goal", "pen_shootout_miss"]);

export function isShootoutEvent(type) {
	return SHOOTOUT_TYPES.has(type);
}

// events からPK戦のみ抽出→蹴った順にソート→各行に累積スコアを添えて返す。
// 返り値: [{ ev, running: {home, away} }, ...]（蹴った順）。
export function buildShootoutTimeline(events, homeTeamId) {
	const list = Array.isArray(events) ? events : [];
	const kicks = list
		.filter((e) => e && isShootoutEvent(e.type))
		.sort(
			(a, b) =>
				(a.sort_order ?? 0) - (b.sort_order ?? 0) ||
				(a.sm_event_id ?? 0) - (b.sm_event_id ?? 0),
		);
	let home = 0;
	let away = 0;
	return kicks.map((ev) => {
		if (ev.type === "pen_shootout_goal") {
			if (ev.team_id === homeTeamId) home += 1;
			else if (ev.team_id != null) away += 1;
		}
		return { ev, running: { home, away } };
	});
}
