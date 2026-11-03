// End-to-end tests run against the built site in dist/ (npm run test:e2e builds it first).
// Set APP_DIR=. to run them against the unbuilt source instead.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT || 4173);
const appDir = process.env.APP_DIR || "dist";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}/`,
    trace: "retain-on-failure",
    // Stops animations (e.g. the pulsing hint) so screenshots and clicks are deterministic.
    reducedMotion: "reduce",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node scripts/serve.mjs ${appDir} ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
