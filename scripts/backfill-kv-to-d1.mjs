#!/usr/bin/env node
// 既存 KV（CONFIG namespace）の永続データを D1（wcup2026-db, table kv）へコピーする
// 冪等バックフィル＋差分検証スクリプト。KV→D1 無停止移行の「段2」で使う。
//
// 使い方:
//   node scripts/backfill-kv-to-d1.mjs            # コピー実行 → 検証
//   node scripts/backfill-kv-to-d1.mjs --dry-run  # コピー対象の件数だけ表示（書き込まない）
//   node scripts/backfill-kv-to-d1.mjs --verify   # コピーせず KV と D1 の差分のみ検証
//
// 設計:
//   - 許可リスト方式: user:/usercode:/room:/roomcode:/config: の接頭辞のみコピー。
//     session:/otp: などの揮発データ（expirationTtl 依存）や未知接頭辞は対象外（スキップしてログ）。
//   - 値は `wrangler kv bulk get`（一括取得）で取る。1件ずつ取らないので速く・壊れにくい。
//   - UPSERT（ON CONFLICT DO UPDATE）で冪等。何度流しても重複・破壊しない。チャンク分割で投入。
//   - 段1（二重書き込み）デプロイ後に実行する想定。実行中の新規書き込みも D1 へ入るため取りこぼし無し。

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NAMESPACE_ID = '8c9c431e2ee146a5a8ebafed58758a45'; // 本番 CONFIG KV
const DB_NAME = 'wcup2026-db';
const DURABLE_PREFIXES = ['user:', 'usercode:', 'room:', 'roomcode:', 'config:'];
const STMT_BUDGET = 80 * 1024; // 1 INSERT 文あたりのバイト予算（D1 上限100KB/文に対し安全側）

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has('--dry-run');
const VERIFY_ONLY = argv.has('--verify');

const tmp = mkdtempSync(join(tmpdir(), 'backfill-'));
const wrangler = (args) =>
  execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const isDurable = (key) => DURABLE_PREFIXES.some((p) => key.startsWith(p));
const sqlEscape = (s) => String(s).replace(/'/g, "''"); // SQL 文字列リテラルのエスケープ
const verOf = (value) => {
  try { const o = JSON.parse(value); return o && o.updatedAt != null ? String(o.updatedAt) : null; } catch { return null; }
};
const stripSuccess = (out) => out.replace(/\s*Success!\s*$/, '');

function listDurableKeys() {
  const out = wrangler(['kv', 'key', 'list', `--namespace-id=${NAMESPACE_ID}`, '--remote']);
  const names = JSON.parse(out).map((k) => k.name);
  const durable = names.filter(isDurable);
  const skipped = names.filter((k) => !isDurable(k));
  if (skipped.length) console.log(`スキップ（揮発/対象外）: ${skipped.length}件  例: ${skipped.slice(0, 5).join(', ')}`);
  console.log(`コピー対象（永続）: ${durable.length}件 / 総 ${names.length}件`);
  return durable;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// keys の値を一括取得して Map<key,value> で返す。bulk get は1回100キーまでなので分割する。
function bulkGet(keys) {
  const map = new Map();
  chunk(keys, 100).forEach((batch, i) => {
    const file = join(tmp, `keys-${i}.json`);
    writeFileSync(file, JSON.stringify(batch));
    const out = wrangler(['kv', 'bulk', 'get', file, `--namespace-id=${NAMESPACE_ID}`, '--remote']);
    for (const [k, v] of Object.entries(JSON.parse(stripSuccess(out)))) map.set(k, v);
  });
  return map;
}

// D1 は1 SQL文 100KB まで。config:v1 のような大きな値があるため、行VALUEを連結して
// 予算(STMT_BUDGET)を超えそうになったら文を切る（巨大な1行はその行だけで1文になる）。
function buildStatements(pairs) {
  const HEAD = 'INSERT INTO kv (k, v, updated_at) VALUES\n';
  const TAIL = '\nON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at;';
  const rowSql = ([k, v]) => {
    const ua = verOf(v);
    return `('${sqlEscape(k)}', '${sqlEscape(v)}', ${ua == null ? 'NULL' : `'${sqlEscape(ua)}'`})`;
  };
  const statements = [];
  let buf = [], size = 0;
  const flush = () => { if (buf.length) { statements.push(HEAD + buf.join(',\n') + TAIL); buf = []; size = 0; } };
  for (const p of pairs) {
    const r = rowSql(p);
    if (buf.length && size + r.length > STMT_BUDGET) flush();
    buf.push(r); size += r.length + 2;
  }
  flush();
  return statements;
}

function backfill(pairs) {
  const statements = buildStatements(pairs);
  const file = join(tmp, 'backfill.sql');
  writeFileSync(file, statements.join('\n') + '\n');
  wrangler(['d1', 'execute', DB_NAME, '--remote', `--file=${file}`]);
  console.log(`コピー完了: ${pairs.length}件を D1 へ UPSERT（${statements.length}文）`);
}

function d1AllRows() {
  const out = wrangler(['d1', 'execute', DB_NAME, '--remote', '--json', '--command=SELECT k, v FROM kv']);
  const parsed = JSON.parse(out);
  const r = Array.isArray(parsed) ? parsed[0] : parsed;
  return (r && r.results) || [];
}

function verify(kvMap) {
  const d1Map = new Map(d1AllRows().map((r) => [r.k, r.v]));
  let missing = 0, mismatch = 0;
  for (const [k, v] of kvMap) {
    if (!d1Map.has(k)) { missing++; if (missing <= 10) console.log(`  ✗ D1 に欠落: ${k}`); continue; }
    if (d1Map.get(k) !== v) { mismatch++; if (mismatch <= 10) console.log(`  ✗ 値不一致: ${k}`); }
  }
  const extra = [...d1Map.keys()].filter((k) => isDurable(k) && !kvMap.has(k));
  if (extra.length) console.log(`  ℹ D1 のみに存在（段1の新規書き込み等、許容）: ${extra.length}件`);
  console.log('--- 検証結果 ---');
  console.log(`KV 永続キー: ${kvMap.size} / D1 行: ${d1Map.size} / 欠落: ${missing} / 値不一致: ${mismatch}`);
  const ok = missing === 0 && mismatch === 0;
  console.log(ok ? '✅ 差分 0（移行整合）' : '❌ 差分あり（要調査）');
  return ok;
}

function main() {
  console.log(`KV(${NAMESPACE_ID}) → D1(${DB_NAME})  mode=${VERIFY_ONLY ? 'verify' : DRY_RUN ? 'dry-run' : 'backfill'}`);
  const keys = listDurableKeys();
  if (keys.length === 0) { console.log('対象キーなし。終了。'); return; }
  if (DRY_RUN) { console.log('[dry-run] 上記件数をコピーする予定（書き込みなし）'); return; }
  const kvMap = bulkGet(keys);
  console.log(`KV から一括取得: ${kvMap.size}件`);
  if (!VERIFY_ONLY) backfill([...kvMap]);
  const ok = verify(kvMap);
  process.exit(ok ? 0 : 1);
}

main();
