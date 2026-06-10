import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePlayer } from "./sm-player.js";

const sample = {
	id: 21773355,
	name: "Ayase Ueda",
	display_name: "A. Ueda",
	image_path: "https://cdn/u.png",
	height: 182,
	weight: 76,
	date_of_birth: "1998-08-28",
	position_id: 27,
	detailed_position_id: 153,
	nationality: { name: "Japan", image_path: "https://cdn/jp.png" },
	detailedposition: { name: "Centre Forward" },
	metadata: [{ type_id: 229, values: "right" }],
	teams: [
		{
			start: null,
			end: "2019-06-18",
			team: { name: "Japan", image_path: "https://cdn/jpn.png" },
		},
		{
			start: "2023-08-03",
			end: "2028-06-30",
			team: { name: "Feyenoord", image_path: "https://cdn/fey.png" },
		},
	],
	statistics: [
		{ season_id: 5796, details: [] },
		{
			season_id: 22294,
			season: { name: "2024/2025", league: { name: "Eredivisie" } },
			details: [
				{ type_id: 321, value: { total: 3 } },
				{ type_id: 52, value: { total: 8, goals: 7, penalties: 1 } },
				{ type_id: 119, value: { total: 245 } },
				{ type_id: 118, value: { average: 6.95 } },
				{ type_id: 80, value: { total: 39 } },
				{ type_id: 42, value: { total: 4 } },
				{ type_id: 86, value: { total: 2 } },
			],
		},
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
	assert.equal(profile.club_name, "Feyenoord");
	assert.equal(profile.club_image, "https://cdn/fey.png");
});

test("normalizePlayer maps season stats, drops empty seasons", () => {
	const { seasons } = normalizePlayer(sample);
	assert.equal(seasons.length, 1);
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
