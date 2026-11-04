import { defineConfig, devices } from "@playwright/test"

// Live-mode walkthrough: talks to the real FinSquare MFI backend through a Vite dev server
// running with VITE_ENABLE_MOCKS=false. Start the server separately, e.g.:
//
//   VITE_ENABLE_MOCKS=false npx vite --port 5176 --strictPort
//
// then run:  npx playwright test -c playwright.live.config.ts
export default defineConfig({
  testDir: "./e2e",
  timeout: 600_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5176",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-live",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
