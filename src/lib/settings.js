// Player settings, saved on this device. Anything missing falls back to the defaults, so new
// settings added in an update just work.
import { readJson, writeJson } from "../storage.js";

export const DEFAULT_SETTINGS = {
  vibration: true,
  sound: true, // sound effects
  music: false,
  musicVolume: 0.3, // 0 to 1
  musicStyle: "mix", // "mix" (each puzzle its own), "lofi" or "marimba"
  autoCross: false, // Queens: ✕ the squares a new queen rules out
  regionLetters: false, // Queens: a letter in each colored region
  largeText: false,
  relaxed: false, // hide the timer
};

let current = { ...DEFAULT_SETTINGS, ...readJson("settings", {}) };
const listeners = new Set();

export const getSettings = () => current;
export const setting = (name) => current[name];

export function updateSettings(changes) {
  current = { ...current, ...changes };
  writeJson("settings", current);
  for (const listener of listeners) listener(current, changes);
}

/** Calls `listener(settings, changes)` after every change. */
export function onSettingsChange(listener) {
  listeners.add(listener);
}
