// Lighter images: a heavy image (a 2–3 MB PNG place, a big portrait) is re-drawn in the GM's
// browser as a WebP copy, uploaded to worlds/<world>/theater-optimized/, and used instead of the
// original. The original file is never touched. Every player downloads every image of the scene
// when it is drawn, so this is what keeps joins and scene changes light on the server.
import { MODULE_ID, OPTIMIZE, OPTIMIZED_DIR } from "./constants.mjs";
import { loadImg, uploadAs } from "./files.mjs";
import { fitWithin, needsOptimizing, worthReplacing, optimizedName, toURL } from "./util.mjs";

const sameOrigin = path => !/^https?:/i.test(path) || new URL(path).origin === location.origin;

/** Size of a file on the server in bytes, or null if the server doesn't say. */
export async function fileSize(path) {
  if (!sameOrigin(path)) return null;
  const url = toURL(path);
  try {
    const head = await fetch(url, { method: "HEAD" });
    const len = Number(head.headers.get("content-length"));
    if (head.ok && Number.isFinite(len) && len > 0) return len;
    // Compressed or chunked replies may leave the length out: ask for one byte and read the total.
    const one = await fetch(url, { headers: { Range: "bytes=0-0" } });
    const total = Number(one.headers.get("content-range")?.split("/")[1]);
    one.body?.cancel?.();
    return Number.isFinite(total) && total > 0 ? total : null;
  } catch { return null; }
}

/** Draw an image to a canvas no larger than OPTIMIZE.maxSide and encode it as WebP. */
export async function toWebp(path) {
  const img = await loadImg(toURL(path));
  const size = fitWithin(img.naturalWidth, img.naturalHeight, OPTIMIZE.maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, size.width, size.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", OPTIMIZE.quality));
  if (!blob || blob.type !== "image/webp") throw new Error("This browser can't encode WebP");
  return { blob, ...size };
}

/**
 * Make a lighter copy of one image.
 * @returns {Promise<{from, to, before, after}|{from, skipped: "light"|"noGain"|"external"}>}
 */
export async function optimizeImage(path, { source = "data", force = false } = {}) {
  if (!sameOrigin(path)) return { from: path, skipped: "external" };
  const before = await fileSize(path);
  if (!force && !needsOptimizing(path, before)) return { from: path, skipped: "light" };
  const { blob } = await toWebp(path);
  if (!worthReplacing(before, blob.size)) return { from: path, skipped: "noGain" };
  const to = await uploadAs(source, `worlds/${game.world.id}/${OPTIMIZED_DIR}`, optimizedName(path), blob);
  return { from: path, to, before, after: blob.size };
}

/**
 * Optimize a list of images one at a time (each is drawn and uploaded by the GM's browser).
 * onProgress(done, total) is called after each. Failures are logged and skipped.
 * @returns {Promise<{map: Map<string,string>, before: number, after: number, skipped: number, failed: string[]}>}
 */
export async function optimizeMany(paths, { source = "data", force = false, onProgress } = {}) {
  const map = new Map();
  const out = { map, before: 0, after: 0, skipped: 0, failed: [] };
  let done = 0;
  for (const path of [...new Set(paths)].filter(Boolean)) {
    try {
      const r = await optimizeImage(path, { source, force });
      if (r.to) { map.set(path, r.to); out.before += r.before ?? 0; out.after += r.after; }
      else out.skipped++;
    } catch (err) {
      console.warn(`${MODULE_ID} | could not optimize`, path, err);
      out.failed.push(path);
    }
    onProgress?.(++done, paths.length);
  }
  return out;
}
