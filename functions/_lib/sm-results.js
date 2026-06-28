// sm_* 行 → 採点が読む result/groupMatches への純導出（大会結果自動反映）
// 不変条件: 副作用なし。壊れた/欠損入力でも例外を投げず空・null で返す（障害隔離）。
// FT確定ルール: 採点に効く確定値は status==="FT" の試合からのみ。順位表表示はライブ込み。

import {
	computeStandings,
	provisionalThirdGroups,
} from "../../public/lib/standings.js";

// 突合用に round 名を正規化（小文字化・英数のみ）
function normRound(s) {
	return String(s == null ? "" : s)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

// SportMonks round/stage 名 → アプリのノックアウト到達キー。群リーグ・決勝・3位決定は null。
export function roundKey(roundName) {
	const n = normRound(roundName);
	if (n === "roundof32") return "r32";
	if (n === "roundof16") return "r16";
	if (n === "quarterfinals") return "qf";
	if (n === "semifinals") return "sf";
	return null;
}

// 決勝のみ true。"3rd Place Final" を誤検出しないため完全一致で判定。
export function isFinalRound(roundName) {
	return normRound(roundName) === "final";
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// 各グループに属する fixtures（両 app_code が同一グループ）のスコアを {a,b,ga,gb} 配列で返す。
// 順位表「表示」用なのでライブ(LIVE/FT)のスコアを含める。NS/スコア欠落は除外。
export function deriveGroupMatches(fixtures, groups) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const out = {};
	for (const g of Object.keys(groups || {})) {
		const members = new Set((groups[g] || []).filter(Boolean));
		out[g] = [];
		for (const fx of list) {
			const a = fx?.home?.app_code,
				b = fx?.away?.app_code;
			if (!a || !b || !members.has(a) || !members.has(b)) continue;
			const ga = fx?.home?.score,
				gb = fx?.away?.score;
			if (!isNum(ga) || !isNum(gb)) continue;
			// status を保持: 表示側(matchResult)はライブ中を「確定結果」扱いしない。
			// 順位表(computeStandings)は a/b/ga/gb のみ読むのでライブ込みで動く。
			out[g].push({ a, b, ga, gb, status: fx?.status ?? null });
		}
	}
	return out;
}

// 当該グループの FT 試合を computeStandings 入力 {a,b,ga,gb} に変換する。
function ftGroupMatches(members, fixtures) {
	const set = new Set(members);
	const out = [];
	for (const fx of fixtures || []) {
		if (fx?.status !== "FT") continue;
		const a = fx?.home?.app_code,
			b = fx?.away?.app_code;
		const ga = fx?.home?.score,
			gb = fx?.away?.score;
		if (!set.has(a) || !set.has(b) || !isNum(ga) || !isNum(gb)) continue;
		out.push({ a, b, ga, gb });
	}
	return out;
}

// FIFA フェアプレーポイント（タイブレーカー⑦）。各選手・各試合のカードから減点する:
//   イエロー1枚 -1 / 2枚目イエロー(間接退場) -3 / 直接レッド -4 / イエロー+直接レッド -5
// cardEvents: listCardEvents の行 [{ sm_fixture_id, team_id, type_id, player_id }]。
// fixtures: listFixtures 結果（team_id→app_code 解決用）。groups: { G: [codes] }。
// 返り値: { app_code: points(<=0) }。各グループ所属チームの試合のみ集計（大きいほど上位）。
export function deriveFairPlay(cardEvents, fixtures, groups) {
	const out = {};
	const events = Array.isArray(cardEvents) ? cardEvents : [];
	if (!events.length) return out;

	// team_id → app_code（fixtures の home/away から）。
	const codeByTeam = new Map();
	for (const fx of fixtures || []) {
		if (fx?.home?.team_id != null && fx?.home?.app_code)
			codeByTeam.set(fx.home.team_id, fx.home.app_code);
		if (fx?.away?.team_id != null && fx?.away?.app_code)
			codeByTeam.set(fx.away.team_id, fx.away.app_code);
	}
	// app_code → グループ所属判定（どのグループにも属さないコードは集計対象外）。
	const inAnyGroup = new Set();
	for (const g of Object.keys(groups || {}))
		for (const c of groups[g] || []) if (c) inAnyGroup.add(c);

	// (試合, 選手) 単位でカードを束ね、選手ごとに FIFA 減点を確定する。
	const tally = new Map(); // key: fixture|player → { code, y, yr, dr }
	for (const e of events) {
		const code = codeByTeam.get(e?.team_id);
		if (!code || !inAnyGroup.has(code)) continue;
		const key = `${e?.sm_fixture_id}|${e?.player_id ?? "x"}`;
		if (!tally.has(key)) tally.set(key, { code, y: 0, yr: false, dr: false });
		const t = tally.get(key);
		if (e.type_id === 19)
			t.y += 1; // イエロー
		else if (e.type_id === 21)
			t.yr = true; // 2枚目イエロー(間接退場)
		else if (e.type_id === 20) t.dr = true; // 直接レッド
	}
	for (const t of tally.values()) {
		let pts;
		if (t.dr && t.y >= 1) pts = -5;
		else if (t.dr) pts = -4;
		else if (t.yr || t.y >= 2) pts = -3;
		else if (t.y === 1) pts = -1;
		else pts = 0;
		out[t.code] = (out[t.code] || 0) + pts;
	}
	return out;
}

// 全試合（4チーム総当たり=6試合）がFTのグループのみ、上位3コードを返す。未完は空配列。
// 順位は computeStandings（FIFA 2026 タイブレーカー: head-to-head 優先）で確定する。
// fairPlay/fifaRank は { app_code: number } マップ（⑦⑧用 / 省略時は登録順フォールバック）。
export function deriveGroupResult(
	fixtures,
	groups,
	fairPlay = {},
	fifaRank = {},
) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const out = {};
	for (const g of Object.keys(groups || {})) {
		const members = (groups[g] || []).filter(Boolean);
		const ftCount = list.filter((fx) => {
			if (fx?.status !== "FT") return false;
			const a = fx?.home?.app_code,
				b = fx?.away?.app_code;
			return members.includes(a) && members.includes(b);
		}).length;
		const expected = (members.length * (members.length - 1)) / 2;
		out[g] =
			ftCount >= expected && expected > 0
				? computeStandings(members, ftGroupMatches(members, list), {
						fairPlay,
						fifaRank,
					})
						.slice(0, 3)
						.map((r) => r.code)
				: [];
	}
	return out;
}

