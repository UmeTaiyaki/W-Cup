import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "./news.js";

const req = (url) => new Request(url);
const fakeKv = () => ({
	async get() {
		return null;
	},
	async put() {},
});
// ダミー SA(JSON)。実署名はせず env.__mintToken 注入でトークン発行を差し替える。
const SA = JSON.stringify({
	client_email: "svc@proj.iam",
	private_key: "PK",
	project_id: "proj",
});
const mintOk = async () => ({ token: "tok", expiresAt: 9e9 });

// SportMonks / Vertex を URL で分岐する fetch スタブ
function makeFetch({ pre = [], post = [], fixture = null, ja = "JA" } = {}) {
	return async (url) => {
		const u = String(url);
		if (
			u.includes("aiplatform.googleapis.com") ||
			u.includes("generativelanguage.googleapis.com")
		)
			return {
				ok: true,
				json: async () => ({
					candidates: [{ content: { parts: [{ text: ja }] } }],
				}),
			};
		if (u.includes("/news/pre-match/seasons/"))
			return { ok: true, json: async () => ({ data: pre }) };
		if (u.includes("/news/post-match/seasons/"))
			return { ok: true, json: async () => ({ data: post }) };
		if (u.includes("/fixtures/"))
			return { ok: true, json: async () => ({ data: fixture }) };
		return { ok: false, status: 404, text: async () => "nf" };
	};
}

test("GET /api/news: NEWS_ENABLED 未設定なら enabled:false", async () => {
	const res = await onRequestGet({
		env: {},
		request: req("https://x/api/news"),
	});
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { enabled: false, items: [] });
});

test("GET /api/news: 一覧モードは pre/post 統合しタイトル日本語訳を付与", async () => {
	const env = {
		NEWS_ENABLED: "true",
		SPORTMONKS_TOKEN: "t",
		GCP_SERVICE_ACCOUNT: SA,
		CONFIG: fakeKv(),
		__mintToken: mintOk,
		__fetchImpl: makeFetch({
			post: [{ id: 9, fixture_id: 30, title: "R", type: "postmatch" }],
			pre: [{ id: 1, fixture_id: 10, title: "P", type: "prematch" }],
			ja: "日本語訳",
		}),
	};
	const res = await onRequestGet({ env, request: req("https://x/api/news") });
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.equal(body.items[0].newsitem_id, 9);
	assert.equal(body.items[0].title_ja, "日本語訳");
	assert.ok(res.headers.get("cache-control").includes("s-maxage"));
});

test("GET /api/news: 本文モードは lines を連結・翻訳しヒーローを返す", async () => {
	const fixture = {
		id: 30,
		result_info: "Mexico won after full-time.",
		postmatchnews: [{ id: 9, lines: [{ text: "Mexico won." }] }],
		events: [{ type_id: 14, player: { image_path: "p.png", name: "S" } }],
		venue: { image_path: "v.png" },
		participants: [{ image_path: "c1.png" }, { image_path: "c2.png" }],
	};
	const env = {
		NEWS_ENABLED: "true",
		SPORTMONKS_TOKEN: "t",
		GCP_SERVICE_ACCOUNT: SA,
		CONFIG: fakeKv(),
		__mintToken: mintOk,
		__fetchImpl: makeFetch({ fixture, ja: "メキシコ勝利" }),
	};
	const res = await onRequestGet({
		env,
		request: req("https://x/api/news?id=30&type=postmatch"),
	});
	const body = await res.json();
	assert.equal(body.body.body_ja, "メキシコ勝利");
	assert.equal(body.body.hero.kind, "player");
	assert.equal(body.body.hero.url, "p.png");
});

test("GET /api/news: 本文モード type=prematch は prematchnews の lines を読む", async () => {
	const fixture = {
		id: 40,
		prematchnews: [{ id: 7, lines: [{ text: "Preview text." }] }],
		venue: { image_path: "v.png" },
		participants: [{ image_path: "c1.png" }, { image_path: "c2.png" }],
	};
	const env = {
		NEWS_ENABLED: "true",
		SPORTMONKS_TOKEN: "t",
		GCP_SERVICE_ACCOUNT: SA,
		CONFIG: fakeKv(),
		__mintToken: mintOk,
		__fetchImpl: makeFetch({ fixture, ja: "プレビュー本文" }),
	};
	const res = await onRequestGet({
		env,
		request: req("https://x/api/news?id=40&type=prematch"),
	});
	const body = await res.json();
	assert.equal(body.body.body_ja, "プレビュー本文");
	// 得点者なし→venue にフォールバック
	assert.equal(body.body.hero.kind, "venue");
});

test("GET /api/news: 翻訳認証なし(SA/Geminiキー無し)は 200・英語フォールバック", async () => {
	const env = {
		NEWS_ENABLED: "true",
		SPORTMONKS_TOKEN: "t",
		CONFIG: fakeKv(),
		__fetchImpl: makeFetch({
			post: [{ id: 9, fixture_id: 30, title: "EN only", type: "postmatch" }],
		}),
	};
	const res = await onRequestGet({ env, request: req("https://x/api/news") });
	const body = await res.json();
	assert.equal(body.items[0].title_ja, "EN only");
});

test("GET /api/news: GEMINI_API_KEY だけでも翻訳する(SA 無し・Gemini経路)", async () => {
	const env = {
		NEWS_ENABLED: "true",
		SPORTMONKS_TOKEN: "t",
		GEMINI_API_KEY: "K",
		CONFIG: fakeKv(),
		__fetchImpl: makeFetch({
			post: [{ id: 9, fixture_id: 30, title: "R", type: "postmatch" }],
			ja: "ジェミニ訳",
		}),
	};
	const res = await onRequestGet({ env, request: req("https://x/api/news") });
	const body = await res.json();
	assert.equal(body.items[0].title_ja, "ジェミニ訳");
});

test("GET /api/news: 本文モード不正id は 400", async () => {
	const env = {
		NEWS_ENABLED: "true",
		SPORTMONKS_TOKEN: "t",
		CONFIG: fakeKv(),
	};
	const res = await onRequestGet({
		env,
		request: req("https://x/api/news?id=abc&type=postmatch"),
	});
	assert.equal(res.status, 400);
});

test("GET /api/news: SportMonks 失敗でも 200 で空(縮退)", async () => {
	const env = {
		NEWS_ENABLED: "true",
		SPORTMONKS_TOKEN: "t",
		CONFIG: fakeKv(),
		__fetchImpl: async () => ({
			ok: false,
			status: 500,
			text: async () => "e",
		}),
	};
	const res = await onRequestGet({ env, request: req("https://x/api/news") });
	assert.equal(res.status, 200);
	const body = await res.json();
	assert.equal(body.enabled, true);
	assert.deepEqual(body.items, []);
});
