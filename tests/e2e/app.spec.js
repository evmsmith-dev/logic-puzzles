import { expect, test } from "@playwright/test";
import { solve as solveLights } from "../../src/puzzles/lights-out.js";
import { createMinesweeper } from "../../src/puzzles/minesweeper.js";
import { solveSmall } from "../../src/puzzles/sliding-tiles.js";
import * as h from "./helpers.js";

test("first visit shows How to Play once; Home lists the daily set and all three puzzles", async ({ page }) => {
  await h.openApp(page, { help: true });
  await expect(page.locator("#help-overlay")).toBeVisible();
  await expect(page.locator("#help-body")).toContainText("Lights Out");
  await page.locator("#help-overlay .overlay-close").click();
  await expect(page.locator("#help-overlay")).toBeHidden();
  await expect(page.locator(".puzzle-card")).toHaveCount(3);
  await expect(page.locator(".daily-item")).toHaveCount(3);
  await expect(page.locator("#daily-status")).toContainText("0 of 3 done");
  await page.reload();
  await expect(page.locator("#help-overlay")).toBeHidden(); // only the first time
});

test("Lights Out: solving it shows the result, and the best time appears on Home", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "lights-out", "easy");
  const fewest = Number(await page.locator("#game-par").textContent());
  await page.clock.runFor(12_000);
  const taps = solveLights(await h.readLights(page), 4);
  expect(taps.length).toBe(fewest);
  for (const cell of taps) await h.tapCell(page, cell);
  await h.expectSolved(page, "Lights Out solved!");
  await expect(page.locator("#result-stats")).toContainText(`Moves${fewest}`);
  await expect(page.locator("#result-text")).toHaveText("A new best time!");
  await page.locator("#result-secondary").click(); // Home
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator('[data-puzzle="lights-out"] .puzzle-best')).toContainText("Best 0:1");
  await expect(page.locator('[data-puzzle="lights-out"] .puzzle-best')).toContainText("1 solved");
});

test("Sliding Tiles: a hint lights up the next tile, and a hinted solve doesn't set a best time", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "sliding-tiles", "easy");
  const board = await h.readTiles(page);
  const taps = solveSmall(board);
  await page.locator("#hint-btn").click();
  await expect(page.locator("#board .is-hint")).toHaveAttribute("data-index", String(taps[0]));
  for (const cell of taps) await h.tapCell(page, cell);
  await h.expectSolved(page, "Sliding Tiles solved!");
  await expect(page.locator("#result-text")).toContainText("hints don't count");
  await page.locator("#result-primary").click(); // New puzzle
  await expect(page.locator("#result-overlay")).toBeHidden();
  await expect(page.locator("#game-moves")).toHaveText("0");
});

test("Minesweeper daily: clearing the board marks it done; finishing all three starts a streak", async ({ page }) => {
  // The other two daily puzzles are already done today.
  await h.openApp(page, { storage: { daily: { [h.TODAY]: { "lights-out": { time: 30_000, moves: 7 }, "sliding-tiles": { time: 90_000, moves: 60 } } } } });
  await expect(page.locator("#daily-status")).toContainText("2 of 3 done");
  await page.locator('[data-daily="minesweeper"]').click();
  await expect(page.locator("#game-level")).toContainText("Daily");
  await expect(page.locator("#new-btn")).toBeHidden(); // the daily puzzle is fixed

  // Everyone gets the same board today, so it can be rebuilt here.
  const { mines } = createMinesweeper("medium", h.TODAY);
  // Flag one mine by pressing and holding.
  const firstMine = mines.indexOf(true);
  const mineCell = page.locator(`#board [data-index="${firstMine}"]`);
  await mineCell.dispatchEvent("pointerdown");
  await page.clock.runFor(500);
  await mineCell.dispatchEvent("pointerup");
  await expect(mineCell).toHaveClass(/is-flag/);
  await expect(page.locator("#game-moves")).toHaveText("19");

  for (let i = 0; i < mines.length; i++) {
    if (mines[i]) continue;
    const cell = page.locator(`#board [data-index="${i}"]`);
    if (await cell.evaluate((el) => el.classList.contains("is-open")).catch(() => true)) continue;
    await cell.click();
    if (await page.locator("#result-overlay").isVisible()) break;
  }
  await h.expectSolved(page, "Minesweeper solved!");
  await expect(page.locator("#result-text")).toContainText("1-day streak");
  await expect(page.locator("#result-primary")).toHaveText("Share");
  await page.locator("#result-secondary").click();
  await expect(page.locator("#daily-status")).toContainText("All done for today");
  await expect(page.locator("#daily-streak")).toHaveText("🔥 1-day streak");
  await expect(page.locator("#daily-share-btn")).toBeVisible();
  await expect(page.locator('[data-daily="minesweeper"]')).toHaveClass(/is-done/);
});

