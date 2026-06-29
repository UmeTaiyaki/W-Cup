import assert from "node:assert/strict";
import { test } from "node:test";
import {
	concreteSlotCode,
	formatMatchTeam,
	groupByDate,
	indexByNumber,
	jstToday,
	matchNumber,
	pickFocusDate,
	resolveScheduleSlot,
	roundLabel,
} from "../../public/lib/schedule-view.js";

test("roundLabel: グループ記号は「グループX」", () => {
	assert.equal(roundLabel("A"), "グループA");
	assert.equal(roundLabel("L"), "グループL");
});

test("roundLabel: ノックアウトのラウンド名", () => {
	assert.equal(roundLabel("R32"), "ベスト32");
	assert.equal(roundLabel("R16"), "ベスト16");
	assert.equal(roundLabel("QF"), "準々決勝");
	assert.equal(roundLabel("SF"), "準決勝");
	assert.equal(roundLabel("3位"), "3位決定戦");
	assert.equal(roundLabel("決勝"), "決勝");
});

test("roundLabel: F はグループF（決勝ではない）", () => {
	// 実データでは 'F' は常にグループF。決勝は round = '決勝'。
	assert.equal(roundLabel("F"), "グループF");
});

test("roundLabel: 不明値はそのまま返す", () => {
	assert.equal(roundLabel("ZZ"), "ZZ");
	assert.equal(roundLabel(""), "");
});

test("roundLabel: null / undefined は空文字", () => {
	assert.equal(roundLabel(null), "");
	assert.equal(roundLabel(undefined), "");
});

test("formatMatchTeam: 既知チームコードは確定扱い", () => {
	const teamMap = { MEX: { ja: "メキシコ", flag: "🇲🇽" } };
	assert.deepEqual(formatMatchTeam("MEX", teamMap), {
		resolved: true,
		code: "MEX",
		label: "メキシコ",
		flag: "🇲🇽",
	});
});

test("formatMatchTeam: 順位スロットは「グループX N位」", () => {
	assert.deepEqual(formatMatchTeam("1A", {}), {
		resolved: false,
		code: "1A",
		label: "グループA 1位",
		flag: null,
	});
	assert.deepEqual(formatMatchTeam("2C", {}), {
		resolved: false,
		code: "2C",
		label: "グループC 2位",
		flag: null,
	});
});

test("formatMatchTeam: 勝者/敗者スロットは前ラウンド基準のラベル", () => {
	// R16 の対戦相手はベスト32の勝者
	assert.equal(formatMatchTeam("W74", {}, "R16").label, "ベスト32 勝者");
	// 決勝の対戦相手は準決勝の勝者
	assert.equal(formatMatchTeam("W101", {}, "決勝").label, "準決勝 勝者");
	// 3位決定戦は準決勝の敗者
	assert.equal(formatMatchTeam("L101", {}, "3位").label, "準決勝 敗者");
	// 準々決勝(QF)はベスト16の勝者
	assert.equal(formatMatchTeam("W89", {}, "QF").label, "ベスト16 勝者");
});

test("formatMatchTeam: round 不明な勝者/敗者は素の「勝者/敗者」", () => {
	assert.equal(formatMatchTeam("W73", {}).label, "勝者");
	assert.equal(formatMatchTeam("L88", {}).label, "敗者");
});

test("formatMatchTeam: 3位群スロットは「3位通過」表記", () => {
	assert.equal(formatMatchTeam("3(A/B/C/D/F)", {}).label, "3位通過"); // 実データ形式
	assert.equal(formatMatchTeam("3ABCD", {}).label, "3位通過"); // 旧形式も許容
});

test("formatMatchTeam: 空や未知は未定", () => {
	assert.deepEqual(formatMatchTeam("", {}), {
		resolved: false,
		code: "",
		label: "未定",
		flag: null,
	});
});

test("groupByDate: 日付昇順・各日内は時刻昇順", () => {
	const sched = [
		{ date: "2026-06-13", time: "10:00", round: "D", a: "USA", b: "PAR" },
		{ date: "2026-06-12", time: "11:00", round: "A", a: "KOR", b: "CZE" },
		{ date: "2026-06-12", time: "04:00", round: "A", a: "MEX", b: "RSA" },
	];
	const out = groupByDate(sched);
	assert.deepEqual(
		out.map((g) => g.date),
		["2026-06-12", "2026-06-13"],
	);
	assert.deepEqual(
		out[0].matches.map((m) => m.time),
		["04:00", "11:00"],
	);
	assert.equal(out[0].matches.length, 2);
	assert.equal(out[1].matches.length, 1);
});

