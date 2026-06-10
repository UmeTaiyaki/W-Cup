# リッチ選手プロフィール＋控え発見性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** 選手プロフィールを「今までのデータ（現所属/利き足/シーズン統計）」のリッチ表示にし、布陣タブの控え発見性を上げる。

**Architecture:** 選手データはオンデマンドで新規 `/api/player?id=`（SportMonks `/players/{id}` をプロキシ＋エッジキャッシュ）。純粋正規化 `sm-player.js`。PlayerSheet は開いた時に取得→リッチ描画、失敗時は既存 lineup bio にフォールバック。バックエンドTDD、フロントはハーネス目視。

**Tech Stack:** Cloudflare Pages Functions / SportMonks API v3 / node:test / React18+Babel / wrangler / Playwright

設計: `docs/superpowers/specs/2026-06-10-rich-player-profile-design.md`。前段 PR #6（branch `feat/watch-lineup-profile`）の上に継続。

---

## File Structure
- `public/screens-detail.jsx` — 控え発見性＋PlayerSheet リッチ化
- `functions/_lib/sm-player.js`（新）— `normalizePlayer(data)` 純粋正規化
- `functions/_lib/sm-player.test.js`（新）
- `functions/api/player.js`（新）— GET /api/player?id=
- `functions/api/player.test.js`（新）
- `public/data.js` — `fetchPlayerProfile(id)`
- `public/_mock-demo.html` — `fetchPlayerProfile` stub（デモ用）
- `public/index.html` — `screens-detail.jsx?v=9→10`

---

## Task 1: 控えの発見性を上げる（UI）

**Files:** Modify `public/screens-detail.jsx`（`FormationPitch` のピッチ高さ＋`BenchList` 見出し）

- [ ] **Step 1: ピッチを少し低くする**

`FormationPitch` の外側ピッチ div の `paddingBottom: "133%"` を `paddingBottom: "118%"` に変更（縦長を緩和し控えを画面内に入りやすく）。

- [ ] **Step 2: 控え見出しに件数＋区切りを付ける**

`BenchList` の見出し（現 `控え` の div）テキストを件数つきにし、上に区切り線を追加。該当 div の文言 `控え` を `{`控え ${bench.length}`}` に変更し、その div の style に `borderTop: "1px solid " + T.line, paddingTop: 12` を追加。

- [ ] **Step 3: 描画スモーク**

dev server :8800（無ければ `npx wrangler pages dev public --port 8800 &`）。/tmp/_s1.py:
```python
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(headless=True); ctx=b.new_context(viewport={"width":430,"height":932},service_workers="block"); pg=ctx.new_page()
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/api/player**", lambda r: r.abort())
    pg.goto("http://localhost:8800/_mock-demo.html", wait_until="networkidle"); pg.wait_for_timeout(1500)
    pg.get_by_text("布陣", exact=True).click(); pg.wait_for_timeout(700)
    t=pg.locator("#wc-app-root").inner_text(); print("控え見出し:", "控え" in t, "Ueda:", "Ueda" in t)
    print("ERRORS:", errs or "none"); pg.screenshot(path="/tmp/s1-bench.png"); b.close()
```
Run `python3 /tmp/_s1.py` → ERRORS none、控え見出し True。

- [ ] **Step 4: Commit**
```bash
git add public/screens-detail.jsx
git commit -m "feat(watch): 布陣の控え発見性を改善(ピッチ高さ調整＋控え件数見出し)"
```

---

## Task 2: sm-player.js 正規化（純粋・TDD）

**Files:** Create `functions/_lib/sm-player.js` / `functions/_lib/sm-player.test.js`

- [ ] **Step 1: 失敗テストを書く**

`functions/_lib/sm-player.test.js`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePlayer } from "./sm-player.js";

