// 3種類の共有カードを Canvas 2D に直接描画する（ESM）。
// プレビュー＝生成画像にするため、ShareSheet は描画した canvas をそのまま表示・PNG化する。
// データは window.WC（TEAM/GROUPS/deriveKnockout）から取得。表示モデルは share-model.js。

import { groupRanking, parseScorer, KIND_LABEL } from './share-model.js';

// カードごとの出力解像度（CSSピクセル）。実描画は SCALE 倍で高精細化。
const DIMS = {
  core: [1080, 1350],
  group: [1080, 1350],
  knockout: [1920, 1080],
};
const SCALE = 2;
const SITE = 'wcup2026-yosou.pages.dev';

// ---- パレット（テーマに依らずダーク基調。accent/gold だけ T から）------------
function rgba(hex, a) {
  const h = String(hex || '').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}
function palette(T) {
  const accent = (T && T.accent) || '#B6FF3C';
  return {
    accent,
    gold: (T && T.gold) || '#F6C744',
    silver: (T && T.silver) || '#C9D2DA',
    bronze: '#D08B5B',
    rank4: '#7E8A97',
    text: '#F3F7F2',
    sub: 'rgba(226,240,228,0.66)',
    faint: 'rgba(226,240,228,0.42)',
    card: 'rgba(255,255,255,0.045)',
    line: 'rgba(255,255,255,0.10)',
    win: rgba(accent, 0.16),
    winInk: '#0b0d12',
    pillInk: '#11150b',
  };
}

// ---- 低レベル描画ユーティリティ ----------------------------------------------
function jp(weight, size) {
  return `${weight} ${size}px "Noto Sans JP", system-ui, sans-serif`;
}
function arc(weight, size) {
  return `${weight} ${size}px "Archivo", system-ui, sans-serif`;
}
function roundPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function fillRound(ctx, x, y, w, h, r, fill) {
  roundPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}
function strokeRound(ctx, x, y, w, h, r, stroke, lw = 1.5) {
  roundPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
}
// 幅に収まるよう末尾を「…」で省略。
function fitText(ctx, text, maxW) {
  const s = String(text == null ? '' : text);
  if (maxW <= 0 || ctx.measureText(s).width <= maxW) return s;
  const ell = '…';
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(s.slice(0, mid) + ell).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo) + ell;
}

// 幅に収まるよう、まずフォントサイズを縮めて全文表示を試みる。最小サイズでも収まらない
// 場合のみ末尾を「…」で省略する。ctx.font を最終サイズに設定し、描画文字列を返す。
// fontFn は jp / arc。
function fitTextScaled(ctx, text, maxW, fontFn, weight, baseSize, minSize) {
  const s = String(text == null ? '' : text);
  let size = baseSize;
  ctx.font = fontFn(weight, size);
  while (size > minSize && ctx.measureText(s).width > maxW) {
    size -= 2;
    ctx.font = fontFn(weight, size);
  }
  return ctx.measureText(s).width <= maxW ? s : fitText(ctx, s, maxW);
}

// 絵文字フラグを描画し、視覚的中心を cy に合わせる（視覚的な幅を返す）。
// iOS Safari と Chrome で絵文字のメトリクスが異なるため、固定baselineや advance幅
// ではなく、縦横とも実測のバウンディングボックスで位置合わせする。
// 特に横方向は絵文字の左右ベアリング（字送り箱内の余白）が非対称で、advance幅基準で
// 中央/右揃えすると国旗だけ視覚的にズレるため、見た目の左右端でアンカーする。
// align で水平アンカー（'left' | 'center' | 'right'）を指定。
function drawFlag(ctx, emoji, x, cy, size, align = 'left') {
  ctx.font = jp(400, size);
  ctx.textAlign = 'left'; // 視覚BBox基準で自前配置するため left 固定
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(emoji);
  const asc = m.actualBoundingBoxAscent || size * 0.72;
  const desc = m.actualBoundingBoxDescent || size * 0.06;
  // 水平: alignment point から見た左右端までの距離（left は正で左方向）。
  const bl = m.actualBoundingBoxLeft || 0;
  const br = m.actualBoundingBoxRight != null ? m.actualBoundingBoxRight : m.width;
  const visW = bl + br; // 見た目の横幅
  let drawX;
  if (align === 'center') drawX = x - (br - bl) / 2; // 視覚中心を x に合わせる
  else if (align === 'right') drawX = x - br;        // 視覚右端を x に合わせる
  else drawX = x + bl;                                // 視覚左端を x に合わせる
  ctx.fillText(emoji, drawX, cy + (asc - desc) / 2);
  return visW;
}

