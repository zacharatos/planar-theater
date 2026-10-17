# Planar Theater

A GM tool for Foundry VTT (v14) for scenes where nobody needs a battle map. Open a black scene, preload your artwork once, then change what the players see with a click while you talk.

- **Places**: full-screen backdrops, switched instantly or with a fade. No flash, no reload.
- **Title cards**: a "Main line | small line" card fades in at the bottom of the screen for a few seconds.
- **Sound**: link a playlist track to a place; the music cross-fades when you change places.
- **Cast**: NPC portraits (any shape) become framed cards with a name plate and slide in from the left or right.
- **Veiled names**: hide an NPC's name behind a blurred "?" and reveal it when the party learns it.
- **Over the map**: show any place, NPC card or picture on the players' screens over the battle map they are on (full screen or as a window), to everyone or to chosen players, with fade, iris or glitch transitions; one click takes it down and everyone is back on the map.
- **Preload**: every connected player's browser caches the scene's images and linked sounds, and you get a confirmation per player.
- **Lighter images**: heavy places (PNG, or over 1 MB) get a WebP copy up to 2560 px wide, automatically when you add them or with one button for a whole scene. Originals are kept and can be restored.
- **Asset audit**: every image, sound and video the world makes players download, biggest first, with one-click optimize and "replace this file everywhere"; and the world's data size, with unused actors and items moved out to a compendium.

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
| Optimize images | Gives this scene's heavy images a lighter WebP copy (originals kept); *Restore originals* undoes it |
| Preload | Preloads images and linked sounds on every connected client and reports who confirmed |
| Show to players | Activates this scene for everyone and reports how many players are viewing it |
| Assets | Opens the asset audit (below) |
| Presence chip | Live count of connected players viewing this scene (green: all, amber: some, grey: nobody) |
| Black | Hides places, cast and titles (sound keeps playing) |
| Clear cast | Sends every NPC out |
| Silence | Stops the Theater's sound |
| Clear cast on new place | When ticked, changing place also sends the cast out |
| Fade | Fade and slide instead of instant cuts |

Generated cards and titles are saved in `worlds/<your world>/theater-generated/`; optimized copies in `worlds/<your world>/theater-optimized/`.

### Lighter images

Every player downloads every image of a scene when it is drawn, hidden places included. A 2–3 MB PNG becomes a WebP of a few hundred KB that looks the same on screen.

- **When adding places** (setting *Optimize images when adding*, on by default): PNG files and anything over 1 MB get the lighter copy first.
- **Optimize images** (toolbar): does the same for every place and NPC card already on the scene. **Restore originals** in the same dialog puts the original files back.
- The original files are never changed or deleted.

### Asset audit (Assets button)

- **Files**: every image, sound and video used by the world's scenes, actors, items, journals, playlists, macros and module settings (e.g. Soundboard pads), with its size on the server, biggest first. *Heavy only* shows what slows players down. **Optimize** makes a WebP copy of an image and uses it everywhere it appears; **⇄** replaces any file with another one everywhere at once (e.g. a 60 MB music file with a short OGG loop). **Optimize all heavy images** does every heavy image in one go; **Use the .lite.ogg copies** switches every heavy sound that has a `<name>.lite.ogg` next to it (see `lighten-audio.sh` in the campaign vault) to that copy.
- **World data**: what each player downloads on joining, by document type; the chat log (export and clear); the biggest documents and folders. Actors and items nobody uses at the table can move to a *Planar Archive* world compendium. Anything on a scene, owned by a player, in a combat, or linked from a journal, macro or module stays.
- Compendium contents aren't scanned (players only download them when opened).

## Over the map

The party is on a battle map and opens a door: show the place behind it without leaving the map.

1. Stay on the map and open the Theater panel. It switches to **Over the map** and lists the places and cast of a Theater scene (pick which one at the top).
2. Optional: **Preload for the map** once per session, so pictures appear at once.
3. Choose **Who sees it** (no ticks = every player), **Show as** (*Full screen* or *Window over the map*) and a **Transition** (*Fade*, *Iris*, *Glitch*, *Cut*).
4. Click a place: every chosen player sees it over the map with its title card and sound. Click another to cross over. Click an NPC to bring them in or out (one per side); NPCs can also appear alone over the dimmed map.
5. Click **Take down** (in the panel or on the red *on air* chip at the top of your screen): everyone is back on the map.

- Nobody changes scene: tokens, fog and combat stay where they are, and you stay on the map. The chip shows who is seeing it (`3/4`); its screen button lets you see what the players see.
- Players can hold **V** (or the *Hold to see the map* button) to look at the map through the picture.
- Clicking the place that is up again re-sends it with the panel's current choices (e.g. after ticking another player).
- **Any picture…** shows any image from the server, with an optional title card.
- Settings: *Take the picture down when combat starts* (on), *Turn the Soundboard down over the map* (on; uses Planar Soundboard's Narrate if installed), *Slow the map behind a full-screen place* (per browser, off).
- Shown to chosen players only, the picture and sound reach only their screens, but the data is in a world setting any browser can read. For real secrets use a private-message module.

### Journal buttons

In any journal page the GM sees a ▶ button for (players see the plain label):

```
@Place[Jex's workshop]
@Place[Jex's workshop | to=Nanouk, Elaion | mode=window | fx=iris | scene=Mortuary Theater]{Jex's door}
@Cast[Jex]
@Place[off]{Back to the map}
```

Names are matched without case or accents (`νεκροτομειο` finds «Το Νεκροτομείο»), first exactly, then by beginning, then anywhere in the name or title card. `to=` takes player or character names.

### Macro API

```js
const theater = game.modules.get("planar-theater").api;
theater.places();                                   // every place of every Theater scene
theater.showPlace("Jex's workshop", { transition: "iris", mode: "window", users: ["Nanouk"] });
theater.showNpc("Jex");                             // toggle; { on: true | false } to force
theater.showImage("worlds/my-world/handouts/map.webp", { title: "The map | Sigil" });
theater.clearCast();
theater.hide();                                     // everyone back on the map
theater.overlay();                                  // what is up right now
```

The hook `planar-theater.overlay` fires on every client with the new state. Other API calls: `open()`, `createScene(name)`, `paintBlack(scene)`, `migrate(scene)`, `audit()`, `optimizeScene()`, `optimizeImage(path)`, `repoint(from, to)`, `cast()`, `setUsers(list)`.

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
