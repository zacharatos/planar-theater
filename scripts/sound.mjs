// Scene sound = one linked PlaylistSound at a time, tracked in a scene flag.
import { MODULE_ID } from "./constants.mjs";
import { warn } from "./i18n.mjs";

const play = snd => (typeof snd.parent?.playSound === "function" ? snd.parent.playSound(snd) : snd.update({ playing: true }));
const stop = snd => (typeof snd.parent?.stopSound === "function" ? snd.parent.stopSound(snd) : snd.update({ playing: false }));

/** Cross-fade to a linked sound. A place without a sound leaves the current one playing. */
export async function switchTo(scene, uuid) {
  if (!uuid) return;
  const next = await fromUuid(uuid);
  if (!next) return warn("Notify.SoundMissing");
  const current = scene.getFlag(MODULE_ID, "sound");
  if (current === uuid && next.playing) return;
  if (current && current !== uuid) {
    const prev = await fromUuid(current);
    if (prev?.playing) await stop(prev);
  }
  await play(next);
  await scene.setFlag(MODULE_ID, "sound", uuid);
}

export async function silence(scene) {
  const current = scene.getFlag(MODULE_ID, "sound");
  if (current) {
    const snd = await fromUuid(current);
    if (snd?.playing) await stop(snd);
  }
  await scene.unsetFlag(MODULE_ID, "sound");
}

/** Linked sounds should loop and fade; set that once, and only if the GM hasn't. */
export async function ensureLoopAndFade(uuid, fadeMs) {
  const snd = await fromUuid(uuid);
  if (snd && (!snd.repeat || !(snd.fade > 0))) {
    await snd.update({ repeat: true, fade: snd.fade > 0 ? snd.fade : fadeMs });
  }
}

/**
 * Ask every connected client to preload the sounds linked to this scene.
 * Uses the instance method game.audio.preload, which broadcasts the request;
 * the static AudioHelper.preloadSound only loads locally.
 */
export async function preloadLinked(uuids) {
  let count = 0;
  for (const uuid of new Set(uuids.filter(Boolean))) {
    const snd = await fromUuid(uuid);
    if (!snd?.path) continue;
    try { await game.audio.preload(snd.path); count++; }
    catch (err) { console.warn(`${MODULE_ID} | could not preload`, snd.path, err); }
  }
  return count;
}
