import { expect } from "@playwright/test";

export const TODAY = "2026-11-03";

/** Opens the app on a fixed date. `help` shows the first-visit How to Play. */
export async function openApp(page, { help = false, storage = {} } = {}) {
  await page.addInitScript(({ help, storage }) => {
    if (sessionStorage.getItem("seeded")) return; // only before the first load
    sessionStorage.setItem("seeded", "1");
    if (!help) localStorage.setItem("logicPuzzles_helpSeen", "true");
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(`logicPuzzles_${key}`, JSON.stringify(value));
  }, { help, storage });
  await page.clock.install({ time: new Date(`${TODAY}T10:00:00`) });
  await page.goto("index.html");
  await expect(page.locator("body.is-ready")).toBeAttached();
}

export async function play(page, puzzleId, level = "easy") {
  await page.locator(`[data-puzzle="${puzzleId}"] [data-level="${level}"]`).click();
  await page.locator(`[data-play="${puzzleId}"]`).click();
  await expect(page.locator("#game")).toBeVisible();
}

export const cells = (page) => page.locator("#board [data-index]");

/** Lights Out board read from the screen (1 = on). */
export async function readLights(page) {
  return cells(page).evaluateAll((buttons) => buttons.map((b) => (b.classList.contains("is-on") ? 1 : 0)));
}

/** Sliding Tiles board read from the screen (0 = gap). */
export async function readTiles(page) {
  return cells(page).evaluateAll((buttons) => buttons.map((b) => Number(b.textContent) || 0));
}

export async function tapCell(page, index) {
  await page.locator(`#board [data-index="${index}"]`).click();
}

export async function expectSolved(page, title) {
  await page.clock.runFor(600); // the result pop-up appears after a moment
  await expect(page.locator("#result-overlay")).toBeVisible();
  await expect(page.locator("#result-title")).toHaveText(title);
}
