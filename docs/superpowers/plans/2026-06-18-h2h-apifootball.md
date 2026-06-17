# H2H データソース API-Football 置換 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 試合前カード H2H の取得元を SportMonks から API-Football へ完全置換し、「初対戦だらけ」を解消する。

**Architecture:** 下流（`sm_h2h` / `/api/h2h` / フロント `CheerBar`）は無改修。取得層のみ差し替え。API-Football H2H パーサ純関数＋静的チームIDマップ＋レート制御付き `syncH2H` 書き換え＋worker-watch 配線。一度取得キャッシュ（`sm_h2h` 行が無い試合のみ取得）。

**Tech Stack:** Cloudflare Workers（worker-watch / Pages Functions）、D1、Node 標準テストランナー（`node --test`）、API-Football v3（`v3.football.api-sports.io`）。

## Global Constraints

- 依存パッケージ追加なし（Node 標準テストランナーのみ。wrangler は npx）。
- 純関数は `{sql,args}` を返し D1 に触れない（`sm-store.js` 方針）。D1 アクセスは `runBatch` のみ。
- 文字列型の `goals`/`id` は `Number()` 強制。
- graceful degradation 厳守: フラグ OFF / トークン未設定 / 未マッピング / API 失敗 / 429 / テーブル無し → 当該試合は行を作らず「初対戦」。5xx を出さない。
- イミュータブル徹底・小さいファイル。Conventional Commits。
- レート: API-Football 無料枠 = 100 req/日 ＋ 約10 req/分。Worker 内で sleep しない。per-run 上限 `H2H_MAX_PER_RUN=8` ＋ `status===429` 即停止で保護。
- API-Football: ホスト `https://v3.football.api-sports.io`、認証 `x-apisports-key` ヘッダ。
- H2H 集計は home（試合前カードの home 側）視点の W-D-L。`sm_h2h.home_code/away_code` は `sm_teams.app_code`。
- worker-watch は CI 対象外 → デプロイは手動 `cd worker-watch && npx wrangler deploy`。

---

### Task 1: API-Football H2H パーサ（純関数）

**Files:**
- Create: `functions/_lib/apifootball-h2h.js`
- Test: `functions/_lib/apifootball-h2h.test.js`

**Interfaces:**
- Produces: `extractAfH2HResult(fixture) -> {home_team_id, away_team_id, home_score, away_score} | null`
  - API-Football の 1 fixture（`{teams:{home:{id},away:{id}}, goals:{home,away}}`）を正規化。
  - `teams.home.id`/`teams.away.id` を `Number()` で id、`goals.home`/`goals.away` を `Number()` で score。いずれか非有限なら `null`。

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/apifootball-h2h.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAfH2HResult } from "./apifootball-h2h.js";

const fx = (homeId, awayId, hg, ag) => ({
	teams: { home: { id: homeId }, away: { id: awayId } },
	goals: { home: hg, away: ag },
});

test("extractAfH2HResult: 正常形を正規化", () => {
	const r = extractAfH2HResult(fx(25, 1118, 2, 1));
	assert.deepEqual(r, {
		home_team_id: 25,
		away_team_id: 1118,
		home_score: 2,
		away_score: 1,
	});
});

test("extractAfH2HResult: 文字列型の id/goals を Number 強制", () => {
	const r = extractAfH2HResult(fx("25", "1118", "2", "0"));
	assert.deepEqual(r, {
		home_team_id: 25,
		away_team_id: 1118,
		home_score: 2,
		away_score: 0,
	});
});

test("extractAfH2HResult: goals 欠損なら null", () => {
	assert.equal(extractAfH2HResult({ teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: null, away: null } }), null);
});

