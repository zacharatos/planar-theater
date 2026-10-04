// One-way, non-destructive import from the original "Ambient Theater" macro.
// The macro stored data under flags.world.theater; the module uses flags.planar-theater.
// Old data is left in place, so running this twice does nothing the second time.
import { MODULE_ID } from "./constants.mjs";
import { convertLegacyMeta, legacyMetaOf, needsMigration } from "./util.mjs";

export const pendingLegacyTiles = scene => scene?.tiles.filter(needsMigration) ?? [];

export async function migrateScene(scene) {
  const tiles = pendingLegacyTiles(scene);
  if (tiles.length) {
    await scene.updateEmbeddedDocuments("Tile", tiles.map(tile => ({
      _id: tile.id, flags: { [MODULE_ID]: convertLegacyMeta(legacyMetaOf(tile)) }
    })));
  }
  const source = scene.getFlag("world", "theaterSource");
  if (source && !scene.getFlag(MODULE_ID, "source")) await scene.setFlag(MODULE_ID, "source", source);
  const sound = scene.getFlag("world", "theaterSound");
  if (sound && !scene.getFlag(MODULE_ID, "sound")) await scene.setFlag(MODULE_ID, "sound", sound);
  return tiles.length;
}
