import { test, expect, type Page } from "@playwright/test"

/**
 * End-to-end walkthrough for FinSquare Enterprise.
 *
 * Runs the 5-step onboarding flow first, then visits every feature reachable from the
 * sidebar in order and asserts each one renders its page. The base URL and the
 * VITE_ENABLE_MOCKS switch are controlled by the Playwright config, so the same spec runs
 * against the mock repositories or the live MFI backend.
 *
 * The owner email is timestamped so live self-registration never collides across runs.
 */
const SUFFIX = Date.now().toString().slice(-9)
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? `ada.okoye+${SUFFIX}@example.com`
const OWNER_PHONE = process.env.E2E_OWNER_PHONE ?? `+2348${SUFFIX}`
const ORG_NAME = process.env.E2E_ORG_NAME ?? `Ada Farmers Cooperative ${SUFFIX}`

async function freshWorkspace(page: Page) {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
}

async function expandSection(page: Page, label: string) {
  const head = page.locator(".sidebar button.nav-group-head", { hasText: label })
  await head.waitFor({ state: "visible" })
  if ((await head.getAttribute("aria-expanded")) !== "true") {
    await head.click()
  }
}

async function clickNav(page: Page, label: string) {
  await page.locator(".sidebar").getByRole("button", { name: label, exact: true }).click()
}

/** The Loans section also has an "Overview" item, so it needs a scoped click. */
async function clickLoansOverview(page: Page) {
  await expandSection(page, "Loans")
  const loans = page.locator(".sidebar .nav-group", { hasText: "Active loans" })
  await loans.locator(".nav-group-items button", { hasText: "Overview" }).click()
}

async function clickSettingsTab(page: Page, label: string) {
  await page.locator(".settings-tabs").getByRole("button", { name: label, exact: true }).click()
}

async function expectPage(page: Page, path: RegExp, title: string) {
  await expect(page).toHaveURL(path)
  await expect(page.locator(".page-title")).toContainText(title)
}