test("groupByDate: 同時刻試合も両方保持", () => {
	const sched = [
		{ date: "2026-06-25", time: "04:00", round: "B", a: "SUI", b: "CAN" },
		{ date: "2026-06-25", time: "04:00", round: "B", a: "BIH", b: "QAT" },
	];
	const out = groupByDate(sched);
	assert.equal(out.length, 1);
	assert.equal(out[0].matches.length, 2);
});

test("groupByDate: date 欠落要素は末尾「日付未定」グループへ", () => {
	const sched = [
		{ date: "2026-06-12", time: "04:00", round: "A", a: "MEX", b: "RSA" },
		{ time: "04:00", round: "F", a: "W101", b: "W102" },
	];
	const out = groupByDate(sched);
	assert.equal(out.length, 2);
	assert.equal(out[out.length - 1].date, null);
	assert.equal(out[out.length - 1].matches.length, 1);
});

test("groupByDate: date 空文字は日付未定グループへ", () => {
	const out = groupByDate([
		{ date: "", time: "04:00", round: "F", a: "W1", b: "W2" },
	]);
	assert.equal(out[0].date, null);
});

test("groupByDate: 空配列は空配列", () => {
	assert.deepEqual(groupByDate([]), []);
	assert.deepEqual(groupByDate(null), []);
});

const DATES = ["2026-06-12", "2026-06-13", "2026-06-25"];

test("pickFocusDate: 今日に試合があれば今日", () => {
	assert.equal(pickFocusDate(DATES, "2026-06-13"), "2026-06-13");
});

test("pickFocusDate: 今日に試合が無ければ次の試合日", () => {
	assert.equal(pickFocusDate(DATES, "2026-06-07"), "2026-06-12"); // 大会前
	assert.equal(pickFocusDate(DATES, "2026-06-20"), "2026-06-25"); // 休養日
});

test("pickFocusDate: 今日以降に試合が無ければ最後の試合日", () => {
	assert.equal(pickFocusDate(DATES, "2026-07-01"), "2026-06-25"); // 大会後
});

test("pickFocusDate: 空リストは null", () => {
	assert.equal(pickFocusDate([], "2026-06-12"), null);
	assert.equal(pickFocusDate(null, "2026-06-12"), null);
});

test("jstToday: ミリ秒からJSTの YYYY-MM-DD を返す", () => {
	// 2026-06-12T19:30:00Z = JST 2026-06-13 04:30 → '2026-06-13'
	assert.equal(jstToday(Date.parse("2026-06-12T19:30:00Z")), "2026-06-13");
	// 2026-06-12T14:00:00Z = JST 2026-06-12 23:00 → '2026-06-12'
	assert.equal(jstToday(Date.parse("2026-06-12T14:00:00Z")), "2026-06-12");
});

test("jstToday: cutoffHour=22 で JST22時以降は翌日を返す", () => {
	// JST 21:59 → 当日のまま（2026-06-12T12:59:00Z = JST 2026-06-12 21:59）
	assert.equal(jstToday(Date.parse("2026-06-12T12:59:00Z"), 22), "2026-06-12");
	// JST 22:00 ちょうど → 翌日（2026-06-12T13:00:00Z = JST 2026-06-12 22:00）
	assert.equal(jstToday(Date.parse("2026-06-12T13:00:00Z"), 22), "2026-06-13");
	// JST 23:30 → 翌日（2026-06-12T14:30:00Z = JST 2026-06-12 23:30）
	assert.equal(jstToday(Date.parse("2026-06-12T14:30:00Z"), 22), "2026-06-13");
	// 月またぎ: JST 2026-06-30 22:00 → 翌月 2026-07-01
	assert.equal(jstToday(Date.parse("2026-06-30T13:00:00Z"), 22), "2026-07-01");
});

// ── W##/L## スロット解決（matchNumber / indexByNumber / concreteSlotCode / resolveScheduleSlot）──
const _SLOT_TEAMS = {
	GER: { ja: "ドイツ", flag: "🇩🇪" },
	PAR: { ja: "パラグアイ", flag: "🇵🇾" },
	FRA: { ja: "フランス", flag: "🇫🇷" },
	SWE: { ja: "スウェーデン", flag: "🇸🇪" },
};
// R32 #74(GER,PAR) #77(FRA,SWE) → R16 #89(W74,W77) → QF #97(W89,W90)
const _SLOT_SCHED = [
	{ round: "R32", a: "GER", b: "PAR", note: "#74 Foxborough" },
	{ round: "R32", a: "FRA", b: "SWE", note: "#77 East Rutherford" },
	{ round: "R16", a: "W74", b: "W77", note: "#89 Philadelphia" },
	{ round: "QF", a: "W89", b: "W90", note: "#97 Foxborough" },
];
// results: sorted "ca|cb" → 勝者コード
function _outcomeFactory(results) {
	return (ca, cb) => {
		const w = results[[ca, cb].slice().sort().join("|")];
		if (!w) return null;
		return w === ca ? "a" : "b";
	};
}
function _slotCtx(results) {
	return {
		teamMap: _SLOT_TEAMS,
		byNumber: indexByNumber(_SLOT_SCHED),
		outcomeOf: _outcomeFactory(results),
	};
}

