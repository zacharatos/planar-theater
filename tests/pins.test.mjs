// Map pins: door matching (pure) and pin creation against a stand-in map.
import { test } from "node:test";
import assert from "node:assert/strict";
import { distToSegment, nearestDoor, pinOf } from "../scripts/util.mjs";

test("distToSegment: perpendicular, past the ends, zero-length", () => {
  assert.equal(distToSegment(5, 3, 0, 0, 10, 0), 3);
  assert.equal(distToSegment(13, 4, 0, 0, 10, 0), 5, "past the end: distance to the end point");
  assert.equal(distToSegment(3, 4, 0, 0, 0, 0), 5);
});

test("nearestDoor: closest door in range; plain walls and far doors ignored", () => {
  const walls = [
    { id: "wall", c: [0, 0, 0, 100], door: 0 },
    { id: "far", c: [500, 0, 500, 100], door: 1 },
    { id: "near", c: [100, 0, 100, 100], door: 1 },
    { id: "secret", c: [140, 0, 140, 100], door: 2 }
  ];
  assert.equal(nearestDoor(walls, 110, 50, 250).id, "near");
  assert.equal(nearestDoor(walls, 135, 50, 250).id, "secret", "secret doors count");
  assert.equal(nearestDoor(walls, 5, 50, 50), null, "a plain wall is not a door");
  assert.equal(nearestDoor([], 0, 0, 100), null);
  assert.equal(nearestDoor([{ id: "bad", door: 1 }], 0, 0, 100), null, "a wall without coordinates");
});

// ---- creating a pin on a stand-in map -------------------------------------------------------
const created = [];
const settings = new Map([["core.notesDisplayToggle", false]]);
let journal = null;
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 }, TEXT_ANCHOR_POINTS: { BOTTOM: 1 }, WALL_DOOR_STATES: { OPEN: 1 } };
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, DialogV2: class {} }, apps: { FilePicker: { implementation: class {} } } }, utils: { randomID: () => "x", deepClone: v => structuredClone(v) } };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.getDocumentClass = () => ({ create: async data => (journal = { id: "j1", ...data, getFlag: (m, k) => data.flags?.[m]?.[k] }) });
globalThis.game = {
  user: { isGM: true, id: "gm" },
  users: { activeGM: { id: "gm" } },
  i18n: { localize: k => k, format: k => k },
  settings: { get: (m, k) => settings.get(`${m}.${k}`), set: async (m, k, v) => settings.set(`${m}.${k}`, v) },
  journal: { find: fn => (journal && fn(journal) ? journal : undefined) }
};
const map = {
  id: "map", grid: { size: 100 },
  walls: [{ id: "door1", c: [1000, 400, 1000, 500], door: 1 }],
  createEmbeddedDocuments: async (type, data) => { created.push([type, data]); return data; }
};
globalThis.canvas = { scene: map };
const { createPin, registerPins, DRAG_TYPE } = await import("../scripts/pins.mjs");

test("a pin dropped next to a door is linked to it and asks by default", async () => {
  created.length = 0;
  await createPin({ type: DRAG_TYPE, kind: "place", scene: "theater", id: "t1", label: "M1 Morgue", x: 1080, y: 450 });
  const [type, [note]] = created[0];
  assert.equal(type, "Note");
  assert.equal(note.entryId, "j1", "linked to the GM-only journal, so players can't see it");
  assert.equal(journal.ownership.default, 0, "the journal is GM only");
  assert.deepEqual(pinOf(note), { kind: "place", scene: "theater", id: "t1", label: "M1 Morgue", door: "door1", onDoor: "ask", mode: "", fx: "" });
  assert.equal(settings.get("core.notesDisplayToggle"), true, "map notes shown for the GM");
});

test("a pin far from any door isn't linked", async () => {
  created.length = 0;
  await createPin({ kind: "npc", scene: "theater", id: "n1", label: "Jex", x: 100, y: 100 });
  const pin = pinOf(created[0][1][0]);
  assert.equal(pin.kind, "npc");
  assert.equal(pin.door, null);
  assert.equal(pin.onDoor, "off");
});

test("hooks: our drops are taken, other drops and other notes are left alone", () => {
  const hooks = {};
  globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
  registerPins();
  for (const name of ["dropCanvasData", "activateNote", "updateWall", "updateNote", "renderNoteConfig"]) assert.ok(hooks[name], name);
  assert.equal(hooks.dropCanvasData({}, { type: "Actor", uuid: "Actor.x" }), undefined, "an actor drop goes on to Foundry");
  assert.equal(hooks.activateNote({ document: { flags: {} } }), undefined, "a normal journal note still opens");
  game.user.isGM = false;
  assert.equal(hooks.dropCanvasData({}, { type: DRAG_TYPE }), false, "a player can't make pins");
  assert.equal(hooks.activateNote({ document: { flags: { "planar-theater": { pin: { label: "x" } } } } }), false, "a pin never opens the journal");
  game.user.isGM = true;
});
