import type { GameState, InboxMessage, NarrativeEvent } from "@/engine/core/types";
import { getSeasonLength } from "@/engine/core/gameLoop";
import {
  compactCompletedSeasonHistory,
} from "@/engine/core/weeklySimulationPipeline";
import { createRNG } from "@/engine/rng";
import {
  isCareerRecoveryBlockingOffers,
  processCareerRecoveryWeek,
} from "@/engine/career/recovery";
import {
  ensureLeadershipDelegationTeam,
  processLeadershipPortfolioWeek,
} from "@/engine/career/leadership";
import {
  careerMomentFromLeadership,
  careerMomentFromNarrativeEvent,
  careerMomentFromPerformanceReview,
  careerMomentFromRecovery,
  createCareerMoment,
  enqueueCareerMoments,
  type CareerMoment,
} from "@/engine/career/careerMoments";
import { getCareerSeasonOrdinal } from "@/engine/career/legacy";
import { createStakeholderProfileRegistry } from "@/engine/consequences/stakeholderProfiles";
import { reconcileInboxActionRequirements } from "@/engine/world/inboxActionAuthority";
import { clearTerminalNarrativeInboxActions } from "./narrativeInboxState";

/** Return narrative age for the bounded ten-week retention window. */
export function getNarrativeRetentionAge(
  event: Pick<NarrativeEvent, "season" | "week">,
  current: { season: number; week: number },
  previousSeasonLength: number,
): number {
  if (event.season > current.season) return Number.NEGATIVE_INFINITY;
  if (event.season === current.season) return current.week - event.week;
  if (event.season === current.season - 1) {
    return previousSeasonLength - event.week + current.week;
  }
  return Number.POSITIVE_INFINITY;
}

/** Reconcile recurring cast identity after contacts, staff, and rivals move. */
export function refreshWeeklyStakeholderProfiles(state: GameState): GameState {
  return {
    ...state,
    stakeholderProfiles: createStakeholderProfileRegistry(
      state,
      state.stakeholderProfiles,
    ),
  };
}

function repairAndPruneWeeklyInbox(state: GameState): GameState {
  let nextState = state;
  const repairedNarrativeInbox = clearTerminalNarrativeInboxActions(
    nextState.inbox,
    nextState.narrativeEvents,
  );
  if (repairedNarrativeInbox !== nextState.inbox) {
    nextState = { ...nextState, inbox: repairedNarrativeInbox };
  }

  const reconciledInbox = reconcileInboxActionRequirements(nextState);
  if (reconciledInbox !== nextState.inbox) {
    nextState = { ...nextState, inbox: reconciledInbox };
  }

  if (nextState.inbox.length > 200) {
    const priority = nextState.inbox.filter((message) => message.actionRequired && !message.read);
    const rest = nextState.inbox.filter((message) => !(message.actionRequired && !message.read));
    const trimmedRest = rest.slice(-Math.max(0, 200 - priority.length));
    nextState = { ...nextState, inbox: [...trimmedRest, ...priority] };
  }
  return nextState;
}

function pruneAcknowledgedNarratives(state: GameState): GameState {
  if (state.narrativeEvents.length === 0) return state;
  const previousSeasonLength = getSeasonLength(
    state.fixtures,
    Math.max(1, state.currentSeason - 1),
  );
  return {
    ...state,
    narrativeEvents: state.narrativeEvents.filter((event) =>
      !event.acknowledged
      || getNarrativeRetentionAge(
        event,
        { season: state.currentSeason, week: state.currentWeek },
        previousSeasonLength,
      ) < 10
    ),
  };
}

function updateLegacyHighWater(state: GameState): GameState {
  return {
    ...state,
    legacyScore: {
      ...state.legacyScore,
      careerHighTier: Math.max(state.legacyScore.careerHighTier, state.scout.careerTier),
      totalSeasons: Math.max(
        state.legacyScore.totalSeasons,
        getCareerSeasonOrdinal(state.currentSeason) - 1,
      ),
    },
  };
}

function processWeeklyLeadership(state: GameState): GameState {
  const leadershipBootstrap = isCareerRecoveryBlockingOffers(state)
    ? { state, addedScoutIds: [] }
    : ensureLeadershipDelegationTeam(
        state,
        createRNG(
          `${state.seed}-leadership-bootstrap-${state.scout.id}-tier${state.scout.careerTier}`,
        ),
      );
  let nextState = leadershipBootstrap.state;
  if (leadershipBootstrap.addedScoutIds.length > 0) {
    const message: InboxMessage = {
      id: `leadership-team-tier${nextState.scout.careerTier}`,
      week: nextState.currentWeek,
      season: nextState.currentSeason,
      type: "event",
      title: "Your scouting team is ready",
      body: `${leadershipBootstrap.addedScoutIds.length} scouts have joined your department and received regional assignments. You can now delegate focused player follow-ups from NPC Scout Management.`,
      read: false,
      actionRequired: false,
    };
    nextState = { ...nextState, inbox: [...nextState.inbox, message] };
  }
  return processLeadershipPortfolioWeek(nextState);
}

