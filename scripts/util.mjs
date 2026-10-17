// Pure helpers: no Foundry globals, so they can be unit-tested with plain Node.
import {
  IMG, BAND, CARD, NPC, TITLE_HEIGHT, MODULE_ID, OPTIMIZE, HEAVY_AUDIO_BYTES, HEAVY_VIDEO_BYTES, OVERLAY_MODES, OVERLAY_FX
} from "./constants.mjs";

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

/* ---------- optimizing images ------------------------------------------------ */

/** Size that fits inside a max x max square, never enlarged. */
export function fitWithin(width, height, max) {
  const s = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)), scaled: s < 1 };
}

/** Short, stable hash of a string (djb2, base 36). */
export function hash36(text) {
  let h = 5381;
  for (const ch of String(text)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}

/** Name of the optimized copy: the original's name plus a hash of its full path, as .webp. */
export function optimizedName(path) {
  const stem = String(path).split(/[?#]/)[0].split("/").pop().replace(/\.[^.]+$/, "");
  let readable = stem;
  try { readable = decodeURIComponent(stem); } catch { /* keep the raw name */ }
  return `${slugify(readable).slice(0, 60)}-${hash36(path)}.webp`;
}

const LOSSLESS = /\.(png|bmp|tiff?)(\?.*)?$/i;

/** Should this image get a lighter WebP copy? bytes = size on the server, if known. */
export function needsOptimizing(path, bytes = null, limits = OPTIMIZE) {
  const p = String(path ?? "");
  if (!isImage(p.split("?")[0]) || /\.(gif|svg)(\?.*)?$/i.test(p)) return false; // gifs may move; svgs are tiny
  if (!Number.isFinite(bytes)) return LOSSLESS.test(p);
  return bytes > limits.heavyBytes || (LOSSLESS.test(p) && bytes > limits.pngBytes);
}

/** Keep the copy only if it is clearly smaller. */
export const worthReplacing = (before, after, limits = OPTIMIZE) =>
  !Number.isFinite(before) || after < before * (1 - limits.minSaving);

/** "2.4 MB", "830 KB" */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "?";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A Foundry file path as a URL fetch() accepts (spaces, Greek, # …), without encoding twice. */
export function toURL(path) {
  const p = String(path);
  if (/^(https?:|data:|blob:)/i.test(p)) return p;
  const encoded = /%[0-9a-f]{2}/i.test(p) ? p : encodeURI(p);
  return encoded.replace(/#/g, "%23");
}

/* ---------- asset audit ------------------------------------------------------ */

const KIND = [
  ["image", /\.(png|jpe?g|webp|avif|gif|svg|bmp|tiff?)$/i],
  ["audio", /\.(mp3|ogg|oga|opus|wav|flac|m4a|aac|weba)$/i],
  ["video", /\.(mp4|m4v|webm|mov|ogv)$/i]
];

/** "image" | "audio" | "video" | null, from the file extension. */
export function mediaKind(path) {
  const p = String(path ?? "").split(/[?#]/)[0];
  for (const [kind, re] of KIND) if (re.test(p)) return kind;
  return null;
}

/** A string that is itself a media file path (not a data: or blob: URL, not prose). */
export function isMediaPath(value) {
  if (typeof value !== "string" || value.length > 600 || /[\n<>"]/.test(value)) return false;
  if (/^(data|blob):/i.test(value)) return false;
  return mediaKind(value) !== null;
}

const ATTR = /\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi;
const unentity = s => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/**
 * One spelling for a file path, however it was stored: Foundry keeps paths URL-encoded
 * ("Campfire%20%EF%BD%9C%20D%26D…"), a script or a pasted path has them plain ("Campfire ｜ D&D…").
 * Fully decoded, without a ?query. Use it to compare paths, never to fetch.
 */
export function normPath(path) {
  let p = String(path ?? "").split("?")[0];
  try { p = decodeURIComponent(p); } catch { /* malformed escapes: compare as written */ }
  return p;
}

/** Same file? Compares the decoded forms. */
export const samePath = (a, b) => normPath(a) === normPath(b);

/** Media paths in one string: the string itself, or src/href attributes inside HTML. */
export function mediaInString(value) {
  if (typeof value !== "string") return [];
  if (isMediaPath(value)) return [value];
  if (!value.includes("=")) return [];
  const out = [];
  for (const m of value.matchAll(ATTR)) {
    const p = unentity(m[3]);
    if (isMediaPath(p)) out.push(p);
  }
  return out;
}

/** Every media path anywhere inside a value (objects, arrays, HTML strings). */
export function collectMedia(value, out = new Set()) {
  if (typeof value === "string") for (const p of mediaInString(value)) out.add(p);
  else if (Array.isArray(value)) for (const v of value) collectMedia(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectMedia(v, out);
  return out;
}

/** Core and package files (Foundry icons, system and module assets): hidden by default in the audit. */
export const isPackageAsset = path => /^(icons|systems|modules|ui|canvas|sounds|cards|fonts)\//.test(String(path));

/** Is a file heavy for players to download? */
export function isHeavy(path, bytes) {
  const kind = mediaKind(path);
  if (kind === "image") return needsOptimizing(path, bytes);
  if (kind === "audio") return /\.(wav|flac)(\?.*)?$/i.test(path) || bytes > HEAVY_AUDIO_BYTES;
  if (kind === "video") return bytes > HEAVY_VIDEO_BYTES;
  return false;
}

/**
 * Replace a file path inside one string, whatever its encoding: a string that is the path,
 * src/href attributes in HTML, and the path written out in other text (Markdown).
 */
export function replacePath(text, from, to) {
  if (typeof text !== "string" || !from) return text;
  if (isMediaPath(text)) return samePath(text, from) ? to : text;
  const key = normPath(from);
  let out = text.includes("=")
    ? text.replace(ATTR, (m, attr, q, value) => (normPath(unentity(value)) === key ? `${attr}=${q}${toURL(to)}${q}` : m))
    : text;
  // Markdown and plain text: the spellings the path is likely written in.
  const component = key.split("/").map(encodeURIComponent).join("/");
  const spellings = new Set([from, key, encodeURI(key), component, component.replace(/'/g, "%27"),
    component.replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)]);
  for (const s of spellings) {
    if (s.length > 4 && out.includes(s)) out = out.split(s).join(s === key ? to : toURL(to));
  }
  return out;
}

/**
 * A copy of document data without the Theater's record of original files
 * (flags.planar-theater.src and .orig on tiles), so they don't count as uses.
 */
export function withoutOriginals(value) {
  if (Array.isArray(value)) return value.map(withoutOriginals);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = withoutOriginals(v);
  const theater = out.flags?.[MODULE_ID];
  if (theater) { const { src, orig, ...rest } = theater; out.flags = { ...out.flags, [MODULE_ID]: rest }; }
  return out;
}

/** "<folder>/<name>.lite.ogg": the copy lighten-audio.sh makes next to a heavy audio file. */
export const liteAudioPath = path => {
  const [p, query] = String(path).split("?");
  return `${p.replace(/\.[^./]+$/, "")}.lite.ogg${query ? `?${query}` : ""}`;
};

/** Deep copy of a value with the path replaced; `changed` says whether anything was. */
export function deepReplace(value, from, to) {
  if (typeof value === "string") { const v = replacePath(value, from, to); return { value: v, changed: v !== value }; }
  if (Array.isArray(value)) {
    let changed = false;
    const v = value.map(x => { const r = deepReplace(x, from, to); changed ||= r.changed; return r.value; });
    return { value: changed ? v : value, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const v = {};
    for (const [k, x] of Object.entries(value)) { const r = deepReplace(x, from, to); changed ||= r.changed; v[k] = r.value; }
    return { value: changed ? v : value, changed };
  }
  return { value, changed: false };
}

/**
 * The update that replaces a path in a document's data: { "dotted.key": newValue }.
 * Plain objects are followed key by key; an array that changes is replaced whole (Foundry
 * updates arrays as a unit). `skip` lists dotted keys to leave alone.
 */
export function pathUpdates(source, from, to, { skip = [] } = {}) {
  const updates = {};
  const walk = (obj, prefix) => {
    for (const [key, value] of Object.entries(obj ?? {})) {
      const dotted = prefix ? `${prefix}.${key}` : key;
      if (skip.includes(dotted) || key === "_id" || key === "_stats") continue;
      if (value && typeof value === "object" && !Array.isArray(value)) { walk(value, dotted); continue; }
      const r = deepReplace(value, from, to);
      if (r.changed) updates[dotted] = r.value;
    }
  };
  walk(source, "");
  return updates;
}

/* ---------- over the map ------------------------------------------------------ */

/** Is something showing over the map? A place, or at least one NPC card. */
export const overlayIsOn = state => !!(state && (state.place || state.cast?.length));

/** Should `user` see the overlay? No list (or an empty one) means every player; a GM only in preview. */
export function overlayTargets(state, user, { preview = false } = {}) {
  if (!overlayIsOn(state) || !user) return false;
  if (user.isGM) return !!preview;
  return !Array.isArray(state.users) || !state.users.length || state.users.includes(user.id);
}

const castKey = c => `${c.id}|${c.src}`;

/**
 * What changed between two overlay states as one browser sees them (null = nothing shown).
 * place: a different picture; castIn/castOut: cards to bring in / send out (a card whose picture
 * changed, e.g. a revealed name, goes out and comes back).
 */
export function overlayChanges(prev, next) {
  const p = overlayIsOn(prev) ? prev : null, n = overlayIsOn(next) ? next : null;
  const pk = new Set((p?.cast ?? []).map(castKey)), nk = new Set((n?.cast ?? []).map(castKey));
  return {
    open: !p && !!n,
    close: !!p && !n,
    place: (p?.place?.id ?? null) !== (n?.place?.id ?? null) || (p?.place?.src ?? null) !== (n?.place?.src ?? null),
    castIn: (n?.cast ?? []).filter(c => !pk.has(castKey(c))),
    castOut: (p?.cast ?? []).filter(c => !nk.has(castKey(c))),
    mode: (p?.mode ?? null) !== (n?.mode ?? null)
  };
}

/** Lower case, no accents (Greek tonos too), single spaces: for matching names typed in notes. */
export const foldName = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

/**
 * Find an item by id or by name: exact name first, then "starts with", then "contains".
 * `names(item)` lists the names an item answers to.
 */
export function findByName(items, query, names = item => [item.label]) {
  const raw = String(query ?? "").trim();
  if (!raw) return null;
  const byId = items.find(item => item.id === raw);
  if (byId) return byId;
  const q = foldName(raw);
  for (const test of [a => a === q, a => a.startsWith(q), a => a.includes(q)]) {
    const hit = items.find(item => names(item).some(n => n && test(foldName(n))));
    if (hit) return hit;
  }
  return null;
}

/**
 * "@Place[Jex's workshop | to=Nanouk, Elaion | mode=window | fx=iris | scene=Mortuary]" options.
 * Returns { name, to?, mode?, transition?, scene? }; unknown or invalid options are ignored.
 */
export function parseShowArgs(text) {
  const [name = "", ...opts] = String(text ?? "").split("|").map(s => s.trim());
  const out = { name };
  for (const opt of opts) {
    const m = opt.match(/^(\w+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === "to") out.to = value.split(",").map(s => s.trim()).filter(Boolean);
    else if (key === "mode" && OVERLAY_MODES.includes(value.toLowerCase())) out.mode = value.toLowerCase();
    else if ((key === "fx" || key === "transition") && OVERLAY_FX.includes(value.toLowerCase())) out.transition = value.toLowerCase();
    else if (key === "scene" && value) out.scene = value;
  }
  return out;
}

/**
 * Turn names or ids into user ids. A player answers to their user name or their character's name.
 * @param {{id: string, name: string, isGM?: boolean, character?: {name: string}}[]} users
 * @returns {{ids: string[], unknown: string[]}}
 */
export function resolveUsers(users, wanted) {
  const ids = [], unknown = [];
  for (const w of wanted ?? []) {
    const hit = findByName(users.filter(u => !u.isGM).map(u => ({ id: u.id, names: [u.name, u.character?.name] })),
      w, item => item.names);
    if (hit) { if (!ids.includes(hit.id)) ids.push(hit.id); } else unknown.push(String(w));
  }
  return { ids, unknown };
}

/** An NPC card's box as fractions of its Theater scene (the same spot the Theater scene uses). */
export function npcBoxFrac(sceneWidth, sceneHeight, width, height, side) {
  const b = npcPosition({ x: 0, y: 0, width: sceneWidth, height: sceneHeight }, width, height, side);
  return { left: b.left / sceneWidth, top: b.top / sceneHeight, width: b.width / sceneWidth, height: b.height / sceneHeight };
}

/** A Theater scene: made by "New scene", or holding Theater tiles. */
export const isTheaterScene = scene =>
  !!(scene?.flags?.[MODULE_ID]?.theater || scene?.tiles?.some?.(tile => !!metaOf(tile) && kindOf(tile) !== "title"));
