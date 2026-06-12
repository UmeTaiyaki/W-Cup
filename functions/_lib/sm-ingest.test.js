import assert from "node:assert/strict";
import { test } from "node:test";
import {
	EVENT_TYPE_NAMES,
	toEventRows,
	toFixtureRow,
	toLineupRows,
	toPlayerStatRows,
	toStatRows,
	toTeamRows,
	toTopscorerRows,
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

test("toFixtureRow: xGFixture(camelCase)キーでも xG を取れる", () => {
	const row = toFixtureRow({
		...fixtureDetail,
		xgfixture: undefined,
		xGFixture: fixtureDetail.xgfixture,
	});
	assert.equal(row.home_xg, 1.84);
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

test("toEventRows: VAR(type_id=10) を sub_type で解決し黒丸を出さない", () => {
	const detail = {
		id: 1,
		events: [
			// 韓国vsチェコ実データ: 78' Souček の VAR ゴール取消
			{
				id: 901,
				type_id: 10,
				sub_type_id: 1512,
				minute: 78,
				player_name: "Tomáš Souček",
			},
			// 未知の VAR サブタイプは汎用 "var" にフォールバック
			{ id: 902, type_id: 10, sub_type_id: 99999, minute: 80 },
			// VAR_CARD(type_id=1697・メキシコvs南ア実データ) も VAR として解決
			{ id: 904, type_id: 1697, sub_type_id: 9701, minute: 82 },
			// 未知 type_id は従来どおり null（フロントは無アイコン）
			{ id: 903, type_id: 9999, minute: 81 },
		],
	};
	const rows = toEventRows(detail);
	assert.equal(
		rows.find((r) => r.sm_event_id === 901).type,
		"var_goal_disallowed",
	);
	assert.equal(rows.find((r) => r.sm_event_id === 902).type, "var");
	assert.equal(rows.find((r) => r.sm_event_id === 904).type, "var");
	assert.equal(rows.find((r) => r.sm_event_id === 903).type, null);
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
	assert.equal(hakimi.position, "25");
	assert.equal(hakimi.xg, 0.12);
	const morata = rows.find((r) => r.player_id === 601);
	assert.equal(morata.is_start, 0);
	assert.equal(morata.formation_field, null);
	assert.equal(morata.xg, null);
});

test("toLineupRows: lineups 欠落で空配列（障害隔離）", () => {
	assert.deepEqual(toLineupRows({}), []);
});

test("toPlayerStatRows: details を (fixture,player,type) 縦持ちに展開", () => {
	const rows = toPlayerStatRows(fixtureDetail);
	assert.equal(rows.length, 2); // player 502 の details 2件のみ。501/601 は details 無し
	const shots = rows.find((r) => r.player_id === 502 && r.type_id === 42);
	assert.equal(shots.value, 3);
	assert.equal(shots.sm_fixture_id, 18452339);
});

test("toPlayerStatRows: details 無しは空（障害隔離）", () => {
	assert.deepEqual(toPlayerStatRows({}), []);
});

test("toLineupRows maps player bio from lineups.player", () => {
	const detail = {
		id: 1,
		lineups: [
			{
				fixture_id: 1,
				team_id: 5,
				player_id: 100,
				player_name: "Test Player",
				jersey_number: 9,
				position_id: 27,
				formation_field: "4:1",
				type_id: 11,
				detailed_position: "Centre Forward",
				player: {
					date_of_birth: "1997-05-20",
					height: 180,
					weight: 75,
					nationality_id: 32,
					nationality: { name: "Japan" },
					teams: [
						{
							name: "Brighton",
							image_path: "https://cdn/club.png",
							meta: { active: true },
						},
					],
				},
			},
		],
	};
	const r = toLineupRows(detail)[0];
	assert.equal(r.date_of_birth, "1997-05-20");
	assert.equal(r.height, 180);
	assert.equal(r.weight, 75);
	assert.equal(r.nationality_id, 32);
	assert.equal(r.nationality_name, "Japan");
	assert.equal(r.detailed_position, "Centre Forward");
	assert.equal(r.club_name, "Brighton");
	assert.equal(r.club_image, "https://cdn/club.png");
});

test("toLineupRows tolerates missing bio (null)", () => {
	const r = toLineupRows({
		id: 1,
		lineups: [{ player_id: 1, team_id: 5, type_id: 12 }],
	})[0];
	assert.equal(r.date_of_birth, null);
	assert.equal(r.nationality_name, null);
	assert.equal(r.club_name, null);
});

test("toFixtureRow は stage.name を round_name に採用（KO構造は stage 由来）", () => {
	const row = toFixtureRow({
		id: 1,
		participants: [],
		scores: [],
		stage: { id: 9, name: "Round of 16" },
	});
	assert.equal(row.round_name, "Round of 16");
});

test("toFixtureRow は stage を round より優先", () => {
	const row = toFixtureRow({
		id: 2,
		participants: [],
		scores: [],
		stage: { name: "Final" },
		round: { name: "3" },
	});
	assert.equal(row.round_name, "Final");
});

test("toFixtureRow は stage が無ければ round.name、どちらも無ければ null", () => {
	assert.equal(
		toFixtureRow({ id: 3, participants: [], scores: [], round: { name: "1" } })
			.round_name,
		"1",
	);
	assert.equal(
		toFixtureRow({ id: 4, participants: [], scores: [] }).round_name,
		null,
	);
});

test("toEventRows maps player_id and related_player_id", () => {
	const detail = {
		id: 1,
		events: [
			{
				id: 10,
				fixture_id: 1,
				type_id: 19,
				minute: 41,
				participant_id: 5,
				player_id: 999,
				related_player_id: null,
			},
			{
				id: 11,
				fixture_id: 1,
				type_id: 18,
				minute: 70,
				participant_id: 5,
				player_id: 100,
				related_player_id: 200,
			},
		],
	};
	const rows = toEventRows(detail);
	assert.equal(rows[0].player_id, 999);
	assert.equal(rows[0].related_player_id, null);
	assert.equal(rows[1].player_id, 100);
	assert.equal(rows[1].related_player_id, 200);
});

test("toTopscorerRows は goals 種別のみ抽出し goals/position/player を整形", () => {
	const rows = toTopscorerRows(
		{
			data: [
				{
					position: 1,
					total: 5,
					type_id: 208,
					player_id: 11,
					participant_id: 99,
					player: { name: "A. Striker" },
					participant: { id: 99, short_code: "BRA", name: "Brazil" },
				},
				{
					position: 1,
					total: 4,
					type_id: 209,
					player_id: 11,
					participant_id: 99,
					player: { name: "A. Striker" },
				},
			],
		},
		26618,
	);
	assert.equal(rows.length, 1);
	assert.deepEqual(rows[0], {
		season_id: 26618,
		player_id: 11,
		player_name: "A. Striker",
		team_id: 99,
		app_code: null,
		goals: 5,
		position: 1,
	});
});

test("toTopscorerRows は壊れた入力でも例外を投げず空配列", () => {
	assert.deepEqual(toTopscorerRows(null, 26618), []);
	assert.deepEqual(toTopscorerRows({ data: "x" }, 26618), []);
});