test("Minesweeper: digging a mine ends the round, and Try again gives the same board back", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "minesweeper", "easy");
  const startOpen = await h.cells(page).evaluateAll((buttons) => buttons.map((b) => b.classList.contains("is-open")));
  // Find a mine: the hidden squares around the opening include at least one, so dig until one goes off.
  for (let i = 0; i < startOpen.length; i++) {
    if (startOpen[i]) continue;
    await h.tapCell(page, i);
    if (await page.locator(".is-exploded").count()) break;
  }
  await expect(page.locator(".is-exploded")).toHaveCount(1);
  await page.clock.runFor(600);
  await expect(page.locator("#result-title")).toHaveText("Boom!");
  await page.locator("#result-primary").click(); // Try again
  await expect(page.locator("#result-overlay")).toBeHidden();
  const again = await h.cells(page).evaluateAll((buttons) => buttons.map((b) => b.classList.contains("is-open")));
  expect(again).toEqual(startOpen);
});

test("an unfinished puzzle is saved and can be continued after the app closes", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "lights-out", "medium");
  await h.tapCell(page, 0);
  await page.clock.runFor(5_000);
  const board = await h.readLights(page);
  await page.reload();
  await expect(page.locator("#continue-btn")).toBeVisible();
  await expect(page.locator("#continue-btn")).toContainText("Lights Out · Medium");
  await page.locator("#continue-btn").click();
  expect(await h.readLights(page)).toEqual(board);
  await expect(page.locator("#game-moves")).toHaveText("1");
});

test("starting another puzzle asks before replacing one in progress", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "lights-out", "easy");
  await h.tapCell(page, 0);
  await page.locator("#game-back-btn").click();
  await expect(page.locator("#home")).toBeVisible();
  await page.locator('[data-play="sliding-tiles"]').click();
  await expect(page.locator("#confirm-overlay")).toBeVisible();
  await page.locator("#confirm-cancel").click();
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#continue-btn")).toContainText("Lights Out");
  await page.locator('[data-play="sliding-tiles"]').click();
  await page.locator("#confirm-ok").click();
  await expect(page.locator("#game-name")).toContainText("Sliding Tiles");
});

test("the phone's Back gesture closes a pop-up, then leaves the game", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "lights-out", "easy");
  await page.locator("#game-help-btn").click();
  await expect(page.locator("#help-overlay")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#help-overlay")).toBeHidden();
  await expect(page.locator("#game")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#home")).toBeVisible();
});

test("Restart asks first once moves are made, and puts the board back", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "lights-out", "easy");
  const start = await h.readLights(page);
  await h.tapCell(page, 5);
  await page.locator("#restart-btn").click();
  await expect(page.locator("#confirm-title")).toHaveText("Start this puzzle over?");
  await page.locator("#confirm-ok").click();
  await expect(page.locator("#confirm-overlay")).toBeHidden();
  expect(await h.readLights(page)).toEqual(start);
  await expect(page.locator("#game-moves")).toHaveText("0");
});

test("the clock pauses while the app is in the background", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "sliding-tiles", "easy");
  await page.clock.runFor(3_000);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(60_000);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(1_000);
  await expect(page.locator("#game-time")).toHaveText("0:04");
});

test("Settings switches between light and dark", async ({ page }) => {
  await h.openApp(page);
  await page.locator("#settings-btn").click();
  await page.locator('[data-theme-value="dark"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator('[data-theme-value="light"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test.describe("phone screens", () => {
  for (const [name, width, height] of [["iPhone SE", 375, 667], ["small Android", 360, 640], ["tall phone", 412, 915]]) {
    test(`every puzzle at Hard fits a ${name} without scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await h.openApp(page);
      for (const id of ["lights-out", "sliding-tiles", "minesweeper"]) {
        if (await page.locator("#game").isVisible()) {
          await page.locator("#game-back-btn").click();
          await expect(page.locator("#home")).toBeVisible();
        }
        await h.play(page, id, "hard");
        const overflow = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
        expect(overflow, id).toBeLessThanOrEqual(0);
        const size = await h.cells(page).first().evaluate((cell) => cell.getBoundingClientRect().width);
        expect(size, `${id} squares are big enough to tap`).toBeGreaterThanOrEqual(24);
      }
    });
  }
});
