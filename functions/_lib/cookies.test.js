import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ID_COOKIE, setIdCookie, clearIdCookie, readCookie } from './cookies.js';

test('setIdCookie は HttpOnly/Secure/SameSite/Path=/api を付与する', () => {
  const c = setIdCookie('ABCD2345');
  assert.ok(c.startsWith(`${ID_COOKIE}=ABCD2345;`));
  assert.ok(c.includes('Path=/api'));
  assert.ok(c.includes('HttpOnly'));
  assert.ok(c.includes('Secure'));
  assert.ok(c.includes('SameSite=Lax'));
  assert.ok(/Max-Age=\d+/.test(c));
});

test('setIdCookie は secure:false で Secure を付けない（ローカル開発）', () => {
  const c = setIdCookie('ABCD2345', { secure: false });
  assert.ok(!c.includes('Secure'));
  assert.ok(c.includes('HttpOnly'));
});

test('clearIdCookie は Max-Age=0 で失効させる', () => {
  const c = clearIdCookie();
  assert.ok(c.includes('Max-Age=0'));
  assert.ok(c.startsWith(`${ID_COOKIE}=;`));
  assert.ok(c.includes('HttpOnly'));
});

test('readCookie は対象 cookie の値を返す', () => {
  assert.equal(readCookie('wc_id=ABCD2345', 'wc_id'), 'ABCD2345');
  assert.equal(readCookie('foo=1; wc_id=ABCD2345; bar=2', 'wc_id'), 'ABCD2345');
  assert.equal(readCookie(' wc_id = ABCD2345 ', 'wc_id'), 'ABCD2345'); // 前後空白を許容
});

test('readCookie は対象が無ければ null', () => {
  assert.equal(readCookie('foo=1; bar=2', 'wc_id'), null);
  assert.equal(readCookie('', 'wc_id'), null);
  assert.equal(readCookie(null, 'wc_id'), null);
});
