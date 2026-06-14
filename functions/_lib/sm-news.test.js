import assert from "node:assert/strict";
import { test } from "node:test";
import {
	joinLines,
	mergeNewsList,
	newsBodyInclude,
	pickHero,
	translationCacheKey,
} from "./sm-news.js";

test("mergeNewsList: pre/post 統合・post先頭・各群fixture_id昇順で安定整列", () => {
	const pre = [
		{ id: 2, fixture_id: 20, title: "P20", type: "prematch" },
		{ id: 1, fixture_id: 10, title: "P10", type: "prematch" },
	];
	const post = [
		{
			id: 9,
			fixture_id: 30,
			title: "R30",
			type: "postmatch",
			fixture: { venue: { image_path: "stadium.png" } },
		},
	];
	const out = mergeNewsList(pre, post);
	assert.deepEqual(
		out.map((x) => x.newsitem_id),
		[9, 1, 2],
	);
	assert.equal(out[0].fixture_id, 30);
	assert.equal(out[0].type, "postmatch");
	assert.equal(out[0].title_en, "R30");
	assert.equal(out[0].hero_image, "stadium.png"); // include=fixture.venue 由来
	assert.equal(out[1].hero_image, null); // venue 無しは null
});

test("mergeNewsList: 同一 newsitem_id を重複排除", () => {
	const dup = [{ id: 5, fixture_id: 1, title: "A", type: "prematch" }];
	assert.equal(
		mergeNewsList(
			dup,
			dup.map((x) => ({ ...x })),
		).length,
		1,
	);
});

test("mergeNewsList: 非配列入力でも空配列", () => {
	assert.deepEqual(mergeNewsList(null, undefined), []);
});

test("joinLines: text を順序保持で連結し空/空白を除去", () => {
	const lines = [
		{ text: "First." },
		{ text: "  " },
		{ text: "Second." },
		{ text: null },
	];
	assert.equal(joinLines(lines), "First.\n\nSecond.");
});

test("joinLines: 非配列は空文字", () => {
	assert.equal(joinLines(undefined), "");
});

test("pickHero: 得点者写真を最優先", () => {
	const detail = {
		events: [{ type_id: 14, player: { image_path: "p.png", name: "Scorer" } }],
		venue: { image_path: "v.png" },
		participants: [{ image_path: "c1.png" }, { image_path: "c2.png" }],
	};
	const h = pickHero(detail);
	assert.equal(h.kind, "player");
	assert.equal(h.url, "p.png");
});

test("pickHero: 得点者無→venue", () => {
	const h = pickHero({ venue: { image_path: "v.png" } });
	assert.equal(h.kind, "venue");
	assert.equal(h.url, "v.png");
});

test("pickHero: 全欠損→null", () => {
	assert.equal(pickHero({}), null);
});

test("translationCacheKey: newsitem_id と kind から決定的キー", () => {
	assert.equal(translationCacheKey(12859, "title"), "news:tr:ja:12859:title");
	assert.equal(translationCacheKey(12859, "body"), "news:tr:ja:12859:body");
});

test("newsBodyInclude: type で pre/post の include を切替", () => {
	assert.ok(newsBodyInclude("postmatch").includes("postmatchNews.lines"));
	assert.ok(newsBodyInclude("prematch").includes("prematchNews.lines"));
	assert.ok(newsBodyInclude("postmatch").includes("events.player"));
});
