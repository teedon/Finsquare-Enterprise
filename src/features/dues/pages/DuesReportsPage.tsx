import { useMemo, useState } from "react"
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/AsyncState"
import { SectionHeader } from "@/components/ui"
import { Button, ExportButtons, PagedTable, Panel } from "../components/DuesUi"
import { useDues } from "../hooks/useDues"
import { useParticipantRoster } from "../hooks/useParticipantRoster"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { EntitySelectField } from "@/features/organization/components/EntitySelectField"
import {
  collectionHistory,
  manualPaymentRows,
  memberPaymentHistory,
  outstandingRows,
  overdueRows,
  planPerformance,
  walletRecoveryRows,
} from "../domain/reporting"
import { downloadCsv, fmtDate, money } from "@/features/loans/components/LoanUi"
import { printTable } from "@/features/wallet/domain/export"
import { DUES_PAYMENT_METHODS, DUES_PAYMENT_METHOD_LABELS, DUES_PAYMENT_STATUSES } from "../types/dues.types"
import type { DuesDataset, DuesReportFilters, DuesReportRow } from "../types/dues.types"
type ReportId = "collections" | "plans" | "outstanding" | "overdue" | "recoveries" | "manual" | "member"
const REPORTS: {
  id: ReportId
  label: string
  blurb: string
}[] = [
  {
    id: "collections",
    label: "Collection history",
    blurb: "Money received, month by month.",
  },
  {
    id: "plans",
    label: "Plan performance",
    blurb: "Every plan's collections and outstanding balance.",
  },
  {
    id: "outstanding",
    label: "Outstanding balances",
    blurb: "Who still owes, and how much.",
  },
  {
    id: "overdue",
    label: "Overdue dues",
    blurb: "Individual charges past their due date.",
  },
  {
    id: "recoveries",
    label: "Wallet deductions",
    blurb: "What the wallet lien collected.",
  },
  {
    id: "manual",
    label: "Manual payments",
    blurb: "Cash and bank transfers recorded by hand.",
  },
  {
    id: "member",
    label: "Member payment history",
    blurb: "One member's dues movements.",
  },
]
const EMPTY_FILTERS: DuesReportFilters = { method: "All", status: "All" }
/**
 * Dues reporting for the central Reports page.
 *
 * Every figure comes from the same ledger the module works from, so a report can never disagree
 * with the plan it describes. A group filter is resolved to member ids by the same hook the create
 * form uses, which is why it needs no group repository of its own.
 */
