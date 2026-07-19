import type { GameState, InboxMessage } from "@/engine/core/types";
import { getSeasonLength } from "@/engine/core/gameLoop";
import { getRunSimulationModifiers } from "@/engine/run";
import { createRNG } from "@/engine/rng";
import { applyAcceptedNarrativeConsequences } from "@/engine/world/acceptedNarrativeConsequences";
import {
  checkStorylineTriggers,
  createStoryDirectorStateV2,
  directWeeklyNarrativeEvent,
  directWeeklyStoryEmissionsV2,
  inferNarrativeEntityRefsV2,
  processActiveStorylines,
  recordEventDirectorOutcome,
  type WeeklyNarrativeEmissionV2,
} from "@/engine/events";
import {
  applyDirectedWorldPulse,
  prepareWeeklyWorldPulse,
} from "@/engine/events/worldPulse";
import type { RivalOrganizationOpportunity } from "@/engine/rivals/organizations";
import { directWeeklyYouthProfessionalCase } from "@/engine/youth";
import { registerNarrativeDecisions } from "./weeklyNarrativeConsequences";
import {
  applyDirectedWeeklyScoutingEcology,
  prepareWeeklyScoutingEcology,
} from "./weeklyScoutingEcologyPhase";
import {
  applyDirectedWeeklyRivalCampaigns,
  type PreparedWeeklyRivalCampaigns,
} from "./weeklyRivalCampaigns";
import {
  applyDirectedWorldConditionArcBeats,
  prepareWorldConditionArcWeek,
} from "./weeklyWorldConditionArcs";

export interface WeeklyNarrativeArbitrationInput {
  state: GameState;
  rivalOpportunity?: RivalOrganizationOpportunity;
  rivalCampaignWeek: PreparedWeeklyRivalCampaigns;
}

export interface WeeklyNarrativeArbitrationResult {
  state: GameState;
  acceptedNarrativeEventIds: string[];
  acceptedStoryCandidateIds: string[];
}

/**
 * Direct all weekly narrative sources through one seeded authority, then apply
 * only the accepted consequences. The order here is gameplay-critical: arcs
 * prepare before ecology, accepted narrative consequences land before directed
 * candidates, and the professional-case callback observes the completed phase.
 */