const sample = {
	id: 21773355, name: "Ayase Ueda", display_name: "A. Ueda",
	image_path: "https://cdn/u.png", height: 182, weight: 76,
	date_of_birth: "1998-08-28", position_id: 27, detailed_position_id: 153,
	nationality: { name: "Japan", image_path: "https://cdn/jp.png" },
	detailedposition: { name: "Centre Forward" },
	metadata: [{ type_id: 229, values: "right" }],
	teams: [
		{ start: null, end: "2019-06-18", team: { name: "Japan", image_path: "https://cdn/jpn.png" } },
		{ start: "2023-08-03", end: "2028-06-30", team: { name: "Feyenoord", image_path: "https://cdn/fey.png" } },
	],
	statistics: [
		{ season_id: 5796, details: [] },
		{ season_id: 22294, season: { name: "2024/2025", league: { name: "Eredivisie" } }, details: [
			{ type_id: 321, value: { total: 3 } },
			{ type_id: 52, value: { total: 8, goals: 7, penalties: 1 } },
			{ type_id: 119, value: { total: 245 } },
			{ type_id: 118, value: { average: 6.95 } },
			{ type_id: 80, value: { total: 39 } },
			{ type_id: 42, value: { total: 4 } },
			{ type_id: 86, value: { total: 2 } },
		] },
	],
};

test("normalizePlayer maps profile fields", () => {
	const { profile } = normalizePlayer(sample);
	assert.equal(profile.name, "Ayase Ueda");
	assert.equal(profile.image_path, "https://cdn/u.png");
	assert.equal(profile.height, 182);
	assert.equal(profile.preferred_foot, "right");
	assert.equal(profile.detailed_position, "Centre Forward");
	assert.equal(profile.nationality_name, "Japan");
	assert.equal(profile.club_name, "Feyenoord");        // end が最も未来
	assert.equal(profile.club_image, "https://cdn/fey.png");
});

test("normalizePlayer maps season stats, drops empty seasons", () => {
	const { seasons } = normalizePlayer(sample);
	assert.equal(seasons.length, 1);                      // 5796 は details空で除外
	const s = seasons[0];
	assert.equal(s.season_id, 22294);
	assert.equal(s.season_name, "2024/2025");
	assert.equal(s.league_name, "Eredivisie");
	assert.equal(s.stats.appearances, 3);
	assert.equal(s.stats.goals, 8);
	assert.equal(s.stats.minutes, 245);
	assert.equal(s.stats.rating, 6.95);
	assert.equal(s.stats.passes, 39);
	assert.equal(s.stats.shots_total, 4);
	assert.equal(s.stats.shots_on_target, 2);
});

test("normalizePlayer tolerates missing/empty input", () => {
	assert.deepEqual(normalizePlayer(null), { profile: null, seasons: [] });
	const r = normalizePlayer({ id: 1, name: "X" });
	assert.equal(r.profile.name, "X");
	assert.equal(r.profile.preferred_foot, null);
	assert.deepEqual(r.seasons, []);
});
```

- [ ] **Step 2: 失敗確認**

Run `node --test functions/_lib/sm-player.test.js` → FAIL（module 無し）。

- [ ] **Step 3: 実装**

`functions/_lib/sm-player.js`:
```js
// SportMonks /players/{id} レスポンス(data) → フロント用 { profile, seasons }。純粋関数。
const STAT_MAP = {
	321: ["appearances", "total"],
	52: ["goals", "total"],
	79: ["assists", "total"],
	119: ["minutes", "total"],
	118: ["rating", "average"],
	84: ["yellowcards", "total"],
	83: ["redcards", "total"],
	42: ["shots_total", "total"],
	86: ["shots_on_target", "total"],
	80: ["passes", "total"],
};

// teams から現所属クラブ(end が最も未来 or null)を選ぶ。代表含むが end 最大を採用。
function currentClub(teams) {
	const list = Array.isArray(teams) ? teams : [];
	if (list.length === 0) return null;
	const key = (t) => (t.end == null ? "9999-12-31" : String(t.end));
	let best = list[0];
	for (const t of list) if (key(t) > key(best)) best = t;
	return best?.team ?? null;
}

function foot(metadata) {
	const m = (Array.isArray(metadata) ? metadata : []).find((x) => x.type_id === 229);
	return m?.values ?? null;
}

function statsFromDetails(details) {
	const out = {};
	for (const d of Array.isArray(details) ? details : []) {
		const m = STAT_MAP[d.type_id];
		if (!m) continue;
		const v = d.value?.[m[1]];
		if (v != null) out[m[0]] = v;
	}
	return out;
}

