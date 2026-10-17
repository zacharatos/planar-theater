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
  optimize.mjs         lighter WebP copies of heavy images (draw, encode, upload), file sizes from the server
  audit.mjs            the asset audit window: files (scan, sizes, optimize, repoint) and world data (sizes, move to compendium)
  sound.mjs            playlist sound switching, loop/fade setup, preload
  scene.mjs            "New scene" helper (black via Level on v14)
  socket.mjs           GM <-> player preload requests and acknowledgements
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

Lighter images and the asset audit
- Add places from a folder of 2–3 MB PNGs: a message says how many were optimized and the total before → after; the tiles show `worlds/<world>/theater-optimized/*.webp`; the panel thumbnails look the same. Add the same folder again: "every image is already loaded" (no duplicates).
- Turn *Optimize images when adding* off and add a PNG folder: the tiles use the original PNGs.
- **Optimize images** on the Mortuary scene: places and NPC cards over the limit are converted; run it again: "already light". **Restore originals**: the original files come back (veiled NPC names still switch correctly).
- With a player connected, reload the player after optimizing: the player's network tab shows the WebP files, several times smaller.
- **Assets → Files**: the scene PNGs, the Soundboard pad files and the 1-hour music files are listed with sizes, biggest first; *Heavy only* keeps the PNGs, `.wav`/`.flac` and the big `.m4a`. Hover the "Used" number: the scenes, playlists or settings that use the file.
- **Optimize** on a PNG portrait used by an actor and its token: both now point to the WebP copy.
- **⇄** on the 1-hour `.m4a`, pick a short `.ogg`: confirm; the playlist sound (and any soundscape that used it) now plays the `.ogg`.
- **Assets → World data**: sizes per type add up to the total; *Clear chat log* asks first. Tick two unused Plutonium items and **Move**: they appear in the *Planar Archive — Items* compendium and are gone from the sidebar. A player's character, an actor with a token on a scene, and an actor linked from a journal show why they stay and have no checkbox.

- New scene creates a **black** (not grey) 1920×1080 gridless scene and opens it. The button is in the pinned toolbar, not at the bottom.
- Add places with PNG, JPG and WEBP of different sizes: all fill the scene without cropping or offset.
- Click places repeatedly with Fade on and off: no flash of the previous image.
- Title card appears on place change and fades out; clicking another place cancels it.
- Linked sound cross-fades; Silence stops it.
- Add cast with tall, wide and square portraits. Slide in/out; a second NPC on the same side replaces the first.
- Veil an NPC: players see `?`; reveal restores the name instantly; rename regenerates the card.
- Close the folder picker without choosing: the panel stays usable.
- Remove a place that has a title card: both tiles disappear.
- Preload with a player connected (a second browser logged in as a player): a message says "Preloaded on: <name>". No "file(s) failed to load" warning appears, and the player's console has no `texture preload failed`. Rename one place image on disk so it can't load, then Preload: only that file is reported. With nobody connected it says so. Close the player's tab mid-way: that player is reported as not answering.
- Show to players with a player on another scene: the message names that player; once they switch, the presence chip turns green. Check that `viewedScene` is kept up to date.
- Clear cast button and the "Clear cast on new place" checkbox: NPCs slide out; the checkbox survives a reload.
- Log in as a player: no Theater button, no panel.
- Import from the macro: run on a scene made by the old macro; run twice (second does nothing).

## Changing things

- **New user-facing text**: add the key to `lang/en.json` and `lang/el.json`. The language test fails if they differ.
- **New pure logic**: put it in `util.mjs` with a test.
- **Image weight**: limits live in `OPTIMIZE` (`constants.mjs`). Optimized copies are named from the original path (`optimizedName`), so optimizing again replaces the same copy. A place's `flags.planar-theater.src` always stays the original (it prevents duplicates when a folder is added again); `flags.planar-theater.orig` holds `[copy, original]` pairs for *Restore originals*. The audit's repoint never touches those two flags.
- **Data shape**: tile data lives in `flags.planar-theater` (`kind`: place / npc / title). If you change its shape, bump a schema version and write a migration in `migrate.mjs`; people will have scenes built with older versions.
- **Z-order**: `BAND` in `constants.mjs` keeps places below cast below titles via `sort`.
- **Tile anchor**: in v14 a tile's `x/y` can be its centre. `Stage#place` measures the real bounds and corrects; do not assume `x/y` is the top-left.
- **Scene background (v14)**: scenes have no `backgroundColor`; it is `level.background.color` on the scene's Level (`scene.mjs#paintBlack`).
- **Preload (v14)**: `game.scenes.preload(id, {broadcast: true})` takes an options object, and we preload through our own socket so we can confirm per player (`socket.mjs`).
- **Hidden tiles** are shown to the GM at half alpha, so "off" is `hidden: true` and `alpha: 0`.

## Versions

Follow [SemVer](https://semver.org/). Update `CHANGELOG.md` first, then tag. Compatibility lives in `module.json` (`minimum`, `verified`); raise `verified` only after testing on that Foundry version.
