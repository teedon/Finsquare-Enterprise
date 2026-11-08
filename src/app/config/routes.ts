import type { View } from "@/types"

export const viewPaths: Record<View, string> = {
  overview: "/overview",
  members: "/members",
  "member-profile": "/members/:id",
  "member-applications": "/members/applications",
  "member-application-detail": "/members/applications/:id",
  "member-application-forms": "/members/forms",
  structure: "/organization/structure",
  branches: "/branches",
  "branch-detail": "/branches/:id",
  groups: "/groups",
  "group-detail": "/groups/:id",
  administrators: "/administrators",
  "administrator-detail": "/administrators/:id",
  roles: "/settings/roles",
  "role-detail": "/settings/roles/:id",
  modules: "/settings/modules",
  "wallet": "/wallet",
  "wallets": "/wallet/wallets",
  "wallet-transactions": "/wallet/transactions",
  "wallet-access": "/wallet/access",
  contributions: "/contributions",
  "contribution-create": "/contributions/new",
  "contribution-detail": "/contributions/:id",
  dues: "/dues",
  "dues-detail": "/dues/:id",
  "dues-create": "/dues/new",
  payments: "/payments",
  savings: "/savings",
  loans: "/loans",
  "loan-applications": "/loans/applications",
  "loan-application-detail": "/loans/applications/:id",
  "loan-active": "/loans/active",
  "loan-detail": "/loans/:id",
  "loan-repayments": "/loans/repayments",
  "loan-guarantors": "/loans/guarantors",
  "loan-recovery": "/loans/recovery",
  "loan-products": "/loans/products",
  "loan-type-create": "/loans/products/new",
  "loan-disbursements": "/loans/disbursements",
  workflows: "/workflows",
  communication: "/communication",
  documents: "/documents",
  reports: "/reports",
  compliance: "/compliance",
  corporate: "/corporate-account",
  settlement: "/settings/settlement",
  settings: "/settings",
  organization: "/settings/organization",
  "community-create": "/communities/new",
}

export const pathViews = Object.fromEntries(
  Object.entries(viewPaths)
    .filter(([, path]) => !path.includes(":"))
    .map(([view, path]) => [path, view]),
) as Record<string, View>

export function resolveView(pathname: string): View {
  // Exact paths win first, then the more specific detail routes, and only then the prefix
  // fallbacks — otherwise `/members/applications` reads as a member profile.
  if (pathViews[pathname]) return pathViews[pathname]
  if (/^\/members\/applications\/[^/]+$/.test(pathname)) return "member-application-detail"
  if (pathname.startsWith("/members/")) return "member-profile"
  if (/^\/loans\/applications\/[^/]+$/.test(pathname)) return "loan-application-detail"
  if (/^\/loans\/[^/]+$/.test(pathname)) return "loan-detail"
  if (/^\/contributions\/[^/]+$/.test(pathname)) return "contribution-detail"
  if (/^\/dues\/[^/]+$/.test(pathname)) return "dues-detail"
  if (/^\/groups\/[^/]+$/.test(pathname)) return "group-detail"
  if (/^\/branches\/[^/]+$/.test(pathname)) return "branch-detail"
  if (/^\/administrators\/[^/]+$/.test(pathname)) return "administrator-detail"
  if (/^\/settings\/roles\/[^/]+$/.test(pathname)) return "role-detail"
  return "overview"
}

export function buildViewPath(view: View, id?: string): string {
  const path = viewPaths[view]
  return path.includes(":id") ? path.replace(":id", id ?? "") : path
}
