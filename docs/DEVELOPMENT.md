# Development

## Layout

```
module.json            manifest (id = planar-theater; the id is permanent once published)
scripts/
  main.mjs             hooks: init, ready, scene-control tool, tile/canvas hooks
  panel.mjs            the GM panel (ApplicationV2), markup and click handling
  stage.mjs            everything that changes tiles: show, hide, fade, add, edit, remove
  render.mjs           canvas drawing of NPC cards and title cards -> Blob
  files.mjs            folder picker, folder listing, upload to the world
  sound.mjs            playlist sound switching, loop/fade setup, preload
  scene.mjs            "New Theater scene" helper
  migrate.mjs          import from the original macro
  settings.mjs  i18n.mjs  constants.mjs
  util.mjs             pure helpers (no Foundry globals), all unit-tested
styles/theater.css     panel styles, scoped to .planar-theater
lang/en.json el.json   interface strings (keys under PLANAR_THEATER.*)
legacy/                the original macro, frozen for reference
tests/                 node:test unit tests, manifest and language checks, a link test
tools/                 stamp-manifest, package, release-api, check-syntax
.github/workflows/     ci.yml, release.yml
```

There is no build step: Foundry loads `scripts/main.mjs` directly.

## Run the checks

```
npm test
```

This runs a syntax check on every `.mjs` file and the tests: pure helper tests, manifest and language-parity checks (every key used in code exists in both languages, placeholders match), and a link test that imports `main.mjs` against stubbed Foundry globals.

These tests do not start Foundry. Anything touching tiles, the canvas or the FilePicker has to be tried by hand (see below).

## Try it in Foundry

Put (or symlink) the repo into your user data as `Data/modules/planar-theater/` and restart the world. A symlink is easiest:

```
ln -s /path/to/repo /path/to/FoundryData/Data/modules/planar-theater
```

Reload the browser tab (F5) after each change; the module has no hot reload.

### Manual test checklist

- New Theater scene creates a black 1920×1080 gridless scene and opens it.
- Add places with PNG, JPG and WEBP of different sizes: all fill the scene without cropping or offset.
- Click places repeatedly with Fade on and off: no flash of the previous image.
- Title card appears on place change and fades out; clicking another place cancels it.
- Linked sound cross-fades; Silence stops it.
- Add cast with tall, wide and square portraits. Slide in/out; a second NPC on the same side replaces the first.
- Veil an NPC: players see `?`; reveal restores the name instantly; rename regenerates the card.
- Close the folder picker without choosing: the panel stays usable.
- Remove a place that has a title card: both tiles disappear.
- Preload with a player connected: the player's console shows the images and sounds loading.
- Log in as a player: no Theater button, no panel.
- Import from the macro: run on a scene made by the old macro; run twice (second does nothing).

## Changing things

- **New user-facing text**: add the key to `lang/en.json` and `lang/el.json`. The language test fails if they differ.
- **New pure logic**: put it in `util.mjs` with a test.
- **Data shape**: tile data lives in `flags.planar-theater` (`kind`: place / npc / title). If you change its shape, bump a schema version and write a migration in `migrate.mjs`; people will have scenes built with older versions.
- **Z-order**: `BAND` in `constants.mjs` keeps places below cast below titles via `sort`.
- **Tile anchor**: in v14 a tile's `x/y` can be its centre. `Stage#place` measures the real bounds and corrects; do not assume `x/y` is the top-left.
- **Hidden tiles** are shown to the GM at half alpha, so "off" is `hidden: true` and `alpha: 0`.

## Versions

Follow [SemVer](https://semver.org/). Update `CHANGELOG.md` first, then tag. Compatibility lives in `module.json` (`minimum`, `verified`); raise `verified` only after testing on that Foundry version.
