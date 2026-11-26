import { describe, expect, it } from "vitest"
import { SEED_ORGANIZATION_ID } from "@/lib/tenancy/seed-tenant"
import type { CommunityMembership } from "@/features/communities/types"
import {
  environmentFor,
  loadWorkspaceStore,
  persistWorkspaceStore,
  sliceFromMembership,
  workspaceReducer,
  workspaceView,
  type WorkspaceStorage,
  type WorkspaceStore,
} from "./workspace-store"

function memoryStorage(seed: Record<string, string> = {}): WorkspaceStorage & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  }
}

const membership = (over: Partial<CommunityMembership> = {}): CommunityMembership => ({
  organizationId: "org-greenfield-multipurpose",
  name: "Greenfield Multipurpose Cooperative",
  type: "Cooperative",
  logo: "",
  country: "Nigeria",
  legalName: "",
  accent: "blue",
  roleId: "role-finance",
  roleName: "Finance Officer",
  scope: "organization",
  isOwner: false,
  ...over,
})

const storeWith = (
  communities = [
    sliceFromMembership(membership()),
    sliceFromMembership(
      membership({
        organizationId: SEED_ORGANIZATION_ID,
        name: "Lagos Farmers Cooperative",
        roleId: "role-super-admin",
        roleName: "Super Admin",
        isOwner: true,
      }),
    ),
  ],
): WorkspaceStore => ({
  communities,
  activeCommunityId: communities[0].id,
  theme: "system",
  admin: { name: "", email: "", phone: "" },
  session: null,
})

