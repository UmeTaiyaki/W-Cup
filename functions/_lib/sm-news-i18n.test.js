import assert from "node:assert/strict";
import { test } from "node:test";
import { translateToJa, vertexGenerateUrl } from "./sm-news-i18n.js";

// 副作用注入用の最小フェイク。vitest 非依存（node:test ランナーで動く）。
function fakeKv(initial = {}) {
	const store = new Map(Object.entries(initial));
	return {
		calls: { get: 0, put: [] },
		async get(k) {
			this.calls.get++;
			return store.has(k) ? store.get(k) : null;
		},
		async put(k, v) {
			this.calls.put.push([k, v]);
			store.set(k, v);
		},
	};
}

// Vertex generateContent 応答スタブ（呼び出し引数を records に記録）。
function fetchStub(text) {
	const calls = [];
	const fn = async (url, opts) => {
		calls.push([url, opts]);
		return {
			ok: true,
			json: async () => ({
				candidates: [{ content: { parts: [{ text }] } }],
			}),
		};
	};
	fn.calls = calls;
	return fn;
}

const vertex = (fetchImpl) => ({
	accessToken: "tok",
	project: "proj",
	location: "global",
	fetchImpl,
});

test("vertexGenerateUrl: global は aiplatform.googleapis.com", () => {
	assert.equal(
		vertexGenerateUrl("proj", "global", "gemini-2.5-flash"),
		"https://aiplatform.googleapis.com/v1/projects/proj/locations/global/publishers/google/models/gemini-2.5-flash:generateContent",
	);
});

test("vertexGenerateUrl: region は {loc}-aiplatform", () => {
	assert.ok(
		vertexGenerateUrl("proj", "us-central1", "m").includes(
			"us-central1-aiplatform.googleapis.com",
		),
	);
});

test("translateToJa: KV ヒット時は Vertex を呼ばず即返し", async () => {
	const kv = fakeKv({ "news:tr:ja:1:title": "日本語済み" });
	const f = fetchStub("X");
	const out = await translateToJa("Hello", {
		kv,
		cacheKey: "news:tr:ja:1:title",
		vertex: vertex(f),
	});
	assert.equal(out, "日本語済み");
	assert.equal(f.calls.length, 0);
});

test("translateToJa: KV ミス時は翻訳して保存・grounding無し・温度0.2", async () => {
	const kv = fakeKv();
	const f = fetchStub("メキシコが勝利");
	const out = await translateToJa("Mexico won", {
		kv,
		cacheKey: "news:tr:ja:2:title",
		vertex: vertex(f),
	});
	assert.equal(out, "メキシコが勝利");
	assert.deepEqual(kv.calls.put[0], ["news:tr:ja:2:title", "メキシコが勝利"]);
	const body = JSON.parse(f.calls[0][1].body);
	assert.equal(body.tools, undefined);
	assert.equal(body.generationConfig.temperature, 0.2);
	assert.equal(f.calls[0][1].headers.Authorization, "Bearer tok");
});

test("translateToJa: 翻訳失敗(HTTP不可)時は原文を返し落ちない", async () => {
	const kv = fakeKv();
	const f = async () => ({ ok: false, status: 500, text: async () => "err" });
	const out = await translateToJa("Fallback EN", {
		kv,
		cacheKey: "news:tr:ja:3:title",
		vertex: vertex(f),
	});
	assert.equal(out, "Fallback EN");
});

test("translateToJa: vertex 無し(null)は翻訳せず原文返し", async () => {
	const out = await translateToJa("No vertex", {
		kv: fakeKv(),
		cacheKey: "x",
		vertex: null,
	});
	assert.equal(out, "No vertex");
});

test("translateToJa: 空文字は空文字", async () => {
	const out = await translateToJa("", {
		kv: fakeKv(),
		cacheKey: "x",
		vertex: vertex(fetchStub("Y")),
	});
	assert.equal(out, "");
});
