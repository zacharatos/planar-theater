export const MODULE_ID = "planar-theater";

/** Image types the folder scan accepts. */
export const IMG = /\.(png|jpe?g|webp|avif|gif)$/i;

/** Fade and slide durations (ms). Each browser animates them smoothly; only the end state is saved. */
export const FADE_MS = 600;
export const TITLE_FADE_IN_MS = 650;
export const TITLE_FADE_OUT_MS = 800;

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

/** Folder (inside the world) where optimized copies of heavy images are saved. */
export const OPTIMIZED_DIR = "theater-optimized";

/**
 * Image optimizing: heavy images are re-drawn as WebP no larger than maxSide on the long edge.
 * heavyBytes: anything above is optimized; PNG/BMP/TIFF above pngBytes too (they compress badly).
 * A copy is kept only if it saves at least minSaving of the original size.
 */
export const OPTIMIZE = { maxSide: 2560, quality: 0.85, heavyBytes: 1_000_000, pngBytes: 300_000, minSaving: 0.2 };

/** Asset audit: audio and video above these sizes are flagged as heavy. */
export const HEAVY_AUDIO_BYTES = 8 * 1024 * 1024;
export const HEAVY_VIDEO_BYTES = 20 * 1024 * 1024;