export function normalizePlayer(data) {
	if (!data || data.id == null) return { profile: null, seasons: [] };
	const club = currentClub(data.teams);
	const profile = {
		id: data.id,
		name: data.name ?? data.display_name ?? null,
		image_path: data.image_path ?? null,
		height: data.height ?? null,
		weight: data.weight ?? null,
		date_of_birth: data.date_of_birth ?? null,
		preferred_foot: foot(data.metadata),
		position: data.position?.name ?? null,
		detailed_position: data.detailedposition?.name ?? null,
		nationality_name: data.nationality?.name ?? null,
		nationality_image: data.nationality?.image_path ?? null,
		club_name: club?.name ?? null,
		club_image: club?.image_path ?? null,
	};
	const seasons = (Array.isArray(data.statistics) ? data.statistics : [])
		.filter((s) => Array.isArray(s.details) && s.details.length > 0)
		.map((s) => ({
			season_id: s.season_id,
			season_name: s.season?.name ?? null,
			league_name: s.season?.league?.name ?? null,
			stats: statsFromDetails(s.details),
		}));
	return { profile, seasons };
}
```

- [ ] **Step 4: 成功確認**

Run `node --test functions/_lib/sm-player.test.js` → PASS。

- [ ] **Step 5: Commit**
```bash
git add functions/_lib/sm-player.js functions/_lib/sm-player.test.js
git commit -m "feat(watch): sm-player 正規化(現所属/利き足/シーズン統計)"
```

---

## Task 3: /api/player エンドポイント（TDD）

**Files:** Create `functions/api/player.js` / `functions/api/player.test.js`

- [ ] **Step 1: 失敗テストを書く**

`functions/api/player.test.js`（fetchImpl を env で注入＝実API不要）:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "./player.js";

function ctx(env, url = "https://x/api/player?id=21773355") {
	return { env, request: new Request(url) };
}
function fakeFetch(data) {
	return async () => new Response(JSON.stringify({ data }), { status: 200 });
}

test("WATCH_ENABLED unset → 200 enabled:false", async () => {
	const res = await onRequestGet(ctx({}));
	assert.equal(res.status, 200);
	assert.equal((await res.json()).enabled, false);
});

test("invalid id → 400", async () => {
	const res = await onRequestGet(ctx({ WATCH_ENABLED: "true", SPORTMONKS_TOKEN: "t" }, "https://x/api/player?id=abc"));
	assert.equal(res.status, 400);
});

test("no token → 200 note", async () => {
	const res = await onRequestGet(ctx({ WATCH_ENABLED: "true" }));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.profile, null);
});

test("happy path returns normalized profile", async () => {
	const env = { WATCH_ENABLED: "true", SPORTMONKS_TOKEN: "t",
		__fetchImpl: fakeFetch({ id: 21773355, name: "Ayase Ueda", height: 182,
			metadata: [{ type_id: 229, values: "right" }],
			teams: [{ end: "2028-06-30", team: { name: "Feyenoord" } }],
			statistics: [{ season_id: 1, details: [{ type_id: 52, value: { total: 8 } }] }] }) };
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.profile.name, "Ayase Ueda");
	assert.equal(b.profile.club_name, "Feyenoord");
	assert.equal(b.seasons[0].stats.goals, 8);
});

test("fetch throws → 200 fault-isolated null", async () => {
	const env = { WATCH_ENABLED: "true", SPORTMONKS_TOKEN: "t",
		__fetchImpl: async () => { throw new Error("boom"); } };
	const res = await onRequestGet(ctx(env));
	const b = await res.json();
	assert.equal(res.status, 200);
	assert.equal(b.profile, null);
});
```

- [ ] **Step 2: 失敗確認**

Run `node --test functions/api/player.test.js` → FAIL。

- [ ] **Step 3: 実装**

