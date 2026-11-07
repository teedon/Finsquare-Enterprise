import { emptyCorporateDetails, type AdminAccount, type CorporateAccountDetails } from "@/features/onboarding/types"
import type { CommunityMembership } from "@/features/communities/types"
import type { Session } from "@/features/auth/types"
import { env } from "@/app/config/env"
import { DEFAULT_ENABLED_MODULES } from "@/app/config/module-registry"
import { complianceDocumentsMock } from "@/features/compliance/mocks/compliance.mock"
import { SEED_ORGANIZATION_ID } from "@/lib/tenancy/seed-tenant"
import type { ComplianceDocumentStatus, CorporateAccountStatus, OrganizationEnvironment, RoleScope } from "@/types"

export type ThemePreference = "light" | "dark" | "system"

export interface OrganizationProfile {
  name: string
  type: string
  registrationNumber: string
  yearEstablished: string
  legalName: string
  country: string
  description: string
  memberCount: string
  areaOfOperation: string
  secondaryColor: string
  email: string
  phone: string
  website: string
  address: string
  city: string
  state: string
  logo: string
}

export const ORGANIZATION_TYPES = [
  "Cooperative",
  "Association",
  "Union",
  "MFI",
  "Staff association",
  "Farmers' group",
  "Other",
]

/** Everything a community knows about itself that is not the person looking at it. */
export interface WorkspaceCommunity {
  /** The tenant id. Every repository takes it as its first argument. */
  id: string
  roleId: string
  roleName: string
  rolePermissions?: CommunityMembership["rolePermissions"]
  isOwner: boolean
  scope: RoleScope
  branchIds?: string[]
  organization: OrganizationProfile
  /** The community's primary brand colour, applied to the workspace while it is active. */
  accent: string
  enabledModules: string[]
  corporateAccountStatus: CorporateAccountStatus
  corporateDetails: CorporateAccountDetails
  complianceDocuments: ComplianceDocumentStatus[]
  onboardingCompleted: boolean
}

/** One empty profile, so a community with no details yet still has every field to fill in. */
export const emptyOrganization: OrganizationProfile = {
  name: "",
  type: ORGANIZATION_TYPES[0],
  registrationNumber: "",
  yearEstablished: "",
  legalName: "",
  country: "Nigeria",
  description: "",
  memberCount: "",
  areaOfOperation: "",
  secondaryColor: "#0f766e",
  email: "",
  phone: "",
  website: "",
  address: "",
  city: "",
  state: "",
  logo: "",
}

/** The seeded community's profile, used until its own details are edited (and by a fresh install). */
const seedOrganization: OrganizationProfile = {
  ...emptyOrganization,
  name: "Lagos Farmers Cooperative",
  type: "Cooperative",
  registrationNumber: "RC-1048223",
  yearEstablished: "2014",
  legalName: "Lagos Farmers Cooperative Society Ltd",
  country: "Nigeria",
  memberCount: "2438",
  areaOfOperation: "Agriculture",
  email: "info@lagosfarmers.coop",
  phone: "+234 801 234 5678",
  address: "12 Agric Road, Ikeja",
  city: "Lagos",
  state: "Lagos",
}

/**
 * The store. Only genuinely global state lives here: the communities, which one is active, and the
 * person signed into the app. Everything else belongs to a slice in `communities`.
 */
export interface WorkspaceStore {
  communities: WorkspaceCommunity[]
  activeCommunityId: string
  theme: ThemePreference
  admin: AdminAccount
  /** The signed-in identity. Persisted so a page reload keeps the user signed in. */
  session: Session | null
}

/** What the context exposes: the store with the active community's slice flattened onto it. */
export interface WorkspaceState extends WorkspaceStore {
  organization: OrganizationProfile
  accent: string
  enabledModules: string[]
  environment: OrganizationEnvironment
  corporateAccountStatus: CorporateAccountStatus
  corporateDetails: CorporateAccountDetails
  complianceDocuments: ComplianceDocumentStatus[]
  onboardingCompleted: boolean
}

/** Corporate account status drives the environment: no account yet means the workspace is not live. */
export function environmentFor(status: CorporateAccountStatus): OrganizationEnvironment {
  return status === "Connected" ? "live" : status === "Under review" ? "pending_review" : "demo"
}

const WORKSPACE_KEY = "finsquare-workspace"
const THEME_KEY = "finsquare-theme"