test("extractAfH2HResult: teams 欠損なら null", () => {
	assert.equal(extractAfH2HResult({ goals: { home: 1, away: 0 } }), null);
	assert.equal(extractAfH2HResult(null), null);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/_lib/apifootball-h2h.test.js`
Expected: FAIL（`extractAfH2HResult` 未定義 / モジュール無し）

- [ ] **Step 3: 最小実装**

`functions/_lib/apifootball-h2h.js`:
```js
// API-Football H2H（/fixtures/headtohead）の 1 fixture を正規化する純関数。
// 出力形は sm-h2h.js の aggregateResults が受ける {home_team_id, away_team_id, home_score, away_score}。

export function extractAfH2HResult(fixture) {
	const teams = fixture && fixture.teams;
	const goals = fixture && fixture.goals;
	if (!teams || !goals) return null;
	const homeId = Number(teams.home && teams.home.id);
	const awayId = Number(teams.away && teams.away.id);
	const hg = Number(goals.home);
	const ag = Number(goals.away);
	if (
		!Number.isFinite(homeId) ||
		!Number.isFinite(awayId) ||
		!Number.isFinite(hg) ||
		!Number.isFinite(ag)
	) {
		return null;
	}
	return {
		home_team_id: homeId,
		away_team_id: awayId,
		home_score: hg,
		away_score: ag,
	};
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/apifootball-h2h.test.js`
Expected: PASS（4 tests）

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/apifootball-h2h.js functions/_lib/apifootball-h2h.test.js
git commit -m "feat(h2h): API-Football H2Hレスポンスのパース純関数"
```

---

### Task 2: 集計をソース非依存にリファクタ（`sm-h2h.js`）

**Files:**
- Modify: `functions/_lib/sm-h2h.js`
- Test: `functions/_lib/sm-h2h.test.js`

**Interfaces:**
- Produces: `aggregateResults(homeTeamId, results) -> {home_wins, draws, away_wins, total}`
  - 既に正規化済みの結果配列（各 `{home_team_id, away_team_id, home_score, away_score}`）から home 視点 W-D-L 集計。`homeTeamId` が関与しない結果はスキップ。
- 維持: `rowsToH2H`、`H2H_WINDOW_DAYS`、**および既存の `extractH2HResult` / 旧 `aggregateH2H`**（本タスクでは削除しない）。

**背景・重要:** 本タスクは **追加のみ（additive）**。旧 `extractH2HResult` / `aggregateH2H` を**まだ削除しない**。なぜなら現行 `sm-sync.js` の旧 `syncH2H` がそれらを import/使用しており、ここで消すと Task 5 まで `npm test` が赤になる（各コミットをグリーンに保てない）。`aggregateResults` を新規追加するだけにし、**旧関数とその削除は Task 5（syncH2H 書き換えと同コミット）で行う**。集計ループ自体は既存のテスト済みロジックをそのまま流用。

- [ ] **Step 1: aggregateResults のテストを追加（失敗させる）**

`functions/_lib/sm-h2h.test.js` に `aggregateResults` のテストを**追加**する（既存テストは残す）。代表ケース:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateResults, rowsToH2H } from "./sm-h2h.js";

const R = (homeId, awayId, hg, ag) => ({
	home_team_id: homeId,
	away_team_id: awayId,
	home_score: hg,
	away_score: ag,
});

test("aggregateResults: home がどちら側でも視点が正しい", () => {
	// teamId=18 視点。1試合目 home で勝ち、2試合目 away で引分。
	const out = aggregateResults(18, [R(18, 83, 1, 0), R(83, 18, 2, 2)]);
	assert.deepEqual(out, { home_wins: 1, draws: 1, away_wins: 0, total: 2 });
});

test("aggregateResults: 関与しない結果はスキップ", () => {
	const out = aggregateResults(18, [R(50, 60, 3, 0)]);
	assert.deepEqual(out, { home_wins: 0, draws: 0, away_wins: 0, total: 0 });
});

test("rowsToH2H: D1行を fixtureId キーへ整形", () => {
	const out = rowsToH2H([
		{ fixture_id: 7, home_code: "ENG", away_code: "CRO", home_wins: 2, draws: 0, away_wins: 1, total: 3 },
	]);
	assert.deepEqual(out["7"], {
		home_code: "ENG",
		away_code: "CRO",
		home_wins: 2,
		draws: 0,
		away_wins: 1,
		total: 3,
	});
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/_lib/sm-h2h.test.js`
Expected: FAIL（`aggregateResults` 未エクスポート）

- [ ] **Step 3: `sm-h2h.js` に aggregateResults を追加**

`functions/_lib/sm-h2h.js` に `aggregateResults` を**追加**する（`extractH2HResult` / 旧 `aggregateH2H` / `H2H_WINDOW_DAYS` / `rowsToH2H` はすべて維持。削除は Task 5）:
```js
// homeTeamId 視点で、正規化済み結果配列から勝/分/敗を集計。関与しない結果はスキップ。
export function aggregateResults(homeTeamId, results) {
	const out = { home_wins: 0, draws: 0, away_wins: 0, total: 0 };
	for (const r of results || []) {
		if (!r) continue;
		let forGoals;
		let againstGoals;
		if (r.home_team_id === homeTeamId) {
			forGoals = r.home_score;
			againstGoals = r.away_score;
		} else if (r.away_team_id === homeTeamId) {
			forGoals = r.away_score;
			againstGoals = r.home_score;
		} else {
			continue;
		}
		out.total += 1;
		if (forGoals > againstGoals) out.home_wins += 1;
		else if (forGoals < againstGoals) out.away_wins += 1;
		else out.draws += 1;
	}
	return out;
}
```

- [ ] **Step 4: テストが通ることを確認（追加分）**

Run: `node --test functions/_lib/sm-h2h.test.js`
Expected: PASS（既存＋新規 aggregateResults）

- [ ] **Step 5: 全テスト回帰（追加のみなので緑のまま）**

Run: `npm test`
Expected: 全 PASS（旧関数を消していないので `sm-sync.js` の旧 syncH2H も無傷）。

- [ ] **Step 6: コミット**

```bash
git add functions/_lib/sm-h2h.js functions/_lib/sm-h2h.test.js
git commit -m "feat(h2h): 集計をソース非依存のaggregateResultsとして追加（旧関数は温存）"
```

---

### Task 3: API-Football クライアント（薄いラッパ）

**Files:**
- Create: `functions/_lib/apifootball-client.js`
- Test: `functions/_lib/apifootball-client.test.js`

**Interfaces:**
- Produces: `makeAfClient({token, fetchImpl}) -> { get(path) }`
  - `get(path)` は `https://v3.football.api-sports.io{path}` を `x-apisports-key: token` で GET し `{status, json}` を返す（throw しない方針＝ステータスで判断）。fetch 例外時は `{status:0, json:null}`。

- [ ] **Step 1: 失敗するテストを書く**

`functions/_lib/apifootball-client.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeAfClient } from "./apifootball-client.js";

test("makeAfClient: ホスト・ヘッダ・status/json を返す", async () => {
	let seenUrl;
	let seenHeaders;
	const fetchImpl = async (url, opts) => {
		seenUrl = url;
		seenHeaders = opts.headers;
		return { status: 200, json: async () => ({ response: [] }) };
	};
	const c = makeAfClient({ token: "KEY", fetchImpl });
	const r = await c.get("/fixtures/headtohead?h2h=25-1118");
	assert.equal(seenUrl, "https://v3.football.api-sports.io/fixtures/headtohead?h2h=25-1118");
	assert.equal(seenHeaders["x-apisports-key"], "KEY");
	assert.equal(r.status, 200);
	assert.deepEqual(r.json, { response: [] });
});

test("makeAfClient: fetch 例外は status:0 で握る", async () => {
	const fetchImpl = async () => {
		throw new Error("network");
	};
	const c = makeAfClient({ token: "KEY", fetchImpl });
	const r = await c.get("/x");
	assert.equal(r.status, 0);
	assert.equal(r.json, null);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/_lib/apifootball-client.test.js`
Expected: FAIL（モジュール無し）

- [ ] **Step 3: 最小実装**

`functions/_lib/apifootball-client.js`:
```js
// API-Football v3 の薄いクライアント。throw せず {status, json} を返す（呼び出し側が 429 等を判断）。
const AF_BASE = "https://v3.football.api-sports.io";

export function makeAfClient({ token, fetchImpl } = {}) {
	if (!token) throw new Error("apifootball: token required (APIFOOTBALL_TOKEN)");
	const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
	if (!doFetch) throw new Error("apifootball: no fetch available");
	return {
		async get(path) {
			try {
				const res = await doFetch(`${AF_BASE}${path}`, {
					headers: { "x-apisports-key": token },
				});
				let json = null;
				try {
					json = await res.json();
				} catch {
					json = null;
				}
				return { status: res.status, json };
			} catch {
				return { status: 0, json: null };
			}
		},
	};
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test functions/_lib/apifootball-client.test.js`
Expected: PASS（2 tests）

- [ ] **Step 5: コミット**

```bash
git add functions/_lib/apifootball-client.js functions/_lib/apifootball-client.test.js
git commit -m "feat(h2h): API-Football v3 薄いクライアント（status/json返却）"
```

---

### Task 4: 静的チームIDマップ生成＋コミット

**Files:**
- Create: `scripts/h2h-probe/build-af-map.mjs`（生成スクリプト・使い捨て寄りだがコミット）
- Create: `functions/_lib/af-team-map.js`（確定マップ）
- Test: `functions/_lib/af-team-map.test.js`

**Interfaces:**
- Produces: `export const AF_TEAM_ID = { <app_code>: <api-football team id>, ... }`（48代表ぶん）。`afIdForCode(code) -> number | null` も提供。

**注意:** 本タスクは**ライブ API を使う生成ステップ**を含む（`APIFOOTBALL_TOKEN` 必要・per-minute 制限のため約7秒間隔）。生成結果は人手で検証してから確定する（特に USA 男女・Korea・Côte d'Ivoire 等）。

- [ ] **Step 1: 生成スクリプトを書く**

`scripts/h2h-probe/build-af-map.mjs`:
```js
// 使い捨て寄り: 本番 sm_teams の app_code/name から API-Football の国代表 team id を解決して JSON 出力。
// 実行: APIFOOTBALL_TOKEN=xxx node scripts/h2h-probe/build-af-map.mjs '<teams-json>'
// teams-json は [{app_code,name}, ...]（wrangler d1 で取得して渡す）。
const token = process.env.APIFOOTBALL_TOKEN;
if (!token) throw new Error("APIFOOTBALL_TOKEN required");
const teams = JSON.parse(process.argv[2] || "[]");
const base = "https://v3.football.api-sports.io";
const headers = { "x-apisports-key": token };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = {};
for (const t of teams) {
	const res = await fetch(`${base}/teams?search=${encodeURIComponent(t.name)}`, { headers });
	const json = await res.json();
	const list = Array.isArray(json?.response) ? json.response : [];
	// 国代表を優先。男子(women を名前で除外)を優先。
	const nat = list.filter((x) => x?.team?.national === true);
	const male = nat.find((x) => !/\bW\b|women/i.test(x.team.name || "")) || nat[0];
	out[t.app_code] = male
		? { af_id: male.team.id, af_name: male.team.name, candidates: nat.map((x) => `${x.team.id}:${x.team.name}`) }
		: { af_id: null, af_name: null, candidates: list.map((x) => `${x.team.id}:${x.team.name}`) };
	console.error(`${t.app_code} ${t.name} -> ${JSON.stringify(out[t.app_code])}`);
	await sleep(7000); // per-minute(≈10) 回避
}
console.log(JSON.stringify(out, null, 2));
```

- [ ] **Step 2: 本番 sm_teams から代表一覧を取得**

Run:
```bash
npx wrangler d1 execute wcup2026-db --remote --command \
  "SELECT app_code, name FROM sm_teams WHERE app_code IS NOT NULL ORDER BY app_code" --json \
  > /tmp/smteams.json
```
`/tmp/smteams.json` の `[0].results` が `[{app_code,name}, ...]`。

- [ ] **Step 3: マップ生成（ライブ・約6分）**

Run:
```bash
TEAMS=$(node -e "const d=require('/tmp/smteams.json'); process.stdout.write(JSON.stringify(d[0].results))")
export $(grep '^APIFOOTBALL_TOKEN=' .dev.vars | head -1)
node scripts/h2h-probe/build-af-map.mjs "$TEAMS" > /tmp/afmap.json 2> /tmp/afmap.log
cat /tmp/afmap.log
```
Expected: 各 app_code に af_id が解決される（`candidates` を目視）。

- [ ] **Step 4: 人手検証して確定マップを作る**

`/tmp/afmap.json` を確認し、誤検出（女子代表・同名クラブ）を `candidates` から正しい id へ修正。既知の正解（probe 実測）: `GER=25, NED=1118, FRA=2, ENG=10, ARG=26, BRA=6, ESP=9, JPN=12, USA(男子)=2384`。
確定値で `functions/_lib/af-team-map.js` を作成:
```js
// app_code -> API-Football team id（W杯48代表）。build-af-map.mjs の出力を人手検証して確定。
export const AF_TEAM_ID = {
	// 例（実際は48件、生成結果で確定）:
	GER: 25,
	NED: 1118,
	FRA: 2,
	ENG: 10,
	ARG: 26,
	BRA: 6,
	ESP: 9,
	JPN: 12,
	USA: 2384,
	// ... 残りの app_code を /tmp/afmap.json から確定して列挙 ...
};

export function afIdForCode(code) {
	const id = AF_TEAM_ID[code];
	return Number.isFinite(id) ? id : null;
}
```

- [ ] **Step 5: テストを書いて通す**

`functions/_lib/af-team-map.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { AF_TEAM_ID, afIdForCode } from "./af-team-map.js";

test("afIdForCode: 既知コードを解決", () => {
	assert.equal(afIdForCode("GER"), 25);
	assert.equal(afIdForCode("NED"), 1118);
	assert.equal(afIdForCode("USA"), 2384); // 男子代表
});

test("afIdForCode: 未収録は null", () => {
	assert.equal(afIdForCode("ZZZ"), null);
});

test("AF_TEAM_ID: 値は全て有限数・コードは大文字3字", () => {
	for (const [code, id] of Object.entries(AF_TEAM_ID)) {
		assert.match(code, /^[A-Z]{3}$/);
		assert.equal(Number.isFinite(id), true, `${code} の id が数値でない`);
	}
});
```
Run: `node --test functions/_lib/af-team-map.test.js`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add scripts/h2h-probe/build-af-map.mjs functions/_lib/af-team-map.js functions/_lib/af-team-map.test.js
git commit -m "feat(h2h): app_code→API-Football team id 静的マップ＋生成スクリプト"
```

---

### Task 5: `syncH2H` を API-Football 経路へ書き換え

**Files:**
- Modify: `functions/_lib/sm-sync.js`（`syncH2H` 全置換、import 調整）
- Test: `functions/_lib/sm-sync.test.js`（syncH2H 関連を新フェイクへ）

**Interfaces:**
- Consumes: `extractAfH2HResult`（Task1）, `aggregateResults`/`H2H_WINDOW_DAYS`（Task2）, `afIdForCode`（Task4）, `h2hStatement`/`runBatch`（既存 `sm-store.js`）。
- Produces: `syncH2H(afClient, db, now, {windowDays?, max?}) -> {count, error?}`
  - `afClient` は `makeAfClient` の戻り（`get(path)->{status,json}`）。
  - 対象 = NS(`state_id=1`)×`windowDays`(既定7)窓 かつ **`sm_h2h` 行が無い** fixture を `starting_at_ts` 昇順で最大 `max`(既定8) 件。
  - 各対象: `sm_teams.app_code` 解決（既存ロジック流用）→ `afIdForCode` で AF id。どちらか無ければスキップ。
  - `GET /fixtures/headtohead?h2h={afHome}-{afAway}`。`status===429` で**即 break（部分コミット）**。それ以外の非 200 や `json` 欠損はその fixture をスキップ（continue）。
  - `json.response` を `extractAfH2HResult` で正規化 → `aggregateResults(afHome, results)` → `h2hStatement` で upsert。

- [ ] **Step 1: 既存 syncH2H テストを新フェイクへ更新（失敗させる）**

`functions/_lib/sm-sync.test.js` の syncH2H セクションを置き換える。新フェイク（LEFT JOIN 選択・AF クライアント形）:
```js
// sm_fixtures(対象抽出: LEFT JOIN sm_h2h で未キャッシュのみ), sm_teams(app_code), sm_h2h(upsert記録)
function fakeH2HDB({ fixtures = [], teams = {} } = {}) {
	const h2hUpserts = [];
	const make = (sql) => ({
		sql,
		args: [],
		bind(...a) {
			this.args = a;
			return this;
		},
		async all() {
			if (/FROM sm_fixtures/i.test(this.sql)) return { results: fixtures };
			if (/FROM sm_teams/i.test(this.sql)) {
				const ids = this.args.map(Number);
				return {
					results: ids
						.filter((id) => id in teams)
						.map((id) => ({ sm_team_id: id, app_code: teams[id] })),
				};
			}
			return { results: [] };
		},
		async run() {
			if (/INSERT INTO sm_h2h/i.test(this.sql)) h2hUpserts.push(this.args);
			return { success: true, meta: { changes: 1 } };
		},
	});
	return {
		prepare: (sql) => make(sql),
		async batch(stmts) {
			for (const s of stmts) await s.run();
			return [];
		},
		_h2hUpserts: h2hUpserts,
	};
}

// API-Football クライアントのモック。h2h=A-B をキーに response を返す。status も差し替え可能。
function fakeAfClient(byPair, { status = 200 } = {}) {
	return {
		calls: [],
		async get(path) {
			this.calls.push(path);
			const m = path.match(/h2h=(\d+)-(\d+)/);
			const key = m ? `${m[1]}-${m[2]}` : "";
			return { status, json: { response: byPair[key] || [] } };
		},
	};
}

// API-Football fixture（teams/goals 形）
function afFx(homeId, awayId, hg, ag) {
	return { teams: { home: { id: homeId }, away: { id: awayId } }, goals: { home: hg, away: ag } };
}
```
テスト本体:
```js
test("syncH2H: 未キャッシュ窓内fixtureをAPI-FootballでH2H集計しupsert", async () => {
	const now = 1_000_000;
	const db = fakeH2HDB({
		fixtures: [{ sm_fixture_id: 7, home_team_id: 18, away_team_id: 83, starting_at_ts: now + 3600 }],
		teams: { 18: "GER", 83: "NED" }, // afIdForCode で 25 / 1118 に解決される想定
	});
	const af = fakeAfClient({ "25-1118": [afFx(25, 1118, 2, 1), afFx(1118, 25, 0, 0)] });
	const res = await syncH2H(af, db, now);
	assert.equal(res.count, 1);
	const up = db._h2hUpserts[0];
	assert.equal(up[0], 7); // fixture_id
	assert.equal(up[1], "GER"); // home_code
	assert.equal(up[2], "NED"); // away_code
	// GER(25) 視点: 1勝(2-1) + 1分(0-0) = 1-1-0, total 2
	assert.equal(up[3], 1); // home_wins
	assert.equal(up[4], 1); // draws
	assert.equal(up[5], 0); // away_wins
	assert.equal(up[6], 2); // total
});

test("syncH2H: 未マッピングのチームはスキップ（行を作らない）", async () => {
	const now = 1_000_000;
	const db = fakeH2HDB({
		fixtures: [{ sm_fixture_id: 9, home_team_id: 1, away_team_id: 2, starting_at_ts: now + 3600 }],
		teams: { 1: "ZZZ", 2: "GER" }, // ZZZ は AF_TEAM_ID に無い
	});
	const af = fakeAfClient({});
	const res = await syncH2H(af, db, now);
	assert.equal(res.count, 0);
	assert.equal(af.calls.length, 0); // API を叩かない
});

test("syncH2H: 429 を受けたら即停止（部分コミット）", async () => {
	const now = 1_000_000;
	const db = fakeH2HDB({
		fixtures: [
			{ sm_fixture_id: 7, home_team_id: 18, away_team_id: 83, starting_at_ts: now + 100 },
			{ sm_fixture_id: 8, home_team_id: 18, away_team_id: 83, starting_at_ts: now + 200 },
		],
		teams: { 18: "GER", 83: "NED" },
	});
	const af = fakeAfClient({ "25-1118": [afFx(25, 1118, 1, 0)] }, { status: 429 });
	const res = await syncH2H(af, db, now);
	assert.equal(res.count, 0); // 1件目で 429 → upsert せず break
	assert.equal(af.calls.length, 1); // 2件目は叩かない
});

test("syncH2H: max で per-run 件数を制限", async () => {
	const now = 1_000_000;
	const fixtures = [];
	const teams = { 18: "GER", 83: "NED" };
	for (let i = 0; i < 5; i++) fixtures.push({ sm_fixture_id: i, home_team_id: 18, away_team_id: 83, starting_at_ts: now + i });
	// LIMIT は SQL 側だが、フェイクは全件返すので syncH2H 内の slice/limit を検証する目的で
	// max=2 を渡し、API 呼び出しが 2 回で止まることを見る。
	const db = fakeH2HDB({ fixtures, teams });
	const af = fakeAfClient({ "25-1118": [afFx(25, 1118, 1, 0)] });
	const res = await syncH2H(af, db, now, { max: 2 });
	assert.equal(af.calls.length, 2);
	assert.equal(res.count, 2);
});
```

> 注: フェイク `all()` は LIMIT を解釈しないため、`syncH2H` 側で取得後に `max` で `slice` する実装にする（SQL の `LIMIT ?` と二重防御）。これにより max テストがフェイクでも成立する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test functions/_lib/sm-sync.test.js`
Expected: FAIL（旧 syncH2H 実装・旧 import のため）

- [ ] **Step 3: `sm-sync.js` の import を更新＋旧 SM 関数を削除（Task 2 で温存した分）**

(a) `functions/_lib/sm-sync.js` 冒頭の import を調整:
- `sm-h2h.js` からの import を `H2H_WINDOW_DAYS, aggregateResults`（`aggregateH2H`/`extractH2HResult` は外す）に変更。
- 追加: `import { extractAfH2HResult } from "./apifootball-h2h.js";` と `import { afIdForCode } from "./af-team-map.js";`。

(b) `functions/_lib/sm-h2h.js` から **旧 `extractH2HResult` と旧 `aggregateH2H` を削除**（Task 2 で温存したもの。`aggregateResults`/`rowsToH2H`/`H2H_WINDOW_DAYS` は維持）。

(c) `functions/_lib/sm-h2h.test.js` から **旧 `extractH2HResult`/`aggregateH2H` を参照するテストを削除**（`aggregateResults`/`rowsToH2H` のテストは維持）。

(d) 取りこぼし確認:
Run: `grep -rn "extractH2HResult\|aggregateH2H\b" functions/ worker-watch/`
Expected: ヒット 0 件（全て本タスクで除去済み）。残れば修正。

- [ ] **Step 4: `syncH2H` を全置換**

`functions/_lib/sm-sync.js` の `export async function syncH2H(...) { ... }` を以下へ:
```js
export async function syncH2H(
	afClient,
	db,
	now,
	{ windowDays = H2H_WINDOW_DAYS, max = 8 } = {},
) {
	if (!afClient) return { count: 0 };
	let targets;
	try {
		const until = now + windowDays * 86400;
		const r = await db
			.prepare(
				`SELECT f.sm_fixture_id, f.home_team_id, f.away_team_id
         FROM sm_fixtures f
         LEFT JOIN sm_h2h h ON h.fixture_id = f.sm_fixture_id
         WHERE f.state_id = 1 AND f.starting_at_ts IS NOT NULL
           AND f.starting_at_ts BETWEEN ? AND ?
           AND h.fixture_id IS NULL
         ORDER BY f.starting_at_ts
         LIMIT ?`,
			)
			.bind(now, until, max)
			.all();
		targets = (r?.results || []).slice(0, max); // フェイク/二重防御
	} catch (e) {
		console.error("syncH2H: select targets failed", e?.message);
		return { count: 0, error: e?.message };
	}
	if (!targets.length) return { count: 0 };

	// app_code 解決テーブルを 1 クエリで用意。
	const ids = [
		...new Set(
			targets.flatMap((t) => [t.home_team_id, t.away_team_id]).filter(Boolean),
		),
	];
	const codeById = {};
	try {
		const ph = ids.map(() => "?").join(",");
		const tr = await db
			.prepare(
				`SELECT sm_team_id, app_code FROM sm_teams WHERE sm_team_id IN (${ph})`,
			)
			.bind(...ids)
			.all();
		for (const row of tr?.results || []) codeById[row.sm_team_id] = row.app_code;
	} catch (e) {
		console.error("syncH2H: team code resolve failed", e?.message);
		return { count: 0, error: e?.message };
	}

	const updatedAt = new Date(now * 1000).toISOString();
	const specs = [];
	for (const t of targets) {
		const homeCode = codeById[t.home_team_id];
		const awayCode = codeById[t.away_team_id];
		if (!homeCode || !awayCode) continue; // 向き判定不能はスキップ
		const afHome = afIdForCode(homeCode);
		const afAway = afIdForCode(awayCode);
		if (afHome == null || afAway == null) continue; // 未マッピングはスキップ→初対戦

		const { status, json } = await afClient.get(
			`/fixtures/headtohead?h2h=${afHome}-${afAway}`,
		);
		if (status === 429) break; // レート上限 → 部分コミットして次回継続
		if (status !== 200 || !json) continue; // その他失敗はスキップ

		const data = Array.isArray(json.response) ? json.response : [];
		const results = data.map(extractAfH2HResult).filter(Boolean);
		const agg = aggregateResults(afHome, results);
		specs.push(
			h2hStatement(
				{
					fixture_id: t.sm_fixture_id,
					home_code: homeCode,
					away_code: awayCode,
					home_wins: agg.home_wins,
					draws: agg.draws,
					away_wins: agg.away_wins,
					total: agg.total,
				},
				updatedAt,
			),
		);
	}
	if (!specs.length) return { count: 0 };
	try {
		await runBatch(db, specs);
		return { count: specs.length };
	} catch (e) {
		console.error("syncH2H: upsert failed", e?.message);
		return { count: 0, error: e?.message };
	}
}
```

> `h2hStatement`/`runBatch` の import が `sm-sync.js` に既存であることを確認（旧 syncH2H が使用済み）。無ければ `sm-store.js` から追加。

- [ ] **Step 5: テストが通ることを確認**

Run: `node --test functions/_lib/sm-sync.test.js`
Expected: PASS（新 syncH2H 4 ケース＋既存ケース）

- [ ] **Step 6: 全テスト回帰**

Run: `npm test`
Expected: 全 PASS（H2H 以外に影響なし）

- [ ] **Step 7: コミット**

```bash
git add functions/_lib/sm-sync.js functions/_lib/sm-sync.test.js
git commit -m "feat(h2h): syncH2H を API-Football 経路へ置換（未キャッシュ選択＋レート制御）"
```

---

### Task 6: worker-watch 配線（クライアント生成・max トリガ・シークレット）

**Files:**
- Modify: `worker-watch/src/index.js`（import 追加、daily の syncH2H 呼び出し、`?action=h2h` に `max` 受理）

**Interfaces:**
- Consumes: `makeAfClient`（Task3）, `syncH2H`（Task5）。
- daily: `syncH2H(afClient, env.DB, now)`（既定 max=8）。
- 手動: `?action=h2h&max=N&key=<WATCH_CRON_KEY>` → `syncH2H(afClient, env.DB, now, {max})`。

- [ ] **Step 1: import 追加**

`worker-watch/src/index.js` の import 群に追加:
```js
import { makeAfClient } from "../../functions/_lib/apifootball-client.js";
```

- [ ] **Step 2: AF クライアント生成ヘルパ**

`clients(env)` の近くに、トークンがあれば AF クライアントを返す小ヘルパを追加（無ければ null）:
```js
function afClient(env) {
	return env.APIFOOTBALL_TOKEN ? makeAfClient({ token: env.APIFOOTBALL_TOKEN }) : null;
}
```

- [ ] **Step 3: daily の syncH2H 呼び出しを差し替え**

`worker-watch/src/index.js` の daily ブロック（`if (env.H2H_ENABLED === "true") { ... }`）を:
```js
if (env.H2H_ENABLED === "true") {
	const h = await syncH2H(afClient(env), env.DB, now);
	console.log(
		`watch-cron daily: h2h=${h.count}${h.error ? " err=" + h.error : ""}`,
	);
}
```

- [ ] **Step 4: 手動トリガに max 受理を追加**

`if (action === "h2h") { ... }` を:
```js
if (action === "h2h") {
	const max = Number(url.searchParams.get("max")) || 8;
	const r = await syncH2H(afClient(env), env.DB, now, { max });
	return Response.json({ ok: true, ...r });
}
```

- [ ] **Step 5: ローカル構文チェック（テストは worker-watch 非対象だが import 解決を確認）**

Run: `node --check worker-watch/src/index.js`
Expected: エラーなし（構文 OK）。

- [ ] **Step 6: 全テスト回帰**

Run: `npm test`
Expected: 全 PASS。

- [ ] **Step 7: コミット**

```bash
git add worker-watch/src/index.js
git commit -m "feat(h2h): worker-watch を API-Football クライアント＋max トリガへ配線"
```

---

### Task 7: デプロイ・初期バックフィル・本番検証（ops）

**Files:** （コード変更なし。運用手順）

**前提:** Task 1–6 がマージ可能状態。`feat/h2h-apifootball` を main へ PR/マージ（Pages 側 CI デプロイ）。worker-watch は手動デプロイ。

- [ ] **Step 1: APIFOOTBALL_TOKEN を worker-watch に登録**

Run（ユーザー実行・本番シークレット）:
```bash
cd worker-watch && printf '%s' "<APIFOOTBALL_TOKEN>" | npx wrangler secret put APIFOOTBALL_TOKEN
```
Expected: `Success! Uploaded secret APIFOOTBALL_TOKEN`

- [ ] **Step 2: worker-watch をデプロイ**

Run: `cd worker-watch && npx wrangler deploy`
Expected: `Deployed wcup2026-watch-cron`。バインディングに `env.APIFOOTBALL_TOKEN` と `env.H2H_ENABLED ("true")` が出る。

- [ ] **Step 3: 既存 SportMonks 由来の sm_h2h をクリア**

Run: `npx wrangler d1 execute wcup2026-db --remote --command "DELETE FROM sm_h2h"`
Expected: 削除成功（28行程度）。これ以降は未キャッシュのみ取得で API-Football により再充填。

- [ ] **Step 4: 初期バックフィル（429 まで投入 → 再実行を繰り返す）**

Run（`WATCH_CRON_KEY` はユーザー保有値）:
```bash
curl -s "https://wcup2026-watch-cron.wktiki484.workers.dev/?action=h2h&max=28&key=<WATCH_CRON_KEY>"
```
Expected: `{"ok":true,"count":<約8〜10>}`。per-minute 上限で部分投入。**1分空けて同じコマンドを再実行**し、`count` が 0 になるまで繰り返す（約3回）。

- [ ] **Step 5: 本番 D1 で投入を検証**

Run:
```bash
npx wrangler d1 execute wcup2026-db --remote --json --command \
"SELECT count(*) rows, SUM(total) tot, SUM(CASE WHEN total>0 THEN 1 ELSE 0 END) with_data FROM sm_h2h"
```
Expected: `rows` が窓内の対象数、`with_data`（total>0）が SportMonks 版より大幅増（GER-NED 等が二桁で入る）。

- [ ] **Step 6: 値の妥当性スポットチェック**

Run:
```bash
npx wrangler d1 execute wcup2026-db --remote --json --command \
"SELECT home_code, away_code, home_wins, draws, away_wins, total FROM sm_h2h WHERE total>0 ORDER BY total DESC LIMIT 10"
```
Expected: 既知対戦（例 GER-NED）が probe 実測（11戦等）と整合。

- [ ] **Step 7: メモリ更新**

`wcup-prematch-h2h.md` に「データソースを API-Football へ置換（本設計）」「sm_h2h は API-Football 由来」を追記。

---

## Self-Review

**1. Spec coverage（spec 各節 → タスク対応）:**
- 完全置換 → Task5（syncH2H 書き換え・SM fetch 廃止）、Task2（SM パース削除）✓
- 静的 JSON マップ → Task4 ✓
- 一度取得キャッシュ（LEFT JOIN・未キャッシュ選択） → Task5 Step4 SQL ✓
- API-Football 仕様（ホスト/ヘッダ/H2H/429） → Task3（client）、Task5（429 停止）✓
- パーサ純関数 → Task1 ✓
- 集計ソース非依存化 → Task2 ✓
- worker-watch 配線＋APIFOOTBALL_TOKEN＋max → Task6, Task7 Step1 ✓
- 初期バックフィル（DELETE → 手動トリガ・429 再実行） → Task7 ✓
- graceful degradation（未設定/未マッピング/429/失敗→初対戦・5xxなし） → Task5（早期 return/skip）、Task3（throw しない）✓
- テスト（extract/aggregate/syncH2H 選択・skip・429・max） → Task1,2,5 ✓
- ID マップ生成スクリプト＋手動検証 → Task4 ✓

**2. Placeholder scan:** `af-team-map.js` の「… 残りの app_code …」は**生成結果から確定する手順付き**（Task4 Step3–4）であり、未確定プレースホルダではなく run-to-fill の実データ依存。他に TBD/TODO なし。

**3. Type consistency:**
- `extractAfH2HResult` 戻り（`{home_team_id,away_team_id,home_score,away_score}`）= `aggregateResults` 入力 ✓
- `aggregateResults(homeTeamId, results)` 名称が Task2 定義と Task5 使用で一致 ✓
- `afClient.get(path) -> {status, json}`（Task3）= Task5 使用と一致 ✓
- `afIdForCode(code) -> number|null`（Task4）= Task5 使用と一致 ✓
- `syncH2H(afClient, db, now, {windowDays,max})`（Task5）= Task6 呼び出しと一致 ✓
