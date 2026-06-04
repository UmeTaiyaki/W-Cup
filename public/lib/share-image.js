// 生成済み <canvas> を PNG 化し、Web Share API かダウンロードで共有する（ESM・ブラウザAPI）。
// 描画(share-draw.js)とは分離。失敗時はダウンロードへフォールバックする。

// canvas → Blob（PNG）。
export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    if (!canvas || typeof canvas.toBlob !== 'function') {
      reject(new Error('canvas が不正です'));
      return;
    }
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob が null を返しました'))),
        type,
        quality,
      );
    } catch (e) {
      reject(e);
    }
  });
}

// このBlob（ファイル）を Web Share で共有可能か。
export function canShareFile(blob, filename) {
  try {
    if (!navigator.share || !navigator.canShare) return false;
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    return navigator.canShare({ files: [file] });
  } catch (e) {
    return false;
  }
}

// Blob をダウンロードさせる（共有非対応環境のフォールバック）。
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 共有 or ダウンロード。戻り値 { method: 'share' | 'download' | 'cancelled' }。
export async function shareOrDownload(blob, { filename, text } = {}) {
  const name = filename || 'wcup2026.png';
  if (canShareFile(blob, name)) {
    try {
      const file = new File([blob], name, { type: blob.type || 'image/png' });
      await navigator.share({ files: [file], text });
      return { method: 'share' };
    } catch (e) {
      // ユーザーが共有シートをキャンセル → 何もしない
      if (e && e.name === 'AbortError') return { method: 'cancelled' };
      // それ以外の失敗はダウンロードへフォールバック
      console.error('share failed, falling back to download', e);
    }
  }
  downloadBlob(blob, name);
  return { method: 'download' };
}

// 描画前にWebフォントを確実にロード（フォント欠けで画像が崩れるのを防ぐ）。
// 取得できなくても system font で描画継続できるよう、最長1.5秒で打ち切る。
export async function ensureFonts() {
  if (!document.fonts || typeof document.fonts.load !== 'function') return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('900 64px "Archivo"'),
        document.fonts.load('800 24px "Archivo"'),
        document.fonts.load('700 28px "Noto Sans JP"'),
        document.fonts.load('800 28px "Noto Sans JP"'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    if (document.fonts.ready) await document.fonts.ready;
  } catch (e) {
    // フォント未ロードでも続行
  }
}