// Keys the single-community build wrote. Read once during migration, then removed.
const LEGACY_ORGANIZATION_KEY = "finsquare-org"
const LEGACY_ONBOARDING_KEY = "finsquare-onboarding"
const LEGACY_ACCENT_KEY = "finsquare-accent"

export const emptyAdmin: AdminAccount = { name: "", email: "", phone: "" }

/**
 * The slice of `localStorage` this module needs. Taking it as a parameter keeps the load, migration
 * and persist paths testable without a browser, and keeps the module from reaching for a global.
 */
export interface WorkspaceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const noStorage: WorkspaceStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

export function browserStorage(): WorkspaceStorage {
  return typeof window === "undefined" ? noStorage : window.localStorage
}

function readJson<T>(key: string, storage: WorkspaceStorage): T | null {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function readTheme(storage: WorkspaceStorage): ThemePreference {
  const value = storage.getItem(THEME_KEY)
  return value === "dark" || value === "system" ? value : value === "light" ? "light" : "system"
}

function seededCompliance(): ComplianceDocumentStatus[] {
  return complianceDocumentsMock.map((document) => document.status)
}

/**
 * A community the administrator belongs to but the workspace has not stored yet — a second membership,
 * or one they just created. Only the details the membership carries are filled in; the rest is empty
 * because nobody has entered it, which is what the Settings pages then ask for.
 */
export function sliceFromMembership(membership: CommunityMembership): WorkspaceCommunity {
  const seeded = membership.organizationId === SEED_ORGANIZATION_ID
  const profile = membership.profile ?? {}
  const str = (key: string): string => (typeof profile[key] === "string" ? (profile[key] as string) : "")
  return {
    id: membership.organizationId,
    roleId: membership.roleId,
    roleName: membership.roleName,
    rolePermissions: membership.rolePermissions,
    isOwner: membership.isOwner,
    scope: membership.scope,
    branchIds: membership.branchIds,
    organization: {
      ...(seeded ? seedOrganization : emptyOrganization),
      name: membership.name,
      type: membership.type,
      country: membership.country,
      logo: membership.logo,
      legalName: membership.legalName,
      registrationNumber: str("registrationNumber"),
      yearEstablished: str("yearEstablished"),
      description: str("description"),
      memberCount: str("memberCount"),
      areaOfOperation: str("areaOfOperation"),
      secondaryColor: str("secondaryColor") || emptyOrganization.secondaryColor,
      email: str("email"),
      phone: str("phone"),
      website: str("website"),
      address: str("address"),
      city: str("city"),
      state: str("state"),
    },
    accent: membership.accent,
    enabledModules: DEFAULT_ENABLED_MODULES,
    corporateAccountStatus: "Not connected",
    corporateDetails: { ...emptyCorporateDetails },
    complianceDocuments: seededCompliance(),
    // The community exists and the administrator belongs to it, so it is not mid-setup.
    onboardingCompleted: true,
  }
}

/** A slice written by an older build may be missing fields the current one expects. */
function withDefaults(community: WorkspaceCommunity): WorkspaceCommunity {
  return {
    ...community,
    organization: { ...emptyOrganization, ...community.organization },
    enabledModules: community.enabledModules ?? DEFAULT_ENABLED_MODULES,
    corporateDetails: { ...emptyCorporateDetails, ...community.corporateDetails },
    complianceDocuments: community.complianceDocuments ?? seededCompliance(),
    onboardingCompleted: community.onboardingCompleted ?? true,
  }
}

interface StoredWorkspace {
  communities?: WorkspaceCommunity[]
  activeCommunityId?: string
  admin?: AdminAccount
  session?: Session | null
}

/**
 * Folds the single-community keys of the previous build into the first community's slice, so an
 * existing workspace keeps its profile, branding, setup progress and corporate account. Runs only
 * when the current key is absent.
 */
function migrateLegacyWorkspace(theme: ThemePreference, storage: WorkspaceStorage): WorkspaceStore {
  const legacyOrganization = readJson<Partial<OrganizationProfile>>(LEGACY_ORGANIZATION_KEY, storage)
  const legacyOnboarding = readJson<{
    completed?: boolean
    admin?: AdminAccount
    corporateDetails?: CorporateAccountDetails
    corporateStatus?: CorporateAccountStatus
  }>(LEGACY_ONBOARDING_KEY, storage)
  const legacyAccent = storage.getItem(LEGACY_ACCENT_KEY)

  // A real (non-mock) install starts empty: the self-service onboarding form must not show the
  // demo "Lagos Farmers Cooperative" seed. The seed only appears when mocks are enabled.
  const seedBase = env.VITE_ENABLE_MOCKS ? seedOrganization : emptyOrganization

  const slice = sliceFromMembership({
    organizationId: SEED_ORGANIZATION_ID,
    name: seedBase.name,
    type: seedBase.type,
    logo: legacyOrganization?.logo ?? "",
    country: seedBase.country,
    legalName: seedBase.legalName,
    accent: legacyAccent ?? "blue",
    roleId: "role-super-admin",
    roleName: "Super Admin",
    scope: "organization",
    isOwner: true,
  })
  slice.organization = { ...seedBase, ...(legacyOrganization ?? {}) }
  slice.accent = legacyAccent ?? "blue"
  slice.corporateAccountStatus = legacyOnboarding?.corporateStatus ?? "Not connected"
  if (legacyOnboarding?.corporateDetails) slice.corporateDetails = legacyOnboarding.corporateDetails
  // Only the legacy flag can leave a community mid-setup; anything the backend reports is set up.
  slice.onboardingCompleted = legacyOnboarding?.completed ?? false

  return {
    communities: [slice],
    activeCommunityId: slice.id,
    theme,
    admin: legacyOnboarding?.admin ?? emptyAdmin,
    session: null,
  }
}

export function loadWorkspaceStore(storage: WorkspaceStorage = browserStorage()): WorkspaceStore {
  const theme = readTheme(storage)
  const stored = readJson<StoredWorkspace>(WORKSPACE_KEY, storage)
  if (!stored?.communities?.length) return migrateLegacyWorkspace(theme, storage)

  const communities = stored.communities.map(withDefaults)
  const activeCommunityId = communities.some((community) => community.id === stored.activeCommunityId)
    ? (stored.activeCommunityId as string)
    : communities[0].id

  return {
    communities,
    activeCommunityId,
    theme,
    admin: stored.admin ?? emptyAdmin,
    session: stored.session ?? null,
  }
}

export function persistWorkspaceStore(store: WorkspaceStore, storage: WorkspaceStorage = browserStorage()): void {
  try {
    storage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        communities: store.communities,
        activeCommunityId: store.activeCommunityId,
        admin: store.admin,
        session: store.session,
      }),
    )
    storage.setItem(THEME_KEY, store.theme)
    // The legacy keys are superseded by the payload above; leaving them behind would let a later
    // migration resurrect an old profile.
    storage.removeItem(LEGACY_ORGANIZATION_KEY)
    storage.removeItem(LEGACY_ONBOARDING_KEY)
    storage.removeItem(LEGACY_ACCENT_KEY)
  } catch {
    // Storage full (a community logo can be large) – keep the workspace in memory only.
  }
}

