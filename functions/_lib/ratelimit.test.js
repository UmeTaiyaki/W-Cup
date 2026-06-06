import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from './ratelimit.js';

test('capacity までは許可し、超えると拒否する', () => {
  let t = 1000;
  const allow = createRateLimiter({ capacity: 3, refillPerSec: 1, now: () => t });
  assert.equal(allow('ip1'), true);
  assert.equal(allow('ip1'), true);
  assert.equal(allow('ip1'), true);
  assert.equal(allow('ip1'), false); // 使い切り
});

test('時間経過でトークンが回復する', () => {
  let t = 0;
  const allow = createRateLimiter({ capacity: 1, refillPerSec: 1, now: () => t });
  assert.equal(allow('ip1'), true);
  assert.equal(allow('ip1'), false);
  t = 1000; // 1秒経過 → 1トークン回復
  assert.equal(allow('ip1'), true);
});

test('キーごとに独立したバケットを持つ', () => {
  let t = 0;
  const allow = createRateLimiter({ capacity: 1, refillPerSec: 1, now: () => t });
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), false);
  assert.equal(allow('b'), true); // 別キーは影響を受けない
});

test('回復は capacity を超えない', () => {
  let t = 0;
  const allow = createRateLimiter({ capacity: 2, refillPerSec: 1, now: () => t });
  t = 100000; // 大量に時間経過
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), false); // capacity=2 を超えて溜まらない
});

test('キー未指定は anon として扱う', () => {
  let t = 0;
  const allow = createRateLimiter({ capacity: 1, refillPerSec: 0, now: () => t });
  assert.equal(allow(null), true);
  assert.equal(allow(undefined), false); // 同じ anon バケット
});
