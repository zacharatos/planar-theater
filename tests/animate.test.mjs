// The per-browser tile animation, driven by a fake frame clock instead of a real canvas.
import { test } from "node:test";
import assert from "node:assert/strict";

let now = 0;
const frames = [];
globalThis.requestAnimationFrame = fn => frames.push(fn);
globalThis.performance = { now: () => now };
/** Advance the clock and run the frame callbacks queued so far. */
const tick = ms => { now += ms; for (const fn of frames.splice(0)) fn(now); };

const makeTile = (id, alpha, x = 0) => {
  const doc = { id, alpha, x, drawn: [],
    updateSource(v) { Object.assign(doc, v); },
    object: { _onUpdate: (changed) => doc.drawn.push({ ...changed }) } };
  return doc;
};
const tiles = new Map();
globalThis.game = { user: { id: "gm" } };
globalThis.canvas = { scene: { id: "s1", tiles } };

const { animateTiles, cancelAnimation, cancelAllAnimations } = await import("../scripts/animate.mjs");

test("animates over the duration, redraws every frame and ends exactly on the target", async () => {
  const a = makeTile("a", 0, 100);
  tiles.set("a", a);
  const done = animateTiles("s1", [{ id: "a", a0: 0, a1: 1, x0: 140, x1: 100 }], 600);
  tick(0);
  for (let i = 0; i < 40 && frames.length; i++) tick(16);
  assert.equal(await done, true);
  assert.equal(a.alpha, 1);
  assert.equal(a.x, 100);
  assert.ok(a.drawn.length >= 30, `drawn ${a.drawn.length} frames, expected a smooth run`);
  const alphas = a.drawn.map(d => d.alpha);
  assert.deepEqual(alphas, [...alphas].sort((p, q) => p - q), "alpha only goes up");
});

test("a real update cancels it and no more frames are drawn", async () => {
  const b = makeTile("b", 1);
  tiles.set("b", b);
  const done = animateTiles("s1", [{ id: "b", a0: 1, a1: 0 }], 600);
  tick(0); tick(100);
  cancelAnimation("b");
  const drawn = b.drawn.length;
  tick(16); tick(16);
  assert.equal(await done, false);
  assert.equal(b.drawn.length, drawn);
});

test("a new animation of the same tile replaces the old one", async () => {
  const c = makeTile("c", 0);
  tiles.set("c", c);
  const first = animateTiles("s1", [{ id: "c", a0: 0, a1: 1 }], 300);
  const second = animateTiles("s1", [{ id: "c", a0: 0, a1: 0.5 }], 300);
  assert.equal(await first, false);
  for (let i = 0; i < 30 && frames.length; i++) tick(16);
  assert.equal(await second, true);
  assert.equal(c.alpha, 0.5);
});

test("does nothing for another scene or unknown tiles, and cancelAll is safe", async () => {
  assert.equal(await animateTiles("other", [{ id: "a", a0: 0, a1: 1 }], 300), false);
  assert.equal(await animateTiles("s1", [{ id: "nope", a0: 0, a1: 1 }], 300), false);
  const d = makeTile("d", 0);
  tiles.set("d", d);
  const done = animateTiles("s1", [{ id: "d", a0: 0, a1: 1 }], 300);
  cancelAllAnimations();
  assert.equal(await done, false);
  assert.doesNotThrow(() => cancelAllAnimations());
});

test("a redraw that throws stops the animation instead of looping on errors", async () => {
  const e = makeTile("e", 0);
  e.object._onUpdate = () => { throw new Error("no mesh"); };
  tiles.set("e", e);
  const warn = console.warn; console.warn = () => {};
  try {
    const done = animateTiles("s1", [{ id: "e", a0: 0, a1: 1 }], 300);
    tick(0);
    assert.equal(await done, false);
    assert.equal(frames.length, 0);
  } finally { console.warn = warn; }
});
