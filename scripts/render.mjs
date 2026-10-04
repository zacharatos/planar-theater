// Canvas 2D rendering of NPC cards and title cards. Returns image Blobs;
// uploading is done by the caller (files.mjs).
import { FONT, GOLD } from "./constants.mjs";
import { cardLayout, splitTitle, titleBox } from "./util.mjs";

const toBlob = canvas => new Promise(resolve => canvas.toBlob(blob => {
  if (blob) return resolve(blob);
  canvas.toBlob(png => resolve(png), "image/png");
}, "image/webp", 0.92));

function fitFont(ctx, text, weight, size, maxWidth) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${FONT}`; s--; } while (ctx.measureText(text).width > maxWidth && s > 10);
}

/**
 * Framed portrait with a name plate. With `hidden` the plate shows a blurred
 * smear of the name behind a gold "?", so players never read it.
 * @returns {{blob: Blob, w: number, h: number}}
 */
export async function renderCard({ img, name, hidden = false, rect }) {
  const L = cardLayout(img.naturalWidth, img.naturalHeight, rect);
  const { SH, PAD, NAME, pw, ph, cw, ch, w, h, k } = L;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
  const ctx = canvas.getContext("2d");
  ctx.scale(k, k);
  ctx.imageSmoothingQuality = "high";
  const x0 = SH, y0 = SH;

  // card body with drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#0f0d13";
  ctx.beginPath(); ctx.roundRect(x0, y0, cw, ch, 10); ctx.fill();
  ctx.restore();

  // portrait, with a soft darkening toward the name plate
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x0 + PAD, y0 + PAD, pw, ph, 6); ctx.clip();
  ctx.drawImage(img, x0 + PAD, y0 + PAD, pw, ph);
  const g = ctx.createLinearGradient(0, y0 + PAD + ph * 0.72, 0, y0 + PAD + ph);
  g.addColorStop(0, "rgba(15,13,19,0)"); g.addColorStop(1, "rgba(15,13,19,.55)");
  ctx.fillStyle = g; ctx.fillRect(x0 + PAD, y0 + PAD, pw, ph);
  ctx.restore();

  // frame lines
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(x0 + 1.25, y0 + 1.25, cw - 2.5, ch - 2.5, 10); ctx.stroke();
  ctx.strokeStyle = "rgba(201,161,78,.45)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x0 + PAD - 4, y0 + PAD - 4, pw + 8, ph + 8, 8); ctx.stroke();

  // name plate
  const ny = y0 + PAD + ph + NAME / 2 + 3, cx = x0 + cw / 2;
  const diamonds = half => {
    ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = GOLD;
    for (const dx of [-half, half]) {
      ctx.save(); ctx.translate(cx + dx, ny); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    }
    ctx.restore();
  };
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (hidden) {
    if (name && "filter" in ctx) {
      ctx.save();
      fitFont(ctx, name, 600, 32, cw - 2 * PAD - 40);
      ctx.filter = "blur(9px)"; ctx.globalAlpha = 0.5; ctx.fillStyle = "#f2e5c4";
      ctx.fillText(name, cx, ny);
      ctx.restore();
    }
    ctx.save();
    ctx.font = `600 34px ${FONT}`;
    ctx.shadowColor = "rgba(0,0,0,.9)"; ctx.shadowBlur = 8;
    ctx.fillStyle = GOLD; ctx.fillText("?", cx, ny);
    ctx.restore();
    diamonds(30);
  } else if (name) {
    fitFont(ctx, name, 600, 32, cw - 2 * PAD - 40);
    ctx.shadowColor = "rgba(0,0,0,.85)"; ctx.shadowBlur = 6;
    ctx.fillStyle = "#f2e5c4";
    ctx.fillText(name, cx, ny);
    diamonds(ctx.measureText(name).width / 2 + 16);
  }
  return { blob: await toBlob(canvas), w, h };
}

/** Bottom-of-screen title card: "Main line | small line". */
export async function renderTitle({ text, rect }) {
  const { width: W, height: H } = titleBox(rect);
  const k = 1.5;
  const { main, sub } = splitTitle(text);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);
  const ctx = canvas.getContext("2d");
  ctx.scale(k, k);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(0.55, "rgba(0,0,0,.5)"); bg.addColorStop(1, "rgba(0,0,0,.8)");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const mainSize = Math.round(H * 0.30), subSize = Math.round(H * 0.14);
  const yMain = sub ? H * 0.58 : H * 0.68;
  fitFont(ctx, main, 600, mainSize, W * 0.88);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(mainSize * 0.05)}px`;
  const tg = ctx.createLinearGradient(0, yMain - mainSize, 0, yMain);
  tg.addColorStop(0, "#fbf0d2"); tg.addColorStop(1, "#d6ac5e");
  ctx.shadowColor = "rgba(0,0,0,.9)"; ctx.shadowBlur = 14;
  ctx.fillStyle = tg; ctx.fillText(main, W / 2, yMain);

  const rule = (y, halfGap) => {
    const len = Math.min(170, W * 0.1);
    ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(214,172,94,.85)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - halfGap - len, y); ctx.lineTo(W / 2 - halfGap, y);
    ctx.moveTo(W / 2 + halfGap, y); ctx.lineTo(W / 2 + halfGap + len, y);
    ctx.stroke(); ctx.restore();
  };
  if (sub) {
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(subSize * 0.08)}px`;
    fitFont(ctx, sub, "italic 400", subSize, W * 0.6);
    ctx.shadowBlur = 8; ctx.fillStyle = "#ece0c4";
    const ySub = yMain + subSize * 1.7;
    ctx.fillText(sub, W / 2, ySub);
    rule(ySub - subSize * 0.35, ctx.measureText(sub).width / 2 + subSize * 0.8);
  } else {
    rule(yMain + mainSize * 0.45, 0);
  }
  return toBlob(canvas);
}
