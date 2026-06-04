import { json } from '../_lib/http.js';
import { seedPredictions, validatePred, makeMember, emptyPred, LIMITS } from '../_lib/predictions.js';

// 予想データは config と同じ CONFIG ネームスペースの別キーに保存する（インフラ追加不要）。
const KEY = 'predictions:v1';

async function readDoc(env) {
  let stored = null;
  try {
    stored = await env.CONFIG.get(KEY);
  } catch (e) {
    console.error('predictions: KV read failed', e);
    return null;
  }
  if (!stored) return null;
  try {
    const doc = JSON.parse(stored);
    if (!doc || !Array.isArray(doc.members) || !doc.preds) return null;
    return doc;
  } catch (e) {
    console.error('predictions: stored JSON parse failed', e);
    return null;
  }
}

export async function onRequestGet({ env }) {
  const doc = (await readDoc(env)) || seedPredictions();
  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// 競合対策: メンバー単位マージ。書き込みごとに最新ドキュメントを読み、対象部分だけ更新する。
// 認証なし（仲間内アプリ・各自が自分の予想を入力する想定）。
export async function onRequestPost({ request, env }) {
  // 認証なしのため、巨大payloadによるKV肥大化を入口で早期拒否。
  const cl = Number(request.headers.get('content-length') || 0);
  if (cl > LIMITS.postBytes) return json(413, { error: 'データが大きすぎます' });

  let input;
  try {
    input = await request.json();
  } catch (e) {
    console.error('predictions POST: invalid json', e);
    return json(400, { error: 'JSONが不正です' });
  }

  const op = input && input.op;
  let doc = (await readDoc(env)) || seedPredictions();
  // 不変更新のためコピー
  let members = [...doc.members];
  let preds = { ...doc.preds };
  let newId = null;

  if (op === 'setPred') {
    const id = input.memberId;
    if (typeof id !== 'string' || !members.some((m) => m.id === id)) {
      return json(404, { error: 'メンバーが見つかりません' });
    }
    preds = { ...preds, [id]: validatePred(input.pred).value };
  } else if (op === 'addMember') {
    if (members.length >= LIMITS.members) return json(409, { error: 'メンバー数の上限です' });
    const member = makeMember(input.name, members.length);
    if (!member) return json(400, { error: '名前を入力してください' });
    members = [...members, member];
    preds = { ...preds, [member.id]: emptyPred() };
    newId = member.id;
  } else if (op === 'removeMember') {
    const id = input.memberId;
    const next = members.filter((m) => m.id !== id);
    if (!next.length) return json(400, { error: '最後の1人は削除できません' });
    members = next;
    preds = { ...preds };
    delete preds[id];
  } else if (op === 'reset') {
    const seed = seedPredictions();
    members = seed.members;
    preds = seed.preds;
  } else {
    return json(400, { error: '不明な操作です' });
  }

  const value = { version: 1, updatedAt: new Date().toISOString(), members, preds };
  try {
    await env.CONFIG.put(KEY, JSON.stringify(value));
  } catch (e) {
    console.error('predictions POST: KV write failed', e);
    return json(500, { error: '保存に失敗しました' });
  }
  return json(200, newId ? { ...value, newId } : value);
}
