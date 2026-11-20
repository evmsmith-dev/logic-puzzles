import { expect, test } from "@playwright/test";
import { createQueens } from "../../src/puzzles/queens.js";
import { solve as solveLights } from "../../src/puzzles/lights-out.js";
import * as h from "./helpers.js";

/** Records vibration patterns and sound activity in window.feel. */
async function recordFeel(page) {
  await page.addInitScript(() => {
    window.feel = { vibrations: [], oscillators: 0, contexts: 0 };
    Object.defineProperty(navigator, "vibrate", { value: (pattern) => { window.feel.vibrations.push(pattern); return true; }, configurable: true });
    const Real = window.AudioContext;
    if (Real) {
      window.AudioContext = class extends Real {
        constructor(...args) {
          super(...args);
          window.feel.contexts++;
        }
        createOscillator() {
          window.feel.oscillators++;
          return super.createOscillator();
        }
      };
    }
  });
}
const feel = (page) => page.evaluate(() => window.feel);

async function openSettings(page) {
  await page.locator("#settings-btn").click();
  await expect(page.locator("#settings-overlay")).toBeVisible();
}

async function closeSettings(page) {
  await page.locator("#settings-overlay .overlay-close").click();
  await expect(page.locator("#settings-overlay")).toBeHidden();
}

test("moves vibrate and make sounds; a win has its own feel; Vibration off stops it", async ({ page }) => {
  await recordFeel(page);
  await h.openApp(page);
  await h.play(page, "lights-out", "easy");
  const taps = solveLights(await h.readLights(page), 4);
  await h.tapCell(page, taps[0]);
  let f = await feel(page);
  expect(f.vibrations).toEqual([8]);
  expect(f.contexts).toBe(1);
  expect(f.oscillators).toBeGreaterThan(0);
  for (const cell of taps.slice(1)) await h.tapCell(page, cell);
  f = await feel(page);
  expect(f.vibrations.at(-1)).toEqual([20, 60, 40]);

  await page.locator("#result-secondary").click(); // Home
  await openSettings(page);
  await page.locator("#set-vibration").uncheck();
  await closeSettings(page);
  const before = (await feel(page)).vibrations.length;
  await h.play(page, "lights-out", "easy");
  await h.tapCell(page, 0);
  expect((await feel(page)).vibrations.length).toBe(before);
});

test("with sound effects and music both off, no audio starts", async ({ page }) => {
  await recordFeel(page);
  await h.openApp(page, { storage: { settings: { sound: false, music: false } } });
  await h.play(page, "lights-out", "easy");
  await h.tapCell(page, 0);
  expect((await feel(page)).contexts).toBe(0);
});

test("music plays during a game when switched on, with its own volume", async ({ page }) => {
  await recordFeel(page);
  await h.openApp(page);
  await openSettings(page);
  await expect(page.locator("#set-music")).not.toBeChecked(); // off by default
  await expect(page.locator("#music-volume-row")).toBeHidden();
  await page.locator("#set-music").check();
  await expect(page.locator("#music-volume-row")).toBeVisible();
  await page.locator("#set-music-volume").fill("60");
  await closeSettings(page);
  await h.play(page, "queens", "easy");
  await page.clock.runFor(1_000);
  expect((await feel(page)).oscillators).toBeGreaterThan(2); // the first chord
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("logicPuzzles_settings")));
  expect(saved).toMatchObject({ music: true, musicVolume: 0.6 });
});

test("Peg Jump ending with pegs left feels neutral, not like losing", async ({ page }) => {
  await recordFeel(page);
  await h.openApp(page);
  await h.play(page, "peg-jump", "easy");
  for (let i = 0; i < 13; i++) {
    const moved = await page.evaluate(() => {
      const cell = (i) => document.querySelector(`#board [data-index="${i}"]`);
      for (let i = 0; i < 15; i++) {
        if (!cell(i).classList.contains("has-peg")) continue;
        cell(i).click();
        const target = document.querySelector("#board .is-target");
        if (target) {
          target.click();
          return true;
        }
        cell(i).click();
      }
      return false;
    });
    if (!moved) break;
  }
  const left = Number(await page.locator("#game-moves").textContent());
  test.skip(left === 1, "random jumps happened to solve it");
  const f = await feel(page);
  expect(f.vibrations).toContain(12); // pegs landing
  expect(f.vibrations.at(-1)).toBe(20);
  expect(f.vibrations).not.toContainEqual([60, 40, 60]);
  await page.clock.runFor(600);
  await page.locator("#result-secondary").click(); // Start over
  await page.locator("#game-back-btn").click();
  await expect(page.locator('[data-puzzle="peg-jump"] .puzzle-best')).toHaveText(`Best finish: ${left} pegs`);
});

