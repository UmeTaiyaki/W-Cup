/* 試合前 ご当地応援バトルのシェア画像生成（絵文字不使用）。
   国旗は flagcdn の長方形実画像(絵文字フラグ→ISO2変換)。読み込み/書き出し失敗時はコード入りチップへフォールバック。
   モチーフはSVG(Path2D)で描画。navigator.share 対応時は共有、非対応はPNGダウンロード。
   Babel前の普通の<script>で読み込み、window.WC.cheerShare に集約。 */
(() => {
	window.WC = window.WC || {};
	const W = 1080;
	const H = 1350;

	function roundRect(ctx, x, y, w, h, r) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	}
	function hexA(hex, a) {
		const h = hex.replace("#", "");
		return (
			"rgba(" +
			parseInt(h.slice(0, 2), 16) +
			"," +
			parseInt(h.slice(2, 4), 16) +
			"," +
			parseInt(h.slice(4, 6), 16) +
			"," +
			a +
			")"
		);
	}
	function shade(hex, amt) {
		const h = hex.replace("#", "");
		const r = parseInt(h.slice(0, 2), 16),
			g = parseInt(h.slice(2, 4), 16),
			b = parseInt(h.slice(4, 6), 16);
		const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
		return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")";
	}

	function loadImg(url) {
		return new Promise((res) => {
			if (!url) return res(null);
			const im = new Image();
			im.crossOrigin = "anonymous";
			im.onload = () => res(im);
			im.onerror = () => res(null);
			im.src = url;
		});
	}

	// 絵文字フラグ(地域指標2文字)→ISO3166-1 alpha-2。England等のタグ絵文字はnull。
	function isoFromEmojiFlag(em) {
		if (!em) return null;
		const cps = Array.from(em).map((c) => c.codePointAt(0));
		if (cps.length < 2) return null;
		const A = 0x1f1e6;
		const c1 = cps[0] - A,
			c2 = cps[1] - A;
		if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return null;
		return (
			String.fromCharCode(65 + c1) + String.fromCharCode(65 + c2)
		).toLowerCase();
	}
	// 地域指標で表せない構成国は flagcdn のサブディビジョンコードへ。
	const SPECIAL_ISO = {
		ENG: "gb-eng",
		SCO: "gb-sct",
		WAL: "gb-wls",
		NIR: "gb-nir",
	};
	// 全48カ国で「枠にハマった」長方形国旗を得る。flagcdn(3:2・CORS可)を使用。
	function flagImageUrl(code) {
		if (SPECIAL_ISO[code])
			return "https://flagcdn.com/w320/" + SPECIAL_ISO[code] + ".png";
		const tm = (window.WC.TEAM || {})[code] || {};
		const iso = isoFromEmojiFlag(tm.flag);
		return iso ? "https://flagcdn.com/w320/" + iso + ".png" : null;
	}

	// 国旗を長方形(3:2)の角丸フレームに収める。画像が無ければコード入りチップ。
	function drawFlag(ctx, img, cx, cy, fw, fh, code, theme) {
		const x = cx - fw / 2,
			y = cy - fh / 2,
			r = 16;
		ctx.save();
		roundRect(ctx, x, y, fw, fh, r);
		ctx.clip();
		if (img) {
			ctx.fillStyle = "#14161b";
			ctx.fillRect(x, y, fw, fh);
			const scale = Math.max(fw / img.width, fh / img.height);
			const w = img.width * scale,
				h = img.height * scale;
			ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
		} else {
			ctx.fillStyle = theme.accent;
			ctx.fillRect(x, y, fw, fh);
			ctx.fillStyle = "#0e1116";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = "900 " + fh * 0.4 + "px system-ui, sans-serif";
			ctx.fillText(code || "", cx, cy);
		}
		ctx.restore();
		ctx.save();
		roundRect(ctx, x, y, fw, fh, r);
		ctx.lineWidth = 3;
		ctx.strokeStyle = "rgba(255,255,255,0.28)";
		ctx.stroke();
		ctx.restore();
	}

	function draw(ctx, opts, images) {
		const { theme, a, b, side } = opts;
		const h2h = opts.h2h || { aWins: 0, draws: 0, bWins: 0, total: 0 };
		const cols = theme.colors;
		const drawShape = window.WC.cheerTheme.drawShape;
		const shapes = theme.shapes || ["star"];

		// 背景
		const bg = ctx.createLinearGradient(0, 0, W, H);
		bg.addColorStop(0, "#0e1116");
		bg.addColorStop(0.5, shade(cols[0], -0.5));
		bg.addColorStop(1, "#0e1116");
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, W, H);

		// 放射光
		if (theme.rays) {
			ctx.save();
			ctx.translate(W / 2, 360);
			for (let i = 0; i < 36; i++) {
				ctx.rotate((Math.PI * 2) / 36);
				ctx.fillStyle = i % 2 === 0 ? hexA(theme.accent, 0.08) : "transparent";
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(W, -55);
				ctx.lineTo(W, 55);
				ctx.closePath();
				ctx.fill();
			}
			ctx.restore();
		}

		// 薄いモチーフ散らし（SVG形状）
		ctx.globalAlpha = 0.1;
		for (let i = 0; i < 16; i++) {
			const name = shapes[i % shapes.length];
			const col = cols[i % cols.length];
			drawShape(
				ctx,
				name,
				((i * 173) % (W - 120)) + 60,
				((i * 251) % (H - 200)) + 120,
				46,
				col,
			);
		}
		ctx.globalAlpha = 1;

		ctx.textAlign = "center";
		ctx.textBaseline = "alphabetic";
		// ヘッダ
		ctx.fillStyle = theme.accent;
		ctx.font = "700 34px system-ui, sans-serif";
		ctx.fillText("FIFA WORLD CUP 2026", W / 2, 108);
		if (opts.roundLabel) {
			ctx.fillStyle = "rgba(255,255,255,0.6)";
			ctx.font = "700 26px system-ui, sans-serif";
			ctx.fillText(opts.roundLabel, W / 2, 150);
		}

		// 国旗（3:2の長方形フレームにスポッと収める）
		drawFlag(ctx, images.a, W * 0.28, 320, 210, 140, a.code, theme);
		drawFlag(ctx, images.b, W * 0.72, 320, 210, 140, b.code, theme);
		ctx.fillStyle = "rgba(255,255,255,0.5)";
		ctx.font = "800 46px system-ui, sans-serif";
		ctx.fillText("VS", W / 2, 335);
		// コード
		ctx.fillStyle = "#fff";
		ctx.font = "900 40px system-ui, sans-serif";
		ctx.fillText(a.code || a.label || "", W * 0.28, 450);
		ctx.fillText(b.code || b.label || "", W * 0.72, 450);

		// 国文字（cry）
		ctx.save();
		ctx.shadowColor = theme.accent;
		ctx.shadowBlur = 28;
		ctx.fillStyle = "#ffffff";
		ctx.font = "900 84px system-ui, sans-serif";
		ctx.fillText(theme.cry, W / 2, 620);
		ctx.restore();

		// バー（通算W-D-L: a勝 / 分 / b勝）
		const total = Math.max(1, h2h.total);
		const aR = h2h.aWins / total;
		const dR = h2h.draws / total;
		const barX = 130,
			barY = 720,
			barW = W - 260,
			barH = 44;
		ctx.save();
		roundRect(ctx, barX, barY, barW, barH, barH / 2);
		ctx.clip();
		ctx.fillStyle = "#1b1e24";
		ctx.fillRect(barX, barY, barW, barH);
		ctx.fillStyle = "#ff3b6b";
		ctx.fillRect(barX, barY, barW * aR, barH);
		ctx.fillStyle = "#5b606b";
		ctx.fillRect(barX + barW * aR, barY, barW * dR, barH);
		ctx.fillStyle = "#5b82e6";
		ctx.fillRect(barX + barW * (aR + dR), barY, barW * (1 - aR - dR), barH);
		ctx.restore();
		// 数値（コードのみ・絵文字なし）
		ctx.fillStyle = "#ff7a96";
		ctx.textAlign = "left";
		ctx.font = "800 36px system-ui, sans-serif";
		ctx.fillText((a.code || "") + " " + h2h.aWins + "勝", barX, barY + 92);
		ctx.fillStyle = "#cfd3da";
		ctx.textAlign = "center";
		ctx.fillText(h2h.draws + "分", barX + barW / 2, barY + 92);
		ctx.fillStyle = "#a9c4ff";
		ctx.textAlign = "right";
		ctx.fillText(h2h.bWins + "勝 " + (b.code || ""), barX + barW, barY + 92);

		// 推しバッジ（星SVG＋テキスト）
		const my = side === "home" ? a : b;
		ctx.textAlign = "center";
		ctx.font = "800 40px system-ui, sans-serif";
		const label = "あなたは " + (my.code || "") + " を応援";
		const lw = ctx.measureText(label).width;
		const bw = lw + 130;
		const bx = (W - bw) / 2,
			by = 900;
		roundRect(ctx, bx, by, bw, 86, 43);
		ctx.fillStyle = hexA(theme.accent, 0.16);
		ctx.fill();
		ctx.lineWidth = 2;
		ctx.strokeStyle = hexA(theme.accent, 0.55);
		ctx.stroke();
		drawShape(ctx, "star", bx + 50, by + 43, 38, theme.accent);
		ctx.fillStyle = theme.accent;
		ctx.textAlign = "left";
		ctx.fillText(label, bx + 78, by + 56);

		// フッタ
		ctx.textAlign = "center";
		ctx.fillStyle = theme.accent;
		ctx.font = "800 34px system-ui, sans-serif";
		ctx.fillText(
			"#W杯予想  #" + (my.code || "WorldCup") + "  #WorldCup2026",
			W / 2,
			1240,
		);
		ctx.fillStyle = "rgba(255,255,255,0.45)";
		ctx.font = "600 28px system-ui, sans-serif";
		ctx.fillText("wcup2026 · あなたの応援が世界に届く", W / 2, 1284);
	}

	function render(opts, images) {
		const canvas = document.createElement("canvas");
		canvas.width = W;
		canvas.height = H;
		const ctx = canvas.getContext("2d");
		draw(ctx, opts, images);
		return new Promise((resolve) => {
			try {
				canvas.toBlob((b) => resolve(b), "image/png");
			} catch (e) {
				resolve(null); // 汚染キャンバス等
			}
		});
	}

	// opts: { a, b, side, h2h, roundLabel }
	async function share(opts) {
		try {
			const my = opts.side === "home" ? opts.a : opts.b;
			const theme = window.WC.cheerTheme.get(my.code, my);
			const o = Object.assign({ theme: theme }, opts);
			// 全48カ国で長方形国旗が「枠にハマる」よう flagcdn を使用。失敗時はチップ。
			const [ia, ib] = await Promise.all([
				loadImg(flagImageUrl(opts.a.code)),
				loadImg(flagImageUrl(opts.b.code)),
			]);
			let blob = await render(o, { a: ia, b: ib });
			if (!blob) blob = await render(o, { a: null, b: null }); // 書き出し失敗→チップ描画で再試行
			if (!blob) return;
			const file = new File([blob], "cheer.png", { type: "image/png" });

			// アプリURLも一緒に共有（現在のオリジン＝本番なら本番URL）。
			// url と text の両方に入れると LINE 等が両方連結しリンクが重複するため、
			// text に1回だけ含め、url フィールドは設定しない。
			const appUrl = (typeof location !== "undefined" && location.origin) || "";
			const text = theme.cry + " #WorldCup2026" + (appUrl ? "\n" + appUrl : "");
			if (navigator.canShare && navigator.canShare({ files: [file] })) {
				await navigator.share({
					files: [file],
					title: theme.cry,
					text: text,
				});
				return;
			}
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "cheer.png";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (e) {
			/* 失敗は黙ってスキップ */
		}
	}

	window.WC.cheerShare = { share: share };
})();
