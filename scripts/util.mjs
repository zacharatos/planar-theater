// Pure helpers: no Foundry globals, so they can be unit-tested with plain Node.
import { IMG, BAND, CARD, NPC, TITLE_HEIGHT, MODULE_ID } from "./constants.mjs";

export const isImage = path => IMG.test(String(path));

export const naturalSort = list =>
  [...list].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/** "worlds/x/03 - The%20Mortuary.webp" -> "The Mortuary" */
export function labelFromPath(src) {
  let name = String(src).split("/").pop();
  try { name = decodeURIComponent(name); } catch { /* keep the raw name */ }
  return name.replace(/\.[^.]+$/, "").replace(/^\d+\s*[-_.]\s*/, "");
}

/** Safe ASCII file-name stem. Falls back to "img" for e.g. all-Greek names. */
export function slugify(base) {
  return String(base).normalize("NFD").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "img";
}

/** Largest size that fits (iw x ih) inside (rw x rh), aspect preserved. */
export function containFit(iw, ih, rw, rh) {
  const s = Math.min(rw / iw, rh / ih);
  return { width: Math.round(iw * s), height: Math.round(ih * s) };
}

export function centerIn(rect, width, height) {
  return {
    left: rect.x + Math.round((rect.width - width) / 2),
    top: rect.y + Math.round((rect.height - height) / 2)
  };
}

/** Where an NPC card sits: against the left or right edge, a little above centre. */
export function npcPosition(rect, width, height, side) {
  const margin = Math.round(rect.width * NPC.margin);
  const left = side === "left" ? rect.x + margin : rect.x + rect.width - margin - width;
  const top = Math.max(rect.y, rect.y + Math.round((rect.height - height) / 2 - rect.height * NPC.lift));
  return { left, top, width, height };
}

/** Horizontal slide distance for an NPC entering/leaving on `side`. */
export const npcSlide = (rect, side) => Math.round(rect.width * NPC.slide) * (side === "left" ? -1 : 1);

/** Smooth start and stop for fades and slides; p runs 0..1 and is clamped. */
export const easeInOut = p => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

/** Tile values at progress p of a fade { a0 -> a1 } with an optional slide { x0 -> x1 }. */
export function tweenTile(e, p) {
  const k = easeInOut(p);
  const out = { alpha: e.a0 + (e.a1 - e.a0) * k };
  if (e.x0 != null) out.x = Math.round(e.x0 + (e.x1 - e.x0) * k);
  return out;
}

/** Sizes of a generated NPC card (portrait + frame + name plate) for a given image. */
export function cardLayout(iw, ih, rect) {
  const { shadow: SH, pad: PAD, plate: NAME } = CARD;
  const maxW = rect.width * CARD.maxWidth, maxH = rect.height * CARD.maxHeight;
  const s = Math.min((maxW - 2 * SH - 2 * PAD) / iw, (maxH - 2 * SH - 2 * PAD - NAME) / ih);
  const pw = Math.round(iw * s), ph = Math.round(ih * s);
  const cw = pw + 2 * PAD, ch = ph + 2 * PAD + NAME;
  return { SH, PAD, NAME, s, pw, ph, cw, ch, w: cw + 2 * SH, h: ch + 2 * SH, k: Math.min(2, Math.max(1, 1 / s)) };
}

export function titleBox(rect) {
  const height = Math.round(rect.height * TITLE_HEIGHT);
  return { left: rect.x, top: rect.y + rect.height - height, width: rect.width, height };
}

/** "Main line | small line" -> { main, sub } */
export function splitTitle(text) {
  const parts = String(text ?? "").split("|").map(s => s.trim()).filter(Boolean);
  return { main: parts[0] ?? "", sub: parts[1] };
}

export const alternateSide = order => (order % 2 === 0 ? "right" : "left");

export const nextOrder = orders => orders.reduce((m, o) => Math.max(m, (o ?? 0) + 1), 0);
export const nextSort = (kind, sorts) => Math.max(BAND[kind], ...sorts.map(s => s ?? 0)) + 1;

/**
 * Sort players into who confirmed a preload, who didn't answer, and who answered with load failures.
 * @param {{id: string, name: string}[]} recipients  connected players the request was sent to
 * @param {Map<string, {images?: number, sounds?: number, failed?: string[]}>} acks  replies by user id
 */
export function summarizeAcks(recipients, acks) {
  const ok = [], missing = [], failed = [];
  for (const user of recipients) {
    const ack = acks.get(user.id);
    if (!ack) missing.push(user.name);
    else if (ack.failed?.length) failed.push(user.name);
    else ok.push(user.name);
  }
  return { ok, missing, failed };
}

/** Players (not GMs) among `users` who are connected but not viewing `sceneId`. */
export const playersNotViewing = (users, sceneId) =>
  users.filter(u => u.active && !u.isGM && u.viewedScene !== sceneId);

// ---- tile flag access ----------------------------------------------------
export const metaOf = tile => tile?.flags?.[MODULE_ID];
export const kindOf = tile => metaOf(tile)?.kind ?? "place";
export const nameOf = tile => {
  const m = metaOf(tile) ?? {};
  return kindOf(tile) === "npc" ? (m.name ?? m.label) : (m.label ?? tile.name ?? "");
};

// ---- migration from the original macro -----------------------------------
export const legacyMetaOf = tile => tile?.flags?.world?.theater;
export const needsMigration = tile => !!legacyMetaOf(tile) && !metaOf(tile);
/** The macro and the module share the same data shape; only the flag scope moved. */
export const convertLegacyMeta = legacy => JSON.parse(JSON.stringify(legacy));
