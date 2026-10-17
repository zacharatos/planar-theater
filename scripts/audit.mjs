// The asset audit (GM): what the world makes players download, and what to do about it.
//   Files      every image, sound and video the world's documents and settings point at, with its
//              size on the server; heavy images get a lighter WebP copy and every use is repointed
//              in one click; any file can be repointed to another one everywhere at once.
//   World data what each player receives on joining: size per document type, the biggest documents
//              and folders, and moving unused actors and items out to a compendium.
import { MODULE_ID } from "./constants.mjs";
import { t, info, warn } from "./i18n.mjs";
import {
  escapeHTML as esc, collectMedia, mediaKind, isPackageAsset, isHeavy, needsOptimizing,
  formatBytes, pathUpdates, deepReplace
} from "./util.mjs";
import { fileSize, optimizeImage } from "./optimize.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const FP = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;

/** World collections scanned for files. */
const FILE_TYPES = ["Scene", "Actor", "Item", "JournalEntry", "RollTable", "Playlist", "Macro", "Cards", "User"];
/** World collections measured on the World data tab. */
const DATA_TYPES = [...FILE_TYPES, "ChatMessage", "Combat", "Folder"];
/** What can be moved out to a compendium. */
const MOVABLE = ["Actor", "Item"];
/** Never repointed: the original a Theater place came from, and the list of originals. */
const SKIP = [`flags.${MODULE_ID}.src`, `flags.${MODULE_ID}.orig`];
const KIND_ICON = { image: "fa-image", audio: "fa-music", video: "fa-film" };
const SIZE_WORKERS = 6;

const jsonSize = value => { try { return JSON.stringify(value).length; } catch { return 0; } };

/** The world's settings, with their values parsed. */
function worldSettings() {
  const out = [];
  for (const s of game.settings.storage?.get?.("world") ?? []) {
    let value = s.value;
    if (typeof value === "string") { try { value = JSON.parse(value); } catch { /* plain string */ } }
    out.push({ key: s.key, value, doc: s });
  }
  return out;
}

/* ---------- Files ------------------------------------------------------------ */

/** Every media path in the world, with what uses it. */
function scanFiles() {
  const files = new Map();
  const add = (paths, label) => {
    for (const path of paths) {
      const kind = mediaKind(path);
      if (!kind) continue;
      const f = files.get(path) ?? files.set(path, { path, kind, uses: new Set(), bytes: undefined }).get(path);
      f.uses.add(label);
    }
  };
  for (const type of FILE_TYPES) {
    for (const doc of game.collections.get(type) ?? []) add(collectMedia(doc.toObject()), `${type}: ${doc.name}`);
  }
  for (const s of worldSettings()) add(collectMedia(s.value), `${t("Audit.Setting")}: ${s.key}`);
  return files;
}

/** Replace a path in one document and its embedded documents. Returns how many were changed. */
async function repointDoc(doc, from, to) {
  let changed = 0;
  const embedded = Object.entries(doc.constructor.metadata?.embedded ?? {});
  const data = doc.toObject();
  for (const [, field] of embedded) delete data[field];
  const updates = pathUpdates(data, from, to, { skip: SKIP });
  if (Object.keys(updates).length) { await doc.update(updates); changed++; }
  for (const [name, field] of embedded) {
    if (name === "ActorDelta") continue; // a token's synthetic actor: follows its actor
    const coll = doc[field];
    for (const child of coll?.contents ?? []) changed += await repointDoc(child, from, to);
  }
  return changed;
}

/** Replace a path everywhere: world documents and world settings. Returns how many places changed. */
export async function repointEverywhere(from, to) {
  let changed = 0;
  for (const type of FILE_TYPES) {
    for (const doc of game.collections.get(type) ?? []) {
      if (!collectMedia(doc.toObject()).has(from)) continue;
      changed += await repointDoc(doc, from, to);
    }
  }
  for (const s of worldSettings()) {
    const r = deepReplace(s.value, from, to);
    if (!r.changed) continue;
    const dot = s.key.indexOf(".");
    if (game.settings.settings.has(s.key)) await game.settings.set(s.key.slice(0, dot), s.key.slice(dot + 1), r.value);
    else await s.doc.update({ value: JSON.stringify(r.value) });
    changed++;
  }
  return changed;
}

