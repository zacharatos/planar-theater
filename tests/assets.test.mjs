// Optimizing images and the asset audit: the pure parts (what is heavy, file names, finding and
// replacing paths in document data). Drawing, uploading and updating documents need Foundry.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitWithin, hash36, optimizedName, needsOptimizing, worthReplacing, formatBytes, toURL, mediaKind,
  isMediaPath, mediaInString, collectMedia, isPackageAsset, isHeavy, replacePath, deepReplace, pathUpdates,
  normPath, samePath, withoutOriginals, liteAudioPath
} from "../scripts/util.mjs";
import { MODULE_ID } from "../scripts/constants.mjs";

const MB = 1024 * 1024;

test("fitWithin shrinks the long side to the limit and never enlarges", () => {
  assert.deepEqual(fitWithin(2912, 1632, 2560), { width: 2560, height: 1435, scaled: true });
  assert.deepEqual(fitWithin(1632, 2912, 2560), { width: 1435, height: 2560, scaled: true });
  assert.deepEqual(fitWithin(1456, 816, 2560), { width: 1456, height: 816, scaled: false });
});

test("optimized names are readable, .webp, and differ for same-named files in different folders", () => {
  const a = optimizedName("dnd/Scenes/Chapter01/Ch01 - 07 - M4 Cold Locker.png");
  assert.match(a, /^ch01-07-m4-cold-locker-[0-9a-z]+\.webp$/);
  assert.notEqual(optimizedName("a/Map.png"), optimizedName("b/Map.png"));
  assert.equal(optimizedName("a/Map.png"), optimizedName("a/Map.png"), "stable: optimizing again replaces the same copy");
  assert.match(optimizedName("a/Η%20Νεκροθήκη.png"), /^img-[0-9a-z]+\.webp$/, "all-Greek names fall back to img-");
  assert.equal(hash36("x"), hash36("x"));
});

test("what counts as heavy enough to optimize", () => {
  assert.ok(needsOptimizing("a.png", 2.4 * MB));
  assert.ok(needsOptimizing("a.png", 400 * 1024), "PNG over 300 KB");
  assert.ok(!needsOptimizing("a.png", 200 * 1024));
  assert.ok(needsOptimizing("a.webp", 1.5 * MB));
  assert.ok(!needsOptimizing("a.webp", 600 * 1024));
  assert.ok(needsOptimizing("a.png"), "unknown size: PNG yes");
  assert.ok(!needsOptimizing("a.jpg"), "unknown size: JPG no");
  assert.ok(!needsOptimizing("a.gif", 5 * MB), "GIFs may be animated");
  assert.ok(!needsOptimizing("a.svg", 5 * MB));
  assert.ok(!needsOptimizing("a.mp3", 5 * MB));
});

test("a copy is kept only when it saves at least a fifth", () => {
  assert.ok(worthReplacing(1000, 790));
  assert.ok(!worthReplacing(1000, 850));
  assert.ok(worthReplacing(null, 850), "unknown original size: keep the copy");
});

test("formatBytes and toURL", () => {
  assert.equal(formatBytes(2.44 * MB), "2.4 MB");
  assert.equal(formatBytes(830 * 1024), "830 KB");
  assert.equal(formatBytes(null), "?");
  assert.equal(toURL("dnd/A B #1.png"), "dnd/A%20B%20%231.png");
  assert.equal(toURL("dnd/A%20B.png"), "dnd/A%20B.png", "already encoded stays as is");
  assert.equal(toURL("https://x.y/a b.png"), "https://x.y/a b.png");
});

test("media kinds and paths", () => {
  assert.equal(mediaKind("a/b.PNG"), "image");
  assert.equal(mediaKind("a/b.m4a?x=1"), "audio");
  assert.equal(mediaKind("a/b.webm"), "video");
  assert.equal(mediaKind("a/b.json"), null);
  assert.ok(isMediaPath("dnd/Music/Campfire ｜ 1 Hour.m4a"));
  assert.ok(!isMediaPath("data:image/png;base64,AAAA.png"));
  assert.ok(!isMediaPath("<p>see a.png</p>"));
  assert.deepEqual(mediaInString(`<p><img src="dnd/A%20B.webp" alt=""> <a href='x/y.pdf'>y</a> <video poster="v/p.jpg"></video></p>`), ["dnd/A%20B.webp", "v/p.jpg"]);
});

test("collectMedia finds paths in nested data and HTML, once each", () => {
  const data = {
    img: "a/portrait.png",
    prototypeToken: { texture: { src: "a/token.webp" } },
    items: [{ img: "a/portrait.png" }],
    text: { content: `<img src="a/handout.jpg">` },
    flags: { x: { sources: ["sfx/door.ogg", "sfx/door.ogg"] } },
    name: "not a path"
  };
  assert.deepEqual([...collectMedia(data)].sort(), ["a/handout.jpg", "a/portrait.png", "a/token.webp", "sfx/door.ogg"]);
});

test("isPackageAsset and isHeavy", () => {
  assert.ok(isPackageAsset("icons/svg/mystery-man.svg"));
  assert.ok(isPackageAsset("modules/dice-so-nice/sounds/a.mp3"));
  assert.ok(!isPackageAsset("dnd/Scenes/x.png"));
  assert.ok(isHeavy("a.png", 2 * MB));
  assert.ok(isHeavy("a.wav", 100));
  assert.ok(isHeavy("a.m4a", 60 * MB));
  assert.ok(!isHeavy("a.ogg", 3 * MB));
  assert.ok(isHeavy("a.mp4", 30 * MB));
});

