# ホーム ニュースカルーセル（GNews版）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームの試合カルーセル下にGNews（lang=ja）のW杯ニュースを横スクロールカルーセルで表示し、タップで出典記事を別タブで開く。

**Architecture:** バックエンドは `functions/_lib/gnews.js`（GNews v4/search を叩き正規化）＋ `functions/api/news.js`（`NEWS_ENABLED` ゲート＋KVキャッシュ30分＋障害隔離）。フロントはPR#53のカルーセルUIを流用し、タップを外部リンクに変更。翻訳/fixture紐づけ/本文展開は全廃。OFF/失敗/空はカルーセルごと非表示で既存ホームと完全同一（非破壊）。

**Tech Stack:** Cloudflare Pages Functions（ESM）、KV（binding `CONFIG`）、React（Babel standalone・`window.WC` グローバル）、テストは `node --test`（node:test + node:assert）。

**設計書:** `docs/superpowers/specs/2026-06-17-home-news-gnews-design.md`

**前提コンテキスト（実コードで確認済み）:**
- KV API: `env.CONFIG.get(key)` → string|null、`env.CONFIG.put(key, value, { expirationTtl })`。
- HTTPヘルパ: `import { json } from "../_lib/http.js"` → `json(status, body, headers)`。
- テストシーム: `env.__fetchImpl`（fetch差替）。テストのfetchモックは `async () => new Response(JSON.stringify(...), { status })`。
- 現状 `public/index.html`: `data.js?v=21`（62行）、`screens-home.jsx?v=18`（140行）。
- `public/screens-home.jsx` の `HomeScreen` 戻り値（957-969行）は `<MatchCarousel .../>` の直後に `<DayTimeline .../>`。末尾（971行）に `Object.assign(window, { HomeScreen, MatchRow, DayTimeline });`。
- main にはニュース関連コード皆無（PR#53は未マージ）。本ブランチ `feat/home-news-gnews` はクリーン追加。

**GNews v4/search レスポンス形:**
```json
{ "totalArticles": 123, "articles": [
  { "title": "...", "description": "...", "content": "...", "url": "https://...",
    "image": "https://...", "publishedAt": "2026-06-17T...Z", "source": { "name": "...", "url": "https://..." } }
]}
```

---

## Task 1: GNewsクライアント（`functions/_lib/gnews.js`）

**Files:**
- Create: `functions/_lib/gnews.js`
- Test: `functions/_lib/gnews.test.js`

- [ ] **Step 1: 失敗するテストを書く**

Create `functions/_lib/gnews.test.js`:

```javascript
import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchGnews } from "./gnews.js";

function fakeFetch(payload, status = 200) {
	let captured = null;
	const impl = async (url) => {
		captured = url;
		return new Response(JSON.stringify(payload), { status });
	};
	impl.lastUrl = () => captured;
	return impl;
}

const SAMPLE = {
	totalArticles: 2,
	articles: [
		{
			title: "日本、初戦勝利",
			description: "森保ジャパンが白星発進。",
			content: "truncated...",
			url: "https://example.com/a",
			image: "https://example.com/a.jpg",
			publishedAt: "2026-06-17T10:00:00Z",
			source: { name: "Example News", url: "https://example.com" },
		},
		{
			title: "ブラジル快勝",
			description: "5得点の圧勝。",
			url: "https://example.com/b",
			image: "https://example.com/b.jpg",
			publishedAt: "2026-06-17T08:00:00Z",
			source: { name: "Sample Sports", url: "https://sample.com" },
		},
	],
};

test("正常レスポンスを正規化", async () => {
	const env = { GNEWS_API_KEY: "k", __fetchImpl: fakeFetch(SAMPLE) };
	const items = await fetchGnews(env);
	assert.equal(items.length, 2);
	assert.deepEqual(items[0], {
		id: "https://example.com/a",
		title: "日本、初戦勝利",
		description: "森保ジャパンが白星発進。",
		url: "https://example.com/a",
		image: "https://example.com/a.jpg",
		source: "Example News",
		publishedAt: "2026-06-17T10:00:00Z",
	});
});

test("URLにlang/q/max/sortby/apikeyを組み立てる", async () => {
	const impl = fakeFetch(SAMPLE);
	const env = {
		GNEWS_API_KEY: "secret-key",
		GNEWS_QUERY: '"ワールドカップ"',
		GNEWS_LANG: "ja",
		__fetchImpl: impl,
	};
	await fetchGnews(env);
	const u = new URL(impl.lastUrl());
	assert.equal(u.origin + u.pathname, "https://gnews.io/api/v4/search");
	assert.equal(u.searchParams.get("lang"), "ja");
	assert.equal(u.searchParams.get("q"), '"ワールドカップ"');
	assert.equal(u.searchParams.get("max"), "10");
	assert.equal(u.searchParams.get("sortby"), "publishedAt");
	assert.equal(u.searchParams.get("apikey"), "secret-key");
});

test("APIキー未設定 → 空配列（fetchしない）", async () => {
	let called = false;
	const env = { __fetchImpl: async () => { called = true; return new Response("{}"); } };
	const items = await fetchGnews(env);
	assert.deepEqual(items, []);
	assert.equal(called, false);
});

test("非200 → 空配列", async () => {
	const env = { GNEWS_API_KEY: "k", __fetchImpl: fakeFetch({ errors: ["bad"] }, 401) };
	assert.deepEqual(await fetchGnews(env), []);
});

test("articles欠如 → 空配列", async () => {
	const env = { GNEWS_API_KEY: "k", __fetchImpl: fakeFetch({ totalArticles: 0 }) };
	assert.deepEqual(await fetchGnews(env), []);
});

test("url欠損の記事はスキップ", async () => {
	const env = {
		GNEWS_API_KEY: "k",
		__fetchImpl: fakeFetch({
			articles: [
				{ title: "no url", description: "x" },
				{ title: "ok", url: "https://ok.com/1", publishedAt: "2026-06-17T00:00:00Z" },
			],
		}),
	};
	const items = await fetchGnews(env);
	assert.equal(items.length, 1);
	assert.equal(items[0].url, "https://ok.com/1");
});

test("source/image欠損は安全な既定値", async () => {
	const env = {
		GNEWS_API_KEY: "k",
		__fetchImpl: fakeFetch({
			articles: [{ title: "t", url: "https://x.com/1", publishedAt: "2026-06-17T00:00:00Z" }],
		}),
	};
	const items = await fetchGnews(env);
	assert.equal(items[0].source, "");
	assert.equal(items[0].image, "");
	assert.equal(items[0].description, "");
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `node --test functions/_lib/gnews.test.js`
Expected: FAIL（`fetchGnews` 未定義）

- [ ] **Step 3: 最小実装を書く**

Create `functions/_lib/gnews.js`:

```javascript
// GNews v4/search を叩いてW杯ニュースを正規化する。
// 失敗・APIキー欠如・空はすべて [] を返し、呼び出し側で縮退させる。
const GNEWS_ENDPOINT = "https://gnews.io/api/v4/search";
const DEFAULT_QUERY = '"ワールドカップ" OR "W杯"';
const MAX_ARTICLES = 10;

export async function fetchGnews(env) {
	const apikey = env.GNEWS_API_KEY;
	if (!apikey) return [];
	const fetchImpl = env.__fetchImpl || fetch;
	const url = new URL(GNEWS_ENDPOINT);
	url.searchParams.set("q", env.GNEWS_QUERY || DEFAULT_QUERY);
	url.searchParams.set("lang", env.GNEWS_LANG || "ja");
	url.searchParams.set("sortby", "publishedAt");
	url.searchParams.set("max", String(MAX_ARTICLES));
	url.searchParams.set("apikey", apikey);

	const res = await fetchImpl(url.toString());
	if (!res.ok) return [];
	const data = await res.json();
	const articles = Array.isArray(data?.articles) ? data.articles : [];
	return articles.map(normalizeArticle).filter(Boolean);
}