// ---- チーム参照ヘルパー -------------------------------------------------------
function teamOf(code) {
  return (window.WC && window.WC.TEAM && window.WC.TEAM[code]) || null;
}
const flagOf = (code) => (teamOf(code) ? teamOf(code).flag : '⚪️');
const nameOf = (code) => (teamOf(code) ? teamOf(code).ja : '未定');
const codeOf = (code) => (teamOf(code) ? teamOf(code).code : code || '');

// ---- 共通: 背景・ヘッダー・フッター ------------------------------------------
function drawBackground(ctx, pal, W, H) {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, '#141a23');
  g.addColorStop(0.75, '#0b0d12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 上部のほのかなアクセントグロー
  const glow = ctx.createRadialGradient(W * 0.5, -40, 10, W * 0.5, -40, W * 0.7);
  glow.addColorStop(0, rgba(pal.accent, 0.10));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H * 0.5);
}

function drawHeader(ctx, pal, who, title, x, y) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  try { ctx.letterSpacing = '3px'; } catch (e) { /* 非対応ブラウザは無視 */ }
  ctx.font = arc(800, 21);
  ctx.fillStyle = pal.accent;
  ctx.fillText('W杯2026予想', x, y);
  try { ctx.letterSpacing = '0px'; } catch (e) {}
  ctx.font = jp(700, 25);
  ctx.fillStyle = pal.sub;
  ctx.fillText(who, x, y + 34);
  ctx.font = arc(900, 50);
  ctx.fillStyle = pal.text;
  ctx.fillText(title, x, y + 96);
}

function drawFooter(ctx, pal, W, H) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = jp(700, 19);
  ctx.fillStyle = pal.faint;
  ctx.fillText(`🏆 ${SITE}`, 48, H - 42);
  ctx.font = arc(800, 19);
  ctx.fillStyle = pal.accent;
  ctx.textAlign = 'right';
  ctx.fillText('#W杯予想', W - 48, H - 42);
  ctx.textAlign = 'left';
}

// ---- カード①: グループ順位（1〜4位）------------------------------------------
function drawGroupCard(ctx, pal, pred, W, H) {
  drawHeader(ctx, pal, pred._who, KIND_LABEL.group, 48, 78);
  const ranking = groupRanking(pred.groupRank || {}, (window.WC && window.WC.GROUPS) || {});
  const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const RANK_COLOR = [pal.gold, pal.silver, pal.bronze, pal.rank4];

  const cols = 3;
  const rows = 4;
  const gap = 16;
  const padX = 44;
  const top = 208;
  const bottom = H - 86;
  const colW = (W - padX * 2 - gap * (cols - 1)) / cols;
  const boxH = (bottom - top - gap * (rows - 1)) / rows;

  keys.forEach((k, i) => {
    const bx = padX + (i % cols) * (colW + gap);
    const by = top + Math.floor(i / cols) * (boxH + gap);
    fillRound(ctx, bx, by, colW, boxH, 16, pal.card);
    strokeRound(ctx, bx, by, colW, boxH, 16, pal.line, 1);

    // グループ見出し
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = arc(800, 19);
    ctx.fillStyle = pal.accent;
    ctx.fillText(`GROUP ${k}`, bx + 14, by + 12);

    const list = ranking[k];
    if (list.length === 0) {
      ctx.textBaseline = 'middle';
      ctx.font = jp(700, 20);
      ctx.fillStyle = pal.faint;
      ctx.fillText('未予想', bx + 14, by + boxH * 0.62);
      return;
    }
    const rowsTop = by + 44;
    const rowStep = (boxH - 52) / 4;
    for (let r = 0; r < 4; r++) {
      const entry = list[r];
      const cy = rowsTop + (r + 0.5) * rowStep;
      drawGroupRow(ctx, pal, entry, r + 1, RANK_COLOR[r], bx, cy, colW);
    }
  });

  drawFooter(ctx, pal, W, H);
}

