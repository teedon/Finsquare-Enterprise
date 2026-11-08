import {
  Banknote,
  ClipboardCheck,
  Folder,
  GitBranch,
  HandCoins,
  Landmark,
  LayoutDashboard,
  MessageSquareText,
  Network,
  ReceiptText,
  Settings,
  Activity,
  CreditCard,
  Users,
  WalletCards,
  Upload,
  type IconType,
} from "@/icons"
import type { EnterpriseModuleId } from "./module-registry"
import type { Permission, View } from "@/types"

export interface NavigationItem {
  id: View
  label: string
  icon: IconType
  module?: EnterpriseModuleId
  permission?: Permission
}

export interface NavigationSection {
  id: string
  /** Sections with a label render as a collapsible dropdown; unlabeled sections render their items directly. */
  label: string
  icon?: IconType
  items: NavigationItem[]
}

/**
 * The sidebar only lists primary destinations. Anything reachable from another page
 * (detail pages, sub-pages, settings tabs) is listed in `secondaryAccess` instead.
 */
export const navigationSections: NavigationSection[] = [
  { id: "home", label: "", items: [{ id: "overview", label: "Overview", icon: LayoutDashboard }] },
  {
    id: "organization",
    label: "Organization",
    icon: Users,
    items: [
      { id: "members", label: "Members", icon: Users, module: "members", permission: "members.view" },
      { id: "branches", label: "Branches", icon: GitBranch, module: "branches", permission: "branches.view" },
      { id: "groups", label: "Groups", icon: Network, module: "groups", permission: "groups.view" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: HandCoins,
    items: [
      { id: "contributions", label: "Contributions", icon: HandCoins, module: "contributions", permission: "contributions.view" },
      { id: "dues", label: "Dues", icon: ReceiptText, module: "dues", permission: "dues.view" },
      { id: "payments", label: "Payments", icon: CreditCard, module: "payments" },
      { id: "savings", label: "Savings", icon: WalletCards, module: "savings" },
    ],
  },
  { id: "wallet", label: "", items: [{ id: "wallet", label: "Wallet", icon: Landmark, module: "wallet", permission: "wallet.view" }] },
  {
    id: "loans",
    label: "Loans",
    icon: Banknote,
    items: [
      { id: "loans", label: "Overview", icon: LayoutDashboard, module: "loans", permission: "loans.view" },
      { id: "loan-applications", label: "Applications", icon: ClipboardCheck, module: "loans", permission: "loans.view" },
      { id: "loan-active", label: "Active loans", icon: Banknote, module: "loans", permission: "loans.view" },
      { id: "loan-disbursements", label: "Disbursements", icon: Upload, module: "loans", permission: "loans.view" },
      { id: "loan-repayments", label: "Repayments", icon: ReceiptText, module: "loans", permission: "loans.view" },
    ],
  },
  {
    id: "communications",
    label: "Communications",
    icon: MessageSquareText,
    items: [
      { id: "communication", label: "Messaging", icon: MessageSquareText, module: "communication", permission: "communication.view" },
      { id: "documents", label: "Documents", icon: Folder, module: "documents" },
    ],
  },
  {
    id: "tools",
    label: "",
    items: [
      { id: "reports", label: "Reports", icon: Activity, module: "reports" },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
]

/** Views reachable from another page (not the sidebar), with their module/permission requirements. */
const secondaryAccess: Partial<Record<View, { module?: EnterpriseModuleId; permission?: Permission; nav: View }>> = {
  "wallets": { module: "wallet", permission: "wallet.view", nav: "wallet" },
  "wallet-transactions": { module: "wallet", permission: "wallet.view", nav: "wallet" },
  "wallet-access": { module: "wallet", permission: "wallet.view", nav: "wallet" },
  "contribution-detail": { module: "contributions", permission: "contributions.view", nav: "contributions" },
  "contribution-create": { module: "contributions", permission: "contributions.create", nav: "contributions" },
  "dues-detail": { module: "dues", permission: "dues.view", nav: "dues" },
  "dues-create": { module: "dues", permission: "dues.create", nav: "dues" },
  "loan-guarantors": { module: "loans", permission: "guarantors.view", nav: "loans" },
  "loan-recovery": { module: "loans", permission: "loans.recover", nav: "loans" },
  "loan-products": { module: "loans", permission: "loan_products.view", nav: "loans" },
  "loan-type-create": { module: "loans", permission: "loan_products.create", nav: "loans" },
  "loan-application-detail": { module: "loans", permission: "loans.view", nav: "loan-applications" },
  "loan-detail": { module: "loans", permission: "loans.view", nav: "loan-active" },
  "member-profile": { module: "members", permission: "members.view", nav: "members" },
  "member-applications": { module: "members", permission: "members.view_applications", nav: "members" },
  "member-application-detail": { module: "members", permission: "members.view_applications", nav: "members" },
  "member-application-forms": { module: "members", permission: "members.manage_forms", nav: "members" },
  "group-detail": { module: "groups", permission: "groups.view", nav: "groups" },
  "branch-detail": { module: "branches", permission: "branches.view", nav: "branches" },
  administrators: { permission: "administrators.view", nav: "settings" },
  "administrator-detail": { permission: "administrators.view", nav: "settings" },
  roles: { permission: "roles.view", nav: "settings" },
  "role-detail": { permission: "roles.view", nav: "settings" },
  modules: { nav: "settings" },
  organization: { nav: "settings" },
  compliance: { nav: "settings" },
  corporate: { nav: "settings" },
  settlement: { permission: "wallet.manage_settlement", nav: "settings" },
  // Starting a community is a platform-level action, not a permission inside one community, so it
  // carries no module or permission of its own.
  "community-create": { nav: "overview" },
}

/** The sidebar item that should appear active for a view. */
export function parentView(view: View): View {
  return secondaryAccess[view]?.nav ?? view
}

const navItems = navigationSections.flatMap((section) => section.items)

export function canAccessView(
  view: View,
  enabledModules: ReadonlySet<string>,
  canPermission: (permission: Permission) => boolean = () => true,
): boolean {
  const rule = navItems.find((item) => item.id === view) ?? secondaryAccess[view]
  return (
    (!rule?.module || enabledModules.has(rule.module)) &&
    (!rule?.permission || canPermission(rule.permission))
  )
}

export const SETTINGS_TABS: { id: View; label: string }[] = [
  { id: "settings", label: "General" },
  { id: "organization", label: "Organization" },
  { id: "administrators", label: "Administrators" },
  { id: "roles", label: "Roles & permissions" },
  { id: "modules", label: "Modules" },
  { id: "corporate", label: "Corporate account" },
  { id: "settlement", label: "Wallet settlement" },
  { id: "compliance", label: "Compliance" },
]

export function settingsTabFor(view: View): View | null {
  if (view === "administrator-detail") return "administrators"
  if (view === "role-detail") return "roles"
  return SETTINGS_TABS.some((t) => t.id === view) ? view : null
}

const crumbParents: Partial<Record<View, View>> = {
  "loan-applications": "loans", "loan-active": "loans", "loan-disbursements": "loans", "loan-repayments": "loans",
  "loan-guarantors": "loans", "loan-recovery": "loans", "loan-products": "loans", "loan-type-create": "loan-products",
  "loan-application-detail": "loan-applications", "loan-detail": "loan-active",
  wallets: "wallet", "wallet-transactions": "wallet", "wallet-access": "wallet",
  "contribution-detail": "contributions",
  "contribution-create": "contributions",
  "dues-detail": "dues",
  "dues-create": "dues",
  "member-profile": "members", "group-detail": "groups", "branch-detail": "branches",
  "member-applications": "members", "member-application-detail": "member-applications", "member-application-forms": "members",
  administrators: "settings", roles: "settings", modules: "settings", compliance: "settings", corporate: "settings", settlement: "settings", organization: "settings",
  "administrator-detail": "administrators", "role-detail": "roles",
  "community-create": "overview",
}

const crumbLabels: Partial<Record<View, string>> = {
  overview: "Home", "loan-repayments": "Repayments", "loan-guarantors": "Guarantors", "loan-recovery": "Recovery",
  "loan-products": "Loan types", "loan-type-create": "Create loan type", "loan-application-detail": "Application", "loan-detail": "Loan",
  wallets: "Branch wallets", "wallet-transactions": "Transactions", "wallet-access": "Access & controls",
  "contribution-create": "Create contribution", "contribution-detail": "Contribution",
  "dues-detail": "Dues plan", "dues-create": "Create dues plan",
  "member-profile": "Member", "group-detail": "Group", "branch-detail": "Branch",
  "member-applications": "Applications", "member-application-detail": "Application", "member-application-forms": "Application forms",
  administrators: "Administrators", "administrator-detail": "Administrator", roles: "Roles & permissions", "role-detail": "Role",
  modules: "Modules", compliance: "Compliance", corporate: "Corporate account & wallet", settlement: "Wallet settlement", organization: "Organization details",
  structure: "Structure", workflows: "Workflows", settings: "Settings",
  "community-create": "Create a community",
}

export interface Crumb { view: View; label: string }

export function viewLabel(view: View): string {
  return crumbLabels[view] ?? navItems.find((i) => i.id === view)?.label ?? view
}

/** Ancestor chain for breadcrumbs, from Home down to the current view. */
export function breadcrumbTrail(view: View): Crumb[] {
  const chain: View[] = []
  for (let v: View | undefined = view; v; v = crumbParents[v]) chain.unshift(v)
  if (chain[0] !== "overview") chain.unshift("overview")
  return chain.map((v) => ({ view: v, label: viewLabel(v) }))
}

export function crumbParent(view: View): View | undefined {
  return crumbParents[view]
}
