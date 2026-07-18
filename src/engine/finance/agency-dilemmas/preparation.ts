import { createDecisionRecord, registerDecision } from "@/engine/consequences";
import type { GameState, InboxMessage } from "@/engine/core/types";
import { addGameWeeks } from "@/engine/core/gameDate";
import type {
  AgencyDilemmaContext,
  AgencyDilemmaDirectionResult,
  AgencyDilemmaPreparedInput,
  AgencyDilemmaPreparationResult,
} from "./types";
import {
  AGENCY_DILEMMA_COOLDOWN_WEEKS,
  AGENCY_DILEMMA_TRIGGER_CHANCE,
} from "./types";
import {
  clamp,
  createContextDecisionId,
  gameDate,
  hasOpenAgencyDilemma,
  lastAgencyDilemmaDate,
  seasonLength,
} from "./helpers";
import { chooseAgencyDilemmaContext, eligibleAgencyDilemmaContexts } from "./contexts";
import type { StoryCandidateV2 } from "@/engine/events/storyDirectorV2";
import { createNamedRNG } from "@/engine/run";

export function prepareWeeklyAgencyDilemmaCandidate(
  input: AgencyDilemmaPreparedInput,
): AgencyDilemmaPreparationResult {
  const { state } = input;
  if (state.scout.careerPath !== "independent" || !state.finances) {
    return { blockedReason: "wrong-path" };
  }
  if (hasOpenAgencyDilemma(state)) {
    return { blockedReason: "open-decision" };
  }
  const lastDate = lastAgencyDilemmaDate(state);
  if (lastDate) {
    const elapsed = (state.currentSeason - lastDate.season) * seasonLength(state)
      + (state.currentWeek - lastDate.week);
    if (elapsed < AGENCY_DILEMMA_COOLDOWN_WEEKS) {
      return { blockedReason: "cooldown" };
    }
  }
  const contexts = eligibleAgencyDilemmaContexts(state);
  if (contexts.length === 0) {
    return { blockedReason: "no-eligible-dilemma" };
  }
  const triggerChance = clamp(input.triggerChance ?? AGENCY_DILEMMA_TRIGGER_CHANCE, 0, 1);
  const triggerRng = createNamedRNG(
    state.runManifest.rootSeed,
    "agency-dilemma-trigger",
    state.currentSeason,
    state.currentWeek,
  );
  if (!input.forceTrigger && !triggerRng.chance(triggerChance)) {
    return { blockedReason: "trigger-missed" };
  }
  const context = chooseAgencyDilemmaContext(state, contexts);
  const decisionId = createContextDecisionId(state, context);
  const candidate: StoryCandidateV2 = {
    id: decisionId,
    templateId: `agency-dilemma:${context.id}`,
    kind: "special",
    category: "agency-strategy",
    semanticSignature: context.semanticSignature,
    baseWeight: 1 + context.pressureScore / 100,
    cast: context.cast,
    topics: context.topics,
    requiresChoice: true,
    templateCooldownWeeks: AGENCY_DILEMMA_COOLDOWN_WEEKS,
    semanticCooldownWeeks: AGENCY_DILEMMA_COOLDOWN_WEEKS,
    castWindowWeeks: 10,
    castMaxUses: 1,
    topicCooldownWeeks: 6,
    relevanceMultipliers: [1 + context.pressureScore / 120],
  };
  return { prepared: { candidate, context } };
}

function createDecisionFromContext(state: GameState, context: AgencyDilemmaContext) {
  const offeredAt = gameDate(state);
  const decisionId = createContextDecisionId(state, context);
  return createDecisionRecord({
    id: decisionId,
    source: { kind: "agencyDilemma", id: context.id },
    offeredAt,
    deadlineAt: addGameWeeks(state.fixtures, offeredAt, 2),
    visibility: "stakeholders",
    stakeholders: context.cast,
    options: context.options.map((option) => ({
      id: option.id,
      label: option.label,
      knownTradeoffs: [...option.knownTradeoffs],
      immediateEffects: [...option.immediateEffects],
      scheduledConsequences: [...option.scheduledConsequences],
    })),
    defaultOptionId: context.options[1]?.id ?? context.options[0]?.id,
    outcomeRoll: createNamedRNG(
      state.runManifest.rootSeed,
      "agency-dilemma-decision",
      decisionId,
    ).next(),
    metadata: {
      dilemmaId: context.id,
      title: context.title,
      premise: context.premise,
      anchorClientId: context.anchorClientId ?? null,
      alternateClientIds: context.alternateClientIds.join("|"),
      deputyEmployeeId: context.deputyEmployeeId ?? null,
      regionId: context.regionId ?? null,
      focusRegionId: context.focusRegionId ?? null,
      policyFocusRegionId: context.policyFocusRegionId ?? null,
      targetClubId: context.targetClubId ?? null,
    },
  });
}

export function applyPreparedAgencyDilemma(
  state: GameState,
  prepared: { context: AgencyDilemmaContext },
): AgencyDilemmaDirectionResult {
  const decision = createDecisionFromContext(state, prepared.context);
  const registered = registerDecision(state.consequenceState, decision);
  if (registered.error) {
    return { state, blockedReason: "registration-failed" };
  }
  const message: InboxMessage = {
    id: `inbox:${decision.id}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "event",
    title: prepared.context.title,
    body: prepared.context.premise,
    read: false,
    actionRequired: true,
    relatedId: decision.id,
    relatedEntityType: "narrative",
  };
  return {
    state: {
      ...state,
      consequenceState: registered.state,
      inbox: state.inbox.some((entry) => entry.id === message.id)
        ? state.inbox
        : [...state.inbox, message],
    },
    offeredDecisionId: decision.id,
  };
}