function drawGroupRow(ctx, pal, entry, rank, color, bx, cy, colW) {
  const pad = 14;
  const pillW = 24;
  const pillH = 22;
  const px = bx + pad;
  const code = entry && entry.code;
  const auto = entry && entry.auto;
  ctx.globalAlpha = auto ? 0.66 : 1;
  // 順位ピル
  fillRound(ctx, px, cy - pillH / 2, pillW, pillH, 7, code ? color : pal.line);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = arc(800, 14);
  ctx.fillStyle = pal.pillInk;
  ctx.fillText(String(rank), px + pillW / 2, cy + 1);
  // 旗
  ctx.textAlign = 'left';
  const fx = px + pillW + 10;
  if (code) {
    ctx.fillStyle = pal.text;
    const fw = drawFlag(ctx, flagOf(code), fx, cy, 25, 'left');
    const nx = fx + fw + 8;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.text;
    ctx.fillText(fitTextScaled(ctx, nameOf(code), bx + colW - pad - nx, jp, 700, 20, 13), nx, cy + 1);
  } else {
    ctx.font = jp(700, 18);
    ctx.fillStyle = pal.faint;
    ctx.fillText('—', fx, cy + 1);
  }
  ctx.globalAlpha = 1;
}

// ---- カード②: 優勝予想（コア予想 = 優勝・準優勝・得点王）----------------------
function drawCoreCard(ctx, pal, pred, W, H) {
  drawHeader(ctx, pal, pred._who, KIND_LABEL.core, 48, 78);
  const cx = W / 2;
  const champ = pred.champion;

  // 優勝（主役）
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = arc(800, 20);
  ctx.fillStyle = pal.gold;
  try { ctx.letterSpacing = '3px'; } catch (e) {}
  ctx.fillText('🏆 優勝', cx, 256);
  try { ctx.letterSpacing = '0px'; } catch (e) {}
  drawFlag(ctx, champ ? flagOf(champ) : '🏆', cx, 408, 150, 'center');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const champName = champ ? nameOf(champ) : '未予想';
  ctx.fillStyle = champ ? pal.text : pal.faint;
  ctx.fillText(fitTextScaled(ctx, champName, W - 100, arc, 900, 84, 38), cx, 540);

  // 準優勝
  const runner = pred.runnerUp;
  drawCoreRow(ctx, pal, '🥈 準優勝', pal.silver,
    runner ? flagOf(runner) : '⚪️',
    runner ? nameOf(runner) : '未予想', null, !runner, 60, 654, W - 120, 156);

  // 得点王
  const sc = parseScorer(pred.topScorer);
  const hasSc = !!sc.name;
  drawCoreRow(ctx, pal, '👑 得点王', pal.accent,
    sc.code && teamOf(sc.code) ? flagOf(sc.code) : '⚽️',
    hasSc ? sc.name : '未予想',
    sc.code && teamOf(sc.code) ? nameOf(sc.code) : null, !hasSc, 60, 830, W - 120, 156);

  drawFooter(ctx, pal, W, H);
}