describe("workspace store", () => {
  it("derives the environment from the community's corporate account", () => {
    expect(environmentFor("Connected")).toBe("live")
    expect(environmentFor("Under review")).toBe("pending_review")
    expect(environmentFor("Not connected")).toBe("demo")
  })

  it("starts a slice from a membership without inventing the details nobody entered", () => {
    const slice = sliceFromMembership(membership())

    expect(slice.id).toBe("org-greenfield-multipurpose")
    expect(slice.roleName).toBe("Finance Officer")
    expect(slice.organization.name).toBe("Greenfield Multipurpose Cooperative")
    expect(slice.organization.country).toBe("Nigeria")
    expect(slice.organization.email).toBe("")
    expect(slice.organization.registrationNumber).toBe("")
    expect(slice.corporateAccountStatus).toBe("Not connected")
    expect(slice.onboardingCompleted).toBe(true)
  })

  it("seeds the full organization profile from the membership's backend details", () => {
    const slice = sliceFromMembership(
      membership({
        profile: {
          registrationNumber: "RC-991100",
          yearEstablished: "2019",
          description: "Community lender",
          memberCount: "1200",
          areaOfOperation: "Agriculture",
          secondaryColor: "#be123c",
          email: "hello@greenfield.test",
          phone: "+234 801 000 0000",
          website: "https://greenfield.test",
          address: "1 Main Road",
          city: "Abeokuta",
          state: "Ogun",
        },
      }),
    )

    expect(slice.organization.registrationNumber).toBe("RC-991100")
    expect(slice.organization.yearEstablished).toBe("2019")
    expect(slice.organization.description).toBe("Community lender")
    expect(slice.organization.memberCount).toBe("1200")
    expect(slice.organization.areaOfOperation).toBe("Agriculture")
    expect(slice.organization.secondaryColor).toBe("#be123c")
    expect(slice.organization.email).toBe("hello@greenfield.test")
    expect(slice.organization.phone).toBe("+234 801 000 0000")
    expect(slice.organization.website).toBe("https://greenfield.test")
    expect(slice.organization.address).toBe("1 Main Road")
    expect(slice.organization.city).toBe("Abeokuta")
    expect(slice.organization.state).toBe("Ogun")
  })

  it("keeps the default accent colour when the profile has none", () => {
    const slice = sliceFromMembership(membership({ profile: { email: "hello@greenfield.test" } }))
    expect(slice.organization.secondaryColor).toBe("#0f766e")
  })

  it("adds a membership it has not seen and keeps the active community", () => {
    const store = storeWith([
      sliceFromMembership(membership({ organizationId: SEED_ORGANIZATION_ID, name: "Lagos Farmers Cooperative" })),
    ])
    const next = workspaceReducer(store, {
      type: "communities/synced",
      value: [
        membership({
          organizationId: SEED_ORGANIZATION_ID,
          name: "Lagos Farmers Cooperative",
          roleId: "role-super-admin",
          roleName: "Super Admin",
          isOwner: true,
        }),
        membership(),
      ],
    })

    expect(next.communities).toHaveLength(2)
    expect(next.activeCommunityId).toBe(SEED_ORGANIZATION_ID)
    expect(next.communities[1].roleName).toBe("Finance Officer")
  })

  it("takes the membership's role on an existing slice but keeps the edited profile", () => {
    const store = storeWith()
    const edited = workspaceReducer(store, {
      type: "organization/updated",
      value: { name: "Greenfield Traders", email: "hello@greenfield.test" },
    })

    const next = workspaceReducer(edited, {
      type: "communities/synced",
      value: [membership({ roleId: "role-super-admin", roleName: "Super Admin", isOwner: true })],
    })

    expect(next.communities[0].roleName).toBe("Super Admin")
    expect(next.communities[0].isOwner).toBe(true)
    expect(next.communities[0].organization.name).toBe("Greenfield Traders")
    expect(next.communities[0].organization.email).toBe("hello@greenfield.test")
  })

  it("drops a community the administrator no longer belongs to", () => {
    const store = storeWith()
    const next = workspaceReducer(store, {
      type: "communities/synced",
      value: [membership({ organizationId: "org-only-one" })],
    })

    expect(next.communities.map((community) => community.id)).toEqual(["org-only-one"])
    expect(next.activeCommunityId).toBe("org-only-one")
  })

  it("ignores an empty membership list rather than emptying the workspace", () => {
    const store = storeWith()
    expect(workspaceReducer(store, { type: "communities/synced", value: [] })).toBe(store)
  })

  it("returns the same reference when a sync changes nothing", () => {
    const store = storeWith()
    const next = workspaceReducer(store, {
      type: "communities/synced",
      value: [
        membership(),
        membership({
          organizationId: SEED_ORGANIZATION_ID,
          name: "Lagos Farmers Cooperative",
          roleId: "role-super-admin",
          roleName: "Super Admin",
          isOwner: true,
        }),
      ],
    })

    expect(next).toBe(store)
  })

  it("applies a community action to the active slice only", () => {
    const store = storeWith()
    const next = workspaceReducer(store, { type: "modules/replaced", value: ["members"] })

    expect(next.communities[0].enabledModules).toEqual(["members"])
    expect(next.communities[1].enabledModules).not.toEqual(["members"])
  })

  it("switches the active tenant and refuses an unknown one", () => {
    const store = storeWith()
    const switched = workspaceReducer(store, { type: "communities/activated", value: SEED_ORGANIZATION_ID })

    expect(switched.activeCommunityId).toBe(SEED_ORGANIZATION_ID)
    expect(workspaceView(switched).organization.name).toBe("Lagos Farmers Cooperative")
    expect(workspaceReducer(store, { type: "communities/activated", value: "org-nope" })).toBe(store)
  })

  it("makes a newly created community active and free of records", () => {
    const next = workspaceReducer(storeWith(), {
      type: "communities/created",
      value: membership({
        organizationId: "org-brand-new",
        name: "Brand New",
        roleId: "role-super-admin",
        roleName: "Super Admin",
        isOwner: true,
      }),
    })

    expect(next.activeCommunityId).toBe("org-brand-new")
    expect(workspaceView(next).organization.name).toBe("Brand New")
    expect(workspaceView(next).environment).toBe("demo")
  })

  it("starts a new community with the profile and branding it was created with", () => {
    const next = workspaceReducer(storeWith(), {
      type: "communities/created",
      value: membership({
        organizationId: "org-brand-new",
        name: "Riverside Traders Association",
        legalName: "Riverside Traders Association Ltd",
        country: "Kenya",
        accent: "purple",
        roleId: "role-super-admin",
        roleName: "Super Admin",
        isOwner: true,
      }),
    })

    const view = workspaceView(next)
    expect(view.organization.country).toBe("Kenya")
    expect(view.organization.legalName).toBe("Riverside Traders Association Ltd")
    expect(view.accent).toBe("purple")
    // The default modules are on, but nothing is connected and no record exists.
    expect(view.enabledModules.length).toBeGreaterThan(0)
    expect(view.corporateAccountStatus).toBe("Not connected")
  })

  it("keeps a community's branding and setup to itself", () => {
    const store = storeWith()
    const accented = workspaceReducer(store, { type: "preferences/accent-changed", value: "purple" })
    const withCorporate = workspaceReducer(accented, { type: "corporate-account/status-changed", value: "Connected" })

    expect(workspaceView(withCorporate).environment).toBe("live")
    const other = workspaceReducer(withCorporate, { type: "communities/activated", value: SEED_ORGANIZATION_ID })
    expect(workspaceView(other).accent).toBe("blue")
    expect(workspaceView(other).environment).toBe("demo")
  })

  it("signs the new administrator in when onboarding completes", () => {
    const withAdmin = workspaceReducer(storeWith(), {
      type: "onboarding/admin-saved",
      value: { name: "Ada Okoye", email: "ada@example.com", phone: "" },
    })
    const done = workspaceReducer(withAdmin, { type: "onboarding/completed" })

    expect(done.session?.email).toBe("ada@example.com")
    expect(done.communities[0].onboardingCompleted).toBe(true)
  })

  it("keeps the theme a preference rather than a community's", () => {
    const store = storeWith()
    const dark = workspaceReducer(store, { type: "preferences/theme-changed", value: "dark" })
    const switched = workspaceReducer(dark, { type: "communities/activated", value: SEED_ORGANIZATION_ID })

    expect(switched.theme).toBe("dark")
  })
})

