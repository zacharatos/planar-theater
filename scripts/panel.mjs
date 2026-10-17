import { MODULE_ID } from "./constants.mjs";
import { t, warn } from "./i18n.mjs";
import { setting, setSetting } from "./settings.mjs";
import { metaOf, kindOf, nameOf, escapeHTML as esc, playersNotViewing, isStageScene, hasTheaterTiles, overlayIsOn } from "./util.mjs";
import { Stage } from "./stage.mjs";
import { migrateScene, pendingLegacyTiles } from "./migrate.mjs";
import { createTheaterScene } from "./scene.mjs";
import { AssetAudit } from "./audit.mjs";
import * as overlay from "./overlay.mjs";
import { pickFile } from "./files.mjs";
import { OVERLAY_MODES, OVERLAY_FX } from "./constants.mjs";

const { ApplicationV2 } = foundry.applications.api;

const soundOptions = selected => {
  const out = [`<option value="">${esc(t("Editor.NoSound"))}</option>`];
  for (const pl of [...game.playlists.contents].sort((a, b) => a.name.localeCompare(b.name))) {
    for (const s of pl.sounds.contents) {
      out.push(`<option value="${esc(s.uuid)}" ${s.uuid === selected ? "selected" : ""}>${esc(pl.name)} — ${esc(s.name)}</option>`);
    }
  }
  return out.join("");
};

/** A selector that finds the clicked control again after the panel re-draws it. */
const controlSelector = el => {
  for (const key of ["act", "id", "ed", "reveal", "edit", "ovPlace", "ovNpc"]) {
    if (el.dataset[key]) return `[data-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}="${el.dataset[key]}"]`;
  }
  return null;
};

/** Quick actions finish before this, so they never flash the busy state. */
const BUSY_DELAY_MS = 150;

