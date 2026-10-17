import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { TheaterPanel } from "./panel.mjs";
import { createTheaterScene, paintBlack } from "./scene.mjs";
import { migrateScene } from "./migrate.mjs";
import { registerSocket } from "./socket.mjs";
import { cancelAnimation, cancelAllAnimations } from "./animate.mjs";
import { AssetAudit, repointEverywhere } from "./audit.mjs";
import { optimizeImage } from "./optimize.mjs";
import { Stage } from "./stage.mjs";
import * as overlay from "./overlay.mjs";
import * as layer from "./layer.mjs";
import { registerEnrichers, listenForClicks } from "./enrich.mjs";
import * as pins from "./pins.mjs";

Hooks.once("init", () => {
  registerSettings();
  game.keybindings.register(MODULE_ID, "open", {
    name: "PLANAR_THEATER.Keybinding.Open",
    editable: [],
    restricted: true,
    onDown: () => { TheaterPanel.open(); return true; }
  });
  overlay.registerOverlaySettings();
  registerEnrichers();
  pins.registerPins();
});

Hooks.once("ready", () => {
  registerSocket();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = {
    open: () => TheaterPanel.open(), createScene: createTheaterScene, paintBlack, migrate: migrateScene,
    /** The asset audit window (files and world data). */
    audit: () => AssetAudit.open(),
    /** Optimize the current scene's Theater images ({restore: true} puts the originals back). */
    optimizeScene: ({ restore = false } = {}) => {
      if (!game.user.isGM || !canvas.scene) return null;
      const stage = new Stage();
      return restore ? stage.restoreOriginals() : stage.optimizeImages();
    },
    /** A lighter WebP copy of one image: {from, to, before, after} or {from, skipped}. */
    optimizeImage: (path, opts) => optimizeImage(path, opts),
    /** Replace a file path in every world document and world setting. Returns how many changed. */
    repoint: (from, to) => repointEverywhere(from, to),

    // ---- over the map: a Theater place, NPC cards or any picture over whatever scene players are on ----
    /** Places of every Theater scene ({scene} for one): [{id, scene, sceneName, label, title, src}]. */
    places: opts => overlay.places(opts),
    /** NPC cards of every Theater scene: [{id, scene, sceneName, label, side, veiled, src}]. */
    cast: opts => overlay.cast(opts),
    /** Show a place by tile, id or name. opts: {scene, users, mode: "full"|"window", transition: "fade"|"iris"|"glitch"|"cut", title, clearCast}. */
    showPlace: (target, opts) => overlay.showPlace(target, opts),
    /** Bring an NPC card in or out ({on: true|false}; unset toggles). */
    showNpc: (target, opts) => overlay.showNpc(target, opts),
    /** Show any image, with an optional title card text and playlist sound uuid. */
    showImage: (src, opts) => overlay.showImage(src, opts),
    /** Take everything down: everyone is back on the map. */
    hidePlace: () => overlay.hide(),
    hide: () => overlay.hide(),
    clearCast: () => overlay.clearCast(),
    /** Change who sees what is up (user or character names, or ids; none = everyone). */
    setUsers: list => overlay.setUsers(list),
    /** What is showing right now. */
    overlay: () => overlay.state(),
    /** Map pins on a scene (the viewed one by default): [{id, x, y, kind, scene, id, label, door, onDoor, mode, fx}]. */
    pins: scene => pins.pins(scene),
    /** Use a pin as if it were double-clicked (note document or id on the viewed scene). */
    firePin: note => pins.firePin(typeof note === "string" ? canvas.scene?.notes.get(note) : note)
  };
  overlay.initOverlay({ openPanel: () => TheaterPanel.open() });
  listenForClicks();
});

// Scene controls: a button in the Tokens toolbar (v13/v14 shape).
Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM || !controls?.tokens?.tools) return;
  controls.tokens.tools[MODULE_ID] = {
    name: MODULE_ID,
    title: "PLANAR_THEATER.ToolTitle",
    icon: "fa-solid fa-masks-theater",
    order: 50,
    button: true,
    visible: game.user.isGM,
    onChange: () => TheaterPanel.open()
  };
});

// Keep the open panel in step with the scene (over a map, it lists another scene's tiles).
for (const hook of ["createTile", "updateTile", "deleteTile"]) {
  Hooks.on(hook, doc => {
    const panel = TheaterPanel.instance;
    if (!panel?.rendered) return;
    // Over a map, a tile shown or hidden on the map itself changes the "drawn on this map" notice.
    if (panel.remote && doc.parent === canvas.scene) panel.render();
    else if (doc.parent === canvas.scene || panel.remote) panel.refreshSoon();
  });
}
Hooks.on("canvasReady", () => {
  layer.onCanvasReady();
  if (TheaterPanel.instance?.rendered) TheaterPanel.instance.render();
});
Hooks.on(`${MODULE_ID}.overlay`, () => TheaterPanel.instance?.refreshSoon());
Hooks.on("collapseSidebar", () => setTimeout(() => layer.fitAroundSidebar(), 250));

// A saved change to a tile wins over a fade still running in this browser.
Hooks.on("updateTile", (doc, changed) => {
  if (changed && ("alpha" in changed || "x" in changed || "hidden" in changed)) cancelAnimation(doc.id);
});
Hooks.on("canvasTearDown", () => cancelAllAnimations());