// コア予想の下段カード（ラベル＋旗＋主テキスト＋任意のサブ）。
function drawCoreRow(ctx, pal, label, labelColor, flag, main, sub, empty, x, y, w, h) {
  fillRound(ctx, x, y, w, h, 18, pal.card);
  strokeRound(ctx, x, y, w, h, 18, pal.line, 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = arc(800, 18);
  ctx.fillStyle = labelColor;
  ctx.fillText(label, x + 26, y + 20);

  const cyc = y + h / 2 + 14;
  const fw = drawFlag(ctx, flag, x + 26, cyc, 58, 'left'); // 縦横ともBBox基準で配置（iOSずれ対策）
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const tx = x + 26 + fw + 18;
  const maxW = x + w - 30 - tx;
  if (empty) {
    ctx.font = jp(700, 30);
    ctx.fillStyle = pal.faint;
    ctx.fillText('未予想', tx, cyc);
  } else if (sub) {
    ctx.fillStyle = pal.text;
    ctx.fillText(fitTextScaled(ctx, main, maxW, arc, 900, 40, 24), tx, cyc - 15);
    ctx.fillStyle = pal.sub;
    ctx.fillText(fitTextScaled(ctx, sub, maxW, jp, 700, 23, 15), tx, cyc + 23);
  } else {
    ctx.fillStyle = pal.text;
    ctx.fillText(fitTextScaled(ctx, main, maxW, jp, 800, 42, 24), tx, cyc);
  }
}

// ---- カード③: ノックアウト（両側ミラー型トーナメント表）----------------------
// 中央の優勝へ左右から収束。R32=対戦カード、R16/QF/SF=勝ち上がり単独チーム。
// 参考レイアウト: ROUND OF 32 → R16 → QF → SF → FINAL(中央) → SF → … → ROUND OF 32
function compactSeed(label) {
  const m = /^(.)組\s*(\d)位$/.exec(label || '');
  if (m) return `${m[2]}${m[1]}`;
  if (/3位/.test(label || '')) return '3位';
  return '';
}

function drawKnockoutCard(ctx, pal, pred, W, H) {
  // ブランド
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  try { ctx.letterSpacing = '3px'; } catch (e) {}
  ctx.font = arc(800, 18);
  ctx.fillStyle = pal.accent;
  ctx.fillText(`W杯2026予想 · ${pred._who}`, 44, 52);
  try { ctx.letterSpacing = '0px'; } catch (e) {}

  const der = window.WC.deriveKnockout(
    pred.groupRank || {},
    window.WC.resolveThirdAssign(pred.groupRank || {}, pred.thirdGroups || []),
    pred.knockout || {},
  );
  const wr = der.winners; // { r32:[16], r16:[8], qf:[4], sf:[2] }
  const seeds = (der.seeds && der.seeds.r32) || [];

  const by = 134;
  const bh = H - by - 56;
  const unit = bh / 8;
  const cY0 = (i) => by + (i + 0.5) * unit;       // R32 / R16 行(8)
  const cY1 = (j) => by + (2 * j + 1) * unit;     // QF 行(4)
  const cY2 = (k) => by + 2 * (2 * k + 1) * unit; // SF 行(2)
  const cYc = by + 4 * unit;                      // 中央(優勝)

  // 列ジオメトリ（左側基準。右側はミラー）
  const R32W = 250;
  const BOXW = 104;
  const left = [
    { x: 44, w: R32W }, { x: 322, w: BOXW }, { x: 470, w: BOXW }, { x: 618, w: BOXW },
  ];
  const right = left.map((c) => ({ x: W - c.x - c.w, w: c.w }));
  const champW = 300;
  const champX = (W - champW) / 2;

  // ラウンド見出し
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = arc(800, 16);
  ['ROUND OF 32', 'R16', 'QF', 'SF'].forEach((lab, i) => {
    ctx.fillStyle = pal.sub;
    ctx.fillText(lab, left[i].x + left[i].w / 2, 96);
    ctx.fillText(lab, right[i].x + right[i].w / 2, 96);
  });
  ctx.fillStyle = pal.gold;
  ctx.fillText('FINAL', W / 2, 96);

  // 片側を描画（off=各ラウンドのインデックスオフセット, sign<0=左 / >0=右）
  function drawSide(cols, off, sign) {
    const isLeft = sign < 0;
    const innerEdge = (c) => (isLeft ? c.x + c.w : c.x); // 中央側の辺
    const outerEdge = (c) => (isLeft ? c.x : c.x + c.w); // 外側の辺

    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.5;
    const elbow = (x1, y1, x2, y2) => {
      const mx = (x1 + x2) / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(mx, y1); ctx.lineTo(mx, y2); ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    for (let i = 0; i < 8; i++) elbow(innerEdge(cols[0]), cY0(i), outerEdge(cols[1]), cY0(i));
    for (let j = 0; j < 4; j++)
      [2 * j, 2 * j + 1].forEach((i) => elbow(innerEdge(cols[1]), cY0(i), outerEdge(cols[2]), cY1(j)));
    for (let k = 0; k < 2; k++)
      [2 * k, 2 * k + 1].forEach((j) => elbow(innerEdge(cols[2]), cY1(j), outerEdge(cols[3]), cY2(k)));
    const champEdge = isLeft ? champX : champX + champW;
    [0, 1].forEach((k) => elbow(innerEdge(cols[3]), cY2(k), champEdge, cYc));

    // R32 対戦カード(8)
    for (let i = 0; i < 8; i++) {
      const gi = off.r32 + i;
      drawR32Match(ctx, pal, der.matches.r32[gi], wr.r32[gi], seeds[gi] || [],
        cols[0].x, cY0(i) - 47, cols[0].w, 94, isLeft);
    }
    // R16 box(8): R32勝者を表示し、R16勝者をハイライト
    for (let i = 0; i < 8; i++) {
      const team = wr.r32[off.r32 + i];
      const adv = team && wr.r16[off.r16 + (i >> 1)] === team;
      drawAdvanceBox(ctx, pal, team, adv, cols[1].x, cY0(i) - 26, cols[1].w, 52);
    }
    // QF box(4)
    for (let j = 0; j < 4; j++) {
      const team = wr.r16[off.r16 + j];
      const adv = team && wr.qf[off.qf + (j >> 1)] === team;
      drawAdvanceBox(ctx, pal, team, adv, cols[2].x, cY1(j) - 26, cols[2].w, 52);
    }
    // SF box(2)
    for (let k = 0; k < 2; k++) {
      const team = wr.qf[off.qf + k];
      const adv = team && wr.sf[off.sf] === team;
      drawAdvanceBox(ctx, pal, team, adv, cols[3].x, cY2(k) - 26, cols[3].w, 52);
    }
  }

  drawSide(left, { r32: 0, r16: 0, qf: 0, sf: 0 }, -1);
  drawSide(right, { r32: 8, r16: 4, qf: 2, sf: 1 }, 1);

  // 中央: CHAMPION ＋ 決勝カード
  const champ = pred.champion;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = arc(800, 18);
  ctx.fillStyle = pal.gold;
  try { ctx.letterSpacing = '2px'; } catch (e) {}
  ctx.fillText('CHAMPION', W / 2, cYc - 96);
  try { ctx.letterSpacing = '0px'; } catch (e) {}

  const chH = 132;
  const chY = cYc - 70;
  fillRound(ctx, champX, chY, champW, chH, 18, champ ? rgba(pal.gold, 0.16) : pal.card);
  strokeRound(ctx, champX, chY, champW, chH, 18, champ ? pal.gold : pal.line, 2);
  drawFlag(ctx, champ ? flagOf(champ) : '🏆', W / 2, chY + 48, 54, 'center');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = champ ? pal.text : pal.faint;
  if (champ) {
    ctx.fillText(fitTextScaled(ctx, nameOf(champ), champW - 28, jp, 900, 30, 18), W / 2, chY + 100);
  } else {
    ctx.font = jp(900, 30);
    ctx.fillText('優勝予想', W / 2, chY + 100);
  }

  // 決勝カード（左finalist v. 右finalist）
  const fy = chY + chH + 44;
  drawFinalChip(ctx, pal, wr.sf[0], W / 2 - 92, fy, 'right');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = arc(800, 20);
  ctx.fillStyle = pal.sub;
  ctx.fillText('v.', W / 2, fy + 1);
  drawFinalChip(ctx, pal, wr.sf[1], W / 2 + 92, fy, 'left');

  drawFooter(ctx, pal, W, H);
}

// R32 対戦カード: 2チーム（seed+flag+国名）、勝者ハイライト。
function drawR32Match(ctx, pal, teams, winner, seedPair, x, y, w, h, isLeft) {
  fillRound(ctx, x, y, w, h, 11, pal.card);
  strokeRound(ctx, x, y, w, h, 11, winner ? rgba(pal.accent, 0.4) : pal.line, 1);
  const half = h / 2;
  drawR32Team(ctx, pal, teams[0], winner, compactSeed(seedPair[0]), x, y, w, half, isLeft);
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + half);
  ctx.lineTo(x + w - 8, y + half);
  ctx.stroke();
  drawR32Team(ctx, pal, teams[1], winner, compactSeed(seedPair[1]), x, y + half, w, half, isLeft);
}

function drawR32Team(ctx, pal, code, winner, seed, x, y, w, h, isLeft) {
  const isWin = winner && winner === code;
  const dim = winner && !isWin;
  if (isWin) fillRound(ctx, x + 3, y + 3, w - 6, h - 6, 7, pal.accent);
  const cy = y + h / 2 + 1;
  const seedColW = 24; // seed列は固定幅にして列方向を揃える
  const pad = 12;
  const flag = code ? flagOf(code) : '⚪️';
  ctx.globalAlpha = dim ? 0.4 : 1;
  ctx.textBaseline = 'middle';
  const seedColor = isWin ? pal.winInk : pal.faint;
  const flagColor = isWin ? pal.winInk : pal.text;
  const nameColor = isWin ? pal.winInk : code ? pal.text : pal.faint;
  if (isLeft) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = arc(700, 13); ctx.fillStyle = seedColor;
    ctx.fillText(seed, x + pad, cy);
    const flagX = x + pad + seedColW;
    ctx.fillStyle = flagColor;
    const fw = drawFlag(ctx, flag, flagX, cy, 24, 'left');
    const nameX = flagX + fw + 8;
    ctx.fillStyle = nameColor;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(fitTextScaled(ctx, code ? nameOf(code) : '未定', x + w - pad - nameX, jp, 700, 19, 12), nameX, cy);
  } else {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = arc(700, 13); ctx.fillStyle = seedColor;
    ctx.fillText(seed, x + w - pad, cy);
    const flagRight = x + w - pad - seedColW;
    ctx.fillStyle = flagColor;
    const fw = drawFlag(ctx, flag, flagRight, cy, 24, 'right');
    const nameRight = flagRight - fw - 8;
    ctx.fillStyle = nameColor;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(fitTextScaled(ctx, code ? nameOf(code) : '未定', nameRight - (x + pad), jp, 700, 19, 12), nameRight, cy);
  }
  ctx.globalAlpha = 1;
}

