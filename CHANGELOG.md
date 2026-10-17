# Changelog

All notable changes to this module. Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).
The release workflow uses the section matching the tag as the GitHub release notes, so keep the `## [x.y.z]` headings exact.

## [1.4.0]

### Added
- **Map pins.** Over a map, drag a place or an NPC from the Theater panel onto the map: it becomes a pin (a map note) that **only the GM sees**. Double-click the pin during play to show that place over the map (again to take it down), or to bring the NPC in or out.
  - **Doors**: a pin dropped within 2½ squares of a door is linked to it. When anyone opens that door, the GM gets a small *"Door opened: show …?"* card (Show / Not now; it goes away by itself after 30 s). Per pin, in the note's sheet: *Ask me* (default), *Show it at once*, or *Nothing*. Moving the pin next to another door links that one.
  - Per pin, optional *Show as* and *Transition* (otherwise the panel's choices).
  - Pins are ordinary Foundry notes linked to one GM-only journal entry («Planar Theater — map pins»), so players never see them and you move, edit or delete them like any note. Map notes are switched on for the GM when the first pin is made.
- API: `pins(scene)`, `firePin(note)`.

## [1.3.1]

### Added
- **Remove all** next to the *Places* and *Cast* headings in the panel: removes every place (with its title card) or every NPC card from the scene, after asking. Over a map, it acts on the scene listed in the panel.
- **The Theater never deletes your files.** Removing places or NPCs (one or all) deletes only the tiles on the scene; the image files in your folders are never deleted, moved or changed. A new test (`tests/no-file-deletion.test.mjs`) fails if any code ever could.

### Fixed
- **Over the map didn't start on a map that holds Theater places.** A scene with Theater tiles counted as a Theater stage even when it was a battle map with tokens, so the panel opened in its normal mode and a clicked place was drawn on the map's own canvas, under its fog and lighting, instead of over the map. A scene is now a Theater stage only if it was made with *New scene* or has Theater tiles and no tokens; on any other scene the panel opens **Over the map**, listing that map's own places first ("(this map)").
- Pictures left drawn on a map's canvas by the above get a notice in the panel with **Hide them**.

## [1.3.0]

### Added
- **Over the map.** Show any Theater place (with its title card and sound), NPC cards, or any picture from the server on the players' screens **over the map they are on**, without changing scene, then take it down with one click and everyone is back on the map. Open the Theater panel on a map: it lists the places and cast of a Theater scene you pick.
  - **Who sees it**: every player, or only the players you tick. For chosen players the sound plays only in their browsers.
  - **Show as** full screen, or a **window over the map** (a framed picture over the dimmed map).
  - **Transitions**: Fade, **Iris** (opens from the centre, like a door), **Glitch** (a flicker with scanlines), Cut.
  - NPC cards slide in and out over the place, one per side, or on their own over the dimmed map.
  - **Hold V to see the map** (players): the picture turns see-through while the key or the on-screen button is held. The key can be changed in *Configure Controls*.
  - **On-air chip** for the GM: what is up, who is seeing it (`3/4`, with names of anyone not seeing it yet), a preview of the players' view, and **Take down**. Optional keybinding to take it down.
  - **Preload for the map**: players' browsers download the chosen Theater scene's pictures and sounds, with a confirmation per player.
  - **Take it down when combat starts** (world setting, on by default): starting combat or rolling initiative brings everyone back to the map.
  - **Turn the Soundboard down** (world setting, on by default): with Planar Soundboard, music and ambience dip (Narrate) while a place is up for everyone.
  - **Slow the map behind** (client setting, off by default): the map behind a full-screen place is drawn at a few frames a second, to spare laptops.
  - Survives reloads and late logins: what is up is shown at once.
- **Journal buttons** for prep notes (GM only; players see plain text): `@Place[name]`, `@Place[name | to=Nanouk, Elaion | mode=window | fx=iris | scene=…]{label}`, `@Place[off]`, `@Cast[name]`. Names match without accents or case.
- API: `places()`, `cast()`, `showPlace(target, opts)`, `showNpc(target, opts)`, `showImage(src, opts)`, `hide()` / `hidePlace()`, `clearCast()`, `setUsers(list)`, `overlay()`; hook `planar-theater.overlay`.

### Performance
- The picture over the map is plain HTML animated only with opacity, transform and clip-path (handled by the graphics card), with every image decoded before it appears. One small setting write per GM action; no tile or database updates while things move; nothing runs while nothing is shown.
- *Preload for the map* only fills the browser cache (no GPU textures for pictures that are never drawn on the canvas).

## [1.2.0]

### Added
- **Optimize all heavy images** (Assets → Files): every heavy image gets a WebP copy that is used everywhere at once: every scene (Theater or not), actor, token, journal and setting.
- **Use the .lite.ogg copies** (Assets → Files): every heavy sound with a `<name>.lite.ogg` next to it on the server (made by the `lighten-audio.sh` script) is switched to the light copy everywhere; the shortened hour-long tracks are set to repeat.

### Fixed
- **Replacing a file did nothing when the path had spaces or symbols.** Foundry stores paths URL-encoded (`Campfire%20%EF%BD%9C%20D%26D…`), while scripts and pasted paths are plain (`Campfire ｜ D&D…`); the two never matched, so *⇄*, *Optimize* and the `repoint` API changed nothing for such files. Paths are now compared decoded, in plain values, HTML and Markdown.
- The asset audit no longer counts the Theater's record of a place's original file as a use, so an optimized PNG no longer looks "still used". Files show with readable names instead of `%20`.

## [1.1.0]

### Added
- **Optimize images.** Heavy images (PNG, or over 1 MB) get a lighter WebP copy, up to 2560 px wide, saved in `worlds/<world>/theater-optimized/`; the tiles use the copy. A 2–3 MB place becomes a few hundred KB, so players load scenes and join far faster and the server sends much less. The original files are never changed. Toolbar button **Optimize images** for a whole scene, with **Restore originals** to undo.
- **Optimize images when adding** (world setting, on by default): places added from a folder are optimized first.
- **Asset audit** (toolbar **Assets**, or `game.modules.get("planar-theater").api.audit()`):
  - *Files*: every image, sound and video the world's documents and settings use, with its size on the server, biggest first, heavy ones marked. **Optimize** an image and every use switches to the copy; **⇄** replaces any file with another everywhere at once (documents, embedded documents and module settings such as Soundboard pads).
  - *World data*: the size of what each player downloads on joining, by document type; export/clear the chat log; the biggest documents and folders; move unused actors and items to a *Planar Archive* world compendium (anything on a scene, owned by a player, in a combat or linked from a journal, macro or module stays).
- API: `audit()`, `optimizeScene({restore})`, `optimizeImage(path)`, `repoint(from, to)`.

## [1.0.1]

### Fixed
- **Image preload works again on every client.** In v14, `load` is an instance method of the singleton `TextureLoader.loader`, not a static method of the class. The preload called it on the class, so it threw `textureLoader().load is not a function` and no image was preloaded, on the GM's client or any player's ("28 file(s) failed to load", "Some files failed to load for: …"). Preload now uses the singleton.
- Preload no longer evicts textures the canvas is using (`expireCache: false`).
- A single image that fails to load is now reported by name instead of being counted as loaded: `load()` doesn't reject on one bad file, so each image is checked in the loader's cache afterwards.

## [0.2.0]

### Fixed
- **Panel no longer goes dead after it is closed.** Reopening the Theater panel left every button and checkbox unresponsive until the browser was reloaded: the click handlers stayed on the old, discarded window instead of the new one.
- **New Theater scene is now black.** Foundry v14 has no scene `backgroundColor`; the colour lives on the scene's Level, so the helper now sets `level.background.color` (and still sets `backgroundColor` on older versions). The API exposes `paintBlack(scene)` to repair an existing grey scene.
- **Preload really reaches every player.** In v14 `Scenes#preload` takes an options object (`{broadcast: true}`); the old call passed `true`, so it only preloaded on the GM's client. Preload now goes over the module socket: each player's browser loads the scene's images (including the alternate NPC cards) and linked sounds and replies, and the GM sees who confirmed, who failed and who did not answer.
- Empty-state messages in the panel no longer wrap into a narrow column.
- The offer to import tiles from the old macro is now a banner at the top of the panel instead of a small button at the bottom.

### Added
- **Busy indicator.** While an action runs (preload, show to players, adding images…) the panel shows a “Working…” chip, highlights the button you pressed and dims the rest; clicking meanwhile shakes the chip instead of being silently ignored.
- **Clear cast** button, and a **Clear cast on new place** checkbox (remembered per browser) so NPCs from the previous scene slide out when you change place.
- **Show to players feedback**: after activating, a message says how many players are viewing the scene and names anyone who is not. A presence chip in the toolbar shows the same live.
- Module socket (`"socket": true`).

### Changed
- **New Theater scene** moved from the scrolling footer into the pinned toolbar. The footer is gone. The toolbar now has two rows.

## [0.1.0]

First module release. Everything below existed as a GM macro ("Ambient Theater" v1–v3; kept in `legacy/`) and was ported to a module.

### Added
- Theater panel (ApplicationV2) with a pinned toolbar and a single scrolling area for places and cast.
- Places: pick a folder, every image becomes a hidden tile fitted to the scene; instant or faded switching.
- Title cards: per-place "Main line | small line" card rendered in the browser and shown for a few seconds.
- Sound: link a playlist track to each place; cross-fades when the place changes. Silence button.
- Cast: portraits become framed cards with a name plate, slide in from the left or right (one per side).
- Veiled names: hide an NPC's name behind a blurred "?" plate and reveal it later, instantly.
- Preload: asks every connected client to preload the scene's images and linked sounds.
- Scene-controls button, optional keybinding, module settings (title duration, default sound fade, fade default).
- "New Theater scene" helper and a one-click import of tiles made by the old macro.
- English and Greek interface.

### Changed (compared with the macro)
- Preload now uses `game.audio.preload`, which asks the other clients to preload sounds. The macro called the local-only `AudioHelper.preloadSound`, so sounds were not actually preloaded for players.
- Closing the folder picker without choosing no longer leaves the panel stuck.
- The panel updates itself when tiles change instead of only after its own clicks.
- Data moved from `flags.world.theater` to `flags.planar-theater`.

[0.1.0]: https://github.com/YOUR_GITHUB_USER/planar-theater/releases/tag/v0.1.0
