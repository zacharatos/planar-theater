import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isImage, naturalSort, escapeHTML, labelFromPath, slugify, containFit, centerIn, npcPosition,
  npcSlide, cardLayout, titleBox, splitTitle, alternateSide, nextOrder, nextSort, metaOf, kindOf,
  nameOf, needsMigration, convertLegacyMeta
} from "../scripts/util.mjs";
import { BAND, MODULE_ID } from "../scripts/constants.mjs";

const rect = { x: 0, y: 0, width: 1920, height: 1080 };

test("isImage accepts the supported types, any case", () => {
  for (const f of ["a.png", "a.JPG", "a.jpeg", "a.webp", "a.avif", "a.gif"]) assert.ok(isImage(f), f);
  for (const f of ["a.mp3", "a.webm", "png", "a.png.txt"]) assert.ok(!isImage(f), f);
});

test("naturalSort orders 2 before 10", () => {
  assert.deepEqual(naturalSort(["10-b.png", "2-a.png", "1-c.png"]), ["1-c.png", "2-a.png", "10-b.png"]);
});

test("escapeHTML escapes the dangerous five", () => {
  assert.equal(escapeHTML(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  assert.equal(escapeHTML(undefined), "");
});

test("labelFromPath strips folder, number prefix, extension and decodes", () => {
  assert.equal(labelFromPath("worlds/x/03 - The%20Mortuary.webp"), "The Mortuary");
  assert.equal(labelFromPath("a/b/01_Shemeshka.png"), "Shemeshka");
  assert.equal(labelFromPath("a/b/Η%20Νεκροθήκη.jpg"), "Η Νεκροθήκη");
  assert.equal(labelFromPath("a/b/100% real.png"), "100% real", "malformed escapes must not throw");
});

test("slugify is ASCII-safe and never empty", () => {
  assert.equal(slugify("Cast — Shemeshka!"), "cast-shemeshka");
  assert.equal(slugify("Σιγίλ"), "img");
  assert.equal(slugify("Café"), "cafe");
});

test("containFit keeps aspect ratio and fits both ways", () => {
  assert.deepEqual(containFit(3840, 2160, 1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(containFit(1000, 1000, 1920, 1080), { width: 1080, height: 1080 });
  assert.deepEqual(containFit(2000, 500, 1920, 1080), { width: 1920, height: 480 });
});

test("centerIn centers inside a rect with an offset", () => {
  assert.deepEqual(centerIn({ x: 100, y: 50, width: 1920, height: 1080 }, 1080, 1080), { left: 520, top: 50 });
});

test("npcPosition hugs the chosen side and stays inside the scene", () => {
  const right = npcPosition(rect, 500, 800, "right");
  const left = npcPosition(rect, 500, 800, "left");
  assert.equal(left.left, 67);
  assert.equal(right.left + 500, 1920 - 67);
  assert.ok(right.top >= 0 && right.top + 800 <= 1080);
  const tall = npcPosition(rect, 500, 2000, "left");
  assert.equal(tall.top, 0, "never above the scene");
});

test("npcSlide points outward", () => {
  assert.ok(npcSlide(rect, "left") < 0);
  assert.ok(npcSlide(rect, "right") > 0);
});

test("cardLayout fits inside the allowed box for any portrait shape", () => {
  for (const [iw, ih] of [[600, 800], [2000, 3000], [1500, 1000], [400, 400], [5000, 300]]) {
    const L = cardLayout(iw, ih, rect);
    assert.ok(L.w <= rect.width * 0.30 + 2, `${iw}x${ih} width ${L.w}`);
    assert.ok(L.h <= rect.height * 0.74 + 2, `${iw}x${ih} height ${L.h}`);
    assert.ok(L.k >= 1 && L.k <= 2);
  }
});

test("titleBox is the bottom fifth", () => {
  assert.deepEqual(titleBox(rect), { left: 0, top: 864, width: 1920, height: 216 });
});

test("splitTitle", () => {
  assert.deepEqual(splitTitle("Main | small"), { main: "Main", sub: "small" });
  assert.deepEqual(splitTitle("  Only main  "), { main: "Only main", sub: undefined });
  assert.deepEqual(splitTitle("a | | b"), { main: "a", sub: "b" });
  assert.deepEqual(splitTitle(""), { main: "", sub: undefined });
});

test("alternateSide starts on the right", () => {
  assert.deepEqual([0, 1, 2, 3].map(alternateSide), ["right", "left", "right", "left"]);
});

test("nextOrder / nextSort", () => {
  assert.equal(nextOrder([]), 0);
  assert.equal(nextOrder([0, 1, 4]), 5);
  assert.equal(nextSort("place", []), BAND.place + 1);
  assert.equal(nextSort("npc", [BAND.npc + 5, undefined]), BAND.npc + 6);
});

test("flag accessors", () => {
  const place = { name: "Tile", flags: { [MODULE_ID]: { kind: "place", label: "Market" } } };
  const npc = { flags: { [MODULE_ID]: { kind: "npc", label: "file-name", name: "Shemeshka" } } };
  assert.equal(kindOf(place), "place");
  assert.equal(nameOf(place), "Market");
  assert.equal(nameOf(npc), "Shemeshka");
  assert.equal(metaOf({}), undefined);
});

test("legacy migration only picks up un-migrated macro tiles", () => {
  const legacy = { kind: "npc", name: "Ν", side: "left", home: { x: 1, y: 2 } };
  const old = { flags: { world: { theater: legacy } } };
  const done = { flags: { world: { theater: legacy }, [MODULE_ID]: { kind: "npc" } } };
  assert.ok(needsMigration(old));
  assert.ok(!needsMigration(done), "idempotent");
  assert.ok(!needsMigration({ flags: {} }));
  const copy = convertLegacyMeta(legacy);
  assert.deepEqual(copy, legacy);
  assert.notEqual(copy.home, legacy.home, "deep copy");
});