// 勝ち上がり単独チーム box: flag + コード。進出はハイライト、敗退は淡色。
function drawAdvanceBox(ctx, pal, code, advances, x, y, w, h) {
  const filled = advances && code;
  fillRound(ctx, x, y, w, h, 9, filled ? pal.accent : pal.card);
  strokeRound(ctx, x, y, w, h, 9, filled ? pal.accent : pal.line, 1);
  ctx.globalAlpha = code ? (advances ? 1 : 0.45) : 1;
  ctx.fillStyle = filled ? pal.winInk : pal.text;
  if (code) {
    drawFlag(ctx, flagOf(code), x + w / 2, y + h / 2 - 9, 23, 'center');
  } else {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = jp(400, 23);
    ctx.fillText('·', x + w / 2, y + h / 2 - 9);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = arc(800, 14);
  ctx.fillStyle = filled ? pal.winInk : code ? pal.sub : pal.faint;
  ctx.fillText(code ? codeOf(code) : '—', x + w / 2, y + h / 2 + 15);
  ctx.globalAlpha = 1;
}

// 決勝の finalist チップ（flag+コード）。align で基準辺を指定。
function drawFinalChip(ctx, pal, code, anchorX, cy, align) {
  const w = 150;
  const h = 56;
  const x = align === 'right' ? anchorX - w : anchorX;
  fillRound(ctx, x, cy - h / 2, w, h, 12, code ? rgba(pal.accent, 0.14) : pal.card);
  strokeRound(ctx, x, cy - h / 2, w, h, 12, code ? rgba(pal.accent, 0.5) : pal.line, 1.5);
  ctx.fillStyle = pal.text;
  const flag = code ? flagOf(code) : '⚪️';
  const fw = drawFlag(ctx, flag, x + 14, cy, 28, 'left');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = arc(800, 18);
  ctx.fillStyle = code ? pal.text : pal.faint;
  ctx.fillText(code ? codeOf(code) : '—', x + 14 + fw + 8, cy + 1);
}

// ---- エントリ -----------------------------------------------------------------
const DRAW = { core: drawCoreCard, group: drawGroupCard, knockout: drawKnockoutCard };

// canvas に kind のカードを描画する。opts: { member, pred, T }
export function drawShareCard(canvas, kind, opts = {}) {
  const fn = DRAW[kind];
  if (!fn) throw new Error(`未知のカード種別: ${kind}`);
  const [W, H] = DIMS[kind];
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const pal = palette(opts.T);
  const pred = { ...(opts.pred || {}), _who: (opts.member && opts.member.name) || '誰か' };
  drawBackground(ctx, pal, W, H);
  fn(ctx, pal, pred, W, H);
  return canvas;
}

export { DIMS };
