// YouTube URL / 生ID から videoId を抽出する純粋関数（試合ハイライト手動登録 Phase1）。
// 手書き正規表現の取りこぼしを避けるため URL API でパースし、host/path で形式判別する。
// videoId は YouTube 仕様の 11 文字 [A-Za-z0-9_-]。該当しなければ null。

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// YouTube のホスト判定（www. / m. / music. などサブドメインを許容）。
function isYoutubeHost(host) {
	const h = host.toLowerCase();
	return (
		h === "youtube.com" ||
		h.endsWith(".youtube.com") ||
		h === "youtu.be" ||
		h.endsWith(".youtu.be")
	);
}

// 11文字IDとして妥当なら返す。そうでなければ null。
function asVideoId(candidate) {
	return candidate && VIDEO_ID_RE.test(candidate) ? candidate : null;
}

// 各種 YouTube URL もしくは生の videoId を受け取り、videoId を返す。抽出不能は null。
export function parseYoutubeId(input) {
	if (typeof input !== "string") return null;
	const raw = input.trim();
	if (!raw) return null;

	// 生の11文字ID直入力（URLでない）
	if (asVideoId(raw)) return raw;

	// スキーム無しでも URL として解釈できるよう補完
	const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
	let u;
	try {
		u = new URL(withScheme);
	} catch {
		return null;
	}
	if (!isYoutubeHost(u.hostname)) return null;

	const host = u.hostname.toLowerCase();
	const segments = u.pathname.split("/").filter(Boolean);

	// youtu.be/<id>
	if (host === "youtu.be" || host.endsWith(".youtu.be")) {
		return asVideoId(segments[0]);
	}

	// youtube.com/watch?v=<id>
	const v = u.searchParams.get("v");
	if (v) return asVideoId(v);

	// youtube.com/embed/<id> | /shorts/<id> | /v/<id>
	if (segments.length >= 2 && ["embed", "shorts", "v"].includes(segments[0])) {
		return asVideoId(segments[1]);
	}

	return null;
}
