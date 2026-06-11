/* 試合前 ご当地応援バトルのシェア画像生成（絵文字不使用）。
   国旗は実画像(teamLogo)。CORS等で書き出せない場合はコード入りチップへフォールバック。
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

	function drawFlag(ctx, img, cx, cy, size, code, theme) {
		const x = cx - size / 2,
			y = cy - size / 2,
			r = size * 0.18;
		ctx.save();
		roundRect(ctx, x, y, size, size, r);
		ctx.clip();
		if (img) {
			ctx.fillStyle = "#14161b";
			ctx.fillRect(x, y, size, size);
			const scale = Math.max(size / img.width, size / img.height);
			const w = img.width * scale,
				h = img.height * scale;
			ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
		} else {
			ctx.fillStyle = theme.accent;
			ctx.fillRect(x, y, size, size);
			ctx.fillStyle = "#0e1116";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = "900 " + size * 0.3 + "px system-ui, sans-serif";
			ctx.fillText(code || "", cx, cy);
		}
		ctx.restore();
		ctx.save();
		roundRect(ctx, x, y, size, size, r);
		ctx.lineWidth = 3;
		ctx.strokeStyle = "rgba(255,255,255,0.28)";
		ctx.stroke();
		ctx.restore();
	}

	function draw(ctx, opts, images) {
		const { theme, a, b, counts, side } = opts;
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

		// 国旗
		drawFlag(ctx, images.a, W * 0.28, 320, 180, a.code, theme);
		drawFlag(ctx, images.b, W * 0.72, 320, 180, b.code, theme);
		ctx.fillStyle = "rgba(255,255,255,0.5)";
		ctx.font = "800 46px system-ui, sans-serif";
		ctx.fillText("VS", W / 2, 335);
		// コード
		ctx.fillStyle = "#fff";
		ctx.font = "900 40px system-ui, sans-serif";
		ctx.fillText(a.code || a.label || "", W * 0.28, 460);
		ctx.fillText(b.code || b.label || "", W * 0.72, 460);

		// 国文字（cry）
		ctx.save();
		ctx.shadowColor = theme.accent;
		ctx.shadowBlur = 28;
		ctx.fillStyle = "#ffffff";
		ctx.font = "900 84px system-ui, sans-serif";
		ctx.fillText(theme.cry, W / 2, 620);
		ctx.restore();

		// バー
		const total = Math.max(1, counts.home + counts.away);
		const homeR = counts.home / total;
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
		ctx.fillRect(barX, barY, barW * homeR, barH);
		ctx.fillStyle = "#5b82e6";
		ctx.fillRect(barX + barW * homeR, barY, barW * (1 - homeR), barH);
		ctx.restore();
		// 数値（コードのみ・絵文字なし）
		ctx.fillStyle = "#ff7a96";
		ctx.textAlign = "left";
		ctx.font = "800 36px system-ui, sans-serif";
		ctx.fillText(
			Math.round(homeR * 100) + "%  " + (a.code || "") + " " + counts.home,
			barX,
			barY + 92,
		);
		ctx.fillStyle = "#a9c4ff";
		ctx.textAlign = "right";
		ctx.fillText(
			counts.away +
				" " +
				(b.code || "") +
				"  " +
				Math.round((1 - homeR) * 100) +
				"%",
			barX + barW,
			barY + 92,
		);

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

	// opts: { a, b, side, counts, roundLabel }
	async function share(opts) {
		try {
			const my = opts.side === "home" ? opts.a : opts.b;
			const theme = window.WC.cheerTheme.get(my.code, my);
			const o = Object.assign({ theme: theme }, opts);
			const logo = window.WC.teamLogo || (() => null);
			const [ia, ib] = await Promise.all([
				loadImg(logo(opts.a.code)),
				loadImg(logo(opts.b.code)),
			]);
			let blob = await render(o, { a: ia, b: ib });
			if (!blob) blob = await render(o, { a: null, b: null }); // 書き出し失敗→チップ描画で再試行
			if (!blob) return;
			const file = new File([blob], "cheer.png", { type: "image/png" });

			if (navigator.canShare && navigator.canShare({ files: [file] })) {
				await navigator.share({
					files: [file],
					title: theme.cry,
					text: theme.cry + " #WorldCup2026",
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
