import { defineConfig, devices } from "@playwright/test";
import { APP_URL, AUTH_FILE, DATABASE_URL, MOCK_PORT, MOCK_URL } from "./e2e/env";

/**
 * End-to-end suite: the production build (`pnpm build` first) against a mock GitLab (e2e/mock-gitlab.mjs).
 * The mock is stateful, so tests run serially in one worker.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      // Sign-in / sign-out / setup flows start without a session.
      name: "public",
      testMatch: "auth.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "authenticated",
      testIgnore: "auth.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: AUTH_FILE },
    },
  ],
  webServer: [
    {
      command: "node e2e/mock-gitlab.mjs",
      url: `${MOCK_URL}/__health`,
      env: { MOCK_PORT: String(MOCK_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "pnpm start -p 3200",
      url: `${APP_URL}/api/health`,
      env: {
        DATABASE_URL,
        SESSION_SECRET: "e2e-session-secret-0123456789abcdefghijklmnopqrs",
        APP_URL,
        COOKIE_SECURE: "false",
        NODE_ENV: "production",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
