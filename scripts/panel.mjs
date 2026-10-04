import { MODULE_ID } from "./constants.mjs";
import { t, warn } from "./i18n.mjs";
import { setting } from "./settings.mjs";
import { metaOf, kindOf, nameOf, escapeHTML as esc } from "./util.mjs";
import { Stage } from "./stage.mjs";
import { migrateScene, pendingLegacyTiles } from "./migrate.mjs";
import { createTheaterScene } from "./scene.mjs";

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
    this.#instance ??= new TheaterPanel({ position: { height: Math.min(780, Math.round(window.innerHeight * 0.85)) } });
    this.#instance.render({ force: true });
    this.#instance.bringToFront?.();
    return this.#instance;
  }

  stage = new Stage();
  #editingId = null;
  #busy = false;
  #bound = false;
  #lastGrids = "";
  #timer = null;

  get title() { return t("Title", { scene: canvas.scene?.name ?? "" }); }

  async _prepareContext() { return {}; }

  async _renderHTML() { return this.#panelHTML(); }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender() {
    this.#lastGrids = this.element.querySelector(".th-grids")?.innerHTML ?? "";
    if (this.#bound) return;
    this.#bound = true;
    this.element.addEventListener("click", ev => this.#onClick(ev));
  }

  async _onClose() { this.#editingId = null; clearTimeout(this.#timer); }

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

  #gridsHTML() {
    const stage = this.stage;
    const places = stage.tilesOf("place"), cast = stage.tilesOf("npc");
    return `<h3>${esc(t("Places"))}</h3>
      <div class="th-grid">${places.length ? places.map(x => this.#itemHTML(x)).join("") : `<p class="th-empty">${esc(t("NoPlaces"))}</p>`}</div>
      <h3>${esc(t("Cast"))}</h3>
      <div class="th-grid cast">${cast.length ? cast.map(x => this.#itemHTML(x)).join("") : `<p class="th-empty">${esc(t("NoCast"))}</p>`}</div>`;
  }

  #footHTML() {
    const legacy = pendingLegacyTiles(canvas.scene).length;
    return `<div class="th-foot">
      <button type="button" data-act="create-scene"><i class="fa-solid fa-plus"></i> ${esc(t("Footer.CreateScene"))}</button>
      ${legacy ? `<button type="button" data-act="import-legacy"><i class="fa-solid fa-file-import"></i> ${esc(t("Footer.Import", { count: legacy }))}</button>` : ""}
    </div>`;
  }

  #panelHTML() {
    const b = key => esc(t(`Bar.${key}`));
    return `<div class="th-head">
      <div class="th-bar">
        <button type="button" data-act="add-places"><i class="fa-solid fa-image"></i> ${b("AddPlaces")}</button>
        <button type="button" data-act="add-cast"><i class="fa-solid fa-user-plus"></i> ${b("AddCast")}</button>
        <button type="button" data-act="black"><i class="fa-solid fa-square"></i> ${b("Black")}</button>
        <button type="button" data-act="silence"><i class="fa-solid fa-volume-xmark"></i> ${b("Silence")}</button>
        <button type="button" data-act="refit"><i class="fa-solid fa-expand"></i> ${b("Refit")}</button>
        <button type="button" data-act="preload"><i class="fa-solid fa-download"></i> ${b("Preload")}</button>
        <button type="button" data-act="activate"><i class="fa-solid fa-bullhorn"></i> ${b("Activate")}</button>
        <label><input type="checkbox" name="th-fade" ${setting("fade") ? "checked" : ""}> ${b("Fade")}</label>
      </div>
      <div class="th-editor"></div>
    </div>
    <div class="th-grids">${this.#gridsHTML()}</div>
    ${this.#footHTML()}`;
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

  // ---------- clicks ---------------------------------------------------------

  async #onClick(ev) {
    const el = ev.target.closest("[data-reveal], [data-edit], [data-ed], [data-act], .th-item");
    if (!el || !this.element.contains(el) || this.#busy) return;
    ev.preventDefault(); ev.stopPropagation();
    const stage = this.stage, scene = canvas.scene;
    const fade = this.element.querySelector("input[name=th-fade]")?.checked;
    const editor = this.element.querySelector(".th-editor");
    this.#busy = true;
    try {
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
        else await stage.showPlace(tile.id, fade);
        return;
      }
      switch (el.dataset.act) {
        case "add-places": await stage.addPlaces(); break;
        case "add-cast": await stage.addCast(); break;
        case "black": await stage.black(fade); break;
        case "silence": await stage.silence(); break;
        case "refit": await stage.refitAll(); break;
        case "preload": await stage.preload(); break;
        case "activate": await stage.activate(); break;
        case "create-scene": await createTheaterScene(); break;
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
      this.#refreshGrids();
    }
  }
}
