import { useMemo, useState } from "react"
import { BadgeCheck, ClipboardCheck, Download, Pencil, ReceiptText, UserPlus } from "@/icons"
import { ShellPage } from "@/components/layout/ShellPage"
import { Badge, Button, Tabs } from "@/components/ui"
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/AsyncState"
import { DataTable, type DataTableColumn } from "@/components/data-display/DataTable"
import { FilterBar, SearchInput } from "@/components/data-display/ManagementPrimitives"
import { Panel, PagedTable, fmtDate, money } from "@/features/loans/components/LoanUi"
import { MemberWalletPanel } from "@/features/wallet"
import { FrequencyBadge } from "@/features/contributions/components/ContributionUi"
import { ParticipantStateBadge } from "@/features/dues/components/DuesUi"
import { EditMemberModal, useMember, useMemberMoney, useMembers } from "@/features/members"
import { useAuthorization } from "@/features/administrators/hooks/useAuthorization"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { useMemberApplications } from "../hooks/useMemberApplications"
import { RecordMemberPayment } from "./RecordMemberPayment"
import type { Member, View } from "@/types"
import type { LoanStatus } from "@/features/loans/types/loan.types"

const loanTones: Record<LoanStatus, "green" | "blue" | "amber" | "red" | "neutral"> = {
  Active: "blue",
  Current: "green",
  Overdue: "amber",
  Defaulted: "red",
  Completed: "green",
  "Written Off": "neutral",
}

const memberStatusTone = (status: Member["status"]): "green" | "amber" | "red" | "neutral" =>
  status === "Active" ? "green" : status === "Pending" ? "amber" : status === "Suspended" ? "red" : "neutral"

export function MembersPage({
  onImport,
  onProfile,
  onAdd,
  onApplications,
}: {
  onImport: () => void
  onProfile: (memberId: string) => void
  onAdd: () => void
  onApplications: () => void
}) {
  const [filter, setFilter] = useState("All members")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const organizationId = useOrganizationId()
  const { can } = useAuthorization()
  const { members, status, error, retry } = useMembers(organizationId)
  const applications = useMemberApplications(organizationId)
  const waiting = (applications.data?.applications ?? []).filter(
    (application) => application.status === "Submitted" || application.status === "Under Review",
  ).length

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return members.filter((member) => {
      const matchesQuery =
        !needle ||
        member.name.toLowerCase().includes(needle) ||
        member.id.toLowerCase().includes(needle) ||
        member.phone.toLowerCase().includes(needle)
      return matchesQuery && (filter === "All members" || member.status === filter)
    })
  }, [members, query, filter])

  if (status === "loading" || status === "idle") {
    return <LoadingState label="Loading members…" />
  }
  if (status === "error") {
    return <ErrorState message={error ?? "Members could not be loaded."} retry={retry} />
  }

  const columns: DataTableColumn<Member>[] = [
    {
      id: "member",
      header: "Member",
      render: (member) => (
        <div className="member-cell">
          <div className="mini-avatar">{member.initials}</div>
          <b>{member.name}</b>
        </div>
      ),
    },
    { id: "id", header: "Member ID", className: "mono", render: (member) => member.id },
    { id: "phone", header: "Phone", render: (member) => member.phone },
    { id: "group", header: "Group", render: (member) => member.group },
    {
      id: "status",
      header: "Status",
      render: (member) => <Badge tone={memberStatusTone(member.status)}>{member.status}</Badge>,
    },
    {
      id: "account",
      header: "Account",
      render: (member) => (
        <span className="account-state">
          <span
            className={
              member.accountStatus === "Activated" ? "active" : member.accountStatus === "Created" ? "created" : ""
            }
          />
          {member.accountStatus}
        </span>
      ),
    },
    { id: "joined", header: "Joined", render: (member) => member.joinedAt },
  ]

  return (
    <ShellPage
      title="Members"
      description="Every member's account, contributions, loans and wallet in one place."
      actions={
        <>
          {can("members.view_applications") && (
            <Button variant="secondary" icon={ClipboardCheck} onClick={onApplications}>
              Applications{waiting > 0 ? ` (${waiting})` : ""}
            </Button>
          )}
          {can("members.import") && (
            <Button variant="secondary" icon={Download} onClick={onImport}>
              Import members
            </Button>
          )}
          {can("members.create") && (
            <Button icon={UserPlus} onClick={onAdd}>
              Add member
            </Button>
          )}
        </>
      }
    >
      <div className="table-panel">
        <FilterBar>
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value)
              setPage(1)
            }}
            placeholder="Search name, member ID or phone"
          />
          <div className="toolbar-right">
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value)
                setPage(1)
              }}
            >
              <option>All members</option>
              <option>Active</option>
              <option>Pending</option>
              <option>Suspended</option>
            </select>
          </div>
        </FilterBar>
        <DataTable
          rows={visible.slice((page - 1) * 12, page * 12)}
          columns={columns}
          rowKey={(member) => member.id}
          onRowClick={(member) => onProfile(member.id)}
          page={page}
          pageSize={12}
          total={visible.length}
          onPageChange={setPage}
          empty={
            // An empty register and a filter that matched nothing are different situations.
            members.length === 0 ? (
              <EmptyState
                title="No members yet"
                description={
                  can("members.create")
                    ? "Add a member or import your register to start tracking contributions, dues and loans."
                    : "Nobody has been added to this community yet."
                }
                action={can("members.create") ? <Button onClick={onAdd}>Add member</Button> : undefined}
              />
            ) : (
              <EmptyState title="No members found" description="No member matches the search or the status filter." />
            )
          }
        />
      </div>
    </ShellPage>
  )
}

