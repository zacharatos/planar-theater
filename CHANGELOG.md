# Changelog

All notable changes to this module. Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).
The release workflow uses the section matching the tag as the GitHub release notes, so keep the `## [x.y.z]` headings exact.

## [0.2.0]

### Fixed
- **New Theater scene is now black.** Foundry v14 has no scene `backgroundColor`; the colour lives on the scene's Level, so the helper now sets `level.background.color` (and still sets `backgroundColor` on older versions). The API exposes `paintBlack(scene)` to repair an existing grey scene.
- **Preload really reaches every player.** In v14 `Scenes#preload` takes an options object (`{broadcast: true}`); the old call passed `true`, so it only preloaded on the GM's client. Preload now goes over the module socket: each player's browser loads the scene's images (including the alternate NPC cards) and linked sounds and replies, and the GM sees who confirmed, who failed and who did not answer.
- Empty-state messages in the panel no longer wrap into a narrow column.
- The offer to import tiles from the old macro is now a banner at the top of the panel instead of a small button at the bottom.

### Added
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
