// =====================================================================
//  AMBIENT THEATER v3 — GM macro for Foundry VTT v14 (also v13)
//  Macro type: Script.  Run it while you are viewing a Theater scene.
//
//  PLACES (backgrounds)
//   • Add places…   pick a folder; every image becomes a hidden tile that
//                   fits the scene. Ordered by file name (01-, 02-, …).
//   • Click         shows that place to everyone (the previous one goes).
//   • ⚙ on a place  set its TITLE CARD (Greek, "Main line | small line")
//                   and its SOUND (any track from your Playlists).
//                   Showing the place then fades the title in for a few
//                   seconds and cross-fades to its sound.
//  CAST (NPC portraits)
//   • Add cast…     pick a folder of portraits (any shape). Each becomes a
//                   framed card with a name plate, shown on the left or
//                   right of the place. File name = name; change it (to
//                   Greek) with ⚙.
//   • Click         slides the NPC in; click again to slide them out.
//                   One NPC per side: a new one replaces the old one.
//  BAR
//   • Black     hides places, cast and titles (sound keeps playing)
//   • Silence   stops the Theater's sound
//   • Re-fit    re-sizes and re-places everything to the scene
//   • Preload   pushes all of this scene's images to the players
//   • Show to players   activates this scene for everyone
//   • Fade      fades and slides instead of instant cuts
//
//  Generated cards and titles are saved under
//  worlds/<your world>/theater-generated/ .
// =====================================================================
(async () => {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can run the Theater.");
  const scene = canvas.scene;
  if (!scene) return ui.notifications.warn("Open your Theater scene first.");

  // ---------- settings ------------------------------------------------
  const IMG = /\.(png|jpe?g|webp|avif|gif)$/i;
  const FADE_STEPS = 8, FADE_MS = 45;
  const TITLE_HOLD_MS = 4500;
  const SOUND_FADE_MS = 2000;
  const BAND = { place: 0, npc: 1_000_000, title: 2_000_000 };
  const FONT = `"Palatino Linotype","Book Antiqua",Palatino,"Noto Serif",Georgia,serif`;
  const GOLD = "#c9a14e";

  // ---------- helpers -------------------------------------------------
  const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  const esc = s => Handlebars.escapeExpression(String(s ?? ""));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const meta = t => t.flags?.world?.theater;
  const kindOf = t => meta(t)?.kind ?? "place";
  const byOrder = (a, b) => (meta(a).order ?? 0) - (meta(b).order ?? 0);
  const tilesOf = kind => scene.tiles.filter(t => meta(t) && kindOf(t) === kind).sort(byOrder);
  const isOn = t => !t.hidden || t.alpha > 0;
  const nextSort = kind => Math.max(BAND[kind], ...tilesOf(kind).map(t => t.sort ?? 0)) + 1;
  const nextOrder = kind => tilesOf(kind).reduce((m, t) => Math.max(m, (meta(t).order ?? 0) + 1), 0);
  const labelOf = src => decodeURIComponent(src.split("/").pop()).replace(/\.[^.]+$/, "").replace(/^\d+\s*[-_.]\s*/, "");
  const nameOf = t => kindOf(t) === "npc" ? (meta(t).name ?? meta(t).label) : (meta(t).label ?? t.name ?? "");
  const rect = () => canvas.dimensions.sceneRect;
  const source = () => scene.getFlag("world", "theaterSource") ?? "data";

  const loadImg = src => new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`Could not load ${src}`));
    i.src = src;
  });

  const realBounds = t => {
    const b = t.shape?.bounds ?? t.object?.bounds;
    return b ? { x: b.x, y: b.y } : { x: t.x, y: t.y };
  };

  // Put tiles at an exact top-left/size, whatever the tile anchor is.
  async function place(entries) {
    if (!entries.length) return;
    await scene.updateEmbeddedDocuments("Tile", entries.map(e => ({
      _id: e.id, x: e.left, y: e.top, width: e.width, height: e.height, rotation: 0
    })));
    await sleep(50);
    const fixes = [];
    for (const e of entries) {
      const t = scene.tiles.get(e.id);
      if (!t) continue;
      const b = realBounds(t);
      const dx = e.left - b.x, dy = e.top - b.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) fixes.push({ _id: t.id, x: t.x + dx, y: t.y + dy });
    }
    if (fixes.length) await scene.updateEmbeddedDocuments("Tile", fixes);
  }

  // Fade (and optionally slide) a set of tiles in small steps.
  async function steps(entries, { ms = FADE_MS, stop } = {}) {
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

  async function hide(docs) {
    if (!docs.length) return;
    await scene.updateEmbeddedDocuments("Tile", docs.map(t => ({
      _id: t.id, hidden: true, alpha: 0,
      ...(kindOf(t) === "npc" && meta(t).home ? { x: meta(t).home.x, y: meta(t).home.y } : {})
    })));
  }

  // ---------- files ---------------------------------------------------
  async function pickFolder() {
    const picked = await new Promise(resolve => {
      new FP({ type: "folder", callback: (path, fp) => resolve({ path, source: fp?.activeSource ?? "data" }) }).render(true);
    });
    await scene.setFlag("world", "theaterSource", picked.source);
    const result = await FP.browse(picked.source, picked.path);
    return (result.files ?? []).filter(f => IMG.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  async function upload(blob, base) {
    const src = source();
    const dir = `worlds/${game.world.id}/theater-generated`;
    try { await FP.browse(src, dir); } catch { await FP.createDirectory(src, dir); }
    const ext = blob.type === "image/png" ? "png" : "webp";
    const slug = base.normalize("NFD").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "img";
    const name = `${slug}-${foundry.utils.randomID(6)}.${ext}`;
    const res = await FP.upload(src, dir, new File([blob], name, { type: blob.type }), {}, { notify: false });
    if (res === false || res?.status === "error") throw new Error(res?.message ?? "Upload failed");
    return res?.path ?? `${dir}/${name}`;
  }

  const toBlob = c => new Promise(res => c.toBlob(b => {
    if (b) return res(b);
    c.toBlob(p => res(p), "image/png");
  }, "image/webp", 0.92));

  const fitFont = (ctx, text, weight, size, maxW) => {
    let s = size;
    do { ctx.font = `${weight} ${s}px ${FONT}`; s--; } while (ctx.measureText(text).width > maxW && s > 10);
  };

  // ---------- NPC card (frame + name plate, rendered here, uploaded) ---
  async function makeCard(src, name, { hidden = false } = {}) {
    const img = await loadImg(src);
    const r = rect();
    const SH = 20, PAD = 14, NAME = 60;
    const maxW = r.width * 0.30, maxH = r.height * 0.74;
    const s = Math.min((maxW - 2 * SH - 2 * PAD) / img.naturalWidth, (maxH - 2 * SH - 2 * PAD - NAME) / img.naturalHeight);
    const pw = Math.round(img.naturalWidth * s), ph = Math.round(img.naturalHeight * s);
    const cw = pw + 2 * PAD, ch = ph + 2 * PAD + NAME;
    const w = cw + 2 * SH, h = ch + 2 * SH;
    const k = Math.min(2, Math.max(1, 1 / s));
    const c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const ctx = c.getContext("2d");
    ctx.scale(k, k);
    ctx.imageSmoothingQuality = "high";
    const x0 = SH, y0 = SH;

    // card body with drop shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#0f0d13";
    ctx.beginPath(); ctx.roundRect(x0, y0, cw, ch, 10); ctx.fill();
    ctx.restore();

    // portrait, with a soft darkening toward the name plate
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x0 + PAD, y0 + PAD, pw, ph, 6); ctx.clip();
    ctx.drawImage(img, x0 + PAD, y0 + PAD, pw, ph);
    const g = ctx.createLinearGradient(0, y0 + PAD + ph * 0.72, 0, y0 + PAD + ph);
    g.addColorStop(0, "rgba(15,13,19,0)"); g.addColorStop(1, "rgba(15,13,19,.55)");
    ctx.fillStyle = g; ctx.fillRect(x0 + PAD, y0 + PAD, pw, ph);
    ctx.restore();

    // frame lines
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(x0 + 1.25, y0 + 1.25, cw - 2.5, ch - 2.5, 10); ctx.stroke();
    ctx.strokeStyle = "rgba(201,161,78,.45)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x0 + PAD - 4, y0 + PAD - 4, pw + 8, ph + 8, 8); ctx.stroke();

    // name plate
    const ny = y0 + PAD + ph + NAME / 2 + 3, cx = x0 + cw / 2;
    const diamonds = half => {
      ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = GOLD;
      for (const dx of [-half, half]) {
        ctx.save(); ctx.translate(cx + dx, ny); ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3, -3, 6, 6); ctx.restore();
      }
      ctx.restore();
    };
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (hidden) {
      // the real name, smeared beyond reading, behind a single question mark
      if (name && "filter" in ctx) {
        ctx.save();
        fitFont(ctx, name, 600, 32, cw - 2 * PAD - 40);
        ctx.filter = "blur(9px)"; ctx.globalAlpha = 0.5; ctx.fillStyle = "#f2e5c4";
        ctx.fillText(name, cx, ny);
        ctx.restore();
      }
      ctx.save();
      ctx.font = `600 34px ${FONT}`;
      ctx.shadowColor = "rgba(0,0,0,.9)"; ctx.shadowBlur = 8;
      ctx.fillStyle = GOLD; ctx.fillText("?", cx, ny);
      ctx.restore();
      diamonds(30);
    } else if (name) {
      fitFont(ctx, name, 600, 32, cw - 2 * PAD - 40);
      ctx.shadowColor = "rgba(0,0,0,.85)"; ctx.shadowBlur = 6;
      ctx.fillStyle = "#f2e5c4";
      ctx.fillText(name, cx, ny);
      diamonds(ctx.measureText(name).width / 2 + 16);
    }
    // the hidden variant's file name must not give the name away
    const path = await upload(await toBlob(c), hidden ? "cast-unknown" : `cast-${name}`);
    return { path, w, h };
  }

  async function makeCardSafe(src, name, opts) {
    try { return await makeCard(src, name, opts); }
    catch (err) {
      console.warn("Theater: card generation failed, using the raw portrait", err);
      const r = rect();
      const img = await loadImg(src).catch(() => null);
      const iw = img?.naturalWidth || 600, ih = img?.naturalHeight || 800;
      const s = Math.min(r.width * 0.30 / iw, r.height * 0.74 / ih);
      return { path: src, w: Math.round(iw * s), h: Math.round(ih * s) };
    }
  }

  // ---------- title card (rendered here, uploaded) --------------------
  const titleRect = () => {
    const r = rect();
    const height = Math.round(r.height * 0.2);
    return { left: r.x, top: r.y + r.height - height, width: r.width, height };
  };

  async function makeTitle(text) {
    const { width: W, height: H } = titleRect();
    const k = 1.5;
    const [main, sub] = text.split("|").map(s => s.trim()).filter(Boolean).concat([undefined, undefined]);
    const c = document.createElement("canvas");
    c.width = Math.round(W * k); c.height = Math.round(H * k);
    const ctx = c.getContext("2d");
    ctx.scale(k, k);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(0.55, "rgba(0,0,0,.5)"); bg.addColorStop(1, "rgba(0,0,0,.8)");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    const mainSize = Math.round(H * 0.30), subSize = Math.round(H * 0.14);
    const yMain = sub ? H * 0.58 : H * 0.68;
    fitFont(ctx, main, 600, mainSize, W * 0.88);
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(mainSize * 0.05)}px`;
    const tg = ctx.createLinearGradient(0, yMain - mainSize, 0, yMain);
    tg.addColorStop(0, "#fbf0d2"); tg.addColorStop(1, "#d6ac5e");
    ctx.shadowColor = "rgba(0,0,0,.9)"; ctx.shadowBlur = 14;
    ctx.fillStyle = tg; ctx.fillText(main, W / 2, yMain);

    const rule = (y, halfGap) => {
      const len = Math.min(170, W * 0.1);
      ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(214,172,94,.85)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(W / 2 - halfGap - len, y); ctx.lineTo(W / 2 - halfGap, y);
      ctx.moveTo(W / 2 + halfGap, y); ctx.lineTo(W / 2 + halfGap + len, y);
      ctx.stroke(); ctx.restore();
    };
    if (sub) {
      if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(subSize * 0.08)}px`;
      fitFont(ctx, sub, "italic 400", subSize, W * 0.6);
      ctx.shadowBlur = 8; ctx.fillStyle = "#ece0c4";
      const ySub = yMain + subSize * 1.7;
      ctx.fillText(sub, W / 2, ySub);
      rule(ySub - subSize * 0.35, ctx.measureText(sub).width / 2 + subSize * 0.8);
    } else {
      rule(yMain + mainSize * 0.45, 0);
    }
    return upload(await toBlob(c), "title");
  }

  // ---------- layout --------------------------------------------------
  async function fitPlaces(docs) {
    const r = rect(), entries = [];
    for (const t of docs) {
      const img = await loadImg(t.texture.src);
      const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
      const width = Math.round(img.naturalWidth * s), height = Math.round(img.naturalHeight * s);
      entries.push({ id: t.id, width, height, left: r.x + Math.round((r.width - width) / 2), top: r.y + Math.round((r.height - height) / 2) });
    }
    await place(entries);
    const hiddenOnes = docs.filter(t => scene.tiles.get(t.id)?.hidden);
    if (hiddenOnes.length) await scene.updateEmbeddedDocuments("Tile", hiddenOnes.map(t => ({ _id: t.id, alpha: 0 })));
  }

  const npcRect = t => {
    const r = rect(), m = meta(t);
    const width = m.w ?? t.width, height = m.h ?? t.height;
    const margin = Math.round(r.width * 0.035);
    const left = (m.side === "left") ? r.x + margin : r.x + r.width - margin - width;
    const top = Math.max(r.y, r.y + Math.round((r.height - height) / 2 - r.height * 0.05));
    return { left, top, width, height };
  };

  async function layoutNpcs(docs) {
    if (!docs.length) return;
    await place(docs.map(t => ({ id: t.id, ...npcRect(t) })));
    await scene.updateEmbeddedDocuments("Tile", docs.map(t => {
      const d = scene.tiles.get(t.id);
      return { _id: t.id, "flags.world.theater.home": { x: d.x, y: d.y } };
    }));
  }

  async function layoutTitles(docs) {
    const tr = titleRect();
    await place(docs.map(t => ({ id: t.id, ...tr })));
  }

  // ---------- sound ---------------------------------------------------
  async function playSound(snd) {
    const pl = snd.parent;
    if (typeof pl?.playSound === "function") return pl.playSound(snd);
    return snd.update({ playing: true });
  }
  async function stopSound(snd) {
    const pl = snd.parent;
    if (typeof pl?.stopSound === "function") return pl.stopSound(snd);
    return snd.update({ playing: false });
  }
  async function switchSound(uuid) {
    if (!uuid) return;
    const next = await fromUuid(uuid);
    if (!next) return ui.notifications.warn("Theater: the linked sound no longer exists.");
    const cur = scene.getFlag("world", "theaterSound");
    if (cur === uuid && next.playing) return;
    if (cur && cur !== uuid) {
      const prev = await fromUuid(cur);
      if (prev?.playing) await stopSound(prev);
    }
    await playSound(next);
    await scene.setFlag("world", "theaterSound", uuid);
  }
  async function silence() {
    const cur = scene.getFlag("world", "theaterSound");
    if (cur) {
      const s = await fromUuid(cur);
      if (s?.playing) await stopSound(s);
    }
    await scene.unsetFlag("world", "theaterSound");
  }

  // ---------- show / hide ---------------------------------------------
  let titleRun = 0;

  async function runTitle(placeDoc) {
    const run = ++titleRun;
    const stop = () => run !== titleRun;
    const tt = tilesOf("title").find(t => meta(t).parent === placeDoc.id);
    await hide(tilesOf("title").filter(t => isOn(t) && t !== tt));
    if (!tt) return;
    await tt.update({ hidden: false, alpha: 0, sort: nextSort("title") });
    if (!await steps([{ id: tt.id, a0: 0, a1: 1 }], { ms: 80, stop })) return;
    await sleep(TITLE_HOLD_MS);
    if (stop()) return;
    if (!await steps([{ id: tt.id, a0: 1, a1: 0 }], { ms: 100, stop })) return;
    await hide([tt]);
  }

  async function showPlace(id, fade) {
    const target = scene.tiles.get(id);
    if (!target) return;
    const others = tilesOf("place").filter(t => t.id !== id && isOn(t));
    const sort = nextSort("place");
    if (fade) {
      await target.update({ hidden: false, alpha: 0, sort });
      await steps([{ id, a0: 0, a1: 1 }]);
    } else {
      await target.update({ hidden: false, alpha: 1, sort });
    }
    await hide(others);
    await switchSound(meta(target).sound);
    runTitle(target).catch(err => console.error("Theater title:", err));
  }

  async function toggleNpc(id, fade) {
    const t = scene.tiles.get(id);
    if (!t) return;
    const m = meta(t);
    const side = m.side ?? "right";
    const home = m.home ?? { x: t.x, y: t.y };
    const off = Math.round(rect().width * 0.03) * (side === "left" ? -1 : 1);
    const slideOut = docs => steps(docs.map(o => {
      const h = meta(o).home ?? { x: o.x };
      return { id: o.id, a0: o.alpha, a1: 0, x0: h.x, x1: h.x + off };
    }));

    if (isOn(t)) {
      if (fade) await slideOut([t]);
      return hide([t]);
    }
    const rivals = tilesOf("npc").filter(o => o.id !== id && isOn(o) && (meta(o).side ?? "right") === side);
    if (rivals.length) { if (fade) await slideOut(rivals); await hide(rivals); }
    const sort = nextSort("npc");
    if (fade) {
      await t.update({ hidden: false, alpha: 0, x: home.x + off, y: home.y, sort });
      await steps([{ id, a0: 0, a1: 1, x0: home.x + off, x1: home.x }]);
    } else {
      await t.update({ hidden: false, alpha: 1, x: home.x, y: home.y, sort });
    }
  }

  // Swap an NPC card between "name shown" and "name hidden".
  // Both versions are made once and remembered, so later swaps are instant.
  async function setNameHidden(t, hidden) {
    const m = meta(t);
    const name = m.name ?? m.label;
    let shown = m.cardShown ?? (!m.nameHidden ? t.texture.src : null);
    let veiled = m.cardHidden ?? null;
    if (hidden && !veiled) veiled = (await makeCardSafe(m.src, name, { hidden: true })).path;
    if (!hidden && !shown) shown = (await makeCardSafe(m.src, name)).path;
    await t.update({
      "texture.src": hidden ? veiled : shown,
      "flags.world.theater.nameHidden": hidden,
      "flags.world.theater.cardShown": shown,
      "flags.world.theater.cardHidden": veiled
    });
  }

  async function black(fade) {
    titleRun++;
    const on = scene.tiles.filter(t => meta(t) && isOn(t));
    if (!on.length) return;
    if (fade) await steps(on.map(t => ({ id: t.id, a0: t.alpha, a1: 0 })));
    await hide(on);
  }

  // ---------- add -----------------------------------------------------
  async function addPlaces() {
    const files = await pickFolder();
    if (!files.length) return ui.notifications.warn("No images found in that folder.");
    const existing = new Set(tilesOf("place").map(t => meta(t).src ?? t.texture.src));
    const r = rect();
    let order = nextOrder("place");
    const data = files.filter(src => !existing.has(src)).map(src => {
      const label = labelOf(src);
      return {
        name: label, texture: { src },
        x: r.x, y: r.y, width: r.width, height: r.height,
        hidden: true, alpha: 0, sort: BAND.place + order,
        flags: { world: { theater: { kind: "place", src, label, order: order++ } } }
      };
    });
    if (!data.length) return ui.notifications.info("Every image in that folder is already loaded.");
    const created = await scene.createEmbeddedDocuments("Tile", data);
    await fitPlaces(created);
    ui.notifications.info(`Added ${created.length} place(s).`);
  }

  async function addCast() {
    const files = await pickFolder();
    if (!files.length) return ui.notifications.warn("No images found in that folder.");
    const existing = new Set(tilesOf("npc").map(t => meta(t).src));
    const todo = files.filter(src => !existing.has(src));
    if (!todo.length) return ui.notifications.info("Every portrait in that folder is already loaded.");
    ui.notifications.info(`Framing ${todo.length} portrait(s)…`);
    const r = rect();
    let order = nextOrder("npc");
    const data = [];
    for (const src of todo) {
      const name = labelOf(src);
      const card = await makeCardSafe(src, name);
      const side = order % 2 === 0 ? "right" : "left";
      data.push({
        name: `Cast — ${name}`, texture: { src: card.path },
        x: r.x, y: r.y, width: card.w, height: card.h,
        hidden: true, alpha: 0, sort: BAND.npc,
        flags: { world: { theater: { kind: "npc", src, label: name, name, side, w: card.w, h: card.h,
          cardShown: card.path, nameHidden: false, order: order++ } } }
      });
    }
    const created = await scene.createEmbeddedDocuments("Tile", data);
    await layoutNpcs(created);
    ui.notifications.info(`Added ${created.length} NPC(s).`);
  }

  async function refitAll() {
    await fitPlaces(tilesOf("place"));
    await layoutNpcs(tilesOf("npc"));
    await layoutTitles(tilesOf("title"));
    ui.notifications.info("Theater re-fitted to the scene.");
  }

  // ---------- editor --------------------------------------------------
  const soundOptions = selected => {
    const opts = [`<option value="">— no sound —</option>`];
    for (const pl of game.playlists.contents.sort((a, b) => a.name.localeCompare(b.name))) {
      for (const s of pl.sounds.contents) {
        opts.push(`<option value="${esc(s.uuid)}" ${s.uuid === selected ? "selected" : ""}>${esc(pl.name)} — ${esc(s.name)}</option>`);
      }
    }
    return opts.join("");
  };

  const editorHTML = t => {
    const m = meta(t);
    if (kindOf(t) === "npc") return `
      <div class="th-ed-head"><i class="fa-solid fa-user"></i> ${esc(nameOf(t))}</div>
      <div class="th-ed-row"><label>Name on card</label><input type="text" name="ed-name" value="${esc(m.name ?? m.label)}"></div>
      <div class="th-ed-row"><label>Players see</label><select name="ed-hidden">
        <option value="0" ${m.nameHidden ? "" : "selected"}>The name</option>
        <option value="1" ${m.nameHidden ? "selected" : ""}>A veiled name ( ? )</option></select></div>
      <div class="th-ed-row"><label>Side</label><select name="ed-side">
        <option value="left" ${m.side === "left" ? "selected" : ""}>Left</option>
        <option value="right" ${m.side !== "left" ? "selected" : ""}>Right</option></select></div>
      <div class="th-ed-btns">
        <button type="button" data-ed="save"><i class="fa-solid fa-check"></i> Save</button>
        <button type="button" data-ed="cancel">Cancel</button>
        <button type="button" data-ed="delete"><i class="fa-solid fa-trash"></i> Remove</button></div>`;
    return `
      <div class="th-ed-head"><i class="fa-solid fa-image"></i> ${esc(nameOf(t))}</div>
      <div class="th-ed-row"><label>Title card</label><input type="text" name="ed-title" value="${esc(m.title ?? "")}" placeholder="Η Νεκροθήκη | Σιγίλ, η Πόλη των Θυρών"></div>
      <p class="th-ed-hint">Use “|” for a smaller second line. Leave empty for no title.</p>
      <div class="th-ed-row"><label>Sound</label><select name="ed-sound">${soundOptions(m.sound)}</select></div>
      <div class="th-ed-btns">
        <button type="button" data-ed="save"><i class="fa-solid fa-check"></i> Save</button>
        <button type="button" data-ed="cancel">Cancel</button>
        <button type="button" data-ed="delete"><i class="fa-solid fa-trash"></i> Remove</button></div>`;
  };

  async function saveEditor(t, ed) {
    const m = meta(t);
    if (kindOf(t) === "npc") {
      const name = ed.querySelector("[name=ed-name]").value.trim() || m.label;
      const side = ed.querySelector("[name=ed-side]").value;
      const hidden = ed.querySelector("[name=ed-hidden]").value === "1";
      if (name !== (m.name ?? m.label)) {
        // a new name makes both card versions out of date
        const card = await makeCardSafe(m.src, name);
        await t.update({ name: `Cast — ${name}`, "texture.src": card.path,
          "flags.world.theater.name": name, "flags.world.theater.w": card.w, "flags.world.theater.h": card.h,
          "flags.world.theater.cardShown": card.path, "flags.world.theater.cardHidden": null,
          "flags.world.theater.nameHidden": false });
      }
      if (hidden !== !!meta(t).nameHidden) await setNameHidden(scene.tiles.get(t.id), hidden);
      if (side !== m.side) await t.update({ "flags.world.theater.side": side });
      await layoutNpcs([scene.tiles.get(t.id)]);
      return;
    }
    const title = ed.querySelector("[name=ed-title]").value.trim();
    const sound = ed.querySelector("[name=ed-sound]").value;
    const tt = tilesOf("title").find(o => meta(o).parent === t.id);
    if (!title) {
      if (tt) await tt.delete();
    } else if (title !== m.title || !tt) {
      const path = await makeTitle(title);
      if (tt) {
        await tt.update({ "texture.src": path });
      } else {
        const tr = titleRect();
        const [nt] = await scene.createEmbeddedDocuments("Tile", [{
          name: `Title — ${nameOf(t)}`, texture: { src: path },
          x: tr.left, y: tr.top, width: tr.width, height: tr.height,
          hidden: true, alpha: 0, sort: BAND.title,
          flags: { world: { theater: { kind: "title", parent: t.id, order: 0 } } }
        }]);
        await layoutTitles([nt]);
      }
    }
    if (sound) {
      const snd = await fromUuid(sound);
      if (snd && (!snd.repeat || !(snd.fade > 0))) await snd.update({ repeat: true, fade: snd.fade > 0 ? snd.fade : SOUND_FADE_MS });
    }
    await t.update({ "flags.world.theater.title": title || null, "flags.world.theater.sound": sound || null });
  }

  async function removeTile(t) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Remove from Theater" },
      content: `<p>Remove <b>${esc(nameOf(t))}</b> from this scene? The image file itself stays.</p>`
    });
    if (!ok) return;
    const ids = [t.id, ...tilesOf("title").filter(o => meta(o).parent === t.id).map(o => o.id)];
    await scene.deleteEmbeddedDocuments("Tile", ids);
  }

  // ---------- panel ---------------------------------------------------
  const STYLE = `
    .theater-root .th-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 6px}
    .theater-root .th-bar button{flex:0 0 auto;width:auto;white-space:nowrap;margin:0}
    .theater-root .th-bar label{display:flex;align-items:center;gap:4px;margin-left:auto;white-space:nowrap}
    .theater-root h3{margin:8px 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;opacity:.75;border:0}
    .theater-root .th-head{position:sticky;top:0;z-index:5;background:#0d0c14;padding:2px 0 4px;box-shadow:0 6px 8px -6px rgba(0,0,0,.8)}
    .theater-root .th-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;padding:2px}
    .theater-root .th-grid.cast{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}
    .theater-root .th-item{position:relative;display:flex;flex-direction:column;gap:4px;padding:4px;border:2px solid rgba(255,255,255,.08);border-radius:5px;background:rgba(0,0,0,.35);cursor:pointer;min-width:0}
    .theater-root .th-item:hover{border-color:rgba(232,163,61,.5)}
    .theater-root .th-item.live{border-color:#e8a33d;box-shadow:0 0 8px #e8a33d}
    .theater-root .th-item img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border:0;border-radius:3px}
    .theater-root .th-grid.cast .th-item img{aspect-ratio:3/4;object-fit:contain;background:rgba(0,0,0,.4)}
    .theater-root .th-item span{display:block;font-size:12px;line-height:1.3;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .theater-root .th-item .th-tags{opacity:.8;margin-right:3px}
    .theater-root .th-edit{position:absolute;top:6px;right:6px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(0,0,0,.65);font-size:11px;opacity:.75}
    .theater-root .th-edit:hover{opacity:1;color:#e8a33d}
    .theater-root .th-reveal{right:auto;left:6px}
    .theater-root .th-reveal.veiled{opacity:1;color:#e8a33d;background:rgba(60,30,0,.85)}
    .theater-root .th-empty{opacity:.7;padding:.5em 1em;margin:0}
    .theater-root .th-editor:empty{display:none}
    .theater-root .th-editor{margin-top:6px;padding:8px 10px;border:1px solid rgba(232,163,61,.45);border-radius:6px;background:#15131d}
    .theater-root .th-ed-head{font-weight:600;margin-bottom:6px}
    .theater-root .th-ed-row{display:flex;align-items:center;gap:8px;margin:4px 0}
    .theater-root .th-ed-row label{flex:0 0 100px}
    .theater-root .th-ed-row input,.theater-root .th-ed-row select{flex:1}
    .theater-root .th-ed-hint{margin:0 0 4px 108px;font-size:11px;opacity:.7}
    .theater-root .th-ed-btns{display:flex;gap:6px;margin-top:8px}
    .theater-root .th-ed-btns button{flex:0 0 auto;width:auto}
    .theater-root .th-ed-btns button[data-ed=delete]{margin-left:auto}`;

  const itemHTML = t => {
    const m = meta(t), npc = kindOf(t) === "npc";
    const tags = npc
      ? (m.side === "left" ? "◀ " : "▶ ")
      : `${m.sound ? `<i class="fa-solid fa-music"></i> ` : ""}${m.title ? `<i class="fa-solid fa-heading"></i> ` : ""}`;
    return `<div class="th-item ${t.hidden ? "" : "live"}" data-id="${t.id}" role="button" tabindex="0" title="${esc(nameOf(t))}">
      <img src="${esc(t.texture.src)}" alt="" loading="lazy">
      <span><span class="th-tags">${tags}</span>${esc(nameOf(t))}</span>
      <a class="th-edit" data-edit="${t.id}" title="Settings"><i class="fa-solid fa-gear"></i></a>
      ${npc ? `<a class="th-edit th-reveal ${m.nameHidden ? "veiled" : ""}" data-reveal="${t.id}"
        title="${m.nameHidden ? "Name hidden from players. Click to reveal it." : "Name shown to players. Click to hide it."}">
        <i class="fa-solid ${m.nameHidden ? "fa-eye-slash" : "fa-eye"}"></i></a>` : ""}
    </div>`;
  };

  const gridsHTML = () => {
    const places = tilesOf("place"), cast = tilesOf("npc");
    return `<h3>Places</h3>
      <div class="th-grid">${places.length ? places.map(itemHTML).join("") : `<p class="th-empty">No places yet. Click <b>Add places…</b></p>`}</div>
      <h3>Cast</h3>
      <div class="th-grid cast">${cast.length ? cast.map(itemHTML).join("") : `<p class="th-empty">No NPCs yet. Click <b>Add cast…</b></p>`}</div>`;
  };

  const panelHTML = () => `<style>${STYLE}</style>
    <div class="th-head">
    <div class="th-bar">
      <button type="button" data-act="add-places"><i class="fa-solid fa-image"></i> Add places…</button>
      <button type="button" data-act="add-cast"><i class="fa-solid fa-user-plus"></i> Add cast…</button>
      <button type="button" data-act="black"><i class="fa-solid fa-square"></i> Black</button>
      <button type="button" data-act="silence"><i class="fa-solid fa-volume-xmark"></i> Silence</button>
      <button type="button" data-act="refit"><i class="fa-solid fa-expand"></i> Re-fit</button>
      <button type="button" data-act="preload"><i class="fa-solid fa-download"></i> Preload</button>
      <button type="button" data-act="activate"><i class="fa-solid fa-bullhorn"></i> Show to players</button>
      <label><input type="checkbox" name="th-fade" checked> Fade</label>
    </div>
    <div class="th-editor"></div>
    </div>
    <div class="th-grids">${gridsHTML()}</div>`;

  const dlg = new foundry.applications.api.DialogV2({
    window: { title: `Theater — ${scene.name}`, icon: "fa-solid fa-masks-theater", resizable: true },
    position: { width: 820, height: Math.min(780, Math.round(window.innerHeight * 0.85)) },
    content: `<div class="theater-root"></div>`,
    buttons: [{ action: "close", label: "Close", default: true }],
    rejectClose: false
  });
  await dlg.render({ force: true });

  let root = dlg.element.querySelector(".theater-root");
  if (!root) {
    root = document.createElement("div");
    root.className = "theater-root";
    (dlg.element.querySelector(".window-content") ?? dlg.element).prepend(root);
  }
  root.innerHTML = panelHTML();

  // One scroll area for the whole panel: the bar and the settings box stay
  // pinned at the top, places and cast scroll underneath.
  const scroller = dlg.element.querySelector(".window-content") ?? root.parentElement;
  Object.assign(scroller.style, { overflowY: "auto", overflowX: "hidden", minHeight: "0" });
  for (let el = root.parentElement; el && el !== scroller; el = el.parentElement) el.style.overflow = "visible";

  let editingId = null;
  const refresh = () => {
    root.querySelector(".th-grids").innerHTML = gridsHTML();
    const ed = root.querySelector(".th-editor");
    const t = editingId && scene.tiles.get(editingId);
    if (!t) editingId = null;
    if (!editingId) ed.innerHTML = "";
  };

  let busy = false;
  root.addEventListener("click", async ev => {
    const el = ev.target.closest("[data-reveal], [data-edit], [data-ed], [data-act], .th-item");
    if (!el || !root.contains(el) || busy) return;
    ev.preventDefault(); ev.stopPropagation();
    const fade = root.querySelector("input[name=th-fade]")?.checked;
    const ed = root.querySelector(".th-editor");
    busy = true;
    try {
      if (el.dataset.reveal) {
        const t = scene.tiles.get(el.dataset.reveal);
        if (t) await setNameHidden(t, !meta(t).nameHidden);
        if (editingId === el.dataset.reveal) ed.innerHTML = editorHTML(scene.tiles.get(editingId));
        return;
      }
      if (el.dataset.edit) {
        editingId = el.dataset.edit;
        ed.innerHTML = editorHTML(scene.tiles.get(editingId));
        return;
      }
      if (el.dataset.ed) {
        const t = scene.tiles.get(editingId);
        if (el.dataset.ed === "save" && t) await saveEditor(t, ed);
        if (el.dataset.ed === "delete" && t) await removeTile(t);
        editingId = null;
        return;
      }
      if (el.classList.contains("th-item")) {
        const t = scene.tiles.get(el.dataset.id);
        if (!t) return;
        if (kindOf(t) === "npc") await toggleNpc(t.id, fade);
        else await showPlace(t.id, fade);
        return;
      }
      switch (el.dataset.act) {
        case "add-places": await addPlaces(); break;
        case "add-cast": await addCast(); break;
        case "black": await black(fade); break;
        case "silence": await silence(); break;
        case "refit": await refitAll(); break;
        case "preload": {
          await game.scenes.preload(scene.id, true);
          // Sounds are not part of a scene preload: push every linked track too.
          const AH = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
          const uuids = [...new Set(tilesOf("place").map(t => meta(t).sound).filter(Boolean))];
          let n = 0;
          for (const u of uuids) {
            const s = await fromUuid(u);
            if (!s?.path || typeof AH?.preloadSound !== "function") continue;
            try { await AH.preloadSound(s.path); n++; } catch (e) { console.warn("Theater: could not preload", s.path, e); }
          }
          ui.notifications.info(`Preloading this scene's images${n ? ` and ${n} sound(s)` : ""} for everyone.`);
          break;
        }
        case "activate": await scene.activate(); break;
      }
    } catch (err) {
      console.error(err);
      ui.notifications.error(`Theater: ${err.message}`);
    } finally {
      busy = false;
      refresh();
    }
  });
})();
