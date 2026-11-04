import { defineConfig, devices } from "@playwright/test"

// The walkthrough runs against the prototype's deterministic mock repositories, never the live API,
// so it exercises the UI without touching a backend. Set VITE_ENABLE_MOCKS=true and reuse an
// already-running server when one exists.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx vite --port 5175 --strictPort",
    url: "http://localhost:5175",
    reuseExistingServer: true,
    env: {
      VITE_ENABLE_MOCKS: "true",
      VITE_API_URL: "http://localhost:3000",
      VITE_API_PREFIX: "/api/v1/mfi",
      VITE_APP_ENV: "development",
    },
  },
})
