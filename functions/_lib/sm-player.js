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

// teams から現所属クラブ(end が最も未来 or null)を選ぶ。
function currentClub(teams) {
	const list = Array.isArray(teams) ? teams : [];
	if (list.length === 0) return null;
	const key = (t) => (t.end == null ? "9999-12-31" : String(t.end));
	let best = list[0];
	for (const t of list) if (key(t) > key(best)) best = t;
	return best?.team ?? null;
}

function foot(metadata) {
	const m = (Array.isArray(metadata) ? metadata : []).find(
		(x) => x.type_id === 229,
	);
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
