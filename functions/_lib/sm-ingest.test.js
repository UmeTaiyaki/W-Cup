import assert from "node:assert/strict";
import { test } from "node:test";
import {
	EVENT_TYPE_NAMES,
	toEventRows,
	toFixtureRow,
	toLineupRows,
	toStatRows,
	toTeamRows,
	toTypeRows,
} from "./sm-ingest.js";

// 実データ(fixture 18452339 Morocco vs Spain 2022)の構造を縮約したサンプル。
const fixtureDetail = {
	id: 18452339,
	name: "Morocco vs Spain",
	league_id: 732,
	season_id: 18017,
	starting_at: "2022-12-06 15:00:00",
	starting_at_timestamp: 1670338400,
	state_id: 8,
	venue_id: 338812,
	result_info: "Morocco won after penalties.",
	participants: [
		{
			id: 18551,
			name: "Morocco",
			short_code: "MAR",
			image_path: "https://cdn/18551.png",
			meta: { location: "home" },
		},
		{
			id: 18710,
			name: "Spain",
			short_code: "ESP",
			image_path: "https://cdn/18710.png",
			meta: { location: "away" },
		},
	],
	scores: [
		{
			type_id: 1,
			participant_id: 18551,
			score: { goals: 0, participant: "home" },
			description: "1ST_HALF",
		},
		{
			type_id: 1525,
			participant_id: 18551,
			score: { goals: 1, participant: "home" },
			description: "CURRENT",
		},
		{
			type_id: 1525,
			participant_id: 18710,
			score: { goals: 2, participant: "away" },
			description: "CURRENT",
		},
		{
			type_id: 5,
			participant_id: 18551,
			score: { goals: 3, participant: "home" },
			description: "PENALTY_SHOOTOUT",
		},
	],
	events: [
		{
			id: 157120044,
			participant_id: 18710,
			type_id: 18,
			player_name: "Álvaro Morata",
			related_player_name: "Marco Asensio",
			minute: 63,
			extra_minute: null,
			sort_order: 5,
		},
		{
			id: 157120099,
			participant_id: 18551,
			type_id: 14,
			player_name: "Scorer",
			related_player_name: null,
			minute: 70,
			extra_minute: 2,
			sort_order: 8,
		},
	],
	statistics: [
		{
			id: 1,
			type_id: 42,
			participant_id: 18710,
			data: { value: 13 },
			location: "away",
		},
		{
			id: 2,
			type_id: 45,
			participant_id: 18551,
			data: { value: 23 },
			location: "home",
		},
	],
	xgfixture: [
		{ participant_id: 18551, location: "home", type_id: 5304, value: 1.84 },
		{ participant_id: 18710, location: "away", type_id: 5304, value: 1.21 },
	],
	lineups: [
		{
			id: 1,
			team_id: 18551,
			player_id: 501,
			player_name: "Bono",
			jersey_number: 1,
			formation_field: "1:1",
			type_id: 11,
			position_id: 24,
			xglineup: { value: 0.0 },
		},
		{
			id: 2,
			team_id: 18551,
			player_id: 502,
			player_name: "Hakimi",
			jersey_number: 2,
			formation_field: "2:4",
			type_id: 11,
			position_id: 25,
			xglineup: { value: 0.12 },
			details: [
				{ type_id: 42, data: { value: 3 } },
				{ type_id: 86, data: { value: 1 } },
			],
		},
		{
			id: 3,
			team_id: 18710,
			player_id: 601,
			player_name: "Morata",
			jersey_number: 7,
			formation_field: null,
			type_id: 12,
			position_id: 27,
			xglineup: null,
		},
	],
};

test("toTeamRows: participants から2チーム抽出", () => {
	const rows = toTeamRows(fixtureDetail);
	assert.equal(rows.length, 2);
	const home = rows.find((r) => r.sm_team_id === 18551);
	assert.equal(home.name, "Morocco");
	assert.equal(home.short_code, "MAR");
	assert.equal(home.image_url, "https://cdn/18551.png");
});

test("toFixtureRow: home/away team を meta.location で判定", () => {
	const row = toFixtureRow(fixtureDetail);
	assert.equal(row.home_team_id, 18551);
	assert.equal(row.away_team_id, 18710);
});

