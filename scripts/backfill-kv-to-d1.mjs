#!/usr/bin/env node
// 既存 KV（CONFIG namespace）の永続データを D1（wcup2026-db, table kv）へコピーする
// 冪等バックフィル＋差分検証スクリプト。KV→D1 無停止移行の「段2」で使う。
//
// 使い方:
//   node scripts/backfill-kv-to-d1.mjs            # コピー実行 → 検証
//   node scripts/backfill-kv-to-d1.mjs --dry-run  # コピー対象の一覧だけ表示（書き込まない）
//   node scripts/backfill-kv-to-d1.mjs --verify   # コピーせず KV と D1 の差分のみ検証
//
// 設計:
//   - 許可リスト方式: user:/usercode:/room:/roomcode:/config: の接頭辞のみコピー。
//     session:/otp: などの揮発データ（expirationTtl 依存）や未知接頭辞は対象外（スキップしてログ）。
//   - UPSERT（ON CONFLICT DO UPDATE）で冪等。何度流しても重複・破壊しない。
//   - 段1（二重書き込み）デプロイ後に実行する想定。実行中の新規書き込みも D1 へ入るため取りこぼし無し。

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NAMESPACE_ID = '8c9c431e2ee146a5a8ebafed58758a45'; // 本番 CONFIG KV
const DB_NAME = 'wcup2026-db';
const DURABLE_PREFIXES = ['user:', 'usercode:', 'room:', 'roomcode:', 'config:'];

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has('--dry-run');
const VERIFY_ONLY = argv.has('--verify');

const wrangler = (args) =>
  execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const isDurable = (key) => DURABLE_PREFIXES.some((p) => key.startsWith(p));
const sqlEscape = (s) => String(s).replace(/'/g, "''"); // SQL 文字列リテラルのエスケープ
const verOf = (value) => {
  try { const o = JSON.parse(value); return o && o.updatedAt != null ? String(o.updatedAt) : null; } catch { return null; }
};

function listKvKeys() {
  const out = wrangler(['kv', 'key', 'list', `--namespace-id=${NAMESPACE_ID}`, '--remote']);
  const keys = JSON.parse(out).map((k) => k.name);
  const durable = keys.filter(isDurable);
  const skipped = keys.filter((k) => !isDurable(k));
  if (skipped.length) console.log(`スキップ（揮発/対象外）: ${skipped.length}件  例: ${skipped.slice(0, 5).join(', ')}`);
  console.log(`コピー対象（永続）: ${durable.length}件`);
  return durable;
}

function kvGet(key) {
  const out = wrangler(['kv', 'key', 'get', key, `--namespace-id=${NAMESPACE_ID}`, '--remote']);
  return out.replace(/\n$/, ''); // CLI が付ける末尾改行のみ除去（JSON 値は末尾改行を含まない）
}

function d1Json(sql) {
  const out = wrangler(['d1', 'execute', DB_NAME, '--remote', '--json', `--command=${sql}`]);
  const parsed = JSON.parse(out);
  const r = Array.isArray(parsed) ? parsed[0] : parsed;
  return (r && r.results) || [];
}

function backfill(keys) {
  const pairs = keys.map((k) => ({ k, v: kvGet(k) }));
  if (DRY_RUN) {
    for (const { k, v } of pairs) console.log(`  ${k}  (${v.length} bytes)`);
    console.log(`[dry-run] ${pairs.length}件をコピーする予定（書き込みなし）`);
    return pairs;
  }
  const values = pairs
    .map(({ k, v }) => {
      const ua = verOf(v);
      const uaSql = ua == null ? 'NULL' : `'${sqlEscape(ua)}'`;
      return `('${sqlEscape(k)}', '${sqlEscape(v)}', ${uaSql})`;
    })
    .join(',\n');
  const sql =
    'INSERT INTO kv (k, v, updated_at) VALUES\n' + values +
    '\nON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at;\n';
  const dir = mkdtempSync(join(tmpdir(), 'backfill-'));
  const file = join(dir, 'backfill.sql');
  writeFileSync(file, sql);
  wrangler(['d1', 'execute', DB_NAME, '--remote', `--file=${file}`]);
  console.log(`コピー完了: ${pairs.length}件を D1 へ UPSERT`);
  return pairs;
}

function verify(keys) {
  const kvPairs = keys.map((k) => ({ k, v: kvGet(k) }));
  const d1Rows = d1Json('SELECT k, v FROM kv');
  const d1Map = new Map(d1Rows.map((r) => [r.k, r.v]));

  let missing = 0, mismatch = 0;
  for (const { k, v } of kvPairs) {
    if (!d1Map.has(k)) { missing++; console.log(`  ✗ D1 に欠落: ${k}`); continue; }
    if (d1Map.get(k) !== v) { mismatch++; console.log(`  ✗ 値不一致: ${k}`); }
  }
  // D1 にだけ存在する永続キー（段1の二重書き込みで先に入った新規分など）は差分ではないが報告。
  const extra = [...d1Map.keys()].filter((k) => isDurable(k) && !kvPairs.some((p) => p.k === k));
  if (extra.length) console.log(`  ℹ D1 のみに存在（新規書き込み等、許容）: ${extra.length}件`);

  console.log('--- 検証結果 ---');
  console.log(`KV 永続キー: ${kvPairs.length} / D1 行: ${d1Map.size}`);
  console.log(`欠落: ${missing} / 値不一致: ${mismatch}`);
  const ok = missing === 0 && mismatch === 0;
  console.log(ok ? '✅ 差分 0（移行整合）' : '❌ 差分あり（要調査）');
  return ok;
}

function main() {
  console.log(`KV(${NAMESPACE_ID}) → D1(${DB_NAME})  mode=${VERIFY_ONLY ? 'verify' : DRY_RUN ? 'dry-run' : 'backfill'}`);
  const keys = listKvKeys();
  if (keys.length === 0) { console.log('対象キーなし。終了。'); return; }
  if (!VERIFY_ONLY) backfill(keys);
  if (DRY_RUN) return;
  const ok = verify(keys);
  process.exit(ok ? 0 : 1);
}

main();
