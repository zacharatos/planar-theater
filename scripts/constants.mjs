export const MODULE_ID = "planar-theater";

/** Image types the folder scan accepts. */
export const IMG = /\.(png|jpe?g|webp|avif|gif)$/i;

/** Crossfade: number of steps and delay between them (ms). */
export const FADE_STEPS = 8;
export const FADE_MS = 45;
export const TITLE_FADE_IN_MS = 80;
export const TITLE_FADE_OUT_MS = 100;

/**
 * Tile `sort` bands. Places sit lowest, cast above them, title cards on top,
 * so nothing ever needs to be re-ordered against another kind.
 */
export const BAND = { place: 0, npc: 1_000_000, title: 2_000_000 };

export const FONT = `"Palatino Linotype","Book Antiqua",Palatino,"Noto Serif",Georgia,serif`;
export const GOLD = "#c9a14e";

/** Geometry of a generated NPC card, as fractions of the scene rectangle. */
export const CARD = { maxWidth: 0.30, maxHeight: 0.74, shadow: 20, pad: 14, plate: 60 };

/** NPC placement: side margin (fraction of scene width) and slide distance. */
export const NPC = { margin: 0.035, slide: 0.03, lift: 0.05 };

/** Title cards occupy the bottom fraction of the scene. */
export const TITLE_HEIGHT = 0.2;

/** How long the GM waits for players: to confirm a preload, and to arrive on an activated scene. */
export const PRELOAD_TIMEOUT_MS = 20_000;
export const ACTIVATE_WAIT_MS = 6_000;

/** Canvas colour of a Theater scene. */
export const BLACK = "#000000";

/** Folder (inside the world) where generated cards and titles are saved. */
export const GENERATED_DIR = "theater-generated";
