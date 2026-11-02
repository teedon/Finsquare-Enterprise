import { membersMock } from "@/features/members/mocks/members.mock"
import { SEED_ORGANIZATION_ID } from "@/lib/tenancy/seed-tenant"
import { generatePeriods, addDays, parseISODate, round2, toISODate } from "../domain/calculations"
import { paymentMethodsFor, slugify } from "../domain/contribution.rules"
import type {
  Contribution,
  ContributionCommission,
  ContributionDataset,
  ContributionForm,
  ContributionFrequency,
  ContributionParticipant,
  ContributionPaymentMethodId,
  ContributionPayoutConfig,
  ContributionRecipient,
  ContributionStatus,
  ContributionTransaction,
  ContributionType,
  ContributionWithdrawal,
  ParticipantScope,
  WithdrawalKind,
  WithdrawalStatus,
} from "../types/contribution.types"

/**
 * Mock contribution data. Models realistic backend responses: the UI never assumes these
 * shapes, and the real repository can be swapped in without touching a component.
 */

export const ORGANIZATION_ACCOUNT_RECIPIENT: ContributionRecipient = {
  kind: "organization",
  accountId: "acct-main",
  accountName: "FINSQ/LAGOS FARMERS COOPERATIVE",
  label: "Organization account: FINSQ/LAGOS FARMERS COOPERATIVE",
}

const today = () => toISODate(new Date())
const daysAgoFrom = (anchor: Date, days: number) => toISODate(addDays(anchor, -days))

const noCommission: ContributionCommission = { model: "none" }
const savingsCommission = (percentage: number): ContributionCommission => ({
  model: "percentage",
  percentage,
})

const manualPayout = (approvalThreshold: number): ContributionPayoutConfig => ({
  mode: "manual",
  approvalThreshold,
})

interface WithdrawalSeed {
  amount: number
  daysAgo: number
  status: WithdrawalStatus
  kind: WithdrawalKind
  /** When set, the payout is taken from one contributor's own balance. */
  memberId?: string
}

interface ContributionSeed {
  id: string
  name: string
  description: string
  type: ContributionType
  form: ContributionForm
  participantScope: ParticipantScope
  fixedAmount?: number
  minimumAmount?: number
  targetAmount?: number
  frequencyBased: boolean
  frequency: ContributionFrequency
  customFrequency?: { label: string; days: number }
  startDaysAgo: number
  groupId?: string
  groupName?: string
  recipient: ContributionRecipient
  commission: ContributionCommission
  payout: ContributionPayoutConfig
  methods: ContributionPaymentMethodId[]
  status: ContributionStatus
  memberIds: string[]
  /** Fraction of due periods that were actually paid — drives missed-contribution data. */
  collectionRate: number
  withdrawals: WithdrawalSeed[]
}

const member = (id: string) => membersMock.find((m) => m.id === id)
const memberName = (id: string) => member(id)?.name ?? "Unknown member"
const memberRecipient = (id: string, kind: ContributionRecipient["kind"] = "member"): ContributionRecipient => ({
  kind,
  memberId: id,
  memberName: memberName(id),
  label: `${kind === "customer" ? "Customer" : "Member"} account: ${memberName(id)}`,
})

