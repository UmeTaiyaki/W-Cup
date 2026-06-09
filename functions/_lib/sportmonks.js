// SportMonks Football API v3 クライアント（観戦プラットフォーム P0）
// 設計方針:
//  - fetch を注入可能にしてネットワーク非依存でテストできる（turnstile.js と同パターン）
//  - 生成は薄く・汎用 get() のみ。endpoint 別の取り込みは ingestion 層に置く
//  - 障害隔離: HTTP/通信エラーは SportmonksError に正規化し、呼び出し側(Cron)で try/catch
//  - トークンは env(SPORTMONKS_TOKEN) 経由。コードに直書きしない
const BASE_URL = 'https://api.sportmonks.com/v3/football';

export class SportmonksError extends Error {
  constructor(message, { status, body, cause } = {}) {
    super(message);
    this.name = 'SportmonksError';
    this.status = status;
    this.body = body;
    if (cause) this.cause = cause;
  }
}

// include: 配列ならセミコロン連結、文字列ならそのまま（ネスト・ドット記法は呼び出し側責務）
function serializeInclude(include) {
  if (Array.isArray(include)) return include.join(';');
  return include;
}

// filters: SportMonks 構文 `key:v1,v2`。オブジェクトは直列化、文字列はそのまま
function serializeFilters(filters) {
  if (typeof filters === 'string') return filters;
  return Object.entries(filters)
    .map(([k, v]) => `${k}:${Array.isArray(v) ? v.join(',') : v}`)
    .join(';');
}

// クエリは手組みする。include/filters の `;` `,` `:` `.` は SportMonks 構文上
// リテラルで送る必要があり、URLSearchParams だと %3B 等にエンコードされ壊れるため。
function buildUrl(baseUrl, path, { include, filters, params } = {}) {
  const normalized = String(path).replace(/^\/+/, '');
  const q = [];
  if (include != null) q.push(`include=${serializeInclude(include)}`);
  if (filters != null) q.push(`filters=${serializeFilters(filters)}`);
  for (const [k, v] of Object.entries(params || {})) {
    q.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return q.length ? `${baseUrl}/${normalized}?${q.join('&')}` : `${baseUrl}/${normalized}`;
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return null;
  }
}

export function createSportmonks({ token, fetchImpl, baseUrl = BASE_URL } = {}) {
  if (!token) throw new Error('sportmonks: token required (SPORTMONKS_TOKEN)');
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) throw new Error('sportmonks: no fetch available');

  // path 例: 'seasons/26618' / 'fixtures/123' / 'livescores/latest' / 'types'
  async function get(path, opts = {}) {
    const url = buildUrl(baseUrl, path, opts);
    let res;
    try {
      res = await doFetch(url, { headers: { Authorization: token } });
    } catch (e) {
      throw new SportmonksError(`request failed: ${e.message}`, { cause: e });
    }
    if (!res.ok) {
      const body = await safeText(res);
      throw new SportmonksError(`http ${res.status} for ${path}`, { status: res.status, body });
    }
    return res.json();
  }

  return { get };
}