test("a jumping peg hops and the jumped peg pops off when motion is allowed", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    window.animations = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      window.animations++;
      return animate.apply(this, args);
    };
  });
  await h.openApp(page);
  await h.play(page, "peg-jump", "easy");
  await page.locator("#hint-btn").click();
  const cells = await page.locator("#board .is-hint").evaluateAll((list) => list.map((c) => ({ i: Number(c.dataset.index), peg: c.classList.contains("has-peg") })));
  await h.tapCell(page, cells.find((c) => c.peg).i);
  await h.tapCell(page, cells.find((c) => !c.peg).i);
  expect(await page.evaluate(() => window.animations)).toBe(2); // the hop and the jumped peg popping off
});

test("the board is updated in place, so squares keep their focus", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "lights-out", "easy");
  await page.locator('#board [data-index="5"]').focus();
  await page.evaluate(() => { window.cell5 = document.querySelector('#board [data-index="5"]'); });
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.cell5 === document.querySelector('#board [data-index="5"]'))).toBe(true);
  expect(await page.evaluate(() => document.activeElement === window.cell5)).toBe(true);
  await expect(page.locator("#game-moves")).toHaveText("1");
});

test("a hint glows and its message stays until the next move; Queens hints explain why", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" }); // tests normally turn motion off
  await h.openApp(page);
  await h.play(page, "queens", "easy");
  await page.locator("#hint-btn").click();
  await expect(page.locator("#board .is-hint")).toHaveCount(1);
  const animation = await page.locator("#board .is-hint").evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("hint-pulse");
  await expect(page.locator("#toast")).toContainText("has only one place left");
  await page.clock.runFor(6_000);
  await expect(page.locator("#toast")).toHaveClass(/is-visible/);
  const hinted = Number(await page.locator("#board .is-hint").getAttribute("data-index"));
  await h.tapCell(page, hinted);
  await expect(page.locator("#toast")).not.toHaveClass(/is-visible/);
});

test("Queens: dragging marks ✕ on every square passed, and one undo takes the drag back", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "queens", "easy");
  const center = async (i) => {
    const box = await page.locator(`#board [data-index="${i}"]`).boundingBox();
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  await page.mouse.move(...(await center(0)));
  await page.mouse.down();
  for (const i of [1, 2, 3]) await page.mouse.move(...(await center(i)), { steps: 4 });
  await page.mouse.up();
  for (const i of [0, 1, 2, 3]) await expect(page.locator(`#board [data-index="${i}"]`)).toHaveText("✕");
  await expect(page.locator('#board [data-index="4"]')).toHaveText("");
  await page.locator("#undo-btn").click();
  for (const i of [0, 1, 2, 3]) await expect(page.locator(`#board [data-index="${i}"]`)).toHaveText("");
});

test("Queens: letting go of the mouse off the board ends the drag", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "queens", "easy");
  const center = async (i) => {
    const box = await page.locator(`#board [data-index="${i}"]`).boundingBox();
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  await page.mouse.move(...(await center(0)));
  await page.mouse.down();
  await page.mouse.move(...(await center(1)), { steps: 4 });
  await page.mouse.move(5, 5, { steps: 4 }); // off the board
  await page.mouse.up();
  for (const i of [20, 21]) await page.mouse.move(...(await center(i)), { steps: 4 }); // just hovering
  await expect(page.locator('#board [data-index="1"]')).toHaveText("✕");
  await expect(page.locator('#board [data-index="20"]')).toHaveText("");
  await expect(page.locator('#board [data-index="21"]')).toHaveText("");
});

