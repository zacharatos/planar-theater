// paintBlack must cope with both scene data models: v13 (scene.backgroundColor) and v14 (level.background.color).
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.game = { i18n: { localize: k => k, format: k => k } };
globalThis.ui = { notifications: { info() {}, warn() {} } };
globalThis.CONST = { GRID_TYPES: { GRIDLESS: 0 } };
let sceneFields = new Set();
globalThis.getDocumentClass = () => ({ schema: { getField: path => (sceneFields.has(path) ? {} : undefined) } });

const { paintBlack } = await import("../scripts/scene.mjs");

test("v13: sets scene.backgroundColor", async () => {
  sceneFields = new Set(["backgroundColor"]);
  const calls = [];
  const scene = { update: async d => calls.push(d) };
  assert.equal(await paintBlack(scene), true);
  assert.deepEqual(calls, [{ backgroundColor: "#000000" }]);
});

test("v14: paints the initial level", async () => {
  sceneFields = new Set(["levels"]);
  const calls = [];
  const level = { update: async d => calls.push(d) };
  const scene = { initialLevel: "L1", levels: { get: id => (id === "L1" ? level : undefined), contents: [level] } };
  assert.equal(await paintBlack(scene), true);
  assert.deepEqual(calls, [{ "background.color": "#000000" }]);
});

test("v14: falls back to the first level, or creates one", async () => {
  sceneFields = new Set(["levels"]);
  const first = { update: async function (d) { this.got = d; } };
  assert.equal(await paintBlack({ levels: { get: () => undefined, contents: [first] } }), true);
  assert.deepEqual(first.got, { "background.color": "#000000" });

  const created = { update: async function (d) { this.got = d; } };
  const scene = { name: "T", levels: { get: () => undefined, contents: [] }, createEmbeddedDocuments: async () => [created] };
  assert.equal(await paintBlack(scene), true);
  assert.deepEqual(created.got, { "background.color": "#000000" });
});

test("reports failure instead of throwing", async () => {
  sceneFields = new Set(["levels"]);
  const bad = { levels: { get: () => ({ update: async () => { throw new Error("nope"); } }), contents: [] } };
  const origWarn = console.warn; console.warn = () => {};
  try { assert.equal(await paintBlack(bad), false); } finally { console.warn = origWarn; }
  sceneFields = new Set();
  assert.equal(await paintBlack({}), false, "neither model present");
});
