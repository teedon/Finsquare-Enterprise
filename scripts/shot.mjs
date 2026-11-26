/**
 * Screenshot helper — signs in, walks to one screen, captures it.
 *
 *   node scripts/shot.mjs <flow> [tag]
 *   SHOT_WIDTH=390 node scripts/shot.mjs member-menu mobile
 *
 * Flows: login · overview · members · member · member-menu
 *
 * The session lives in memory and is deliberately not persisted, so a full page navigation would
 * sign you out. This therefore walks the app the way a person does — clicking — instead of
 * navigating to URLs.
 *
 * Needs a dev server in mock mode, because the mock accepts any credentials (the live backend
 * owns real ones):
 *   VITE_ENABLE_MOCKS=true npx vite --port 5175
 *
 * Screenshots land in test-results/shots/, which is gitignored.
 */
import { chromium } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.SHOT_BASE ?? "http://localhost:5175"
const OUT = process.env.SHOT_OUT ?? "test-results/shots"
const WIDTH = Number(process.env.SHOT_WIDTH ?? 1440)
const HEIGHT = Number(process.env.SHOT_HEIGHT ?? 900)
const FULL = process.env.SHOT_FULL === "1"
const EMAIL = process.env.SHOT_EMAIL ?? "ada.okoye@example.com"
const PASSWORD = process.env.SHOT_PASSWORD ?? "password123"

const FLOW = process.argv[2] ?? "member"
const TAG = process.argv[3] ?? String(WIDTH)

/** The bundled Chromium is only used when its exact build is installed; otherwise fall back to the
 *  browser already on the machine, so this needs no 150 MB download to run. */
async function launch() {
  const channel = process.env.SHOT_CHANNEL
  if (channel) return chromium.launch({ channel })
  try {
    return await chromium.launch()
  } catch {
    console.error("bundled chromium missing — falling back to installed Edge")
    return chromium.launch({ channel: "msedge" })
  }
}

/** Sign in, then take the first community if the backend reports more than one membership. */
async function signIn(page) {
  // Runs before any app script, so the store's very first read already sees a set-up community.
  // Without this the app drops into the 5-step onboarding flow and no product data is reachable.
  await page.addInitScript(() => {
    localStorage.removeItem("finsquare-workspace")
    localStorage.setItem("finsquare-onboarding", JSON.stringify({ completed: true }))
  })
  await page.goto(`${BASE}/`)

  await page.getByLabel("Work email").fill(EMAIL)
  // The input's accessible name also includes the Show/Hide toggle inside the label, so the
  // placeholder is the unambiguous handle.
  await page.getByPlaceholder("At least 6 characters").fill(PASSWORD)
  await page.getByRole("button", { name: /^Log in/ }).click()

  const shell = page.locator(".app-shell")
  const picker = page.locator(".onb-community-row").first()
  await Promise.race([
    shell.waitFor({ state: "visible", timeout: 25000 }),
    picker.waitFor({ state: "visible", timeout: 25000 }),
  ]).catch(() => {})

  if (await picker.isVisible().catch(() => false)) {
    await picker.click()
    await shell.waitFor({ state: "visible", timeout: 25000 })
  }
}

/** Sidebar sections are collapsed unless they hold the active view, so open them all first. */
async function nav(page, label) {
  const sidebar = page.locator(".sidebar")
  for (const head of await sidebar.locator("button.nav-group-head").all()) {
    if ((await head.getAttribute("aria-expanded")) !== "true") await head.click().catch(() => {})
  }
  await sidebar.getByRole("button", { name: label, exact: true }).click()
  await page.locator(".page-title").first().waitFor({ state: "visible" })
}

async function openFirstMember(page) {
  await nav(page, "Members")
  await page.locator("tbody tr").first().click()
  await page.locator(".page-title").first().waitFor({ state: "visible" })
  await page.waitForTimeout(700)
}

