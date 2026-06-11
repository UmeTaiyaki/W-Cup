/* 試合前 ご当地応援バトルのシェア画像生成。
   ご当地演出（色・モチーフ・放射光）＋国文字＋応援バトル比率を縦型カードに描画し、
   navigator.share（ファイル対応時）で共有、非対応なら PNG ダウンロードへフォールバック。
   Babel前の普通の<script>で読み込み、window.WC.cheerShare に集約。 */
(() => {
	window.WC = window.WC || {};
	const W = 1080;
	const H = 1350;

	function flagEmoji(code) {
		const tm = (window.WC.TEAM || {})[code] || {};
		return tm.flag || "🏳️";
	}

	function roundRect(ctx, x, y, w, h, r) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	}

	// メインの描画。theme は cheerTheme.get の戻り。
	function draw(ctx, opts) {
		const { theme, a, b, counts, side } = opts;
		const cols = theme.colors;

		// 背景グラデ
		const bg = ctx.createLinearGradient(0, 0, W, H);
		bg.addColorStop(0, "#0e1116");
		bg.addColorStop(0.5, shade(cols[0], -0.55));
		bg.addColorStop(1, "#0e1116");
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, W, H);

		// 放射光（rays）
		if (theme.rays) {
			ctx.save();
			ctx.translate(W / 2, H * 0.42);
			for (let i = 0; i < 36; i++) {
				ctx.rotate((Math.PI * 2) / 36);
				ctx.fillStyle = i % 2 === 0 ? hexA(theme.accent, 0.1) : "transparent";
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(W, -60);
				ctx.lineTo(W, 60);
				ctx.closePath();
				ctx.fill();
			}
			ctx.restore();
		}

		// 薄いモチーフ散らし
		ctx.globalAlpha = 0.12;
		ctx.font = "70px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji'";
		const motifs = theme.motifs || ["⚽"];
		for (let i = 0; i < 14; i++) {
			const m = motifs[i % motifs.length];
			ctx.fillText(
				m,
				((i * 137) % (W - 80)) + 10,
				((i * 211) % (H - 120)) + 90,
			);
		}
		ctx.globalAlpha = 1;

		// 上部ラベル
		ctx.textAlign = "center";
		ctx.fillStyle = theme.accent;
		ctx.font = "700 34px system-ui, sans-serif";
		ctx.fillText("FIFA WORLD CUP 2026", W / 2, 110);
		ctx.fillStyle = "rgba(255,255,255,0.65)";
		ctx.font = "700 26px system-ui, sans-serif";
		ctx.fillText(opts.roundLabel || "", W / 2, 152);

		// 両国旗
		ctx.font = "150px 'Apple Color Emoji', 'Segoe UI Emoji', system-ui";
		ctx.fillText(flagEmoji(a.code), W * 0.27, 400);
		ctx.fillText(flagEmoji(b.code), W * 0.73, 400);
		ctx.fillStyle = "rgba(255,255,255,0.55)";
		ctx.font = "800 44px system-ui, sans-serif";
		ctx.fillText("VS", W / 2, 360);
		// コード
		ctx.fillStyle = "#fff";
		ctx.font = "900 40px system-ui, sans-serif";
		ctx.fillText(a.code || a.label || "", W * 0.27, 470);
		ctx.fillText(b.code || b.label || "", W * 0.73, 470);

		// 国文字（cry）— 応援している側のテーマ色でグロー
		ctx.save();
		ctx.shadowColor = theme.accent;
		ctx.shadowBlur = 30;
		ctx.fillStyle = "#ffffff";
		ctx.font = "900 92px system-ui, sans-serif";
		ctx.fillText(theme.cry, W / 2, 640);
		ctx.restore();

		// 応援バトルバー
		const total = Math.max(1, counts.home + counts.away);
		const homeR = counts.home / total;
		const barX = 120,
			barY = 760,
			barW = W - 240,
			barH = 46;
		roundRect(ctx, barX, barY, barW, barH, barH / 2);
		ctx.fillStyle = "#1b1e24";
		ctx.fill();
		ctx.save();
		roundRect(ctx, barX, barY, barW, barH, barH / 2);
		ctx.clip();
		ctx.fillStyle = "#ff3b6b";
		ctx.fillRect(barX, barY, barW * homeR, barH);
		ctx.fillStyle = "#5b82e6";
		ctx.fillRect(barX + barW * homeR, barY, barW * (1 - homeR), barH);
		ctx.restore();
		// パーセント＆数
		ctx.fillStyle = "#ff7a96";
		ctx.textAlign = "left";
		ctx.font = "800 38px system-ui, sans-serif";
		ctx.fillText(
			Math.round(homeR * 100) + "%  " + flagEmoji(a.code) + " " + counts.home,
			barX,
			barY + 100,
		);
		ctx.fillStyle = "#a9c4ff";
		ctx.textAlign = "right";
		ctx.fillText(
			counts.away +
				" " +
				flagEmoji(b.code) +
				"  " +
				Math.round((1 - homeR) * 100) +
				"%",
			barX + barW,
			barY + 100,
		);

		// 推しバッジ
		const my = side === "home" ? a : b;
		const badge = "★ あなたは " + flagEmoji(my.code) + " を応援";
		ctx.textAlign = "center";
		ctx.font = "800 40px system-ui, sans-serif";
		const bw = ctx.measureText(badge).width + 80;
		roundRect(ctx, (W - bw) / 2, 960, bw, 84, 42);
		ctx.fillStyle = hexA(theme.accent, 0.16);
		ctx.fill();
		ctx.strokeStyle = hexA(theme.accent, 0.6);
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.fillStyle = theme.accent;
		ctx.fillText(badge, W / 2, 1015);

		// 下部 ハッシュタグ＋アプリ名
		ctx.fillStyle = theme.accent;
		ctx.font = "800 34px system-ui, sans-serif";
		ctx.fillText(
			"#W杯予想  #" + (my.code || "WorldCup") + "  #WorldCup2026",
			W / 2,
			1230,
		);
		ctx.fillStyle = "rgba(255,255,255,0.45)";
		ctx.font = "600 28px system-ui, sans-serif";
		ctx.fillText("wcup2026 · あなたの応援が世界に届く", W / 2, 1275);
	}

	function hexA(hex, a) {
		const h = hex.replace("#", "");
		const r = parseInt(h.substring(0, 2), 16),
			g = parseInt(h.substring(2, 4), 16),
			b = parseInt(h.substring(4, 6), 16);
		return "rgba(" + r + "," + g + "," + b + "," + a + ")";
	}
	function shade(hex, amt) {
		const h = hex.replace("#", "");
		let r = parseInt(h.substring(0, 2), 16),
			g = parseInt(h.substring(2, 4), 16),
			b = parseInt(h.substring(4, 6), 16);
		r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
		g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
		b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
		return "rgb(" + r + "," + g + "," + b + ")";
	}

	function toBlob(canvas) {
		return new Promise((resolve) => {
			canvas.toBlob((b) => {
				resolve(b);
			}, "image/png");
		});
	}

	// 共有のエントリ。opts: { a, b, side, counts, roundLabel }
	async function share(opts) {
		try {
			const theme = window.WC.cheerTheme.get(
				(opts.side === "home" ? opts.a : opts.b).code,
				opts.side === "home" ? opts.a : opts.b,
			);
			const canvas = document.createElement("canvas");
			canvas.width = W;
			canvas.height = H;
			const ctx = canvas.getContext("2d");
			draw(ctx, Object.assign({ theme: theme }, opts));
			const blob = await toBlob(canvas);
			const file = new File([blob], "cheer.png", { type: "image/png" });

			if (navigator.canShare && navigator.canShare({ files: [file] })) {
				await navigator.share({
					files: [file],
					title: theme.cry,
					text: theme.cry + " #WorldCup2026",
				});
				return;
			}
			// フォールバック：ダウンロード
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "cheer.png";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			setTimeout(() => {
				URL.revokeObjectURL(url);
			}, 1000);
		} catch (e) {
			/* 共有失敗は黙ってスキップ（ユーザー操作で再試行可能） */
		}
	}

	window.WC.cheerShare = { share: share };
})();