function normalizeArticle(a) {
	if (!a || typeof a.url !== "string" || !a.url) return null;
	return {
		id: a.url,
		title: typeof a.title === "string" ? a.title : "",
		description: typeof a.description === "string" ? a.description : "",
		url: a.url,
		image: typeof a.image === "string" ? a.image : "",
		source: a.source && typeof a.source.name === "string" ? a.source.name : "",
		publishedAt: typeof a.publishedAt === "string" ? a.publishedAt : "",
	};
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `node --test functions/_lib/gnews.test.js`
Expected: PASS（7テスト緑）

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/gnews.js functions/_lib/gnews.test.js
git commit -m "feat(news): GNews v4/search クライアント＋正規化"
```

---

## Task 2: ニュースAPI（`functions/api/news.js`）

**Files:**
- Create: `functions/api/news.js`
- Test: `functions/api/news.test.js`

- [ ] **Step 1: 失敗するテストを書く**

Create `functions/api/news.test.js`:

```javascript
import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "./news.js";

function memKV(initial = {}) {
	const store = new Map(Object.entries(initial));
	return {
		get: async (k) => (store.has(k) ? store.get(k) : null),
		put: async (k, v) => { store.set(k, v); },
		_store: store,
	};
}
function fakeFetch(payload, status = 200) {
	const impl = async () => new Response(JSON.stringify(payload), { status });
	return impl;
}
function ctx(env) {
	return { env, request: new Request("https://x/api/news") };
}

const SAMPLE = {
	articles: [
		{ title: "t1", description: "d1", url: "https://n.com/1", image: "https://n.com/1.jpg", publishedAt: "2026-06-17T10:00:00Z", source: { name: "N" } },
	],
};

test("NEWS_ENABLED 未設定 → enabled:false", async () => {
	const res = await onRequestGet(ctx({ CONFIG: memKV() }));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.enabled, false);
});

test("KVミス → fetch→正規化→KV保存→items返却", async () => {
	const kv = memKV();
	const env = { NEWS_ENABLED: "true", GNEWS_API_KEY: "k", CONFIG: kv, __fetchImpl: fakeFetch(SAMPLE) };
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(b.enabled, true);
	assert.equal(b.items.length, 1);
	assert.equal(b.items[0].url, "https://n.com/1");
	assert.ok(kv._store.has("news:gnews:ja:v1"), "KVに保存されている");
});

test("KVヒット → GNewsを叩かず即返却", async () => {
	let fetched = false;
	const cached = JSON.stringify({ items: [{ id: "https://c.com/1", url: "https://c.com/1", title: "cached", description: "", image: "", source: "", publishedAt: "" }] });
	const env = {
		NEWS_ENABLED: "true",
		GNEWS_API_KEY: "k",
		CONFIG: memKV({ "news:gnews:ja:v1": cached }),
		__fetchImpl: async () => { fetched = true; return new Response("{}"); },
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(b.items[0].title, "cached");
	assert.equal(fetched, false, "KVヒット時はGNewsを叩かない");
});

test("GNews失敗 → enabled:true, items:[]（障害隔離）", async () => {
	const env = {
		NEWS_ENABLED: "true",
		GNEWS_API_KEY: "k",
		CONFIG: memKV(),
		__fetchImpl: async () => { throw new Error("network"); },
	};
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.enabled, true);
	assert.deepEqual(b.items, []);
});