/** The Loans section head toggles the group; its first item is the overview. */
async function openLoansOverview(page) {
  const sidebar = page.locator(".sidebar")
  const head = sidebar.locator("button.nav-group-head", { hasText: "Loans" })
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
  await sidebar.locator(".nav-group", { hasText: "Active loans" }).locator(".nav-group-items button", { hasText: "Overview" }).click()
  await page.locator(".page-title").first().waitFor({ state: "visible" })
}

/** Loans → Loan types → Create loan type → step 5, where the application form builder lives. */
async function openLoanFormBuilder(page) {
  await openLoansOverview(page)
  await page.getByRole("button", { name: "Loan types", exact: true }).click()
  await page.getByRole("button", { name: "Create loan type" }).click()
  // The wizard validates the product before leaving step 1, so name it first.
  await page.getByLabel("Product name").fill("Sample Loan")
  await page.getByRole("button", { name: /Application form/ }).first().click()
  await page.waitForTimeout(600)
}

const flows = {
  login: async (page, shot) => {
    await page.goto(`${BASE}/`)
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByRole("heading", { name: /Log in/ }).waitFor({ state: "visible" })
    await shot("login")
  },
  overview: async (_page, shot) => shot("overview"),
  members: async (page, shot) => {
    await nav(page, "Members")
    await page.waitForTimeout(500)
    await shot("members")
  },
  member: async (page, shot) => {
    await openFirstMember(page)
    await shot("member")
  },
  "member-menu": async (page, shot) => {
    await openFirstMember(page)
    await page.locator(".header-actions").getByRole("button", { name: /Actions/ }).click()
    await page.locator(".action-menu-list").waitFor({ state: "visible" })
    await shot("member-menu")
  },
  "loan-form": async (page, shot) => {
    await openLoanFormBuilder(page)
    await shot("loan-form")
  },
  "member-form": async (page, shot) => {
    await nav(page, "Members")
    // The sidebar also has a Loans "Applications" item, so scope to the page.
    await page.locator("main").getByRole("button", { name: /^Applications/ }).click()
    await page.getByRole("button", { name: "Application forms" }).click()
    await page.locator("tbody tr").first().getByRole("button", { name: /^(Edit|Build)$/ }).click()
    await page.waitForTimeout(700)
    await shot("member-form")
  },
  "loan-form-preview": async (page, shot) => {
    await openLoanFormBuilder(page)
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    // The internal audience wants an existing member first; the external one is the plain form.
    await page.getByRole("button", { name: "External applicant" }).click()
    // The renderer validates the personal step before it advances, so complete it first.
    const personal = [
      ["First name", "Ada"],
      ["Last name", "Nwosu"],
      ["Phone number", "+2348032147780"],
      ["Date of birth", "1990-02-01"],
      ["Street address", "12 Market Road"],
      ["City", "Ikeja"],
      ["LGA", "Ikeja"],
      ["State", "Lagos"],
    ]
    for (const [label, value] of personal) await page.getByLabel(new RegExp(`^${label}`)).fill(value)
    await page.getByRole("button", { name: "Continue" }).first().click()
    await page.waitForTimeout(400)
    await shot("loan-form-preview")
  },
}

if (!flows[FLOW]) {
  console.error(`Unknown flow "${FLOW}". Available: ${Object.keys(flows).join(", ")}`)
  process.exit(1)
}

await mkdir(OUT, { recursive: true })

// Navigate at desktop width — the sidebar is off-canvas on a phone, so a narrow walk cannot click
// through it — then resize to the requested width just before the capture.
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

// Surface runtime problems instead of quietly photographing a broken screen.
page.on("pageerror", (error) => console.error("PAGE ERROR:", error.message))
page.on("console", (message) => {
  if (message.type() === "error") console.error("CONSOLE ERROR:", message.text())
})

try {
  if (FLOW !== "login") await signIn(page)
  await flows[FLOW](page, async (name) => {
    await page.setViewportSize({ width: WIDTH, height: HEIGHT })
    await page.waitForTimeout(500)
    const file = path.join(OUT, `${name}-${TAG}.png`)
    await page.screenshot({ path: file, fullPage: FULL })
    console.log(file)
  })
} finally {
  await browser.close()
}
