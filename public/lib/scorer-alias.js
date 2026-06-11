// 得点王エイリアス表の操作（純関数・非破壊）。採点本体は scoring.js。
import { canonicalKey, normalize, resolve } from "./scoring.js";

// aliases[] → { normalize(変種): canonical } の検索マップ
export function buildAliasMap(aliases = []) {
	const map = {};
	for (const rec of aliases || []) {
		if (!rec || !rec.canonical) continue;
		for (const v of rec.variants || []) {
			const k = normalize(v);
			if (k) map[k] = rec.canonical;
		}
	}
	return map;
}

// canonical 単位で変種/ID を追記した新しい aliases 配列を返す（元配列は不変）
export function upsertAlias(
	aliases = [],
	{ canonical, variant, smPlayerId } = {},
) {
	if (!canonical) return (aliases || []).slice();
	const list = (aliases || []).map((r) => ({
		...r,
		variants: [...(r.variants || [])],
	}));
	let rec = list.find((r) => r.canonical === canonical);
	if (!rec) {
		rec = { canonical, variants: [] };
		list.push(rec);
	}
	if (
		variant &&
		!rec.variants.some((v) => normalize(v) === normalize(variant))
	) {
		rec.variants.push(variant);
	}
	if (smPlayerId != null) rec.smPlayerId = smPlayerId;
	return list;
}

// 名簿(squads)の全選手を canonical 集合に。result/予想の保存形式 "NAME (CODE)" と同じ畳み方。
export function rosterCanonicalSet(squads = {}) {
	const set = new Set();
	for (const code of Object.keys(squads || {})) {
		for (const p of squads[code] || []) {
			if (p && p.name) set.add(canonicalKey(`${p.name} (${code})`));
		}
	}
	return set;
}

// SportMonks 等の選手名を解決し、名簿に存在すれば canonical、無ければ null（=手動突合送り）。
// (CODE)/エイリアスで国が確定すれば直接一致。裸の名前は名簿の "CODE::名前" 末尾一致が
// 一意なときだけ採用（同名が複数国にいる曖昧ケースは手動送りで null）。
export function autoMatchScorer(name, aliasMap = {}, rosterSet = new Set()) {
	if (!name) return null;
	const canon = resolve(name, aliasMap);
	if (rosterSet.has(canon)) return canon;
	if (!canon.includes("::")) {
		const sep = "::";
		const hits = [...rosterSet].filter(
			(k) => k.slice(k.indexOf(sep) + sep.length) === canon,
		);
		if (hits.length === 1) return hits[0];
	}
	return null;
}
