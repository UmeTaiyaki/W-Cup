// 試合日程ビューの純ロジック（ブラウザ/Node 共有・ESM）

// ノックアウトの round コード → 表示ラベル。
// 注: グループステージは round = 'A'〜'L'（roundLabel で「グループX」に変換）。
//     'F' は常にグループ F であり、決勝は round = '決勝' で別物。
const ROUND_NAMES = {
	R32: "ベスト32",
	R16: "ベスト16",
	QF: "準々決勝",
	SF: "準決勝",
	"3位": "3位決定戦",
	決勝: "決勝",
};

// あるラウンドの「ひとつ前のラウンド」ラベル。W##/L## スロットを
// 「ベスト32 勝者」「準決勝 敗者」のように分かりやすく表記するために使う。
const PREV_ROUND_LABEL = {
	R16: "ベスト32",
	QF: "ベスト16",
	SF: "準々決勝",
	決勝: "準決勝",
	"3位": "準決勝",
};

// round 記号 → 章ラベル
export function roundLabel(round) {
	if (round == null || round === "") return ""; // null / undefined / 空文字
	if (/^[A-L]$/.test(round)) return `グループ${round}`; // A〜L（'F'=グループF を優先）
	return ROUND_NAMES[round] || round;
}

// 試合の a/b フィールド（確定チームコード or スロット表記）を表示用オブジェクトに変換。
// round は当該試合のラウンド（W##/L## を前ラウンド基準のラベルにするために使う）。
export function formatMatchTeam(code, teamMap = {}, round) {
	const c = code || "";
	const team = teamMap[c];
	if (team) {
		return { resolved: true, code: c, label: team.ja, flag: team.flag };
	}
	const prev = PREV_ROUND_LABEL[round];
	let label = "未定";
	let m;
	if ((m = /^([12])([A-L])$/.exec(c))) {
		label = `グループ${m[2]} ${m[1]}位`;
	} else if (/^3\(/.test(c) || /^3[A-L]{2,}$/.test(c)) {
		label = "3位通過"; // 例: '3(A/B/C/D/F)'
	} else if (/^W\d+$/.test(c)) {
		label = prev ? `${prev} 勝者` : "勝者";
	} else if (/^L\d+$/.test(c)) {
		label = prev ? `${prev} 敗者` : "敗者";
	}
	return { resolved: false, code: c, label, flag: null };
}

// schedule を日付ごとにまとめ、日付昇順・各日内は時刻昇順で返す。
// date 欠落要素は末尾の { date: null } グループへ集約。
export function groupByDate(schedule) {
	const list = Array.isArray(schedule) ? schedule : [];
	const byDate = new Map();
	const undated = [];
	// byDate/undated はローカルの集計用（入力は不変、戻り値は新規配列）
	for (const m of list) {
		if (!m) continue;
		if (m.date) {
			if (!byDate.has(m.date)) byDate.set(m.date, []);
			byDate.get(m.date).push(m);
		} else {
			undated.push(m);
		}
	}
	const dates = [...byDate.keys()].sort();
	const byTime = (x, y) => (x.time || "").localeCompare(y.time || "");
	return [
		...dates.map((date) => ({
			date,
			matches: byDate.get(date).slice().sort(byTime),
		})),
		...(undated.length
			? [{ date: null, matches: undated.slice().sort(byTime) }]
			: []),
	];
}

// 並んだ試合日リスト（昇順想定）から、今日 or それ以降で最初の試合日を返す。
// 今日以降に無ければ最後の試合日。リストが空なら null。
export function pickFocusDate(dateList, today) {
	const dates = (Array.isArray(dateList) ? dateList : [])
		.filter(Boolean)
		.slice()
		.sort();
	if (!dates.length) return null;
	for (const d of dates) {
		if (d >= today) return d;
	}
	return dates[dates.length - 1];
}

// エポックミリ秒 → JST(UTC+9) の 'YYYY-MM-DD'。引数省略時は現在時刻。
// cutoffHour（JST の時、0〜24）を渡すと、その時刻以降は「翌日」を返す。
// 既定 24 はシフト無し（純粋な JST 当日）。例: 22 を渡すと 22:00 以降は翌日。
export function jstToday(nowMs = Date.now(), cutoffHour = 24) {
	const jst = new Date(nowMs + 9 * 60 * 60 * 1000);
	if (jst.getUTCHours() >= cutoffHour) {
		jst.setUTCDate(jst.getUTCDate() + 1); // 月またぎ・年またぎも setUTCDate が正規化
	}
	return jst.toISOString().slice(0, 10);
}
