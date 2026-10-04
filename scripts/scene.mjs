import { MODULE_ID, BLACK } from "./constants.mjs";
import { t, info, warn } from "./i18n.mjs";

/**
 * Make the scene's canvas colour black.
 * Foundry v13 and earlier keep it on the scene (`backgroundColor`). v14 moved the background
 * onto the scene's Levels (`level.background.color`), so the scene itself no longer has the field.
 * Returns true if a colour field was found and set.
 */
export async function paintBlack(scene) {
  const SceneClass = getDocumentClass("Scene");
  if (SceneClass.schema.getField("backgroundColor")) {
    await scene.update({ backgroundColor: BLACK });
    return true;
  }
  if (!SceneClass.schema.getField("levels")) return false;
  try {
    const levels = scene.levels;
    let level = levels?.get(scene.initialLevel) ?? levels?.contents?.[0];
    if (!level) [level] = await scene.createEmbeddedDocuments("Level", [{ name: scene.name }]);
    if (!level) return false;
    await level.update({ "background.color": BLACK });
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | could not set the level background colour`, err);
    return false;
  }
}

/** A black, gridless 1920x1080 scene with no vision or fog, ready for the Theater panel. */
export async function createTheaterScene(name) {
  const SceneClass = getDocumentClass("Scene");
  const scene = await SceneClass.create({
    name: name || t("Scene.DefaultName"),
    width: 1920, height: 1080, padding: 0,
    grid: { type: CONST.GRID_TYPES.GRIDLESS },
    tokenVision: false,
    fog: { exploration: false },
    flags: { [MODULE_ID]: { theater: true } }
  });
  if (!await paintBlack(scene)) warn("Notify.BlackFailed");
  await scene.view();
  info("Notify.SceneCreated", { name: scene.name });
  return scene;
}
