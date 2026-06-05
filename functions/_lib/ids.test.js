import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genId } from './ids.js';

test('genId は prefix で始まる文字列を返す', () => {
  const id = genId('u');
  assert.equal(typeof id, 'string');
  assert.ok(id.startsWith('u'));
  assert.ok(id.length > 1);
});

test('genId は prefix 省略時も空でない文字列を返す', () => {
  const id = genId();
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);
});

test('genId は呼ぶたびに異なる値を返す', () => {
  const a = genId('u');
  const b = genId('u');
  assert.notEqual(a, b);
});
