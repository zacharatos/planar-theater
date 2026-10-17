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
  socket.mjs           GM <-> player preload requests and acknowledgements; over-the-map acks
  overlay.mjs          over the map, GM side: the "overlay" world setting, API (showPlace, showNpc, showImage, hide…),
                       sound + Soundboard ducking, auto-lower on combat, settings and keybindings for it
  layer.mjs            over the map, every client: draws the state as HTML over the canvas (transitions, cast,
                       title, peek, local sound for chosen players, optional slow map)
  onair.mjs            the GM's "on air" chip over the map
  enrich.mjs           @Place[…] / @Cast[…] journal buttons
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

Over the map (1.3.0). Two browsers: the GM, and a player on a map scene (e.g. the Mortuary).
- Open the panel on the map: it shows **Over the map**, a Theater scene picker, *Who sees it*, *Show as*, *Transition*. On the Theater scene itself the panel is unchanged.
- **Preload for the map**: "Preloaded on: <player>"; the player's network tab shows the place images (no GPU textures needed).
- Click a place (Fade, Full screen): the player sees it over the map, the title card, the linked sound; the token layer is not touched and nobody changes scene. The GM stays on the map and gets the red **on air** chip at the top with `1/1`.
- Click another place: a cross-fade, no black frame. Try **Iris** (opens from the centre) and **Glitch** (flicker + scanlines), then **Cut**.
- **Window over the map**: a framed picture over the dimmed map; the sidebar, chat and hotbar stay usable in both modes; the picture sits left of the sidebar and re-centres when the sidebar is collapsed.
- Click an NPC with a place up: the card slides in on its side; a second NPC on the same side replaces it; click again to send it out. With nothing up, an NPC alone appears over the dimmed map. A veiled NPC shows `?`.
- Player holds **V** (or the *Hold to see the map* button): the picture turns almost transparent and the map shows through; releasing brings it back.
- **Who sees it**: tick one player, click the place again: only that player sees it; the other player is back on the map; the chip says "chosen players" and `1/1`. The sound plays only in the chosen player's browser.
- **Take down** (chip ✕, panel button, or the *take down* keybinding if bound): everyone is back on the map; with Iris it closes as an iris.
- Planar Soundboard running a soundscape on the map: when a place goes up for everyone the music/ambience dip (Narrate); when it comes down they return. **Check that the place's own linked sound is not dipped too**; if it is, untick *Turn the Soundboard down over the map*.
- Start a combat (or roll initiative) with a place up: it comes down and the GM gets a message. With the setting off, it stays.
- Player presses F5 with a place up: after the reload the picture is there at once (no title card). A player who logs in late sees it too, and the chip count goes up.
- The chip's screen button: the GM sees what the players see (on the GM's screen only); click again to return to the map.
- In a journal: `@Place[Jex]`, `@Place[Jex | mode=window | fx=iris]{Jex's door}`, `@Place[Jex | to=Nanouk]`, `@Cast[Jex]`, `@Place[off]`. The GM sees ▶ buttons that work; a player who can see the journal sees plain text.
- Macro: `game.modules.get("planar-theater").api.showPlace("Jex", {transition: "glitch"})`, `.showImage("worlds/x/handout.webp", {title: "Ο Χάρτης | Σιγίλ"})`, `.hide()`.
- *Slow the map behind a full-screen place* (client setting) on a laptop: GPU use drops while a full-screen place is up; the map runs normally again when peeking and after taking it down.

Lighter images and the asset audit
- Add places from a folder of 2–3 MB PNGs: a message says how many were optimized and the total before → after; the tiles show `worlds/<world>/theater-optimized/*.webp`; the panel thumbnails look the same. Add the same folder again: "every image is already loaded" (no duplicates).
- Turn *Optimize images when adding* off and add a PNG folder: the tiles use the original PNGs.
- **Optimize images** on the Mortuary scene: places and NPC cards over the limit are converted; run it again: "already light". **Restore originals**: the original files come back (veiled NPC names still switch correctly).
- With a player connected, reload the player after optimizing: the player's network tab shows the WebP files, several times smaller.
- **Assets → Files**: the scene PNGs, the Soundboard pad files and the 1-hour music files are listed with sizes, biggest first; *Heavy only* keeps the PNGs, `.wav`/`.flac` and the big `.m4a`. Hover the "Used" number: the scenes, playlists or settings that use the file.
- **Optimize** on a PNG portrait used by an actor and its token: both now point to the WebP copy.
- **⇄** on the 1-hour `.m4a`, pick a short `.ogg`: confirm; the playlist sound (and any soundscape that used it) now plays the `.ogg`.
- Paths with spaces and symbols (`Campfire ｜ D&D⧸TTRPG … [id].m4a`, `Fruth's fingers.png`): ⇄ and Optimize change them (Foundry stores them URL-encoded; matching is on the decoded path).
- **Use the .lite.ogg copies** after running `lighten-audio.sh`: the hour-long tracks disappear from *Heavy only*, the playlists play the `.lite.ogg` files (with repeat on), and a player's network tab shows the small files after a reload.
- **Optimize all heavy images**: every heavy PNG is replaced in every scene; *Heavy only* is (nearly) empty afterwards; `worlds/<world>/theater-optimized/` holds the copies.
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
- **Over the map**: one world setting (`overlay`) is the whole state: `{seq, users, mode, transition, ratio, place: {id, scene, src, label, title}, cast: [{id, scene, src, side, box, label?}], sound: {uuid, path, volume}, globalSound, ducked}`. Only the GM writes it (one write per action, never per frame); `onChange` draws it on every client (`layer.mjs`) and fires the hook `planar-theater.overlay`. It holds what is displayed, not tile ids to look up, so players need no access to the Theater scene. World settings are readable by every client, so it never holds a veiled NPC's name, and a "chosen players only" picture is hidden from the others' screens, not from a curious console (use Planar Whispers for real secrets). Animations are Web Animations on opacity/transform/clip-path only; images are `decode()`d before they are shown.

## Versions

Follow [SemVer](https://semver.org/). Update `CHANGELOG.md` first, then tag. Compatibility lives in `module.json` (`minimum`, `verified`); raise `verified` only after testing on that Foundry version.
