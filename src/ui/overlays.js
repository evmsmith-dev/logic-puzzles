// Pop-ups and the game screen work with the phone's Back gesture. Every screen and pop-up adds
// a history entry that records where the app is; every way of closing goes through history
// (back or go), and popstate makes the app match the entry it lands on. That keeps Back, the
// on-screen buttons, Escape and backdrop taps all in step, even when several steps are undone
// at once (for example closing a result pop-up straight to Home).
const stack = []; // open overlay ids, top last
const closeHandlers = new Map();
let screen = "home";
let onLeaveGame = null;

export const isOpen = (id) => stack.includes(id);
export const anyOpen = () => stack.length > 0;

export function openOverlay(id, { onClose, focus } = {}) {
  const overlay = document.getElementById(id);
  if (!overlay || isOpen(id)) return;
  stack.push(id);
  if (onClose) closeHandlers.set(id, onClose);
  else closeHandlers.delete(id);
  overlay.hidden = false;
  history.pushState({ screen, overlays: stack.length }, "");
  const target = (focus && overlay.querySelector(focus)) || overlay.querySelector("button, [href]");
  target?.focus({ preventScroll: true });
}

/** Closes the top pop-up. */
export function closeTop() {
  if (stack.length) history.back();
}

/** Closes every pop-up and leaves the game, back to Home. */
export function backToHome() {
  const steps = stack.length + (screen === "game" ? 1 : 0);
  if (steps) history.go(-steps);
}

function hideTop() {
  const id = stack.pop();
  const overlay = document.getElementById(id);
  if (overlay) overlay.hidden = true;
  const handler = closeHandlers.get(id);
  closeHandlers.delete(id);
  handler?.();
}

/** The game screen was shown: Back (or backToHome) leaves it through `onLeave`. */
export function enterGame(onLeave) {
  screen = "game";
  onLeaveGame = onLeave;
  history.pushState({ screen, overlays: 0 }, "");
}

export function initOverlays() {
  history.replaceState({ screen: "home", overlays: 0 }, "");
  addEventListener("popstate", (event) => {
    const target = event.state || { screen: "home", overlays: 0 };
    while (stack.length > target.overlays) hideTop();
    if (screen === "game" && target.screen === "home") {
      screen = "home";
      const leave = onLeaveGame;
      onLeaveGame = null;
      leave?.();
    }
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-close]") && stack.length) closeTop();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && stack.length) closeTop();
  });
}