export class TheaterPanel extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "planar-theater-panel",
    classes: ["planar-theater"],
    window: { title: "PLANAR_THEATER.ToolTitle", icon: "fa-solid fa-masks-theater", resizable: true },
    position: { width: 820, height: 720 }
  };

  static #instance = null;
  static get instance() { return this.#instance; }

  /** Open (or focus) the panel. */
  static open() {
    if (!game.user.isGM) return warn("Notify.OnlyGM");
    if (!canvas.scene) return warn("Notify.NoScene");
    const app = this.#instance ??= new TheaterPanel({ position: { height: Math.min(780, Math.round(window.innerHeight * 0.85)) } });
    // Only a window that is already open has an element to raise; a first render opens on top anyway.
    if (app.rendered) app.bringToFront?.();
    app.render({ force: true });
    return app;
  }

  stage = new Stage();
  #editingId = null;
  #busy = false;
  #busyTimer = null;
  /** Selector of the control whose action is running, so it stays highlighted across re-draws. */
  #working = null;
  /** The element the click/change listeners are on. Foundry builds a new one each time the window reopens. */
  #boundTo = null;
  #lastGrids = "";
  #timer = null;
  #presenceTimer = null;

  get title() {
    return this.remote ? t("Over.Title", { scene: canvas.scene?.name ?? "" }) : t("Title", { scene: canvas.scene?.name ?? "" });
  }

  /** On a map (not a Theater scene) the panel shows places of a Theater scene to put over the map. */
  get remote() { return !!canvas.scene && !isStageScene(canvas.scene); }

  /**
   * The scene whose places the panel lists over a map: the one picked last on this map; else this map
   * itself if it holds Theater places; else the one picked last anywhere; else the first.
   */
  #overScene() {
    const scenes = overlay.theaterScenes();
    const p = overlay.prefs(), map = canvas.scene;
    const byId = id => (id ? scenes.find(s => s.id === id) : null);
    return byId(p.sceneFor?.[map?.id]) ?? (hasTheaterTiles(map) ? map : null) ?? byId(p.scene) ?? scenes[0] ?? null;
  }

  /** Theater tiles left visible on this map's own canvas (e.g. clicked with 1.3.0). */
  #tilesOnMap() {
    return (canvas.scene?.tiles ?? []).filter(tile => metaOf(tile) && (!tile.hidden || tile.alpha > 0));
  }

  async _prepareContext() { return {}; }

  async _renderHTML() { return this.remote ? this.#remoteHTML() : this.#panelHTML(); }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender() {
    this.#lastGrids = this.#gridsHTML();
    this.#updatePresence();
    clearInterval(this.#presenceTimer);
    this.#presenceTimer = setInterval(() => this.#updatePresence(), 2000);
    this.#showBusy(); // a reopened window must still show an action that is running
    if (this.#boundTo === this.element) return;
    this.#boundTo = this.element;
    this.element.addEventListener("click", ev => this.#onClick(ev));
    this.element.addEventListener("change", ev => this.#onChange(ev));
  }

  async _onClose() {
    this.#editingId = null;
    clearTimeout(this.#timer);
    clearTimeout(this.#busyTimer);
    clearInterval(this.#presenceTimer);
  }

  /** Remember the two checkboxes between sessions; over a map, the choices of scene, who, mode and transition. */
  #onChange(ev) {
    const box = ev.target;
    const save = patch => overlay.setPrefs(patch).catch(err => console.warn(`${MODULE_ID} |`, err));
    switch (box?.name) {
      case "ov-scene": return save({ scene: box.value, sceneFor: { ...overlay.prefs().sceneFor, [canvas.scene?.id]: box.value } })
        .then(() => this.#refreshGrids());
      case "ov-mode": return save({ mode: box.value });
      case "ov-fx": return save({ transition: box.value });
      case "ov-user": return save({ users: [...this.element.querySelectorAll("input[name=ov-user]:checked")].map(x => x.value) });
    }
    const key = { "th-fade": "fade", "th-clear": "clearCastOnPlace" }[box?.name];
    if (key) setSetting(key, box.checked).catch(err => console.warn(`${MODULE_ID} |`, err));
  }

  /** "3/4 players on this scene" chip: shows at a glance whether Show to players worked. */
  #presenceHTML() {
    const scene = canvas.scene;
    const players = game.users.filter(u => u.active && !u.isGM);
    if (!players.length) return { cls: "none", icon: "fa-user-slash", text: t("Presence.None"), tip: "" };
    const behind = playersNotViewing(game.users, scene?.id);
    const here = players.length - behind.length;
    if (!behind.length) return { cls: "all", icon: "fa-circle-check", text: t("Presence.All", { here, total: players.length }), tip: "" };
    return { cls: "some", icon: "fa-triangle-exclamation", text: t("Presence.Some", { here, total: players.length }),
      tip: t("Presence.Missing", { names: behind.map(u => u.name).join(", ") }) };
  }

  #updatePresence() {
    const chip = this.element?.querySelector(".th-presence");
    if (!chip) return;
    const p = this.#presenceHTML();
    chip.className = `th-presence ${p.cls}`;
    chip.title = p.tip;
    chip.innerHTML = `<i class="fa-solid ${p.icon}"></i> ${esc(p.text)}`;
  }

  /** Mirror #busy on the window: "Working…" chip, progress cursor, dimmed controls, the clicked one highlighted. */
  #showBusy() {
    const root = this.element;
    if (!root) return;
    const on = this.#busy;
    root.classList.toggle("th-busy", on);
    root.setAttribute("aria-busy", String(on));
    for (const x of root.querySelectorAll(".th-working")) x.classList.remove("th-working");
    if (on && this.#working) root.querySelector(this.#working)?.classList.add("th-working");
  }

  /** A click while busy: shake the "Working…" chip so it's clear the click was seen, not lost. */
  #nudge() {
    this.#showBusy();
    const chip = this.element?.querySelector(".th-status");
    if (!chip) return;
    chip.classList.remove("th-nudge");
    void chip.offsetWidth; // restart the animation
    chip.classList.add("th-nudge");
  }

  /** Re-draw the grids after tile changes, but only if something visible changed. */
  refreshSoon() {
    if (!this.rendered) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#refreshGrids(), 200);
  }

  #refreshGrids() {
    const grids = this.element?.querySelector(".th-grids");
    if (!grids) return;
    const html = this.#gridsHTML();
    if (html !== this.#lastGrids) { grids.innerHTML = html; this.#lastGrids = html; }
    const editor = this.element.querySelector(".th-editor");
    if (this.#editingId && !canvas.scene?.tiles.get(this.#editingId)) this.#editingId = null;
    if (!this.#editingId && editor) editor.innerHTML = "";
    if (this.#busy) this.#showBusy();
  }

  // ---------- markup ---------------------------------------------------------

  #itemHTML(tile) {
    const m = metaOf(tile), npc = kindOf(tile) === "npc";
    const tags = npc
      ? (m.side === "left" ? "◀ " : "▶ ")
      : `${m.sound ? `<i class="fa-solid fa-music"></i> ` : ""}${m.title ? `<i class="fa-solid fa-heading"></i> ` : ""}`;
    const veil = npc ? `<a class="th-edit th-reveal ${m.nameHidden ? "veiled" : ""}" data-reveal="${tile.id}"
        title="${esc(t(m.nameHidden ? "Reveal.Hidden" : "Reveal.Shown"))}">
        <i class="fa-solid ${m.nameHidden ? "fa-eye-slash" : "fa-eye"}"></i></a>` : "";
    return `<div class="th-item ${tile.hidden ? "" : "live"}" data-id="${tile.id}" role="button" tabindex="0" title="${esc(nameOf(tile))}">
      <img src="${esc(tile.texture.src)}" alt="" loading="lazy">
      <span><span class="th-tags">${tags}</span>${esc(nameOf(tile))}</span>
      <a class="th-edit" data-edit="${tile.id}" title="${esc(t("Editor.Settings"))}"><i class="fa-solid fa-gear"></i></a>
      ${veil}
    </div>`;
  }

  /** Section heading with a "Remove all" button when there is something to remove. */
  #headHTML(label, act, count) {
    return `<h3 class="th-section">${esc(label)}${count ? `<button type="button" class="th-remove-all" data-act="${act}"
      title="${esc(t("RemoveAll.Hint"))}"><i class="fa-solid fa-trash"></i> ${esc(t("RemoveAll.Button"))}</button>` : ""}</h3>`;
  }

  #gridsHTML() {
    if (this.remote) return this.#remoteGridsHTML();
    const stage = this.stage;
    const places = stage.tilesOf("place"), cast = stage.tilesOf("npc");
    return `${this.#headHTML(t("Places"), "remove-places", places.length)}
      <div class="th-grid">${places.length ? places.map(x => this.#itemHTML(x)).join("") : `<p class="th-empty">${esc(t("NoPlaces"))}</p>`}</div>
      ${this.#headHTML(t("Cast"), "remove-cast", cast.length)}
      <div class="th-grid cast">${cast.length ? cast.map(x => this.#itemHTML(x)).join("") : `<p class="th-empty">${esc(t("NoCast"))}</p>`}</div>`;
  }

  #noticeHTML() {
    const legacy = pendingLegacyTiles(canvas.scene).length;
    if (!legacy) return "";
    return `<div class="th-notice"><span>${esc(t("Notice.Legacy", { count: legacy }))}</span>
      <button type="button" data-act="import-legacy"><i class="fa-solid fa-file-import"></i> ${esc(t("Notice.Import"))}</button></div>`;
  }

  #panelHTML() {
    const b = key => esc(t(`Bar.${key}`));
    const p = this.#presenceHTML();
    return `<div class="th-head">
      <div class="th-bar">
        <button type="button" data-act="create-scene"><i class="fa-solid fa-plus"></i> ${b("NewScene")}</button>
        <button type="button" data-act="add-places"><i class="fa-solid fa-image"></i> ${b("AddPlaces")}</button>
        <button type="button" data-act="add-cast"><i class="fa-solid fa-user-plus"></i> ${b("AddCast")}</button>
        <button type="button" data-act="refit"><i class="fa-solid fa-expand"></i> ${b("Refit")}</button>
        <button type="button" data-act="optimize" title="${b("OptimizeHint")}"><i class="fa-solid fa-feather"></i> ${b("Optimize")}</button>
        <button type="button" data-act="preload"><i class="fa-solid fa-download"></i> ${b("Preload")}</button>
        <button type="button" data-act="activate"><i class="fa-solid fa-bullhorn"></i> ${b("Activate")}</button>
        <button type="button" data-act="audit" title="${b("AuditHint")}"><i class="fa-solid fa-scale-balanced"></i> ${b("Audit")}</button>
        <span class="th-status" role="status"><i class="fa-solid fa-spinner fa-spin"></i> ${esc(t("Busy"))}</span>
        <span class="th-presence ${p.cls}" title="${esc(p.tip)}"><i class="fa-solid ${p.icon}"></i> ${esc(p.text)}</span>
      </div>
      <div class="th-bar th-live">
        <button type="button" data-act="black"><i class="fa-solid fa-square"></i> ${b("Black")}</button>
        <button type="button" data-act="clear-cast"><i class="fa-solid fa-user-slash"></i> ${b("ClearCast")}</button>
        <button type="button" data-act="silence"><i class="fa-solid fa-volume-xmark"></i> ${b("Silence")}</button>
        <label><input type="checkbox" name="th-clear" ${setting("clearCastOnPlace") ? "checked" : ""}> ${b("ClearCastOnPlace")}</label>
        <label class="th-fade"><input type="checkbox" name="th-fade" ${setting("fade") ? "checked" : ""}> ${b("Fade")}</label>
      </div>
      <div class="th-editor"></div>
    </div>
    ${this.#noticeHTML()}
    <div class="th-grids">${this.#gridsHTML()}</div>`;
  }

  // ---------- over the map --------------------------------------------------

  #remoteItemHTML(tile, live) {
    const npc = kindOf(tile) === "npc", m = metaOf(tile);
    const tags = npc
      ? `${m.side === "left" ? "◀ " : "▶ "}${m.nameHidden ? `<i class="fa-solid fa-eye-slash"></i> ` : ""}`
      : `${m.sound ? `<i class="fa-solid fa-music"></i> ` : ""}${m.title ? `<i class="fa-solid fa-heading"></i> ` : ""}`;
    const data = npc ? `data-ov-npc="${tile.id}"` : `data-ov-place="${tile.id}"`;
    return `<div class="th-item ${live ? "live" : ""}" ${data} role="button" tabindex="0" title="${esc(nameOf(tile))}">
      <img src="${esc(tile.texture.src)}" alt="" loading="lazy">
      <span><span class="th-tags">${tags}</span>${esc(nameOf(tile))}</span>
    </div>`;
  }

  #remoteGridsHTML() {
    const scene = this.#overScene();
    if (!scene) return `<p class="th-empty">${esc(t("Over.NoTheater"))}</p>`;
    const st = overlay.state(), on = overlayIsOn(st);
    const stage = new Stage(scene);
    const places = stage.tilesOf("place"), cast = stage.tilesOf("npc");
    const livePlace = id => on && st.place?.id === id;
    const liveNpc = id => on && (st.cast ?? []).some(c => c.id === id);
    return `${this.#headHTML(t("Places"), "remove-places", places.length)}
      <div class="th-grid">${places.length ? places.map(x => this.#remoteItemHTML(x, livePlace(x.id))).join("") : `<p class="th-empty">${esc(t("Over.NoPlaces"))}</p>`}</div>
      ${this.#headHTML(t("Cast"), "remove-cast", cast.length)}
      <div class="th-grid cast">${cast.length ? cast.map(x => this.#remoteItemHTML(x, liveNpc(x.id))).join("") : `<p class="th-empty">${esc(t("Over.NoCast"))}</p>`}</div>`;
  }

  #remoteHTML() {
    const o = key => esc(t(`Over.${key}`));
    const p = overlay.prefs();
    const scenes = overlay.theaterScenes(), current = this.#overScene();
    const sceneSel = scenes.length
      ? `<select name="ov-scene">${scenes.map(s => `<option value="${s.id}" ${s === current ? "selected" : ""}>${esc(s.name)}${
        s === canvas.scene ? ` ${esc(t("Over.ThisMap"))}` : ""}</option>`).join("")}</select>`
      : "";
    const stray = this.#tilesOnMap().length;
    const notice = stray ? `<div class="th-notice"><span>${esc(t("Over.StrayTiles", { count: stray }))}</span>
      <button type="button" data-act="ov-hide-tiles"><i class="fa-solid fa-eye-slash"></i> ${o("StrayHide")}</button></div>` : "";
    const players = game.users.filter(u => !u.isGM)
      .sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    const who = players.map(u => `<label class="th-ov-user ${u.active ? "" : "off"}" title="${esc(u.character?.name ?? "")}">
        <input type="checkbox" name="ov-user" value="${u.id}" ${p.users?.includes(u.id) ? "checked" : ""}> ${esc(u.name)}</label>`).join("");
    const options = (name, list, value, prefix) => `<select name="${name}">${list.map(v =>
      `<option value="${v}" ${v === value ? "selected" : ""}>${o(`${prefix}.${v}`)}</option>`).join("")}</select>`;
    return `<div class="th-head">
      <div class="th-bar">
        <span class="th-ov-badge"><i class="fa-solid fa-layer-group"></i> ${o("Badge")}</span>
        ${sceneSel ? `<label class="th-ov-scene">${o("Scene")} ${sceneSel}</label>` : ""}
        <button type="button" data-act="ov-preload" title="${o("PreloadHint")}"><i class="fa-solid fa-download"></i> ${o("Preload")}</button>
        <button type="button" data-act="ov-image" title="${o("ImageHint")}"><i class="fa-solid fa-image"></i> ${o("Image")}</button>
        ${scenes.length ? "" : `<button type="button" data-act="create-scene"><i class="fa-solid fa-plus"></i> ${esc(t("Bar.NewScene"))}</button>`}
        <span class="th-status" role="status"><i class="fa-solid fa-spinner fa-spin"></i> ${esc(t("Busy"))}</span>
      </div>
      <div class="th-bar th-ov-who">
        <span class="th-ov-label">${o("Who")}</span>
        <span class="th-ov-all">${o("Everyone")}</span>
        ${who || `<span class="th-ov-none">${o("NoPlayers")}</span>`}
      </div>
      <div class="th-bar th-live">
        <label>${o("ModeLabel")} ${options("ov-mode", OVERLAY_MODES, p.mode, "Mode")}</label>
        <label>${o("FxLabel")} ${options("ov-fx", OVERLAY_FX, p.transition, "Fx")}</label>
        <label><input type="checkbox" name="th-clear" ${setting("clearCastOnPlace") ? "checked" : ""}> ${esc(t("Bar.ClearCastOnPlace"))}</label>
        <button type="button" data-act="ov-clear"><i class="fa-solid fa-user-slash"></i> ${esc(t("Bar.ClearCast"))}</button>
        <button type="button" data-act="ov-hide" class="th-ov-hide"><i class="fa-solid fa-eye-slash"></i> ${o("Hide")}</button>
      </div>
      <p class="th-ed-hint th-ov-hint">${o("Hint")}</p>
    </div>
    ${notice}
    <div class="th-grids">${this.#gridsHTML()}</div>`;
  }

  /** Any picture from the server, with an optional title card. */
  async #showAnyImage() {
    const src = await pickFile("image");
    if (!src) return;
    const { DialogV2 } = foundry.applications.api;
    const title = await DialogV2.prompt({
      window: { title: t("Over.ImageTitle"), icon: "fa-solid fa-image" },
      content: `<div class="form-group"><label>${esc(t("Editor.TitleCard"))}</label>
        <input type="text" name="title" placeholder="${esc(t("Editor.TitlePlaceholder"))}" autofocus></div>
        <p class="hint">${esc(t("Editor.TitleHint"))}</p>`,
      ok: { label: t("Over.ImageShow"), icon: "fa-solid fa-eye", callback: (ev, button) => button.form?.elements?.title?.value ?? "" },
      rejectClose: false
    }).catch(() => null);
    if (title === null || title === undefined) return;
    await overlay.showImage(src, { title: title.trim() || null });
  }

  #editorHTML(tile) {
    const m = metaOf(tile);
    const e = key => esc(t(`Editor.${key}`));
    const buttons = `<div class="th-ed-btns">
        <button type="button" data-ed="save"><i class="fa-solid fa-check"></i> ${e("Save")}</button>
        <button type="button" data-ed="cancel">${e("Cancel")}</button>
        <button type="button" data-ed="delete"><i class="fa-solid fa-trash"></i> ${e("Remove")}</button></div>`;
    if (kindOf(tile) === "npc") {
      return `<div class="th-ed-head"><i class="fa-solid fa-user"></i> ${esc(nameOf(tile))}</div>
        <div class="th-ed-row"><label>${e("NameOnCard")}</label><input type="text" name="ed-name" value="${esc(m.name ?? m.label)}"></div>
        <div class="th-ed-row"><label>${e("PlayersSee")}</label><select name="ed-hidden">
          <option value="0" ${m.nameHidden ? "" : "selected"}>${e("SeeName")}</option>
          <option value="1" ${m.nameHidden ? "selected" : ""}>${e("SeeVeiled")}</option></select></div>
        <div class="th-ed-row"><label>${e("Side")}</label><select name="ed-side">
          <option value="left" ${m.side === "left" ? "selected" : ""}>${e("Left")}</option>
          <option value="right" ${m.side !== "left" ? "selected" : ""}>${e("Right")}</option></select></div>
        ${buttons}`;
    }
    return `<div class="th-ed-head"><i class="fa-solid fa-image"></i> ${esc(nameOf(tile))}</div>
      <div class="th-ed-row"><label>${e("TitleCard")}</label><input type="text" name="ed-title" value="${esc(m.title ?? "")}" placeholder="${e("TitlePlaceholder")}"></div>
      <p class="th-ed-hint">${e("TitleHint")}</p>
      <div class="th-ed-row"><label>${e("Sound")}</label><select name="ed-sound">${soundOptions(m.sound)}</select></div>
      ${buttons}`;
  }

  #readEditor(tile, editor) {
    const get = n => editor.querySelector(`[name=${n}]`)?.value;
    return kindOf(tile) === "npc"
      ? { name: get("ed-name"), side: get("ed-side"), hidden: get("ed-hidden") === "1" }
      : { title: get("ed-title"), sound: get("ed-sound") };
  }

  /** Optimize (or restore) this scene's images, after saying what will happen. */
  async #optimize() {
    const { DialogV2 } = foundry.applications.api;
    const choice = await DialogV2.wait({
      window: { title: t("Optimize.Title"), icon: "fa-solid fa-feather" },
      content: `<p>${esc(t("Optimize.Body"))}</p><p class="th-ed-hint">${esc(t("Optimize.Note"))}</p>`,
      buttons: [
        { action: "optimize", label: t("Optimize.Run"), icon: "fa-solid fa-feather", default: true },
        { action: "restore", label: t("Optimize.Restore"), icon: "fa-solid fa-rotate-left" },
        { action: "cancel", label: t("Editor.Cancel") }
      ],
      rejectClose: false
    }).catch(() => null);
    if (choice === "optimize") await this.stage.optimizeImages();
    else if (choice === "restore") await this.stage.restoreOriginals();
  }

  // ---------- clicks ---------------------------------------------------------

  async #onClick(ev) {
    const el = ev.target.closest("[data-reveal], [data-edit], [data-ed], [data-act], [data-ov-place], [data-ov-npc], .th-item");
    if (!el || !this.element.contains(el)) return;
    ev.preventDefault(); ev.stopPropagation();
    if (this.#busy) return this.#nudge();
    const stage = this.stage, scene = canvas.scene;
    const fade = this.element.querySelector("input[name=th-fade]")?.checked;
    const editor = this.element.querySelector(".th-editor");
    this.#busy = true;
    this.#working = controlSelector(el);
    this.#busyTimer = setTimeout(() => this.#showBusy(), BUSY_DELAY_MS);
    try {
      if (el.dataset.ovPlace || el.dataset.ovNpc) {
        const tile = this.#overScene()?.tiles.get(el.dataset.ovPlace ?? el.dataset.ovNpc);
        if (!tile) return;
        if (el.dataset.ovNpc) await overlay.showNpc(tile);
        else await overlay.showPlace(tile, { clearCast: this.element.querySelector("input[name=th-clear]")?.checked });
        return;
      }
      if (el.dataset.reveal) {
        const tile = scene.tiles.get(el.dataset.reveal);
        if (tile) await stage.setNameHidden(tile, !metaOf(tile).nameHidden);
        if (this.#editingId === el.dataset.reveal) editor.innerHTML = this.#editorHTML(scene.tiles.get(this.#editingId));
        return;
      }
      if (el.dataset.edit) {
        this.#editingId = el.dataset.edit;
        editor.innerHTML = this.#editorHTML(scene.tiles.get(this.#editingId));
        return;
      }
      if (el.dataset.ed) {
        const tile = scene.tiles.get(this.#editingId);
        if (el.dataset.ed === "save" && tile) await stage.save(tile, this.#readEditor(tile, editor));
        if (el.dataset.ed === "delete" && tile && !await stage.remove(tile)) return;
        this.#editingId = null;
        return;
      }
      if (el.classList.contains("th-item")) {
        const tile = scene.tiles.get(el.dataset.id);
        if (!tile) return;
        if (kindOf(tile) === "npc") await stage.toggleNpc(tile.id, fade);
        else await stage.showPlace(tile.id, fade, { clearCast: this.element.querySelector("input[name=th-clear]")?.checked });
        return;
      }
      switch (el.dataset.act) {
        case "add-places": await stage.addPlaces(); break;
        case "add-cast": await stage.addCast(); break;
        case "black": await stage.black(fade); break;
        case "clear-cast": await stage.clearCast(fade); break;
        case "silence": await stage.silence(); break;
        case "refit": await stage.refitAll(); break;
        case "preload": await stage.preload(); break;
        case "activate": await stage.activate(); break;
        case "optimize": await this.#optimize(); break;
        case "audit": AssetAudit.open(); break;
        case "create-scene": await createTheaterScene(); break;
        case "ov-hide": await overlay.hide(); break;
        case "ov-clear": await overlay.clearCast(); break;
        case "remove-places":
        case "remove-cast": {
          // Over a map: the scene listed in the panel; otherwise the Theater scene being viewed.
          const target = this.remote ? this.#overScene() : canvas.scene;
          if (!target) break;
          if (this.#editingId) { this.#editingId = null; if (editor) editor.innerHTML = ""; }
          await new Stage(target).removeAll(el.dataset.act === "remove-cast" ? "npc" : "place");
          if (this.remote) this.render();
          break;
        }
        case "ov-hide-tiles": {
          const tiles = this.#tilesOnMap();
          if (tiles.length) await this.stage.hide(tiles);
          this.render();
          break;
        }
        case "ov-image": await this.#showAnyImage(); break;
        case "ov-preload": {
          const theater = this.#overScene();
          if (theater) await new Stage(theater).preload({ dom: true });
          break;
        }
        case "import-legacy": {
          const n = await migrateScene(scene);
          ui.notifications.info(t(n ? "Notify.Imported" : "Notify.NothingToImport", { count: n }));
          this.render();
          break;
        }
      }
    } catch (err) {
      console.error(`${MODULE_ID} |`, err);
      ui.notifications.error(t("Notify.Error", { message: err.message }));
    } finally {
      this.#busy = false;
      this.#working = null;
      clearTimeout(this.#busyTimer);
      this.#showBusy();
      this.#refreshGrids();
    }
  }
}
