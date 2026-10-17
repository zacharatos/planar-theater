// The picture over the map, as each browser draws it. The GM saves one small world setting per
// action (overlay.mjs); this file turns that state into plain HTML over the canvas. Nothing here
// writes to the database, and the map scene is never touched.
//
// Performance:
// - Only opacity, transform and clip-path are animated (Web Animations), so the browser composites
//   them on the graphics card; there is no per-frame script and no timer while nothing moves.
// - Every picture is decoded before it is put on screen, so a cross-fade never shows a blank frame.
// - The layer exists only while something is shown; closing it removes it from the page.
// - Optional (client setting): the map behind a full-screen place is drawn at a few frames a second.
import { MODULE_ID, OVERLAY, TITLE_FADE_IN_MS, TITLE_FADE_OUT_MS } from "./constants.mjs";
import { t } from "./i18n.mjs";
import { setting } from "./settings.mjs";
import { overlayTargets, overlayChanges, escapeHTML as esc } from "./util.mjs";
import { emitOverlayAck } from "./socket.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const reduced = () => !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const pct = v => `${(Number(v) * 100).toFixed(3)}%`;
const done = anim => anim?.finished?.catch(() => {}) ?? Promise.resolve();

let root = null;      // the layer element, only while something is shown in this browser
let shown = null;     // the state this browser is showing (null = nothing)
let preview = false;  // GM: see what the players see
let peeking = false;
let placeRun = 0, titleRun = 0;
let localSound = null, localPath = null;
let fpsBefore = null;

const stateNow = () => game.settings.get(MODULE_ID, "overlay") ?? {};

export const isPreviewing = () => preview;
export function setPreview(on) {
  preview = !!on;
  render(stateNow(), { initial: true });
}

const GLITCH = [
  { opacity: 0, transform: "none", filter: "none" },
  { opacity: 0.85, transform: "translateX(-2%) skewX(8deg)", filter: "hue-rotate(90deg) contrast(1.6)", offset: 0.1 },
  { opacity: 0.1, transform: "translateX(1.5%)", filter: "none", offset: 0.2 },
  { opacity: 0.9, transform: "translateX(-0.6%) scaleY(1.03)", filter: "saturate(3) hue-rotate(-60deg)", offset: 0.35 },
  { opacity: 0.3, transform: "translateX(0.4%)", filter: "invert(0.2)", offset: 0.5 },
  { opacity: 1, transform: "translateX(-0.3%)", filter: "contrast(1.3)", offset: 0.65 },
  { opacity: 0.7, transform: "translateX(0.2%)", filter: "none", offset: 0.8 },
  { opacity: 1, transform: "none", filter: "none" }
];
const IRIS_OPEN = [{ clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(75% at 50% 50%)" }];

/** Animate an element in with one of the transitions. */
function enter(el, fx) {
  if (fx === "cut") return Promise.resolve();
  if (fx === "iris") return done(el.animate(IRIS_OPEN, { duration: OVERLAY.irisMs, easing: "cubic-bezier(.6,.05,.3,1)" }));
  if (fx === "glitch") {
    const stage = el.closest(".pt-ov-stage");
    stage?.classList.add("glitching");
    return done(el.animate(GLITCH, { duration: OVERLAY.glitchMs, easing: "linear" }))
      .then(() => stage?.classList.remove("glitching"));
  }
  return done(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OVERLAY.fadeMs, easing: "ease-in-out" }));
}

/** A picture, decoded and ready to paint. A file that fails still resolves (and is logged). */
async function decoded(src, className) {
  const img = new Image();
  img.className = className;
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  img.src = src;
  try { await img.decode(); }
  catch { console.warn(`${MODULE_ID} | could not load ${src}`); }
  return img;
}

// ---------- the layer ---------------------------------------------------------

/** Under Foundry's interface (sidebar, hotbar, chat stay usable), over the map. */
function mount(el) {
  const ui = document.getElementById("interface");
  const z = Math.max(...[ui, document.getElementById("board")]
    .map(node => (node ? Number.parseInt(getComputedStyle(node).zIndex, 10) : NaN))
    .filter(Number.isFinite), 1);
  el.style.zIndex = String(z);
  if (ui?.parentElement) ui.before(el);
  else document.body.append(el);
}