export function runWeeklyNarrativeArbitration({
  state: inputState,
  rivalOpportunity,
  rivalCampaignWeek,
}: WeeklyNarrativeArbitrationInput): WeeklyNarrativeArbitrationResult {
  let state = inputState.eventChains
    ? inputState
    : { ...inputState, eventChains: [] };

  const eventRng = createRNG(
    `${state.runManifest.rootSeed}-events-${state.currentWeek}-${state.currentSeason}`,
  );
  const priorNarrativeEvents = state.narrativeEvents;
  const priorEventDirector = state.eventDirector;
  const weeklyResult = directWeeklyNarrativeEvent(eventRng, state);
  const narrativeEvent = weeklyResult.event;

  const storylineRng = createRNG(
    `${state.runManifest.rootSeed}-storylines-${state.currentWeek}-${state.currentSeason}`,
  );
  const storylineModifiers = getRunSimulationModifiers(state.runManifest);
  const newStoryline = checkStorylineTriggers(
    state,
    storylineRng,
    0.05 * storylineModifiers.storylineChanceMultiplier,
  );
  const storylinesForProcessing = newStoryline
    ? [...state.activeStorylines, newStoryline]
    : state.activeStorylines;
  const storylineProcessingState = newStoryline
    ? { ...state, activeStorylines: storylinesForProcessing }
    : state;
  const { events: storylineEvents, updatedStorylines } = processActiveStorylines(
    storylineProcessingState,
    storylineRng,
  );

  const worldArcWeek = prepareWorldConditionArcWeek(state);
  state = worldArcWeek.state;
  const scoutingEcologyWeek = prepareWeeklyScoutingEcology({
    state,
    rivalOpportunity,
  });

  const emissions: WeeklyNarrativeEmissionV2[] = [];
  if (narrativeEvent) {
    emissions.push({
      event: narrativeEvent,
      ...inferNarrativeEntityRefsV2(state, narrativeEvent),
      chain: weeklyResult.advancedChain?.chain ?? weeklyResult.newChain?.chain,
      continuation: Boolean(weeklyResult.advancedChain),
    });
  }
  for (const event of storylineEvents) {
    emissions.push({
      event,
      ...inferNarrativeEntityRefsV2(state, event),
      storyline: updatedStorylines.find((storyline) => storyline.id === event.storylineId),
      continuation: !newStoryline || event.storylineId !== newStoryline.id,
    });
  }

  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const worldPulseWeek = prepareWeeklyWorldPulse({
    state,
    seasonLength,
    blockedByActivity:
      Boolean(narrativeEvent)
      || storylineEvents.length > 0
      || worldArcWeek.beats.length > 0
      || scoutingEcologyWeek.candidates.length > 0
      || rivalCampaignWeek.candidates.length > 0,
  });
  const storyDirection = directWeeklyStoryEmissionsV2({
    rootSeed: state.runManifest.rootSeed,
    state: createStoryDirectorStateV2(state.storyDirectorV2),
    now: { week: state.currentWeek, season: state.currentSeason },
    priorEvents: priorNarrativeEvents,
    emissions,
    candidates: [
      ...worldArcWeek.beats.map((beat) => beat.candidate),
      ...scoutingEcologyWeek.candidates,
      ...rivalCampaignWeek.candidates,
      ...(worldPulseWeek ? [worldPulseWeek.candidate] : []),
    ],
    activeChoiceCount: Object.values(state.consequenceState.decisions)
      .filter((decision) => decision.status === "offered")
      .length,
    seasonLength,
  });

  const acceptedEventIds = new Set(
    storyDirection.accepted.map(({ emission }) => emission.event.id),
  );
  const acceptedNarrativeEvents = emissions
    .map(({ event }) => event)
    .filter((event) => acceptedEventIds.has(event.id));
  state = applyAcceptedNarrativeConsequences(state, acceptedNarrativeEvents).state;

  const acceptedNewStoryline = Boolean(
    newStoryline
    && acceptedNarrativeEvents.some((event) => event.storylineId === newStoryline.id),
  );
  const authoritativeStorylines = newStoryline && !acceptedNewStoryline
    ? updatedStorylines.filter((storyline) => storyline.id !== newStoryline.id)
    : updatedStorylines;
  let authoritativeChains = state.eventChains ?? [];
  if (
    weeklyResult.advancedChain
    && weeklyResult.advancedChain.event
    && acceptedEventIds.has(weeklyResult.advancedChain.event.id)
  ) {
    authoritativeChains = authoritativeChains.map((chain) =>
      chain.id === weeklyResult.advancedChain!.chain.id
        ? weeklyResult.advancedChain!.chain
        : chain,
    );
  }
  if (weeklyResult.newChain && acceptedEventIds.has(weeklyResult.newChain.event.id)) {
    authoritativeChains = [...authoritativeChains, weeklyResult.newChain.chain];
  }

  const featuredEvent = acceptedNarrativeEvents[0] ?? null;
  state = {
    ...state,
    storyDirectorV2: storyDirection.state,
    eventDirector: recordEventDirectorOutcome(
      priorEventDirector,
      featuredEvent,
      Boolean(featuredEvent?.specialEventId),
      state.currentSeason,
    ),
    eventChains: authoritativeChains,
    activeStorylines: authoritativeStorylines,
  };

  const acceptedStoryCandidateIds = new Set(
    storyDirection.acceptedCandidates.map(({ candidate }) => candidate.id),
  );
  state = applyDirectedWorldConditionArcBeats({
    state,
    beats: worldArcWeek.beats,
    acceptedBeatIds: acceptedStoryCandidateIds,
  });
  state = applyDirectedWeeklyScoutingEcology({
    state,
    prepared: scoutingEcologyWeek,
    acceptedCandidateIds: acceptedStoryCandidateIds,
  });
  state = applyDirectedWorldPulse({
    state,
    prepared: worldPulseWeek,
    acceptedCandidateIds: acceptedStoryCandidateIds,
  });
  state = applyDirectedWeeklyRivalCampaigns({
    state,
    prepared: rivalCampaignWeek,
    acceptedCandidateIds: acceptedStoryCandidateIds,
  });

  if (acceptedNarrativeEvents.length > 0) {
    const narrativeInboxMessages: InboxMessage[] = acceptedNarrativeEvents.map((event) => ({
      id: `narrative-${event.id}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "event",
      title: event.title,
      body: event.description,
      read: false,
      actionRequired: (event.choices?.length ?? 0) > 0,
      relatedId: event.id,
      relatedEntityType: "narrative",
    }));
    state = registerNarrativeDecisions({
      ...state,
      narrativeEvents: [...state.narrativeEvents, ...acceptedNarrativeEvents],
      inbox: [...state.inbox, ...narrativeInboxMessages],
    }, acceptedNarrativeEvents);
  }

  state = directWeeklyYouthProfessionalCase({ state }).state;
  return {
    state,
    acceptedNarrativeEventIds: acceptedNarrativeEvents.map((event) => event.id),
    acceptedStoryCandidateIds: [...acceptedStoryCandidateIds],
  };
}
