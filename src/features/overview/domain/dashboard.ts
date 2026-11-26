import type { View } from "@/types"

export interface Metric {
  id: "customers" | "active-loans" | "pending-applications" | "disbursed" | "repaid" | "overdue"
  label: string
  value: string
  detail: string
  /** Where the card opens: a count is only useful if it leads to the records behind it. */
  target: View
}

/** One thing waiting on a staff member, with the page that owns the work. */
export interface DashboardAttentionItem {
  id: string
  label: string
  category: string
  target: View
}

/** The latest customers, shown in the overview's recent-activity panel. */
export interface DashboardCustomer {
  id: string
  name: string
  status: string
  joinedAt: string
}

/** The resolved dashboard state a page renders, whichever source produced it. */
export interface DashboardData {
  status: "loading" | "success" | "error"
  error: string | null
  retry: () => void
  metrics: Metric[]
  attention: DashboardAttentionItem[]
  latestCustomers: DashboardCustomer[]
  hasNoRecords: boolean
  eyebrow: string
  greeting: string
}

/** Everything the MFI dashboard needs. All of it comes from records; none of it is written by hand. */
export interface DashboardInput {
  customerCount: number
  customersAwaitingApproval: number
  activeLoans: number
  overdueLoans: number
  totalApplications: number
  pendingApplications: number
  totalDisbursed: number
  totalRepaid: number
  repaymentRate: number
  activeEsusu: number
  esusuCollected: number
  walletApprovalsPending: number
  staffAwaitingSetup: number
  walletConnected: boolean
  latestCustomers: DashboardCustomer[]
}

/** Naira amounts are formatted once, here, so the cards always agree. */
export function formatNaira(amount: number): string {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`
}

export function dashboardMetrics(input: DashboardInput): Metric[] {
  return [
    {
      id: "customers",
      label: "Members",
      value: input.customerCount.toLocaleString(),
      detail: input.customersAwaitingApproval
        ? `${input.customersAwaitingApproval.toLocaleString()} awaiting approval`
        : "None awaiting approval",
      target: "members",
    },
    {
      id: "active-loans",
      label: "Active loans",
      value: input.activeLoans.toLocaleString(),
      detail: `${input.overdueLoans.toLocaleString()} overdue`,
      target: "loan-active",
    },
    {
      id: "pending-applications",
      label: "Pending applications",
      value: input.pendingApplications.toLocaleString(),
      detail: `${input.totalApplications.toLocaleString()} total applications`,
      target: "loan-applications",
    },
    {
      id: "disbursed",
      label: "Disbursed",
      value: formatNaira(input.totalDisbursed),
      detail: `${input.repaymentRate}% repaid`,
      target: "loan-disbursements",
    },
    {
      id: "repaid",
      label: "Repaid",
      value: formatNaira(input.totalRepaid),
      detail: "of disbursed recovered",
      target: "loan-repayments",
    },
    {
      id: "overdue",
      label: "Overdue loans",
      value: input.overdueLoans.toLocaleString(),
      detail: "loans in default",
      target: "loan-recovery",
    },
  ]
}

/**
 * What actually needs an administrator's attention. Each item appears only when at least one record
 * backs it, so a community with nothing outstanding gets an empty list rather than a list of
 * imaginary problems.
 */
export function attentionItems(input: DashboardInput): DashboardAttentionItem[] {
  const items: DashboardAttentionItem[] = []

  if (input.customersAwaitingApproval) {
    items.push({
      id: "customers",
      label: `${input.customersAwaitingApproval.toLocaleString()} ${input.customersAwaitingApproval === 1 ? "person is" : "people are"} waiting on approval`,
      category: "Membership",
      target: "members",
    })
  }
  if (input.pendingApplications) {
    items.push({
      id: "loans",
      label: `${input.pendingApplications.toLocaleString()} loan ${input.pendingApplications === 1 ? "application is" : "applications are"} awaiting review`,
      category: "Credit",
      target: "loan-applications",
    })
  }
  if (input.walletApprovalsPending) {
    items.push({
      id: "wallet",
      label: `${input.walletApprovalsPending.toLocaleString()} wallet withdrawal ${input.walletApprovalsPending === 1 ? "approval" : "approvals"} pending`,
      category: "Finance",
      target: "wallet",
    })
  }
  if (input.staffAwaitingSetup) {
    items.push({
      id: "staff",
      label:
        input.staffAwaitingSetup === 1
          ? "1 staff member hasn’t completed setup"
          : `${input.staffAwaitingSetup} staff members haven’t completed setup`,
      category: "Access",
      target: "administrators",
    })
  }
  if (!input.walletConnected) {
    items.push({
      id: "corporate",
      label: "Corporate wallet not connected",
      category: "Financial setup",
      target: "corporate",
    })
  }

  return items
}

/** A community with nothing in it gets a get-started panel instead of six cards reading zero. */
export function isEmptyCommunity(input: DashboardInput): boolean {
  return (
    input.customerCount === 0 &&
    input.activeLoans === 0 &&
    input.totalApplications === 0 &&
    input.activeEsusu === 0
  )
}

const TIME_OF_DAY = [
  { until: 12, greeting: "Good morning" },
  { until: 17, greeting: "Good afternoon" },
  { until: 24, greeting: "Good evening" },
]

export function greetingFor(hour: number): string {
  return TIME_OF_DAY.find((part) => hour < part.until)?.greeting ?? "Hello"
}

/**
 * The date line above the title, formatted from a real date rather than written in, so it cannot
 * disagree with the day the administrator is actually working.
 */
export function eyebrowFor(date: Date): string {
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" })
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })
  return `${weekday}, ${day}`.toUpperCase()
}
