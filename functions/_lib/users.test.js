import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, validateUser, USER_LIMITS } from './users.js';

test('makeUser は名前・コードから User を生成する', () => {
  const u = makeUser('  たけし  ', 'ABCD2345');
  assert.equal(u.version, 1);
  assert.ok(u.id.startsWith('u'));
  assert.equal(u.name, 'たけし'); // trim 済み
  assert.equal(u.code, 'ABCD2345');
  assert.equal(typeof u.updatedAt, 'string');
  assert.equal(u.pred.champion, null);
  assert.equal(u.pred.topScorer, '');
});

test('makeUser は名前を上限長で丸める', () => {
  const long = 'あ'.repeat(50);
  const u = makeUser(long, 'ABCD2345');
  assert.equal(Array.from(u.name).length, USER_LIMITS.name);
});

test('makeUser は空名・非文字列を null で拒否する', () => {
  assert.equal(makeUser('   ', 'ABCD2345'), null);
  assert.equal(makeUser(null, 'ABCD2345'), null);
});

test('validateUser は保存済みドキュメントを安全な形へ正規化する', () => {
  const v = validateUser({
    id: 'u1', name: ' のぞみ ', code: 'abcd2345',
    pred: { champion: 'arg' },
  });
  assert.equal(v.id, 'u1');
  assert.equal(v.name, 'のぞみ');
  assert.equal(v.code, 'ABCD2345'); // 正規化される
  assert.equal(v.pred.champion, 'ARG');
});

test('validateUser は壊れた入力に null を返す', () => {
  assert.equal(validateUser(null), null);
  assert.equal(validateUser({ name: 'x' }), null); // id 欠落
});