/** Ask for a file (image, audio or video). Resolves the path, or null if the picker was closed. */
function pickFile(kind, current) {
  return new Promise(resolve => {
    const picker = new (FP())({
      type: kind === "audio" ? "audio" : "imagevideo", current,
      callback: path => resolve(path)
    });
    const close = picker.close.bind(picker);
    picker.close = async (...args) => { setTimeout(() => resolve(null), 150); return close(...args); };
    picker.render(true);
  });
}

/* ---------- World data -------------------------------------------------------- */

/** Ids mentioned anywhere a document can be linked from: journal text, macros, world settings. */
function linkHaystack() {
  const parts = [];
  for (const entry of game.journal ?? []) for (const page of entry.pages ?? []) parts.push(page.text?.content ?? "", page.text?.markdown ?? "");
  for (const macro of game.macros ?? []) parts.push(macro.command ?? "");
  for (const s of worldSettings()) parts.push(JSON.stringify(s.value ?? ""));
  return parts.join("\n");
}

/** Why a document must stay in the world, or null if it can be moved out. */
function keepReason(doc, ctx) {
  if (!MOVABLE.includes(doc.documentName)) return t("Audit.Keep.Type");
  if (doc.documentName === "Actor") {
    if (ctx.userCharacters.has(doc.id)) return t("Audit.Keep.Character");
    if (doc.hasPlayerOwner) return t("Audit.Keep.Owned");
    if (ctx.onScenes.has(doc.id)) return t("Audit.Keep.OnScene");
    if (ctx.inCombat.has(doc.id)) return t("Audit.Keep.Combat");
  }
  if (ctx.haystack.includes(doc.id)) return t("Audit.Keep.Linked");
  return null;
}

function measureWorld() {
  const ctx = {
    haystack: linkHaystack(),
    userCharacters: new Set(game.users.map(u => u.character?.id).filter(Boolean)),
    onScenes: new Set(game.scenes.contents.flatMap(s => s.tokens.contents.map(tk => tk.actorId)).filter(Boolean)),
    inCombat: new Set((game.combats?.contents ?? []).flatMap(c => c.combatants.contents.map(cb => cb.actorId)).filter(Boolean))
  };
  const types = [], docs = [], folders = new Map();
  for (const type of DATA_TYPES) {
    const coll = game.collections.get(type);
    if (!coll) continue;
    let bytes = 0;
    for (const doc of coll) {
      const size = jsonSize(doc.toObject());
      bytes += size;
      if (!["Actor", "Item", "JournalEntry", "Scene", "RollTable"].includes(type)) continue;
      const keep = keepReason(doc, ctx);
      docs.push({ doc, bytes: size, keep });
      if (MOVABLE.includes(type) && doc.folder) {
        const f = folders.get(doc.folder.id) ?? folders.set(doc.folder.id, { folder: doc.folder, type, count: 0, bytes: 0, movable: [] }).get(doc.folder.id);
        f.count++; f.bytes += size;
        if (!keep) f.movable.push(doc);
      }
    }
    types.push({ type, count: coll.size, bytes });
  }
  const settingsBytes = worldSettings().reduce((n, s) => n + jsonSize(s.value), 0);
  types.push({ type: "Setting", count: worldSettings().length, bytes: settingsBytes });
  types.sort((a, b) => b.bytes - a.bytes);
  docs.sort((a, b) => b.bytes - a.bytes);
  return {
    total: types.reduce((n, x) => n + x.bytes, 0),
    types,
    docs: docs.slice(0, 40),
    folders: [...folders.values()].filter(f => f.movable.length).sort((a, b) => b.bytes - a.bytes).slice(0, 15)
  };
}

