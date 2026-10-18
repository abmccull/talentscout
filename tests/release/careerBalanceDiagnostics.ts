import { createHash } from "node:crypto";
import type { GameState } from "@/engine/core/types";
import type { AutonomousCareerTelemetry } from "./autonomousYouthCareerDriver";

type SampleState = Pick<GameState,
  "currentSeason" | "currentWeek" | "scout" | "finances" | "contacts" |
  "rivalScouts" | "narrativeEvents" | "consequenceState" | "clubDecisions"
>;
type Decision = GameState["consequenceState"]["decisions"][string];
type Consequence = GameState["consequenceState"]["consequences"][string];

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const countBy = (values: string[]) => values.reduce<Record<string, number>>((counts, value) => {
  counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});

/** Read-only diagnostics. Nothing here selects actions, changes rules or supplies human verdicts. */
export function createCareerBalanceDiagnostics() {
  const decisions = new Map<string, Decision>();
  const consequences = new Map<string, Consequence>();
  const narratives = new Map<string, GameState["narrativeEvents"][number]>();
  const clubDecisions = new Map<string, GameState["clubDecisions"][string]>();
  const weekly = new Map<number, {
    tick: number; season: number; week: number; policyActions: number;
    acknowledgements: number; balance: number | null; debt: number;
    reputation: number; careerTier: number; careerPath: string;
    contactRelationships: Record<string, number>;
    rivalWins: number; rivalLosses: number; pendingDecisions: number;
    appliedConsequenceIds: string[]; failedConsequenceIds: string[];
  }>();
  const seenEffectIds = new Set<string>();
  const sourcedMemoryIds = new Set<string>();
  const sourcedFactIds = new Set<string>();
  let finalFinances: SampleState["finances"];
  let finalMetrics: Record<string, number> = {};
  let initialMetrics: Record<string, number> | undefined;
  let initialBalance: number | null = null;
  let latestTick = 0;
  let finalConsequenceIds = new Set<string>();

  function observe(state: SampleState, telemetry: AutonomousCareerTelemetry, tick: number): void {
    if (weekly.size === 0) {
      initialBalance = state.finances?.balance ?? null;
      initialMetrics = { ...state.consequenceState.metrics };
    }
    latestTick = tick;
    for (const value of Object.values(state.consequenceState.decisions)) decisions.set(value.id, clone(value));
    for (const value of Object.values(state.consequenceState.consequences)) consequences.set(value.id, clone(value));
    for (const value of state.narrativeEvents) narratives.set(value.id, clone(value));
    for (const value of Object.values(state.clubDecisions)) clubDecisions.set(value.id, clone(value));
    Object.keys(state.consequenceState.appliedEffects).forEach((id) => seenEffectIds.add(id));
    for (const memory of Object.values(state.consequenceState.memories)) {
      if (memory.sourceDecisionId || memory.sourceConsequenceId) sourcedMemoryIds.add(memory.id);
    }
    for (const fact of Object.values(state.consequenceState.facts)) {
      if (fact.sourceDecisionId || fact.sourceConsequenceId) sourcedFactIds.add(fact.id);
    }
    finalFinances = state.finances ? clone(state.finances) : undefined;
    finalMetrics = { ...state.consequenceState.metrics };
    finalConsequenceIds = new Set(Object.keys(state.consequenceState.consequences));
    const loans = state.finances?.activeLoan
      ? [state.finances.activeLoan] : state.finances?.loans ?? [];
    // These driver counters describe successful policy calls, not measured enjoyment.
    // Acknowledgements are expressly removed from the action count.
    weekly.set(tick, {
      tick, season: state.currentSeason, week: state.currentWeek,
      policyActions: telemetry.meaningfulDecisions - telemetry.narrativeAcknowledgements,
      acknowledgements: telemetry.narrativeAcknowledgements,
      balance: state.finances?.balance ?? null,
      debt: sum(loans.map((loan) => loan.remainingBalance)),
      reputation: state.scout.reputation, careerTier: state.scout.careerTier,
      careerPath: state.scout.careerPath,
      contactRelationships: Object.fromEntries(Object.values(state.contacts).map((contact) => [contact.id, contact.relationship])),
      rivalWins: sum(Object.values(state.rivalScouts).map((rival) => rival.winsAgainstPlayer)),
      rivalLosses: sum(Object.values(state.rivalScouts).map((rival) => rival.lossesToPlayer)),
      pendingDecisions: Object.values(state.consequenceState.decisions).filter((decision) => decision.status === "offered").length,
      appliedConsequenceIds: Object.values(state.consequenceState.consequences).filter((value) => value.status === "applied").map((value) => value.id),
      failedConsequenceIds: Object.values(state.consequenceState.consequences).filter((value) => value.status === "failed").map((value) => value.id),
    });
  }

  function finish() {
    const samples = [...weekly.values()].sort((left, right) => left.tick - right.tick);
    const initial = samples[0];
    const final = samples.at(-1);
    let quietStreak = 0;
    let maximumPolicyActionFreeWeeks = 0;
    let policyActionFreeWeeks = 0;
    for (let index = 1; index < samples.length; index += 1) {
      const quiet = samples[index].policyActions === samples[index - 1].policyActions;
      quietStreak = quiet ? quietStreak + 1 : 0;
      policyActionFreeWeeks += Number(quiet);
      maximumPolicyActionFreeWeeks = Math.max(maximumPolicyActionFreeWeeks, quietStreak);
    }
    const repeatedText = new Map<string, { textHash: string; text: string; eventIds: string[]; seasons: number[] }>();
    for (const event of narratives.values()) {
      // Exact player-facing words; normalize whitespace only. No generated-name stripping.
      const text = `${event.title}\n${event.description}`.replace(/\s+/g, " ").trim();
      const textHash = hash(text);
      const row = repeatedText.get(textHash) ?? { textHash, text, eventIds: [], seasons: [] };
      row.eventIds.push(event.id);
      row.seasons.push(event.season);
      repeatedText.set(textHash, row);
    }
    const transactions = finalFinances?.transactions ?? [];
    const referenceCounts = countBy(transactions.flatMap((value) => value.referenceId ? [value.referenceId] : []));
    const duplicateTransactionReferences = Object.entries(referenceCounts)
      .filter(([, count]) => count > 1).map(([referenceId, count]) => ({ referenceId, count }));
    const cashMovements = transactions.filter((value) => value.kind !== "openingBalance" && value.category !== "opening");
    const balances = samples.flatMap((sample) => sample.balance === null ? [] : [sample.balance]);
    const allDecisions = [...decisions.values()];
    const allConsequences = [...consequences.values()];
    const allNarratives = [...narratives.values()];
    const selected = allDecisions.filter((decision) => decision.selectedOptionId);
    const knownTradeoffSelections = selected.filter((decision) =>
      (decision.options.find((option) => option.id === decision.selectedOptionId)?.knownTradeoffs.length ?? 0) > 0);
    const metricDeltas = Object.fromEntries([...new Set([...Object.keys(initialMetrics ?? {}), ...Object.keys(finalMetrics)])]
      .map((key) => [key, (finalMetrics[key] ?? 0) - (initialMetrics?.[key] ?? 0)]));
    const finalContactIds = Object.keys(final?.contactRelationships ?? {});
    const comparableContacts = finalContactIds.filter((id) => initial?.contactRelationships[id] !== undefined);
    return {
      authority: {
        evidenceClass: "canonical-policy-diagnostic", releaseCertificationEligible: false,
        humanEngagementMeasured: false, optimalStrategyProven: false,
        caveats: [
          "Policy-action counts exclude acknowledgements but do not establish meaningful human choice.",
          "Weekly observation may miss an offer that is generated and removed within one week; persisted selections and effects are retained when observed.",
          "Exact repeated wording is a lower bound on semantic repetition; templates with different names remain different.",
          "Positive cash includes debt/asset movements; earned classified receipts are reported separately.",
          "Matched policy outcomes are descriptive; no equal-outcome or invented balance threshold is applied.",
          "The underlying canonical harness retains its existing correctness, economy, memory and serialization assertions.",
        ],
      },
      canonicalTicksObserved: latestTick,
      choices: {
        policyActions: final?.policyActions ?? 0,
        acknowledgements: final?.acknowledgements ?? 0,
        policyActionFreeWeeks, maximumPolicyActionFreeWeeks,
        observedDecisions: allDecisions.length,
        selectedDecisions: selected.length,
        playerSelections: selected.filter((decision) => decision.selectionKind === "player").length,
        knownTradeoffSelections: knownTradeoffSelections.length,
        selectedNarrativeChoices: allNarratives.filter((event) => event.selectedChoice !== undefined).length,
        maximumPendingDecisionBacklog: Math.max(0, ...samples.map((sample) => sample.pendingDecisions)),
      },
      consequences: {
        byStatus: countBy(allConsequences.map((value) => value.status)),
        observedAppliedEffects: seenEffectIds.size,
        sourcedMemories: sourcedMemoryIds.size, sourcedFacts: sourcedFactIds.size,
        metricDeltas,
        delayedApplied: allConsequences.filter((value) => {
          const selectedAt = decisions.get(value.decisionId)?.selectedAt;
          return value.status === "applied" && value.resolvedAt && selectedAt &&
            (value.resolvedAt.season > selectedAt.season ||
              (value.resolvedAt.season === selectedAt.season && value.resolvedAt.week > selectedAt.week));
        }).length,
        unresolvedDueAtFinal: allConsequences.filter((value) => finalConsequenceIds.has(value.id) && value.status === "pending" && final &&
          (value.dueAt.season < final.season || (value.dueAt.season === final.season && value.dueAt.week < final.week))),
        failed: allConsequences.filter((value) => value.status === "failed"),
      },
      repetition: {
        narrativeEvents: allNarratives.length,
        exactRepeatedTextGroups: [...repeatedText.values()].filter((value) => value.eventIds.length > 1),
        narrativeTypes: countBy(allNarratives.map((value) => value.type)),
        authoredSpecialEventIds: countBy(allNarratives.flatMap((value) => value.specialEventId ? [value.specialEventId] : [])),
      },
      finance: {
        initialBalance, finalBalance: final?.balance ?? null,
        minimumBalance: balances.length ? Math.min(...balances) : null,
        maximumBalance: balances.length ? Math.max(...balances) : null,
        negativeBalanceWeeks: samples.filter((sample) => sample.tick > 0 && sample.balance !== null && sample.balance < 0).length,
        finalDebt: final?.debt ?? null,
        grossCashInExcludingOpening: sum(cashMovements.filter((value) => value.amount > 0).map((value) => value.amount)),
        grossCashOut: -sum(cashMovements.filter((value) => value.amount < 0).map((value) => value.amount)),
        earnedClassifiedReceipts: sum(cashMovements.filter((value) => value.amount > 0 &&
          ["salary", "clientRevenue", "placement", "bonus"].includes(value.category ?? "")).map((value) => value.amount)),
        unclassifiedPositiveCash: sum(cashMovements.filter((value) => value.amount > 0 && !value.category).map((value) => value.amount)),
        duplicateTransactionReferences,
        transactionCount: transactions.length,
        ledgerBalanceDifference: final?.balance === null || final?.balance === undefined
          ? null : final.balance - sum(transactions.map((value) => value.amount)),
        nonFiniteTransactionIndices: transactions.flatMap((value, index) => Number.isFinite(value.amount) ? [] : [index]),
      },
      relationships: {
        initialCount: Object.keys(initial?.contactRelationships ?? {}).length,
        finalCount: finalContactIds.length,
        comparableContactChanges: comparableContacts.map((id) => ({ id,
          before: initial!.contactRelationships[id], after: final!.contactRelationships[id],
          delta: final!.contactRelationships[id] - initial!.contactRelationships[id] })),
        lostContactIds: Object.keys(initial?.contactRelationships ?? {}).filter((id) => !finalContactIds.includes(id)),
      },
      reportOutcomes: countBy([...clubDecisions.values()].map((decision) => decision.outcome)),
      finalCareer: final ? { reputation: final.reputation, tier: final.careerTier,
        path: final.careerPath, rivalWins: final.rivalWins, rivalLosses: final.rivalLosses } : null,
      // These are actual persisted, generated records, retained for reviewing counterexamples.
      weekly: samples, decisionRecords: allDecisions, consequenceRecords: allConsequences,
      narrativeRecords: allNarratives, clubDecisionRecords: [...clubDecisions.values()],
    };
  }
  return { observe, finish };
}
