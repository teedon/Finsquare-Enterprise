import type { Permission, Role, RoleScope } from "@/types"

/**
 * The roles every community starts with. They are configuration rather than records: creating a
 * community creates its system roles, the same way it gets the default group types, so this is the
 * one place they are defined and the Roles page, the administrators directory and the permission
 * checks all read them from here.
 *
 * `administrator` role ids are stable across tenants, which is what lets a membership record store
 * `roleId: "role-super-admin"` and have it resolve in whichever community is active.
 */
interface SystemRoleDefinition {
  id: string
  name: string
  description: string
  scope: RoleScope
  permissions: Permission[]
}

/** Every permission in the catalog. Held by the Super Admin and nothing else. */
const ALL_PERMISSIONS: Permission[] = [
  "members.view",
  "members.create",
  "members.update",
  "members.delete",
  "members.import",
  "members.export",
  "members.view_applications",
  "members.review_applications",
  "members.manage_forms",
  "groups.view",
  "groups.create",
  "groups.update",
  "groups.delete",
  "groups.manage_members",
  "branches.view",
  "branches.create",
  "branches.update",
  "branches.delete",
  "administrators.view",
  "administrators.invite",
  "administrators.update",
  "administrators.suspend",
  "roles.view",
  "roles.create",
  "roles.update",
  "roles.delete",
  "contributions.view",
  "contributions.create",
  "contributions.update",
  "contributions.close",
  "contributions.record_payment",
  "contributions.withdraw",
  "contributions.approve_withdrawal",
  "contributions.manage_commission",
  "contributions.manage_access",
  "contributions.export",
  "dues.view",
  "dues.create",
  "dues.update",
  "dues.close",
  "dues.record_payment",
  "dues.recover",
  "dues.export",
  "dues.manage_rules",
  "loans.view",
  "loans.create",
  "loans.update",
  "loans.approve",
  "loans.reject",
  "loans.disburse",
  "loans.repay",
  "loans.recover",
  "loans.export",
  "loan_products.view",
  "loan_products.create",
  "loan_products.update",
  "loan_products.activate",
  "guarantors.view",
  "guarantors.verify",
  "guarantors.manage",
  "reports.view",
  "reports.export",
  "wallet.view",
  "wallet.view_balance",
  "wallet.view_transactions",
  "wallet.fund",
  "wallet.transfer",
  "wallet.withdraw",
  "wallet.disburse",
  "wallet.approve_disbursement",
  "wallet.approve_transfer",
  "wallet.reverse",
  "wallet.export",
  "wallet.manage_access",
  "wallet.manage_limits",
  "wallet.manage",
  "wallet.manage_settlement",
  "communication.view",
  "communication.send",
  "communication.export",
  "communication.manage_balance",
  "settings.manage",
  "compliance.manage",
]

