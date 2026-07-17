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
import type { EntityRef } from "@/engine/consequences";
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
import {
  applyConsequences,
  applyNarrativeRelationshipChoice,
  applyRivalPoachBidConcession,
} from "./progressionActions";
import {
  createWorldConditionArcState,
  reconcileWorldConditionArcDecisions,
} from "@/engine/world/worldConditionArcs";

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
      if (!consequence?.tags.includes("turning-point")) return [];
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
