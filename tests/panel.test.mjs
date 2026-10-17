// The panel against a stand-in for ApplicationV2. Foundry throws the window element away
// when a window closes and builds a new one the next time it renders, so anything bound to
// the old element is lost. These tests check the panel survives close -> reopen.
import { test } from "node:test";
import assert from "node:assert/strict";

class FakeApp {
  static DEFAULT_OPTIONS = {};
  element = null;
  rendered = false;
  /** Mimics AppV2: a first render after close gets a brand-new element. */
  open() { if (!this.rendered) this.element = new FakeElement(); this.rendered = true; this._onRender(); }
  async close() { await this._onClose(); this.element = null; this.rendered = false; }
}
class FakeClassList extends Set {
  toggle(name, on) { on ? this.add(name) : this.delete(name); }
  remove(name) { this.delete(name); }
  contains(name) { return this.has(name); }
}
class FakeElement extends EventTarget {
  classList = new FakeClassList();
  attrs = {};
  setAttribute(name, value) { this.attrs[name] = value; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  contains() { return true; }
}
globalThis.foundry = {
  applications: { api: { ApplicationV2: FakeApp, DialogV2: class {} }, apps: { FilePicker: { implementation: class {} } } },
  utils: { randomID: () => "abc123", deepClone: v => structuredClone(v) }
};
const saved = [];
globalThis.game = {
  user: { isGM: true, id: "gm" },
  users: [],
  playlists: { contents: [] },
  scenes: [],
  settings: { get: () => false, set: async (mod, key, value) => saved.push([key, value]) },
  i18n: { localize: k => k, format: k => k }
};
// "Silence" waits on unsetFlag, so the test decides when that action ends.
let finishSilence;
globalThis.canvas = { scene: {
  id: "s1", tiles: [], flags: { "planar-theater": { theater: true } },
  getFlag: () => null,
  unsetFlag: () => new Promise(resolve => { finishSilence = resolve; })
} };
globalThis.ui = { notifications: { error: msg => { throw new Error(msg); } } };

const { TheaterPanel } = await import("../scripts/panel.mjs");

/** A "change" from the Fade checkbox, dispatched on the panel element. */
const toggleFade = (el, checked) => {
  const ev = new Event("change");
  Object.defineProperty(ev, "target", { value: { name: "th-fade", checked } });
  el.dispatchEvent(ev);
};

test("panel still responds after it is closed and opened again", async () => {
  const panel = new TheaterPanel();
  try {
    panel.open();
    toggleFade(panel.element, true);
    assert.deepEqual(saved.at(-1), ["fade", true], "first window responds");

    await panel.close();
    panel.open();
    saved.length = 0;
    toggleFade(panel.element, false);
    assert.deepEqual(saved.at(-1), ["fade", false], "reopened window responds");

    // A re-render of the same window must not bind twice.
    saved.length = 0;
    panel.open();
    toggleFade(panel.element, true);
    assert.equal(saved.length, 1, "one handler per element");
  } finally {
    await panel.close(); // clears the presence timer so the test process can exit
  }
});

/** A click on a toolbar button, dispatched on the panel element. */
const clickAct = (el, act) => {
  const button = { dataset: { act }, classList: new FakeClassList() };
  const ev = new Event("click");
  Object.defineProperty(ev, "target", { value: { closest: () => button } });
  el.dispatchEvent(ev);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test("shows a busy state while an action runs, also in a reopened window", async () => {
  const panel = new TheaterPanel();
  try {
    panel.open();
    clickAct(panel.element, "silence");
    assert.equal(panel.element.classList.contains("th-busy"), false, "quick actions don't flash it");
    await sleep(200);
    assert.equal(panel.element.classList.contains("th-busy"), true, "busy after the delay");
    assert.equal(panel.element.attrs["aria-busy"], "true");

    await panel.close();
    panel.open();
    assert.equal(panel.element.classList.contains("th-busy"), true, "reopened window still shows it");

    finishSilence();
    await sleep(0);
    assert.equal(panel.element.classList.contains("th-busy"), false, "cleared when the action ends");
    assert.equal(panel.element.attrs["aria-busy"], "false");
  } finally {
    finishSilence?.();
    await panel.close();
  }
});

test("on a map (not a Theater scene) the panel switches to over-the-map mode", async () => {
  const theaterScene = canvas.scene;
  canvas.scene = { id: "map", name: "Mortuary", tiles: [], flags: {}, getFlag: () => null };
  try {
    const panel = new TheaterPanel();
    assert.equal(panel.remote, true);
    const html = await panel._renderHTML();
    assert.match(html, /Over\.Badge/, "over-the-map toolbar");
    assert.match(html, /name="ov-mode"/);
    assert.match(html, /Over\.NoTheater/, "says there is no Theater scene yet");
    assert.match(html, /data-act="create-scene"/, "offers New scene");
  } finally {
    canvas.scene = theaterScene;
  }
  assert.equal(new TheaterPanel().remote, false, "a Theater scene keeps the normal panel");
});

test("a map that holds Theater places (and tokens) opens over the map, listing its own places", async () => {
  const theaterScene = canvas.scene;
  const place = { id: "t1", hidden: false, alpha: 1, texture: { src: "m1.webp" }, flags: { "planar-theater": { kind: "place", label: "M1 Morgue", order: 0 } } };
  const map = { id: "map", name: "Map 1.1", tiles: [place], tokens: { size: 4 }, flags: {}, getFlag: () => null };
  map.tiles.filter = Array.prototype.filter.bind(map.tiles);
  canvas.scene = map;
  game.scenes = [map];
  try {
    const panel = new TheaterPanel();
    assert.equal(panel.remote, true, "tokens on it: it's a map");
    const html = await panel._renderHTML();
    assert.match(html, /data-ov-place="t1"/, "its own places are listed to show over the map");
    assert.match(html, /Over\.ThisMap/);
    assert.match(html, /data-act="ov-hide-tiles"/, "offers to hide the picture left drawn on the map");
    assert.match(html, /data-act="remove-places"/, "Remove all places for the listed scene");
    assert.doesNotMatch(html, /data-act="remove-cast"/, "no Remove all when there is no cast");
  } finally {
    canvas.scene = theaterScene;
    game.scenes = [];
  }
});