`functions/api/player.js`:
```js
// GET /api/player?id=<player_id> — 選手プロフィール(キャリア/シーズン統計)配信。
// WATCH_ENABLED ゲート＋障害隔離。SportMonks /players/{id} をプロキシ＋エッジキャッシュ。
import { json } from "../_lib/http.js";
import { createSportmonks } from "../_lib/sportmonks.js";
import { normalizePlayer } from "../_lib/sm-player.js";

const PLAYER_INCLUDE =
	"metadata;position;detailedPosition;nationality;teams.team;statistics.details;statistics.season";

export async function onRequestGet(context) {
	const { env, request } = context;
	if (env.WATCH_ENABLED !== "true") {
		return json(200, { enabled: false, profile: null, seasons: [] },
			{ "cache-control": "public, s-maxage=60" });
	}
	const id = Number(new URL(request.url).searchParams.get("id"));
	if (!Number.isFinite(id) || id <= 0) {
		return json(400, { enabled: true, profile: null, seasons: [], error: "invalid id" });
	}
	if (!env.SPORTMONKS_TOKEN) {
		return json(200, { enabled: true, profile: null, seasons: [], note: "no-token" });
	}
	try {
		const sm = createSportmonks({ token: env.SPORTMONKS_TOKEN, fetchImpl: env.__fetchImpl });
		const body = await sm.get(`players/${id}`, { include: PLAYER_INCLUDE });
		const { profile, seasons } = normalizePlayer(body?.data);
		return json(200, { enabled: true, profile, seasons },
			{ "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400" });
	} catch (err) {
		console.error("GET /api/player failed:", err?.message);
		return json(200, { enabled: true, profile: null, seasons: [], note: "unavailable" });
	}
}
```

- [ ] **Step 4: 成功確認**

Run `node --test functions/api/player.test.js` → PASS。`npm test` も 0 fail。

- [ ] **Step 5: Commit**
```bash
git add functions/api/player.js functions/api/player.test.js
git commit -m "feat(watch): GET /api/player(選手プロフィール・障害隔離・エッジキャッシュ)"
```

---

## Task 4: data.js に fetchPlayerProfile

**Files:** Modify `public/data.js`

- [ ] **Step 1: 追加**

`window.WC.fetchFixtureDetail` 定義の直後に追加:
```js
	// /api/player?id= を取得。失敗/OFF/未マッチは null。{profile, seasons} を返す。
	window.WC.fetchPlayerProfile = async function fetchPlayerProfile(id) {
		if (id == null) return null;
		try {
			const res = await fetch("/api/player?id=" + encodeURIComponent(id), { cache: "no-store" });
			if (!res.ok) return null;
			const data = await res.json();
			if (!data || data.enabled === false || !data.profile) return null;
			return data; // {profile, seasons}
		} catch (e) {
			return null;
		}
	};
```

- [ ] **Step 2: ブートスモーク**

Run `node -e "new Function(require('fs').readFileSync('public/data.js','utf8')); console.log('parse OK')"`
Expected: `parse OK`（構文OK）

- [ ] **Step 3: Commit**
```bash
git add public/data.js
git commit -m "feat(watch): data.js に fetchPlayerProfile(/api/player) 追加"
```

---

## Task 5: PlayerSheet をリッチプロフィールに改修

**Files:** Modify `public/screens-detail.jsx`（`PlayerSheet`）

- [ ] **Step 1: 取得＋状態を追加**

`PlayerSheet` 冒頭の hooks 群に、プロフィール取得を追加（既存スクロールロック effect の後）:
```jsx
	const [prof, setProf] = React.useState(null);
	const [profLoading, setProfLoading] = React.useState(false);
	React.useEffect(() => {
		if (!player || player.player_id == null) { setProf(null); return; }
		let alive = true;
		setProfLoading(true); setProf(null);
		(async () => {
			const d = window.WC && window.WC.fetchPlayerProfile
				? await window.WC.fetchPlayerProfile(player.player_id) : null;
			if (alive) { setProf(d); setProfLoading(false); }
		})();
		return () => { alive = false; };
	}, [player && player.player_id]);
	const [statSeasonIdx, setStatSeasonIdx] = React.useState(0);
```

- [ ] **Step 2: 「この試合」セクションを撤去し、リッチ表示に置換**

