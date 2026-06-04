import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  codeFromInts,
  generateCode,
  formatCode,
  normalizeCode,
} from './codes.js';

test('CODE_ALPHABET は紛らわしい文字 0 1 I L O U を含まない', () => {
  for (const ch of '01ILOU') {
    assert.ok(!CODE_ALPHABET.includes(ch), `${ch} が含まれている`);
  }
  assert.equal(CODE_ALPHABET.length, 30);
});

test('codeFromInts は整数列をアルファベットの文字に写す', () => {
  assert.equal(codeFromInts([0, 1, 2]), CODE_ALPHABET.slice(0, 3));
  assert.equal(codeFromInts([CODE_ALPHABET.length]), CODE_ALPHABET[0]);
});

test('formatCode は8文字をハイフンで二分する', () => {
  assert.equal(formatCode('9X2P3F7K'), '9X2P-3F7K');
});

test('formatCode は4文字以下はそのまま返す', () => {
  assert.equal(formatCode('ABC'), 'ABC');
});

test('normalizeCode は大文字化しハイフン・空白・対象外文字を除去する', () => {
  assert.equal(normalizeCode('9x2p-3f7k'), '9X2P3F7K');
  assert.equal(normalizeCode('  a b  '), 'AB');
  assert.equal(normalizeCode(null), '');
});

test('generateCode は長さ CODE_LENGTH でアルファベット内の文字のみ', () => {
  for (let i = 0; i < 20; i++) {
    const c = generateCode();
    assert.equal(c.length, CODE_LENGTH);
    for (const ch of c) assert.ok(CODE_ALPHABET.includes(ch), `${ch} が範囲外`);
    for (const bad of '01ILOU') assert.ok(!c.includes(bad));
  }
});
