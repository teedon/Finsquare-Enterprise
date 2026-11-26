import {
  Banknote,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  HandCoins,
  Landmark,
  LockKeyhole,
  Plus,
  ReceiptText,
  UserCog,
  UserPlus,
  Users,
} from "@/icons"
import { Button, Badge, SectionHeader } from "@/components/ui"
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/AsyncState"
import { env } from "@/app/config/env"
import { useAuthorization } from "@/features/administrators/hooks/useAuthorization"
import { useDashboard } from "./hooks/useDashboard"
import { useApiDashboard } from "./hooks/useApiDashboard"
import type { DashboardData, Metric } from "./domain/dashboard"
import type { View } from "@/types"

const METRIC_ICONS: Record<Metric["id"], typeof Users> = {
  customers: Users,
  "active-loans": Banknote,
  "pending-applications": ClipboardCheck,
  disbursed: HandCoins,
  repaid: ReceiptText,
  overdue: Clock3,
}

/** Attention items read differently from the metric cards, so they get their own icons. */
const ATTENTION_ICONS: Record<string, typeof Clock3> = {
  corporate: Landmark,
  wallet: HandCoins,
  staff: UserCog,
  loans: Banknote,
  customers: Users,
}

/**
 * The overview of the active community.
 *
 * Every figure comes from the records that community actually has — nothing here is written in — so
 * switching communities changes the numbers, and a community with no records gets a get-started panel
 * instead of six cards reading zero.
 */
interface DashboardProps {
  live: boolean
  setView: (v: View) => void
  onImport: () => void
  administratorName: string
  organizationName: string
}

/** Presentational shell: renders whichever `DashboardData` the active source produced. */
function DashboardView({
  data,
  live,
  setView,
  administratorName,
  organizationName,
}: DashboardProps & { data: DashboardData }) {
  const { status, error, retry, metrics, attention, latestCustomers, hasNoRecords, eyebrow, greeting } = data
  const { can } = useAuthorization()

  return (
    <div className="page">
      <SectionHeader
        eyebrow={eyebrow}
        title="Overview"
        description={`${greeting}, ${administratorName}. Here’s what is happening with ${organizationName}.`}
        actions={
          can("members.create") ? (
            <Button icon={Plus} onClick={() => setView("members")}>
              Add member
            </Button>
          ) : undefined
        }
      />

      {status === "error" && <ErrorState message={error ?? "The overview could not be loaded."} retry={retry} />}
      {status === "loading" && <LoadingState label="Loading overview…" />}

      {status === "success" && hasNoRecords && (
        <section className="panel" style={{ padding: 20 }}>
          <EmptyState
            title="Nothing here yet"
            description={`${organizationName} has no members, loans or savings groups yet. Start by adding a member.`}
          />
          <div className="quick-grid" style={{ marginTop: 14 }}>
            {can("members.create") && (
              <button type="button" onClick={() => setView("members")}>
                <UserPlus size={17} />
                Add member
              </button>
            )}
            {can("loan_products.create") && (
              <button type="button" onClick={() => setView("loan-products")}>
                <Banknote size={17} />
                Create loan product
              </button>
            )}
            {can("administrators.invite") && (
              <button type="button" onClick={() => setView("administrators")}>
                <UserCog size={17} />
                Invite staff
              </button>
            )}
            {can("wallet.view") && (
              <button type="button" onClick={() => setView("wallet")}>
                <Landmark size={17} />
                Setup wallet
              </button>
            )}
          </div>
        </section>
      )}

      {status === "success" && !hasNoRecords && (
        <>
          <div className="stat-grid">
            {metrics.map((metric) => {
              const Icon = METRIC_ICONS[metric.id]
              return (
                <button type="button" className="stat-card" key={metric.id} onClick={() => setView(metric.target)}>
                  <div className="stat-top">
                    <span>{metric.label}</span>
                    <Icon size={16} />
                  </div>
                  <div className="stat-value">{metric.value}</div>
                  <div className="stat-sub">{metric.detail}</div>
                </button>
              )
            })}
          </div>
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <b>Needs attention</b>
                  <span>Items that may block progress at {organizationName}</span>
                </div>
                {attention.length > 0 && <Badge tone="amber">{attention.length} open</Badge>}
              </div>
              {attention.length === 0 ? (
                <EmptyState
                  title="Nothing needs you"
                  description="No approvals, applications or setup steps are waiting."
                />
              ) : (
                <div className="attention-list">
                  {attention.map((item) => {
                    const Icon = ATTENTION_ICONS[item.id] ?? Clock3
                    return (
                      <button type="button" key={item.id} onClick={() => setView(item.target)}>
                        <div className="attention-icon">
                          <Icon size={16} />
                        </div>
                        <div>
                          <b>{item.label}</b>
                          <span>{item.category}</span>
                        </div>
                        <ChevronRight size={15} />
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
            <section className="panel quick-panel">
              <div className="panel-head">
                <div>
                  <b>Quick actions</b>
                  <span>Common organization tasks</span>
                </div>
              </div>
              <div className="quick-grid">
                <button type="button" onClick={() => setView("members")}>
                  <UserPlus size={17} />
                  Add member
                </button>
                <button type="button" onClick={() => setView("loan-applications")}>
                  <ClipboardCheck size={17} />
                  Review applications
                </button>
                <button type="button" onClick={() => setView("loan-products")}>
                  <Banknote size={17} />
                  Create loan product
                </button>
                <button type="button" onClick={() => setView("administrators")}>
                  <UserCog size={17} />
                  Invite staff
                </button>
                <button type="button" onClick={() => setView("wallet")}>
                  <Landmark size={17} />
                  Manage wallet
                </button>
              </div>
              <div className={`transaction-note ${live ? "enabled" : ""}`}>
                <div>
                  <LockKeyhole size={15} />
                  <span>
                    <b>{live ? "Financial actions are enabled" : "Financial actions are not enabled yet"}</b>
                    <small>
                      {live
                        ? "You can record payments and create transfers."
                        : "Configuration is saved, but no money can move yet."}
                    </small>
                  </span>
                </div>
                <Button variant="secondary" onClick={() => setView(live ? "wallet" : "corporate")}>
                  {live ? "Record payment" : "View requirements"}
                </Button>
              </div>
            </section>
          </div>
          <section className="panel recent-panel">
            <div className="panel-head">
              <div>
                <b>Latest members</b>
                <span>The most recently added members at {organizationName}</span>
              </div>
              {latestCustomers.length > 0 && (
                <Button variant="ghost" onClick={() => setView("members")}>
                  View all
                </Button>
              )}
            </div>
            {latestCustomers.length === 0 ? (
              <EmptyState title="No members yet" description="Members you add will appear here." />
            ) : (
              latestCustomers.map((customer) => (
                <div className="activity-row" key={customer.id}>
                  <div className="activity-dot blue">
                    <Users size={14} />
                  </div>
                  <div>
                    <b>{customer.name}</b>
                    <span>{customer.status}</span>
                  </div>
                  <span className="activity-when">{customer.joinedAt}</span>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** The mock source: aggregates the feature stores for the seeded tenant. */
function MockDashboard(props: DashboardProps) {
  return <DashboardView data={useDashboard()} {...props} />
}

/** The API source: reads the MFI backend's `/dashboard` statistics. */
function ApiDashboard(props: DashboardProps) {
  return <DashboardView data={useApiDashboard()} {...props} />
}

/** The overview page. The source follows the global mock/API switch. */
export function Dashboard(props: DashboardProps) {
  return env.VITE_ENABLE_MOCKS ? <MockDashboard {...props} /> : <ApiDashboard {...props} />
}

export default Dashboard
