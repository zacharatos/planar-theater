// Loads the real entry point against stubbed Foundry globals. This catches broken
// imports, missing exports and hook wiring mistakes; it does not replace testing in Foundry.
import { test } from "node:test";
import assert from "node:assert/strict";

const hooks = { once: {}, on: {} };
globalThis.Hooks = {
  once: (name, fn) => { hooks.once[name] = fn; },
  on: (name, fn) => { (hooks.on[name] ??= []).push(fn); }
};
class FakeApp { static DEFAULT_OPTIONS = {}; }
globalThis.foundry = {
  applications: { api: { ApplicationV2: FakeApp, DialogV2: class {} }, apps: { FilePicker: { implementation: class {} } } },
  utils: { randomID: () => "abc123" }
};
const registered = { settings: [], keys: [] };
globalThis.game = {
  user: { isGM: true },
  modules: new Map([["planar-theater", {}]]),
  settings: { register: (mod, key) => registered.settings.push(`${mod}.${key}`) },
  keybindings: { register: (mod, key) => registered.keys.push(`${mod}.${key}`) },
  i18n: { localize: k => k, format: k => k }
};
globalThis.canvas = { scene: null };

await import("../scripts/main.mjs");

test("registers settings and keybinding on init", () => {
  hooks.once.init();
  assert.deepEqual(registered.settings.sort(), ["planar-theater.fade", "planar-theater.soundFade", "planar-theater.titleHold"]);
  assert.deepEqual(registered.keys, ["planar-theater.open"]);
});

test("exposes an api on ready", () => {
  hooks.once.ready();
  const api = game.modules.get("planar-theater").api;
  for (const fn of ["open", "createScene", "migrate"]) assert.equal(typeof api[fn], "function", fn);
});

test("adds a scene-control tool for the GM only", () => {
  const controls = { tokens: { tools: {} } };
  hooks.on.getSceneControlButtons[0](controls);
  const tool = controls.tokens.tools["planar-theater"];
  assert.ok(tool, "tool added");
  assert.equal(tool.button, true);
  assert.equal(typeof tool.onChange, "function");

  game.user.isGM = false;
  const playerControls = { tokens: { tools: {} } };
  hooks.on.getSceneControlButtons[0](playerControls);
  assert.deepEqual(playerControls.tokens.tools, {});
  game.user.isGM = true;
});

test("tolerates a toolbar without a tokens group", () => {
  assert.doesNotThrow(() => hooks.on.getSceneControlButtons[0]({}));
});

test("tile hooks do nothing when no panel is open", () => {
  for (const name of ["createTile", "updateTile", "deleteTile"]) {
    assert.doesNotThrow(() => hooks.on[name][0]({ parent: canvas.scene }));
  }
});