export const SYSTEM_ROLE_DEFINITIONS: SystemRoleDefinition[] = [
  {
    id: "role-super-admin",
    name: "Super Admin",
    description: "Full organization access.",
    scope: "organization",
    permissions: ALL_PERMISSIONS,
  },
  {
    id: "role-admin",
    name: "Administrator",
    description: "Runs the workspace day to day, without organization settings.",
    scope: "organization",
    permissions: ALL_PERMISSIONS.filter(
      (permission) =>
        !permission.startsWith("roles.") &&
        permission !== "settings.manage" &&
        permission !== "administrators.suspend" &&
        permission !== "wallet.manage",
    ),
  },
  {
    id: "role-finance",
    name: "Finance Officer",
    description: "Financial operations and reporting.",
    scope: "organization",
    permissions: [
      "members.view",
      "groups.view",
      "branches.view",
      "contributions.view",
      "contributions.create",
      "contributions.update",
      "contributions.record_payment",
      "contributions.withdraw",
      "contributions.approve_withdrawal",
      "contributions.export",
      "dues.view",
      "dues.create",
      "dues.update",
      "dues.close",
      "dues.record_payment",
      "dues.recover",
      "dues.export",
      "loans.view",
      "loans.disburse",
      "wallet.view",
      "wallet.view_balance",
      "wallet.view_transactions",
      "wallet.fund",
      "wallet.transfer",
      "wallet.disburse",
      "communication.view",
      "communication.send",
      "communication.manage_balance",
      "reports.view",
      "reports.export",
    ],
  },
  {
    id: "role-finance-manager",
    name: "Finance Manager",
    description: "Approves wallet movements, manages access and limits.",
    scope: "organization",
    permissions: [
      "members.view",
      "branches.view",
      "contributions.view",
      "contributions.approve_withdrawal",
      "contributions.withdraw",
      "contributions.manage_commission",
      "loans.view",
      "loans.approve",
      "loans.disburse",
      "wallet.view",
      "wallet.view_balance",
      "wallet.view_transactions",
      "wallet.fund",
      "wallet.transfer",
      "wallet.disburse",
      "wallet.approve_disbursement",
      "wallet.approve_transfer",
      "wallet.reverse",
      "wallet.export",
      "wallet.manage_access",
      "wallet.manage_limits",
      "communication.view",
      "communication.send",
      "communication.manage_balance",
      "reports.view",
      "reports.export",
    ],
  },
  {
    id: "role-membership",
    name: "Membership Officer",
    description: "Member, group, and branch management.",
    scope: "organization",
    permissions: [
      "members.view",
      "members.create",
      "members.update",
      "members.import",
      "members.export",
      "members.view_applications",
      "members.review_applications",
      "groups.view",
      "groups.create",
      "groups.update",
      "groups.manage_members",
      "branches.view",
      "communication.view",
      "communication.send",
    ],
  },
  {
    id: "role-branch-admin",
    name: "Branch Administrator",
    description: "Operational access limited to assigned branches.",
    scope: "branch",
    permissions: [
      "members.view",
      "members.create",
      "members.update",
      "groups.view",
      "groups.create",
      "groups.update",
      "groups.manage_members",
      "branches.view",
      "branches.update",
      "administrators.view",
      "wallet.view",
      "wallet.view_balance",
      "wallet.view_transactions",
      "wallet.fund",
      "communication.view",
      "communication.send",
      "dues.view",
      "dues.record_payment",
      "reports.view",
    ],
  },
  {
    id: "role-auditor",
    name: "Auditor",
    description: "Read-only access to records and reports.",
    scope: "organization",
    permissions: [
      "members.view",
      "groups.view",
      "branches.view",
      "administrators.view",
      "contributions.view",
      "dues.view",
      "dues.export",
      "loans.view",
      "wallet.view",
      "wallet.view_balance",
      "wallet.view_transactions",
      "wallet.export",
      "communication.view",
      "communication.export",
      "reports.view",
      "reports.export",
    ],
  },
]

/**
 * The system roles of one community. They share one definition and differ only by the tenant they
 * belong to, so the same role can be resolved in whichever community is active.
 *
 * System roles are platform configuration rather than records a community creates: every community
 * has them from its first moment, and they are not editable. The timestamps are therefore the
 * platform's, not the community's — nothing user-facing shows them.
 */
export const SYSTEM_ROLE_RECORDED_AT = "2022-08-01T09:00:00.000Z"

export function systemRolesFor(organizationId: string): Role[] {
  return SYSTEM_ROLE_DEFINITIONS.map((definition) => ({
    ...definition,
    organizationId,
    permissions: [...definition.permissions],
    isSystemRole: true,
    createdAt: SYSTEM_ROLE_RECORDED_AT,
    updatedAt: SYSTEM_ROLE_RECORDED_AT,
  }))
}

/** One system role for a community, or `null` when the id is a community's own custom role. */
export function systemRoleById(
  organizationId: string,
  roleId: string,
): Role | null {
  return (
    systemRolesFor(organizationId).find((role) => role.id === roleId) ?? null
  )
}