test("a hint message goes away on Restart and New puzzle", async ({ page }) => {
  await h.openApp(page);
  await h.play(page, "queens", "easy");
  await page.locator("#hint-btn").click();
  await expect(page.locator("#toast")).toHaveClass(/is-visible/);
  await page.locator("#restart-btn").click();
  await expect(page.locator("#toast")).not.toHaveClass(/is-visible/);
  await page.locator("#hint-btn").click();
  await page.locator("#new-btn").click();
  await expect(page.locator("#toast")).not.toHaveClass(/is-visible/);
});

test("the clock stays stopped while a puzzle's first-time rules are open, even after switching apps", async ({ page }) => {
  await h.openApp(page, { help: true });
  await h.play(page, "lights-out", "easy");
  await expect(page.locator("#help-overlay")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(5_000);
  await expect(page.locator("#game-time")).toHaveText("0:00");
});

test("Queens settings: auto-✕ and region letters", async ({ page }) => {
  await h.openApp(page);
  await openSettings(page);
  await page.locator("#set-auto-cross").check();
  await page.locator("#set-region-letters").check();
  await closeSettings(page);
  await h.play(page, "queens", "easy");
  await expect(page.locator("#board [data-letter]")).toHaveCount(6);
  const { seed } = await page.evaluate(() => JSON.parse(localStorage.getItem("logicPuzzles_current")));
  const { answer } = createQueens("easy", seed);
  await h.tapCell(page, answer[0]);
  expect(await page.locator("#board .is-auto").count()).toBeGreaterThan(5);
  await expect(page.locator(`#board [data-index="${answer[0]}"]`)).toHaveAttribute("aria-label", /region [A-F]/);
});

test("relaxed mode hides the timer, and larger text makes text bigger", async ({ page }) => {
  await h.openApp(page);
  const size = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  const normal = await size();
  await openSettings(page);
  await page.locator("#set-relaxed").check();
  await page.locator("#set-large-text").check();
  await closeSettings(page);
  expect(await size()).toBeGreaterThan(normal);
  await h.play(page, "lights-out", "easy");
  await expect(page.locator("#game-time-item")).toBeHidden();
  const taps = solveLights(await h.readLights(page), 4);
  for (const cell of taps) await h.tapCell(page, cell);
  await h.expectSolved(page, "Lights Out solved!");
  await expect(page.locator("#result-stats")).not.toContainText("Time");
});

test("the daily share includes a link to the game", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.share = async ({ text }) => { window.shared = text; };
  });
  const done = { time: 60_000, moves: 10 };
  const daily = { [h.TODAY]: { "lights-out": done, "sliding-tiles": done, minesweeper: done, queens: done } };
  await h.openApp(page, { storage: { daily } });
  await page.locator("#daily-share-btn").click();
  const text = await page.evaluate(() => window.shared);
  expect(text).toContain("Play free: http");
  expect(text).not.toContain("index.html");
});

test("a streak freeze saves a missed day and shows on Home", async ({ page }) => {
  const done = { time: 1 };
  const all = { "lights-out": done, "sliding-tiles": done, minesweeper: done, queens: done };
  // Oct 24–30: 7 days earn a freeze; Oct 31 missed; Nov 1–2 done. Today is Nov 3.
  const days = ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-01", "2026-11-02"];
  await h.openApp(page, { storage: { daily: Object.fromEntries(days.map((day) => [day, all])), firstSeen: { queens: "2026-10-01" } } });
  await expect(page.locator("#daily-streak")).toHaveText("🔥 9-day streak");
  // With the missed day done too, the freeze is still in hand.
  await page.evaluate(() => {
    const daily = JSON.parse(localStorage.getItem("logicPuzzles_daily"));
    daily["2026-10-31"] = daily["2026-10-30"];
    localStorage.setItem("logicPuzzles_daily", JSON.stringify(daily));
  });
  await page.reload();
  await expect(page.locator("#daily-streak")).toHaveText("🔥 10-day streak · 🧊 1 freeze");
});

test.describe("on a narrow phone", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("Minesweeper Hard keeps squares big enough to tap and scrolls instead", async ({ page }) => {
    await h.openApp(page);
    await h.play(page, "minesweeper", "hard");
    const width = await page.locator('#board [data-index="0"]').evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThanOrEqual(34);
    await expect(page.locator("#board-area")).toHaveClass(/is-scrolling/);
  });
});
