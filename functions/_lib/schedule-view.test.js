import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundLabel, formatMatchTeam, groupByDate, pickFocusDate, jstToday } from '../../public/lib/schedule-view.js';

test('roundLabel: グループ記号は「グループX」', () => {
  assert.equal(roundLabel('A'), 'グループA');
  assert.equal(roundLabel('L'), 'グループL');
});

test('roundLabel: ノックアウトのラウンド名', () => {
  assert.equal(roundLabel('R32'), 'ベスト32');
  assert.equal(roundLabel('R16'), 'ベスト16');
  assert.equal(roundLabel('QF'), '準々決勝');
  assert.equal(roundLabel('SF'), '準決勝');
  assert.equal(roundLabel('3位'), '3位決定戦');
  assert.equal(roundLabel('決勝'), '決勝');
});

test('roundLabel: F はグループF（決勝ではない）', () => {
  // 実データでは 'F' は常にグループF。決勝は round = '決勝'。
  assert.equal(roundLabel('F'), 'グループF');
});

test('roundLabel: 不明値はそのまま返す', () => {
  assert.equal(roundLabel('ZZ'), 'ZZ');
  assert.equal(roundLabel(''), '');
});

test('roundLabel: null / undefined は空文字', () => {
  assert.equal(roundLabel(null), '');
  assert.equal(roundLabel(undefined), '');
});

test('formatMatchTeam: 既知チームコードは確定扱い', () => {
  const teamMap = { MEX: { ja: 'メキシコ', flag: '🇲🇽' } };
  assert.deepEqual(formatMatchTeam('MEX', teamMap), {
    resolved: true, code: 'MEX', label: 'メキシコ', flag: '🇲🇽',
  });
});

test('formatMatchTeam: 順位スロットは「グループX N位」', () => {
  assert.deepEqual(formatMatchTeam('1A', {}), {
    resolved: false, code: '1A', label: 'グループA 1位', flag: null,
  });
  assert.deepEqual(formatMatchTeam('2C', {}), {
    resolved: false, code: '2C', label: 'グループC 2位', flag: null,
  });
});

test('formatMatchTeam: 勝者/敗者スロットは前ラウンド基準のラベル', () => {
  // R16 の対戦相手はベスト32の勝者
  assert.equal(formatMatchTeam('W74', {}, 'R16').label, 'ベスト32 勝者');
  // 決勝の対戦相手は準決勝の勝者
  assert.equal(formatMatchTeam('W101', {}, '決勝').label, '準決勝 勝者');
  // 3位決定戦は準決勝の敗者
  assert.equal(formatMatchTeam('L101', {}, '3位').label, '準決勝 敗者');
  // 準々決勝(QF)はベスト16の勝者
  assert.equal(formatMatchTeam('W89', {}, 'QF').label, 'ベスト16 勝者');
});

test('formatMatchTeam: round 不明な勝者/敗者は素の「勝者/敗者」', () => {
  assert.equal(formatMatchTeam('W73', {}).label, '勝者');
  assert.equal(formatMatchTeam('L88', {}).label, '敗者');
});

test('formatMatchTeam: 3位群スロットは「3位通過」表記', () => {
  assert.equal(formatMatchTeam('3(A/B/C/D/F)', {}).label, '3位通過'); // 実データ形式
  assert.equal(formatMatchTeam('3ABCD', {}).label, '3位通過');       // 旧形式も許容
});

test('formatMatchTeam: 空や未知は未定', () => {
  assert.deepEqual(formatMatchTeam('', {}), {
    resolved: false, code: '', label: '未定', flag: null,
  });
});

test('groupByDate: 日付昇順・各日内は時刻昇順', () => {
  const sched = [
    { date: '2026-06-13', time: '10:00', round: 'D', a: 'USA', b: 'PAR' },
    { date: '2026-06-12', time: '11:00', round: 'A', a: 'KOR', b: 'CZE' },
    { date: '2026-06-12', time: '04:00', round: 'A', a: 'MEX', b: 'RSA' },
  ];
  const out = groupByDate(sched);
  assert.deepEqual(out.map((g) => g.date), ['2026-06-12', '2026-06-13']);
  assert.deepEqual(out[0].matches.map((m) => m.time), ['04:00', '11:00']);
  assert.equal(out[0].matches.length, 2);
  assert.equal(out[1].matches.length, 1);
});

test('groupByDate: 同時刻試合も両方保持', () => {
  const sched = [
    { date: '2026-06-25', time: '04:00', round: 'B', a: 'SUI', b: 'CAN' },
    { date: '2026-06-25', time: '04:00', round: 'B', a: 'BIH', b: 'QAT' },
  ];
  const out = groupByDate(sched);
  assert.equal(out.length, 1);
  assert.equal(out[0].matches.length, 2);
});

test('groupByDate: date 欠落要素は末尾「日付未定」グループへ', () => {
  const sched = [
    { date: '2026-06-12', time: '04:00', round: 'A', a: 'MEX', b: 'RSA' },
    { time: '04:00', round: 'F', a: 'W101', b: 'W102' },
  ];
  const out = groupByDate(sched);
  assert.equal(out.length, 2);
  assert.equal(out[out.length - 1].date, null);
  assert.equal(out[out.length - 1].matches.length, 1);
});

test('groupByDate: date 空文字は日付未定グループへ', () => {
  const out = groupByDate([{ date: '', time: '04:00', round: 'F', a: 'W1', b: 'W2' }]);
  assert.equal(out[0].date, null);
});

test('groupByDate: 空配列は空配列', () => {
  assert.deepEqual(groupByDate([]), []);
  assert.deepEqual(groupByDate(null), []);
});

const DATES = ['2026-06-12', '2026-06-13', '2026-06-25'];

test('pickFocusDate: 今日に試合があれば今日', () => {
  assert.equal(pickFocusDate(DATES, '2026-06-13'), '2026-06-13');
});

test('pickFocusDate: 今日に試合が無ければ次の試合日', () => {
  assert.equal(pickFocusDate(DATES, '2026-06-07'), '2026-06-12'); // 大会前
  assert.equal(pickFocusDate(DATES, '2026-06-20'), '2026-06-25'); // 休養日
});

test('pickFocusDate: 今日以降に試合が無ければ最後の試合日', () => {
  assert.equal(pickFocusDate(DATES, '2026-07-01'), '2026-06-25'); // 大会後
});

test('pickFocusDate: 空リストは null', () => {
  assert.equal(pickFocusDate([], '2026-06-12'), null);
  assert.equal(pickFocusDate(null, '2026-06-12'), null);
});

test('jstToday: ミリ秒からJSTの YYYY-MM-DD を返す', () => {
  // 2026-06-12T19:30:00Z = JST 2026-06-13 04:30 → '2026-06-13'
  assert.equal(jstToday(Date.parse('2026-06-12T19:30:00Z')), '2026-06-13');
  // 2026-06-12T14:00:00Z = JST 2026-06-12 23:00 → '2026-06-12'
  assert.equal(jstToday(Date.parse('2026-06-12T14:00:00Z')), '2026-06-12');
});
