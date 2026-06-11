import assert from "node:assert/strict";
import { test } from "node:test";
import { mintGcpAccessToken } from "./gcp-auth.js";

// Generate an RSA key and export the private key as PKCS8 PEM for the test.
async function makeTestKeyPem() {
	const kp = await crypto.subtle.generateKey(
		{
			name: "RSASSA-PKCS1-v1_5",
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["sign", "verify"],
	);
	const pkcs8 = new Uint8Array(
		await crypto.subtle.exportKey("pkcs8", kp.privateKey),
	);
	const b64 = Buffer.from(pkcs8).toString("base64");
	const lines = b64.match(/.{1,64}/g).join("\n");
	const pem = `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
	return { pem, publicKey: kp.publicKey };
}

test("mintGcpAccessToken: JWT-bearer交換でaccess_tokenを返す", async () => {
	const { pem } = await makeTestKeyPem();
	let captured;
	const fakeFetch = async (url, opts) => {
		captured = { url, opts };
		return {
			ok: true,
			json: async () => ({ access_token: "ya29.test", expires_in: 3600 }),
		};
	};
	const out = await mintGcpAccessToken({
		clientEmail: "sa@proj.iam.gserviceaccount.com",
		privateKey: pem,
		nowSec: 1000,
		fetchImpl: fakeFetch,
	});
	assert.equal(out.token, "ya29.test");
	assert.equal(out.expiresAt, 1000 + 3600);
	assert.equal(captured.url, "https://oauth2.googleapis.com/token");
	// body has grant_type jwt-bearer and a 3-part assertion (JWT)
	const body = String(captured.opts.body);
	assert.match(
		body,
		/grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/,
	);
	const m = body.match(/assertion=([^&]+)/);
	assert.ok(m, "assertion present");
	const jwt = decodeURIComponent(m[1]);
	assert.equal(jwt.split(".").length, 3, "assertion is a 3-part JWT");
});

test("mintGcpAccessToken: 署名が公開鍵で検証できる(実署名の健全性)", async () => {
	const { pem, publicKey } = await makeTestKeyPem();
	let assertion;
	const fakeFetch = async (_url, opts) => {
		assertion = decodeURIComponent(
			String(opts.body).match(/assertion=([^&]+)/)[1],
		);
		return {
			ok: true,
			json: async () => ({ access_token: "t", expires_in: 3600 }),
		};
	};
	await mintGcpAccessToken({
		clientEmail: "x",
		privateKey: pem,
		nowSec: 1,
		fetchImpl: fakeFetch,
	});
	const [h, p, s] = assertion.split(".");
	const data = new TextEncoder().encode(`${h}.${p}`);
	const sig = Uint8Array.from(
		atob(s.replace(/-/g, "+").replace(/_/g, "/")),
		(c) => c.charCodeAt(0),
	);
	const ok = await crypto.subtle.verify(
		"RSASSA-PKCS1-v1_5",
		publicKey,
		sig,
		data,
	);
	assert.ok(ok, "signature verifies with the public key");
	// header/claims decode and contain expected fields
	const header = JSON.parse(
		new TextDecoder().decode(
			Uint8Array.from(atob(h.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
				c.charCodeAt(0),
			),
		),
	);
	assert.equal(header.alg, "RS256");
});

test("mintGcpAccessToken: HTTPエラーで例外", async () => {
	const { pem } = await makeTestKeyPem();
	const fakeFetch = async () => ({
		ok: false,
		status: 401,
		text: async () => "bad",
	});
	await assert.rejects(
		() =>
			mintGcpAccessToken({
				clientEmail: "x",
				privateKey: pem,
				nowSec: 1,
				fetchImpl: fakeFetch,
			}),
		/GCP token HTTP 401/,
	);
});

test("mintGcpAccessToken: access_token不在で例外", async () => {
	const { pem } = await makeTestKeyPem();
	const fakeFetch = async () => ({ ok: true, json: async () => ({}) });
	await assert.rejects(
		() =>
			mintGcpAccessToken({
				clientEmail: "x",
				privateKey: pem,
				nowSec: 1,
				fetchImpl: fakeFetch,
			}),
		/access_token 不在/,
	);
});