`PlayerSheet` のスクロール本体（`{/* スタッツ本体 */}` の div 内）の中身（プロフィール行/この試合/xG行/stats.map の各ブロック）を、以下に置き換える。`p0 = (prof && prof.profile) || null` を使い、無ければ lineup 行の bio へフォールバック:
```jsx
						{(() => {
							const p0 = (prof && prof.profile) || null;
							// フォールバック: API 不可時は lineup 行の bio
							const bio = p0 || {
								height: player.height, weight: player.weight,
								date_of_birth: player.date_of_birth, preferred_foot: null,
								detailed_position: player.detailed_position || player.position,
								nationality_name: player.nationality_name,
								club_name: player.club_name, club_image: player.club_image,
								image_path: null,
							};
							const age = ageFromDob(bio.date_of_birth);
							const rows = [];
							if (bio.detailed_position) rows.push(["ポジション", `${bio.detailed_position}　#${player.jersey_number ?? "-"}`]);
							if (age != null || bio.height || bio.weight)
								rows.push(["年齢/身長/体重", `${age != null ? age + "歳" : "-"} / ${bio.height ? bio.height + "cm" : "-"} / ${bio.weight ? bio.weight + "kg" : "-"}`]);
							if (bio.preferred_foot) rows.push(["利き足", bio.preferred_foot === "right" ? "右" : bio.preferred_foot === "left" ? "左" : bio.preferred_foot]);
							if (bio.nationality_name) rows.push(["国籍", bio.nationality_name]);
							if (bio.club_name) rows.push(["所属クラブ", bio.club_name]);
							return (
								<>
									{profLoading && (
										<div style={{ color: T.faint, fontSize: 12, fontWeight: 700, padding: "10px 0" }}>読み込み中…</div>
									)}
									{rows.map(([k, v]) => (
										<div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid " + T.line, fontSize: 13 }}>
											<span style={{ color: T.sub, fontWeight: 700 }}>{k}</span>
											<span style={{ fontWeight: 800, color: T.text }}>{v}</span>
										</div>
									))}
									{p0 && prof.seasons && prof.seasons.length > 0 && (() => {
										const idx = Math.min(statSeasonIdx, prof.seasons.length - 1);
										const s = prof.seasons[idx];
										const label = (st, key, unit) => st[key] != null ? (
											<div key={key} style={{ flex: "1 0 30%", padding: "8px 0", textAlign: "center" }}>
												<div style={{ fontSize: 15, fontWeight: 900, color: T.text }}>{st[key]}{unit || ""}</div>
												<div style={{ fontSize: 10, color: T.sub, fontWeight: 700 }}>{key}</div>
											</div>
										) : null;
										return (
											<div style={{ marginTop: 12 }}>
												<div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
													<span style={{ fontSize: 12, fontWeight: 800, color: T.text }}>シーズン統計</span>
													{prof.seasons.length > 1 && (
														<select value={idx} onChange={(e) => setStatSeasonIdx(Number(e.target.value))}
															style={{ marginLeft: "auto", background: "rgba(255,255,255,0.06)", color: T.text, border: "1px solid " + T.line, borderRadius: 8, fontSize: 11, padding: "3px 6px" }}>
															{prof.seasons.map((se, i) => (
																<option key={se.season_id} value={i}>{se.league_name ? se.league_name + " " : ""}{se.season_name || se.season_id}</option>
															))}
														</select>
													)}
												</div>
												<div style={{ display: "flex", flexWrap: "wrap" }}>
													{label(s.stats, "appearances")}{label(s.stats, "goals")}{label(s.stats, "assists")}
													{label(s.stats, "minutes", "分")}{label(s.stats, "rating")}{label(s.stats, "yellowcards")}
													{label(s.stats, "shots_total")}{label(s.stats, "shots_on_target")}{label(s.stats, "passes")}
												</div>
											</div>
										);
									})()}
								</>
							);
						})()}
```
（注: タイトル行のヘッダーは既存のまま。`prof.profile.image_path` をヘッダー写真に出すのは Step 2b）

- [ ] **Step 2b: ヘッダーに顔写真＋所属クラブ/国籍**

`PlayerSheet` のタイトル行（背番号＋名前＋旗）の左に、`prof?.profile?.image_path` があれば 44px 円形写真を追加（`TeamCrest` 流用 or img・失敗時非表示）。名前の下に小さく `club_name`(ロゴ)＋`nationality_name`。`prof` が無い間は既存表示。
```jsx
						{prof && prof.profile && prof.profile.image_path && (
							<img src={prof.profile.image_path} alt="" onError={(e) => { e.target.style.display = "none"; }}
								style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", marginRight: 10, background: "rgba(255,255,255,0.08)" }} />
						)}