test("記事0件 → items:[]", async () => {
	const env = { NEWS_ENABLED: "true", GNEWS_API_KEY: "k", CONFIG: memKV(), __fetchImpl: fakeFetch({ articles: [] }) };
	const b = await (await onRequestGet(ctx(env))).json();
	assert.deepEqual(b.items, []);
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `node --test functions/api/news.test.js`
Expected: FAIL（`onRequestGet` 未定義）

- [ ] **Step 3: 最小実装を書く**

Create `functions/api/news.js`:

```javascript
// GET /api/news — GNews(lang=ja)のW杯ニュースを配信。
// NEWS_ENABLED ゲート＋KVキャッシュ30分＋障害隔離。OFF/失敗/空は items:[]（カルーセル非表示）。
import { json } from "../_lib/http.js";
import { fetchGnews } from "../_lib/gnews.js";

const CACHE_KEY = "news:gnews:ja:v1";
const CACHE_TTL_SEC = 1800; // 30分。無料プラン100req/日を遵守。

export async function onRequestGet(context) {
	const { env } = context;
	if (env.NEWS_ENABLED !== "true") {
		return json(200, { enabled: false, items: [] });
	}
	try {
		const kv = env.CONFIG;
		if (kv) {
			const cached = await kv.get(CACHE_KEY);
			if (cached) {
				const parsed = JSON.parse(cached);
				if (parsed && Array.isArray(parsed.items)) {
					return json(200, { enabled: true, items: parsed.items });
				}
			}
		}
		const items = await fetchGnews(env);
		if (kv && items.length > 0) {
			await kv.put(CACHE_KEY, JSON.stringify({ items }), {
				expirationTtl: CACHE_TTL_SEC,
			});
		}
		return json(200, { enabled: true, items });
	} catch (err) {
		console.error("GET /api/news failed:", err?.message);
		return json(200, { enabled: true, items: [] });
	}
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `node --test functions/api/news.test.js`
Expected: PASS（5テスト緑）

- [ ] **Step 5: コミット**

```bash
git add functions/api/news.js functions/api/news.test.js
git commit -m "feat(news): /api/news（NEWS_ENABLEDゲート＋KVキャッシュ30分＋障害隔離）"
```

---

## Task 3: 設定（wrangler.toml ＋ .dev.vars）

**Files:**
- Modify: `wrangler.toml`（`[vars]` セクション）
- Modify: `.dev.vars`（gitignore済・ローカル/テスト用）

- [ ] **Step 1: `[vars]` を確認**

Run: `grep -n "\[vars\]" -A12 wrangler.toml`
Expected: 既存の `[vars]` セクションが見える（`WATCH_ENABLED` 等）。

- [ ] **Step 2: `wrangler.toml` の `[vars]` にニュース設定を追記**

`[vars]` セクション内に以下3行を追加（既存行は変更しない）:

```toml
NEWS_ENABLED = "true"
GNEWS_QUERY = "\"ワールドカップ\" OR \"W杯\""
GNEWS_LANG = "ja"
```

- [ ] **Step 3: `.dev.vars` に APIキー行を追加**

`.dev.vars` に1行追記（値は仮でよい。実検証時に本物へ差し替え）:

```
GNEWS_API_KEY=REPLACE_WITH_REAL_KEY
```

- [ ] **Step 4: コミット（wrangler.tomlのみ。.dev.varsはgitignore）**

```bash
git add wrangler.toml
git commit -m "chore(news): NEWS_ENABLED/GNEWS_QUERY/GNEWS_LANG を [vars] に追加"
```

---

## Task 4: フロント取得関数（`public/data.js`）

**Files:**
- Modify: `public/data.js`（`window.WC` のIIFE内に追加）

- [ ] **Step 1: 追加位置を確認**

Run: `grep -n "window.WC.fetch\|^})();" public/data.js | tail -5`
Expected: IIFE末尾 `})();` の位置と既存 `window.WC.fetch*` 群が見える。

- [ ] **Step 2: `fetchNews` を IIFE末尾 `})();` の直前に追加**

```javascript
	// GET /api/news → {enabled, items}。失敗/OFF/空は [] を返す。
	window.WC.fetchNews = async function fetchNews() {
		try {
			const res = await fetch("/api/news", { cache: "no-store" });
			if (!res.ok) return [];
			const data = await res.json();
			return data && data.enabled && Array.isArray(data.items)
				? data.items
				: [];
		} catch (e) {
			return [];
		}
	};
