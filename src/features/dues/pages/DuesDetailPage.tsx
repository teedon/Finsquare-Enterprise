import { useState } from "react"
import { ArrowLeft, Bell, Plus, RefreshCcw } from "@/icons"
import { ActionMenu, Button, Tabs } from "@/components/ui"
import { ShellPage } from "@/components/layout/ShellPage"
import { EnvironmentNotice } from "@/components/feedback/EnvironmentNotice"
import { DuesFrequencyBadge, DuesPage, DuesStatusBadge, Panel } from "../components/DuesUi"
import { PlanOverview } from "../components/PlanOverview"
import { PlanParticipants } from "../components/PlanParticipants"
import { PlanPayments } from "../components/PlanPayments"
import { PlanActivity } from "../components/PlanActivity"
import { LienRulesModal, RecordDuesPaymentModal, RecoveryConfirmModal } from "../components/DuesModals"
import { lienRulesLabel } from "../domain/dues.rules"
import { money } from "@/features/loans/components/LoanUi"
import type { DuesCtx, DuesPageProps } from "../components/DuesUi"
import type { DuesPlanStatus } from "../types/dues.types"
type DetailTab = "overview" | "participants" | "payments" | "activity"
type Modal =
  | {
      kind: "payment"
      participantId?: string
      chargeId?: string
    }
  | {
      kind: "recover"
      memberId?: string
      memberName?: string
    }
  | {
      kind: "rules"
    }
/** One plan, start to finish: what it demands, who owes, what is due, and what moved. */
export default function DuesDetailPage(props: DuesPageProps) {
  return <DuesPage {...props}>{(ctx) => <DetailBody ctx={ctx} />}</DuesPage>
}
function DetailBody({ ctx }: { ctx: DuesCtx }) {
  const plan = ctx.plans.find((candidate) => candidate.id === ctx.id)
  const [tab, setTab] = useState<DetailTab>("overview")
  const [modal, setModal] = useState<Modal | null>(null)
  if (!plan) {
    return (
      <ShellPage
        level="detail"
        title="Dues plan not found"
        description="This plan no longer exists, or belongs to another organization."
        actions={
          <Button variant="secondary" icon={ArrowLeft} onClick={() => ctx.navigate("dues")}>
            All dues plans
          </Button>
        }
      >
        <Panel title="Nothing to show">
          <p className="contribution-hint" style={{ padding: 14 }}>
            Open the dues list to pick another plan.
          </p>
        </Panel>
      </ShellPage>
    )
  }
  const totals = ctx.totalsFor(plan)
  const awaiting = ctx
    .syncedChargesFor(plan)
    .filter((charge) => charge.lienState === "Pending" || charge.lienState === "Partially recovered")
  const statusItems = (["Active", "Paused", "Closed"] as DuesPlanStatus[])
    .filter((status) => status !== plan.status)
    .map((status) => ({
      label: status === "Active" ? "Resume collecting" : status === "Paused" ? "Pause plan" : "Close plan",
      onSelect: () => void setStatus(ctx, plan.id, status),
    }))
  return (
    <>
      <ShellPage
        level="detail"
        title={plan.name}
        description={plan.description}
        meta={
          <>
            <DuesFrequencyBadge plan={plan} />
            <DuesStatusBadge status={plan.status} />
            <span className="meta-note">
              {money(plan.amount)} per {plan.frequency === "One-time" ? "payment" : "period"}
            </span>
          </>
        }
        actions={
          <div className="header-actions">
            {ctx.can("dues.record_payment") && totals.outstanding > 0 && (
              <Button variant="secondary" icon={Plus} onClick={() => setModal({ kind: "payment" })}>
                Record payment
              </Button>
            )}
            {ctx.can("dues.recover") && awaiting.length > 0 && (
              <Button variant="secondary" icon={RefreshCcw} onClick={() => setModal({ kind: "recover" })}>
                Recover {money(totals.outstanding)}
              </Button>
            )}
            {ctx.enabledModules.has("communication") &&
              ctx.can("communication.send") &&
              totals.unpaidParticipants > 0 && (
                <Button variant="secondary" icon={Bell} onClick={() => ctx.navigate("communication")}>
                  Send reminder
                </Button>
              )}
            {ctx.can("dues.close") && <ActionMenu label="Manage" items={statusItems} />}
          </div>
        }
      >
        <EnvironmentNotice mode={ctx.mode} />

        <Tabs
          tabs={[
            { id: "overview", label: "Overview" },
            {
              id: "participants",
              label: "Participants",
              count: totals.participants,
            },
            {
              id: "payments",
              label: "Payments",
              count: totals.awaitingRecovery || undefined,
            },
            { id: "activity", label: "Activity" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "overview" && (
          <PlanOverview
            ctx={ctx}
            plan={plan}
            totals={totals}
            onViewParticipants={() => setTab("participants")}
            onEditRules={() => setModal({ kind: "rules" })}
          />
        )}
        {tab === "participants" && (
          <PlanParticipants
            ctx={ctx}
            plan={plan}
            onRecordPayment={(participantId) => setModal({ kind: "payment", participantId })}
            onRecover={(memberId, memberName) => setModal({ kind: "recover", memberId, memberName })}
          />
        )}
        {tab === "payments" && (
          <PlanPayments
            ctx={ctx}
            plan={plan}
            onRecordPayment={(participantId, chargeId) => setModal({ kind: "payment", participantId, chargeId })}
          />
        )}
        {tab === "activity" && <PlanActivity ctx={ctx} plan={plan} />}

        <p className="contribution-hint">
          {lienRulesLabel(plan.lien)} · {money(totals.scheduled)} is scheduled but not yet due.
        </p>
      </ShellPage>

      {modal?.kind === "payment" && (
        <RecordDuesPaymentModal
          ctx={ctx}
          plan={plan}
          notify={ctx.notify}
          onClose={() => setModal(null)}
          preselectedParticipantId={modal.participantId}
          preselectedChargeId={modal.chargeId}
        />
      )}
      {modal?.kind === "recover" && (
        <RecoveryConfirmModal
          ctx={ctx}
          plan={plan}
          notify={ctx.notify}
          onClose={() => setModal(null)}
          memberId={modal.memberId}
          memberName={modal.memberName}
        />
      )}
      {modal?.kind === "rules" && (
        <LienRulesModal ctx={ctx} plan={plan} notify={ctx.notify} onClose={() => setModal(null)} />
      )}
    </>
  )
}
async function setStatus(ctx: DuesCtx, planId: string, status: DuesPlanStatus) {
  const updated = await ctx.service.setStatus(ctx.organizationId, planId, status, ctx.ctx)
  if (updated) ctx.notify(`${updated.name} is now ${status.toLowerCase()}`)
  ctx.retry()
}
