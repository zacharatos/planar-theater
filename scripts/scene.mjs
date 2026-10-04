import { MODULE_ID } from "./constants.mjs";
import { t, info } from "./i18n.mjs";

/** A black, gridless 1920x1080 scene with no vision or fog, ready for the Theater panel. */
export async function createTheaterScene(name) {
  const scene = await getDocumentClass("Scene").create({
    name: name || t("Scene.DefaultName"),
    width: 1920, height: 1080, padding: 0,
    backgroundColor: "#000000",
    grid: { type: CONST.GRID_TYPES.GRIDLESS },
    tokenVision: false,
    fog: { exploration: false },
    flags: { [MODULE_ID]: { theater: true } }
  });
  await scene.view();
  info("Notify.SceneCreated", { name: scene.name });
  return scene;
}