test("replacePath swaps the plain and the URL-encoded form", () => {
  assert.equal(replacePath("a/A B.png", "a/A B.png", "o/c.webp"), "o/c.webp");
  assert.equal(replacePath(`<img src="a/A%20B.png">`, "a/A B.png", "o/C D.webp"), `<img src="o/C%20D.webp">`);
  assert.equal(replacePath("other", "a/A B.png", "x"), "other");
});

test("deepReplace copies only what changed", () => {
  const v = { a: ["x.png", "y.png"], b: { c: "x.png" }, d: 3 };
  const r = deepReplace(v, "x.png", "z.webp");
  assert.ok(r.changed);
  assert.deepEqual(r.value, { a: ["z.webp", "y.png"], b: { c: "z.webp" }, d: 3 });
  assert.equal(v.a[0], "x.png", "the input is not changed");
  assert.equal(deepReplace(v, "nope.png", "z").changed, false);
});

test("pathUpdates gives dotted keys, whole arrays, and skips the Theater's own originals", () => {
  const data = {
    _id: "abc", img: "a/b.png",
    texture: { src: "a/b.png", tint: null },
    flags: { [MODULE_ID]: { src: "a/b.png", orig: [["a/b.png", "z.png"]], cardShown: "a/b.png" } },
    sources: ["a/b.png", "c.ogg"],
    text: { content: `<p><img src="a/b.png"></p>` },
    _stats: { note: "a/b.png" }
  };
  const updates = pathUpdates(data, "a/b.png", "o/b.webp", { skip: [`flags.${MODULE_ID}.src`, `flags.${MODULE_ID}.orig`] });
  assert.deepEqual(updates, {
    img: "o/b.webp",
    "texture.src": "o/b.webp",
    [`flags.${MODULE_ID}.cardShown`]: "o/b.webp",
    sources: ["o/b.webp", "c.ogg"],
    "text.content": `<p><img src="o/b.webp"></p>`
  });
});


// Foundry stores paths URL-encoded; scripts and pasted paths are plain. Both must match.
const STORED = "dnd/Music/Ambience/Campfire%20%EF%BD%9C%20D%26D%E2%A7%B8TTRPG%20Ambience%20%EF%BD%9C%201%20Hour%20%5Bww8E0MR6AjQ%5D.m4a";
const PLAIN = "dnd/Music/Ambience/Campfire ｜ D&D⧸TTRPG Ambience ｜ 1 Hour [ww8E0MR6AjQ].m4a";

test("normPath and samePath see through Foundry's URL encoding", () => {
  assert.equal(normPath(STORED), PLAIN);
  assert.ok(samePath(STORED, PLAIN));
  assert.ok(samePath("dnd/Ch01%20-%20Fruth%27s%20%2B%20x.png", "dnd/Ch01 - Fruth's + x.png"));
  assert.ok(samePath("a/b.png?v=2", "a/b.png"));
  assert.ok(!samePath("a/b.png", "a/c.png"));
  assert.equal(normPath("a/100% real.png"), "a/100% real.png", "malformed escapes don't throw");
});

test("replacePath matches an encoded stored path from a plain one, in every spelling", () => {
  assert.equal(replacePath(STORED, PLAIN, "x/c.lite.ogg"), "x/c.lite.ogg");
  assert.equal(replacePath(PLAIN, STORED, "x/c.lite.ogg"), "x/c.lite.ogg");
  assert.equal(replacePath(`<img src="dnd/Ch01%20-%20Fruth%27s.png">`, "dnd/Ch01 - Fruth's.png", "o/a b.webp"), `<img src="o/a%20b.webp">`);
  assert.equal(replacePath("![a](dnd/Ch01%20-%20Fruth%27s%20(x).png)", "dnd/Ch01 - Fruth's (x).png", "o/b.webp"), "![a](o/b.webp)");
  assert.equal(replacePath("dnd/other.png", PLAIN, "x"), "dnd/other.png");
  const updates = pathUpdates({ path: STORED, sounds: [STORED] }, PLAIN, "x/c.lite.ogg");
  assert.deepEqual(updates, { path: "x/c.lite.ogg", sounds: ["x/c.lite.ogg"] });
});

test("withoutOriginals drops the Theater's record of original files, nothing else", () => {
  const scene = { background: { src: "bg.png" }, tiles: [
    { texture: { src: "o/a.webp" }, flags: { [MODULE_ID]: { kind: "place", src: "a.png", orig: [["o/a.webp", "a.png"]], title: "x" }, other: { y: 1 } } }
  ] };
  const out = withoutOriginals(scene);
  assert.deepEqual([...collectMedia(out)].sort(), ["bg.png", "o/a.webp"]);
  assert.equal(out.tiles[0].flags[MODULE_ID].kind, "place");
  assert.equal(out.tiles[0].flags.other.y, 1);
  assert.equal(scene.tiles[0].flags[MODULE_ID].src, "a.png", "input untouched");
});

test("liteAudioPath names the copy made by lighten-audio.sh", () => {
  assert.equal(liteAudioPath("dnd/Music/A B.m4a"), "dnd/Music/A B.lite.ogg");
  assert.equal(liteAudioPath(STORED), STORED.replace(/\.m4a$/, ".lite.ogg"));
  assert.equal(liteAudioPath("a.b/c.mp3?x=1"), "a.b/c.lite.ogg?x=1");
});
