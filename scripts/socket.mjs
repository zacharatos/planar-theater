// Preload on every connected client, with a reply from each one so the GM can see it worked.
// (Core's scene preload sends no reply, and the old macro called it in a way that only ever
// loaded on the GM's own client. Here every client answers with what it loaded.)
import { MODULE_ID, PRELOAD_TIMEOUT_MS } from "./constants.mjs";
import { summarizeAcks } from "./util.mjs";
import { animateTiles } from "./animate.mjs";

const EVENT = `module.${MODULE_ID}`;
const textureLoader = () => foundry.canvas?.TextureLoader ?? globalThis.TextureLoader;
const audioHelper = () => foundry.audio?.AudioHelper ?? globalThis.AudioHelper;

/** Pending broadcasts, by request id. */
const pending = new Map();

/** Load images and sounds on THIS client. Returns what failed. */
export async function loadAssets({ images = [], sounds = [] }) {
  const failed = [];
  if (images.length) {
    try { await textureLoader().load(images, { displayProgress: false }); }
    catch (err) { console.warn(`${MODULE_ID} | texture preload failed`, err); failed.push(...images); }
  }
  for (const src of sounds) {
    try { await audioHelper().preloadSound(src); }
    catch (err) { console.warn(`${MODULE_ID} | sound preload failed`, src, err); failed.push(src); }
  }
  return { images: images.length, sounds: sounds.length, failed };
}

/** Ask all other connected clients to preload, load here too, and collect replies. */
export async function broadcastPreload({ images, sounds }) {
  const id = foundry.utils.randomID();
  const recipients = game.users.filter(u => u.active && u.id !== game.user.id).map(u => ({ id: u.id, name: u.name }));
  const acks = new Map();
  let timer;
  const everyoneReplied = new Promise(resolve => {
    pending.set(id, { acks, check: () => { if (acks.size >= recipients.length) resolve(); } });
    timer = setTimeout(resolve, PRELOAD_TIMEOUT_MS);
    if (!recipients.length) resolve();
  });
  game.socket.emit(EVENT, { op: "preload", id, from: game.user.id, images, sounds });
  const local = await loadAssets({ images, sounds });
  await everyoneReplied;
  clearTimeout(timer);
  pending.delete(id);
  return { local, recipients, ...summarizeAcks(recipients, acks) };
}

/** Ask every other browser to play a tile fade/slide (the GM's own browser plays it itself). */
export function broadcastAnimation(sceneId, entries, ms) {
  game.socket.emit(EVENT, { op: "animate", from: game.user.id, scene: sceneId, entries, ms });
}

/** Socket handler: runs on every client (the sender never receives its own emit). */
export async function onMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.op === "preload") {
    if (!game.users.get(msg.from)?.isGM) return; // only a GM may ask clients to load things
    const result = await loadAssets({ images: msg.images ?? [], sounds: msg.sounds ?? [] });
    game.socket.emit(EVENT, { op: "preload-ack", id: msg.id, to: msg.from, user: game.user.id, ...result });
  } else if (msg.op === "animate") {
    if (!game.users.get(msg.from)?.isGM) return;
    animateTiles(msg.scene, Array.isArray(msg.entries) ? msg.entries : [], Number(msg.ms) || 0);
  } else if (msg.op === "preload-ack" && msg.to === game.user.id) {
    const request = pending.get(msg.id);
    if (!request) return;
    request.acks.set(msg.user, msg);
    request.check();
  }
}

export function registerSocket() {
  game.socket.on(EVENT, onMessage);
}
