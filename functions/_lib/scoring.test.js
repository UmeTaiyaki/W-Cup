import assert from "node:assert/strict";
import { test } from "node:test";
import {
	canonicalKey,
	normalize,
	resolve,
	SCORING,
	scoreMember,
} from "../../public/lib/scoring.js";
import { DEFAULT_CONFIG } from "./defaults.js";

const RESULT = {
	champion: "ARG",
	runnerUp: "FRA",
	topScorer: "ムバッペ",
	groupResult: {
		A: ["MEX", "KOR", "RSA", "CZE"],
		F: ["NED", "JPN", "TUN", "SWE"],
	},
	knockout: {
		r32: ["ARG", "FRA", "BRA", "ESP"],
		r16: ["ARG", "BRA"],
		qf: ["ARG"],
		sf: ["ARG"],
	},
};

test("配点定数", () => {
	assert.equal(SCORING.champion, 25);
	assert.equal(SCORING.runnerUp, 15);
	assert.equal(SCORING.topScorer, 20);
	assert.equal(SCORING.rankHit, 1);
	assert.equal(SCORING.koHit, 1);
});

test("コア満点", () => {
	const s = scoreMember(
		{ champion: "ARG", runnerUp: "FRA", topScorer: "ムバッペ" },
		RESULT,
	);
	assert.equal(s.core.total, 60);
	assert.equal(s.coreTotal, 60);
	assert.equal(s.optionTotal, 0);
	assert.equal(s.grandTotal, 60);
});

test("得点王は前後空白を無視して一致", () => {
	const s = scoreMember({ topScorer: " ムバッペ " }, RESULT);
	assert.equal(s.core.topScorer, 20);
});

test("オプション未着手なら grandTotal === coreTotal", () => {
	const s = scoreMember({ champion: "ARG" }, RESULT);
	assert.equal(s.coreTotal, 25);
	assert.equal(s.grandTotal, 25);
});

test("グループ順位は位置ピタリで +1（1〜3位のみ）", () => {
	const pred = {
		groupRank: { A: ["MEX", "KOR", "XXX"], F: ["NED", "SWE", "XXX"] },
	};
	const s = scoreMember(pred, RESULT);
	// A: 1位MEX○ 2位KOR○ 3位XXX× = 2点 / F: 1位NED○ 2位SWE× 3位XXX× = 1点
	assert.equal(s.option.groupRank, 3);
	assert.equal(s.option.rankHits, 3);
});

test("コア不一致は0（優勝・準優勝の取り違えは加点なし）", () => {
	// 優勝=ARG/準優勝=FRA に対し、入れ違いの予想は両方とも外れ
	const s = scoreMember({ champion: "FRA", runnerUp: "ARG" }, RESULT);
	assert.equal(s.core.champion, 0);
	assert.equal(s.core.runnerUp, 0);
	assert.equal(s.coreTotal, 0);
});

test("得点王は結果未入力（空文字）なら誤一致しない", () => {
	const noScorer = { ...RESULT, topScorer: "" };
	assert.equal(
		scoreMember({ topScorer: "ムバッペ" }, noScorer).core.topScorer,
		0,
	);
	// 予想・結果ともに空でも 0（null===null 的な誤判定をしない）
	assert.equal(scoreMember({ topScorer: "" }, noScorer).core.topScorer, 0);
});

test("グループ順位は4位を加点しない（1〜3位のみ対象）", () => {
	// 4位 CZE だけ的中、1〜3位は外し → 加点0（i<3 の上限を保証）
	const pred = { groupRank: { A: ["XXX", "YYY", "ZZZ", "CZE"] } };
	const s = scoreMember(pred, RESULT);
	assert.equal(s.option.groupRank, 0);
	assert.equal(s.option.rankHits, 0);
});

test("ノックアウトは到達ラウンドごとに +1", () => {
	const pred = {
		knockout: {
			r32: ["ARG", "FRA", "XXX"], // ARG○ FRA○ XXX× = 2
			r16: ["ARG"], // ○ = 1
			qf: ["BRA"], // × = 0
			sf: ["ARG"], // ○ = 1
		},
	};
	const s = scoreMember(pred, RESULT);
	assert.equal(s.option.knockout, 4);
	assert.deepEqual(s.option.koHits, { r32: 2, r16: 1, qf: 0, sf: 1 });
});