function collectCareerMoments(previousState: GameState, state: GameState): CareerMoment[] {
  const moments: CareerMoment[] = [];
  const priorNarrativeIds = new Set(previousState.narrativeEvents.map((event) => event.id));
  for (const event of state.narrativeEvents) {
    if (priorNarrativeIds.has(event.id)) continue;
    const moment = careerMomentFromNarrativeEvent(event, state.runManifest.rootSeed);
    if (moment) moments.push(moment);
  }

  const priorReviewKeys = new Set(previousState.performanceReviews.map((review) =>
    `${review.season}:${review.outcome}`,
  ));
  for (const review of state.performanceReviews) {
    if (priorReviewKeys.has(`${review.season}:${review.outcome}`)) continue;
    const moment = careerMomentFromPerformanceReview(
      review,
      state.runManifest.rootSeed,
      { week: state.currentWeek, season: state.currentSeason },
    );
    if (moment) moments.push(moment);
  }

  const previousRecoveryStatus = new Map(
    [previousState.careerRecovery?.current, ...(previousState.careerRecovery?.history ?? [])]
      .filter((episode): episode is NonNullable<typeof episode> => Boolean(episode))
      .map((episode) => [episode.id, episode.status]),
  );
  for (const episode of [state.careerRecovery?.current, ...(state.careerRecovery?.history ?? [])]) {
    if (!episode || previousRecoveryStatus.get(episode.id) === episode.status) continue;
    const moment = careerMomentFromRecovery(episode, state.runManifest.rootSeed);
    if (moment) moments.push(moment);
  }

  const previousLeadershipStatus = new Map(
    Object.values(previousState.leadershipPortfolio?.responsibilities ?? {})
      .map((responsibility) => [responsibility.id, responsibility.status]),
  );
  for (const responsibility of Object.values(
    state.leadershipPortfolio?.responsibilities ?? {},
  )) {
    if (previousLeadershipStatus.get(responsibility.id) === responsibility.status) continue;
    const moment = careerMomentFromLeadership(responsibility, state.runManifest.rootSeed);
    if (moment) moments.push(moment);
  }

  for (const consequence of Object.values(state.consequenceState.consequences)) {
    const previousStatus = previousState.consequenceState.consequences[consequence.id]?.status;
    if (consequence.status !== "applied" || previousStatus === "applied") continue;
    const isLateCareerCallback = consequence.tags.includes("lateCareerDilemma")
      && consequence.tags.includes("callback");
    const isTurningPoint = consequence.tags.includes("turning-point");
    if (!isLateCareerCallback && !isTurningPoint) continue;
    const decision = state.consequenceState.decisions[consequence.decisionId];
    const positive = consequence.tags.includes("favorable")
      || consequence.tags.includes("crossroads-success");
    const title = typeof decision?.metadata?.title === "string"
      ? decision.metadata.title
      : positive ? "Your judgment was vindicated" : "The risk came due";
    const selectedOption = decision?.options.find(
      (option) => option.id === decision.selectedOptionId,
    );
    moments.push(createCareerMoment({
      rootSeed: state.runManifest.rootSeed,
      id: `consequence:${consequence.id}`,
      source: { kind: "consequence", id: consequence.id },
      occurredAt: { week: state.currentWeek, season: state.currentSeason },
      category: positive ? "vindication" : "failure",
      tone: positive ? "positive" : "negative",
      magnitude: isLateCareerCallback ? "careerDefining" : "major",
      cue: positive ? "vindication" : "failure",
      title,
      summary: selectedOption
        ? `${selectedOption.label} produced its long-term ${positive ? "vindication" : "cost"}. The outcome is now part of your permanent career record.`
        : `A long-running decision produced its ${positive ? "favorable" : "costly"} outcome.`,
      playerId: typeof decision?.metadata?.relatedPlayerId === "string"
        ? decision.metadata.relatedPlayerId
        : undefined,
      stakeholderIds: decision?.stakeholders.map((stakeholder) => stakeholder.id) ?? [],
      tags: consequence.tags,
    }));
  }
  return moments;
}

/**
 * Complete retention, recovery, leadership, callbacks, archive compaction, and
 * recurring-cast refresh in their established authoritative order.
 */
export function finalizeWeeklyState(
  previousState: GameState,
  inputState: GameState,
): GameState {
  let state = repairAndPruneWeeklyInbox(inputState);
  state = pruneAcknowledgedNarratives(state);
  state = updateLegacyHighWater(state);
  state = processCareerRecoveryWeek(state, previousState.schedule);
  state = processWeeklyLeadership(state);

  const momentCandidates = collectCareerMoments(previousState, state);
  if (momentCandidates.length > 0) {
    state = {
      ...state,
      careerMoments: enqueueCareerMoments(
        state.careerMoments,
        momentCandidates,
        { week: state.currentWeek, season: state.currentSeason },
      ),
    };
  }
  state = compactCompletedSeasonHistory(previousState, state);
  return refreshWeeklyStakeholderProfiles(state);
}
