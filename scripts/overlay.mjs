// Over the map: show a Theater place, NPC cards or any picture on the players' screens without
// changing scene. The GM writes one small world setting per action ("overlay"); every browser draws
// it itself (layer.mjs), so a reload or a late login shows what is up at once, and fades cost no
// database traffic. Shown to everyone, the linked sound plays as a normal playlist track and the
// Planar Soundboard is turned down (Narrate) while it is up; shown to chosen players, the sound plays
// only in their browsers.
import { MODULE_ID } from "./constants.mjs";
import { t, warn, info } from "./i18n.mjs";
import { setting, setSetting } from "./settings.mjs";
import {
  metaOf, kindOf, nameOf, overlayIsOn, overlayTargets, findByName, resolveUsers, npcBoxFrac,
  isTheaterScene, splitTitle, hash36
} from "./util.mjs";
import * as sound from "./sound.mjs";
import * as layer from "./layer.mjs";
import * as onair from "./onair.mjs";
import { onOverlayAck } from "./socket.mjs";
import { loadImg, upload } from "./files.mjs";
import { renderTitle } from "./render.mjs";

const clone = v => foundry.utils.deepClone(v ?? {});
export const state = () => clone(game.settings.get(MODULE_ID, "overlay"));

// ---------- settings, keys, hooks ---------------------------------------------------

