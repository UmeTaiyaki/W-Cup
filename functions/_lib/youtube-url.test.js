import assert from "node:assert/strict";
import { test } from "node:test";
import { parseYoutubeId } from "./youtube-url.js";

test("parseYoutubeId: watch?v= 形式", () => {
	assert.equal(
		parseYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
		"dQw4w9WgXcQ",
	);
});

test("parseYoutubeId: youtu.be 短縮形式", () => {
	assert.equal(parseYoutubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("parseYoutubeId: embed 形式", () => {
	assert.equal(
		parseYoutubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
		"dQw4w9WgXcQ",
	);
});

test("parseYoutubeId: shorts 形式", () => {
	assert.equal(
		parseYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
		"dQw4w9WgXcQ",
	);
});

test("parseYoutubeId: m.youtube.com モバイル", () => {
	assert.equal(
		parseYoutubeId("https://m.youtube.com/watch?v=dQw4w9WgXcQ"),
		"dQw4w9WgXcQ",
	);
});

test("parseYoutubeId: 余分なクエリ(t/list)付き watch", () => {
	assert.equal(
		parseYoutubeId(
			"https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxx&index=3&t=42s",
		),
		"dQw4w9WgXcQ",
	);
});

test("parseYoutubeId: youtu.be に t クエリ付き", () => {
	assert.equal(
		parseYoutubeId("https://youtu.be/dQw4w9WgXcQ?t=90"),
		"dQw4w9WgXcQ",
	);
});

test("parseYoutubeId: 前後空白を許容", () => {
	assert.equal(
		parseYoutubeId("  https://youtu.be/dQw4w9WgXcQ  "),
		"dQw4w9WgXcQ",
	);
});

test("parseYoutubeId: 生の11文字ID直入力", () => {
	assert.equal(parseYoutubeId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("parseYoutubeId: ハイフン/アンダースコア含むID", () => {
	assert.equal(parseYoutubeId("https://youtu.be/a_b-C1d2E3F"), "a_b-C1d2E3F");
});

test("parseYoutubeId: http(s無し)も許容", () => {
	assert.equal(
		parseYoutubeId("http://www.youtube.com/watch?v=dQw4w9WgXcQ"),
		"dQw4w9WgXcQ",
	);
});

test("parseYoutubeId: youtube.com(www無し)", () => {
	assert.equal(
		parseYoutubeId("https://youtube.com/watch?v=dQw4w9WgXcQ"),
		"dQw4w9WgXcQ",
	);
});

// --- 異常系: null を返す ---
test("parseYoutubeId: 空・null・非文字列は null", () => {
	assert.equal(parseYoutubeId(""), null);
	assert.equal(parseYoutubeId(null), null);
	assert.equal(parseYoutubeId(undefined), null);
	assert.equal(parseYoutubeId(123), null);
});

test("parseYoutubeId: 無関係URLは null", () => {
	assert.equal(parseYoutubeId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
	assert.equal(parseYoutubeId("https://vimeo.com/123456789"), null);
});

test("parseYoutubeId: v が11文字でない場合は null", () => {
	assert.equal(parseYoutubeId("https://www.youtube.com/watch?v=short"), null);
	assert.equal(
		parseYoutubeId("https://www.youtube.com/watch?v=toolongtoolongtoolong"),
		null,
	);
});

test("parseYoutubeId: 不正な11文字(記号混じり)は null", () => {
	assert.equal(parseYoutubeId("abcde!@#$%^"), null);
});