const SEEDS: ContributionSeed[] = [
  {
    id: "cont-ikeja-ajo",
    name: "Ikeja Daily Ajo Savings",
    description: "Daily ₦2,000 collection held for each contributor and paid out on request.",
    type: "Fixed",
    form: "Personal",
    participantScope: "Selected",
    fixedAmount: 2_000,
    frequencyBased: true,
    frequency: "Daily",
    startDaysAgo: 150,
    groupId: "group-ikeja-savings",
    groupName: "Ikeja Savings Group",
    recipient: memberRecipient("LFC-002479"),
    commission: savingsCommission(5),
    payout: manualPayout(100_000),
    methods: ["wallet", "bank_transfer", "cash"],
    status: "Active",
    memberIds: ["LFC-002479", "LFC-002481", "LFC-002462", "LFC-002451", "LFC-002438"],
    collectionRate: 0.93,
    withdrawals: [
      { amount: 60_000, daysAgo: 96, status: "Completed", kind: "Partial", memberId: "LFC-002479" },
      { amount: 40_000, daysAgo: 41, status: "Completed", kind: "Partial", memberId: "LFC-002481" },
      { amount: 120_000, daysAgo: 3, status: "Pending approval", kind: "Partial", memberId: "LFC-002479" },
    ],
  },
  {
    id: "cont-monthly-coop",
    name: "Monthly Cooperative Contribution",
    description: "Monthly ₦10,000 contribution collected into the organization account.",
    type: "Fixed",
    form: "General",
    participantScope: "All",
    fixedAmount: 10_000,
    frequencyBased: true,
    frequency: "Monthly",
    startDaysAgo: 400,
    recipient: ORGANIZATION_ACCOUNT_RECIPIENT,
    commission: noCommission,
    payout: manualPayout(500_000),
    methods: ["wallet", "bank_transfer", "bank_account"],
    status: "Active",
    memberIds: ["LFC-002481", "LFC-002479", "LFC-002462", "LFC-002451", "LFC-002438", "LFC-002426"],
    collectionRate: 0.96,
    withdrawals: [{ amount: 300_000, daysAgo: 120, status: "Completed", kind: "Partial" }],
  },
  {
    id: "cont-women-epe",
    name: "Epe Women Weekly Ajo",
    description: "Weekly ₦5,000 Ajo for the Epe women farmers group, held per contributor.",
    type: "Fixed",
    form: "Personal",
    participantScope: "Selected",
    fixedAmount: 5_000,
    frequencyBased: true,
    frequency: "Weekly",
    startDaysAgo: 210,
    groupId: "group-women-epe",
    groupName: "Epe Women Farmers",
    recipient: memberRecipient("LFC-002462", "customer"),
    commission: savingsCommission(7.5),
    payout: {
      mode: "scheduled",
      scheduledInterval: "Monthly",
      approvalThreshold: 150_000,
    },
    methods: ["wallet", "cash", "payment_link"],
    status: "Active",
    memberIds: ["LFC-002462", "LFC-002451", "LFC-002426"],
    collectionRate: 0.88,
    withdrawals: [
      { amount: 80_000, daysAgo: 58, status: "Completed", kind: "Partial", memberId: "LFC-002462" },
      { amount: 45_000, daysAgo: 21, status: "Scheduled", kind: "Scheduled" },
    ],
  },
  {
    id: "cont-community-fund",
    name: "Community Emergency Fund",
    description: "Open fundraising for members facing an emergency. Anyone with the link can contribute.",
    type: "Target",
    form: "General",
    participantScope: "Open",
    targetAmount: 5_000_000,
    minimumAmount: 1_000,
    frequencyBased: false,
    frequency: "None",
    startDaysAgo: 75,
    recipient: ORGANIZATION_ACCOUNT_RECIPIENT,
    commission: noCommission,
    payout: manualPayout(0),
    methods: ["bank_transfer", "payment_link", "cash", "bank_account"],
    status: "Active",
    memberIds: ["LFC-002481", "LFC-002438"],
    collectionRate: 1,
    withdrawals: [{ amount: 500_000, daysAgo: 12, status: "Completed", kind: "Partial" }],
  },
  {
    id: "cont-welfare-flex",
    name: "Flexible Welfare Fund",
    description: "Members save whatever they can each month into their own welfare balance.",
    type: "Flexible",
    form: "Personal",
    participantScope: "Selected",
    minimumAmount: 1_000,
    frequencyBased: true,
    frequency: "Monthly",
    startDaysAgo: 260,
    groupId: "group-welfare",
    groupName: "Member Welfare Committee",
    recipient: memberRecipient("LFC-002438"),
    commission: savingsCommission(2),
    payout: manualPayout(250_000),
    methods: ["wallet", "bank_transfer", "cash"],
    status: "Active",
    memberIds: ["LFC-002438", "LFC-002451", "LFC-002479", "LFC-002481"],
    collectionRate: 0.9,
    withdrawals: [{ amount: 35_000, daysAgo: 33, status: "Completed", kind: "Partial", memberId: "LFC-002438" }],
  },
  {
    id: "cont-youth-target",
    name: "Youth Farmers Equipment Target",
    description: "Targeted savings towards shared equipment for the youth network.",
    type: "Target",
    form: "General",
    participantScope: "Open",
    targetAmount: 2_000_000,
    frequencyBased: true,
    frequency: "Custom",
    customFrequency: { label: "Every 10 days", days: 10 },
    startDaysAgo: 120,
    groupId: "group-youth",
    groupName: "Youth Farmers Network",
    recipient: memberRecipient("LFC-002426", "customer"),
    commission: savingsCommission(3),
    payout: { mode: "manual", approvalThreshold: 0 },
    methods: ["wallet", "bank_transfer", "payment_link"],
    status: "Paused",
    memberIds: ["LFC-002426", "LFC-002438"],
    collectionRate: 0.72,
    withdrawals: [],
  },
  {
    id: "cont-exec-completed",
    name: "Executive Committee Levy",
    description: "One-off levy for the executive committee, fully collected and closed.",
    type: "Fixed",
    form: "General",
    participantScope: "Selected",
    fixedAmount: 25_000,
    frequencyBased: false,
    frequency: "None",
    startDaysAgo: 300,
    groupId: "group-executive",
    groupName: "Executive Committee",
    recipient: ORGANIZATION_ACCOUNT_RECIPIENT,
    commission: noCommission,
    payout: manualPayout(0),
    methods: ["bank_transfer", "cash"],
    status: "Completed",
    memberIds: ["LFC-002481", "LFC-002479"],
    collectionRate: 1,
    withdrawals: [{ amount: 50_000, daysAgo: 250, status: "Completed", kind: "Full" }],
  },
]

