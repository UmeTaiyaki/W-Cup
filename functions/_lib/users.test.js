import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, validateUser, publicUser, USER_LIMITS } from './users.js';

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

test('publicUser は code を除いた公開ビューを返す', () => {
  const u = makeUser('たけし', 'ABCD2345');
  const pub = publicUser(u);
  assert.equal(pub.id, u.id);
  assert.equal(pub.name, 'たけし');
  assert.equal(pub.pred.champion, null);
  assert.ok(!('code' in pub), 'code を含んではいけない');
});

test('publicUser は null 入力に null を返す', () => {
  assert.equal(publicUser(null), null);
});

test('makeUser は rooms を空配列で初期化する', () => {
  const u = makeUser('たけし', 'ABCD2345');
  assert.deepEqual(u.rooms, []);
});

test('validateUser は rooms 欠損時に空配列を補完する', () => {
  const v = validateUser({ id: 'u1', name: 'のぞみ', code: 'ABCD2345' });
  assert.deepEqual(v.rooms, []);
});

test('validateUser は rooms の各要素を {id,code,name} へ正規化する', () => {
  const v = validateUser({
    id: 'u1', name: 'x', code: 'ABCD2345',
    rooms: [
      { id: 'r1', code: 'wxyz2345', name: ' 部屋A ', junk: 1 },
      { id: '', code: 'x', name: 'bad' },      // id 無し → 除外
      'not-an-object',                          // 非オブジェクト → 除外
    ],
  });
  assert.equal(v.rooms.length, 1);
  assert.deepEqual(v.rooms[0], { id: 'r1', code: 'WXYZ2345', name: '部屋A' });
});

test('validateUser は rooms を上限 maxRooms で丸める', () => {
  const many = Array.from({ length: USER_LIMITS.maxRooms + 5 },
    (_, i) => ({ id: `r${i}`, code: 'ABCD2345', name: `room${i}` }));
  const v = validateUser({ id: 'u1', name: 'x', code: 'ABCD2345', rooms: many });
  assert.equal(v.rooms.length, USER_LIMITS.maxRooms);
});

test('publicUser は rooms を含めない', () => {
  const u = makeUser('たけし', 'ABCD2345');
  u.rooms = [{ id: 'r1', code: 'WXYZ2345', name: '部屋A' }];
  const pub = publicUser(u);
  assert.ok(!('rooms' in pub), 'rooms を含んではいけない');
});
