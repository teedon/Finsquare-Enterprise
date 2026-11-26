import { defineConfig } from "vitest/config"
import viteConfig from "./vite.config"

// Keep Vitest unit tests scoped to src/ so the Playwright e2e specs (e2e/*.spec.ts)
// are never collected as Vitest tests.
export default defineConfig({
  ...viteConfig,
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Unit tests exercise the mock repositories and their deterministic datasets. A developer's
    // `.env` may point the app at a live backend, and that must not decide what the suite tests.
    env: { VITE_ENABLE_MOCKS: "true", VITE_API_URL: "http://localhost:3000", VITE_API_PREFIX: "/api/v1" },
  },
})
