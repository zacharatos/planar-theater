// Theater pins: map notes only the GM can see. Drag a place or an NPC from the Theater panel onto
// a map; double-click the pin to show it over the map (again to take it down). A pin dropped next
// to a door is linked to it: when the door opens, the GM is asked "show it?" (or, per pin, it is
// shown at once, or nothing happens).
//
// Pins are ordinary Foundry Notes linked to one GM-only journal entry, so players never see them
// (a note is visible only to users who can see its entry) and the GM moves, edits or deletes them
// like any other note. Nothing runs until a pin is clicked or a door opens.
import { MODULE_ID } from "./constants.mjs";
import { t, warn, info } from "./i18n.mjs";
import { escapeHTML as esc, nearestDoor, pinOf, DOOR_CHOICES } from "./util.mjs";
import { OVERLAY_MODES, OVERLAY_FX } from "./constants.mjs";
import * as overlay from "./overlay.mjs";

export const DRAG_TYPE = "PlanarTheater";
export const PIN_ICON = `modules/${MODULE_ID}/styles/pin.svg`;
/** A pin links to a door within this many grid squares. */
const DOOR_RANGE = 2.5;
const PROMPT_MS = 30_000;

const isActiveGM = () => game.user.isGM && (game.users.activeGM?.id ?? game.user.id) === game.user.id;
const doorOpen = () => CONST.WALL_DOOR_STATES?.OPEN ?? 1;
const doorsOf = scene => (scene?.walls ?? []).filter(w => w.door > 0).map(w => ({ id: w.id, c: w.c, door: w.door }));
const doorNear = (scene, x, y) => nearestDoor(doorsOf(scene), x, y, (scene?.grid?.size ?? 100) * DOOR_RANGE);

/** The one GM-only journal entry every pin points to (made on first use). */
async function pinJournal() {
  const found = game.journal.find(j => j.getFlag(MODULE_ID, "pins"));
  if (found) return found;
  return getDocumentClass("JournalEntry").create({
    name: t("Pins.JournalName"),
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: { [MODULE_ID]: { pins: true } }
  });
}

// ---------- making a pin --------------------------------------------------------------

/** Drag data for a place or NPC tile (the panel puts it on its items). */
export const dragData = (kind, scene, tile, label) => ({ type: DRAG_TYPE, kind, scene: scene.id, id: tile.id, label });

/** Create a pin on the scene being viewed. data: { kind, scene, id, label, x, y } */
export async function createPin(data) {
  const map = canvas.scene;
  if (!map || !game.user.isGM) return null;
  const entry = await pinJournal();
  const door = doorNear(map, data.x, data.y);
  const [note] = await map.createEmbeddedDocuments("Note", [{
    entryId: entry.id, x: Math.round(data.x), y: Math.round(data.y),
    texture: { src: PIN_ICON }, iconSize: 48, text: data.label, fontSize: 22,
    textAnchor: CONST.TEXT_ANCHOR_POINTS?.BOTTOM ?? 1,
    flags: { [MODULE_ID]: { pin: {
      kind: data.kind === "npc" ? "npc" : "place", scene: data.scene, id: data.id, label: data.label,
      door: door?.id ?? null, onDoor: door ? "ask" : "off", mode: "", fx: ""
    } } }
  }]);
  // Pins live with the map notes: make sure the GM sees notes on the token layer.
  try {
    if (!game.settings.get("core", "notesDisplayToggle")) {
      await game.settings.set("core", "notesDisplayToggle", true);
      info("Pins.NotesShown");
    }
  } catch { /* a core setting we can't read: never mind */ }
  info(door ? "Pins.CreatedDoor" : "Pins.Created", { name: data.label });
  return note;
}

// ---------- using a pin --------------------------------------------------------------------

/** The tile a pin points at, or null. */
function tileOf(pin) {
  return game.scenes.get(pin.scene)?.tiles.get(pin.id) ?? null;
}

/**
 * Show what the pin points at. toggle: a second use on the place that is up takes it down.
 */
export async function firePin(note, { toggle = true } = {}) {
  const pin = pinOf(note);
  if (!pin) return null;
  const opts = { ...(pin.mode ? { mode: pin.mode } : {}), ...(pin.fx ? { transition: pin.fx } : {}) };
  const tile = tileOf(pin);
  // The place may have been removed and added again (new id): fall back to its name.
  const target = tile ?? pin.label;
  if (pin.kind === "npc") return overlay.showNpc(target, toggle ? opts : { ...opts, on: true });
  const up = overlay.state();
  if (up.place?.id === pin.id || (!tile && up.place?.label === pin.label)) {
    return toggle ? overlay.hide() : null;
  }
  return overlay.showPlace(target, opts);
}

// ---------- "Door opened: show it?" -------------------------------------------------------------

let box = null;
function promptBox() {
  if (box?.isConnected) return box;
  box = document.createElement("div");
  box.id = "planar-theater-prompts";
  box.className = "pt-prompts";
  document.body.append(box);
  return box;
}

function ask(note) {
  const pin = pinOf(note);
  const key = `${note.parent?.id}.${note.id}`;
  const host = promptBox();
  if (host.querySelector(`[data-key="${CSS.escape(key)}"]`)) return; // already asking
  const card = document.createElement("div");
  card.className = "pt-prompt";
  card.dataset.key = key;
  card.innerHTML = `<i class="fa-solid fa-door-open"></i>
    <span>${esc(t("Pins.DoorAsk", { name: pin.label }))}</span>
    <button type="button" data-p="show"><i class="fa-solid fa-eye"></i> ${esc(t("Pins.Show"))}</button>
    <button type="button" data-p="no">${esc(t("Pins.NotNow"))}</button>`;
  const close = () => { clearTimeout(timer); card.remove(); };
  const timer = setTimeout(close, PROMPT_MS);
  card.addEventListener("click", ev => {
    const btn = ev.target.closest("[data-p]");
    if (!btn) return;
    close();
    if (btn.dataset.p === "show") firePin(note, { toggle: false }).catch(err => console.error(`${MODULE_ID} |`, err));
  });
  host.append(card);
}

