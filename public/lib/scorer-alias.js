// 得点王エイリアス表の操作（純関数・非破壊）。採点本体は scoring.js。
import { normalize } from "./scoring.js";

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
