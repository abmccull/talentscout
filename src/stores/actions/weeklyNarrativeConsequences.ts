import type { GameState, InboxMessage, NarrativeEvent } from "@/engine/core/types";
import { getSeasonLength } from "@/engine/core/gameLoop";
import { createRNG } from "@/engine/rng";
import {
  appendDecisionConsequence,
  archiveMaterialCareerStories,
  ensureNarrativeDecision,
  expireDueDecisions,
  maintainConsequenceLifecycle,
  processDueConsequences,
  projectConsequenceMetrics,
  synchronizeConsequenceMetrics,
} from "@/engine/consequences";
import type { ConsequenceRecord, EntityRef } from "@/engine/consequences";
import { resolveManagerStakeholderName } from "@/engine/consequences/stakeholderProfiles";
import {
  computeChainChoiceEffects,
  resolveChainChoice,
  resolveEventChoice,
  resolveStorylineChoice,
} from "@/engine/events";
import {
  clearTerminalConsequenceInboxActions,
  clearTerminalNarrativeInboxActions,
} from "./narrativeInboxState";
import { reconcileAgencyDilemmaDecisions } from "@/engine/finance";
import {
  applyConsequences,
  applyNarrativeRelationshipChoice,
  applyRivalPoachBidConcession,
} from "./progressionActions";
import {
  createWorldConditionArcState,
  reconcileWorldConditionArcDecisions,
} from "@/engine/world/worldConditionArcs";
import { reconcileRivalCampaignDecisions } from "./weeklyRivalCampaigns";
import { projectCurrentPlayerCareerEnvironment } from "@/engine/world/developmentEnvironment";

export function registerNarrativeDecisions(
  state: GameState,
  events: NarrativeEvent[],
): GameState {
  return events.reduce(
    (current, event) => ensureNarrativeDecision(current, event),
    state,
  );
}

function resolveArchivedEntityName(state: GameState, entity: EntityRef): string | undefined {
  const player = state.players[entity.id]
    ?? state.retiredPlayers[entity.id]
    ?? state.unsignedYouth[entity.id]?.player;
  if (player) {
    const name = `${player.firstName ?? ""} ${player.lastName ?? ""}`.trim();
    return entity.kind === "family" ? `${name || "Player"}'s family` : name || undefined;
  }
  if (state.contacts[entity.id]) return state.contacts[entity.id].name;
  if (state.clubs[entity.id]) return state.clubs[entity.id].name;
  if (state.rivalScouts[entity.id]) return state.rivalScouts[entity.id].name;
  const employee = state.finances?.employees.find((candidate) => candidate.id === entity.id);
  if (employee) return employee.name;
  const npcScout = state.npcScouts[entity.id];
  if (npcScout) return `${npcScout.firstName} ${npcScout.lastName}`;
  if (entity.kind === "manager") {
    const managerName = resolveManagerStakeholderName(state, entity.id);
    if (managerName) return managerName;
  }
  if (entity.kind === "scout" && entity.id === state.scout.id) {
    return `${state.scout.firstName} ${state.scout.lastName}`.trim();
  }
  return undefined;
}

function readableCallbackLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function describeCallbackStateChange(
  state: GameState,
  consequence: ConsequenceRecord,
): string | undefined {
  let recordedDetail: string | undefined;
  for (const effect of consequence.effects) {
    switch (effect.type) {
      case "createObligation": {
        const creditor = resolveArchivedEntityName(state, effect.obligation.creditor)
          ?? readableCallbackLabel(effect.obligation.creditor.kind);
        return `Next state: you now owe ${creditor} ${effect.obligation.terms}.`;
      }
      case "transitionObligation": {
        const obligation = state.consequenceState.obligations[effect.obligationId];
        const creditor = obligation
          ? resolveArchivedEntityName(state, obligation.creditor)
          : undefined;
        const counterparty = creditor ?? "the stakeholder involved";
        const obligationLabel = obligation?.kind
          ? readableCallbackLabel(obligation.kind)
          : "relationship";
        return `Next state: the ${obligationLabel.toLowerCase()} obligation with ${counterparty} is now ${effect.status}.`;
      }
      case "createOpportunityLock": {
        const label = typeof effect.lock.metadata?.label === "string"
          ? effect.lock.metadata.label
          : readableCallbackLabel(effect.lock.opportunityId);
        const subject = typeof effect.lock.metadata?.playerName === "string"
          ? effect.lock.metadata.playerName
          : undefined;
        const expiry = effect.lock.expiresAt
          ? ` until S${effect.lock.expiresAt.season} W${effect.lock.expiresAt.week}`
          : "";
        return `Next state: ${label}${subject ? ` around ${subject}` : ""} is live${expiry}.`;
      }
      case "transitionOpportunityLock": {
        const lock = state.consequenceState.opportunityLocks[effect.opportunityLockId];
        const label = typeof lock?.metadata?.label === "string"
          ? lock.metadata.label
          : lock
            ? readableCallbackLabel(lock.opportunityId)
            : "The access window";
        return `Next state: ${label} is now ${effect.status}.`;
      }
      case "recordFact": {
        const detail = effect.fact.metadata?.detail;
        if (typeof detail === "string" && detail.trim().length > 0) {
          recordedDetail ??= detail.trim();
        }
        break;
      }
      default:
        break;
    }
  }
  return recordedDetail ? `Next state: ${recordedDetail}` : undefined;
}

/** Make delayed relationship fallout visible instead of silently moving meters. */
export function createRelationshipCallbackMessage(
  state: GameState,
  consequence: ConsequenceRecord,
): InboxMessage | undefined {
  if (!consequence.tags.includes("relationshipConflict")) return undefined;
  const decision = state.consequenceState.decisions[consequence.decisionId];
  if (!decision || decision.source.kind !== "relationshipConflict") return undefined;
  const option = decision.options.find((candidate) => candidate.id === consequence.optionId);
  const recurrenceName = typeof decision.metadata?.recurrenceName === "string"
    ? decision.metadata.recurrenceName
    : "A relationship promise";
  const playerId = typeof decision.metadata?.relatedPlayerId === "string"
    && decision.metadata.relatedPlayerId.length > 0
    ? decision.metadata.relatedPlayerId
    : undefined;
  const playerName = playerId
    ? resolveArchivedEntityName(state, { kind: "player", id: playerId })
    : undefined;
  const stakeholders = decision.stakeholders
    .map((entity) => resolveArchivedEntityName(state, entity))
    .filter((name): name is string => Boolean(name));
  const callbackLabel = readableCallbackLabel(consequence.templateId);
  const choiceLabel = option?.label ?? readableCallbackLabel(consequence.optionId ?? "recorded choice");
  const subject = playerName ? ` around ${playerName}` : "";
  const castLine = stakeholders.length > 0
    ? `${stakeholders.join(" and ")} have now come back to how you handled it${subject}.`
    : `The people involved have now come back to how you handled it${subject}.`;
  const stateChange = describeCallbackStateChange(state, consequence)
    ?? "Next state: the relationship now carries a visible consequence instead of moving silently in the background.";
  return {
    id: `relationship-callback-${consequence.id}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "feedback",
    title: `${recurrenceName}: ${callbackLabel}`,
    body: [
      castLine,
      `Remembered decision: "${choiceLabel}".`,
      stateChange,
    ].join("\n"),
    read: false,
    actionRequired: false,
    relatedId: playerId ?? consequence.decisionId,
    relatedEntityType: playerId ? "player" : "narrative",
  };
}

/** Compare a chosen pathway intervention with the player's live world state. */
export function createActiveCareerFrontCallbackMessage(
  state: GameState,
  consequence: ConsequenceRecord,
): InboxMessage | undefined {
  if (!consequence.tags.includes("active-career-front")) return undefined;
  const decision = state.consequenceState.decisions[consequence.decisionId];
  if (!decision || decision.source.kind !== "activeCareerFront") return undefined;
  const playerId = typeof decision.metadata?.playerId === "string"
    ? decision.metadata.playerId
    : undefined;
  const player = playerId
    ? state.players[playerId] ?? state.retiredPlayers?.[playerId]
    : undefined;
  if (!player || !playerId) return undefined;

  const projection = projectCurrentPlayerCareerEnvironment(state, player);
  const originalScore = typeof decision.metadata?.originalEnvironmentScore === "number"
    ? decision.metadata.originalEnvironmentScore
    : projection.score;
  const scoreDelta = projection.score - originalScore;
  const selected = decision.options.find((option) => option.id === decision.selectedOptionId);
  const statusLine = scoreDelta >= 8
    ? `The route has opened: the visible environment improved from ${originalScore}/100 to ${projection.score}/100 (${projection.headline.toLowerCase()}).`
    : scoreDelta <= -8
      ? `The pressure deepened: the visible environment fell from ${originalScore}/100 to ${projection.score}/100 (${projection.headline.toLowerCase()}).`
      : `The route remains unsettled at ${projection.score}/100 (${projection.headline.toLowerCase()}); the original pressure has not materially moved.`;
  const name = `${player.firstName} ${player.lastName}`.trim() || "The player";
  return {
    id: `active-career-front-callback-${consequence.id}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "feedback",
    title: `${name}: pathway review`,
    body: [
      `Remembered response: "${selected?.label ?? "No response recorded"}."`,
      statusLine,
      `Current evidence: ${projection.summary}`,
      "The result now sits beside your original placement and will inform its later recommendation review.",
    ].join("\n\n"),
    read: false,
    actionRequired: false,
    relatedId: playerId,
    relatedEntityType: "player",
  };
}

