import { useMemo, useState } from "react"
import { ErrorState, LoadingState } from "@/components/feedback/AsyncState"
import { Button, Disclosure, SectionHeader } from "@/components/ui"
import { useAuthorization } from "@/features/administrators/hooks/useAuthorization"
import { Tabs } from "@/components/ui"
import { SearchInput } from "@/components/data-display/ManagementPrimitives"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { EntitySelectField } from "@/features/organization/components/EntitySelectField"
import {
  collectionHistory,
  commissionReport,
  contributionPerformance,
  contributorSummary,
  groupPerformance,
  missedContributionRows,
  pendingPayoutRows,
} from "../domain/reporting"
import { paymentMethodLabel, summarizeContributions } from "../domain/contribution.rules"
import { useContributions } from "../hooks/useContributions"
import { ContributionPage, Panel, PagedTable, Stats } from "../components/ContributionUi"
import { downloadCsv, fmtDate, money } from "@/features/loans/components/LoanUi"
import type { ContributionCtx, ContributionPageProps } from "../components/ContributionUi"
import { CONTRIBUTION_FORMS, CONTRIBUTION_PAYMENT_METHOD_IDS, CONTRIBUTION_TRANSACTION_STATUSES, CONTRIBUTION_TRANSACTION_TYPES, CONTRIBUTION_TYPES } from "../types/contribution.types"
import type { ContributionDataset, ContributionReportFilters } from "../types/contribution.types"

type Granularity = "daily" | "weekly" | "monthly"
type ReportTab = "collections" | "contributions" | "groups" | "contributors" | "missed" | "commissions"

const EMPTY_FILTERS: ContributionReportFilters = { contributionId: "", groupId: "", type: "All", form: "All", recipientKind: "All", from: "", to: "", transactionType: "All", status: "All", method: "All" }

export default function ContributionReportsPage({ embedded, ...props }: ContributionPageProps & { embedded?: boolean }) {
  if (embedded) return <EmbeddedReports />
  return <ContributionPage {...props}>{(ctx) => <ReportsBody data={ctx.data} can={ctx.can} today={ctx.today} />}</ContributionPage>
}

/** Used by the central Reports page, which already renders its own page shell and tabs. */
function EmbeddedReports() {
  const organizationId = useOrganizationId()
  const resource = useContributions(organizationId)
  const { can } = useAuthorization()
  if (resource.error) return <ErrorState message={resource.error} retry={resource.retry} />
  if (!resource.data) return <LoadingState label="Loading contribution reports…" />
  return <ReportsBody data={resource.data} can={can} today={resource.today} embedded />
}

