import assert from "node:assert/strict";
import { test } from "node:test";
import {
	matchPlayer,
	proposeMapping,
} from "../../scripts/propose-name-mapping.mjs";

// ── matchPlayer ─────────────────────────────────────────────

test("matchPlayer: 旧名 MBAPPE が Kylian Mbappé に high マッチ", () => {
	const smPlayers = [{ name: "Kylian Mbappé", jersey: 10, player_id: 1 }];
	const result = matchPlayer("MBAPPE", smPlayers);
	assert.ok(result !== null, "null でないこと");
	assert.equal(result.confidence, "high");
	assert.equal(result.newName, "Kylian Mbappé");
});

test("matchPlayer: 同姓の選手が2名いる場合は low", () => {
	const smPlayers = [
		{ name: "Roberto Firmino", jersey: 9, player_id: 2 },
		{ name: "Lucas Firmino", jersey: 21, player_id: 3 },
	];
	const result = matchPlayer("FIRMINO", smPlayers);
	assert.ok(result !== null, "null でないこと");
	assert.equal(result.confidence, "low");
});

test("matchPlayer: 一致なしは null", () => {
	const smPlayers = [{ name: "Lionel Messi", jersey: 10, player_id: 4 }];
	const result = matchPlayer("NEYMAR", smPlayers);
	assert.equal(result, null);
});

// ── proposeMapping ──────────────────────────────────────────

test("proposeMapping: high マッチは mapping に入る", () => {
	const squads = {
		FRA: [{ name: "MBAPPE", pos: "FW" }],
	};
	const smSquads = {
		FRA: [{ name: "Kylian Mbappé", jersey: 10, player_id: 1 }],
	};
	const { mapping, review } = proposeMapping(squads, smSquads);
	assert.ok(mapping.FRA, "FRA エントリがある");
	assert.equal(mapping.FRA["MBAPPE"], "Kylian Mbappé");
	assert.equal(review.high, 1);
});

test("proposeMapping: 曖昧マッチは review.low に入る", () => {
	const squads = {
		BRA: [{ name: "FIRMINO", pos: "FW" }],
	};
	const smSquads = {
		BRA: [
			{ name: "Roberto Firmino", jersey: 9, player_id: 2 },
			{ name: "Lucas Firmino", jersey: 21, player_id: 3 },
		],
	};
	const { mapping, review } = proposeMapping(squads, smSquads);
	assert.equal(Object.keys(mapping.BRA || {}).length, 0, "mapping に入らない");
	assert.equal(review.low.length, 1);
	assert.equal(review.low[0].code, "BRA");
	assert.equal(review.low[0].oldName, "FIRMINO");
});

test("proposeMapping: 一致なしは review.unmatched に入る", () => {
	const squads = {
		ARG: [{ name: "NEYMAR", pos: "FW" }],
	};
	const smSquads = {
		ARG: [{ name: "Lionel Messi", jersey: 10, player_id: 4 }],
	};
	const { mapping, review } = proposeMapping(squads, smSquads);
	assert.equal(Object.keys(mapping.ARG || {}).length, 0, "mapping に入らない");
	assert.equal(review.unmatched.length, 1);
	assert.equal(review.unmatched[0].code, "ARG");
	assert.equal(review.unmatched[0].oldName, "NEYMAR");
});

test("proposeMapping: newName が oldName と同一の場合は mapping に入らない", () => {
	// oldName と SM の display_name が完全一致 → ノイズになるのでスキップ
	const squads = {
		ENG: [{ name: "KANE", pos: "FW" }],
	};
	const smSquads = {
		ENG: [{ name: "KANE", jersey: 9, player_id: 5 }],
	};
	const { mapping } = proposeMapping(squads, smSquads);
	assert.equal(Object.keys(mapping.ENG || {}).length, 0, "同一名はスキップ");
});

// ── Tier 3: SURNAME + INITIAL ───────────────────────────────────

test("matchPlayer: R. RANGEL → high (姓ユニーク + イニシャル R が Raúl に一致)", () => {
	const smPlayers = [
		{ name: "Raúl Rangel", player_id: 10 },
		{ name: "Other Player", player_id: 11 },
	];
	const result = matchPlayer("R. RANGEL", smPlayers);
	assert.ok(result !== null, "null でないこと");
	assert.equal(result.confidence, "high");
	assert.equal(result.newName, "Raúl Rangel");
});

test("matchPlayer: T. RODRÍGUEZ → low (RODRIGUEZ が2名、どちらもTで始まらない)", () => {
	const smPlayers = [
		{ name: "José Luis Rodríguez", player_id: 20 },
		{ name: "Aníbal Rodríguez", player_id: 21 },
	];
	const result = matchPlayer("T. RODRÍGUEZ", smPlayers);
	assert.ok(result !== null, "null でないこと");
	assert.equal(result.confidence, "low");
});

test("matchPlayer: J.L. RODRÍGUEZ → high (先頭イニシャル J が José に一致)", () => {
	const smPlayers = [
		{ name: "José Luis Rodríguez", player_id: 20 },
		{ name: "Aníbal Rodríguez", player_id: 21 },
	];
	const result = matchPlayer("J.L. RODRÍGUEZ", smPlayers);
	assert.ok(result !== null, "null でないこと");
	assert.equal(result.confidence, "high");
	assert.equal(result.newName, "José Luis Rodríguez");
});

test("matchPlayer: WAN BISSAKA → high (ハイフン畳み後 BISSAKA が姓ユニーク、イニシャルなし)", () => {
	const smPlayers = [{ name: "Aaron Wan-Bissaka", player_id: 30 }];
	const result = matchPlayer("WAN BISSAKA", smPlayers);
	assert.ok(result !== null, "null でないこと");
	assert.equal(result.confidence, "high");
	assert.equal(result.newName, "Aaron Wan-Bissaka");
});

test("matchPlayer: ZZZ → null (一致なし)", () => {
	const smPlayers = [{ name: "Aaron Wan-Bissaka", player_id: 30 }];
	const result = matchPlayer("ZZZ", smPlayers);
	assert.equal(result, null);
});