// グループステージが「全試合FT＝数学的に確定」したときのみ、3位通過する8組（組記号・昇順）を返す。
// best-8 サードの比較は全12組の最終成績を要するため、1組でも未完なら [] を返す（確定前は暫定扱い）。
// 並び順・比較器はフロント provisionalThirdGroups と同一にするため同関数へ委譲する。これにより
// グループステージ確定後に「暫定」バッジが外れるだけで、ブラケットに並ぶ3位8チームの顔ぶれは不変。
// opts.fairPlay/opts.fifaRank は computeStandings 用タイブレーカー（組内順位＝誰が3位か、に効く）。
export function deriveThirdGroups(fixtures, groups, opts = {}) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const gm = {};
	for (const g of Object.keys(groups || {})) {
		const members = (groups[g] || []).filter(Boolean);
		const expected = (members.length * (members.length - 1)) / 2;
		if (expected <= 0) return []; // 不正な組定義 → 確定不能
		const ft = ftGroupMatches(members, list);
		if (ft.length < expected) return []; // 当該組が未完 → 3位順位は未確定
		gm[g] = ft;
	}
	const picked = provisionalThirdGroups(groups, gm, opts);
	return picked.length === 8 ? picked : [];
}

// KO戦の勝者側を返す: "home" | "away" | null。
// 本スコア差で決まらなければ(=延長まで同点) PK戦スコア(home_pen/away_pen)で決める。
// KO戦は引き分けで終わらないので、PK決着の試合は本スコア同点でも必ず勝者がいる。
export function koWinnerSide(fx) {
	const hs = fx?.home?.score,
		as = fx?.away?.score;
	if (!isNum(hs) || !isNum(as)) return null;
	if (hs > as) return "home";
	if (hs < as) return "away";
	// 同点 → PK戦スコアで決める
	const hp = fx?.home?.pen_score,
		ap = fx?.away?.pen_score;
	if (isNum(hp) && isNum(ap) && hp !== ap) return hp > ap ? "home" : "away";
	return null; // 同点かつPK情報なし（試合中 or データ未到達）
}

// 決勝(FT)から優勝・準優勝。PK決着もPK戦スコアで判定。未FT/未確定は null。
export function deriveChampion(fixtures) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const fin = list.find(
		(fx) => isFinalRound(fx?.round_name) && fx?.status === "FT",
	);
	if (!fin) return { champion: null, runnerUp: null };
	const ha = fin?.home?.app_code,
		aa = fin?.away?.app_code;
	if (!ha || !aa) return { champion: null, runnerUp: null };
	const side = koWinnerSide(fin);
	if (!side) return { champion: null, runnerUp: null };
	return side === "home"
		? { champion: ha, runnerUp: aa }
		: { champion: aa, runnerUp: ha };
}

