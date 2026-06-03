import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCORING, scoreMember } from '../../public/lib/scoring.js';

const RESULT = {
  champion: 'ARG', runnerUp: 'FRA', topScorer: 'ムバッペ',
  groupResult: { A: ['MEX', 'KOR', 'RSA', 'CZE'], F: ['NED', 'JPN', 'TUN', 'SWE'] },
  knockout: {
    r32: ['ARG', 'FRA', 'BRA', 'ESP'],
    r16: ['ARG', 'BRA'],
    qf: ['ARG'],
    sf: ['ARG'],
  },
};

test('配点定数', () => {
  assert.equal(SCORING.champion, 25);
  assert.equal(SCORING.runnerUp, 15);
  assert.equal(SCORING.topScorer, 20);
  assert.equal(SCORING.rankHit, 1);
  assert.equal(SCORING.koHit, 1);
});

test('コア満点', () => {
  const s = scoreMember({ champion: 'ARG', runnerUp: 'FRA', topScorer: 'ムバッペ' }, RESULT);
  assert.equal(s.core.total, 60);
  assert.equal(s.coreTotal, 60);
  assert.equal(s.optionTotal, 0);
  assert.equal(s.grandTotal, 60);
});

test('得点王は前後空白を無視して一致', () => {
  const s = scoreMember({ topScorer: ' ムバッペ ' }, RESULT);
  assert.equal(s.core.topScorer, 20);
});

test('オプション未着手なら grandTotal === coreTotal', () => {
  const s = scoreMember({ champion: 'ARG' }, RESULT);
  assert.equal(s.coreTotal, 25);
  assert.equal(s.grandTotal, 25);
});

test('グループ順位は位置ピタリで +1（1〜3位のみ）', () => {
  const pred = { groupRank: { A: ['MEX', 'KOR', 'XXX'], F: ['NED', 'SWE', 'XXX'] } };
  const s = scoreMember(pred, RESULT);
  // A: 1位MEX○ 2位KOR○ 3位XXX× = 2点 / F: 1位NED○ 2位SWE× 3位XXX× = 1点
  assert.equal(s.option.groupRank, 3);
  assert.equal(s.option.rankHits, 3);
});

test('ノックアウトは到達ラウンドごとに +1', () => {
  const pred = {
    knockout: {
      r32: ['ARG', 'FRA', 'XXX'], // ARG○ FRA○ XXX× = 2
      r16: ['ARG'],               // ○ = 1
      qf: ['BRA'],                // × = 0
      sf: ['ARG'],                // ○ = 1
    },
  };
  const s = scoreMember(pred, RESULT);
  assert.equal(s.option.knockout, 4);
  assert.deepEqual(s.option.koHits, { r32: 2, r16: 1, qf: 0, sf: 1 });
});

test('総合は コア + オプション', () => {
  const pred = {
    champion: 'ARG',
    groupRank: { A: ['MEX', 'KOR', 'RSA'] }, // 3点
    knockout: { r32: ['ARG'] },              // 1点
  };
  const s = scoreMember(pred, RESULT);
  assert.equal(s.coreTotal, 25);
  assert.equal(s.optionTotal, 4);
  assert.equal(s.grandTotal, 29);
});
