import { useCallback, useEffect, useMemo, useState } from "react"
import { useWorkspace } from "@/app/providers/WorkspaceProvider"
import { useAuthorization } from "@/features/administrators/hooks/useAuthorization"
import { moneyMovementMode } from "@/lib/permissions/capabilities"
import { toISODate } from "../domain/calculations"
import {
  amountLabel,
  frequencyLabel,
  scheduleFor,
  summarizeContributions,
} from "../domain/contribution.rules"
import { contributionBalance } from "../domain/calculations"
import { contributionsService, type ContributionActor, type MutationContext } from "../services/contributions.service"
import type {
  Contribution,
  ContributionBalance,
  ContributionDataset,
  ContributionParticipant,
  ContributionSchedule,
  ContributionSummary,
} from "../types/contribution.types"

/**
 * Loads the contribution workspace and exposes the derived figures the UI needs.
 * Components never touch the repository — they go through the hook, which goes through
 * the service.
 */
export function useContributions(organizationId: string) {
  const [data, setData] = useState<ContributionDataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const { administrator, can } = useAuthorization()
  const { state } = useWorkspace()

  useEffect(() => contributionsService.subscribe(() => setVersion((value) => value + 1)), [])

  useEffect(() => {
    let active = true
    contributionsService
      .load(organizationId)
      .then((dataset) => {
        if (!active) return
        setData(dataset)
        setError(null)
      })
      .catch(() => active && setError("Contributions could not be loaded."))
    return () => {
      active = false
    }
  }, [version, organizationId])

  const today = toISODate(new Date())
  const retry = useCallback(() => setVersion((value) => value + 1), [])
  const actor = useMemo<ContributionActor>(
    () => ({ id: administrator.id, name: administrator.name }),
    [administrator.id, administrator.name],
  )
  const mode = moneyMovementMode(state.environment)
  const ctx = useMemo<MutationContext>(() => ({ actor, mode }), [actor, mode])

  const summary = useMemo<ContributionSummary | null>(
    () => (data ? summarizeContributions(data) : null),
    [data],
  )

  const balanceFor = useCallback(
    (contribution: Contribution): ContributionBalance =>
      contributionBalance(
        contribution,
        data?.transactions ?? [],
        data?.withdrawals ?? [],
      ),
    [data],
  )

  const scheduleForContribution = useCallback(
    (contribution: Contribution): ContributionSchedule | undefined =>
      data ? scheduleFor(data, contribution, today) : undefined,
    [data, today],
  )

  return {
    data,
    error,
    retry,
    service: contributionsService,
    can,
    actor,
    ctx,
    mode,
    /** The tenant this data belongs to, so a mutation can name it without a second hook call. */
    organizationId,
    environment: state.environment,
    today,
    summary,
    contributions: data?.contributions ?? [],
    balanceFor,
    scheduleFor: scheduleForContribution,
    labelFor: (contribution: Contribution) => `${amountLabel(contribution)} · ${frequencyLabel(contribution)}`,
    participantsFor: (contributionId: string) =>
      data?.participants.filter((p) => p.contributionId === contributionId) ?? [],
    transactionsFor: (contributionId: string) =>
      data?.transactions.filter((t) => t.contributionId === contributionId) ?? [],
    withdrawalsFor: (contributionId: string) =>
      data?.withdrawals.filter((w) => w.contributionId === contributionId) ?? [],
    periodsFor: (contributionId: string) =>
      data?.periods.filter((p) => p.contributionId === contributionId) ?? [],
  }
}

/**
 * Public contribution page: resolves a shareable slug and submits without an account.
 *
 * A member's own link (`/contribute/:slug/m/:memberId`) resolves the member too, so the page can
 * name them, pay from their wallet, and record the money against their balance.
 */
export function usePublicContribution(slug: string, memberId?: string) {
  const [contribution, setContribution] = useState<Contribution | null>(null)
  const [participant, setParticipant] = useState<ContributionParticipant | null>(null)
  const [memberWallet, setMemberWallet] = useState<{ id: string; availableBalance: number } | null>(null)
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")

  useEffect(() => {
    let active = true
    contributionsService
      .findPublicContribution(slug, memberId)
      .then((found) => {
        if (!active) return
        if (!found) {
          setStatus("error")
          return
        }
        setContribution(found.contribution)
        setParticipant(found.participant ?? null)
        setMemberWallet(found.memberWallet ?? null)
        setStatus("success")
      })
      .catch(() => active && setStatus("error"))
    return () => {
      active = false
    }
  }, [slug, memberId])

  return { contribution, participant, memberWallet, status, service: contributionsService }
}