export type WorkspaceAction =
  | { type: "communities/synced"; value: CommunityMembership[] }
  | { type: "communities/activated"; value: string }
  | { type: "communities/created"; value: CommunityMembership }
  | { type: "organization/updated"; value: Partial<OrganizationProfile> }
  | { type: "modules/replaced"; value: string[] }
  | { type: "corporate-account/status-changed"; value: CorporateAccountStatus }
  | { type: "corporate-account/details-saved"; value: CorporateAccountDetails }
  | { type: "compliance/document-updated"; index: number; value: ComplianceDocumentStatus }
  | { type: "compliance/synced"; value: ComplianceDocumentStatus[] }
  | { type: "onboarding/completed" }
  | { type: "onboarding/restarted" }
  | { type: "onboarding/admin-saved"; value: AdminAccount }
  | { type: "preferences/theme-changed"; value: ThemePreference }
  | { type: "preferences/accent-changed"; value: string }
  | { type: "auth/signed-in"; value: Session }
  | { type: "auth/signed-out" }

/** Actions that describe a community are applied to whichever one is active. */
function patchActive(
  state: WorkspaceStore,
  patch: (community: WorkspaceCommunity) => WorkspaceCommunity,
): WorkspaceStore {
  return {
    ...state,
    communities: state.communities.map((community) =>
      community.id === state.activeCommunityId ? patch(community) : community,
    ),
  }
}

/**
 * Merges the memberships the backend reports into the stored communities.
 *
 * A membership the workspace does not know yet becomes a slice. An existing slice keeps the profile
 * the administrator has edited and only takes the membership's role, because the role is a fact about
 * the relationship while the name, logo and branding are the community's own record.
 */