const EXTERNAL_CONTRIBUTORS = [
  { id: "ext-1", name: "Bode Thomas", phone: "+234 805 111 2233", amount: 150_000, daysAgo: 68 },
  { id: "ext-2", name: "Ngozi Eze", phone: "+234 807 445 9090", amount: 75_000, daysAgo: 55 },
  { id: "ext-3", name: "Tunde Bakare", email: "tunde.b@example.demo", amount: 500_000, daysAgo: 30 },
  { id: "ext-4", name: "Amaka Obi", phone: "+234 809 220 7781", amount: 25_000, daysAgo: 9 },
]

interface BuildOptions {
  /** Reference date; defaults to today. */
  today?: string
  /** Caps generated schedule periods, matching the repository page size. */
  maxPeriods?: number
}

/**
 * Builds a deterministic dataset. Everything is derived from the seeds, so the same input
 * always produces the same balances, periods and reports.
 */
export function buildContributionDataset(options: BuildOptions = {}): ContributionDataset {
  const todayISO = options.today ?? today()
  // All derived dates are anchored to the same reference day, so the same input always produces
  // the same dataset regardless of the wall clock.
  const daysAgo = (days: number) => daysAgoFrom(parseISODate(todayISO), days)
  const maxPeriods = options.maxPeriods ?? 160
  const contributions: Contribution[] = []
  const participants: ContributionParticipant[] = []
  const transactions: ContributionTransaction[] = []
  const withdrawals: ContributionWithdrawal[] = []
  let txSeq = 0
  let wdSeq = 0

  for (const seed of SEEDS) {
    const contribution: Contribution = {
      id: seed.id,
      organizationId: SEED_ORGANIZATION_ID,
      name: seed.name,
      description: seed.description,
      type: seed.type,
      form: seed.form,
      participantScope: seed.participantScope,
      fixedAmount: seed.fixedAmount,
      minimumAmount: seed.minimumAmount,
      targetAmount: seed.targetAmount,
      frequencyBased: seed.frequencyBased,
      frequency: seed.frequency,
      customFrequency: seed.customFrequency,
      startDate: daysAgo(seed.startDaysAgo),
      groupId: seed.groupId,
      groupName: seed.groupName,
      recipient: seed.recipient,
      commission: seed.commission,
      payout:
        seed.payout.mode === "scheduled"
          ? { ...seed.payout, scheduledDate: daysAgo(-14) }
          : seed.payout,
      paymentMethods: paymentMethodsFor(seed.methods),
      // Every plan mints a link: `Open` plans advertise the pool link, member plans use it for
      // each member's own link.
      publicLink: { slug: slugify(seed.name), enabled: seed.participantScope === "Open", createdAt: daysAgo(seed.startDaysAgo) },
      status: seed.status,
      currency: "NGN",
      createdAt: daysAgo(seed.startDaysAgo),
      createdBy: "Ada Obi",
    }
    contributions.push(contribution)

    const expectedAmount = seed.type === "Fixed" ? seed.fixedAmount ?? 0 : seed.minimumAmount ?? 0
    const start = parseISODate(contribution.startDate)
    const step = seed.frequency === "Daily" ? 1 : seed.frequency === "Weekly" ? 7 : seed.frequency === "Custom" ? seed.customFrequency?.days ?? 10 : 30
    const periodsSinceStart = seed.frequencyBased ? Math.floor((parseISODate(todayISO).getTime() - start.getTime()) / 86_400_000 / step) + 1 : 0
    const paidPeriods = seed.frequencyBased ? Math.min(periodsSinceStart, Math.round(periodsSinceStart * seed.collectionRate)) : 1

    for (const memberId of seed.memberIds) {
      const participant: ContributionParticipant = {
        id: `${seed.id}:${memberId}`,
        organizationId: SEED_ORGANIZATION_ID,
        contributionId: seed.id,
        memberId,
        memberName: memberName(memberId),
        memberCode: memberId,
        isExternal: false,
        contact: { phone: member(memberId)?.phone, email: member(memberId)?.email },
        branchId: member(memberId)?.branchId,
        branchName: member(memberId)?.branchName,
        expectedAmount: seed.frequencyBased ? expectedAmount : 0,
        totalContributed: 0,
        availableBalance: 0,
        missedCount: 0,
        lateCount: 0,
        state: "On track",
        joinedAt: contribution.startDate,
      }
      participants.push(participant)

      // Deterministic payment pattern: the first `paidPeriods` periods are paid, with a
      // repeatable gap so that missed/late reporting has real data to show.
      for (let index = 0; index < paidPeriods; index += 1) {
        const skipped = seed.frequencyBased && index % 9 === 4
        if (skipped && seed.collectionRate < 1) continue
        const date = seed.frequencyBased
          ? toISODate(addDays(start, step * index))
          : toISODate(addDays(start, Math.round(seed.startDaysAgo * 0.6) + seed.memberIds.indexOf(memberId)))
        const amount = seed.type === "Flexible" ? round2(expectedAmount * (1 + (index % 3) * 0.5)) : expectedAmount
        if (amount <= 0) continue
        txSeq += 1
        transactions.push({
          id: `${seed.id}-tx-${txSeq}`,
          organizationId: SEED_ORGANIZATION_ID,
          reference: `CTR-${String(10_000 + txSeq)}`,
          contributionId: seed.id,
          participantId: participant.id,
          contributorName: participant.memberName,
          type: "Contribution",
          method: seed.methods[index % seed.methods.length],
          amount,
          fee: 0,
          commission: 0,
          netAmount: amount,
          direction: "credit",
          status: "Completed",
          date,
          recordedBy: "Ada Obi",
          simulated: true,
        })
      }
    }

    // An Open plan also accepts money from people who are not members.
    if (seed.participantScope === "Open") {
      for (const external of EXTERNAL_CONTRIBUTORS) {
        const participant: ContributionParticipant = {
          id: `${seed.id}:${external.id}`,
          organizationId: SEED_ORGANIZATION_ID,
          contributionId: seed.id,
          memberName: external.name,
          isExternal: true,
          contact: { phone: external.phone, email: external.email },
          expectedAmount: 0,
          totalContributed: 0,
          availableBalance: 0,
          missedCount: 0,
          lateCount: 0,
          state: "On track",
          joinedAt: daysAgo(external.daysAgo),
        }
        participants.push(participant)
        txSeq += 1
        transactions.push({
          id: `${seed.id}-tx-${txSeq}`,
          organizationId: SEED_ORGANIZATION_ID,
          reference: `CTR-${String(10_000 + txSeq)}`,
          contributionId: seed.id,
          participantId: participant.id,
          contributorName: external.name,
          type: "Contribution",
          method: "payment_link",
          amount: external.amount,
          fee: 0,
          commission: 0,
          netAmount: external.amount,
          direction: "credit",
          status: "Completed",
          date: daysAgo(external.daysAgo),
          recordedBy: "Public link",
          external: true,
          simulated: true,
        })
      }
    }

    for (const seedWithdrawal of seed.withdrawals) {
      const participant = seedWithdrawal.memberId
        ? participants.find((p) => p.contributionId === seed.id && p.memberId === seedWithdrawal.memberId)
        : undefined
      const commission = seed.commission.model === "none" ? 0 : round2((seedWithdrawal.amount * (seed.commission.percentage ?? 0)) / 100)
      const fees = seedWithdrawal.status === "Completed" ? 100 : 0
      wdSeq += 1
      const requestedAt = daysAgo(seedWithdrawal.daysAgo)
      withdrawals.push({
        id: `${seed.id}-wd-${wdSeq}`,
        organizationId: SEED_ORGANIZATION_ID,
        reference: `WDR-${String(5_000 + wdSeq)}`,
        contributionId: seed.id,
        participantId: participant?.id,
        kind: seedWithdrawal.kind,
        grossAmount: seedWithdrawal.amount,
        commission,
        fees,
        netPayout: round2(seedWithdrawal.amount - commission - fees),
        status: seedWithdrawal.status,
        destination: participant ? memberRecipient(participant.memberId ?? "", "member").label : seed.recipient.label,
        requestedBy: "Ada Obi",
        requestedById: "admin-ada",
        requestedAt,
        approvedBy: seedWithdrawal.status === "Completed" ? "Tunde Alabi" : undefined,
        approvedAt: seedWithdrawal.status === "Completed" ? requestedAt : undefined,
        scheduledFor: seedWithdrawal.kind === "Scheduled" ? daysAgo(-14) : undefined,
        completedAt: seedWithdrawal.status === "Completed" ? requestedAt : undefined,
      })
    }
  }

  // Contributor totals, then the schedule, then the derived missed/late counts.
  for (const participant of participants) {
    const scoped = transactions.filter((tx) => tx.participantId === participant.id && tx.type === "Contribution" && tx.status === "Completed")
    participant.totalContributed = round2(scoped.reduce((sum, tx) => sum + tx.amount, 0))
  }

  const periods = contributions.flatMap((contribution) =>
    generatePeriods(contribution, participants, transactions, todayISO, { maxPeriods }),
  )

  for (const participant of participants) {
    const scoped = periods.filter((p) => p.participantId === participant.id)
    participant.missedCount = scoped.filter((p) => p.state === "Missed").length
    participant.lateCount = scoped.filter((p) => p.state === "Late" || p.state === "Partially Paid").length
    const withdrawn = withdrawals
      .filter((w) => w.participantId === participant.id && w.status === "Completed")
      .reduce((sum, w) => sum + w.grossAmount, 0)
    participant.availableBalance = round2(Math.max(0, participant.totalContributed - withdrawn))
    const contribution = contributions.find((c) => c.id === participant.contributionId)
    const target = contribution?.type === "Target" ? contribution.targetAmount ?? 0 : 0
    participant.state =
      target > 0 && participant.totalContributed >= target
        ? "Completed"
        : participant.missedCount > 2
          ? "Behind"
          : "On track"
  }

  return { contributions, participants, transactions, withdrawals, periods }
}

/** Converts an arbitrary name into a unique-enough public slug. */
export function publicSlugFor(name: string, taken: string[] = []): string {
  const base = slugify(name) || "contribution"
  if (!taken.includes(base)) return base
  let index = 2
  while (taken.includes(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}
