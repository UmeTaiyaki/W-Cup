import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSportmonks, SportmonksError } from './sportmonks.js';

// fetch を注入してネットワークに触れずに検証する。
const okFetch = (body, { status = 200 } = {}) => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { fetchImpl, get captured() { return captured; } };
};

test('token 未設定なら生成時に例外', () => {
  assert.throws(() => createSportmonks({}), /token required/);
});

test('base URL + path で正しい URL を組み立てる', async () => {
  const f = okFetch({ data: [] });
  const sm = createSportmonks({ token: 't', fetchImpl: f.fetchImpl });
  await sm.get('seasons/26618');
  assert.equal(f.captured.url, 'https://api.sportmonks.com/v3/football/seasons/26618');
});

test('先頭スラッシュは正規化される', async () => {
  const f = okFetch({ data: [] });
  const sm = createSportmonks({ token: 't', fetchImpl: f.fetchImpl });
  await sm.get('/types');
  assert.equal(f.captured.url, 'https://api.sportmonks.com/v3/football/types');
});

test('Authorization ヘッダにトークンを載せる', async () => {
  const f = okFetch({ data: [] });
  const sm = createSportmonks({ token: 'secret-token', fetchImpl: f.fetchImpl });
  await sm.get('types');
  assert.equal(f.captured.opts.headers.Authorization, 'secret-token');
});

test('include 配列はセミコロン連結される', async () => {
  const f = okFetch({ data: {} });
  const sm = createSportmonks({ token: 't', fetchImpl: f.fetchImpl });
  await sm.get('fixtures/1', { include: ['participants', 'scores', 'events'] });
  assert.match(f.captured.url, /include=participants;scores;events/);
});

test('include 文字列はそのまま使う', async () => {
  const f = okFetch({ data: {} });
  const sm = createSportmonks({ token: 't', fetchImpl: f.fetchImpl });
  await sm.get('fixtures/1', { include: 'scores;participants' });
  assert.match(f.captured.url, /include=scores;participants/);
});

test('filters オブジェクトは key:val 形式に直列化', async () => {
  const f = okFetch({ data: [] });
  const sm = createSportmonks({ token: 't', fetchImpl: f.fetchImpl });
  await sm.get('livescores/latest', { filters: { fixtureStates: [1, 2, 3] } });
  assert.match(decodeURIComponent(f.captured.url), /filters=fixtureStates:1,2,3/);
});

test('任意の params をクエリに付与', async () => {
  const f = okFetch({ data: [] });
  const sm = createSportmonks({ token: 't', fetchImpl: f.fetchImpl });
  await sm.get('seasons/1', { params: { per_page: 50 } });
  assert.match(f.captured.url, /per_page=50/);
});

test('パース済み JSON(body 全体)を返す', async () => {
  const body = { data: [{ id: 1 }], rate_limit: { remaining: 2999 } };
  const f = okFetch(body);
  const sm = createSportmonks({ token: 't', fetchImpl: f.fetchImpl });
  const out = await sm.get('types');
  assert.deepEqual(out, body);
});

test('HTTP エラーは status 付き SportmonksError を投げる', async () => {
  const f = okFetch({ message: 'Not Found' }, { status: 404 });
  const sm = createSportmonks({ token: 't', fetchImpl: f.fetchImpl });
  await assert.rejects(
    () => sm.get('fixtures/999999'),
    (e) => e instanceof SportmonksError && e.status === 404,
  );
});

test('ネットワーク例外は SportmonksError でラップ', async () => {
  const throwing = async () => { throw new Error('socket hang up'); };
  const sm = createSportmonks({ token: 't', fetchImpl: throwing });
  await assert.rejects(() => sm.get('types'), (e) => e instanceof SportmonksError);
});
