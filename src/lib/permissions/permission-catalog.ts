import type { EnterpriseModuleId } from "@/app/config/module-registry"
import type { Permission, Role } from "@/types"

export interface PermissionGroup {
  label: string
  /** Shown only when this module is enabled for the organization; omitted = always available. */
  module?: EnterpriseModuleId
  /** Organization-level capabilities that cannot be granted to branch- or group-scoped roles. */
  organizationOnly?: boolean
  permissions: Permission[]
}

export const permissionCatalog: PermissionGroup[] = [
  { label: "Members", module: "members", permissions: ["members.view", "members.create", "members.update", "members.delete", "members.import", "members.export", "members.view_applications", "members.review_applications"] },
  { label: "Member applications", module: "members", organizationOnly: true, permissions: ["members.manage_forms"] },
  { label: "Groups", module: "groups", permissions: ["groups.view", "groups.create", "groups.update", "groups.delete", "groups.manage_members"] },
  { label: "Branches", module: "branches", organizationOnly: true, permissions: ["branches.view", "branches.create", "branches.update", "branches.delete"] },
  { label: "Administrators", organizationOnly: true, permissions: ["administrators.view", "administrators.invite", "administrators.update", "administrators.suspend"] },
  { label: "Roles", organizationOnly: true, permissions: ["roles.view", "roles.create", "roles.update", "roles.delete"] },
  { label: "Contributions", module: "contributions", permissions: ["contributions.view", "contributions.create", "contributions.update", "contributions.close", "contributions.record_payment", "contributions.withdraw", "contributions.approve_withdrawal", "contributions.export"] },
  { label: "Contribution administration", module: "contributions", organizationOnly: true, permissions: ["contributions.manage_commission", "contributions.manage_access"] },
  { label: "Dues", module: "dues", permissions: ["dues.view", "dues.create", "dues.update", "dues.close", "dues.record_payment", "dues.recover", "dues.export"] },
  { label: "Dues administration", module: "dues", organizationOnly: true, permissions: ["dues.manage_rules"] },
  { label: "Loans", module: "loans", permissions: ["loans.view", "loans.create", "loans.update", "loans.approve", "loans.reject", "loans.disburse", "loans.repay", "loans.recover", "loans.export"] },
  { label: "Loan types", module: "loans", organizationOnly: true, permissions: ["loan_products.view", "loan_products.create", "loan_products.update", "loan_products.activate"] },
  { label: "Guarantors", module: "guarantors", permissions: ["guarantors.view", "guarantors.verify", "guarantors.manage"] },
  { label: "Wallet", module: "wallet", permissions: ["wallet.view", "wallet.view_balance", "wallet.view_transactions", "wallet.fund", "wallet.transfer", "wallet.withdraw", "wallet.disburse", "wallet.approve_disbursement", "wallet.approve_transfer", "wallet.reverse", "wallet.export"] },
  { label: "Wallet administration", module: "wallet", organizationOnly: true, permissions: ["wallet.manage_access", "wallet.manage_limits", "wallet.manage", "wallet.manage_settlement"] },
  { label: "Communications", module: "communication", permissions: ["communication.view", "communication.send", "communication.export"] },
  { label: "Communication administration", module: "communication", organizationOnly: true, permissions: ["communication.manage_balance"] },
  { label: "Reports", module: "reports", permissions: ["reports.view", "reports.export"] },
  { label: "Settings & compliance", organizationOnly: true, permissions: ["settings.manage", "compliance.manage"] },
]

export function scopedPermissionGroups(enabled: ReadonlySet<string>, scope: Role["scope"]): PermissionGroup[] {
  return permissionCatalog.filter((g) => (!g.module || enabled.has(g.module)) && (scope === "organization" || !g.organizationOnly))
}