/** Apply deadline-selected narrative defaults through the manual-choice domains. */
export function projectExpiredNarrativeDefaults(
  state: GameState,
  expiredDecisionIds: readonly string[],
): GameState {
  let updated = state;
  const candidateDecisionIds = [...new Set([
    ...expiredDecisionIds,
    ...Object.values(state.consequenceState.decisions)
      .filter((decision) =>
        decision.selectionKind === "default"
        && Boolean(decision.selectedOptionId)
        && decision.source.kind === "narrativeEvent"
      )
      .map((decision) => decision.id),
  ])].sort();

  for (const decisionId of candidateDecisionIds) {
    const decision = updated.consequenceState.decisions[decisionId];
    if (
      !decision
      || decision.selectionKind !== "default"
      || !decision.selectedOptionId
      || decision.source.kind !== "narrativeEvent"
    ) continue;

    const event = updated.narrativeEvents.find(
      (candidate) => candidate.id === decision.source.id,
    );
    if (!event || event.selectedChoice !== undefined || !event.choices) continue;
    const choiceIndex = decision.options.findIndex(
      (option) => option.id === decision.selectedOptionId,
    );
    if (choiceIndex < 0 || !event.choices[choiceIndex]) continue;

    const resolveRng = createRNG(
      `${updated.seed}-event-resolve-${event.id}-${choiceIndex}`,
    );
    let eventResult;
    try {
      eventResult = resolveEventChoice(event, choiceIndex, updated, resolveRng);
    } catch {
      continue;
    }

    let reputationChange = eventResult.reputationChange;
    let fatigueChange = eventResult.fatigueChange;
    let chainReputationChange = 0;
    let chainFatigueChange = 0;
    let updatedChains = updated.eventChains ?? [];
    if (event.chainId) {
      const chain = updatedChains.find((candidate) => candidate.id === event.chainId);
      if (chain) {
        const stepIndex = event.chainStep !== undefined
          ? Math.max(0, event.chainStep - 1)
          : undefined;
        const chainEffects = computeChainChoiceEffects(
          chain,
          choiceIndex,
          resolveRng,
          stepIndex,
        );
        chainReputationChange = chainEffects.reputationChange;
        chainFatigueChange = chainEffects.fatigueChange;
        reputationChange += chainReputationChange;
        fatigueChange += chainFatigueChange;
        const resolvedChain = resolveChainChoice(
          chain,
          event.id,
          choiceIndex,
          stepIndex,
        );
        updatedChains = updatedChains.map((candidate) =>
          candidate.id === chain.id ? resolvedChain : candidate,
        );
      }
    }

    let updatedStorylines = updated.activeStorylines;
    let storylineMessage: InboxMessage | undefined;
    if (event.storylineId) {
      const storyline = updatedStorylines.find(
        (candidate) => candidate.id === event.storylineId,
      );
      if (storyline) {
        const storylineResult = resolveStorylineChoice(
          storyline,
          event.storylineStage ?? Math.max(0, storyline.currentStage - 1),
          choiceIndex,
          resolveRng,
          event.id,
        );
        reputationChange = storylineResult.reputationChange + chainReputationChange;
        fatigueChange = storylineResult.fatigueChange + chainFatigueChange;
        updatedStorylines = updatedStorylines.map((candidate) =>
          candidate.id === storyline.id ? storylineResult.storyline : candidate,
        );
        if (storylineResult.message) {
          storylineMessage = {
            id: `storyline-choice-${event.id}-${choiceIndex}`,
            week: updated.currentWeek,
            season: updated.currentSeason,
            type: "feedback",
            title: `${storyline.name}: Deadline Decision Recorded`,
            body: storylineResult.message,
            read: false,
            actionRequired: false,
            relatedId: event.id,
            relatedEntityType: "narrative",
          };
        }
      }
    }

    const reputationMetric = "scout:reputation";
    const fatigueMetric = "scout:fatigue";
    const now = { week: updated.currentWeek, season: updated.currentSeason };
    const causalBase = {
      ...updated.consequenceState,
      metrics: {
        ...updated.consequenceState.metrics,
        [reputationMetric]: updated.scout.reputation,
        [fatigueMetric]: updated.scout.fatigue,
      },
    };
    const appended = appendDecisionConsequence(
      causalBase,
      decisionId,
      "narrative-default-core-outcome",
      [
        {
          id: `effect:${decisionId}:default-reputation`,
          type: "adjustMetric",
          metricKey: reputationMetric,
          delta: reputationChange,
          min: 0,
          max: 100,
        },
        {
          id: `effect:${decisionId}:default-fatigue`,
          type: "adjustMetric",
          metricKey: fatigueMetric,
          delta: fatigueChange,
          min: 0,
          max: 100,
        },
      ],
      now,
      { tags: ["narrative", event.type, "deadline-default"] },
    );
    if (appended.error) continue;
    const processed = processDueConsequences(
      appended.state,
      now,
      getSeasonLength(updated.fixtures, updated.currentSeason),
    );

    updated = {
      ...updated,
      consequenceState: processed.state,
      narrativeEvents: updated.narrativeEvents.map((candidate) =>
        candidate.id === event.id ? eventResult.updatedEvent : candidate,
      ),
      eventChains: updatedChains,
      activeStorylines: updatedStorylines,
      scout: {
        ...updated.scout,
        reputation: Math.round(
          Math.min(100, Math.max(0, processed.state.metrics[reputationMetric])) * 1_000,
        ) / 1_000,
        fatigue: Math.round(processed.state.metrics[fatigueMetric]),
      },
      inbox: [
        ...updated.inbox,
        ...(storylineMessage ? [storylineMessage] : eventResult.messages),
        ...processed.errors.map((error, index) => ({
          id: `consequence-warning:${decisionId}:s${updated.currentSeason}w${updated.currentWeek}:${index}`,
          week: updated.currentWeek,
          season: updated.currentSeason,
          type: "warning" as const,
          title: "A linked consequence could not be applied",
          body: `The deadline choice was recorded. One invalid follow-up was safely closed instead of blocking the result. ${error}`,
          read: false,
          actionRequired: false,
          relatedId: decisionId,
        })),
      ],
    };
    if (eventResult.updatedEvent.consequences?.length) {
      updated = applyConsequences(updated, eventResult.updatedEvent.consequences);
    }
    updated = applyNarrativeRelationshipChoice(updated, event, choiceIndex);
    updated = applyRivalPoachBidConcession(updated, event, choiceIndex);
  }

  const repairedInbox = clearTerminalNarrativeInboxActions(
    updated.inbox,
    updated.narrativeEvents,
  );
  return repairedInbox === updated.inbox
    ? updated
    : { ...updated, inbox: repairedInbox };
}

