import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoom, addMember, ROOM_LIMITS } from './rooms.js';

test('makeRoom は作成者を最初のメンバーにした Room を返す', () => {
  const r = makeRoom('会社の部屋', 'WXYZ2345', 'u1');
  assert.equal(r.version, 1);
  assert.ok(r.id.startsWith('r'));
  assert.equal(r.name, '会社の部屋');
  assert.equal(r.code, 'WXYZ2345');
  assert.deepEqual(r.members, ['u1']);
  assert.equal(r.ownerId, 'u1');
  assert.equal(typeof r.createdAt, 'string');
});

test('makeRoom は空名・owner欠落を null で拒否する', () => {
  assert.equal(makeRoom('  ', 'WXYZ2345', 'u1'), null);
  assert.equal(makeRoom('部屋', 'WXYZ2345', ''), null);
});

test('addMember は新規 userId を追加する（不変・新オブジェクト）', () => {
  const r = makeRoom('部屋', 'WXYZ2345', 'u1');
  const res = addMember(r, 'u2');
  assert.equal(res.ok, true);
  assert.deepEqual(res.room.members, ['u1', 'u2']);
  assert.deepEqual(r.members, ['u1']); // 元は不変
});

test('addMember は既存メンバーを重複追加しない', () => {
  const r = makeRoom('部屋', 'WXYZ2345', 'u1');
  const res = addMember(r, 'u1');
  assert.equal(res.ok, true);
  assert.deepEqual(res.room.members, ['u1']);
});

test('addMember は上限超過で ok:false を返す', () => {
  let r = makeRoom('部屋', 'WXYZ2345', 'u0');
  for (let i = 1; i < ROOM_LIMITS.members; i++) {
    r = addMember(r, 'u' + i).room;
  }
  assert.equal(r.members.length, ROOM_LIMITS.members);
  const res = addMember(r, 'overflow');
  assert.equal(res.ok, false);
});
