// The Theater "stage": everything that changes tiles on the current scene.
// The panel (panel.mjs) only calls these methods and renders the result.
import {
  MODULE_ID, BAND, FADE_STEPS, FADE_MS, TITLE_FADE_IN_MS, TITLE_FADE_OUT_MS
} from "./constants.mjs";
import { t, warn, info } from "./i18n.mjs";
import { setting } from "./settings.mjs";
import {
  metaOf, kindOf, nameOf, labelFromPath, containFit, centerIn, npcPosition, npcSlide,
  titleBox, nextOrder, nextSort, alternateSide, escapeHTML
} from "./util.mjs";
import { pickFolder, listImages, upload, loadImg } from "./files.mjs";
import { renderCard, renderTitle } from "./render.mjs";
import * as sound from "./sound.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const flag = key => `flags.${MODULE_ID}.${key}`;
const isOn = tile => !tile.hidden || tile.alpha > 0;

/** Real top-left of a tile, whatever the tile anchor is in this Foundry version. */
const realBounds = tile => {
  const b = tile.shape?.bounds ?? tile.object?.bounds;
  return b ? { x: b.x, y: b.y } : { x: tile.x, y: tile.y };
};

export class Stage {
  #titleRun = 0;

  get scene() { return canvas.scene; }
  get rect() { return canvas.dimensions.sceneRect; }
  get source() { return this.scene.getFlag(MODULE_ID, "source") ?? "data"; }

  tilesOf(kind) {
    return this.scene.tiles
      .filter(tile => metaOf(tile) && kindOf(tile) === kind)
      .sort((a, b) => (metaOf(a).order ?? 0) - (metaOf(b).order ?? 0));
  }
  #nextSort(kind) { return nextSort(kind, this.tilesOf(kind).map(tile => tile.sort)); }
  #nextOrder(kind) { return nextOrder(this.tilesOf(kind).map(tile => metaOf(tile).order)); }

  // ---------- low-level tile moves -----------------------------------------

