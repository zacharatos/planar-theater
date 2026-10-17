// Pure helpers behind "over the map".
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  overlayIsOn, overlayTargets, overlayChanges, foldName, findByName, parseShowArgs, resolveUsers, npcBoxFrac, isTheaterScene, isStageScene
} from "../scripts/util.mjs";

const place = (id, src = `${id}.webp`) => ({ id, src, label: id });
const npc = (id, side = "right", src = `${id}.webp`) => ({ id, src, side, box: {} });

test("overlayIsOn: a place or at least one NPC card", () => {
  assert.equal(overlayIsOn(null), false);
  assert.equal(overlayIsOn({}), false);
  assert.equal(overlayIsOn({ place: null, cast: [] }), false);
  assert.equal(overlayIsOn({ place: place("a"), cast: [] }), true);
  assert.equal(overlayIsOn({ place: null, cast: [npc("jex")] }), true);
});

test("overlayTargets: everyone, chosen players, GMs only in preview", () => {
  const on = { place: place("a") };
  const p1 = { id: "u1" }, p2 = { id: "u2" }, gm = { id: "g", isGM: true };
  assert.equal(overlayTargets(on, p1), true, "no list = every player");
  assert.equal(overlayTargets({ ...on, users: [] }, p1), true, "empty list = every player");
  assert.equal(overlayTargets({ ...on, users: ["u2"] }, p1), false);
  assert.equal(overlayTargets({ ...on, users: ["u2"] }, p2), true);
  assert.equal(overlayTargets(on, gm), false, "the GM stays on the map");
  assert.equal(overlayTargets(on, gm, { preview: true }), true);
  assert.equal(overlayTargets({}, p1), false, "nothing up");
});

test("overlayChanges: open, close, new place, cast in and out", () => {
  const a = { place: place("a"), cast: [npc("jex")], mode: "full" };
  assert.deepEqual(overlayChanges(null, a).open, true);
  assert.equal(overlayChanges(null, a).castIn.length, 1);
  assert.equal(overlayChanges(a, null).close, true);
  assert.equal(overlayChanges(a, { ...a }).place, false, "same place: no new picture");
  assert.equal(overlayChanges(a, { ...a, place: place("b") }).place, true);
  assert.equal(overlayChanges(a, { ...a, place: place("a", "a-lite.webp") }).place, true, "same tile, new file");
  const swap = overlayChanges(a, { ...a, cast: [npc("golem", "left")] });
  assert.deepEqual(swap.castIn.map(c => c.id), ["golem"]);
  assert.deepEqual(swap.castOut.map(c => c.id), ["jex"]);
  const revealed = overlayChanges(a, { ...a, cast: [npc("jex", "right", "jex-named.webp")] });
  assert.equal(revealed.castIn.length, 1, "a revealed name comes back as a new card");
  assert.equal(revealed.castOut.length, 1);
  assert.equal(overlayChanges(a, { ...a, mode: "window" }).mode, true);
});

test("foldName drops accents (Greek tonos too), case and extra spaces", () => {
  assert.equal(foldName("  Το  Νεκροτομείο "), "το νεκροτομειο");
  assert.equal(foldName("Jex’s Workshop"), "jex's workshop");
});

test("findByName: id, then exact, then starts with, then contains", () => {
  const items = [
    { id: "t1", label: "Jex's workshop" },
    { id: "t2", label: "Jex" },
    { id: "t3", label: "Το Νεκροτομείο" }
  ];
  assert.equal(findByName(items, "t1").id, "t1");
  assert.equal(findByName(items, "jex").id, "t2", "exact beats starts-with");
  assert.equal(findByName(items, "jex's").id, "t1");
  assert.equal(findByName(items, "νεκροτομειο").id, "t3", "without tonos");
  assert.equal(findByName(items, "workshop").id, "t1", "contains");
  assert.equal(findByName(items, "nothing"), null);
  assert.equal(findByName(items, ""), null);
  assert.equal(findByName([{ id: "x", names: ["A", "Jex's door | Sigil"] }], "jex's door", i => i.names).id, "x");
});

test("parseShowArgs reads the journal button options and ignores bad ones", () => {
  assert.deepEqual(parseShowArgs("Jex's workshop"), { name: "Jex's workshop" });
  assert.deepEqual(parseShowArgs("Jex | to=Nanouk, Elaion | mode=Window | fx=iris | scene=Mortuary Theater"),
    { name: "Jex", to: ["Nanouk", "Elaion"], mode: "window", transition: "iris", scene: "Mortuary Theater" });
  assert.deepEqual(parseShowArgs("Jex | mode=huge | fx=spin | nonsense"), { name: "Jex" });
  assert.deepEqual(parseShowArgs("Jex | transition=glitch"), { name: "Jex", transition: "glitch" });
});

test("resolveUsers: user names, character names and ids; GMs are never targets", () => {
  const users = [
    { id: "u1", name: "Maria", character: { name: "Nanouk Wiedzmin" } },
    { id: "u2", name: "Kostas" },
    { id: "g", name: "Timos", isGM: true }
  ];
  assert.deepEqual(resolveUsers(users, ["Nanouk", "kostas", "u2"]), { ids: ["u1", "u2"], unknown: [] });
  assert.deepEqual(resolveUsers(users, ["Timos", "Zed"]), { ids: [], unknown: ["Timos", "Zed"] });
  assert.deepEqual(resolveUsers(users, undefined), { ids: [], unknown: [] });
});

test("npcBoxFrac places a card where the Theater scene does, as fractions", () => {
  const right = npcBoxFrac(1920, 1080, 576, 800, "right");
  const left = npcBoxFrac(1920, 1080, 576, 800, "left");
  assert.ok(Math.abs(right.width - 0.3) < 1e-9 && Math.abs(right.height - 800 / 1080) < 1e-9);
  assert.ok(left.left < 0.05 && right.left + right.width > 0.95, "against the edges");
  assert.ok(Math.abs(left.left - (1 - right.left - right.width)) < 0.001, "mirrored");
  assert.ok(right.top >= 0);
});

test("isTheaterScene: the New scene flag, or Theater tiles", () => {
  const tile = kind => ({ flags: { "planar-theater": { kind } } });
  assert.equal(isTheaterScene({ flags: { "planar-theater": { theater: true } }, tiles: [] }), true);
  assert.equal(isTheaterScene({ flags: {}, tiles: [tile("place")] }), true);
  assert.equal(isTheaterScene({ flags: {}, tiles: [tile("title")] }), false, "a stray title card doesn't count");
  assert.equal(isTheaterScene({ flags: {}, tiles: [{ flags: {} }] }), false);
  assert.equal(isTheaterScene(null), false);
});

test("isStageScene: a map holding Theater tiles is still a map", () => {
  const tile = kind => ({ flags: { "planar-theater": { kind } } });
  const tokens = n => ({ size: n });
  assert.equal(isStageScene({ flags: { "planar-theater": { theater: true } }, tiles: [], tokens: tokens(0) }), true, "New scene");
  assert.equal(isStageScene({ flags: {}, tiles: [tile("place")], tokens: tokens(0) }), true, "old Theater scene without the flag");
  assert.equal(isStageScene({ flags: {}, tiles: [tile("place")], tokens: tokens(5) }), false, "the Mortuary map with places on it");
  assert.equal(isStageScene({ flags: {}, tiles: [], tokens: tokens(0) }), false, "an empty scene");
  assert.equal(isTheaterScene({ flags: {}, tiles: [tile("place")], tokens: tokens(5) }), true, "but its places can still be shown");
});
