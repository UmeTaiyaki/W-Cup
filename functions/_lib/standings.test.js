import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFixtures, computeStandings } from '../../public/lib/standings.js';

test('generateFixtures は4チームから6試合を生成', () => {
  const f = generateFixtures(['A', 'B', 'C', 'D']);
  assert.equal(f.length, 6);
  assert.deepEqual(f[0], { a: 'A', b: 'B' });
});

test('generateFixtures は空スロットを除いた組のみ生成', () => {
  const f = generateFixtures(['A', 'B', '', '']);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0], { a: 'A', b: 'B' });
});

test('computeStandings は勝点・得失点を集計しソート', () => {
  const members = ['A', 'B', 'C', 'D'];
  const matches = [
    { a: 'A', b: 'B', ga: 2, gb: 1 }, // A勝
    { a: 'A', b: 'C', ga: 1, gb: 1 }, // 分
    { a: 'A', b: 'D', ga: 3, gb: 0 }, // A勝
    { a: 'B', b: 'C', ga: 0, gb: 0 }, // 分
    { a: 'B', b: 'D', ga: 2, gb: 2 }, // 分
    { a: 'C', b: 'D', ga: 1, gb: 0 }, // C勝
  ];
  const rows = computeStandings(members, matches);
  assert.equal(rows[0].code, 'A');
  assert.equal(rows[0].pts, 7); // 2勝1分
  assert.equal(rows[0].gd, 4);
  assert.equal(rows[0].played, 3);
  assert.equal(rows[0].w, 2);
  assert.equal(rows[0].d, 1);
  assert.equal(rows[0].l, 0);
});

test('computeStandings は未消化試合を除外', () => {
  const rows = computeStandings(['A', 'B'], [{ a: 'A', b: 'B', ga: null, gb: null }]);
  assert.equal(rows[0].played, 0);
  assert.equal(rows[0].pts, 0);
});

test('computeStandings 同点は得失点差→総得点→登録順', () => {
  const members = ['A', 'B'];
  const matches = [{ a: 'A', b: 'B', ga: 5, gb: 5 }];
  const rows = computeStandings(members, matches);
  // 同勝点・同得失点・同総得点 → 登録順で A が先
  assert.equal(rows[0].code, 'A');
  assert.equal(rows[1].code, 'B');
});

test('computeStandings 試合ゼロでも全メンバーを返す', () => {
  const rows = computeStandings(['A', 'B', 'C', 'D'], []);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.played === 0));
});
