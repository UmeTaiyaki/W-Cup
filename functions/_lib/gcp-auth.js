// GCPサービスアカウントの鍵から短命なOAuth2アクセストークンを発行する。
// 標準のJWT-bearerフロー（自己署名JWTを oauth2.googleapis.com/token に提示して
// access_token と交換）を、WebCryptoのRS256（RSASSA-PKCS1-v1_5 / SHA-256）で実装。
// Cloudflare Workers と Node の webcrypto の両方で動くよう、Web標準API のみを使用
// （crypto.subtle / TextEncoder / atob / btoa / URLSearchParams / fetch）。node:crypto は不使用。
// トークンのキャッシュ（有効期限を考慮した再利用）は呼び出し側の責務（V2）。

const DEFAULT_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

// bytes → base64url（パディング無し）。
// btoa(String.fromCharCode(...bytes)) は大きい配列でコールスタックを溢れさせ得るため
// チャンク処理でバイナリ文字列を組み立てる。
function bytesToBase64url(uint8) {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < uint8.length; i += chunkSize) {
		const chunk = uint8.subarray(i, i + chunkSize);
		binary += String.fromCharCode.apply(null, chunk);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

// UTF-8文字列 → base64url（パディング無し）。
function base64url(str) {
	return bytesToBase64url(new TextEncoder().encode(str));
}

// PEM(PKCS8) → ArrayBuffer。ヘッダ/フッタ行と全空白を除去し atob でデコード。
function pemToArrayBuffer(pem) {
	const body = pem
		.replace(/-----BEGIN PRIVATE KEY-----/, "")
		.replace(/-----END PRIVATE KEY-----/, "")
		.replace(/\s+/g, "");
	const binary = atob(body);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

export async function mintGcpAccessToken({
	clientEmail,
	privateKey,
	scope = DEFAULT_SCOPE,
	nowSec,
	fetchImpl,
	tokenUri = DEFAULT_TOKEN_URI,
}) {
	const now = nowSec || Math.floor(Date.now() / 1000);

	const header = { alg: "RS256", typ: "JWT" };
	const claims = {
		iss: clientEmail,
		scope,
		aud: tokenUri,
		iat: now,
		exp: now + 3600,
	};

	const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

	const key = await crypto.subtle.importKey(
		"pkcs8",
		pemToArrayBuffer(privateKey),
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		key,
		new TextEncoder().encode(signingInput),
	);
	const assertion = `${signingInput}.${bytesToBase64url(new Uint8Array(sig))}`;

	const doFetch = fetchImpl || fetch;
	const res = await doFetch(tokenUri, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion,
		}).toString(),
	});

	if (!res.ok) {
		throw new Error(
			`GCP token HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
		);
	}

	const json = await res.json();
	if (!json.access_token) {
		throw new Error("GCP token: access_token 不在");
	}

	return {
		token: json.access_token,
		expiresAt: now + (json.expires_in || 3600),
	};
}
