// FIFA 2026 W杯 Annex C「3位通過チームの組み合わせ表」(495通り) を
// Wikipedia から取得・パースし、構造検証に全通過した場合のみ
// public/lib/third-allocation.js を生成する。
//
// 使い方:  node scripts/fetch-third-allocation.mjs
// (ネットワークアクセスが必要。サンドボックス外で実行すること)
//
// 出力データ: 通過8グループ(ソート文字列) -> 勝者順 [A,B,D,E,G,I,K,L] の3位グループ文字列
//   例 "EFGHIJKL" -> "EJIFHGLK"  (A1の相手=3E, B1=3J, D1=3I, E1=3F, ...)

import { writeFile } from 'node:fs/promises';

const SOURCE = 'https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage?action=render';
const OUT = new URL('../public/lib/third-allocation.js', import.meta.url);

// 3位と対戦する8人のグループ1位と、その許可グループ群（=既存 PERMITTED）
const PERMITTED = {
  A: ['C', 'E', 'F', 'H', 'I'],
  B: ['E', 'F', 'G', 'I', 'J'],
  D: ['B', 'E', 'F', 'I', 'J'],
  E: ['A', 'B', 'C', 'D', 'F'],
  G: ['A', 'E', 'H', 'I', 'J'],
  I: ['C', 'D', 'F', 'G', 'H'],
  K: ['D', 'E', 'I', 'J', 'L'],
  L: ['E', 'H', 'I', 'J', 'K'],
};
// 勝者 -> ベスト32スロットID（既存 BRACKET_STRUCTURE と一致）
const WINNER_SLOT = { A: 'M11', B: 'M15', D: 'M7', E: 'M1', G: 'M8', I: 'M2', K: 'M16', L: 'M12' };

const strip = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const cellsOf = (row) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => strip(m[1]));
const rowsOf = (table) => [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);

function fail(msg) {
  console.error(`\n❌ 検証失敗: ${msg}`);
  process.exit(1);
}

async function main() {
  console.log(`取得中: ${SOURCE}`);
  const res = await fetch(SOURCE, { headers: { 'User-Agent': 'wcup-annexc-fetch/1.0' } });
  if (!res.ok) fail(`HTTP ${res.status}`);
  const html = await res.text();

  // 1X トークンを持つヘッダー行を含むテーブルを特定
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
  let target = null;
  let winnerOrder = null;
  for (const t of tables) {
    for (const r of rowsOf(t)) {
      const cells = cellsOf(r);
      const order = cells.map((c) => (c.match(/\b1([A-L])\b/) || [])[1]).filter(Boolean);
      if (order.length === 8) { target = t; winnerOrder = order; break; }
    }
    if (target) break;
  }
  if (!target) fail('組み合わせ表（ヘッダーに 1A〜1L を持つ表）が見つからない');
  console.log(`勝者列の順序: ${winnerOrder.join(',')}`);
  if (winnerOrder.join('') !== 'ABDEGIKL') {
    fail(`想定外の勝者順 ${winnerOrder.join(',')}（期待: A,B,D,E,G,I,K,L）`);
  }

  // データ行抽出
  const table = {};
  let count = 0;
  for (const r of rowsOf(target)) {
    const cells = cellsOf(r);
    const assigns = cells.map((c) => (c.match(/^3\s*([A-L])$/) || [])[1]).filter(Boolean);
    if (assigns.length !== 8) continue; // データ行のみ
    count += 1;

    // 検証1: 全単射
    const set = new Set(assigns);
    if (set.size !== 8) fail(`行${count}: 3位グループに重複 ${assigns.join('')}`);

    // 検証2: 各割当が許可クラスタに適合
    winnerOrder.forEach((w, i) => {
      if (!PERMITTED[w].includes(assigns[i])) {
        fail(`行${count}: ${w}1 に 3${assigns[i]} は不許可（許可: ${PERMITTED[w].join('/')}）`);
      }
    });

    // 検証3: 通過セット = 割当された3位グループ集合（列が別途あれば突き合わせ）
    const key = [...assigns].sort().join('');
    const groupsCell = cells.find((c) => {
      const ls = (c.match(/[A-L]/g) || []);
      return ls.length === 8 && new Set(ls).size === 8 && !/3[A-L]/.test(c);
    });
    if (groupsCell) {
      const parsed = (groupsCell.match(/[A-L]/g) || []).sort().join('');
      if (parsed !== key) fail(`行${count}: 通過列(${parsed}) と割当セット(${key}) が不一致`);
    }
    if (table[key]) fail(`行${count}: 通過セット ${key} が重複`);
    table[key] = winnerOrder.map((_, i) => assigns[i]).join('');
  }

  // 検証4: 行数 = C(12,8) = 495
  if (count !== 495) fail(`データ行数が ${count}（期待: 495）`);
  console.log(`✅ ${count} 行すべて検証通過（全単射・クラスタ適合・通過セット一致）`);

  // 生成
  const entries = Object.keys(table).sort().map((k) => `  ${k}: '${table[k]}',`).join('\n');
  const body = `// 自動生成（scripts/fetch-third-allocation.mjs）— 手で編集しないこと。
// FIFA 2026 W杯 Annex C: 3位通過チームの組み合わせ表（495通り）。
// キー = 3位通過した8グループ（昇順）/ 値 = 勝者順 ${winnerOrder.join('')} に割り当てる3位グループ。
// 例: 'EFGHIJKL' -> 'EJIFHGLK' は A1の相手=3E, B1=3J, D1=3I, E1=3F, G1=3H, I1=3G, K1=3L, L1=3K。
export const WINNER_ORDER = ${JSON.stringify(winnerOrder)};
export const WINNER_SLOT = ${JSON.stringify(WINNER_SLOT)};
export const THIRD_ALLOCATION = {
${entries}
};

// 通過した3位8グループ（配列）-> { スロットID: 3位グループ文字 }。表に無ければ null。
export function thirdAllocation(qualifiedGroups = []) {
  const key = [...qualifiedGroups].filter(Boolean).sort().join('');
  const row = THIRD_ALLOCATION[key];
  if (!row) return null;
  const out = {};
  WINNER_ORDER.forEach((w, i) => { out[WINNER_SLOT[w]] = row[i]; });
  return out;
}
`;
  await writeFile(OUT, body, 'utf8');
  console.log(`✅ 生成: public/lib/third-allocation.js（${Object.keys(table).length} エントリ）`);
  const sample = Object.keys(table).sort()[0];
  console.log(`サンプル: ${sample} -> ${table[sample]}`);
}

main().catch((e) => fail(e.message));