```

- [ ] **Step 3: 構文チェック**

Run: `node --check public/data.js`
Expected: エラーなし（終了コード0）

- [ ] **Step 4: コミット**

```bash
git add public/data.js
git commit -m "feat(news): data.js に fetchNews を追加"
```

---

## Task 5: カルーセルUI（`public/screens-home.jsx`）

**Files:**
- Modify: `public/screens-home.jsx`（`NewsCarousel`/`NewsCard` 追加・`HomeScreen` 戻り値に挿入・`Object.assign` 更新）

- [ ] **Step 1: `DayTimeline` 関数の直前（208行付近）に `NewsCard` と `NewsCarousel` を追加**

`function DayTimeline({ T, groups }) {` の行の直前に以下を挿入:

```javascript
function NewsCard({ item, onOpen }) {
	const hero = item.image;
	const bgLayer = hero
		? `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.78) 100%), url("${hero}")`
		: "linear-gradient(135deg, #1f2937 0%, #0b3a6b 60%, #061a33 100%)";
	const dateStr = item.publishedAt
		? new Date(item.publishedAt).toLocaleDateString("ja-JP", {
				month: "numeric",
				day: "numeric",
			})
		: "";
	return (
		<button
			type="button"
			onClick={() => onOpen(item)}
			style={{
				flex: "0 0 auto",
				width: 240,
				height: 150,
				position: "relative",
				textAlign: "left",
				border: "none",
				borderRadius: 14,
				padding: 0,
				overflow: "hidden",
				cursor: "pointer",
				scrollSnapAlign: "start",
				backgroundImage: bgLayer,
				backgroundSize: "cover",
				backgroundPosition: "center",
				backgroundColor: "#0b3a6b",
			}}
		>
			{(item.source || dateStr) && (
				<span
					style={{
						position: "absolute",
						top: 8,
						left: 8,
						fontSize: 10,
						fontWeight: 700,
						color: "#fff",
						background: "rgba(0,0,0,0.55)",
						borderRadius: 8,
						padding: "2px 7px",
						maxWidth: 200,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{[item.source, dateStr].filter(Boolean).join(" ・ ")}
				</span>
			)}
			<div
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: 0,
					padding: "10px 12px",
					fontSize: 13,
					fontWeight: 800,
					color: "#fff",
					lineHeight: 1.35,
					textShadow: "0 1px 3px rgba(0,0,0,0.6)",
					display: "-webkit-box",
					WebkitLineClamp: 3,
					WebkitBoxOrient: "vertical",
					overflow: "hidden",
				}}
			>
				{item.title}
			</div>
		</button>
	);
}

function NewsCarousel({ T }) {
	const [items, setItems] = React.useState(null);
	React.useEffect(() => {
		let alive = true;
		if (window.WC.fetchNews) {
			window.WC.fetchNews().then((list) => {
				if (alive) setItems(list);
			});
		} else {
			setItems([]);
		}
		return () => {
			alive = false;
		};
	}, []);

	if (!items || items.length === 0) return null; // 取得前/空は非表示＝既存ホームと同一

	const openArticle = (item) => {
		if (item && item.url) window.open(item.url, "_blank", "noopener");
	};

	return (
		<div style={{ margin: "8px 0 4px" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "0 8px 6px",
				}}
			>
				<span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
					📰 ニュース
				</span>
			</div>
			<div
				style={{
					display: "flex",
					gap: 10,
					overflowX: "auto",
					padding: "0 8px 4px",
					scrollSnapType: "x mandatory",
					WebkitOverflowScrolling: "touch",
				}}
			>
				{items.map((it) => (
					<NewsCard key={it.id} item={it} onOpen={openArticle} />
				))}
			</div>
		</div>
	);
}

```

- [ ] **Step 2: `HomeScreen` 戻り値に `<NewsCarousel>` を挿入**

`<MatchCarousel ... />` の閉じと `<DayTimeline T={T} groups={rest} />` の間に1行追加:

```javascript
			<MatchCarousel
				T={T}
				dateStr={focusGroup.date}
				matches={focusGroup.matches}
				today={today}
			/>
			<NewsCarousel T={T} />
			<DayTimeline T={T} groups={rest} />
```

- [ ] **Step 3: `Object.assign(window, ...)` に `NewsCarousel`/`NewsCard` を追加**

末尾の該当行を以下に変更:

```javascript
Object.assign(window, { HomeScreen, MatchRow, DayTimeline, NewsCarousel, NewsCard });
```

- [ ] **Step 4: 構文チェック（JSXはNodeで直接checkできないため括弧整合のみ目視＋babel変換確認は次タスクのブラウザ検証で）**

Run: `grep -c "function NewsCard\|function NewsCarousel" public/screens-home.jsx`
Expected: `2`

- [ ] **Step 5: コミット**

```bash
git add public/screens-home.jsx
git commit -m "feat(news): NewsCarousel/NewsCard（外部リンク・出典表示）をホームに追加"
```

---

## Task 6: キャッシュバスト（`public/index.html`）

**Files:**
- Modify: `public/index.html`（62行 `data.js?v=21` → `v=22`、140行 `screens-home.jsx?v=18` → `v=19`）

- [ ] **Step 1: `?v` をバンプ**

`data.js?v=21` → `data.js?v=22`、`screens-home.jsx?v=18` → `screens-home.jsx?v=19` に変更。

- [ ] **Step 2: 確認**

Run: `grep -n "data.js?v=\|screens-home.jsx?v=" public/index.html`
Expected: `data.js?v=22` と `screens-home.jsx?v=19`

- [ ] **Step 3: コミット**

```bash
git add public/index.html
git commit -m "chore(news): index.html の data.js/screens-home.jsx を ?v バンプ"
```

---

## Task 7: 全体検証 ＋ PR

**Files:** なし（検証＋git操作）

- [ ] **Step 1: 全テストスイート実行**

Run: `npm test`
Expected: 全テスト緑（gnews 7 + news 5 を含む既存全件）

- [ ] **Step 2: 差分にstray（無関係ファイル）が無いか確認**

Run: `git diff --stat main...HEAD`
Expected: 変更は本計画のファイルのみ（gnews.js/.test、news.js/.test、wrangler.toml、data.js、screens-home.jsx、index.html、docs配下の spec/plan）。

- [ ] **Step 3: push ＋ PR作成**

```bash
git push -u origin feat/home-news-gnews
gh pr create --base main --title "feat(news): ホームニュースをGNews(lang=ja)版に置き換え" \
  --body "PR#53(SportMonks+Vertex版)を廃止し、GNews直叩き＋KVキャッシュの最小実装に置き換え。タップで出典記事を別タブで開く。OFF/失敗/空はカルーセル非表示で非破壊。設計: docs/superpowers/specs/2026-06-17-home-news-gnews-design.md"
```

- [ ] **Step 4: PR#53 をクローズ**

```bash
gh pr close 53 --comment "GNews版(feat/home-news-gnews)へ置き換えのためクローズ。SportMonks+Vertex翻訳構成は廃止。"
```

- [ ] **Step 5: 検証用secret設定（手動・ユーザー作業）**

GNews APIキー取得後:
- `.dev.vars` の `GNEWS_API_KEY` を実キーに差し替え → `npm run dev` でローカル目視。
- Cloudflare Pages ダッシュボード → wcup2026-yosou → Settings → Variables and Secrets → **Preview** に `GNEWS_API_KEY` 追加 → PRのpreviewで目視。
- main merge前に **Production** にも `GNEWS_API_KEY` 設定。

---

## Self-Review（記入済み）

**1. Spec coverage:**
- gnews.js（lang=ja・q・max=10・sortby・正規化・APIキー欠如縮退）→ Task 1 ✓
- news.js（NEWS_ENABLEDゲート・KVキャッシュ30分・障害隔離・空非表示）→ Task 2 ✓
- 設定（NEWS_ENABLED/GNEWS_QUERY/GNEWS_LANG/secret）→ Task 3 ✓
- フロント fetchNews → Task 4 ✓
- NewsCarousel/NewsCard・外部リンク・NewsSheet/Hero廃止 → Task 5（mainに存在しないため「追加」＝廃止は自動達成）✓
- ?vバンプ → Task 6 ✓
- テスト・PR・PR#53クローズ・secret手順 → Task 7 ✓

**2. Placeholder scan:** `.dev.vars` の `REPLACE_WITH_REAL_KEY` は意図的なローカル仮値（実キーはユーザー設定）。コード/テストにプレースホルダなし。

**3. Type consistency:** 正規化オブジェクト `{id,title,description,url,image,source,publishedAt}` は Task1（gnews.js）・Task2（news.js テスト/キャッシュ）・Task5（NewsCard が `item.image`/`item.title`/`item.source`/`item.publishedAt`/`item.url`、key=`item.id`）で一貫。`fetchNews` の戻り値（items配列）も Task4→Task5 で一致。