function onDoorChanged(wall, changed) {
  if (changed?.ds !== doorOpen() || !isActiveGM()) return;
  for (const note of wall.parent?.notes ?? []) {
    const pin = pinOf(note);
    if (!pin || pin.door !== wall.id || pin.onDoor === "off") continue;
    if (pin.onDoor === "show") firePin(note, { toggle: false }).catch(err => console.error(`${MODULE_ID} |`, err));
    else ask(note);
  }
}

/** A moved pin links to the door now nearest to it. */
function onNoteMoved(note, changed) {
  const pin = pinOf(note);
  if (!pin || !isActiveGM() || !("x" in (changed ?? {}) || "y" in (changed ?? {}))) return;
  const door = doorNear(note.parent, note.x, note.y);
  if ((door?.id ?? null) === (pin.door ?? null)) return;
  const onDoor = !door ? "off" : pin.door ? pin.onDoor : "ask";
  note.update({ [`flags.${MODULE_ID}.pin.door`]: door?.id ?? null, [`flags.${MODULE_ID}.pin.onDoor`]: onDoor })
    .catch(err => console.warn(`${MODULE_ID} |`, err));
}

// ---------- the pin's settings, inside Foundry's note sheet -------------------------------------------

function onRenderNoteConfig(app, html) {
  const note = app.document ?? app.object;
  const pin = pinOf(note);
  if (!pin || !game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const form = root?.tagName === "FORM" ? root : root?.querySelector("form") ?? app.form;
  if (!form || form.querySelector(".pt-pin-config")) return;
  const f = `flags.${MODULE_ID}.pin`;
  const opt = (list, value, label) => list.map(v => `<option value="${v}" ${v === value ? "selected" : ""}>${esc(label(v))}</option>`).join("");
  const sceneName = game.scenes.get(pin.scene)?.name ?? "?";
  const set = document.createElement("fieldset");
  set.className = "pt-pin-config";
  set.innerHTML = `<legend><i class="fa-solid fa-masks-theater"></i> ${esc(t("Pins.Legend"))}</legend>
    <div class="form-group"><label>${esc(t("Pins.Shows"))}</label>
      <div class="form-fields"><span>${esc(pin.label)} <small>(${esc(sceneName)})</small></span></div></div>
    <div class="form-group"><label>${esc(t("Pins.OnDoor"))}</label>
      <div class="form-fields"><select name="${f}.onDoor" ${pin.door ? "" : "disabled"}>${opt(DOOR_CHOICES, pin.onDoor, v => t(`Pins.Door.${v}`))}</select></div>
      <p class="hint">${esc(t(pin.door ? "Pins.DoorLinked" : "Pins.NoDoor"))}</p></div>
    <div class="form-group"><label>${esc(t("Over.ModeLabel"))}</label>
      <div class="form-fields"><select name="${f}.mode"><option value="">${esc(t("Pins.PanelChoice"))}</option>${opt(OVERLAY_MODES, pin.mode, v => t(`Over.Mode.${v}`))}</select></div></div>
    <div class="form-group"><label>${esc(t("Over.FxLabel"))}</label>
      <div class="form-fields"><select name="${f}.fx"><option value="">${esc(t("Pins.PanelChoice"))}</option>${opt(OVERLAY_FX, pin.fx, v => t(`Over.Fx.${v}`))}</select></div></div>`;
  const footer = form.querySelector("footer, .form-footer, .sheet-footer");
  footer ? footer.before(set) : form.append(set);
  app.setPosition?.({ height: "auto" });
}

// ---------- wiring ----------------------------------------------------------------------------------------

export function registerPins() {
  // Our drag data dropped on the map makes a pin; anything else goes on to Foundry.
  Hooks.on("dropCanvasData", (_canvas, data) => {
    if (data?.type !== DRAG_TYPE) return;
    if (game.user.isGM) createPin(data).catch(err => { console.error(`${MODULE_ID} |`, err); warn("Pins.Failed"); });
    return false;
  });
  // A double-click on a pin shows its place instead of opening the (empty) journal.
  Hooks.on("activateNote", note => {
    const doc = note?.document ?? note;
    if (!pinOf(doc)) return;
    if (game.user.isGM) firePin(doc).catch(err => console.error(`${MODULE_ID} |`, err));
    return false;
  });
  // Safety net, in case a Foundry version opens the note's journal without calling "activateNote":
  // the pins journal never stays open; the pin under the mouse fires instead.
  for (const hook of ["renderJournalEntrySheet", "renderJournalSheet"]) {
    Hooks.on(hook, app => {
      const entry = app.document ?? app.object;
      if (!entry?.getFlag?.(MODULE_ID, "pins")) return;
      app.close?.();
      const note = canvas?.notes?.hover?.document;
      if (game.user.isGM && pinOf(note)) firePin(note).catch(err => console.error(`${MODULE_ID} |`, err));
    });
  }
  Hooks.on("updateWall", onDoorChanged);
  Hooks.on("updateNote", onNoteMoved);
  Hooks.on("renderNoteConfig", onRenderNoteConfig);
}

/** Pins on a scene (the viewed one by default), for macros. */
export function pins(scene = canvas.scene) {
  return (scene?.notes ?? []).filter(n => pinOf(n)).map(n => ({ id: n.id, x: n.x, y: n.y, ...pinOf(n) }));
}
