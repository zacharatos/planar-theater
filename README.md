# Planar Theater

A GM tool for Foundry VTT (v14) for scenes where nobody needs a battle map. Open a black scene, preload your artwork once, then change what the players see with a click while you talk.

- **Places**: full-screen backdrops, switched instantly or with a fade. No flash, no reload.
- **Title cards**: a "Main line | small line" card fades in at the bottom of the screen for a few seconds.
- **Sound**: link a playlist track to a place; the music cross-fades when you change places.
- **Cast**: NPC portraits (any shape) become framed cards with a name plate and slide in from the left or right.
- **Veiled names**: hide an NPC's name behind a blurred "?" and reveal it when the party learns it.
- **Preload**: every connected player's browser caches the scene's images and linked sounds, and you get a confirmation per player.

Nothing here is tied to a game system or setting. The module ships no artwork or text from any publisher.

## Install

In Foundry: **Add-on Modules → Install Module**, paste this into **Manifest URL**, and install:

```
https://github.com/zacharatos/planar-theater/releases/latest/download/module.json
```

Enable the module in your world.

## Quick start

1. Click the masks button in the **Tokens** toolbar (or bind a key under *Configure Controls → Planar Theater*). The panel opens for the scene you are viewing.
2. No black scene yet? Press **New scene** in the panel's toolbar. It makes a gridless 1920×1080 black scene with no vision or fog.
3. **Add places…** and pick a folder of images (png, jpg, webp, avif, gif). Each image becomes a hidden tile fitted to the scene, ordered by file name (`01-`, `02-`, …). The label comes from the file name.
4. **Add cast…** and pick a folder of portraits. Each becomes a framed card; the file name becomes the NPC's name.
5. Press **Preload** before the session (a message tells you which players confirmed), then **Show to players** to activate the scene (a message tells you how many players are viewing it).
6. During play, click a place to show it, click an NPC to bring them in, click again to send them out.

### Settings on each item (gear icon)

| Item | Options |
| --- | --- |
| Place | Title card text (use `\|` for a smaller second line), linked sound |
| NPC | Name on card, whether players see the name or a veiled `?`, side (left/right) |

The eye icon on an NPC toggles the veiled name without opening the settings.

### Toolbar

| Button | What it does |
| --- | --- |
| New scene | Creates a black, gridless 1920×1080 scene with no vision or fog, and opens it |
| Add places / Add cast | Pick a folder of images |
| Re-fit | Re-sizes and re-places everything, e.g. after changing the scene size |
| Preload | Preloads images and linked sounds on every connected client and reports who confirmed |
| Show to players | Activates this scene for everyone and reports how many players are viewing it |
| Presence chip | Live count of connected players viewing this scene (green: all, amber: some, grey: nobody) |
| Black | Hides places, cast and titles (sound keeps playing) |
| Clear cast | Sends every NPC out |
| Silence | Stops the Theater's sound |
| Clear cast on new place | When ticked, changing place also sends the cast out |
| Fade | Fade and slide instead of instant cuts |

Generated cards and titles are saved in `worlds/<your world>/theater-generated/`.

## Coming from the macro?

Open the panel on the scene the macro was used on. If it finds tiles made by the old macro, an **Import** banner appears at the top of the panel. The import copies the data and leaves the old flags untouched.

## Troubleshooting

- **A card has no frame or name**: card generation failed (often a cross-origin image). The raw portrait is used instead; check the browser console for `planar-theater |`.
- **Preload says a player did not answer**: that player may have just joined or have a blocked socket connection; ask them to reload (F5) and press Preload again.
- **Players see nothing**: make sure the scene is active (**Show to players**) and that you clicked a place after activating it.
- **Tiles look off-centre after resizing the scene**: press **Re-fit**.

## Support

Open an issue at <https://github.com/zacharatos/planar-theater/issues>. Developing or releasing? See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and [docs/PUBLISHING.md](docs/PUBLISHING.md).

## License

MIT. See [LICENSE](LICENSE).