describe("workspace persistence", () => {
  it("persists the communities and which one is active, then reads them back", () => {
    const storage = memoryStorage()
    const store = storeWith()
    persistWorkspaceStore(store, storage)

    const loaded = loadWorkspaceStore(storage)
    expect(loaded.communities.map((community) => community.id)).toEqual(
      store.communities.map((community) => community.id),
    )
    expect(loaded.activeCommunityId).toBe(store.activeCommunityId)
    // A store with no session loads with none.
    expect(loaded.session).toBeNull()
  })

  it("persists the signed-in session so a reload keeps the user in", () => {
    const storage = memoryStorage()
    const store: WorkspaceStore = {
      ...storeWith(),
      session: { email: "ada@example.com", name: "Ada Okoye", signedInAt: "2026-10-27T00:00:00.000Z" },
    }
    persistWorkspaceStore(store, storage)

    const loaded = loadWorkspaceStore(storage)
    expect(loaded.session?.email).toBe("ada@example.com")
    expect(loaded.session?.name).toBe("Ada Okoye")
  })

  it("folds the single-community keys of the old build into the first slice", () => {
    const storage = memoryStorage({
      "finsquare-org": JSON.stringify({
        name: "Coastal Union",
        email: "hi@coastal.test",
        logo: "data:image/png;base64,AAA",
      }),
      "finsquare-onboarding": JSON.stringify({
        completed: true,
        admin: { name: "Ada Okoye", email: "ada@example.com", phone: "+234" },
        corporateStatus: "Under review",
      }),
      "finsquare-accent": "purple",
      "finsquare-theme": "dark",
    })

    const loaded = loadWorkspaceStore(storage)
    expect(loaded.communities).toHaveLength(1)
    expect(loaded.communities[0].organization.name).toBe("Coastal Union")
    expect(loaded.communities[0].organization.email).toBe("hi@coastal.test")
    expect(loaded.communities[0].organization.logo).toBe("data:image/png;base64,AAA")
    expect(loaded.communities[0].corporateAccountStatus).toBe("Under review")
    expect(loaded.communities[0].accent).toBe("purple")
    expect(loaded.admin.name).toBe("Ada Okoye")
    expect(loaded.theme).toBe("dark")
    expect(environmentFor(loaded.communities[0].corporateAccountStatus)).toBe("pending_review")
  })

  it("starts a fresh install mid-setup, so onboarding runs", () => {
    const loaded = loadWorkspaceStore(memoryStorage())

    expect(loaded.communities).toHaveLength(1)
    expect(loaded.communities[0].id).toBe(SEED_ORGANIZATION_ID)
    expect(loaded.communities[0].onboardingCompleted).toBe(false)
    expect(loaded.session).toBeNull()
  })

  it("drops the legacy keys once the new payload is written", () => {
    const storage = memoryStorage({ "finsquare-org": "{}", "finsquare-onboarding": "{}", "finsquare-accent": "blue" })
    persistWorkspaceStore(storeWith(), storage)

    expect(storage.dump()["finsquare-org"]).toBeUndefined()
    expect(storage.dump()["finsquare-onboarding"]).toBeUndefined()
    expect(storage.dump()["finsquare-accent"]).toBeUndefined()
    expect(storage.dump()["finsquare-workspace"]).toBeDefined()
  })

  it("falls back to the first community when the stored active id is gone", () => {
    const storage = memoryStorage({
      "finsquare-workspace": JSON.stringify({
        communities: [sliceFromMembership(membership())],
        activeCommunityId: "org-deleted",
      }),
    })

    expect(loadWorkspaceStore(storage).activeCommunityId).toBe("org-greenfield-multipurpose")
  })

  it("survives unparseable stored data", () => {
    const storage = memoryStorage({ "finsquare-workspace": "{not json" })
    const loaded = loadWorkspaceStore(storage)

    expect(loaded.communities).toHaveLength(1)
  })

  it("trims the whitespace an older stored community name was saved with", () => {
    const stored = storeWith()
    stored.communities[0].organization = { ...stored.communities[0].organization, name: "Kogi Boys " }
    const storage = memoryStorage()
    persistWorkspaceStore(stored, storage)

    expect(loadWorkspaceStore(storage).communities[0].organization.name).toBe("Kogi Boys")
  })
})
