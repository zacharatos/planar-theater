import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { TheaterPanel } from "./panel.mjs";
import { createTheaterScene, paintBlack } from "./scene.mjs";
import { migrateScene } from "./migrate.mjs";
import { registerSocket } from "./socket.mjs";
import { cancelAnimation, cancelAllAnimations } from "./animate.mjs";

Hooks.once("init", () => {
  registerSettings();
  game.keybindings.register(MODULE_ID, "open", {
    name: "PLANAR_THEATER.Keybinding.Open",
    editable: [],
    restricted: true,
    onDown: () => { TheaterPanel.open(); return true; }
  });
});

Hooks.once("ready", () => {
  registerSocket();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { open: () => TheaterPanel.open(), createScene: createTheaterScene, paintBlack, migrate: migrateScene };
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

// Keep the open panel in step with the scene.
for (const hook of ["createTile", "updateTile", "deleteTile"]) {
  Hooks.on(hook, doc => { if (doc.parent === canvas.scene) TheaterPanel.instance?.refreshSoon(); });
}
Hooks.on("canvasReady", () => { if (TheaterPanel.instance?.rendered) TheaterPanel.instance.render(); });

// A saved change to a tile wins over a fade still running in this browser.
Hooks.on("updateTile", (doc, changed) => {
  if (changed && ("alpha" in changed || "x" in changed || "hidden" in changed)) cancelAnimation(doc.id);
});
Hooks.on("canvasTearDown", () => cancelAllAnimations());
