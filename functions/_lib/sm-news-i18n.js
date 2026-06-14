// SportMonks 英語ニュースの日本語訳。Vertex AI(既存 GCP サービスアカウント認証を流用)。
// grounding 無し・低温度。KV(env.CONFIG)で1回だけ翻訳。トークン発行はハンドラ側で実施し
// 発行済み accessToken を vertex で受け取る。失敗・vertex 欠如時は原文(英語)を返し、
// ホーム本体には決して波及させない。

const TRANSLATE_MODEL = "gemini-2.5-flash";
const PROMPT = (text) =>
	`次のサッカーのニュース文を自然な日本語に翻訳してください。固有名詞(チーム名・選手名・大会名)は一般的な日本語表記にし、訳文のみを返してください(前置き・引用符・注釈は不要)。\n\n${text}`;

// Vertex generateContent の URL。location=global は無印ホスト、それ以外は {loc}-aiplatform。
export function vertexGenerateUrl(project, location, model) {
	const host =
		location === "global"
			? "aiplatform.googleapis.com"
			: `${location}-aiplatform.googleapis.com`;
	return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

function extractText(jsonBody) {
	const parts = jsonBody?.candidates?.[0]?.content?.parts;
	if (!Array.isArray(parts)) return "";
	return parts
		.map((p) => p?.text || "")
		.join("")
		.trim();
}

// text を日本語化。
// 引数: { kv:KVNamespace, cacheKey:string, vertex:{accessToken,project,location?,model?,fetchImpl?}|null }
export async function translateToJa(text, { kv, cacheKey, vertex } = {}) {
	const src = typeof text === "string" ? text : "";
	if (!src.trim()) return src;
	if (kv && cacheKey) {
		try {
			const hit = await kv.get(cacheKey);
			if (hit) return hit;
		} catch (e) {
			console.error("news i18n: KV get failed", e?.message);
		}
	}
	if (!vertex || !vertex.accessToken || !vertex.project) return src;
	const model = vertex.model || TRANSLATE_MODEL;
	const location = vertex.location || "global";
	const doFetch = vertex.fetchImpl || fetch;
	try {
		const res = await doFetch(
			vertexGenerateUrl(vertex.project, location, model),
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${vertex.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					contents: [{ role: "user", parts: [{ text: PROMPT(src) }] }],
					generationConfig: { temperature: 0.2 },
				}),
			},
		);
		if (!res.ok) {
			console.error("news i18n: Vertex HTTP", res.status);
			return src;
		}
		const body = await res.json();
		const ja = extractText(body);
		if (!ja) return src;
		if (kv && cacheKey) {
			try {
				await kv.put(cacheKey, ja);
			} catch (e) {
				console.error("news i18n: KV put failed", e?.message);
			}
		}
		return ja;
	} catch (e) {
		console.error("news i18n: translate failed", e?.message);
		return src;
	}
}