```
（タイトル行の先頭・背番号 span の前に挿入）

- [ ] **Step 3: 描画スモーク（実APIはローカルで・偽IDはフォールバック）**

dev :8800。/tmp/_s5.py: モックデモを開き布陣→Mitomaタップ。偽IDなので /api/player は空→**フォールバック bio**（ポジション/年齢/国籍/クラブ）が出ること、pageエラー無しを確認。screenshot /tmp/s5-prof.png。
（実APIプロフィール検証は Task 7 で実 player_id を使う）

- [ ] **Step 4: Commit**
```bash
git add public/screens-detail.jsx
git commit -m "feat(watch): PlayerSheetをリッチプロフィール(写真/Info/シーズン統計)に改修・この試合撤去"
```

---

## Task 6: _mock-demo.html に fetchPlayerProfile stub

**Files:** Modify `public/_mock-demo.html`

- [ ] **Step 1: stub を追加**

インライン script の `window.WC.fetchFixtureDetail = ...` の直後に、Ueda 相当の固定プロフィールを返す stub を追加（デプロイ版でも token 無しで表示可）:
```js
    window.WC.fetchPlayerProfile = async function () {
      return { enabled: true, profile: {
        id: 21773355, name: "Ayase Ueda", image_path: "https://cdn.sportmonks.com/images/soccer/players/27/21773355.png",
        height: 182, weight: 76, date_of_birth: "1998-08-28", preferred_foot: "right",
        position: "Attacker", detailed_position: "Centre Forward",
        nationality_name: "Japan", nationality_image: null,
        club_name: "Feyenoord", club_image: "https://cdn.sportmonks.com/images/soccer/teams/25/3057.png"
      }, seasons: [
        { season_id: 22294, season_name: "2024/2025", league_name: "Eredivisie",
          stats: { appearances: 3, goals: 8, minutes: 245, rating: 6.95, passes: 39, shots_total: 4, shots_on_target: 2 } }
      ] };
    };
```

- [ ] **Step 2: スモーク**

/tmp/_s6.py: デモを開き布陣→任意選手タップ→プロフィールに Feyenoord / Centre Forward / シーズン統計(goals 8) が出る、pageエラー無し。screenshot /tmp/s6-demo-prof.png。

- [ ] **Step 3: Commit**
```bash
git add public/_mock-demo.html
git commit -m "chore(watch): デモにfetchPlayerProfile stub(リッチプロフィール表示)"
```

---

## Task 7: 実API目視＋?vバンプ

**Files:** Modify `public/index.html`

- [ ] **Step 1: 実 player_id で /api/player をローカル確認**

dev :8800（`.dev.vars` に SPORTMONKS_TOKEN・WATCH_ENABLED=true）。/tmp/_s7.py で `page.evaluate(fetch('/api/player?id=21773355'))` を呼び、`profile.name=="Ayase Ueda"` と seasons>0 を確認（dev server 自身が SportMonks を叩く＝ツールの外部送信制限に抵触しない）。失敗時はネット/トークン要因を報告。
```python
data = pg.evaluate("async()=>{const r=await fetch('/api/player?id=21773355');return await r.json();}")
print("name:", (data.get('profile') or {}).get('name'), "seasons:", len(data.get('seasons') or []))
```

- [ ] **Step 2: ?v バンプ**

`public/index.html` の `screens-detail.jsx?v=9` を `?v=10` に変更。

- [ ] **Step 3: Commit**
```bash
git add public/index.html
git commit -m "chore(watch): screens-detail ?v=10(リッチプロフィール)"
```

---

## Task 8: 全テスト＋本番手順メモ

- [ ] **Step 1:** `npm test` → 0 fail（既存＋sm-player＋api/player）。
- [ ] **Step 2:** 作業ツリーに使い捨て(_s*.py)が残らないことを確認（`rm -f /tmp/_s*.py`）。
- [ ] **Step 3（メモのみ・実行不要）:** 本番反映時は **Pages に `SPORTMONKS_TOKEN` を `wrangler pages secret put SPORTMONKS_TOKEN`** で設定（/api/player が SportMonks を直叩く最初のPages Function）。未設定だと profile=null でフォールバック表示になる（壊れはしない）。

---

## Notes
- 予想/部屋・他タブ不変。`/api/player` は `WATCH_ENABLED` 配下・障害隔離。
- 過去クラブ遍歴/ per-match Match Stats はデータ制約で範囲外（[[2026-06-10-rich-player-profile-design]] §1）。
- jsx変更につき `?v` 必須（[[wcup-deploy-flow]]）。
