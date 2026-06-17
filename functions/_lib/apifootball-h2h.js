// API-Football H2H（/fixtures/headtohead）の 1 fixture を正規化する純関数。
// 出力形は sm-h2h.js の aggregateResults が受ける {home_team_id, away_team_id, home_score, away_score}。

export function extractAfH2HResult(fixture) {
	const teams = fixture && fixture.teams;
	const goals = fixture && fixture.goals;
	if (!teams || !goals) return null;
	if (goals.home == null || goals.away == null) return null;
	const homeId = Number(teams.home && teams.home.id);
	const awayId = Number(teams.away && teams.away.id);
	const hg = Number(goals.home);
	const ag = Number(goals.away);
	if (
		!Number.isFinite(homeId) ||
		!Number.isFinite(awayId) ||
		!Number.isFinite(hg) ||
		!Number.isFinite(ag)
	) {
		return null;
	}
	return {
		home_team_id: homeId,
		away_team_id: awayId,
		home_score: hg,
		away_score: ag,
	};
}