export function registerOverlaySettings() {
  game.settings.register(MODULE_ID, "overlay", {
    scope: "world", config: false, type: Object, default: {},
    onChange: value => {
      layer.render(value);
      Hooks.callAll(`${MODULE_ID}.overlay`, clone(value));
      drawChip();
    }
  });
  game.settings.register(MODULE_ID, "overlayPrefs", { scope: "client", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, "duckSoundboard", {
    name: "PLANAR_THEATER.Settings.DuckSoundboard.Name", hint: "PLANAR_THEATER.Settings.DuckSoundboard.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "lowerOnCombat", {
    name: "PLANAR_THEATER.Settings.LowerOnCombat.Name", hint: "PLANAR_THEATER.Settings.LowerOnCombat.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "slowMapBehind", {
    name: "PLANAR_THEATER.Settings.SlowMap.Name", hint: "PLANAR_THEATER.Settings.SlowMap.Hint",
    scope: "client", config: true, type: Boolean, default: false,
    onChange: () => layer.refreshMode()
  });
  game.keybindings.register(MODULE_ID, "peek", {
    name: "PLANAR_THEATER.Keybinding.Peek", hint: "PLANAR_THEATER.Keybinding.PeekHint",
    editable: [{ key: "KeyV" }], restricted: false,
    onDown: () => layer.peekDown(), onUp: () => layer.peekUp()
  });
  game.keybindings.register(MODULE_ID, "lower", {
    name: "PLANAR_THEATER.Keybinding.Lower", editable: [], restricted: true,
    onDown: () => { if (!overlayIsOn(state())) return false; hide(); return true; }
  });
}

/** Players' acks: user id -> the overlay seq they are showing. GM side only. */
const acks = new Map();

function chipInfo() {
  const st = state();
  const seeing = [], waiting = [];
  for (const u of game.users) {
    if (!u.active || u.isGM || !overlayTargets(st, u)) continue;
    (acks.get(u.id) === st.seq ? seeing : waiting).push(u.name);
  }
  return { state: st, seeing, waiting, preview: layer.isPreviewing() };
}
const drawChip = () => { if (game.user.isGM) onair.drawSoon(chipInfo); };

const isActiveGM = () => game.user.isGM && (game.users.activeGM?.id ?? game.user.id) === game.user.id;

/** On ready: draw what is up, wire the GM chip, acks and auto-lower on combat. */
export function initOverlay({ openPanel }) {
  layer.init();
  if (!game.user.isGM) return;
  onair.bind({
    hide: () => hide(),
    preview: () => { layer.setPreview(!layer.isPreviewing()); drawChip(); },
    panel: () => openPanel()
  });
  onOverlayAck((user, seq) => { acks.set(user, seq); drawChip(); });
  Hooks.on("userConnected", () => drawChip());
  const lower = () => {
    if (!isActiveGM() || !setting("lowerOnCombat") || !overlayIsOn(state())) return;
    hide().then(() => info("Over.LoweredForCombat"));
  };
  Hooks.on("combatStart", lower);
  Hooks.on("updateCombatant", (doc, changed) => { if (changed?.initiative != null) lower(); });
  drawChip();
}

// ---------- the GM's choices in the panel ---------------------------------------------

export function prefs() {
  return { mode: "full", transition: "fade", users: [], scene: null, ...(setting("overlayPrefs") ?? {}) };
}
export const setPrefs = patch => setSetting("overlayPrefs", { ...prefs(), ...patch });

// ---------- finding things ------------------------------------------------------------------

export const theaterScenes = () => game.scenes.filter(isTheaterScene).sort((a, b) => a.name.localeCompare(b.name));

function sceneOf(query) {
  if (query && typeof query === "object" && query.tiles) return query;
  const scenes = theaterScenes();
  if (query) return findByName(scenes.map(s => ({ id: s.id, label: s.name, s })), query)?.s ?? null;
  return null;
}

const rectOf = scene => {
  const r = scene.dimensions?.sceneRect;
  return r?.width ? r : { x: 0, y: 0, width: scene.width || 1920, height: scene.height || 1080 };
};

const tilesOf = (scene, kind) => scene.tiles.filter(tile => metaOf(tile) && kindOf(tile) === kind)
  .sort((a, b) => (metaOf(a).order ?? 0) - (metaOf(b).order ?? 0));

/** A place or NPC tile by tile document, id or name, in one Theater scene or all of them. */
function resolveTile(target, kind, sceneQuery) {
  if (target?.documentName === "Tile") return { scene: target.parent, tile: target };
  const scenes = sceneQuery ? [sceneOf(sceneQuery)].filter(Boolean) : theaterScenes();
  const items = scenes.flatMap(scene => tilesOf(scene, kind).map(tile => ({
    id: tile.id, scene, tile, names: [nameOf(tile), metaOf(tile).label, splitTitle(metaOf(tile).title).main]
  })));
  const hit = findByName(items, target, item => item.names);
  return hit ? { scene: hit.scene, tile: hit.tile } : null;
}

function usersOf(list) {
  if (list == null) return null;
  const arr = Array.isArray(list) ? list : [list];
  if (!arr.length) return [];
  const { ids, unknown } = resolveUsers(game.users.contents.map(u => ({ id: u.id, name: u.name, isGM: u.isGM, character: u.character })), arr);
  if (unknown.length) warn("Over.UnknownUsers", { names: unknown.join(", ") });
  return ids;
}

function placeEntry(scene, tile) {
  const title = scene.tiles.find(o => metaOf(o)?.kind === "title" && metaOf(o).parent === tile.id);
  return { id: tile.id, scene: scene.id, src: tile.texture.src, label: nameOf(tile), title: title?.texture?.src ?? null };
}

function npcEntry(scene, tile) {
  const m = metaOf(tile), r = rectOf(scene), side = m.side ?? "right";
  return {
    id: tile.id, scene: scene.id, src: tile.texture.src, side,
    // A veiled name stays out of the state: every browser can read world settings.
    ...(m.nameHidden ? {} : { label: nameOf(tile) }),
    box: npcBoxFrac(r.width, r.height, m.w ?? tile.width, m.h ?? tile.height, side)
  };
}

async function soundOf(uuid) {
  if (!uuid) return null;
  const snd = await fromUuid(uuid);
  return snd?.path ? { uuid, path: snd.path, volume: snd.volume ?? 0.5 } : null;
}

// ---------- saving a new state -----------------------------------------------------------------

let queue = Promise.resolve();

/** Build the next state from the current one and save it. Calls run one after the other. */
function commit(build) {
  const run = queue.then(() => save(build));
  queue = run.catch(err => {
    console.error(`${MODULE_ID} |`, err);
    ui.notifications.error(t("Notify.Error", { message: err.message }));
  });
  return run.catch(() => null);
}

async function save(build) {
  if (!game.user.isGM) { warn("Notify.OnlyGM"); return null; }
  const prev = state();
  const next = { v: 1, ...build(prev) };
  delete next.globalSound; delete next.ducked;
  next.seq = (prev.seq ?? 0) + 1;
  const on = overlayIsOn(next);
  if (!on) { next.place = null; next.cast = []; next.sound = null; }
  const everyone = !next.users?.length;

  // Sound for everyone = the playlist track; for chosen players each browser plays it (layer.mjs).
  const nextUuid = on && everyone ? next.sound?.uuid ?? null : null;
  const prevUuid = prev.globalSound ? prev.sound?.uuid ?? null : null;
  if (prevUuid && prevUuid !== nextUuid) await sound.stopUuid(prevUuid);
  if (nextUuid && nextUuid !== prevUuid) await sound.playUuid(nextUuid);
  next.globalSound = !!nextUuid;

  // Turn the map's soundscape down while a place is up for everyone.
  const sb = globalThis.PlanarSoundboard;
  const canDuck = typeof sb?.narrate === "function";
  const duck = on && everyone && !!next.place && setting("duckSoundboard") && canDuck;
  try {
    if (duck && !prev.ducked) await sb.narrate(true);
    else if (!duck && prev.ducked && canDuck) await sb.narrate(false);
  } catch (err) { console.warn(`${MODULE_ID} | Soundboard narrate failed`, err); }
  next.ducked = duck;

  await game.settings.set(MODULE_ID, "overlay", next);
  return next;
}

const keep = prev => ({ users: prev.users ?? [], mode: prev.mode, transition: prev.transition, ratio: prev.ratio });
const fresh = (opts, users, ratio) => {
  const p = prefs();
  return { users: users ?? p.users ?? [], mode: opts.mode ?? p.mode, transition: opts.transition ?? p.transition, ratio };
};

// ---------- the API --------------------------------------------------------------------------

/**
 * Show a Theater place over the map.
 * @param {TileDocument|string} target  the tile, its id, or its name ("Jex's workshop")
 * @param {{scene?, users?, mode?: "full"|"window", transition?: "fade"|"iris"|"glitch"|"cut", title?: boolean, clearCast?: boolean}} opts
 *   users: names or ids (user or character names); none = every player. Unset: the panel's choice.
 */
export async function showPlace(target, opts = {}) {
  const hit = resolveTile(target, "place", opts.scene);
  if (!hit) { warn("Over.NotFound", { name: String(target?.name ?? target) }); return null; }
  const entry = placeEntry(hit.scene, hit.tile);
  if (opts.title === false) entry.title = null;
  const snd = await soundOf(metaOf(hit.tile).sound);
  const users = opts.users !== undefined ? usersOf(opts.users) : null;
  const r = rectOf(hit.scene);
  return commit(prev => {
    const live = overlayIsOn(prev);
    const same = live && prev.place?.id === entry.id;
    const keepCast = live && (same || !(opts.clearCast ?? setting("clearCastOnPlace")));
    // A second click on the place that is up re-sends it with the panel's current choices (who, mode).
    return {
      ...fresh(opts, users, r.width / r.height),
      place: entry,
      cast: keepCast ? prev.cast ?? [] : [],
      // A place without a sound leaves the one already playing.
      sound: snd ?? (live ? prev.sound : null)
    };
  });
}

/** Bring an NPC card in over the map, or send it out (on: true / false; unset toggles). One per side. */
export async function showNpc(target, opts = {}) {
  const hit = resolveTile(target, "npc", opts.scene);
  if (!hit) { warn("Over.NotFound", { name: String(target?.name ?? target) }); return null; }
  const entry = npcEntry(hit.scene, hit.tile);
  const users = opts.users !== undefined ? usersOf(opts.users) : null;
  const r = rectOf(hit.scene);
  return commit(prev => {
    const live = overlayIsOn(prev);
    const cast = live ? prev.cast ?? [] : [];
    const want = opts.on ?? !cast.some(c => c.id === entry.id);
    const rest = cast.filter(c => c.id !== entry.id && (!want || c.side !== entry.side));
    const base = live ? { ...keep(prev), place: prev.place, sound: prev.sound } : { ...fresh(opts, users, r.width / r.height), place: null, sound: null };
    if (live && users !== null) base.users = users;
    return { ...base, cast: want ? [...rest, entry] : rest };
  });
}

/**
 * Show any picture over the map (not on a Theater scene), with an optional title card
 * ("Main line | small line") and an optional playlist sound (uuid).
 */
export async function showImage(src, opts = {}) {
  if (!src) return null;
  let ratio = 16 / 9;
  try { const img = await loadImg(src); ratio = img.naturalWidth / img.naturalHeight || ratio; } catch { /* keep 16:9 */ }
  let title = null;
  if (opts.title) {
    try {
      const blob = await renderTitle({ text: opts.title, rect: { x: 0, y: 0, width: 1920, height: Math.round(1920 / ratio) } });
      title = await upload("data", blob, "title");
    } catch (err) { console.warn(`${MODULE_ID} | title card failed`, err); }
  }
  const snd = await soundOf(opts.sound);
  const users = opts.users !== undefined ? usersOf(opts.users) : null;
  const label = opts.label ?? String(src).split("/").pop().replace(/\.[^.]+$/, "");
  return commit(prev => {
    const live = overlayIsOn(prev);
    return {
      ...fresh(opts, users, ratio),
      place: { id: `img-${hash36(src)}`, scene: null, src, label, title },
      cast: live && !(opts.clearCast ?? setting("clearCastOnPlace")) ? prev.cast ?? [] : [],
      sound: snd ?? (live ? prev.sound : null)
    };
  });
}

/** Take everything down: everyone is back on the map. */
export function hide() {
  return commit(prev => ({ ...keep(prev), place: null, cast: [], sound: null }));
}

/** Send every NPC card out, keep the place. */
export function clearCast() {
  return commit(prev => ({ ...keep(prev), place: prev.place ?? null, sound: prev.sound ?? null, cast: [] }));
}

/** Change who sees what is up (names or ids; none = everyone). */
export function setUsers(list) {
  const users = usersOf(list) ?? [];
  return commit(prev => ({ ...keep(prev), place: prev.place ?? null, cast: prev.cast ?? [], sound: prev.sound ?? null, users }));
}

/** Places of every Theater scene (or one), for macros and lists. */
export function places({ scene } = {}) {
  const scenes = scene ? [sceneOf(scene)].filter(Boolean) : theaterScenes();
  return scenes.flatMap(s => tilesOf(s, "place").map(tile => ({
    id: tile.id, scene: s.id, sceneName: s.name, label: nameOf(tile), title: metaOf(tile).title ?? null, src: tile.texture.src
  })));
}

/** NPC cards of every Theater scene (or one). */
export function cast({ scene } = {}) {
  const scenes = scene ? [sceneOf(scene)].filter(Boolean) : theaterScenes();
  return scenes.flatMap(s => tilesOf(s, "npc").map(tile => ({
    id: tile.id, scene: s.id, sceneName: s.name, label: nameOf(tile), side: metaOf(tile).side ?? "right",
    veiled: !!metaOf(tile).nameHidden, src: tile.texture.src
  })));
}
