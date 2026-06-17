// GET /api/pmsr-figure?m=<sm_fixture_id>&k=<figure-key> — PMSR図表PNGをR2からstream配信。
// 図表はFIFA公式PDFの該当ページを画像化したもの（出典: FIFA Training Centre）。
// R2未バインド/オブジェクト無し/不正パラメータは 404（障害隔離・安全側）。

const KEY_RE = /^[a-z0-9-]{1,64}$/; // figure-key のホワイトリスト（パストラバーサル防止）

export async function onRequestGet(context) {
	const { env, request } = context;
	const url = new URL(request.url);
	const m = url.searchParams.get("m");
	const k = url.searchParams.get("k");

	if (!env.PMSR_FIGS || !m || !/^\d{1,12}$/.test(m) || !k || !KEY_RE.test(k)) {
		return new Response("not found", { status: 404 });
	}

	try {
		const obj = await env.PMSR_FIGS.get(`${m}/${k}.png`);
		if (!obj) return new Response("not found", { status: 404 });
		return new Response(obj.body, {
			status: 200,
			headers: {
				"content-type": "image/png",
				// 図表は確定後不変。長期キャッシュ＋immutable。
				"cache-control": "public, max-age=31536000, immutable",
			},
		});
	} catch (err) {
		console.error("GET /api/pmsr-figure failed:", err?.message);
		return new Response("not found", { status: 404 });
	}
}
