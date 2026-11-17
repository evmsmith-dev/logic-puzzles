import { expect, test } from "@playwright/test";
import * as h from "./helpers.js";

/** Fires the browser's install event with a stand-in prompt that records its use. */
async function offerInstall(page, outcome = "accepted") {
  await page.evaluate((outcome) => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = () => { window.promptShown = (window.promptShown || 0) + 1; };
    event.userChoice = Promise.resolve({ outcome });
    window.dispatchEvent(event);
  }, outcome);
}

test("no install card until the browser offers to install", async ({ page }) => {
  await h.openApp(page);
  await expect(page.locator("#install-card")).toBeHidden();
  await offerInstall(page);
  await expect(page.locator("#install-card")).toBeVisible();
  await page.locator("#install-btn").click();
  await expect.poll(() => page.evaluate(() => window.promptShown)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.locator("#install-card")).toBeHidden();
});

test("Not now hides the card for good, and Settings still offers Install", async ({ page }) => {
  await h.openApp(page);
  await offerInstall(page);
  await page.locator("#install-later").click();
  await expect(page.locator("#install-card")).toBeHidden();
  await page.locator("#settings-btn").click();
  await expect(page.locator("#install-setting")).toBeVisible();
  await page.locator("#install-setting-btn").click();
  await expect.poll(() => page.evaluate(() => window.promptShown)).toBe(1);
  await page.reload();
  await offerInstall(page);
  await expect(page.locator("#install-card")).toBeHidden();
});

test.describe("on an iPhone", () => {
  test.use({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });

  test("Install shows the Add to Home Screen steps", async ({ page }) => {
    await h.openApp(page);
    await expect(page.locator("#install-card")).toBeVisible();
    await page.locator("#install-btn").click();
    await expect(page.locator("#install-overlay")).toBeVisible();
    await expect(page.locator("#install-overlay")).toContainText("Add to Home Screen");
    await page.locator("#install-overlay .overlay-close").click();
    await expect(page.locator("#install-overlay")).toBeHidden();
  });

  test("nothing to install when it's already on the Home Screen", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }));
    await h.openApp(page);
    await expect(page.locator("#install-card")).toBeHidden();
  });
});

test("coming back to the app checks for a new version, at most once a minute", async ({ page }) => {
  await page.addInitScript(() => {
    window.updateChecks = 0;
    ServiceWorkerRegistration.prototype.update = function () {
      window.updateChecks++;
      return Promise.resolve(this);
    };
  });
  await h.openApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const comeBack = () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await comeBack();
  expect(await page.evaluate(() => window.updateChecks)).toBe(0); // just checked on opening
  await page.clock.runFor(61_000);
  await comeBack();
  await expect.poll(() => page.evaluate(() => window.updateChecks)).toBe(1);
  await comeBack();
  expect(await page.evaluate(() => window.updateChecks)).toBe(1);
  await page.clock.runFor(60 * 60_000); // and every hour while it stays open
  await expect.poll(() => page.evaluate(() => window.updateChecks)).toBe(2);
});
