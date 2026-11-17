// "Install the app" on Home. On Android and desktop Chrome or Edge the button opens the browser's
// own install prompt. iPhone and iPad have no prompt, so the button shows the Add to Home Screen
// steps instead. Nothing shows once the app is installed, or after the player taps "Not now"
// (Settings keeps an Install button for later).
import { readJson, writeJson } from "../storage.js";
import { openOverlay } from "./overlays.js";

const DISMISSED_KEY = "installDismissed";
let deferredPrompt = null;

const byId = (id) => document.getElementById(id);

export const isInstalled = () =>
  matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;

/** iPhone or iPad (iPads report themselves as a Mac with a touch screen). */
export const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** True when there's a way to install from here. */
const canInstall = () => !isInstalled() && (deferredPrompt !== null || isIos());

/** Shows or hides the Home card and the Settings button. */
export function refreshInstall() {
  const available = canInstall();
  byId("install-card").hidden = !available || readJson(DISMISSED_KEY, false);
  byId("install-setting").hidden = !available;
}

async function install() {
  if (deferredPrompt) {
    const prompt = deferredPrompt;
    deferredPrompt = null; // a prompt can only be used once
    prompt.prompt();
    try {
      await prompt.userChoice;
    } catch {
      // Closed without choosing.
    }
    refreshInstall();
    return;
  }
  if (isIos()) openOverlay("install-overlay");
}

export function initInstall() {
  addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // show our own button instead of the browser's mini bar
    deferredPrompt = event;
    refreshInstall();
  });
  addEventListener("appinstalled", () => {
    deferredPrompt = null;
    refreshInstall();
  });
  byId("install-btn").addEventListener("click", install);
  byId("install-setting-btn").addEventListener("click", install);
  byId("install-later").addEventListener("click", () => {
    writeJson(DISMISSED_KEY, true);
    refreshInstall();
  });
  refreshInstall();
}