const KO_ROUNDS = ["r32", "r16", "qf", "sf"];

// 各ノックアウト round に「登場した」app_code 群（到達チーム。採点 knockout 用）。
// FT非限定なのは「到達」=ラウンドに進出した時点で確定だから（NSでも前ラウンド勝者）。
// 未確定スロットは app_code が null（48チームのみ seed 済）→ `if (a)` で自然に除外される。
export function deriveKnockout(fixtures) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const out = { r32: new Set(), r16: new Set(), qf: new Set(), sf: new Set() };
	for (const fx of list) {
		const k = roundKey(fx?.round_name);
		if (!k || !out[k]) continue;
		const a = fx?.home?.app_code,
			b = fx?.away?.app_code;
		if (a) out[k].add(a);
		if (b) out[k].add(b);
	}
	return Object.fromEntries(KO_ROUNDS.map((k) => [k, [...out[k]]]));
}

// 各ラウンドのFT勝者コード（ブラケット表示用）。final は決勝勝者。
export function deriveBracket(fixtures) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const winner = (fx) => {
		if (fx?.status !== "FT") return null;
		const side = koWinnerSide(fx); // PK決着も含めて勝者側を決定
		if (!side) return null;
		return side === "home" ? fx.home.app_code : fx.away.app_code;
	};
	const out = { r16: [], qf: [], sf: [], final: [] };
	for (const fx of list) {
		const w = winner(fx);
		if (!w) continue;
		const k = roundKey(fx?.round_name);
		if (k === "r16" || k === "qf" || k === "sf") out[k].push(w);
		else if (isFinalRound(fx?.round_name)) out.final.push(w);
	}
	return out;
}

// sm_topscorers 行（配信側で app_code 解決済み）→ 採点 result.topScorer 文字列。
// 採点 resolve() は "NAME (CODE)" を CODE::正規化名 へ畳むため、この形式に合わせる。
export function deriveTopScorer(rows) {
	const list = Array.isArray(rows) ? rows.slice() : [];
	if (!list.length) return "";
	list.sort(
		(a, b) =>
			(a?.position ?? 1e9) - (b?.position ?? 1e9) ||
			(b?.goals ?? 0) - (a?.goals ?? 0),
	);
	const top = list[0];
	const name = top?.player_name ?? "";
	if (!name) return "";
	return top?.app_code ? `${name} (${top.app_code})` : name;
}

// sm_topscorers 行 → 得点王ランキング「表示用」配列。フロントの SCORERS と同形:
//   { name: "PLAYER (CODE)" | "PLAYER", goals }
// position 昇順 → goals 降順。氏名/得点欠落は除外（graceful degradation）。
export function deriveScorers(rows) {
	const list = Array.isArray(rows) ? rows.slice() : [];
	return list
		.filter((r) => r && r.player_name && isNum(r.goals))
		.sort(
			(a, b) =>
				(a?.position ?? 1e9) - (b?.position ?? 1e9) ||
				(b?.goals ?? 0) - (a?.goals ?? 0),
		)
		.map((r) => ({
			name: r.app_code ? `${r.player_name} (${r.app_code})` : r.player_name,
			goals: r.goals,
		}));
}

// 全導出を採点が読む result 型に束ねる。groupMatches は順位表表示用に別関数で返す。
// opts.fairPlay/opts.fifaRank は { app_code: number }（タイブレーカー⑦⑧用 / 省略可）。
export function deriveResult(fixtures, topscorers, groups, opts = {}) {
	const { champion, runnerUp } = deriveChampion(fixtures);
	return {
		champion,
		runnerUp,
		topScorer: deriveTopScorer(topscorers),
		groupResult: deriveGroupResult(
			fixtures,
			groups,
			opts?.fairPlay || {},
			opts?.fifaRank || {},
		),
		// 3位通過8組（グループステージ確定時のみ非空）。フロントはこれで3位枠の暫定扱いを解除する。
		thirdGroups: deriveThirdGroups(fixtures, groups, {
			fairPlay: opts?.fairPlay || {},
			fifaRank: opts?.fifaRank || {},
		}),
		knockout: deriveKnockout(fixtures),
		bracket: deriveBracket(fixtures),
	};
}