test("デフォルト結果（未確定）はサンプルを含まず、どんな予想でも0点", () => {
	// 大会前のフォールバック設定にサンプル結果が混入していないことを保証する回帰テスト。
	const r = DEFAULT_CONFIG.result;
	assert.equal(r.champion, null);
	assert.equal(r.runnerUp, null);
	assert.equal(r.topScorer, "");
	const pred = {
		champion: "ARG",
		runnerUp: "FRA",
		topScorer: "ムバッペ",
		groupRank: { A: ["MEX", "KOR", "RSA"] },
		knockout: { r32: ["ARG"], r16: ["ARG"], qf: ["ARG"], sf: ["ARG"] },
	};
	const s = scoreMember(pred, {
		...r,
		groupResult: DEFAULT_CONFIG.groupResult,
	});
	assert.equal(s.coreTotal, 0);
	assert.equal(s.optionTotal, 0);
	assert.equal(s.grandTotal, 0);
});

test("総合は コア + オプション", () => {
	const pred = {
		champion: "ARG",
		groupRank: { A: ["MEX", "KOR", "RSA"] }, // 3点
		knockout: { r32: ["ARG"] }, // 1点
	};
	const s = scoreMember(pred, RESULT);
	assert.equal(s.coreTotal, 25);
	assert.equal(s.optionTotal, 4);
	assert.equal(s.grandTotal, 29);
});

test("normalize: 大文字化・アクセント除去・空白畳み", () => {
	assert.equal(normalize("Mbappé"), "MBAPPE");
	assert.equal(normalize("  Vinícius   Júnior "), "VINICIUS JUNIOR");
	assert.equal(normalize("MBAPPE (FRA)"), "MBAPPE (FRA)");
	assert.equal(normalize(null), "");
});

test("canonicalKey: NAME (CODE) を CODE::正規化名 に畳む", () => {
	assert.equal(canonicalKey("Mbappé (FRA)"), "FRA::MBAPPE");
	assert.equal(canonicalKey("MBAPPE (FRA)"), "FRA::MBAPPE");
	assert.equal(canonicalKey("ムバッペ"), "ムバッペ"); // (CODE) 無しは normalize のみ
});

test("resolve: エイリアス優先・無ければ canonicalKey", () => {
	const map = { "VINI JR. (BRA)": "BRA::VINICIUS JUNIOR" };
	assert.equal(resolve("VINI JR. (BRA)", map), "BRA::VINICIUS JUNIOR"); // 変種
	assert.equal(resolve("VINICIUS JUNIOR (BRA)", map), "BRA::VINICIUS JUNIOR"); // 構造フォールバック
	assert.equal(resolve("Mbappé (FRA)", {}), "FRA::MBAPPE"); // 表なしでもアクセント差吸収
	assert.equal(resolve("", map), "");
});

test("得点王: アクセント差のみは表なしで一致", () => {
	const s = scoreMember({ topScorer: "Mbappé (FRA)" }, { topScorer: "MBAPPE (FRA)" });
	assert.equal(s.core.topScorer, 20);
});

test("得点王: 変種は aliasMap 経由で一致", () => {
	const map = { "VINI JR. (BRA)": "BRA::VINICIUS JUNIOR" };
	const s = scoreMember({ topScorer: "VINI JR. (BRA)" }, { topScorer: "VINICIUS JUNIOR (BRA)" }, SCORING, map);
	assert.equal(s.core.topScorer, 20);
});

test("得点王: 別人は不一致", () => {
	const s = scoreMember({ topScorer: "KANE (ENG)" }, { topScorer: "MBAPPE (FRA)" });
	assert.equal(s.core.topScorer, 0);
});

test("得点王: aliasMap 省略時は従来挙動（完全一致相当）", () => {
	const s = scoreMember({ topScorer: "ムバッペ" }, { topScorer: "ムバッペ" });
	assert.equal(s.core.topScorer, 20);
});