/** A world compendium "Planar Archive — <type>", created the first time. */
async function archivePack(type) {
  const name = `planar-archive-${type.toLowerCase()}`;
  const existing = game.packs.find(p => p.metadata.packageType === "world" && p.metadata.name === name);
  if (existing) return existing;
  const CC = foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;
  return CC.createCompendium({ label: t(`Audit.Pack.${type}`), name, type, packageType: "world" });
}

/** Copy documents into the archive compendium, then delete them from the world. */
async function moveToCompendium(docs) {
  const byType = new Map();
  for (const doc of docs) (byType.get(doc.documentName) ?? byType.set(doc.documentName, []).get(doc.documentName)).push(doc);
  let moved = 0;
  for (const [type, list] of byType) {
    const pack = await archivePack(type);
    const cls = CONFIG[type].documentClass;
    for (let i = 0; i < list.length; i += 50) {
      const chunk = list.slice(i, i + 50);
      await cls.createDocuments(chunk.map(d => d.toCompendium(pack)), { pack: pack.collection, keepId: true });
      await cls.deleteDocuments(chunk.map(d => d.id));
      moved += chunk.length;
    }
  }
  return moved;
}

/* ---------- The window ---------------------------------------------------------- */

export class AssetAudit extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "planar-theater-audit",
    classes: ["planar-theater", "th-audit"],
    window: { title: "PLANAR_THEATER.Audit.Title", icon: "fa-solid fa-scale-balanced", resizable: true },
    position: { width: 860, height: 700 }
  };

  static #instance = null;
  static open() {
    if (!game.user.isGM) return warn("Notify.OnlyGM");
    const app = this.#instance ??= new AssetAudit();
    if (app.rendered) app.bringToFront?.();
    app.render({ force: true });
    return app;
  }

  #tab = "files";
  #files = null;          // Map path -> {path, kind, uses, bytes}
  #sizing = false;
  #filter = { kind: "all", heavy: false, packages: false };
  #world = null;
  #selected = new Set();  // document uuids picked on the World data tab
  #busy = false;
  #boundTo = null;

  async _prepareContext() { return {}; }
  async _renderHTML() { return this.#html(); }
  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender() {
    if (!this.#files) this.#scan();
    if (this.#boundTo === this.element) return;
    this.#boundTo = this.element;
    this.element.addEventListener("click", ev => this.#onClick(ev));
    this.element.addEventListener("change", ev => this.#onChange(ev));
  }

  /* ---- data ---- */

  #scan() {
    this.#files = scanFiles();
    this.#sizeAll();
  }

  async #sizeAll() {
    if (this.#sizing) return;
    this.#sizing = true;
    const todo = [...this.#files.values()].filter(f => f.bytes === undefined && (this.#filter.packages || !isPackageAsset(f.path)));
    let last = Date.now();
    const worker = async () => {
      for (let f = todo.shift(); f; f = todo.shift()) {
        f.bytes = await fileSize(f.path);
        if (Date.now() - last > 700) { last = Date.now(); this.#redrawBody(); }
      }
    };
    await Promise.all(Array.from({ length: SIZE_WORKERS }, worker));
    this.#sizing = false;
    this.#redrawBody();
  }

  #redrawBody() {
    if (!this.rendered) return;
    const body = this.element.querySelector(".th-audit-body");
    if (body) body.innerHTML = this.#tab === "files" ? this.#filesHTML() : this.#worldHTML();
  }

  /* ---- markup ---- */

  #html() {
    const tab = (id, icon) => `<button type="button" data-audit-tab="${id}" class="${this.#tab === id ? "active" : ""}"><i class="fa-solid ${icon}"></i> ${esc(t(`Audit.Tab.${id}`))}</button>`;
    return `<div class="th-audit-tabs">${tab("files", "fa-photo-film")}${tab("world", "fa-database")}</div>
      <div class="th-audit-body">${this.#tab === "files" ? this.#filesHTML() : this.#worldHTML()}</div>`;
  }

  #visibleFiles() {
    const f = this.#filter;
    return [...(this.#files?.values() ?? [])]
      .filter(x => (f.packages || !isPackageAsset(x.path)) && (f.kind === "all" || x.kind === f.kind))
      .filter(x => !f.heavy || isHeavy(x.path, x.bytes))
      .sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1) || a.path.localeCompare(b.path));
  }

  #filesHTML() {
    if (!this.#files) return `<p class="th-empty">${esc(t("Audit.Scanning"))}</p>`;
    const list = this.#visibleFiles();
    const total = list.reduce((n, x) => n + (x.bytes ?? 0), 0);
    const heavy = list.filter(x => isHeavy(x.path, x.bytes)).length;
    const f = this.#filter;
    const opt = (v, key) => `<option value="${v}" ${f.kind === v ? "selected" : ""}>${esc(t(`Audit.Kind.${key}`))}</option>`;
    const rows = list.map(x => {
      const isHeavyFile = isHeavy(x.path, x.bytes);
      const name = x.path.split("/").pop();
      const uses = [...x.uses];
      const canOptimize = x.kind === "image" && needsOptimizing(x.path, x.bytes);
      return `<tr class="${isHeavyFile ? "heavy" : ""}">
        <td><i class="fa-solid ${KIND_ICON[x.kind]}"></i></td>
        <td class="th-audit-name" title="${esc(x.path)}">${esc(name)}<small>${esc(x.path.slice(0, -name.length))}</small></td>
        <td class="th-audit-size">${x.bytes === undefined ? `<i class="fa-solid fa-spinner fa-spin"></i>` : esc(formatBytes(x.bytes ?? NaN))}</td>
        <td class="th-audit-uses" title="${esc(uses.slice(0, 20).join("\n"))}${uses.length > 20 ? "\n…" : ""}">${uses.length}</td>
        <td class="th-audit-acts">
          ${canOptimize ? `<button type="button" data-optimize="${esc(x.path)}" title="${esc(t("Audit.OptimizeHint"))}"><i class="fa-solid fa-feather"></i> ${esc(t("Audit.Optimize"))}</button>` : ""}
          <button type="button" data-repoint="${esc(x.path)}" title="${esc(t("Audit.RepointHint"))}"><i class="fa-solid fa-right-left"></i></button>
        </td></tr>`;
    }).join("");
    return `<div class="th-audit-bar">
        <select name="kind">${opt("all", "All")}${opt("image", "Image")}${opt("audio", "Audio")}${opt("video", "Video")}</select>
        <label><input type="checkbox" name="heavy" ${f.heavy ? "checked" : ""}> ${esc(t("Audit.HeavyOnly"))}</label>
        <label><input type="checkbox" name="packages" ${f.packages ? "checked" : ""}> ${esc(t("Audit.Packages"))}</label>
        <button type="button" data-audit="rescan"><i class="fa-solid fa-rotate"></i> ${esc(t("Audit.Rescan"))}</button>
      </div>
      <p class="th-audit-sum">${esc(t("Audit.FilesSummary", { count: list.length, total: formatBytes(total), heavy }))}${this.#sizing ? ` <i class="fa-solid fa-spinner fa-spin"></i>` : ""}</p>
      <p class="th-ed-hint th-audit-hint">${esc(t("Audit.FilesHint"))}</p>
      <table class="th-audit-table"><thead><tr><th></th><th>${esc(t("Audit.Col.File"))}</th><th>${esc(t("Audit.Col.Size"))}</th><th>${esc(t("Audit.Col.Uses"))}</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="th-empty">${esc(t("Audit.NoFiles"))}</td></tr>`}</tbody></table>`;
  }

  #worldHTML() {
    const w = this.#world ??= measureWorld();
    const typeRows = w.types.map(x => `<tr><td>${esc(x.type)}</td><td>${x.count}</td><td class="th-audit-size">${esc(formatBytes(x.bytes))}</td></tr>`).join("");
    const chat = w.types.find(x => x.type === "ChatMessage");
    const chatTools = chat?.count && typeof game.messages?.flush === "function"
      ? `<div class="th-audit-bar"><span>${esc(t("Audit.Chat", { count: chat.count, size: formatBytes(chat.bytes) }))}</span>
         ${typeof game.messages.export === "function" ? `<button type="button" data-audit="chat-export"><i class="fa-solid fa-file-export"></i> ${esc(t("Audit.ChatExport"))}</button>` : ""}
         <button type="button" data-audit="chat-flush"><i class="fa-solid fa-trash"></i> ${esc(t("Audit.ChatClear"))}</button></div>` : "";
    const docRows = w.docs.map(({ doc, bytes, keep }) => `<tr class="${keep ? "kept" : ""}">
        <td>${keep ? "" : `<input type="checkbox" data-pick="${esc(doc.uuid)}" ${this.#selected.has(doc.uuid) ? "checked" : ""}>`}</td>
        <td>${esc(doc.documentName)}</td>
        <td class="th-audit-name" title="${esc(doc.folder?.name ?? "")}">${esc(doc.name)}<small>${esc(doc.folder?.name ?? "")}</small></td>
        <td class="th-audit-size">${esc(formatBytes(bytes))}</td>
        <td><small>${esc(keep ?? "")}</small></td></tr>`).join("");
    const folderRows = w.folders.map(f => `<tr>
        <td>${esc(f.type)}</td><td class="th-audit-name">${esc(f.folder.name)}</td>
        <td>${f.movable.length}/${f.count}</td><td class="th-audit-size">${esc(formatBytes(f.bytes))}</td>
        <td><button type="button" data-move-folder="${esc(f.folder.id)}"><i class="fa-solid fa-box-archive"></i> ${esc(t("Audit.MoveFolder"))}</button></td></tr>`).join("");
    const picked = this.#selected.size;
    return `<p class="th-audit-sum">${esc(t("Audit.WorldSummary", { total: formatBytes(w.total) }))}</p>
      <p class="th-ed-hint th-audit-hint">${esc(t("Audit.WorldHint"))}</p>
      <div class="th-audit-bar"><button type="button" data-audit="remeasure"><i class="fa-solid fa-rotate"></i> ${esc(t("Audit.Rescan"))}</button></div>
      <table class="th-audit-table small"><thead><tr><th>${esc(t("Audit.Col.Type"))}</th><th>${esc(t("Audit.Col.Count"))}</th><th>${esc(t("Audit.Col.Size"))}</th></tr></thead><tbody>${typeRows}</tbody></table>
      ${chatTools}
      <h3>${esc(t("Audit.Biggest"))}</h3>
      <div class="th-audit-bar"><button type="button" data-audit="move-picked" ${picked ? "" : "disabled"}><i class="fa-solid fa-box-archive"></i> ${esc(t("Audit.MovePicked", { count: picked }))}</button></div>
      <table class="th-audit-table"><thead><tr><th></th><th>${esc(t("Audit.Col.Type"))}</th><th>${esc(t("Audit.Col.Name"))}</th><th>${esc(t("Audit.Col.Size"))}</th><th>${esc(t("Audit.Col.Keep"))}</th></tr></thead><tbody>${docRows}</tbody></table>
      ${folderRows ? `<h3>${esc(t("Audit.Folders"))}</h3><table class="th-audit-table"><thead><tr><th>${esc(t("Audit.Col.Type"))}</th><th>${esc(t("Audit.Col.Folder"))}</th><th>${esc(t("Audit.Col.Movable"))}</th><th>${esc(t("Audit.Col.Size"))}</th><th></th></tr></thead><tbody>${folderRows}</tbody></table>` : ""}`;
  }

  /* ---- actions ---- */

  #onChange(ev) {
    const el = ev.target;
    if (el.dataset.pick) { el.checked ? this.#selected.add(el.dataset.pick) : this.#selected.delete(el.dataset.pick); return this.#redrawBody(); }
    if (el.name === "kind") this.#filter.kind = el.value;
    else if (el.name === "heavy") this.#filter.heavy = el.checked;
    else if (el.name === "packages") { this.#filter.packages = el.checked; if (el.checked) this.#sizeAll(); }
    else return;
    this.#redrawBody();
  }

  async #onClick(ev) {
    const el = ev.target.closest("[data-audit-tab], [data-audit], [data-optimize], [data-repoint], [data-move-folder]");
    if (!el || !this.element.contains(el)) return;
    ev.preventDefault();
    if (el.dataset.auditTab) { this.#tab = el.dataset.auditTab; return this.render(); }
    if (this.#busy) return;
    this.#busy = true;
    this.element.classList.add("th-busy");
    try {
      if (el.dataset.optimize) await this.#optimize(el.dataset.optimize);
      else if (el.dataset.repoint) await this.#repoint(el.dataset.repoint);
      else if (el.dataset.moveFolder) await this.#moveFolder(el.dataset.moveFolder);
      else switch (el.dataset.audit) {
        case "rescan": this.#files = null; this.render(); break;
        case "remeasure": this.#world = null; this.#selected.clear(); this.render(); break;
        case "move-picked": await this.#movePicked(); break;
        case "chat-export": game.messages.export(); break;
        case "chat-flush": await game.messages.flush(); this.#world = null; this.render(); break;
      }
    } catch (err) {
      console.error(`${MODULE_ID} |`, err);
      ui.notifications.error(t("Notify.Error", { message: err.message }));
    } finally {
      this.#busy = false;
      this.element?.classList.remove("th-busy");
    }
  }

  async #optimize(path) {
    info("Audit.Optimizing", { name: path.split("/").pop() });
    const r = await optimizeImage(path, { force: true });
    if (!r.to) return info(r.skipped === "noGain" ? "Audit.NoGain" : "Audit.CantOptimize");
    const changed = await repointEverywhere(path, r.to);
    info("Audit.Optimized", { before: formatBytes(r.before), after: formatBytes(r.after), count: changed });
    this.#rescanSoon();
  }

  async #repoint(path) {
    const f = this.#files.get(path);
    const to = await pickFile(f?.kind ?? mediaKind(path), path);
    if (!to || to === path) return;
    const ok = await DialogV2.confirm({
      window: { title: t("Audit.RepointTitle") },
      content: `<p>${esc(t("Audit.RepointBody", { from: path, to, count: f?.uses.size ?? 0 }))}</p>`
    });
    if (!ok) return;
    const changed = await repointEverywhere(path, to);
    info("Audit.Repointed", { count: changed });
    this.#rescanSoon();
  }

  #rescanSoon() { this.#files = null; this.#world = null; this.render(); }

  async #confirmMove(docs) {
    const bytes = docs.reduce((n, d) => n + jsonSize(d.toObject()), 0);
    return DialogV2.confirm({
      window: { title: t("Audit.MoveTitle") },
      content: `<p>${esc(t("Audit.MoveBody", { count: docs.length, size: formatBytes(bytes) }))}</p>`
    });
  }

  async #movePicked() {
    const docs = [...this.#selected].map(uuid => fromUuidSync(uuid)).filter(d => d && MOVABLE.includes(d.documentName));
    if (!docs.length || !await this.#confirmMove(docs)) return;
    const n = await moveToCompendium(docs);
    info("Audit.Moved", { count: n });
    this.#selected.clear();
    this.#world = null;
    this.render();
  }

  async #moveFolder(id) {
    const f = this.#world?.folders.find(x => x.folder.id === id);
    if (!f?.movable.length || !await this.#confirmMove(f.movable)) return;
    const n = await moveToCompendium(f.movable);
    info("Audit.Moved", { count: n });
    this.#world = null;
    this.render();
  }
}