function syncCommunities(state: WorkspaceStore, memberships: CommunityMembership[]): WorkspaceStore {
  // An empty answer must not empty the workspace: a failed or still-loading request would otherwise
  // take every community away with it.
  if (!memberships.length) return state

  const byId = new Map(memberships.map((membership) => [membership.organizationId, membership]))
  const kept = state.communities
    .filter((community) => byId.has(community.id))
    .map((community) => {
      const membership = byId.get(community.id)!
      return {
        ...community,
        roleId: membership.roleId,
        roleName: membership.roleName,
        rolePermissions: membership.rolePermissions,
        isOwner: membership.isOwner,
        scope: membership.scope,
        branchIds: membership.branchIds,
      }
    })

  const known = new Set(kept.map((community) => community.id))
  const communities = [
    ...kept,
    ...memberships.filter((membership) => !known.has(membership.organizationId)).map(sliceFromMembership),
  ]
  const activeCommunityId = communities.some((community) => community.id === state.activeCommunityId)
    ? state.activeCommunityId
    : communities[0].id

  // Returning the same reference keeps the provider from re-rendering on every sync.
  const rolesUnchanged = communities.every((community) => {
    const before = state.communities.find((item) => item.id === community.id)
    return (
      before !== undefined &&
      before.roleId === community.roleId &&
      before.roleName === community.roleName &&
      before.rolePermissions?.join("|") === community.rolePermissions?.join("|") &&
      before.isOwner === community.isOwner &&
      before.scope === community.scope
    )
  })
  if (rolesUnchanged && activeCommunityId === state.activeCommunityId) return state

  return { ...state, communities, activeCommunityId }
}

export function workspaceReducer(state: WorkspaceStore, action: WorkspaceAction): WorkspaceStore {
  switch (action.type) {
    case "communities/synced":
      return syncCommunities(state, action.value)
    case "communities/activated":
      return state.communities.some((community) => community.id === action.value)
        ? { ...state, activeCommunityId: action.value }
        : state
    case "communities/created": {
      const slice = sliceFromMembership(action.value)
      return {
        ...state,
        communities: [...state.communities.filter((community) => community.id !== slice.id), slice],
        // Starting a community takes you into it — that is the point of creating one.
        activeCommunityId: slice.id,
      }
    }
    case "organization/updated":
      return patchActive(state, (community) => ({
        ...community,
        organization: { ...community.organization, ...action.value },
      }))
    case "modules/replaced":
      return patchActive(state, (community) => ({ ...community, enabledModules: action.value }))
    case "corporate-account/status-changed":
      return patchActive(state, (community) => ({ ...community, corporateAccountStatus: action.value }))
    case "corporate-account/details-saved":
      return patchActive(state, (community) => ({ ...community, corporateDetails: action.value }))
    case "compliance/document-updated":
      return patchActive(state, (community) => ({
        ...community,
        complianceDocuments: community.complianceDocuments.map((document, index) =>
          index === action.index ? action.value : document,
        ),
      }))
    case "compliance/synced":
      return patchActive(state, (community) => ({
        ...community,
        complianceDocuments: action.value,
      }))
    case "onboarding/completed":
      // Finishing sign-up signs the new administrator in.
      return {
        ...patchActive(state, (community) => ({ ...community, onboardingCompleted: true })),
        session: state.session ?? {
          email: state.admin.email,
          name: state.admin.name,
          signedInAt: new Date().toISOString(),
        },
      }
    case "onboarding/restarted":
      return patchActive(state, (community) => ({ ...community, onboardingCompleted: false }))
    case "onboarding/admin-saved":
      return { ...state, admin: action.value }
    case "preferences/theme-changed":
      return { ...state, theme: action.value }
    case "preferences/accent-changed":
      return patchActive(state, (community) => ({ ...community, accent: action.value }))
    case "auth/signed-in":
      return { ...state, session: action.value }
    case "auth/signed-out":
      return { ...state, session: null }
  }
}

/** The active community's slice, flattened onto the store so consumers read one flat state. */
export function workspaceView(store: WorkspaceStore): WorkspaceState {
  const active = store.communities.find((community) => community.id === store.activeCommunityId) ?? store.communities[0]
  return {
    ...store,
    organization: active.organization,
    accent: active.accent,
    enabledModules: active.enabledModules,
    environment: environmentFor(active.corporateAccountStatus),
    corporateAccountStatus: active.corporateAccountStatus,
    corporateDetails: active.corporateDetails,
    complianceDocuments: active.complianceDocuments,
    onboardingCompleted: active.onboardingCompleted,
  }
}
