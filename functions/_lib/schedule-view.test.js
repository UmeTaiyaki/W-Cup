import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundLabel, formatMatchTeam } from '../../public/lib/schedule-view.js';

test('roundLabel: グループ記号は「グループX」', () => {
  assert.equal(roundLabel('A'), 'グループA');
  assert.equal(roundLabel('L'), 'グループL');
});

test('roundLabel: ノックアウトのラウンド名', () => {
  assert.equal(roundLabel('R32'), 'ベスト32');
  assert.equal(roundLabel('R16'), 'ベスト16');
  assert.equal(roundLabel('QF'), '準々決勝');
  assert.equal(roundLabel('SF'), '準決勝');
  assert.equal(roundLabel('3rd'), '3位決定戦');
  assert.equal(roundLabel('F'), '決勝');
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

test('formatMatchTeam: スロット表記は未確定ラベル', () => {
  assert.deepEqual(formatMatchTeam('1A', {}), {
    resolved: false, code: '1A', label: 'グループA 1位', flag: null,
  });
  assert.deepEqual(formatMatchTeam('2C', {}), {
    resolved: false, code: '2C', label: 'グループC 2位', flag: null,
  });
  assert.deepEqual(formatMatchTeam('W73', {}), {
    resolved: false, code: 'W73', label: '第73試合 勝者', flag: null,
  });
  assert.deepEqual(formatMatchTeam('L88', {}), {
    resolved: false, code: 'L88', label: '第88試合 敗者', flag: null,
  });
});

test('formatMatchTeam: 3位群スロットは「3位通過」表記', () => {
  const r = formatMatchTeam('3ABCD', {});
  assert.equal(r.resolved, false);
  assert.equal(r.label, '3位通過');
});

test('formatMatchTeam: 空や未知は未定', () => {
  assert.deepEqual(formatMatchTeam('', {}), {
    resolved: false, code: '', label: '未定', flag: null,
  });
});