export default function DuesReportsPage({ embedded }: { embedded?: boolean }) {
  const organizationId = useOrganizationId()
  const resource = useDues(organizationId)
  if (resource.error) return <ErrorState message={resource.error} retry={resource.retry} />
  if (!resource.data) return <LoadingState label="Loading dues reports…" />
  return <ReportsBody ctx={resource} dataset={resource.data} embedded={embedded} />
}
function ReportsBody({
  ctx,
  dataset,
  embedded,
}: {
  ctx: ReturnType<typeof useDues>
  dataset: DuesDataset
  embedded?: boolean
}) {
  const [report, setReport] = useState<ReportId>("collections")
  const [filters, setFilters] = useState<DuesReportFilters>(EMPTY_FILTERS)
  const [groupFilter, setGroupFilter] = useState("")
  const groupScope = useParticipantRoster({
    scope: "Group",
    memberIds: [],
    groupId: groupFilter || undefined,
    status: "All",
  })
  const memberIds = groupFilter ? groupScope.roster.map((entry) => entry.memberId) : undefined
  const active = REPORTS.find((candidate) => candidate.id === report) ?? REPORTS[0]
  const patch = (values: Partial<DuesReportFilters>) => setFilters((current) => ({ ...current, ...values }))
  const members = useMemo(() => {
    const byId = new Map<string, string>()
    for (const participant of dataset.participants) byId.set(participant.memberId, participant.memberName)
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [dataset.participants])
  const branches = useMemo(() => {
    const byId = new Map<string, string>()
    for (const participant of dataset.participants) {
      if (participant.branchId) byId.set(participant.branchId, participant.branchName ?? participant.branchId)
    }
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [dataset.participants])
  const rows: DuesReportRow[] = useMemo(() => {
    switch (report) {
      case "collections":
        return collectionHistory(dataset, filters, memberIds)
      case "plans":
        return planPerformance(dataset, ctx.today)
      case "outstanding":
        return outstandingRows(dataset, filters, ctx.today, memberIds)
      case "overdue":
        return overdueRows(dataset, filters, ctx.today, memberIds)
      case "recoveries":
        return walletRecoveryRows(dataset, filters, memberIds)
      case "manual":
        return manualPaymentRows(dataset, filters, memberIds)
      case "member":
        return filters.memberId ? memberPaymentHistory(dataset, filters.memberId) : []
    }
  }, [report, dataset, filters, memberIds, ctx.today])
  const totals = rows.reduce((sum, row) => sum + row.amount, 0)
  const transactionReport = report === "recoveries" || report === "manual" || report === "member"
  const headers = transactionReport
    ? ["Reference", "Member", "Plan", "Period", "Date", "Amount", "Method", "Status"]
    : ["Label", "Member", "Plan", "Period", "Due date", "Amount", "Paid", "Outstanding", "Status"]
  const csvRows = () =>
    rows.map((row) =>
      transactionReport
        ? [
            row.label,
            row.memberName ?? "",
            row.duesPlanName ?? "",
            row.period ?? "",
            row.dueDate ?? "",
            row.amount,
            row.method ?? "",
            row.status ?? "",
          ]
        : [
            row.label,
            row.memberName ?? "",
            row.duesPlanName ?? "",
            row.period ?? "",
            row.dueDate ?? "",
            row.amount,
            row.paid,
            row.outstanding,
            row.status ?? "",
          ],
    )
  return (
    <>
      {!embedded && (
        <SectionHeader
          eyebrow="REPORTS"
          title="Dues reports"
          description="Collections, outstanding balances, wallet deductions and manual payments across every plan."
        />
      )}

      <Panel
        title={active.label}
        subtitle={`${active.blurb} ${rows.length} ${rows.length === 1 ? "row" : "rows"} · ${money(totals)}`}
        actions={
          <div className="contribution-filters">
            <select value={report} onChange={(event) => setReport(event.target.value as ReportId)} aria-label="Report">
              {REPORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <ExportButtons
              disabled={rows.length === 0}
              onCsv={() => downloadCsv(`dues-${report}`, headers, csvRows())}
              onPdf={() => printTable(`Dues — ${active.label}`, headers, csvRows())}
            />
          </div>
        }
      >
        <div className="table-toolbar management-filter-bar">
          <label className="field">
            <span>From</span>
            <input
              type="date"
              value={filters.from ?? ""}
              onChange={(event) => patch({ from: event.target.value || undefined })}
            />
          </label>
          <label className="field">
            <span>To</span>
            <input
              type="date"
              value={filters.to ?? ""}
              onChange={(event) => patch({ to: event.target.value || undefined })}
            />
          </label>
          <label className="field">
            <span>Plan</span>
            <select
              value={filters.duesPlanId ?? ""}
              onChange={(event) => patch({ duesPlanId: event.target.value || undefined })}
            >
              <option value="">Every plan</option>
              {dataset.plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Member</span>
            <select
              value={filters.memberId ?? ""}
              onChange={(event) => patch({ memberId: event.target.value || undefined })}
            >
              <option value="">Every member</option>
              {members.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <EntitySelectField entity="group" label="Group" value={groupFilter} placeholder="Every group" options={groupScope.groups.map((group) => ({ value: group.id, label: group.name }))} onChange={setGroupFilter} />
          <EntitySelectField entity="branch" label="Branch" value={filters.branchId ?? ""} placeholder="Every branch" options={branches.map(([id, name]) => ({ value: id, label: name }))} onChange={(branchId) => patch({ branchId: branchId || undefined })} />
          <label className="field">
            <span>Status</span>
            <select
              value={filters.status ?? "All"}
              onChange={(event) =>
                patch({
                  status: event.target.value as DuesReportFilters["status"],
                })
              }
            >
              <option value="All">Any status</option>
              {DUES_PAYMENT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Method</span>
            <select
              value={filters.method ?? "All"}
              onChange={(event) =>
                patch({
                  method: event.target.value as DuesReportFilters["method"],
                })
              }
            >
              <option value="All">Any method</option>
              {DUES_PAYMENT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {DUES_PAYMENT_METHOD_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Min amount</span>
            <input
              type="number"
              min={0}
              value={filters.minAmount ?? ""}
              onChange={(event) =>
                patch({
                  minAmount: event.target.value === "" ? undefined : Number(event.target.value),
                })
              }
            />
          </label>
          <label className="field">
            <span>Max amount</span>
            <input
              type="number"
              min={0}
              value={filters.maxAmount ?? ""}
              onChange={(event) =>
                patch({
                  maxAmount: event.target.value === "" ? undefined : Number(event.target.value),
                })
              }
            />
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              setFilters(EMPTY_FILTERS)
              setGroupFilter("")
            }}
          >
            Clear filters
          </Button>
        </div>

        {report === "member" && !filters.memberId ? (
          <EmptyState
            title="Choose a member"
            description="Member payment history is about one member's dues movements."
          />
        ) : (
          <PagedTable
            rows={rows}
            rowKey={(row) => row.id}
            pageSize={12}
            emptyText="No dues match these filters."
            columns={
              transactionReport
                ? [
                    {
                      id: "reference",
                      header: "Reference",
                      render: (row: DuesReportRow) => (
                        <>
                          <b className="mono">{row.label}</b>
                          {row.dueDate && <div className="contribution-sub">{fmtDate(row.dueDate)}</div>}
                        </>
                      ),
                    },
                    {
                      id: "member",
                      header: "Member",
                      render: (row: DuesReportRow) => row.memberName ?? "—",
                    },
                    {
                      id: "plan",
                      header: "Plan",
                      render: (row: DuesReportRow) => (
                        <span className="contribution-sub">{row.duesPlanName ?? "—"}</span>
                      ),
                    },
                    {
                      id: "period",
                      header: "Period",
                      render: (row: DuesReportRow) => <span className="mono">{row.period ?? "—"}</span>,
                    },
                    {
                      id: "amount",
                      header: "Amount",
                      render: (row: DuesReportRow) => money(row.amount),
                    },
                    {
                      id: "method",
                      header: "Method",
                      render: (row: DuesReportRow) =>
                        row.method
                          ? DUES_PAYMENT_METHOD_LABELS[row.method as keyof typeof DUES_PAYMENT_METHOD_LABELS]
                          : "—",
                    },
                    {
                      id: "status",
                      header: "Status",
                      render: (row: DuesReportRow) => row.status ?? "—",
                    },
                  ]
                : [
                    {
                      id: "label",
                      header: "What",
                      render: (row: DuesReportRow) => (
                        <>
                          <b>{row.memberName ?? row.label}</b>
                          {row.memberName && row.label !== row.memberName && (
                            <div className="contribution-sub">{row.label}</div>
                          )}
                        </>
                      ),
                    },
                    {
                      id: "plan",
                      header: "Plan",
                      render: (row: DuesReportRow) => (
                        <span className="contribution-sub">{row.duesPlanName ?? "—"}</span>
                      ),
                    },
                    {
                      id: "period",
                      header: "Period",
                      render: (row: DuesReportRow) => <span className="mono">{row.period ?? "—"}</span>,
                    },
                    {
                      id: "due",
                      header: "Due",
                      render: (row: DuesReportRow) => (row.dueDate ? fmtDate(row.dueDate) : "—"),
                    },
                    {
                      id: "amount",
                      header: "Amount",
                      render: (row: DuesReportRow) => money(row.amount),
                    },
                    {
                      id: "paid",
                      header: "Paid",
                      render: (row: DuesReportRow) => money(row.paid),
                    },
                    {
                      id: "outstanding",
                      header: "Outstanding",
                      render: (row: DuesReportRow) =>
                        row.outstanding > 0 ? <b>{money(row.outstanding)}</b> : money(0),
                    },
                    {
                      id: "status",
                      header: "Status",
                      render: (row: DuesReportRow) =>
                        row.status ?? (row.count !== undefined ? `${row.count} movements` : "—"),
                    },
                  ]
            }
          />
        )}
      </Panel>
    </>
  )
}