type ProfileTab = "overview" | "contributions" | "dues" | "loans" | "wallet" | "activity"

export function MemberProfile({
  memberId,
  navigate,
  notify,
}: {
  memberId: string
  navigate: (view: View, id?: string) => void
  notify: (text: string) => void
}) {
  const { member, status, error, retry } = useMember(memberId)

  if (status === "loading") {
    return <LoadingState label="Loading member…" />
  }
  if (status === "error") {
    return <ErrorState message={error ?? "This member could not be loaded."} retry={retry} />
  }
  if (!member) {
    return (
      <ShellPage
        level="detail"
        title="Member not found"
        description="This member no longer exists, or belongs to another organization."
      >
        <Panel title="Nothing to show">
          <p className="contribution-hint" style={{ padding: 14 }}>
            Open the members list to pick another member.
          </p>
        </Panel>
      </ShellPage>
    )
  }

  return <MemberProfileBody member={member} navigate={navigate} notify={notify} />
}

/**
 * One member, and only this member's money. Every slice is filtered by the id in the route, so a
 * member's contributions, loans and wallet can never show another member's records.
 */
function MemberProfileBody({
  member,
  navigate,
  notify,
}: {
  member: Member
  navigate: (view: View, id?: string) => void
  notify: (text: string) => void
}) {
  const memberMoney = useMemberMoney({ memberId: member.id, navigate, notify })
  const { can } = useAuthorization()
  const [tab, setTab] = useState<ProfileTab>("overview")
  const [paying, setPaying] = useState(false)
  const [editing, setEditing] = useState(false)
  const { summary, obligations } = memberMoney
  const loading = memberMoney.status === "loading"

  return (
    <>
      {editing && (
        <EditMemberModal
          member={member}
          onClose={() => setEditing(false)}
          notify={notify}
        />
      )}
      <ShellPage
        level="detail"
        title={member.name}
        description={`${member.group}${member.branchName ? ` · ${member.branchName}` : ""}`}
        meta={
          <>
            <span className="mono">{member.id}</span>
            <Badge tone={memberStatusTone(member.status)}>{member.status}</Badge>
            <Badge tone={member.accountStatus === "Activated" ? "green" : "neutral"}>
              Account {member.accountStatus.toLowerCase()}
            </Badge>
            {!loading && obligations.totalDue > 0 && (
              <Badge tone={obligations.overdueCount > 0 ? "red" : "amber"}>{money(obligations.totalDue)} due</Badge>
            )}
          </>
        }
        actions={
          <div className="header-actions">
            {can("members.update") && (
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                Edit member
              </Button>
            )}
            <Button variant="secondary" onClick={() => notify(`Statement link sent to ${member.name}`)}>
              Send statement
            </Button>
            <Button icon={ReceiptText} onClick={() => setPaying(true)} disabled={loading}>
              Record payment
            </Button>
          </div>
        }
      >
        <Tabs
          tabs={[
            { id: "overview" as ProfileTab, label: "Overview" },
            { id: "contributions" as ProfileTab, label: "Contributions", count: memberMoney.plans.length || undefined },
            { id: "dues" as ProfileTab, label: "Dues", count: memberMoney.duesPlans.length || undefined },
            { id: "loans" as ProfileTab, label: "Loans", count: memberMoney.loans.length || undefined },
            { id: "wallet" as ProfileTab, label: "Wallet" },
            { id: "activity" as ProfileTab, label: "Activity" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {memberMoney.status === "error" ? (
          <ErrorState
            message={memberMoney.error ?? "This member's money could not be loaded."}
            retry={memberMoney.retry}
          />
        ) : loading ? (
          <LoadingState label="Loading this member's money…" />
        ) : (
          <>
            {tab === "overview" && (
              <OverviewTab
                member={member}
                summary={summary}
                obligations={obligations.items}
                onRecord={() => setPaying(true)}
              />
            )}

            {tab === "contributions" && (
              <Panel
                title="Contributions"
                subtitle={`${memberMoney.plans.length} ${memberMoney.plans.length === 1 ? "plan" : "plans"} this member contributes to`}
              >
                <PagedTable
                  rows={memberMoney.plans}
                  rowKey={(plan) => plan.id}
                  onRowClick={(plan) => navigate("contribution-detail", plan.id)}
                  emptyText="This member is not on a contribution plan yet."
                  columns={[
                    {
                      id: "plan",
                      header: "Plan",
                      render: (plan) => {
                        const participant = memberMoney.participants.find((row) => row.contributionId === plan.id)
                        return (
                          <span className="member-cell">
                            <b>{plan.name}</b>
                            {participant && participant.missedCount > 0 && (
                              <Badge tone="red">{participant.missedCount} missed</Badge>
                            )}
                          </span>
                        )
                      },
                    },
                    { id: "frequency", header: "Frequency", render: (plan) => <FrequencyBadge contribution={plan} /> },
                    {
                      id: "contributed",
                      header: "Contributed",
                      render: (plan) =>
                        money(
                          memberMoney.participants.find((row) => row.contributionId === plan.id)?.totalContributed ?? 0,
                        ),
                    },
                    {
                      id: "balance",
                      header: "Balance",
                      render: (plan) =>
                        money(
                          memberMoney.participants.find((row) => row.contributionId === plan.id)?.availableBalance ?? 0,
                        ),
                    },
                    {
                      id: "expected",
                      header: "Expected",
                      render: (plan) =>
                        money(
                          memberMoney.participants.find((row) => row.contributionId === plan.id)?.expectedAmount ?? 0,
                        ),
                    },
                  ]}
                />
              </Panel>
            )}

            {tab === "loans" && (
              <Panel
                title="Loans"
                subtitle={`${memberMoney.loans.length} ${memberMoney.loans.length === 1 ? "loan" : "loans"} on record`}
              >
                <PagedTable
                  rows={memberMoney.loans}
                  rowKey={(loan) => loan.id}
                  onRowClick={(loan) => navigate("loan-detail", loan.id)}
                  emptyText="This member has no loans."
                  columns={[
                    {
                      id: "loan",
                      header: "Loan",
                      render: (loan) => (
                        <span className="member-cell">
                          <b>{loan.productName}</b>
                          <span className="mono">{loan.reference}</span>
                        </span>
                      ),
                    },
                    { id: "principal", header: "Principal", render: (loan) => money(loan.principal) },
                    { id: "outstanding", header: "Outstanding", render: (loan) => money(loan.outstanding) },
                    {
                      id: "next",
                      header: "Next due",
                      render: (loan) =>
                        loan.nextDueDate ? `${fmtDate(loan.nextDueDate)} · ${money(loan.nextDueAmount)}` : "—",
                    },
                    {
                      id: "status",
                      header: "Status",
                      render: (loan) => <Badge tone={loanTones[loan.status]}>{loan.status}</Badge>,
                    },
                  ]}
                />
              </Panel>
            )}

            {tab === "dues" && (
              <Panel
                title="Dues"
                subtitle={`${memberMoney.duesPlans.length} ${memberMoney.duesPlans.length === 1 ? "plan" : "plans"} this member owes dues on`}
              >
                <PagedTable
                  rows={memberMoney.duesPlans}
                  rowKey={(plan) => plan.id}
                  onRowClick={(plan) => navigate("dues-detail", plan.id)}
                  emptyText="This member is not on a dues plan yet."
                  columns={[
                    {
                      id: "plan",
                      header: "Plan",
                      render: (row) => (
                        <span className="member-cell">
                          <b>{row.name}</b>
                          <span>
                            {money(row.amount)} per {row.frequency === "One-time" ? "payment" : "period"}
                          </span>
                        </span>
                      ),
                    },
                    {
                      id: "paid",
                      header: "Paid",
                      render: (row) => money(memberMoney.duesTotalsFor(row.id)?.paid ?? 0),
                    },
                    {
                      id: "outstanding",
                      header: "Outstanding",
                      render: (row) => money(memberMoney.duesTotalsFor(row.id)?.outstanding ?? 0),
                    },
                    {
                      id: "state",
                      header: "Status",
                      render: (row) => {
                        const totals = memberMoney.duesTotalsFor(row.id)
                        return totals ? <ParticipantStateBadge state={totals.state} /> : <Badge tone="neutral">—</Badge>
                      },
                    },
                  ]}
                />
              </Panel>
            )}

            {tab === "wallet" && (
              <Panel
                title="Wallet"
                subtitle="The member's own money. Contributions and loan repayments are paid from here."
              >
                {memberMoney.wallet && memberMoney.walletCtx ? (
                  <MemberWalletPanel ctx={memberMoney.walletCtx} wallet={memberMoney.wallet} />
                ) : (
                  <EmptyState
                    title="No wallet yet"
                    description="A wallet opens the first time this member's money moves — the first funding, contribution or repayment."
                  />
                )}
              </Panel>
            )}

            {tab === "activity" && (
              <Panel title="Activity" subtitle="Every movement across this member's contributions, loans and wallet">
                <PagedTable
                  rows={memberMoney.activity}
                  rowKey={(row) => row.id}
                  emptyText="Nothing has moved for this member yet."
                  columns={[
                    { id: "when", header: "When", render: (row) => fmtDate(row.at) },
                    {
                      id: "what",
                      header: "What",
                      render: (row) => (
                        <span className="member-cell">
                          <b>{row.what}</b>
                          <span className="mono">{row.detail}</span>
                        </span>
                      ),
                    },
                    { id: "source", header: "Source", render: (row) => row.source },
                    {
                      id: "amount",
                      header: "Amount",
                      render: (row) => (
                        <span style={{ color: row.direction === "credit" ? "var(--green-text)" : "var(--ink)" }}>
                          {row.direction === "credit" ? "+" : "−"}
                          {money(row.amount)}
                        </span>
                      ),
                    },
                    { id: "status", header: "Status", render: (row) => <Badge tone="neutral">{row.status}</Badge> },
                  ]}
                />
              </Panel>
            )}
          </>
        )}
      </ShellPage>

      {paying && (
        <RecordMemberPayment
          memberName={member.name}
          obligations={obligations.items}
          walletBalance={memberMoney.wallet?.availableBalance ?? 0}
          hasWallet={Boolean(memberMoney.wallet)}
          mode={memberMoney.mode}
          pay={memberMoney.pay}
          onClose={() => setPaying(false)}
          notify={notify}
        />
      )}
    </>
  )
}

/** Identity, access, and the four figures that answer "where does this member stand?". */
function OverviewTab({
  member,
  summary,
  obligations,
  onRecord,
}: {
  member: Member
  summary: ReturnType<typeof useMemberMoney>["summary"]
  obligations: ReturnType<typeof useMemberMoney>["obligations"]["items"]
  onRecord: () => void
}) {
  const totalDue = obligations.reduce((sum, item) => sum + item.outstanding, 0)
  // Grouped by plan or loan: a member with 26 missed daily periods needs to see three things
  // that are behind, not thirty rows of the same plan.
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; total: number; overdue: boolean }>()
    for (const item of obligations) {
      const entry = map.get(item.title) ?? { title: item.title, total: 0, overdue: false }
      entry.total += item.outstanding
      entry.overdue = entry.overdue || item.overdue
      map.set(item.title, entry)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [obligations])

  return (
    <>
      {groups.length > 0 && (
        <div className="attention">
          <span className="attention-lead">
            <BadgeCheck size={15} />
            {money(totalDue)} due now
          </span>
          <div className="attention-items">
            {groups.slice(0, 3).map((group) => (
              <button
                type="button"
                className="attention-item"
                data-tone={group.overdue ? "red" : "amber"}
                key={group.title}
                onClick={onRecord}
              >
                {group.title}
                <b>{money(group.total)}</b>
              </button>
            ))}
            {groups.length > 3 && <span className="attention-clear">+{groups.length - 3} more</span>}
          </div>
        </div>
      )}

      <div className="profile-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <b>Member details</b>
              <span>Identity and organization placement</span>
            </div>
          </div>
          <div className="detail-grid">
            <div>
              <span>Phone</span>
              <b>{member.phone}</b>
            </div>
            <div>
              <span>Email</span>
              <b>{member.email ?? "Not recorded"}</b>
            </div>
            <div>
              <span>Branch</span>
              <b>{member.branchName ?? "Not assigned"}</b>
            </div>
            <div>
              <span>Group</span>
              <b>{member.group}</b>
            </div>
            <div>
              <span>Date joined</span>
              <b>{member.joinedAt}</b>
            </div>
            <div>
              <span>Member ID</span>
              <b className="mono">{member.id}</b>
            </div>
          </div>
        </section>

        <aside className="panel access-panel">
          <div className="panel-head">
            <div>
              <b>Account &amp; access</b>
              <span>Account does not equal login</span>
            </div>
          </div>
          <div className="access-row">
            <span>Digital account</span>
            <Badge tone={member.accountStatus === "Activated" ? "green" : "neutral"}>{member.accountStatus}</Badge>
          </div>
          <div className="access-row">
            <span>Login access</span>
            <Badge tone={member.accountStatus === "Activated" ? "green" : "neutral"}>
              {member.accountStatus === "Activated" ? "Activated" : "Not activated"}
            </Badge>
          </div>
          <div className="access-row">
            <span>Management mode</span>
            <b>Admin managed</b>
          </div>
          <div className="access-explain">
            <BadgeCheck size={17} />
            <span>This member can receive payment links and statements without signing in.</span>
          </div>
        </aside>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <b>Financial summary</b>
            <span>Figures from this member&apos;s own records</span>
          </div>
        </div>
        <div className="financial-summary">
          <div>
            <span>Contributions paid</span>
            <b>{money(summary.contributionsPaid)}</b>
            <small>{money(summary.contributionsExpected)} expected in total</small>
          </div>
          <div>
            <span>Contribution balance</span>
            <b>{money(summary.contributionBalance)}</b>
            <small>Available for payout</small>
          </div>
          <div>
            <span>Loans outstanding</span>
            <b>{money(summary.loansOutstanding)}</b>
            <small>
              {summary.activeLoans} active
              {summary.nextLoanDueDate ? ` · next ${fmtDate(summary.nextLoanDueDate)}` : ""}
            </small>
          </div>
          <div>
            <span>Wallet balance</span>
            <b>{money(summary.walletBalance)}</b>
            <small>This member&apos;s own money</small>
          </div>
        </div>
      </section>

      {summary.missedContributions > 0 && (
        <p className="contribution-hint">
          {summary.missedContributions} missed {summary.missedContributions === 1 ? "contribution" : "contributions"}. A
          missed contribution stays payable — the plan keeps running.
        </p>
      )}

      {summary.duesOutstanding > 0 && (
        <p className="contribution-hint">
          {money(summary.duesOutstanding)} of dues outstanding
          {summary.overdueDues > 0 ? `, ${summary.overdueDues} overdue` : ""}. Unpaid dues are recovered from this
          member&apos;s wallet when the plan&apos;s lien rules allow it.
        </p>
      )}
    </>
  )
}
