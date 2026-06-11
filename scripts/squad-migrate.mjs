// 名簿(squads)をAPI表記へ改名し、綴りが変わった選手だけエイリアスを自動生成する純変換。
// 予想/正解データは不変。エイリアスは旧予想 "旧name (CODE)" を新canonical へ橋渡しして採点一致を保つ。
// canonical/upsert は採点本体と同一実装を再利用（ロジック重複なし＝採点時と完全一致）。
import { canonicalKey } from "../public/lib/scoring.js";
import { upsertAlias } from "../public/lib/scorer-alias.js";

// squads: { CODE: [{name,pos,club}] } / mapping: { CODE: { 旧name: 新name } }
// 戻り値: { squads(改名後), aliases(自動生成込み), report(集計) }
export function migrateSquads(squads = {}, mapping = {}, baseAliases = []) {
	const out = {};
	let aliases = (baseAliases || []).map((a) => ({
		...a,
		variants: [...(a.variants || [])],
	}));
	const report = {
		renamed: 0,
		aliased: 0,
		accentOnly: 0,
		unchanged: 0,
		perTeam: {},
	};
	for (const code of Object.keys(squads || {})) {
		const map = mapping[code] || {};
		out[code] = (squads[code] || []).map((p) => {
			if (!p || !p.name) return p;
			const newName = map[p.name];
			if (!newName || newName === p.name) {
				report.unchanged++;
				return p;
			}
			report.renamed++;
			const oldVariant = `${p.name} (${code})`;
			const newCanonical = canonicalKey(`${newName} (${code})`);
			if (canonicalKey(oldVariant) !== newCanonical) {
				aliases = upsertAlias(aliases, {
					canonical: newCanonical,
					variant: oldVariant,
				});
				report.aliased++;
				report.perTeam[code] = (report.perTeam[code] || 0) + 1;
			} else {
				report.accentOnly++;
			}
			return { ...p, name: newName };
		});
	}
	return { squads: out, aliases, report };
}