/** Keep the picture in the free area left of Foundry's sidebar (it sits over the canvas too). */
export function fitAroundSidebar() {
  if (!root) return;
  const bar = document.getElementById("sidebar")?.getBoundingClientRect?.();
  const side = bar && bar.width > 0 && bar.left > window.innerWidth / 2 ? Math.max(0, Math.round(window.innerWidth - bar.left)) : 0;
  root.style.setProperty("--pt-side", `${side}px`);
}
let resizeTimer = null;
globalThis.addEventListener?.("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitAroundSidebar, 150); });

function peekKey() {
  const key = game.keybindings?.get?.(MODULE_ID, "peek")?.[0]?.key ?? "";
  return key.replace(/^Key|^Digit/, "");
}

function open() {
  root = document.createElement("div");
  root.id = "planar-theater-overlay";
  root.className = "pt-ov";
  root.setAttribute("aria-hidden", "true");
  const key = peekKey();
  root.innerHTML = `<div class="pt-ov-back"></div>
    <div class="pt-ov-stage"><div class="pt-ov-places"></div><div class="pt-ov-cast"></div><div class="pt-ov-titles"></div></div>
    <button type="button" class="pt-ov-peek"><i class="fa-solid fa-eye"></i> ${esc(key ? t("Overlay.Peek", { key }) : t("Overlay.PeekMouse"))}</button>`;
  const peek = root.querySelector(".pt-ov-peek");
  peek.addEventListener("pointerdown", ev => { ev.preventDefault(); setPeek(true); });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) peek.addEventListener(type, () => setPeek(false));
  mount(root);
  fitAroundSidebar();
  root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OVERLAY.openMs, easing: "ease-out" });
}

async function close(prev) {
  const el = root;
  root = null;
  placeRun++; titleRun++;
  peeking = false;
  slowMap(false);
  stopLocalSound();
  if (!el) return;
  const fx = reduced() && prev?.transition !== "cut" ? "fade" : prev?.transition;
  if (fx === "iris") {
    const stage = el.querySelector(".pt-ov-stage");
    await Promise.all([
      done(stage?.animate([...IRIS_OPEN].reverse(), { duration: OVERLAY.irisMs, easing: "cubic-bezier(.6,.05,.3,1)", fill: "forwards" })),
      done(el.querySelector(".pt-ov-back")?.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: OVERLAY.closeMs, delay: OVERLAY.irisMs * 0.6, fill: "forwards" }))
    ]);
  } else if (fx === "glitch") {
    await done(el.animate([...GLITCH].reverse().map(({ offset, ...k }) => (offset == null ? k : { ...k, offset: 1 - offset })),
      { duration: OVERLAY.glitchMs, fill: "forwards" }));
  } else if (fx !== "cut") {
    await done(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OVERLAY.closeMs, easing: "ease-in", fill: "forwards" }));
  }
  el.remove();
}

const wantsSlow = state => !!state?.place && state.mode !== "window" && !!setting("slowMapBehind");

/** Draw the map behind at a few frames a second while it is fully covered. */
function slowMap(on) {
  const ticker = globalThis.canvas?.app?.ticker;
  if (!ticker) return;
  if (on && fpsBefore === null) { fpsBefore = ticker.maxFPS; ticker.maxFPS = OVERLAY.slowFps; }
  else if (!on && fpsBefore !== null) { ticker.maxFPS = fpsBefore; fpsBefore = null; }
}

function applyMode(state) {
  if (!root) return;
  root.classList.toggle("window", state.mode === "window");
  root.classList.toggle("no-place", !state.place);
  root.style.setProperty("--pt-ratio", String(state.ratio > 0 ? state.ratio : 16 / 9));
  slowMap(!peeking && wantsSlow(state));
}

/** A new canvas (scene change) resets the frame rate; slow it again if needed. */
export function onCanvasReady() {
  const ticker = globalThis.canvas?.app?.ticker;
  // If the new canvas reset the frame rate, what it set is the new "before"; if not, keep ours.
  if (fpsBefore !== null && ticker && ticker.maxFPS !== OVERLAY.slowFps) fpsBefore = null;
  if (shown) slowMap(!peeking && wantsSlow(shown));
}

/** A setting that affects how the layer is drawn changed. */
export function refreshMode() { if (shown) applyMode(shown); }

// ---------- peek: see the map through the picture ------------------------------

export function setPeek(on) {
  peeking = !!on && !!root;
  root?.classList.toggle("peek", peeking);
  if (shown) slowMap(!peeking && wantsSlow(shown));
}
/** Keybinding handlers: only claim the key while something is shown. */
export const peekDown = () => { if (!root) return false; setPeek(true); return true; };
export const peekUp = () => { if (!root) return false; setPeek(false); return true; };

// ---------- place, title, cast ------------------------------------------------------

async function showPlace(place, fx, { title }) {
  const run = ++placeRun, host = root;
  const box = host?.querySelector(".pt-ov-places");
  if (!box) return;
  if (!place) {
    await Promise.all([...box.children].map(o => done(o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OVERLAY.fadeMs, fill: "forwards" }))));
    if (run === placeRun) box.replaceChildren();
    return;
  }
  const img = await decoded(place.src, "pt-ov-place");
  if (run !== placeRun || root !== host) return;
  box.append(img);
  if (title && place.title) runTitle(place.title).catch(() => {});
  await enter(img, fx);
  // The newest picture removes everything under it; an older one that finished late leaves things be.
  if (run === placeRun) for (const o of [...box.children]) if (o !== img) o.remove();
}

