// SportMonks 英語ニュースの日本語訳。grounding 無し・低温度。KV(env.CONFIG)で1回だけ翻訳。
// 認証は2系統に対応(どちらもハンドラ側で組み立てて渡す):
//   - vertex: 既存 GCP サービスアカウントで発行済みの accessToken を使う Vertex AI 経路
//   - gemini: Gemini Developer API キー(x-goog-api-key)経路
// vertex を優先。両方欠如/失敗時は原文(英語)を返し、ホーム本体には決して波及させない。

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

// Gemini Developer API generateContent の URL。
export function geminiGenerateUrl(model) {
	return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function extractText(jsonBody) {
	const parts = jsonBody?.candidates?.[0]?.content?.parts;
	if (!Array.isArray(parts)) return "";
	return parts
		.map((p) => p?.text || "")
		.join("")
		.trim();
}

// vertex / gemini から fetch リクエスト(url, init)を組み立てる。どちらも無ければ null。
// grounding(tools)は付けず、温度は低めに固定する。
function buildRequest(prompt, { vertex, gemini }) {
	const payload = {
		contents: [{ role: "user", parts: [{ text: prompt }] }],
		generationConfig: { temperature: 0.2 },
	};
	if (vertex && vertex.accessToken && vertex.project) {
		const model = vertex.model || TRANSLATE_MODEL;
		const location = vertex.location || "global";
		return {
			url: vertexGenerateUrl(vertex.project, location, model),
			init: {
				method: "POST",
				headers: {
					Authorization: `Bearer ${vertex.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			},
			fetchImpl: vertex.fetchImpl,
		};
	}
	if (gemini && gemini.apiKey) {
		const model = gemini.model || TRANSLATE_MODEL;
		return {
			url: geminiGenerateUrl(model),
			init: {
				method: "POST",
				headers: {
					"x-goog-api-key": gemini.apiKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			},
			fetchImpl: gemini.fetchImpl,
		};
	}
	return null;
}

// text を日本語化。
// 引数: {
//   kv:KVNamespace, cacheKey:string,
//   vertex:{accessToken,project,location?,model?,fetchImpl?}|null,
//   gemini:{apiKey,model?,fetchImpl?}|null,
// }
export async function translateToJa(
	text,
	{ kv, cacheKey, vertex, gemini } = {},
) {
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
	const req = buildRequest(PROMPT(src), { vertex, gemini });
	if (!req) return src; // 翻訳手段なし → 英語フォールバック
	const doFetch = req.fetchImpl || fetch;
	try {
		const res = await doFetch(req.url, req.init);
		if (!res.ok) {
			console.error("news i18n: translate HTTP", res.status);
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
