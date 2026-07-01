import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildShootoutTimeline,
	isShootoutEvent,
} from "../../public/lib/shootout.js";

const HOME = 10;
const AWAY = 20;

test("isShootoutEvent: PK戦 type のみ true", () => {
	assert.equal(isShootoutEvent("pen_shootout_goal"), true);
	assert.equal(isShootoutEvent("pen_shootout_miss"), true);
	assert.equal(isShootoutEvent("penalty"), false);
	assert.equal(isShootoutEvent("missed_penalty"), false);
	assert.equal(isShootoutEvent("goal"), false);
	assert.equal(isShootoutEvent(null), false);
});

test("buildShootoutTimeline: PK戦以外は除外される", () => {
	const events = [
		{ sm_event_id: 1, type: "goal", team_id: HOME, sort_order: 1 },
		{ sm_event_id: 2, type: "pen_shootout_goal", team_id: HOME, sort_order: 2 },
	];
	const rows = buildShootoutTimeline(events, HOME);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].ev.sm_event_id, 2);
});

test("buildShootoutTimeline: sort_order 昇順に並ぶ（順不同入力）", () => {
	const events = [
		{
			sm_event_id: 30,
			type: "pen_shootout_goal",
			team_id: AWAY,
			sort_order: 3,
		},
		{
			sm_event_id: 10,
			type: "pen_shootout_goal",
			team_id: HOME,
			sort_order: 1,
		},
		{
			sm_event_id: 20,
			type: "pen_shootout_goal",
			team_id: AWAY,
			sort_order: 2,
		},
	];
	const rows = buildShootoutTimeline(events, HOME);
	assert.deepEqual(
		rows.map((r) => r.ev.sm_event_id),
		[10, 20, 30],
	);
});

test("buildShootoutTimeline: 全成功交互の累積スコア", () => {
	const events = [
		{ sm_event_id: 1, type: "pen_shootout_goal", team_id: HOME, sort_order: 1 },
		{ sm_event_id: 2, type: "pen_shootout_goal", team_id: AWAY, sort_order: 2 },
		{ sm_event_id: 3, type: "pen_shootout_goal", team_id: HOME, sort_order: 3 },
	];
	const rows = buildShootoutTimeline(events, HOME);
	assert.deepEqual(
		rows.map((r) => r.running),
		[
			{ home: 1, away: 0 },
			{ home: 1, away: 1 },
			{ home: 2, away: 1 },
		],
	);
});

test("buildShootoutTimeline: 失敗ではスコアが増えない", () => {
	const events = [
		{ sm_event_id: 1, type: "pen_shootout_goal", team_id: HOME, sort_order: 1 },
		{ sm_event_id: 2, type: "pen_shootout_miss", team_id: AWAY, sort_order: 2 },
		{ sm_event_id: 3, type: "pen_shootout_miss", team_id: HOME, sort_order: 3 },
		{ sm_event_id: 4, type: "pen_shootout_goal", team_id: AWAY, sort_order: 4 },
	];
	const rows = buildShootoutTimeline(events, HOME);
	assert.deepEqual(
		rows.map((r) => r.running),
		[
			{ home: 1, away: 0 },
			{ home: 1, away: 0 },
			{ home: 1, away: 0 },
			{ home: 1, away: 1 },
		],
	);
});

test("buildShootoutTimeline: 空/PK戦0件は空配列", () => {
	assert.deepEqual(buildShootoutTimeline([], HOME), []);
	assert.deepEqual(
		buildShootoutTimeline(
			[{ sm_event_id: 1, type: "goal", team_id: HOME }],
			HOME,
		),
		[],
	);
});

test("buildShootoutTimeline: 壊れた入力でも例外なし・カウント不変", () => {
	assert.deepEqual(buildShootoutTimeline(null, HOME), []);
	assert.deepEqual(buildShootoutTimeline(undefined, HOME), []);
	const events = [
		{ sm_event_id: 1, type: "pen_shootout_goal", team_id: null, sort_order: 1 },
		{ sm_event_id: 2, type: "pen_shootout_goal", team_id: HOME, sort_order: 2 },
	];
	const rows = buildShootoutTimeline(events, HOME);
	// team_id=null は home でも away でもないので加算されない
	assert.deepEqual(
		rows.map((r) => r.running),
		[
			{ home: 0, away: 0 },
			{ home: 1, away: 0 },
		],
	);
});
