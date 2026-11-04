import { defineConfig } from "vitest/config"
import viteConfig from "./vite.config"

// Keep Vitest unit tests scoped to src/ so the Playwright e2e specs (e2e/*.spec.ts)
// are never collected as Vitest tests.
export default defineConfig({
  ...viteConfig,
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
})