test("onboarding then every sidebar feature", async ({ page }) => {
  await freshWorkspace(page)

  await test.step("Login gate renders", async () => {
    await expect(page.getByRole("heading", { name: "Log in to FinSquare" })).toBeVisible()
  })

  await test.step("Switch to onboarding (create account)", async () => {
    await page.getByRole("button", { name: "Create an account" }).click()
    await expect(page.getByRole("heading", { name: "Welcome to FinSquare" })).toBeVisible()
  })

  await test.step("Onboarding 1/5 — Create administrator account", async () => {
    await page.getByLabel("Full name").fill("Ada Okoye")
    await page.getByLabel("Work email").fill(OWNER_EMAIL)
    await page.getByLabel("Phone number").fill(OWNER_PHONE)
    await page.getByLabel("Password").fill("password123")
    await page.getByRole("button", { name: "Continue" }).click()
    await expect(page.getByRole("heading", { name: "Make the workspace yours" })).toBeVisible()
  })

  await test.step("Onboarding 2/5 — Organization name, type and branding", async () => {
    await page.getByLabel("Organization name").fill(ORG_NAME)
    await page.getByLabel("Organization type").selectOption("Cooperative")
    await page.getByRole("button", { name: "Continue" }).click()
    await expect(page.getByRole("heading", { name: "A few organization details" })).toBeVisible()
  })

  await test.step("Onboarding 3/5 — Organization details", async () => {
    await page.getByLabel("Registered / business name").fill("Ada Farmers Cooperative Ltd")
    await page.getByLabel("Organization email").fill(OWNER_EMAIL)
    await page.getByLabel("Organization phone").fill(OWNER_PHONE)
    await page.getByLabel("Country").selectOption("Nigeria")
    await page.getByLabel("State").fill("Lagos")
    await page.getByLabel("City").fill("Ikeja")
    await page.getByLabel("Physical address").fill("12 Market Road")
    await page.getByRole("button", { name: "Save and continue" }).click()
    await expect(page.getByRole("heading", { name: /Corporate account/ })).toBeVisible()
  })

  await test.step("Onboarding 4/5 — Corporate account (skipped)", async () => {
    await page.getByRole("button", { name: "Skip for now" }).click()
    await expect(page.getByRole("heading", { name: /all set/ })).toBeVisible()
  })

  await test.step("Onboarding 5/5 — Finish and land on Overview", async () => {
    await page.getByRole("button", { name: "Complete setup" }).click()
    await expectPage(page, /\/overview$/, "Overview")
    await expect(page.locator(".sidebar")).toBeVisible()
  })

  await test.step("Feature — Members", async () => {
    await expandSection(page, "Organization")
    await clickNav(page, "Members")
    await expectPage(page, /\/members$/, "Members")
  })

  await test.step("Feature — Branches", async () => {
    await clickNav(page, "Branches")
    await expectPage(page, /\/branches$/, "Branches")
  })

  await test.step("Feature — Groups", async () => {
    await clickNav(page, "Groups")
    await expectPage(page, /\/groups$/, "Groups")
  })

  await test.step("Feature — Contributions", async () => {
    await expandSection(page, "Finance")
    await clickNav(page, "Contributions")
    await expectPage(page, /\/contributions$/, "Contributions")
  })

  await test.step("Feature — Dues", async () => {
    await clickNav(page, "Dues")
    await expectPage(page, /\/dues$/, "Dues")
  })

  await test.step("Feature — Payments", async () => {
    await clickNav(page, "Payments")
    await expectPage(page, /\/payments$/, "Payments")
  })

  await test.step("Feature — Wallet", async () => {
    await clickNav(page, "Wallet")
    await expectPage(page, /\/wallet$/, "Wallet")
  })

  await test.step("Feature — Loans overview", async () => {
    await clickLoansOverview(page)
    await expectPage(page, /\/loans$/, "Loans")
  })

  await test.step("Feature — Loan applications", async () => {
    await clickNav(page, "Applications")
    await expectPage(page, /\/loans\/applications$/, "Applications")
  })

  await test.step("Feature — Active loans", async () => {
    await clickNav(page, "Active loans")
    await expectPage(page, /\/loans\/active$/, "Active loans")
  })

  await test.step("Feature — Disbursements", async () => {
    await clickNav(page, "Disbursements")
    await expectPage(page, /\/loans\/disbursements$/, "Disbursements")
  })

  await test.step("Feature — Repayments", async () => {
    await clickNav(page, "Repayments")
    await expectPage(page, /\/loans\/repayments$/, "Repayments")
  })

  await test.step("Feature — Communications", async () => {
    await expandSection(page, "Communications")
    await clickNav(page, "Messaging")
    await expectPage(page, /\/communication$/, "Communications")
  })

  await test.step("Feature — Reports", async () => {
    await clickNav(page, "Reports")
    await expectPage(page, /\/reports$/, "Reports")
  })

  await test.step("Settings — General (Appearance & branding)", async () => {
    await clickNav(page, "Settings")
    await expectPage(page, /\/settings$/, "Appearance & branding")
  })

  await test.step("Settings — Organization details", async () => {
    await clickSettingsTab(page, "Organization")
    await expectPage(page, /\/settings\/organization$/, "Organization details")
  })

  await test.step("Settings — Administrators", async () => {
    await clickSettingsTab(page, "Administrators")
    await expectPage(page, /\/administrators$/, "Administrators")
  })

  await test.step("Settings — Roles & permissions", async () => {
    await clickSettingsTab(page, "Roles & permissions")
    await expectPage(page, /\/settings\/roles$/, "Roles & permissions")
  })

  await test.step("Settings — Modules", async () => {
    await clickSettingsTab(page, "Modules")
    await expectPage(page, /\/settings\/modules$/, "Modules")
  })

  await test.step("Settings — Corporate account", async () => {
    await clickSettingsTab(page, "Corporate account")
    await expectPage(page, /\/corporate-account$/, "Corporate account & wallet")
  })

  await test.step("Settings — Compliance", async () => {
    await clickSettingsTab(page, "Compliance")
    await expectPage(page, /\/compliance$/, "Organization verification")
  })
})
