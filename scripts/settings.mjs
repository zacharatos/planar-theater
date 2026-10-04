import { MODULE_ID } from "./constants.mjs";

export function registerSettings() {
  game.settings.register(MODULE_ID, "titleHold", {
    name: "PLANAR_THEATER.Settings.TitleHold.Name",
    hint: "PLANAR_THEATER.Settings.TitleHold.Hint",
    scope: "world", config: true, type: Number, default: 4.5,
    range: { min: 1, max: 30, step: 0.5 }
  });
  game.settings.register(MODULE_ID, "soundFade", {
    name: "PLANAR_THEATER.Settings.SoundFade.Name",
    hint: "PLANAR_THEATER.Settings.SoundFade.Hint",
    scope: "world", config: true, type: Number, default: 2,
    range: { min: 0, max: 10, step: 0.5 }
  });
  game.settings.register(MODULE_ID, "fade", {
    name: "PLANAR_THEATER.Settings.Fade.Name",
    hint: "PLANAR_THEATER.Settings.Fade.Hint",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "clearCastOnPlace", {
    name: "PLANAR_THEATER.Settings.ClearCast.Name",
    hint: "PLANAR_THEATER.Settings.ClearCast.Hint",
    scope: "client", config: true, type: Boolean, default: false
  });
}

export const setting = key => game.settings.get(MODULE_ID, key);
export const setSetting = (key, value) => game.settings.set(MODULE_ID, key, value);
