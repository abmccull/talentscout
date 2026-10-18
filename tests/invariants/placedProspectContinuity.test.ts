import { describe, expect, it } from "vitest";
import type { GameState, Observation, WeekSimulationState } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { generatePlayer } from "@/engine/players/generation";
import { createScout } from "@/engine/scout/creation";
import { createWeekSchedule, getAvailableActivities, processCompletedWeek } from "@/engine/core/calendar";
import { createConsequenceEngineState } from "@/engine/consequences";
import { processWeeklyYouthObservationActivities } from "@/stores/actions/weeklyYouthObservationActivities";
import { selectActionableProspects } from "@/engine/youth/actionableProspects";

function savedCareer(): GameState {
  const rng = createRNG("placed-continuity");
  const player = generatePlayer(rng, { position: "CM", ageRange: [16, 16], abilityRange: [90, 90], nationality: "england", clubId: "academy" });
  const scout = createScout({ scoutFirstName: "Ari", scoutLastName: "Scout", scoutAge: 30, specialization: "youth", difficulty: "normal", worldSeed: "placed-continuity", skillAllocations: { technicalEye: 2, physicalAssessment: 2, potentialAssessment: 2, playerJudgment: 2 }, selectedCountries: ["england"], startingCountry: "england" }, rng);
  const schedule = createWeekSchedule(3, 1);
  schedule.activities[0] = { type: "followUpSession", slots: 1, targetId: player.id, description: "Check development" };
  schedule.activities[1] = { type: "parentCoachMeeting", slots: 1, targetId: player.id, description: "Check support" };
  return JSON.parse(JSON.stringify({
    seed: "placed-continuity", difficulty: "normal", countries: [], currentWeek: 3, currentSeason: 1, scout,
    players: { [player.id]: player }, unsignedYouth: {}, retiredPlayers: {},
    alumniRecords: [{ playerId: player.id, placedWeek: 1, placedSeason: 1, placedClubId: "academy" }],
    scoutingCases: { placed: { id: "placed", playerId: player.id, scoutId: scout.id, status: "placed" } },
    observations: { original: { id: "original", playerId: player.id, scoutId: scout.id, week: 1, season: 1, context: "schoolMatch", attributeReadings: [], notes: [], flaggedMoments: [] } },
    schedule, fixtures: {}, clubs: {}, contacts: {}, subRegions: {}, regionalKnowledge: {}, reports: {},
    discoveryRecords: [], inbox: [], consequenceState: createConsequenceEngineState(), gutFeelings: [], unlockedTools: [],
  })) as GameState;
}

function resolveWeek(state: GameState, preview: boolean) {
  const observations = { ...state.observations };
  return processWeeklyYouthObservationActivities({ sourceState: state, state,
    weekResult: processCompletedWeek(state.schedule, state.scout, createRNG("week")),
    qualityByType: new Map(), scout: state.scout, effectiveScoutCountry: "england", rng: createRNG("activities"),
    discoveries: state.discoveryRecords, messages: [], observations,
    playersDiscovered: 0, observationsGenerated: 0,
    playerEvidence: id => Object.values(observations).filter(o => o.playerId === id),
    recordObservation: observation => { observations[observation.id] = observation; },
    hasNewObservations: () => Object.keys(observations).length > Object.keys(state.observations).length,
    discoveryModifier: () => 0, focusDepth: () => 0, focusPlayers: () => [], prioritizeYouth: pool => pool,
    weekSimulation: preview ? { youthVenueResults: { newObservations: {}, newDiscoveries: [], updatedUnsignedYouth: {}, gutFeelings: [] } } as unknown as WeekSimulationState : null,
    completedInteractiveIds: new Set(), completedLiveActivityTypes: new Set(), tierLabels: {},
  });
}

describe("placed prospect saved-career continuity", () => {
  it("keeps signed alumni selectable and does not offer another placement", () => {
    const state = savedCareer();
    const id = Object.keys(state.players)[0];
    const selected = selectActionableProspects(state);
    expect(selected.map(target => target.player.id)).toEqual([id]);
    expect(selected[0].player).toBe(state.players[id]);
    const activities = getAvailableActivities(state.scout, 3, [], [], state.subRegions, state.observations,
      state.unsignedYouth, state.players, undefined, undefined, state.reports, state);
    for (const type of ["followUpSession", "parentCoachMeeting"]) {
      expect(activities.find(activity => activity.type === type)?.targetPool?.map(target => target.id)).toContain(id);
    }
    expect(activities.find(activity => activity.type === "writePlacementReport")?.targetPool?.map(target => target.id) ?? []).not.toContain(id);
    state.retiredPlayers[id] = state.players[id];
    delete state.players[id];
    expect(selectActionableProspects(state)).toEqual([]);
  });

  it.each([false, true])("files signed-player follow-up and meeting evidence without recreating youth (preview %s)", preview => {
    const state = savedCareer();
    const id = Object.keys(state.players)[0];
    const result = resolveWeek(state, preview);
    const evidence = Object.values(result.state.observations).filter(o => o.id !== "original");
    expect(evidence.map(o => o.context).sort()).toEqual(["followUpSession", "parentCoachMeeting"]);
    expect(evidence.every(o => o.playerId === id && Boolean(o.activityInstanceId))).toBe(true);
    expect(evidence.find(o => o.context === "parentCoachMeeting")?.attributeReadings).toEqual([]);
    expect(evidence.find(o => o.context === "parentCoachMeeting")?.notes.length).toBeGreaterThan(0);
    expect(result.state.unsignedYouth).toEqual({});
    expect(result.state.players[id]).toEqual(state.players[id]);
    const reloaded = JSON.parse(JSON.stringify(result.state)) as GameState;
    expect(Object.values(resolveWeek(reloaded, preview).state.observations)).toHaveLength(3);
  });

  it("explains unavailable targets without crediting evidence", () => {
    const state = savedCareer(); state.players = {};
    const result = resolveWeek(state, true);
    expect(Object.keys(result.state.observations)).toEqual(["original"]);
    expect(result.state.inbox.some(message => message.body.includes("could not take place"))).toBe(true);
  });
});