test("toFixtureRow: 最終スコアは CURRENT(1525) から取る", () => {
	const row = toFixtureRow(fixtureDetail);
	assert.equal(row.home_score, 1);
	assert.equal(row.away_score, 2);
});

test("toFixtureRow: 基本フィールドと starting_at_ts", () => {
	const row = toFixtureRow(fixtureDetail);
	assert.equal(row.sm_fixture_id, 18452339);
	assert.equal(row.league_id, 732);
	assert.equal(row.season_id, 18017);
	assert.equal(row.state_id, 8);
	assert.equal(row.starting_at, "2022-12-06 15:00:00");
	assert.equal(row.starting_at_ts, 1670338400);
});

test("toFixtureRow: xG は xgfixture(location) から取る", () => {
	const row = toFixtureRow(fixtureDetail);
	assert.equal(row.home_xg, 1.84);
	assert.equal(row.away_xg, 1.21);
});

test("toFixtureRow: xgfixture 欠落でも xG は null（障害隔離）", () => {
	const row = toFixtureRow({ ...fixtureDetail, xgfixture: undefined });
	assert.equal(row.home_xg, null);
	assert.equal(row.away_xg, null);
});

test("toEventRows: events を行に変換し type 名を解決", () => {
	const rows = toEventRows(fixtureDetail);
	assert.equal(rows.length, 2);
	const sub = rows.find((r) => r.sm_event_id === 157120044);
	assert.equal(sub.type, "substitution");
	assert.equal(sub.team_id, 18710);
	assert.equal(sub.player_name, "Álvaro Morata");
	assert.equal(sub.related_player_name, "Marco Asensio");
	assert.equal(sub.minute, 63);
	const goal = rows.find((r) => r.sm_event_id === 157120099);
	assert.equal(goal.type, "goal");
	assert.equal(goal.extra_minute, 2);
});

test("toStatRows: data.value と participant→team を縦持ち化", () => {
	const rows = toStatRows(fixtureDetail);
	assert.equal(rows.length, 2);
	const poss = rows.find((r) => r.type_id === 45);
	assert.equal(poss.team_id, 18551);
	assert.equal(poss.value, 23);
	assert.equal(poss.sm_fixture_id, 18452339);
});

test("toTypeRows: types マスタを行に変換", () => {
	const rows = toTypeRows([
		{ id: 14, name: "Goal", code: "goal" },
		{ id: 5304, name: "Expected Goals (xG)", code: "expected-goals" },
	]);
	assert.equal(rows.length, 2);
	assert.deepEqual(
		rows.find((r) => r.type_id === 5304),
		{ type_id: 5304, name: "Expected Goals (xG)", code: "expected-goals" },
	);
});

test("EVENT_TYPE_NAMES: 確定済みの type_id 対応", () => {
	assert.equal(EVENT_TYPE_NAMES[14], "goal");
	assert.equal(EVENT_TYPE_NAMES[19], "yellowcard");
	assert.equal(EVENT_TYPE_NAMES[20], "redcard");
});

test("壊れた入力でも例外を投げない（空配列を返す）", () => {
	assert.deepEqual(toTeamRows({}), []);
	assert.deepEqual(toEventRows({}), []);
	assert.deepEqual(toStatRows({}), []);
	assert.deepEqual(toTypeRows(null), []);
	const row = toFixtureRow({ id: 5 });
	assert.equal(row.sm_fixture_id, 5);
	assert.equal(row.home_team_id, null);
});

test("toLineupRows: 先発/控えを type_id で判定し formation_field を保持", () => {
	const rows = toLineupRows(fixtureDetail);
	assert.equal(rows.length, 3);
	const hakimi = rows.find((r) => r.player_id === 502);
	assert.equal(hakimi.is_start, 1);
	assert.equal(hakimi.formation_field, "2:4");
	assert.equal(hakimi.jersey_number, 2);
	assert.equal(hakimi.xg, 0.12);
	const morata = rows.find((r) => r.player_id === 601);
	assert.equal(morata.is_start, 0);
	assert.equal(morata.formation_field, null);
	assert.equal(morata.xg, null);
});

test("toLineupRows: lineups 欠落で空配列（障害隔離）", () => {
	assert.deepEqual(toLineupRows({}), []);
});