async function runTitle(src) {
  const run = ++titleRun, host = root;
  const box = host?.querySelector(".pt-ov-titles");
  if (!box) return;
  const img = await decoded(src, "pt-ov-title");
  if (run !== titleRun || root !== host) return;
  img.style.opacity = "0";
  box.replaceChildren(img);
  await done(img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: TITLE_FADE_IN_MS, fill: "forwards" }));
  await sleep(setting("titleHold") * 1000);
  if (run !== titleRun) return;
  await done(img.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TITLE_FADE_OUT_MS, fill: "forwards" }));
  if (run === titleRun) img.remove();
}

const keyOf = c => `${c.id}|${c.src}`;
const slideFrom = c => (c.side === "left" ? "translateX(-12%)" : "translateX(12%)");

async function npcIn(c, initial) {
  const host = root;
  const cast = host?.querySelector(".pt-ov-cast");
  if (!cast) return;
  const img = await decoded(c.src, `pt-ov-npc ${c.side === "left" ? "left" : "right"}`);
  if (root !== host || !shown?.cast?.some(x => keyOf(x) === keyOf(c))) return;
  img.dataset.key = keyOf(c);
  const b = c.box ?? { left: 0.62, top: 0.1, width: 0.3, height: 0.7 };
  Object.assign(img.style, { left: pct(b.left), top: pct(b.top), width: pct(b.width), height: pct(b.height) });
  cast.append(img);
  if (initial) return;
  const from = reduced() ? "none" : slideFrom(c);
  await done(img.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }], { duration: OVERLAY.npcMs, easing: "ease-out" }));
}

async function npcOut(c) {
  const img = root?.querySelector(`.pt-ov-npc[data-key="${CSS.escape(keyOf(c))}"]`);
  if (!img) return;
  delete img.dataset.key;
  const to = reduced() ? "none" : slideFrom(c);
  await done(img.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: to }], { duration: OVERLAY.npcMs, easing: "ease-in", fill: "forwards" }));
  img.remove();
}

// ---------- sound for chosen players only --------------------------------------------
// Shown to everyone, the GM plays the linked playlist track as usual (overlay.mjs).
// Shown to chosen players only, each of their browsers plays it locally, so nobody else hears it.

async function syncLocalSound(state) {
  const want = state && !state.globalSound && state.sound?.path ? state.sound : null;
  if ((want?.path ?? null) === localPath) return;
  stopLocalSound();
  if (!want) return;
  localPath = want.path;
  try {
    const snd = await game.audio.play(want.path, { loop: true, volume: 0, context: game.audio.music });
    if (localPath !== want.path) { snd?.stop?.(); return; }
    localSound = snd;
    snd?.fade?.(want.volume ?? 0.5, { duration: setting("soundFade") * 1000 });
  } catch (err) {
    console.warn(`${MODULE_ID} | could not play ${want.path}`, err);
    localPath = null;
  }
}

function stopLocalSound() {
  const snd = localSound;
  localSound = null; localPath = null;
  if (!snd) return;
  const ms = setting("soundFade") * 1000;
  try { snd.fade?.(0, { duration: ms }); } catch { /* stopping anyway */ }
  setTimeout(() => { try { snd.stop?.(); } catch { /* already stopped */ } }, ms);
}

// ---------- entry point ---------------------------------------------------------------

/**
 * Show `state` in this browser (or nothing, if it isn't meant for this user).
 * initial: a reload, a late login or a preview switch: no title card, no transition.
 */
export function render(state, { initial = false } = {}) {
  const next = overlayTargets(state, game.user, { preview }) ? state : null;
  const prev = shown;
  shown = next;
  const ch = overlayChanges(prev, next);
  if (ch.close) { close(prev); return; }
  if (!next) return;
  if (ch.open) open();
  applyMode(next);
  const fx = initial ? "cut" : (reduced() && next.transition !== "cut" ? "fade" : next.transition ?? "fade");
  const work = [];
  if (ch.place) work.push(showPlace(next.place, fx, { title: !initial }));
  for (const c of ch.castOut) work.push(npcOut(c));
  for (const c of ch.castIn) work.push(npcIn(c, initial));
  syncLocalSound(next);
  Promise.allSettled(work).then(() => {
    if (shown === next && !game.user.isGM && Number.isFinite(next.seq)) emitOverlayAck(next.seq);
  });
}

/** On ready: show whatever is up right now (a reload or a late login). */
export function init() { render(stateNow(), { initial: true }); }