test("matchNumber: note 先頭の #NN を取り出す", () => {
	assert.equal(matchNumber("#73 Inglewood"), 73);
	assert.equal(matchNumber("#104 East Rutherford"), 104);
	assert.equal(matchNumber("Mexico City"), null);
	assert.equal(matchNumber(null), null);
});

test("indexByNumber: 試合番号→試合のMap（重複は先勝ち・番号なしは除外）", () => {
	const map = indexByNumber(_SLOT_SCHED);
	assert.equal(map.get(74).a, "GER");
	assert.equal(map.get(89).a, "W74");
	assert.equal(map.has(73), false);
});

test("concreteSlotCode: 実コードはそのまま / 決着済みW##→勝者・L##→敗者", () => {
	const ctx = _slotCtx({ "GER|PAR": "GER", "FRA|SWE": "SWE" });
	assert.equal(concreteSlotCode("GER", ctx), "GER");
	assert.equal(concreteSlotCode("W74", ctx), "GER"); // #74勝者
	assert.equal(concreteSlotCode("L74", ctx), "PAR"); // #74敗者
	assert.equal(concreteSlotCode("W77", ctx), "SWE");
});

test("concreteSlotCode: 未決着feederは null", () => {
	const ctx = _slotCtx({}); // 結果なし
	assert.equal(concreteSlotCode("W74", ctx), null);
});

test("concreteSlotCode: R16/QFは下位ラウンド確定後に連鎖解決", () => {
	// R32だけ確定 → W89(=R16#89勝者)はまだ解決不可（#89未決着）
	let ctx = _slotCtx({ "GER|PAR": "GER", "FRA|SWE": "SWE" });
	assert.equal(concreteSlotCode("W89", ctx), null);
	// R16#89も確定（GER vs SWE → GER勝ち）→ W89=GER
	ctx = _slotCtx({ "GER|PAR": "GER", "FRA|SWE": "SWE", "GER|SWE": "GER" });
	assert.equal(concreteSlotCode("W89", ctx), "GER");
});

test("resolveScheduleSlot: 実コードは確定チーム（ja/flag付き）", () => {
	const ctx = _slotCtx({});
	const r = resolveScheduleSlot("GER", "R32", ctx);
	assert.equal(r.resolved, true);
	assert.equal(r.code, "GER");
	assert.equal(r.label, "ドイツ");
	assert.equal(r.flag, "🇩🇪");
});

test("resolveScheduleSlot: W##決着済み→勝者の実チーム", () => {
	const ctx = _slotCtx({ "GER|PAR": "GER" });
	const r = resolveScheduleSlot("W74", "R16", ctx);
	assert.equal(r.resolved, true);
	assert.equal(r.code, "GER");
	assert.equal(r.pair, null);
});

test("resolveScheduleSlot: W##未決着だが候補2チーム確定→or表示(pair)", () => {
	const ctx = _slotCtx({}); // #74未決着
	const r = resolveScheduleSlot("W74", "R16", ctx);
	assert.equal(r.resolved, false);
	assert.equal(r.label, "GER or PAR");
	assert.deepEqual(
		[r.pair.a.code, r.pair.b.code],
		["GER", "PAR"],
	);
	assert.equal(r.pair.a.flag, "🇩🇪");
});

test("resolveScheduleSlot: 候補未確定（R32未消化のQF枠）→ 既存スロットラベルにフォールバック", () => {
	const ctx = _slotCtx({}); // R32未決着 → W89候補も不明
	const r = resolveScheduleSlot("W89", "QF", ctx);
	assert.equal(r.resolved, false);
	assert.equal(r.pair, null);
	assert.equal(r.label, "ベスト16 勝者"); // formatMatchTeam の prev(QF)=ベスト16
});

test("resolveScheduleSlot: R32出揃い後はQF枠もor表示に昇格", () => {
	// R32(#74,#77)確定 → R16#89の候補はGER/FRA…ではなく勝者GER vs SWE。
	// さらにR16#89も確定すればW89はGER。ここでは#89未決＝QF#97のa(W89)はGER or SWE。
	const ctx = _slotCtx({ "GER|PAR": "GER", "FRA|SWE": "SWE" });
	const r = resolveScheduleSlot("W89", "QF", ctx);
	assert.equal(r.resolved, false);
	assert.equal(r.label, "GER or SWE");
	assert.deepEqual([r.pair.a.code, r.pair.b.code], ["GER", "SWE"]);
});
