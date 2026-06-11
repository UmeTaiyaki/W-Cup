import assert from "node:assert/strict";
import { test } from "node:test";
import {
	sanitizeTeam,
	sanitizeText,
} from "../../scripts/lib/sanitize-text.mjs";

test("sanitizeText: 引用マーカー [1] / [4, 18, 22] を直前の空白ごと除去", () => {
	assert.equal(sanitizeText("帰ってきた。 [1]"), "帰ってきた。");
	assert.equal(
		sanitizeText("歴史を歩んだ。 [4, 18, 22] しかし"),
		"歴史を歩んだ。しかし",
	);
	assert.equal(sanitizeText("A [12] B"), "A B"); // ラテン文の空白は1つ保持
});

test("sanitizeText: Markdown ** / * / ` を除去", () => {
	assert.equal(sanitizeText("**久保建英**は注目"), "久保建英は注目");
	assert.equal(sanitizeText("これは*重要*だ"), "これは重要だ");
	assert.equal(sanitizeText("`code`表記"), "code表記");
});

test("sanitizeText: 日本語間の余分な空白は除去・ラテン名の空白は保持", () => {
	assert.equal(sanitizeText("守備 ブロック"), "守備ブロック");
	assert.equal(
		sanitizeText("FW / レアル・マドリード"),
		"FW / レアル・マドリード",
	); // /周りの空白は保持
	assert.equal(
		sanitizeText("MF Takefusa Kubo が中心"),
		"MF Takefusa Kubo が中心",
	);
});

test("sanitizeText: 句読点前の空白除去・前後トリム", () => {
	assert.equal(sanitizeText("  強い 。  "), "強い。");
});

test("sanitizeText: 非文字列はそのまま返す", () => {
	assert.equal(sanitizeText(undefined), undefined);
	assert.equal(sanitizeText(42), 42);
});

test("sanitizeTeam: summary と各 body をサニタイズ（非破壊）", () => {
	const team = {
		summary: "強豪。 [1]",
		sections: [
			{
				id: "players",
				heading: "注目選手",
				body: "**A**は鍵 [2]",
				picks: ["A"],
			},
		],
	};
	const out = sanitizeTeam(team);
	assert.equal(out.summary, "強豪。");
	assert.equal(out.sections[0].body, "Aは鍵");
	assert.deepEqual(out.sections[0].picks, ["A"]); // picks は不変
	assert.equal(team.summary, "強豪。 [1]"); // 元オブジェクトは不変
});

test("sanitizeTeam: manager もサニタイズ・無ければキーを足さない", () => {
	const withMgr = sanitizeTeam({
		summary: "x",
		sections: [],
		manager: "森保一 [1]",
	});
	assert.equal(withMgr.manager, "森保一");
	const noMgr = sanitizeTeam({ summary: "x", sections: [] });
	assert.ok(!("manager" in noMgr));
});
