import { describe, expect, it } from "vitest";
import {
	joinLines,
	mergeNewsList,
	newsBodyInclude,
	pickHero,
	translationCacheKey,
} from "./sm-news.js";

describe("mergeNewsList", () => {
	it("pre/post 統合・post 先頭・各群 fixture_id 昇順で安定整列", () => {
		const pre = [
			{ id: 2, fixture_id: 20, title: "P20", type: "prematch" },
			{ id: 1, fixture_id: 10, title: "P10", type: "prematch" },
		];
		const post = [{ id: 9, fixture_id: 30, title: "R30", type: "postmatch" }];
		const out = mergeNewsList(pre, post);
		expect(out.map((x) => x.newsitem_id)).toEqual([9, 1, 2]);
		expect(out[0]).toMatchObject({
			fixture_id: 30,
			type: "postmatch",
			title_en: "R30",
		});
	});
	it("同一 newsitem_id を重複排除", () => {
		const dup = [{ id: 5, fixture_id: 1, title: "A", type: "prematch" }];
		expect(
			mergeNewsList(
				dup,
				dup.map((x) => ({ ...x })),
			),
		).toHaveLength(1);
	});
	it("非配列入力でも空配列", () => {
		expect(mergeNewsList(null, undefined)).toEqual([]);
	});
});

describe("joinLines", () => {
	it("text を順序保持で連結し空/空白を除去", () => {
		const lines = [
			{ text: "First." },
			{ text: "  " },
			{ text: "Second." },
			{ text: null },
		];
		expect(joinLines(lines)).toBe("First.\n\nSecond.");
	});
	it("非配列は空文字", () => {
		expect(joinLines(undefined)).toBe("");
	});
});

describe("pickHero", () => {
	it("得点者写真を最優先", () => {
		const detail = {
			events: [
				{ type_id: 14, player: { image_path: "p.png", name: "Scorer" } },
			],
			venue: { image_path: "v.png" },
			participants: [{ image_path: "c1.png" }, { image_path: "c2.png" }],
		};
		expect(pickHero(detail)).toMatchObject({ kind: "player", url: "p.png" });
	});
	it("得点者無→venue", () => {
		expect(pickHero({ venue: { image_path: "v.png" } })).toMatchObject({
			kind: "venue",
			url: "v.png",
		});
	});
	it("全欠損→null", () => {
		expect(pickHero({})).toBeNull();
	});
});

describe("translationCacheKey", () => {
	it("newsitem_id と kind から決定的キー", () => {
		expect(translationCacheKey(12859, "title")).toBe("news:tr:ja:12859:title");
		expect(translationCacheKey(12859, "body")).toBe("news:tr:ja:12859:body");
	});
});

describe("newsBodyInclude", () => {
	it("type で pre/post の include を切替", () => {
		expect(newsBodyInclude("postmatch")).toContain("postmatchNews.lines");
		expect(newsBodyInclude("prematch")).toContain("prematchNews.lines");
		expect(newsBodyInclude("postmatch")).toContain("events.player");
	});
});