  /** Put tiles at an exact top-left/size, correcting for the tile anchor. */
  async place(entries) {
    const scene = this.scene;
    if (!entries.length) return;
    await scene.updateEmbeddedDocuments("Tile", entries.map(e => ({
      _id: e.id, x: e.left, y: e.top, width: e.width, height: e.height, rotation: 0
    })));
    await sleep(50);
    const fixes = [];
    for (const e of entries) {
      const tile = scene.tiles.get(e.id);
      if (!tile) continue;
      const b = realBounds(tile);
      const dx = e.left - b.x, dy = e.top - b.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) fixes.push({ _id: tile.id, x: tile.x + dx, y: tile.y + dy });
    }
    if (fixes.length) await scene.updateEmbeddedDocuments("Tile", fixes);
  }

  /** Fade (and optionally slide) tiles in small steps. Returns false if `stop()` cut it short. */
  async steps(entries, { ms = FADE_MS, stop } = {}) {
    const scene = this.scene;
    for (let i = 1; i <= FADE_STEPS; i++) {
      await sleep(ms);
      if (stop?.()) return false;
      const p = i / FADE_STEPS;
      await scene.updateEmbeddedDocuments("Tile", entries.filter(e => scene.tiles.get(e.id)).map(e => {
        const u = { _id: e.id, alpha: e.a0 + (e.a1 - e.a0) * p };
        if (e.x0 != null) u.x = Math.round(e.x0 + (e.x1 - e.x0) * p);
        return u;
      }));
    }
    return true;
  }

  /** Hidden tiles show to the GM at half alpha, so "off" means hidden AND alpha 0. */
  async hide(docs) {
    if (!docs.length) return;
    await this.scene.updateEmbeddedDocuments("Tile", docs.map(tile => ({
      _id: tile.id, hidden: true, alpha: 0,
      ...(kindOf(tile) === "npc" && metaOf(tile).home ? { x: metaOf(tile).home.x, y: metaOf(tile).home.y } : {})
    })));
  }

  // ---------- generated images ----------------------------------------------

  async makeCard(src, name, { hidden = false } = {}) {
    try {
      const img = await loadImg(src);
      const { blob, w, h } = await renderCard({ img, name, hidden, rect: this.rect });
      const path = await upload(this.source, blob, hidden ? "cast-unknown" : `cast-${name}`);
      return { path, w, h };
    } catch (err) {
      console.warn(`${MODULE_ID} | card generation failed, using the raw portrait`, err);
      const img = await loadImg(src).catch(() => null);
      const iw = img?.naturalWidth || 600, ih = img?.naturalHeight || 800;
      const fit = containFit(iw, ih, this.rect.width * 0.30, this.rect.height * 0.74);
      return { path: src, w: fit.width, h: fit.height };
    }
  }

  async makeTitle(text) {
    const blob = await renderTitle({ text, rect: this.rect });
    return upload(this.source, blob, "title");
  }

  // ---------- layout ----------------------------------------------------------

  async fitPlaces(docs) {
    const scene = this.scene, r = this.rect, entries = [];
    for (const tile of docs) {
      const img = await loadImg(tile.texture.src);
      const size = containFit(img.naturalWidth, img.naturalHeight, r.width, r.height);
      entries.push({ id: tile.id, ...size, ...centerIn(r, size.width, size.height) });
    }
    await this.place(entries);
    const hiddenOnes = docs.filter(tile => scene.tiles.get(tile.id)?.hidden);
    if (hiddenOnes.length) await scene.updateEmbeddedDocuments("Tile", hiddenOnes.map(tile => ({ _id: tile.id, alpha: 0 })));
  }

  async layoutNpcs(docs) {
    const scene = this.scene;
    if (!docs.length) return;
    await this.place(docs.map(tile => {
      const m = metaOf(tile);
      return { id: tile.id, ...npcPosition(this.rect, m.w ?? tile.width, m.h ?? tile.height, m.side) };
    }));
    await scene.updateEmbeddedDocuments("Tile", docs.map(tile => {
      const d = scene.tiles.get(tile.id);
      return { _id: tile.id, [flag("home")]: { x: d.x, y: d.y } };
    }));
  }

  async layoutTitles(docs) {
    const box = titleBox(this.rect);
    await this.place(docs.map(tile => ({ id: tile.id, ...box })));
  }

  async refitAll() {
    await this.fitPlaces(this.tilesOf("place"));
    await this.layoutNpcs(this.tilesOf("npc"));
    await this.layoutTitles(this.tilesOf("title"));
    info("Notify.Refitted");
  }

  // ---------- showing things --------------------------------------------------

  async #runTitle(placeDoc) {
    const run = ++this.#titleRun;
    const stop = () => run !== this.#titleRun;
    const card = this.tilesOf("title").find(tile => metaOf(tile).parent === placeDoc.id);
    await this.hide(this.tilesOf("title").filter(tile => isOn(tile) && tile !== card));
    if (!card) return;
    await card.update({ hidden: false, alpha: 0, sort: this.#nextSort("title") });
    if (!await this.steps([{ id: card.id, a0: 0, a1: 1 }], { ms: TITLE_FADE_IN_MS, stop })) return;
    await sleep(setting("titleHold") * 1000);
    if (stop()) return;
    if (!await this.steps([{ id: card.id, a0: 1, a1: 0 }], { ms: TITLE_FADE_OUT_MS, stop })) return;
    await this.hide([card]);
  }

  async showPlace(id, fade) {
    const target = this.scene.tiles.get(id);
    if (!target) return;
    const others = this.tilesOf("place").filter(tile => tile.id !== id && isOn(tile));
    const sort = this.#nextSort("place");
    if (fade) {
      await target.update({ hidden: false, alpha: 0, sort });
      await this.steps([{ id, a0: 0, a1: 1 }]);
    } else {
      await target.update({ hidden: false, alpha: 1, sort });
    }
    await this.hide(others);
    await sound.switchTo(this.scene, metaOf(target).sound);
    this.#runTitle(target).catch(err => console.error(`${MODULE_ID} | title`, err));
  }

  async toggleNpc(id, fade) {
    const tile = this.scene.tiles.get(id);
    if (!tile) return;
    const m = metaOf(tile);
    const side = m.side ?? "right";
    const home = m.home ?? { x: tile.x, y: tile.y };
    const off = npcSlide(this.rect, side);
    const slideOut = docs => this.steps(docs.map(o => {
      const h = metaOf(o).home ?? { x: o.x };
      return { id: o.id, a0: o.alpha, a1: 0, x0: h.x, x1: h.x + off };
    }));

    if (isOn(tile)) {
      if (fade) await slideOut([tile]);
      return this.hide([tile]);
    }
    const rivals = this.tilesOf("npc").filter(o => o.id !== id && isOn(o) && (metaOf(o).side ?? "right") === side);
    if (rivals.length) { if (fade) await slideOut(rivals); await this.hide(rivals); }
    const sort = this.#nextSort("npc");
    if (fade) {
      await tile.update({ hidden: false, alpha: 0, x: home.x + off, y: home.y, sort });
      await this.steps([{ id, a0: 0, a1: 1, x0: home.x + off, x1: home.x }]);
    } else {
      await tile.update({ hidden: false, alpha: 1, x: home.x, y: home.y, sort });
    }
  }

  /** Swap a card between "name shown" and "name veiled". Each version is made once and remembered. */
  async setNameHidden(tile, hidden) {
    const m = metaOf(tile);
    const name = m.name ?? m.label;
    let shown = m.cardShown ?? (!m.nameHidden ? tile.texture.src : null);
    let veiled = m.cardHidden ?? null;
    if (hidden && !veiled) veiled = (await this.makeCard(m.src, name, { hidden: true })).path;
    if (!hidden && !shown) shown = (await this.makeCard(m.src, name)).path;
    await tile.update({
      "texture.src": hidden ? veiled : shown,
      [flag("nameHidden")]: hidden,
      [flag("cardShown")]: shown,
      [flag("cardHidden")]: veiled
    });
  }

  async black(fade) {
    this.#titleRun++;
    const on = this.scene.tiles.filter(tile => metaOf(tile) && isOn(tile));
    if (!on.length) return;
    if (fade) await this.steps(on.map(tile => ({ id: tile.id, a0: tile.alpha, a1: 0 })));
    await this.hide(on);
  }

  silence() { return sound.silence(this.scene); }
  activate() { return this.scene.activate(); }

  async preload() {
    const scene = this.scene;
    await game.scenes.preload(scene.id, true);
    const count = await sound.preloadLinked(this.tilesOf("place").map(tile => metaOf(tile).sound));
    info(count ? "Notify.PreloadingSounds" : "Notify.Preloading", { count });
  }

  // ---------- adding -----------------------------------------------------------

  async #pickImages() {
    const picked = await pickFolder();
    if (!picked) return null;
    await this.scene.setFlag(MODULE_ID, "source", picked.source);
    const files = await listImages(picked.source, picked.path);
    if (!files.length) { warn("Notify.NoImages"); return null; }
    return files;
  }

  async addPlaces() {
    const files = await this.#pickImages();
    if (!files) return;
    const existing = new Set(this.tilesOf("place").map(tile => metaOf(tile).src ?? tile.texture.src));
    const r = this.rect;
    let order = this.#nextOrder("place");
    const data = files.filter(src => !existing.has(src)).map(src => {
      const label = labelFromPath(src);
      return {
        name: label, texture: { src },
        x: r.x, y: r.y, width: r.width, height: r.height,
        hidden: true, alpha: 0, sort: BAND.place + order,
        flags: { [MODULE_ID]: { kind: "place", src, label, order: order++ } }
      };
    });
    if (!data.length) return info("Notify.PlacesLoaded");
    const created = await this.scene.createEmbeddedDocuments("Tile", data);
    await this.fitPlaces(created);
    info("Notify.AddedPlaces", { count: created.length });
  }

  async addCast() {
    const files = await this.#pickImages();
    if (!files) return;
    const existing = new Set(this.tilesOf("npc").map(tile => metaOf(tile).src));
    const todo = files.filter(src => !existing.has(src));
    if (!todo.length) return info("Notify.CastLoaded");
    info("Notify.Framing", { count: todo.length });
    const r = this.rect;
    let order = this.#nextOrder("npc");
    const data = [];
    for (const src of todo) {
      const name = labelFromPath(src);
      const card = await this.makeCard(src, name);
      data.push({
        name: `Cast — ${name}`, texture: { src: card.path },
        x: r.x, y: r.y, width: card.w, height: card.h,
        hidden: true, alpha: 0, sort: BAND.npc,
        flags: { [MODULE_ID]: {
          kind: "npc", src, label: name, name, side: alternateSide(order), w: card.w, h: card.h,
          cardShown: card.path, nameHidden: false, order: order++
        } }
      });
    }
    const created = await this.scene.createEmbeddedDocuments("Tile", data);
    await this.layoutNpcs(created);
    info("Notify.AddedCast", { count: created.length });
  }

  // ---------- editing ----------------------------------------------------------

  /** values: NPC { name, side, hidden } or place { title, sound } */
  async save(tile, values) {
    const scene = this.scene;
    const m = metaOf(tile);
    if (kindOf(tile) === "npc") {
      const name = values.name?.trim() || m.label;
      if (name !== (m.name ?? m.label)) {
        // a new name makes both card versions out of date
        const card = await this.makeCard(m.src, name);
        await tile.update({
          name: `Cast — ${name}`, "texture.src": card.path,
          [flag("name")]: name, [flag("w")]: card.w, [flag("h")]: card.h,
          [flag("cardShown")]: card.path, [flag("cardHidden")]: null, [flag("nameHidden")]: false
        });
      }
      if (!!values.hidden !== !!metaOf(tile).nameHidden) await this.setNameHidden(scene.tiles.get(tile.id), !!values.hidden);
      if (values.side !== m.side) await tile.update({ [flag("side")]: values.side });
      await this.layoutNpcs([scene.tiles.get(tile.id)]);
      return;
    }

    const title = values.title?.trim() ?? "";
    const card = this.tilesOf("title").find(o => metaOf(o).parent === tile.id);
    if (!title) {
      if (card) await card.delete();
    } else if (title !== m.title || !card) {
      const path = await this.makeTitle(title);
      if (card) {
        await card.update({ "texture.src": path });
      } else {
        const box = titleBox(this.rect);
        const [created] = await scene.createEmbeddedDocuments("Tile", [{
          name: `Title — ${nameOf(tile)}`, texture: { src: path },
          x: box.left, y: box.top, width: box.width, height: box.height,
          hidden: true, alpha: 0, sort: BAND.title,
          flags: { [MODULE_ID]: { kind: "title", parent: tile.id, order: 0 } }
        }]);
        await this.layoutTitles([created]);
      }
    }
    if (values.sound) await sound.ensureLoopAndFade(values.sound, setting("soundFade") * 1000);
    await tile.update({ [flag("title")]: title || null, [flag("sound")]: values.sound || null });
  }

  async remove(tile) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Remove.Title") },
      content: `<p>${t("Remove.Body", { name: escapeHTML(nameOf(tile)) })}</p>`
    });
    if (!ok) return false;
    const ids = [tile.id, ...this.tilesOf("title").filter(o => metaOf(o).parent === tile.id).map(o => o.id)];
    await this.scene.deleteEmbeddedDocuments("Tile", ids);
    return true;
  }
}
