import { describe, expect, it, vi } from "vitest";
import { translateToJa, vertexGenerateUrl } from "./sm-news-i18n.js";

function fakeKv(initial = {}) {
	const store = new Map(Object.entries(initial));
	return {
		get: vi.fn(async (k) => (store.has(k) ? store.get(k) : null)),
		put: vi.fn(async (k, v) => void store.set(k, v)),
		_store: store,
	};
}
const okVertex = (text) =>
	vi.fn(async () => ({
		ok: true,
		json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
	}));
const vertex = (fetchImpl) => ({
	accessToken: "tok",
	project: "proj",
	location: "global",
	fetchImpl,
});

describe("vertexGenerateUrl", () => {
	it("global は aiplatform.googleapis.com", () => {
		expect(vertexGenerateUrl("proj", "global", "gemini-2.5-flash")).toBe(
			"https://aiplatform.googleapis.com/v1/projects/proj/locations/global/publishers/google/models/gemini-2.5-flash:generateContent",
		);
	});
	it("region は {loc}-aiplatform", () => {
		expect(vertexGenerateUrl("proj", "us-central1", "m")).toContain(
			"us-central1-aiplatform.googleapis.com",
		);
	});
});

describe("translateToJa", () => {
	it("KV ヒット時は Vertex を呼ばず即返し", async () => {
		const kv = fakeKv({ "news:tr:ja:1:title": "日本語済み" });
		const fetchImpl = vi.fn();
		const out = await translateToJa("Hello", {
			kv,
			cacheKey: "news:tr:ja:1:title",
			vertex: vertex(fetchImpl),
		});
		expect(out).toBe("日本語済み");
		expect(fetchImpl).not.toHaveBeenCalled();
	});
	it("KV ミス時は翻訳して KV 保存し訳文返し(grounding 無し・低温度のボディ)", async () => {
		const kv = fakeKv();
		const fetchImpl = okVertex("メキシコが勝利");
		const out = await translateToJa("Mexico won", {
			kv,
			cacheKey: "news:tr:ja:2:title",
			vertex: vertex(fetchImpl),
		});
		expect(out).toBe("メキシコが勝利");
		expect(kv.put).toHaveBeenCalledWith("news:tr:ja:2:title", "メキシコが勝利");
		const sentBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
		expect(sentBody.tools).toBeUndefined();
		expect(sentBody.generationConfig.temperature).toBe(0.2);
		expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
	});
	it("翻訳失敗(HTTP不可)時は原文を返し落ちない", async () => {
		const kv = fakeKv();
		const fetchImpl = vi.fn(async () => ({
			ok: false,
			status: 500,
			text: async () => "err",
		}));
		const out = await translateToJa("Fallback EN", {
			kv,
			cacheKey: "news:tr:ja:3:title",
			vertex: vertex(fetchImpl),
		});
		expect(out).toBe("Fallback EN");
	});
	it("vertex 無し(null)は翻訳せず原文返し", async () => {
		const out = await translateToJa("No vertex", {
			kv: fakeKv(),
			cacheKey: "x",
			vertex: null,
		});
		expect(out).toBe("No vertex");
	});
	it("空文字は空文字", async () => {
		expect(
			await translateToJa("", {
				kv: fakeKv(),
				cacheKey: "x",
				vertex: vertex(vi.fn()),
			}),
		).toBe("");
	});
});
