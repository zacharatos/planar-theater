import { GENERATED_DIR } from "./constants.mjs";
import { isImage, naturalSort, slugify } from "./util.mjs";

const FP = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;

export const loadImg = src => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`Could not load ${src}`));
  img.src = src;
});

/**
 * Ask the GM for a folder. Resolves { path, source }, or null if the picker
 * was closed without choosing (the macro used to hang forever in that case).
 */
export function pickFolder() {
  return new Promise(resolve => {
    const picker = new (FP())({
      type: "folder",
      callback: (path, fp) => resolve({ path, source: fp?.activeSource ?? "data" })
    });
    const close = picker.close.bind(picker);
    // Resolving twice is harmless, so a late "null" never beats a real choice.
    picker.close = async (...args) => {
      setTimeout(() => resolve(null), 150);
      return close(...args);
    };
    picker.render(true);
  });
}

export async function listImages(source, path) {
  const result = await FP().browse(source, path);
  return naturalSort((result.files ?? []).filter(isImage));
}

/** Upload a generated image into worlds/<world>/theater-generated/. Returns its path. */
export async function upload(source, blob, base) {
  const dir = `worlds/${game.world.id}/${GENERATED_DIR}`;
  try { await FP().browse(source, dir); } catch { await FP().createDirectory(source, dir); }
  const ext = blob.type === "image/png" ? "png" : "webp";
  const name = `${slugify(base)}-${foundry.utils.randomID(6)}.${ext}`;
  const res = await FP().upload(source, dir, new File([blob], name, { type: blob.type }), {}, { notify: false });
  if (res === false || res?.status === "error") throw new Error(res?.message ?? "Upload failed");
  return res?.path ?? `${dir}/${name}`;
}