/** Resolve delayed consequences after the world date advances. */
export function processWeeklyConsequenceLifecycle(state: GameState): GameState {
  const date = { week: state.currentWeek, season: state.currentSeason };
  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const expiredDecisions = expireDueDecisions(
    state.consequenceState,
    date,
    seasonLength,
  );
  const expiredDecisionState = synchronizeConsequenceMetrics(
    state,
    expiredDecisions.state,
  );
  let updated = projectExpiredNarrativeDefaults(
    { ...state, consequenceState: expiredDecisionState },
    expiredDecisions.expiredDecisionIds,
  );
  updated = {
    ...updated,
    worldConditionArcState: reconcileWorldConditionArcDecisions({
      state: createWorldConditionArcState(
        updated.worldConditionArcState,
        updated.countries,
      ),
      decisions: updated.consequenceState.decisions,
      now: date,
      seasonLength,
    }),
  };
  updated = reconcileAgencyDilemmaDecisions(updated, date);
  updated = reconcileRivalCampaignDecisions(updated, date);
  const synchronized = synchronizeConsequenceMetrics(
    updated,
    updated.consequenceState,
  );
  const processed = processDueConsequences(synchronized, date, seasonLength);
  const archived = archiveMaterialCareerStories({
    state: processed.state,
    archive: updated.careerStoryArchive,
    rootSeed: updated.runManifest.rootSeed,
    resolveEntityName: (entity) => resolveArchivedEntityName(updated, entity),
  });
  const maintained = maintainConsequenceLifecycle(
    processed.state,
    date,
    seasonLength,
  );
  const outcomeMessages: InboxMessage[] = processed.appliedConsequenceIds.flatMap(
    (consequenceId) => {
      const consequence = processed.state.consequences[consequenceId];
      if (!consequence) return [];
      const activeFrontMessage = createActiveCareerFrontCallbackMessage(updated, consequence);
      if (activeFrontMessage) return [activeFrontMessage];
      const relationshipMessage = createRelationshipCallbackMessage(updated, consequence);
      if (relationshipMessage) return [relationshipMessage];
      if (!consequence.tags.includes("turning-point")) return [];
      const success = consequence.tags.includes("crossroads-success");
      const reputationEffect = consequence.effects.find((effect) =>
        effect.type === "adjustMetric" && effect.metricKey === "scout:reputation",
      );
      const delta = reputationEffect?.type === "adjustMetric"
        ? reputationEffect.delta
        : 0;
      return [{
        id: `consequence-outcome-${consequence.id}`,
        week: date.week,
        season: date.season,
        type: "feedback" as const,
        title: success
          ? "Career Crossroads: Vindicated"
          : "Career Crossroads: The Risk Came Due",
        body: success
          ? `The recommendation has paid off. The football world now connects the decision to your judgment, changing your reputation by +${delta}.`
          : `The recommendation did not deliver. Because your name was attached to the call, your reputation changes by ${delta}. The result is now part of your permanent decision history.`,
        read: false,
        actionRequired: false,
        relatedId: consequence.decisionId,
        relatedEntityType: "narrative" as const,
      }];
    },
  );
  const errors = [
    ...(expiredDecisions.error ? [expiredDecisions.error] : []),
    ...processed.errors,
  ];

  updated = {
    ...updated,
    careerStoryArchive: archived.archive,
    consequenceState: maintained.state,
    inbox: errors.length === 0 && outcomeMessages.length === 0
      ? updated.inbox
      : [
          ...updated.inbox,
          ...outcomeMessages,
          ...errors.map((error, index) => ({
            id: `consequence-error-s${updated.currentSeason}w${updated.currentWeek}-${index}`,
            week: updated.currentWeek,
            season: updated.currentSeason,
            type: "warning" as const,
            title: "A delayed consequence could not be resolved",
            body: error,
            read: false,
            actionRequired: false,
          })),
        ],
  };
  const terminalDecisionIds = new Set(
    [
      ...archived.archivedDecisionIds,
      ...Object.values(maintained.state.decisions)
        .filter((decision) => decision.status !== "offered")
        .map((decision) => decision.id),
    ],
  );
  if (terminalDecisionIds.size > 0) {
    updated = {
      ...updated,
      inbox: updated.inbox.map((message) =>
        message.relatedId && terminalDecisionIds.has(message.relatedId)
          ? { ...message, actionRequired: false }
          : message,
      ),
    };
  }
  const projected = projectConsequenceMetrics(updated, maintained.state);
  const repairedInbox = clearTerminalConsequenceInboxActions(
    projected.inbox,
    maintained.state,
  );
  return repairedInbox === projected.inbox
    ? projected
    : { ...projected, inbox: repairedInbox };
}