function ReportsBody({ data, can, today, embedded }: { data: ContributionDataset; can: ContributionCtx["can"]; today: string; embedded?: boolean }) {
  const [filters, setFilters] = useState<ContributionReportFilters>(EMPTY_FILTERS)
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<ReportTab>("collections")
  const [granularity, setGranularity] = useState<Granularity>("monthly")

  const patch = (values: Partial<ContributionReportFilters>) => setFilters((current) => ({ ...current, ...values }))
  const scoped = useMemo(
    () => ({ ...filters, from: filters.from || undefined, to: filters.to || undefined, contributionId: filters.contributionId || undefined, groupId: filters.groupId || undefined, minAmount: filters.minAmount, maxAmount: filters.maxAmount }),
    [filters],
  )

  const groups = useMemo(() => [...new Set(data.contributions.map((c) => c.groupId).filter(Boolean))] as string[], [data.contributions])
  const summary = useMemo(() => summarizeContributions(data), [data])

  const collections = useMemo(() => collectionHistory(data, granularity, scoped), [data, granularity, scoped])
  const contributions = useMemo(() => contributionPerformance(data, scoped), [data, scoped])
  const groupsRows = useMemo(() => groupPerformance(data), [data])
  const contributors = useMemo(() => contributorSummary(data, scoped), [data, scoped])
  const missed = useMemo(() => missedContributionRows(data), [data])
  const commissions = useMemo(() => commissionReport(data, scoped), [data, scoped])
  const pending = useMemo(() => pendingPayoutRows(data), [data])

  const nameFor = (id?: string) => data.contributions.find((c) => c.id === id)?.name ?? "—"

  const exportCurrent = () => {
    if (tab === "collections") {
      return downloadCsv("contribution-collections", ["Period", "Collected", "Movements"], collections.map((row) => [row.period ?? row.label, row.collected, row.contributors ?? 0]))
    }
    if (tab === "contributions") {
      return downloadCsv("contribution-performance", ["Contribution", "Group", "Contributors", "Collected", "Withdrawn", "Commission", "Net payout", "Available", "Missed"], contributions.map((row) => [row.label, row.groupName ?? "", row.contributors ?? 0, row.collected, row.withdrawn, row.commission, row.netPayout, row.balance, row.missed ?? 0]))
    }
    if (tab === "groups") {
      return downloadCsv("contribution-groups", ["Group", "Contributors", "Collected", "Withdrawn", "Commission", "Available", "Missed"], groupsRows.map((row) => [row.label, row.contributors ?? 0, row.collected, row.withdrawn, row.commission, row.balance, row.missed ?? 0]))
    }
    if (tab === "contributors") {
      return downloadCsv("contribution-contributors", ["Contributor", "Member", "Contribution", "Contributed", "Expected per period", "Outstanding", "Available", "Missed", "Late", "State"], contributors.map((row) => [row.participant.memberName, row.participant.memberCode ?? "", row.contribution?.name ?? "", row.participant.totalContributed, row.participant.expectedAmount, row.outstanding, row.participant.availableBalance, row.participant.missedCount, row.participant.lateCount, row.participant.state]))
    }
    if (tab === "missed") {
      return downloadCsv("contribution-missed", ["Contributor", "Contribution", "Period", "Paid", "Outstanding"], missed.map((row) => [row.label, row.contributionName ?? "", row.period ?? "", row.collected, row.balance]))
    }
    return downloadCsv("contribution-commissions", ["Reference", "Contribution", "Gross", "Commission", "Net payout", "Completed"], commissions.map((row) => [row.label, row.contributionName ?? "", row.collected, row.commission, row.netPayout, row.period ?? ""]))
  }

  return (
    <>
      {!embedded && <SectionHeader eyebrow="REPORTS" title="Contribution reports" description="Collections, balances, commissions and payouts across every contribution." />}

      <Panel
        title="Filters"
        subtitle="Filter by contribution, who contributed, type, form or status. Everything else is optional."
        actions={
          <div className="header-actions">
            <Button variant="secondary" onClick={() => { setFilters(EMPTY_FILTERS); setQuery("") }}>Reset</Button>
            {can("contributions.export") && <Button variant="secondary" onClick={exportCurrent}>CSV / Excel</Button>}
          </div>
        }
      >
        <div className="contribution-filters contribution-filters-wide">
          <SearchInput value={query} onChange={setQuery} placeholder="Search contribution or contributor" />
          <label className="field">
            <span>Contribution</span>
            <select value={filters.contributionId ?? ""} onChange={(event) => patch({ contributionId: event.target.value })}>
              <option value="">All contributions</option>
              {data.contributions.map((contribution) => <option key={contribution.id} value={contribution.id}>{contribution.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Works as</span>
            <select value={filters.form ?? "All"} onChange={(event) => patch({ form: event.target.value as ContributionReportFilters["form"] })}>
              <option value="All">General and Personal</option>
              {CONTRIBUTION_FORMS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Type</span>
            <select value={filters.type ?? "All"} onChange={(event) => patch({ type: event.target.value as ContributionReportFilters["type"] })}>
              {["All", ...CONTRIBUTION_TYPES].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={filters.status ?? "All"} onChange={(event) => patch({ status: event.target.value as ContributionReportFilters["status"] })}>
              {["All", ...CONTRIBUTION_TRANSACTION_STATUSES].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        </div>

        <Disclosure label="More filters">
          <div className="contribution-filters contribution-filters-wide">
            <EntitySelectField entity="group" label="Group" value={filters.groupId ?? ""} placeholder="All groups" options={groups.map((group) => ({ value: group, label: data.contributions.find((c) => c.groupId === group)?.groupName ?? group }))} onChange={(groupId) => patch({ groupId })} />
            <label className="field">
              <span>Recipient</span>
              <select value={filters.recipientKind ?? "All"} onChange={(event) => patch({ recipientKind: event.target.value as ContributionReportFilters["recipientKind"] })}>
                <option value="All">All recipients</option>
                <option value="organization">Organization account</option>
                <option value="member">Member account</option>
                <option value="customer">Customer account</option>
                <option value="contributor">Each contributor</option>
              </select>
            </label>
            <label className="field">
              <span>Transaction type</span>
              <select value={filters.transactionType ?? "All"} onChange={(event) => patch({ transactionType: event.target.value as ContributionReportFilters["transactionType"] })}>
                {["All", ...CONTRIBUTION_TRANSACTION_TYPES].map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Payment method</span>
              <select value={filters.method ?? "All"} onChange={(event) => patch({ method: event.target.value as ContributionReportFilters["method"] })}>
                <option value="All">All methods</option>
                {CONTRIBUTION_PAYMENT_METHOD_IDS.map((id) => <option key={id} value={id}>{paymentMethodLabel(id)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>From</span>
              <input type="date" value={filters.from ?? ""} onChange={(event) => patch({ from: event.target.value })} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" value={filters.to ?? ""} onChange={(event) => patch({ to: event.target.value })} />
            </label>
            <label className="field">
              <span>Min amount</span>
              <input type="number" min={0} value={filters.minAmount ?? ""} onChange={(event) => patch({ minAmount: event.target.value === "" ? undefined : Number(event.target.value) })} />
            </label>
            <label className="field">
              <span>Max amount</span>
              <input type="number" min={0} value={filters.maxAmount ?? ""} onChange={(event) => patch({ maxAmount: event.target.value === "" ? undefined : Number(event.target.value) })} />
            </label>
          </div>
        </Disclosure>
        {query && <p className="contribution-hint">Search applies to the {tab} table.</p>}
      </Panel>

      <Stats
        items={[
          { label: "Total collected", value: money(summary.totalCollected) },
          { label: "Current balances", value: money(summary.availableBalance) },
          { label: "Pending payouts", value: money(summary.pendingPayouts), detail: `${summary.pendingPayoutCount} awaiting` },
          { label: "Missed contributions", value: summary.missedContributions, tone: summary.missedContributions ? "red" : undefined },
        ]}
      />

      <Tabs
        tabs={[
          { id: "collections" as ReportTab, label: "Collections" },
          { id: "contributions" as ReportTab, label: "By contribution" },
          { id: "groups" as ReportTab, label: "By group" },
          { id: "contributors" as ReportTab, label: "By contributor" },
          { id: "missed" as ReportTab, label: "Missed", count: missed.length },
          { id: "commissions" as ReportTab, label: "Commissions & payouts" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ height: 12 }} />

      {tab === "collections" && (
        <Panel
          title="Collection history"
          subtitle={`Collected today: ${fmtDate(today)} · grouped by ${granularity}`}
          actions={
            <div className="contribution-filters">
              <select value={granularity} onChange={(event) => setGranularity(event.target.value as Granularity)} aria-label="Group collections by">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          }
        >
          <PagedTable
            rows={collections}
            rowKey={(row) => row.id}
            pageSize={12}
            emptyText="No collections match these filters."
            columns={[
              { id: "period", header: "Period", render: (row) => row.period ?? row.label },
              { id: "collected", header: "Collected", render: (row) => money(row.collected) },
              { id: "movements", header: "Movements", render: (row) => row.contributors ?? 0 },
            ]}
          />
        </Panel>
      )}

      {tab === "contributions" && (
        <Panel title="Contribution performance" subtitle="Contribution-by-contribution reporting">
          <PagedTable
            rows={contributions}
            rowKey={(row) => row.id}
            pageSize={10}
            emptyText="No contributions yet."
            columns={[
              { id: "name", header: "Contribution", render: (row) => <b>{row.label}</b> },
              { id: "contributors", header: "Contributors", render: (row) => row.contributors ?? 0 },
              { id: "collected", header: "Collected", render: (row) => money(row.collected) },
              { id: "withdrawn", header: "Withdrawn", render: (row) => money(row.withdrawn) },
              { id: "balance", header: "Current balance", render: (row) => money(row.balance) },
              { id: "missed", header: "Missed", render: (row) => row.missed ?? 0 },
            ]}
          />
        </Panel>
      )}

      {tab === "groups" && (
        <Panel title="Group performance" subtitle="Collections rolled up per group">
          <PagedTable
            rows={groupsRows}
            rowKey={(row) => row.id}
            pageSize={10}
            emptyText="No groups have contributions yet."
            columns={[
              { id: "group", header: "Group", render: (row) => <b>{row.label}</b> },
              { id: "contributors", header: "Contributors", render: (row) => row.contributors ?? 0 },
              { id: "collected", header: "Collected", render: (row) => money(row.collected) },
              { id: "withdrawn", header: "Withdrawn", render: (row) => money(row.withdrawn) },
              { id: "commission", header: "Commission", render: (row) => money(row.commission) },
              { id: "balance", header: "Current balance", render: (row) => money(row.balance) },
              { id: "missed", header: "Missed", render: (row) => row.missed ?? 0 },
            ]}
          />
        </Panel>
      )}

      {tab === "contributors" && (
        <Panel title="Customer contribution history" subtitle="Contributed, expected, outstanding and available per contributor">
          <PagedTable
            rows={contributors.filter((row) => (query ? row.participant.memberName.toLowerCase().includes(query.toLowerCase()) : true))}
            rowKey={(row) => row.participant.id}
            pageSize={12}
            emptyText="No contributors match these filters."
            columns={[
              { id: "name", header: "Contributor", render: (row) => <>{row.participant.memberName}{row.participant.isExternal && <div className="contribution-sub">Public contributor</div>}</> },
              { id: "contribution", header: "Contribution", render: (row) => row.contribution?.name ?? "—" },
              { id: "contributed", header: "Contributed", render: (row) => money(row.participant.totalContributed) },
              { id: "outstanding", header: "Outstanding", render: (row) => <span className={row.outstanding ? "contribution-debit" : ""}>{money(row.outstanding)}</span> },
              { id: "available", header: "Available", render: (row) => money(row.participant.availableBalance) },
              { id: "state", header: "State", render: (row) => row.participant.state },
            ]}
          />
        </Panel>
      )}

      {tab === "missed" && (
        <Panel title="Missed and late contributions" subtitle="Expected, paid, missed, late and partially paid periods">
          <PagedTable
            rows={missed}
            rowKey={(row) => row.id}
            pageSize={12}
            emptyText="No missed contributions — every period is settled."
            columns={[
              { id: "contributor", header: "Contributor", render: (row) => row.label },
              { id: "contribution", header: "Contribution", render: (row) => nameFor(row.contributionId) },
              { id: "period", header: "Period", render: (row) => row.period ?? "—" },
              { id: "paid", header: "Paid so far", render: (row) => money(row.collected) },
              { id: "outstanding", header: "Outstanding", render: (row) => <span className="contribution-debit">{money(row.balance)}</span> },
              { id: "state", header: "Missed", render: (row) => (row.missed ? "Yes" : "Late / partial") },
            ]}
          />
        </Panel>
      )}

      {tab === "commissions" && (
        <>
          <Panel title="Commission and net payouts" subtitle="Commission deducted on each completed payout">
            <PagedTable
              rows={commissions}
              rowKey={(row) => row.id}
              pageSize={10}
              emptyText="No completed payouts match these filters."
              columns={[
                { id: "reference", header: "Reference", render: (row) => <span className="mono">{row.label}</span> },
                { id: "contribution", header: "Contribution", render: (row) => row.contributionName ?? "—" },
                { id: "gross", header: "Gross", render: (row) => money(row.collected) },
                { id: "commission", header: "Commission", render: (row) => money(row.commission) },
                { id: "net", header: "Net payout", render: (row) => <b>{money(row.netPayout)}</b> },
                { id: "completed", header: "Completed", render: (row) => (row.period ? fmtDate(row.period) : "—") },
              ]}
            />
          </Panel>
          <Panel title="Pending payouts" subtitle="Awaiting approval or a scheduled date">
            <PagedTable
              rows={pending}
              rowKey={(row) => row.id}
              pageSize={8}
              emptyText="No payouts pending."
              columns={[
                { id: "reference", header: "Reference", render: (row) => <span className="mono">{row.label}</span> },
                { id: "contribution", header: "Contribution", render: (row) => row.contributionName ?? "—" },
                { id: "gross", header: "Gross", render: (row) => money(row.collected) },
                { id: "commission", header: "Commission", render: (row) => money(row.commission) },
                { id: "net", header: "Net payout", render: (row) => money(row.netPayout) },
                { id: "when", header: "Scheduled / requested", render: (row) => (row.period ? fmtDate(row.period) : "—") },
              ]}
            />
          </Panel>
        </>
      )}
    </>
  )
}
