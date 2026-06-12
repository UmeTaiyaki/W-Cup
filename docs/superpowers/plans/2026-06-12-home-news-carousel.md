# ホーム ニュースカルーセル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームの試合カルーセル下に、SportMonks の W杯ニュース(pre/post)を日本語訳＋licensedヒーロー画像付きで横スクロール表示し、タップで日本語本文を展開する。

**Architecture:** `/api/player` と同型のオンデマンド Pages Function `/api/news`。一覧は SportMonks の season ニュースを統合＋タイトル日本語訳(KVキャッシュ)。本文はタップ時に fixture include で lines＋得点者写真＋venue＋スコアを1コールで取得し日本語訳。D1スキーマ・Cron変更なし。`NEWS_ENABLED` フラグで OFF時は完全非表示。

**Tech Stack:** Cloudflare Pages Functions (ESM), SportMonks Football API v3, **Vertex AI (既存 `GCP_SERVICE_ACCOUNT` 認証を流用・grounding無し翻訳)**, Cloudflare KV (env.CONFIG), React 18 UMD + Babel (public/*.jsx), vitest。

**翻訳認証の方針:** 新規 Gemini API キーは作らず、worker-watch で本番稼働中の **GCP サービスアカウント認証**(`GCP_SERVICE_ACCOUNT` secret・JSON)を Pages 側にも登録して流用する。トークン発行は既存 `mintGcpAccessToken`(`functions/_lib/gcp-auth.js`)を再利用。`callVertexText`(ai-match.js)は grounding/温度がハードコードのため翻訳では使わず、grounding 無し・低温度の専用 Vertex 呼び出しを sm-news-i18n.js 内に持つ(match-ai 側は不変)。

**前提コマンド:** テストは `npm test`(vitest)。単体実行は `npx vitest run functions/_lib/<name>.test.js`。

---

### Task 1: sm-news.js 純関数(一覧統合・本文連結・ヒーロー選定・キャッシュキー)

**Files:**
- Create: `functions/_lib/sm-news.js`
- Test: `functions/_lib/sm-news.test.js`

- [ ] **Step 1: 失敗するテストを書く** — `functions/_lib/sm-news.test.js`

```js
import { describe, it, expect } from "vitest";
import { mergeNewsList, joinLines, pickHero, translationCacheKey, newsBodyInclude } from "./sm-news.js";

describe("mergeNewsList", () => {
  it("pre/post 統合・post 先頭・各群 fixture_id 昇順で安定整列", () => {
    const pre = [ { id: 2, fixture_id: 20, title: "P20", type: "prematch" }, { id: 1, fixture_id: 10, title: "P10", type: "prematch" } ];
    const post = [ { id: 9, fixture_id: 30, title: "R30", type: "postmatch" } ];
    const out = mergeNewsList(pre, post);
    expect(out.map((x) => x.newsitem_id)).toEqual([9, 1, 2]);
    expect(out[0]).toMatchObject({ fixture_id: 30, type: "postmatch", title_en: "R30" });
  });
  it("同一 newsitem_id を重複排除", () => {
    const dup = [ { id: 5, fixture_id: 1, title: "A", type: "prematch" } ];
    expect(mergeNewsList(dup, dup.map((x) => ({ ...x })))).toHaveLength(1);
  });
  it("非配列入力でも空配列", () => { expect(mergeNewsList(null, undefined)).toEqual([]); });
});

describe("joinLines", () => {
  it("text を順序保持で連結し空/空白を除去", () => {
    const lines = [ { text: "First." }, { text: "  " }, { text: "Second." }, { text: null } ];
    expect(joinLines(lines)).toBe("First.\n\nSecond.");
  });
  it("非配列は空文字", () => { expect(joinLines(undefined)).toBe(""); });
});

describe("pickHero", () => {
  it("得点者写真を最優先", () => {
    const detail = { events: [ { type_id: 14, player: { image_path: "p.png", name: "Scorer" } } ], venue: { image_path: "v.png" }, participants: [ { image_path: "c1.png" }, { image_path: "c2.png" } ] };
    expect(pickHero(detail)).toMatchObject({ kind: "player", url: "p.png" });
  });
  it("得点者無→venue", () => { expect(pickHero({ venue: { image_path: "v.png" } })).toMatchObject({ kind: "venue", url: "v.png" }); });
  it("全欠損→null", () => { expect(pickHero({})).toBeNull(); });
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
```

- [ ] **Step 2: 失敗確認** — Run: `npx vitest run functions/_lib/sm-news.test.js` / Expected: FAIL(未作成)

- [ ] **Step 3: 最小実装** — `functions/_lib/sm-news.js`

```js
// ホームニュースカルーセル用の純関数群。副作用なし・ネットワーク非依存。
// 一覧は SportMonks の season ニュース(pre/post)を統合、本文は fixture include の lines。

// ゴール系 type_id(livescore メモリ: 14=Goal,16=Penalty,23=PKGoal)
const GOAL_TYPE_IDS = new Set([14, 16, 23]);

// pre/post を統合し表示順に整列。各要素: { newsitem_id, fixture_id, type, title_en }
export function mergeNewsList(pre, post) {
  const norm = (arr, type) =>
    (Array.isArray(arr) ? arr : []).map((n) => ({
      newsitem_id: n.id,
      fixture_id: n.fixture_id,
      type: n.type || type,
      title_en: n.title || "",
    }));
  const all = [...norm(post, "postmatch"), ...norm(pre, "prematch")];
  const seen = new Set();
  const deduped = [];
  for (const item of all) {
    if (seen.has(item.newsitem_id)) continue;
    seen.add(item.newsitem_id);
    deduped.push(item);
  }
  const rank = (t) => (t === "postmatch" ? 0 : 1);
  return deduped
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x.type) - rank(b.x.type) || (a.x.fixture_id ?? 0) - (b.x.fixture_id ?? 0) || a.i - b.i)
    .map(({ x }) => x);
}

// lines[].text を順序保持で連結(空・空白行は除去)。段落間は空行。
export function joinLines(lines) {
  if (!Array.isArray(lines)) return "";
  return lines
    .map((l) => (l && typeof l.text === "string" ? l.text.trim() : ""))
    .filter((t) => t.length > 0)
    .join("\n\n");
}

// fixture 詳細からヒーロー画像を選定(得点者写真→venue→エンブレム→null)。
export function pickHero(detail) {
  const events = Array.isArray(detail?.events) ? detail.events : [];
  const scorer = events.find((e) => GOAL_TYPE_IDS.has(e?.type_id) && e?.player?.image_path);
  if (scorer) {
    return { kind: "player", url: scorer.player.image_path, alt: scorer.player.display_name || scorer.player.name || "" };
  }
  if (detail?.venue?.image_path) {
    return { kind: "venue", url: detail.venue.image_path, alt: detail.venue.name || "" };
  }
  const parts = Array.isArray(detail?.participants) ? detail.participants : [];
  if (parts[0]?.image_path && parts[1]?.image_path) {
    return { kind: "crest", url: parts[0].image_path, url2: parts[1].image_path, alt: "" };
  }
  return null;
}

// 翻訳結果の KV キー(記事内容は不変なので永続)。
export function translationCacheKey(newsitemId, kind) {
  return `news:tr:ja:${newsitemId}:${kind}`;
}

// 本文モードの SportMonks include を type で切替。
export function newsBodyInclude(type) {
  const newsInc = type === "prematch" ? "prematchNews.lines" : "postmatchNews.lines";
  return `${newsInc};participants;venue;scores;events.player`;
}
```

- [ ] **Step 4: 通過確認** — Run: `npx vitest run functions/_lib/sm-news.test.js` / Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/sm-news.js functions/_lib/sm-news.test.js
git commit -m "feat(news): sm-news 純関数(一覧統合/本文連結/ヒーロー選定/キャッシュキー)"
```

---

### Task 2: sm-news-i18n.js 翻訳レイヤー(KVキャッシュ＋Vertex AI・grounding無し)

**Files:**
- Create: `functions/_lib/sm-news-i18n.js`
- Test: `functions/_lib/sm-news-i18n.test.js`

**設計メモ:** トークン発行(`mintGcpAccessToken`)はハンドラ側で1回だけ行い、`translateToJa` には
発行済みの `vertex = { accessToken, project, location, fetchImpl }` を渡す(一覧の N 件翻訳で
トークン二重発行を避ける)。`vertex` が null(SA 未設定/発行失敗)なら翻訳せず原文(英語)を返す。

- [ ] **Step 1: 失敗するテストを書く** — `functions/_lib/sm-news-i18n.test.js`

```js
import { describe, it, expect, vi } from "vitest";
import { translateToJa, vertexGenerateUrl } from "./sm-news-i18n.js";

function fakeKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    put: vi.fn(async (k, v) => void store.set(k, v)),
    _store: store,
  };
}
// Vertex generateContent 応答スタブ
const okVertex = (text) => vi.fn(async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) }));
const vertex = (fetchImpl) => ({ accessToken: "tok", project: "proj", location: "global", fetchImpl });

describe("vertexGenerateUrl", () => {
  it("global は aiplatform.googleapis.com", () => {
    expect(vertexGenerateUrl("proj", "global", "gemini-2.5-flash")).toBe(
      "https://aiplatform.googleapis.com/v1/projects/proj/locations/global/publishers/google/models/gemini-2.5-flash:generateContent",
    );
  });
  it("region は {loc}-aiplatform", () => {
    expect(vertexGenerateUrl("proj", "us-central1", "m")).toContain("us-central1-aiplatform.googleapis.com");
  });
});

describe("translateToJa", () => {
  it("KV ヒット時は Vertex を呼ばず即返し", async () => {
    const kv = fakeKv({ "news:tr:ja:1:title": "日本語済み" });
    const fetchImpl = vi.fn();
    const out = await translateToJa("Hello", { kv, cacheKey: "news:tr:ja:1:title", vertex: vertex(fetchImpl) });
    expect(out).toBe("日本語済み");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("KV ミス時は翻訳して KV 保存し訳文返し(grounding 無し・低温度のボディ)", async () => {
    const kv = fakeKv();
    const fetchImpl = okVertex("メキシコが勝利");
    const out = await translateToJa("Mexico won", { kv, cacheKey: "news:tr:ja:2:title", vertex: vertex(fetchImpl) });
    expect(out).toBe("メキシコが勝利");
    expect(kv.put).toHaveBeenCalledWith("news:tr:ja:2:title", "メキシコが勝利");
    const sentBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sentBody.tools).toBeUndefined(); // grounding を付けない
    expect(sentBody.generationConfig.temperature).toBe(0.2);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });
  it("翻訳失敗(HTTP不可)時は原文を返し落ちない", async () => {
    const kv = fakeKv();
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, text: async () => "err" }));
    const out = await translateToJa("Fallback EN", { kv, cacheKey: "news:tr:ja:3:title", vertex: vertex(fetchImpl) });
    expect(out).toBe("Fallback EN");
  });
  it("vertex 無し(null)は翻訳せず原文返し", async () => {
    const out = await translateToJa("No vertex", { kv: fakeKv(), cacheKey: "x", vertex: null });
    expect(out).toBe("No vertex");
  });
  it("空文字は空文字", async () => {
    expect(await translateToJa("", { kv: fakeKv(), cacheKey: "x", vertex: vertex(vi.fn()) })).toBe("");
  });
});
```

- [ ] **Step 2: 失敗確認** — Run: `npx vitest run functions/_lib/sm-news-i18n.test.js` / Expected: FAIL

- [ ] **Step 3: 最小実装** — `functions/_lib/sm-news-i18n.js`

```js
// SportMonks 英語ニュースの日本語訳。Vertex AI(既存 GCP サービスアカウント認証を流用)。
// grounding 無し・低温度。KV(env.CONFIG)で1回だけ翻訳。トークン発行はハンドラ側で実施し
// 発行済み accessToken を vertex で受け取る。失敗・vertex 欠如時は原文(英語)を返し、
// ホーム本体には決して波及させない。

const TRANSLATE_MODEL = "gemini-2.5-flash";
const PROMPT = (text) => `次のサッカーのニュース文を自然な日本語に翻訳してください。固有名詞(チーム名・選手名・大会名)は一般的な日本語表記にし、訳文のみを返してください(前置き・引用符・注釈は不要)。\n\n${text}`;

// Vertex generateContent の URL。location=global は無印ホスト、それ以外は {loc}-aiplatform。
export function vertexGenerateUrl(project, location, model) {
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

function extractText(jsonBody) {
  const parts = jsonBody?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => p?.text || "").join("").trim();
}

// text を日本語化。
// 引数: { kv:KVNamespace, cacheKey:string, vertex:{accessToken,project,location?,model?,fetchImpl?}|null }
export async function translateToJa(text, { kv, cacheKey, vertex } = {}) {
  const src = typeof text === "string" ? text : "";
  if (!src.trim()) return src;
  if (kv && cacheKey) {
    try {
      const hit = await kv.get(cacheKey);
      if (hit) return hit;
    } catch (e) {
      console.error("news i18n: KV get failed", e?.message);
    }
  }
  if (!vertex || !vertex.accessToken || !vertex.project) return src; // 翻訳不可 → 英語フォールバック
  const model = vertex.model || TRANSLATE_MODEL;
  const location = vertex.location || "global";
  const doFetch = vertex.fetchImpl || fetch;
  try {
    const res = await doFetch(vertexGenerateUrl(vertex.project, location, model), {
      method: "POST",
      headers: { Authorization: `Bearer ${vertex.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: PROMPT(src) }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });
    if (!res.ok) { console.error("news i18n: Vertex HTTP", res.status); return src; }
    const body = await res.json();
    const ja = extractText(body);
    if (!ja) return src;
    if (kv && cacheKey) {
      try { await kv.put(cacheKey, ja); } catch (e) { console.error("news i18n: KV put failed", e?.message); }
    }
    return ja;
  } catch (e) {
    console.error("news i18n: translate failed", e?.message);
    return src;
  }
}
```

- [ ] **Step 4: 通過確認** — Run: `npx vitest run functions/_lib/sm-news-i18n.test.js` / Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/sm-news-i18n.js functions/_lib/sm-news-i18n.test.js
git commit -m "feat(news): 日本語翻訳レイヤー(KVキャッシュ+Vertex AI流用・英語フォールバック)"
```

---

### Task 3: /api/news.js ハンドラ(一覧/本文・ゲート・縮退・キャッシュ)

**Files:**
- Create: `functions/api/news.js`
- Test: `functions/api/news.test.js`

**設計メモ:**
- 一覧: season(WC_SEASON_ID||26618) の pre/post→mergeNewsList→title 翻訳→`{enabled:true, items:[...]}`。
- 本文(`?id=&type=`): fixture include 1コール→該当 news の lines→joinLines→翻訳、pickHero、result_info→`{enabled:true, body:{...}}`。
- ゲート: `env.NEWS_ENABLED !== "true"` で `{enabled:false, items:[]}`。
- **翻訳認証**: `env.GCP_SERVICE_ACCOUNT`(JSON) をパースし、リクエスト先頭で `mintGcpAccessToken` で
  トークンを **1回だけ** 発行→`vertex = { accessToken, project, location, fetchImpl }` を全 `translateToJa` に渡す。
  SA 未設定/JSON 不正/発行失敗時は `vertex=null`→英語フォールバック(縮退・500 にしない)。
  project は `env.GCP_PROJECT || sa.project_id`、location は `env.GCP_LOCATION || "global"`。

- [ ] **Step 1: 失敗するテストを書く** — `functions/api/news.test.js`

```js
import { describe, it, expect, vi } from "vitest";
import { onRequestGet } from "./news.js";

const req = (url) => new Request(url);
const fakeKv = () => ({ get: vi.fn(async () => null), put: vi.fn(async () => {}) });
// 最小ダミー SA(JSON 文字列)。token 発行 fetch と Vertex 翻訳 fetch を兼ねたスタブで処理。
const SA = JSON.stringify({ client_email: "svc@proj.iam", private_key: "PK", project_id: "proj" });

// SportMonks / GCP token / Vertex を URL で分岐する fetch スタブ
function makeFetch({ pre = [], post = [], fixture = null, ja = "JA" } = {}) {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) return { ok: true, json: async () => ({ access_token: "tok", expires_in: 3600 }) };
    if (u.includes("aiplatform.googleapis.com")) return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: ja }] } }] }) };
    if (u.includes("/news/pre-match/seasons/")) return { ok: true, json: async () => ({ data: pre }) };
    if (u.includes("/news/post-match/seasons/")) return { ok: true, json: async () => ({ data: post }) };
    if (u.includes("/fixtures/")) return { ok: true, json: async () => ({ data: fixture }) };
    return { ok: false, status: 404, text: async () => "nf" };
  });
}

describe("GET /api/news", () => {
  it("NEWS_ENABLED 未設定なら enabled:false", async () => {
    const res = await onRequestGet({ env: {}, request: req("https://x/api/news") });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ enabled: false, items: [] });
  });
  it("一覧モード: pre/post 統合しタイトル日本語訳を付与(SA 認証で翻訳)", async () => {
    const env = { NEWS_ENABLED: "true", SPORTMONKS_TOKEN: "t", GCP_SERVICE_ACCOUNT: SA, CONFIG: fakeKv(),
      __fetchImpl: makeFetch({ post: [{ id: 9, fixture_id: 30, title: "R", type: "postmatch" }], pre: [{ id: 1, fixture_id: 10, title: "P", type: "prematch" }], ja: "日本語訳" }) };
    const res = await onRequestGet({ env, request: req("https://x/api/news") });
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.items[0]).toMatchObject({ newsitem_id: 9, title_ja: "日本語訳" });
    expect(res.headers.get("cache-control")).toContain("s-maxage");
  });
  it("本文モード: lines を連結・翻訳しヒーローを返す", async () => {
    const fixture = { id: 30, result_info: "Mexico won after full-time.", postmatchnews: [{ id: 9, lines: [{ text: "Mexico won." }] }], events: [{ type_id: 14, player: { image_path: "p.png", name: "S" } }], venue: { image_path: "v.png" }, participants: [{ image_path: "c1.png" }, { image_path: "c2.png" }] };
    const env = { NEWS_ENABLED: "true", SPORTMONKS_TOKEN: "t", GCP_SERVICE_ACCOUNT: SA, CONFIG: fakeKv(), __fetchImpl: makeFetch({ fixture, ja: "メキシコ勝利" }) };
    const res = await onRequestGet({ env, request: req("https://x/api/news?id=30&type=postmatch") });
    const body = await res.json();
    expect(body.body.body_ja).toBe("メキシコ勝利");
    expect(body.body.hero).toMatchObject({ kind: "player", url: "p.png" });
  });
  it("GCP_SERVICE_ACCOUNT 無しでも 200・英語フォールバック(title_ja=英語)", async () => {
    const env = { NEWS_ENABLED: "true", SPORTMONKS_TOKEN: "t", CONFIG: fakeKv(),
      __fetchImpl: makeFetch({ post: [{ id: 9, fixture_id: 30, title: "EN only", type: "postmatch" }] }) };
    const res = await onRequestGet({ env, request: req("https://x/api/news") });
    const body = await res.json();
    expect(body.items[0].title_ja).toBe("EN only");
  });
  it("本文モード不正id は 400", async () => {
    const env = { NEWS_ENABLED: "true", SPORTMONKS_TOKEN: "t", CONFIG: fakeKv() };
    const res = await onRequestGet({ env, request: req("https://x/api/news?id=abc&type=postmatch") });
    expect(res.status).toBe(400);
  });
  it("SportMonks 失敗でも 200 で空(縮退)", async () => {
    const env = { NEWS_ENABLED: "true", SPORTMONKS_TOKEN: "t", CONFIG: fakeKv(), __fetchImpl: vi.fn(async () => ({ ok: false, status: 500, text: async () => "e" })) };
    const res = await onRequestGet({ env, request: req("https://x/api/news") });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ enabled: true, items: [] });
  });
});
```

- [ ] **Step 2: 失敗確認** — Run: `npx vitest run functions/api/news.test.js` / Expected: FAIL

- [ ] **Step 3: 最小実装** — `functions/api/news.js`

```js
// GET /api/news — ホーム用 W杯ニュース配信。NEWS_ENABLED ゲート＋障害隔離。
//  - 一覧: news/{pre,post}-match/seasons/{seasonId} を統合＋タイトル日本語訳。
//  - 本文(?id=&type=): fixture include で lines＋得点者写真＋venue＋スコアを1コール取得し日本語訳。
//  - 翻訳は既存 GCP サービスアカウント(GCP_SERVICE_ACCOUNT)を流用し Vertex AI へ(grounding 無し)。
import { json } from "../_lib/http.js";
import { createSportmonks } from "../_lib/sportmonks.js";
import { mintGcpAccessToken } from "../_lib/gcp-auth.js";
import { mergeNewsList, joinLines, pickHero, translationCacheKey, newsBodyInclude } from "../_lib/sm-news.js";
import { translateToJa } from "../_lib/sm-news-i18n.js";

const LIST_CACHE = "public, s-maxage=1800, stale-while-revalidate=3600";
const BODY_CACHE = "public, s-maxage=21600, stale-while-revalidate=86400";

function newsByType(fixture, type) {
  const arr = type === "prematch" ? fixture?.prematchnews : fixture?.postmatchnews;
  return Array.isArray(arr) ? arr[0] : null;
}

// GCP_SERVICE_ACCOUNT からトークンを1回発行し vertex 設定を返す。未設定/失敗は null(英語フォールバック)。
async function buildVertex(env) {
  const raw = env.GCP_SERVICE_ACCOUNT;
  if (!raw) return null;
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    console.error("/api/news: GCP_SERVICE_ACCOUNT invalid JSON");
    return null;
  }
  try {
    const { token } = await mintGcpAccessToken({
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
      fetchImpl: env.__fetchImpl,
    });
    return {
      accessToken: token,
      project: env.GCP_PROJECT || sa.project_id,
      location: env.GCP_LOCATION || "global",
      model: env.NEWS_TRANSLATE_MODEL || undefined,
      fetchImpl: env.__fetchImpl,
    };
  } catch (e) {
    console.error("/api/news: token mint failed", e?.message);
    return null;
  }
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (env.NEWS_ENABLED !== "true") {
    return json(200, { enabled: false, items: [] }, { "cache-control": "public, s-maxage=60" });
  }
  if (!env.SPORTMONKS_TOKEN) {
    return json(200, { enabled: true, items: [], note: "no-token" });
  }
  const url = new URL(request.url);
  const idParam = url.searchParams.get("id");
  const seasonId = env.WC_SEASON_ID || "26618";
  const kv = env.CONFIG || null;
  const sm = createSportmonks({ token: env.SPORTMONKS_TOKEN, fetchImpl: env.__fetchImpl });

  // ── 本文モード ──
  if (idParam != null) {
    const id = Number(idParam);
    const type = url.searchParams.get("type") === "prematch" ? "prematch" : "postmatch";
    if (!Number.isInteger(id) || id <= 0) {
      return json(400, { enabled: true, body: null, error: "invalid id" });
    }
    try {
      const [res, vertex] = await Promise.all([
        sm.get(`fixtures/${id}`, { include: newsBodyInclude(type) }),
        buildVertex(env),
      ]);
      const fx = res?.data;
      const item = newsByType(fx, type);
      const titleEn = item?.title || "";
      const bodyEn = joinLines(item?.lines);
      const [titleJa, bodyJa] = await Promise.all([
        translateToJa(titleEn, { kv, cacheKey: translationCacheKey(item?.id, "title"), vertex }),
        translateToJa(bodyEn, { kv, cacheKey: translationCacheKey(item?.id, "body"), vertex }),
      ]);
      return json(200, { enabled: true, body: { title_ja: titleJa, body_ja: bodyJa, hero: pickHero(fx), scoreline: fx?.result_info || "" } }, { "cache-control": BODY_CACHE });
    } catch (err) {
      console.error("GET /api/news body failed:", err?.message);
      return json(200, { enabled: true, body: null, note: "unavailable" });
    }
  }

  // ── 一覧モード ──
  try {
    const [preRes, postRes, vertex] = await Promise.all([
      sm.get(`news/pre-match/seasons/${seasonId}`),
      sm.get(`news/post-match/seasons/${seasonId}`),
      buildVertex(env),
    ]);
    const merged = mergeNewsList(preRes?.data, postRes?.data);
    const items = await Promise.all(
      merged.map(async (it) => ({
        ...it,
        title_ja: await translateToJa(it.title_en, { kv, cacheKey: translationCacheKey(it.newsitem_id, "title"), vertex }),
      })),
    );
    return json(200, { enabled: true, items }, { "cache-control": LIST_CACHE });
  } catch (err) {
    console.error("GET /api/news list failed:", err?.message);
    return json(200, { enabled: true, items: [], note: "unavailable" });
  }
}
```

- [ ] **Step 4: 通過確認** — Run: `npx vitest run functions/api/news.test.js` / Expected: PASS
  - 注意: `mintGcpAccessToken` は WebCrypto(RS256)で実署名するため、テストのダミー private_key では
    署名段階で例外になり得る。その場合 `buildVertex` が null を返し英語フォールバック(縮退)で 200。
    翻訳済みを検証するテスト(一覧/本文の `日本語訳`/`メキシコ勝利`)が token 発行に依存するなら、
    `mintGcpAccessToken` を vi.mock する（`vi.mock("../_lib/gcp-auth.js", () => ({ mintGcpAccessToken: async () => ({ token: "tok", expiresAt: 9e9 }) }))`）。
    実装者は WebCrypto 可否に応じて vi.mock を採用すること。

- [ ] **Step 5: 全体テストとコミット**

```bash
npm test
git add functions/api/news.js functions/api/news.test.js
git commit -m "feat(news): /api/news ハンドラ(一覧/本文・NEWS_ENABLEDゲート・障害隔離)"
```

---

### Task 4: data.js にフェッチャ追加(fetchNews / fetchNewsBody)

**Files:**
- Modify: `public/data.js`(`window.WC.fetchPlayerProfile = ...` 定義の直後に追加)

- [ ] **Step 1: 実装を追加**

```js
  // /api/news 一覧。OFF/失敗/空は [] を返す(ホーム本体に波及させない)。
  window.WC.fetchNews = async function fetchNews() {
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      return data && data.enabled && Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      return [];
    }
  };

  // /api/news 本文(fixtureId, type)。失敗/OFF は null。
  window.WC.fetchNewsBody = async function fetchNewsBody(fixtureId, type) {
    try {
      const res = await fetch("/api/news?id=" + encodeURIComponent(fixtureId) + "&type=" + encodeURIComponent(type || "postmatch"), { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.enabled ? data.body || null : null;
    } catch (e) {
      return null;
    }
  };
```

- [ ] **Step 2: 構文スモーク** — Run: `node --check public/data.js` / Expected: exit 0

- [ ] **Step 3: コミット**

```bash
git add public/data.js
git commit -m "feat(news): data.js に fetchNews/fetchNewsBody を追加"
```

---

### Task 5: NewsCarousel / NewsCard を screens-home.jsx に追加し HomeScreen に挿入

**Files:**
- Modify: `public/screens-home.jsx`(末尾 `Object.assign(window, {...})` 直前に追加、`HomeScreen` return 修正)

**設計メモ:** 一覧カードは軽量に。fixture_id→match の逆引きは `window.WC.SCHEDULE` 走査＋`window.WC.fixtureIdForMatch` で best-effort(取れなければクレスト無し)。クレストは `window.WC.Flag`。

- [ ] **Step 1: NewsCarousel/NewsCard を追加**(`Object.assign` 直前)

```jsx
// fixture_id → SCHEDULE の match を逆引き(best-effort・無ければ null)
function matchByFixtureId(fixtureId) {
  const sched = window.WC.SCHEDULE || [];
  for (const m of sched) {
    if (window.WC.fixtureIdForMatch && window.WC.fixtureIdForMatch(m) === fixtureId) return m;
  }
  return null;
}

const NEWS_TYPE_LABEL = { prematch: "プレビュー", postmatch: "レポート" };

function NewsCard({ T, item, onOpen }) {
  const m = matchByFixtureId(item.fixture_id);
  const a = m && window.WC.formatMatchTeam ? window.WC.formatMatchTeam(m.a, window.WC.TEAM || {}, m.round) : null;
  const b = m && window.WC.formatMatchTeam ? window.WC.formatMatchTeam(m.b, window.WC.TEAM || {}, m.round) : null;
  return (
    <button type="button" onClick={() => onOpen(item)} style={{ flex: "0 0 auto", width: 220, textAlign: "left", background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 12, cursor: "pointer", scrollSnapAlign: "start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, minHeight: 28 }}>
        {a && a.resolved && <window.WC.Flag code={a.code} size={22} />}
        {a && b && <span style={{ fontSize: 12, color: T.sub }}>vs</span>}
        {b && b.resolved && <window.WC.Flag code={b.code} size={22} />}
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: T.sub, border: `1px solid ${T.border}`, borderRadius: 8, padding: "2px 6px" }}>{NEWS_TYPE_LABEL[item.type] || "ニュース"}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title_ja || item.title_en}</div>
    </button>
  );
}

function NewsCarousel({ T }) {
  const [items, setItems] = React.useState(null);
  const [open, setOpen] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    if (window.WC.fetchNews) {
      window.WC.fetchNews().then((list) => { if (alive) setItems(list); });
    } else { setItems([]); }
    return () => { alive = false; };
  }, []);
  if (!items || items.length === 0) return null; // 取得前/空は非表示＝既存ホームと同一
  return (
    <div style={{ margin: "8px 0 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px 6px" }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>📰 ニュース</span>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "0 8px 4px", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
        {items.map((it) => (<NewsCard key={it.newsitem_id} T={T} item={it} onOpen={setOpen} />))}
      </div>
      {open && <window.WC.NewsSheet T={T} item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: HomeScreen の return を修正**(MatchCarousel と DayTimeline の間に挿入)

```jsx
  return (
    <div>
      <MatchCarousel T={T} dateStr={focusGroup.date} matches={focusGroup.matches} today={today} />
      <NewsCarousel T={T} />
      <DayTimeline T={T} groups={rest} />
    </div>
  );
```

- [ ] **Step 3: export 追加**

```jsx
Object.assign(window, { HomeScreen, MatchRow, DayTimeline, NewsCarousel, NewsCard });
```

- [ ] **Step 4: 構文スモーク** — Run: ローカル `wrangler pages dev public --port 8799` 起動でコンパイルエラー無し(Task 8 で目視)

- [ ] **Step 5: コミット**

```bash
git add public/screens-home.jsx
git commit -m "feat(news): ホームに NewsCarousel を挿入(試合カルーセル下)・空/失敗時は非表示"
```

---

### Task 6: NewsSheet(本文展開・ヒーロー画像・試合を見る)

**Files:**
- Modify: `public/screens-home.jsx`(NewsCarousel の前に `NewsHero`/`NewsSheet` を追加、export に含める)

- [ ] **Step 1: NewsHero / NewsSheet を追加**

```jsx
function NewsHero({ hero, T }) {
  if (!hero) return null;
  const common = { width: "100%", height: 160, objectFit: "cover", borderRadius: 12, background: T.bg };
  if (hero.kind === "crest") {
    return (
      <div style={{ display: "flex", justifyContent: "center", gap: 24, alignItems: "center", height: 160 }}>
        <img src={hero.url} alt="" style={{ width: 64, height: 64, objectFit: "contain" }} />
        <span style={{ color: T.sub }}>vs</span>
        <img src={hero.url2} alt="" style={{ width: 64, height: 64, objectFit: "contain" }} />
      </div>
    );
  }
  return <img src={hero.url} alt={hero.alt || ""} style={common} onError={(e) => { e.currentTarget.style.display = "none"; }} />;
}

function NewsSheet({ T, item, onClose }) {
  const [body, setBody] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    if (window.WC.fetchNewsBody) {
      window.WC.fetchNewsBody(item.fixture_id, item.type).then((b) => { if (alive) { setBody(b); setLoading(false); } });
    } else { setLoading(false); }
    return () => { alive = false; };
  }, [item.fixture_id, item.type]);
  const canOpenDetail = typeof window.WC.openDetail === "function";
  return (
    <window.WC.Sheet open onClose={onClose} T={T} title={NEWS_TYPE_LABEL[item.type] || "ニュース"}>
      <div style={{ padding: "4px 4px 16px" }}>
        <NewsHero hero={body && body.hero} T={T} />
        <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: "12px 0 8px", lineHeight: 1.4 }}>{(body && body.title_ja) || item.title_ja || item.title_en}</h3>
        {body && body.scoreline && (<div style={{ fontSize: 12, color: T.sub, marginBottom: 8 }}>{body.scoreline}</div>)}
        {loading ? (
          <div style={{ color: T.sub, fontSize: 13, padding: "16px 0" }}>読み込み中…</div>
        ) : body && body.body_ja ? (
          <p style={{ fontSize: 14, color: T.text, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{body.body_ja}</p>
        ) : (
          <div style={{ color: T.sub, fontSize: 13 }}>本文を取得できませんでした</div>
        )}
        {canOpenDetail && (
          <button type="button" onClick={() => { onClose(); window.WC.openDetail(item.fixture_id); }} style={{ marginTop: 16, width: "100%", padding: "12px", borderRadius: 12, border: "none", background: T.accent || "#2563eb", color: "#fff", fontWeight: 800, cursor: "pointer" }}>試合を見る</button>
        )}
      </div>
    </window.WC.Sheet>
  );
}
```

- [ ] **Step 2: export に NewsSheet/NewsHero を追加**

```jsx
Object.assign(window, { HomeScreen, MatchRow, DayTimeline, NewsCarousel, NewsCard, NewsSheet, NewsHero });
```

- [ ] **Step 3: 構文スモーク** — ローカル起動でコンソールエラー無し(Task 8 で目視)

- [ ] **Step 4: コミット**

```bash
git add public/screens-home.jsx
git commit -m "feat(news): NewsSheet で日本語本文展開＋ヒーロー画像＋『試合を見る』導線"
```

---

### Task 7: index.html の ?v=N バンプ(jsx 変更の反映に必須)

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: 現在の v を確認** — Run: `grep -n "screens-home.jsx?v=\|data.js?v=" public/index.html`
- [ ] **Step 2: 全アセット `?v=<現在値>` を `+1` に統一更新**(deploy-flow メモリの必須手順)
- [ ] **Step 3: コミット**

```bash
git add public/index.html
git commit -m "chore(news): index.html の ?v をバンプ(jsx反映)"
```

---

### Task 8: 全体検証・PR・Preview デプロイ

- [ ] **Step 1: 全テスト緑** — Run: `npm test` / Expected: 全 PASS
- [ ] **Step 2: ローカル目視(任意・モック)** — `.dev.vars` に `NEWS_ENABLED=true`＋`GCP_SERVICE_ACCOUNT=<SA JSON 1行>`＋必要なら `GCP_PROJECT`/`GCP_LOCATION`(gitignore済。worker-watch で使っている SA を流用)、`wrangler pages dev public --port 8799` 起動。`service_workers="block"` で目視。SA 未設定でも英語フォールバックで動く。
- [ ] **Step 3: PR 作成(base=main)**

```bash
git push -u origin feat/home-news-carousel
gh pr create --base main --title "feat(news): ホーム ニュースカルーセル(SM+Gemini日本語訳+licensedヒーロー)" --body "設計: docs/superpowers/specs/2026-06-12-home-news-carousel-design.md / 計画: docs/superpowers/plans/2026-06-12-home-news-carousel.md。NEWS_ENABLED=false 既定。Preview で確認後に本番判断。"
```

- [ ] **Step 4: Preview 環境設定** — Cloudflare Pages Preview に `NEWS_ENABLED=true`＋secret `GCP_SERVICE_ACCOUNT`(worker-watch と同じ SA JSON を `wrangler pages secret put GCP_SERVICE_ACCOUNT --project-name wcup2026-yosou`)。必要なら var `GCP_LOCATION`/`GCP_PROJECT`。`SPORTMONKS_TOKEN` 流用。⚠️ secret は次回デプロイ時取り込み→設定後に再デプロイ。Preview URL: `https://pr-<N>.wcup2026-yosou.pages.dev`。
- [ ] **Step 5: Preview 目視チェックリスト**
  - [ ] 試合カルーセル下にニュースカルーセル表示
  - [ ] タイトル日本語化(翻訳失敗時は英語でも落ちない)
  - [ ] カードタップで本文シート＋日本語本文＋ヒーロー画像
  - [ ] 「試合を見る」で既存試合詳細へ遷移
  - [ ] `NEWS_ENABLED` を外すとカルーセルが消え既存ホームと同一
  - [ ] コンソールエラー無し

**本番適用判断はユーザー。** 問題なければ main マージ＋本番 Pages の `NEWS_ENABLED=true`＋secret＋再デプロイ。

---

## Self-Review メモ

- spec の各節(データソース/アーキ/フロント/フラグ/テスト/デプロイ/リスク)に対応タスクあり。
- pre-match 本文フィールド `prematchnews` は post(`postmatchnews` 実測済)と同型を仮定(spec オープン事項)。Task 8 目視で要確認(小文字 `prematchnews` か camel か)。
- 翻訳モデルは spec の pro でなく flash(翻訳用途で十分・高速安価)に確定。Vertex 経由(`gemini-2.5-flash`・env `NEWS_TRANSLATE_MODEL` で上書き可)。
- 翻訳認証は新規キーを作らず既存 `GCP_SERVICE_ACCOUNT`(worker-watch で本番稼働中の SA)を Pages にも登録して流用。トークン発行は `mintGcpAccessToken` 再利用・リクエスト1回。
- ヒーロー写真は本文モードでのみ取得(一覧は軽量・spec 3.4 準拠)。
- `T.accent` が無いテーマ向けに `#2563eb` フォールバックを明示。
