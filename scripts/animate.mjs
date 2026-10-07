// Smooth tile fades and slides. Every browser animates the tiles itself, at its own frame
// rate, and the GM saves only the end state (Stage#steps). Writing each step to the database
// instead made every frame wait for a server round trip, so fades ran at a few frames a second.
import { tweenTile } from "./util.mjs";

/** Animations running in this browser, by tile id. */
const running = new Map();

/** Show one frame without saving it: change this browser's copy of the tile and redraw it. */
function showFrame(doc, values) {
  doc.updateSource(values);
  doc.object?._onUpdate?.(values, {}, game.user.id);
}

/**
 * Animate tiles of the viewed scene in this browser only.
 * @param {string} sceneId  ignored unless this browser is viewing that scene
 * @param {{id: string, a0: number, a1: number, x0?: number, x1?: number}[]} entries
 * @param {number} ms  duration
 * @returns {Promise<boolean>} true when it reached the end, false if it was cancelled
 */
export function animateTiles(sceneId, entries, ms) {
  const scene = globalThis.canvas?.scene;
  if (!scene || scene.id !== sceneId) return Promise.resolve(false);
  const items = entries.map(e => ({ e, doc: scene.tiles.get(e.id) })).filter(i => i.doc);
  if (!items.length) return Promise.resolve(false);
  return new Promise(resolve => {
    const run = {
      done: false,
      finish(ok) {
        if (run.done) return;
        run.done = true;
        for (const { e } of items) if (running.get(e.id) === run) running.delete(e.id);
        resolve(ok);
      }
    };
    for (const { e } of items) { running.get(e.id)?.finish(false); running.set(e.id, run); }
    const start = performance.now();
    const frame = now => {
      if (run.done) return;
      const p = ms > 0 ? Math.min(1, (now - start) / ms) : 1;
      try {
        for (const { e, doc } of items) showFrame(doc, tweenTile(e, p));
      } catch (err) {
        console.warn("planar-theater | animation stopped; the end state still arrives with the save", err);
        return run.finish(false);
      }
      if (p < 1) requestAnimationFrame(frame);
      else run.finish(true);
    };
    requestAnimationFrame(frame);
  });
}

/** Stop the animation of one tile (a real update to it has arrived and wins). */
export function cancelAnimation(id) {
  running.get(id)?.finish(false);
}

/** Stop everything, e.g. when the canvas is torn down for another scene. */
export function cancelAllAnimations() {
  for (const run of new Set(running.values())) run.finish(false);
}
