import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyPred, validatePred } from './predictions.js';

test('emptyPred は全グループ・全枠・全ラウンドを持つ空予想を返す', () => {
  const p = emptyPred();
  assert.equal(p.champion, null);
  assert.equal(p.runnerUp, null);
  assert.equal(p.topScorer, '');
  assert.deepEqual(Object.keys(p.groupRank).sort(), ['A','B','C','D','E','F','G','H','I','J','K','L'].sort());
  assert.deepEqual(Object.keys(p.thirdAssign).sort(), ['M1','M11','M12','M15','M16','M2','M7','M8']);
  assert.deepEqual(Object.keys(p.knockout).sort(), ['qf','r16','r32','sf']);
});

test('validatePred はコードを大文字化し空文字を null に正規化する', () => {
  const r = validatePred({
    champion: 'arg', runnerUp: '', topScorer: '  メッシ  ',
    groupRank: { A: ['mex', 'kor'] },
    thirdAssign: { M1: 'bra', M2: '' },
    knockout: { r16: ['esp'] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.champion, 'ARG');
  assert.equal(r.value.runnerUp, null);
  assert.equal(r.value.topScorer, 'メッシ');
  assert.deepEqual(r.value.groupRank.A, ['MEX', 'KOR']);
  assert.equal(r.value.thirdAssign.M1, 'BRA');
  assert.equal(r.value.thirdAssign.M2, null);
  assert.deepEqual(r.value.knockout.r16, ['ESP']);
});

test('validatePred は不正・欠損入力でも空予想形に整える', () => {
  const r = validatePred(null);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, emptyPred());
  const r2 = validatePred({ groupRank: { A: [1, 'jpn', null] } });
  assert.deepEqual(r2.value.groupRank.A, ['JPN']); // 文字列以外は除外
});

test('validatePred は巨大文字列・巨大配列をクランプする（KV肥大化対策）', () => {
  const r = validatePred({
    topScorer: 'あ'.repeat(5000),
    champion: 'X'.repeat(5000),
    groupRank: { A: Array(10000).fill('mex') },
    knockout: { r32: Array(10000).fill('bra') },
  });
  assert.equal(r.value.topScorer.length, 60);
  assert.equal(r.value.champion.length, 4); // コードは4文字に制限
  assert.equal(r.value.groupRank.A.length, 4); // 1組4チーム
  assert.equal(r.value.knockout.r32.length, 32);
});

test('validatePred はプロトタイプ汚染キーを取り込まない', () => {
  const r = validatePred(JSON.parse('{"__proto__":{"polluted":true},"champion":"jpn"}'));
  assert.equal(r.value.champion, 'JPN');
  assert.equal(({}).polluted, undefined); // Object.prototype 非汚染
  assert.equal(Object.prototype.hasOwnProperty.call(r.value, '__proto__'), false);
});
