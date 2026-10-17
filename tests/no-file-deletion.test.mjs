// Promise: the Theater never deletes, moves or overwrites a file the GM put on the server.
// Removing a place or an NPC (one, or "Remove all") deletes only the Tile documents that point
// at the images. These tests fail if that ever changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../scripts/", import.meta.url);
const sources = readdirSync(dir).filter(f => f.endsWith(".mjs"))
  .map(f => ({ f, code: readFileSync(new URL(f, dir), "utf8") }));

test("no code can delete or move a file on the server", () => {
  const forbidden = [
    [/method\s*:\s*["'](DELETE|PUT|PATCH)["']/i, "an HTTP DELETE/PUT/PATCH"],
    [/\b(unlink|rmdir|rmSync|unlinkSync|deleteFile|removeFile|deleteDirectory)\b/, "a file-system delete"],
    [/FilePicker[\w.]*\.(delete|remove|rename|move)\b/i, "a FilePicker delete/move"],
    [/\bFP\(\)\.(delete|remove|rename|move)\b/i, "a FilePicker delete/move"],
    [/\bfs\./, "Node's fs module"]
  ];
  for (const { f, code } of sources) {
    for (const [re, what] of forbidden) assert.doesNotMatch(code, re, `${f} contains ${what}`);
  }
});

test("uploads only ever write into the world's own Theater folders", () => {
  const files = readFileSync(new URL("files.mjs", dir), "utf8");
  assert.match(files, /worlds\/\$\{game\.world\.id\}\/\$\{GENERATED_DIR\}/, "generated cards and titles");
  const optimize = readFileSync(new URL("optimize.mjs", dir), "utf8");
  assert.match(optimize, /OPTIMIZED_DIR/, "optimized copies go to their own folder");
  for (const { f, code } of sources) {
    for (const m of code.matchAll(/uploadAs\(\s*[^,]+,\s*([^,]+),/g)) {
      if (f === "files.mjs" && m[1].includes("GENERATED_DIR")) continue;
      assert.match(m[1], /dir|OPTIMIZED_DIR|GENERATED_DIR/, `${f}: upload target ${m[1]}`);
    }
  }
});

// ---- Remove all, run against a stand-in scene -----------------------------------------
let confirmAnswer = true;
const calls = [];
globalThis.foundry = {
  applications: { api: { DialogV2: { confirm: async () => confirmAnswer }, ApplicationV2: class {} }, apps: { FilePicker: { implementation: class {} } } },
  utils: { randomID: () => "x" }
};
globalThis.game = { i18n: { localize: k => k, format: k => k }, settings: { get: () => false } };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
const meta = (kind, extra = {}) => ({ "planar-theater": { kind, order: 0, ...extra } });
const tiles = [
  { id: "p1", texture: { src: "worlds/w/places/m1.webp" }, flags: meta("place", { label: "M1" }) },
  { id: "p2", texture: { src: "worlds/w/places/m2.webp" }, flags: meta("place", { label: "M2" }) },
  { id: "t1", texture: { src: "worlds/w/theater-generated/title.webp" }, flags: meta("title", { parent: "p1" }) },
  { id: "tOrphan", texture: { src: "x.webp" }, flags: meta("title", { parent: "gone" }) },
  { id: "n1", texture: { src: "worlds/w/cast/jex.webp" }, flags: meta("npc", { name: "Jex" }) },
  { id: "map-tile", texture: { src: "maps/door.webp" }, flags: {} }
];
const scene = {
  name: "Mortuary",
  tiles: Object.assign([...tiles], { get: id => tiles.find(x => x.id === id) }),
  deleteEmbeddedDocuments: async (type, ids) => { calls.push([type, [...ids]]); },
  update: () => { throw new Error("must not update the scene"); }
};
const { Stage } = await import("../scripts/stage.mjs");

test("Remove all places deletes only place and title-card tiles, nothing else", async () => {
  calls.length = 0;
  await new Stage(scene).removeAll("place");
  assert.equal(calls.length, 1, "one call");
  const [type, ids] = calls[0];
  assert.equal(type, "Tile", "only Tile documents");
  assert.deepEqual(ids.sort(), ["p1", "p2", "t1", "tOrphan"]);
});

test("Remove all cast deletes only NPC tiles", async () => {
  calls.length = 0;
  await new Stage(scene).removeAll("npc");
  assert.deepEqual(calls, [["Tile", ["n1"]]]);
});

test("Cancel removes nothing", async () => {
  calls.length = 0;
  confirmAnswer = false;
  assert.equal(await new Stage(scene).removeAll("place"), 0);
  assert.deepEqual(calls, []);
  confirmAnswer = true;
});
