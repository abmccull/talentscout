import { describe, expect, expectTypeOf, it } from "vitest";

import * as gameLoop from "@/engine/core/gameLoop";
import type {
  BoardDirectiveEvaluationResult as GameLoopBoardDirectiveEvaluationResult,
  BreakthroughResult as GameLoopBreakthroughResult,
  FormMomentumUpdate as GameLoopFormMomentumUpdate,
  HistoricalWorldMatchState as GameLoopHistoricalWorldMatchState,
  InjuryResult as GameLoopInjuryResult,
  InjurySetbackResult as GameLoopInjurySetbackResult,
  NPCScoutWeekResult as GameLoopNPCScoutWeekResult,
  PlayerDevelopmentResult as GameLoopPlayerDevelopmentResult,
  SimulatedFixture as GameLoopSimulatedFixture,
  TickResult as GameLoopTickResult,
  Transfer as GameLoopTransfer,
} from "@/engine/core/gameLoop";
import type { Club, GameState, League, Player } from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import { applyWeeklyPlayerProgression } from "@/engine/core/weekly/stateApplication";
import { createDevelopmentEnvironmentIndex } from "@/engine/world/developmentEnvironment";
import {
  createWeeklyPlayerRatingIndex,
  isFormMomentumUpdateNoOp,
  processInjuries,
  processPlayerDevelopment,
} from "@/engine/core/weekly/playerSimulation";
import type {
  BoardDirectiveEvaluationResult as WeeklyBoardDirectiveEvaluationResult,
  BreakthroughResult as WeeklyBreakthroughResult,
  FormMomentumUpdate as WeeklyFormMomentumUpdate,
  HistoricalWorldMatchState as WeeklyHistoricalWorldMatchState,
  InjuryResult as WeeklyInjuryResult,
  InjurySetbackResult as WeeklyInjurySetbackResult,
  NPCScoutWeekResult as WeeklyNPCScoutWeekResult,
  PlayerDevelopmentResult as WeeklyPlayerDevelopmentResult,
  SimulatedFixture as WeeklySimulatedFixture,
  TickResult as WeeklyTickResult,
  Transfer as WeeklyTransfer,
} from "@/engine/core/weekly/types";

function makeState(player: Player): GameState {
  const club = {
    id: "club",
    name: "Club",
    shortName: "CLB",
    leagueId: "league",
    reputation: 60,
    budget: 1_000_000,
    weeklyWageBudget: 100_000,
    scoutingBudget: 250_000,
    playerIds: [player.id],
    academyPlayerIds: [],
    youthAcademyRating: 12,
    scoutingPhilosophy: "academyFirst",
  } as unknown as Club;
  const league = {
    id: "league",
    name: "League",
    countryId: "england",
    level: 1,
    reputation: 60,
    clubIds: [club.id],
  } as unknown as League;

  return {
    currentSeason: 2,
    currentWeek: 8,
    difficulty: "normal",
    players: { [player.id]: player },
    unsignedYouth: {},
    clubs: { [club.id]: club },
    leagues: { [league.id]: league },
    fixtures: {},
    managerProfiles: {},
    matchRatings: {},
    activeLoans: [],
    worldConditionState: undefined,
  } as unknown as GameState;
}

describe("weekly player simulation extraction", () => {
  it.each([36, 39])("continues veteran decline at age %i through the weekly pipeline", (age) => {
    const player = {
      ...generatePlayer(new RNG(`veteran-${age}`), {
        position: "CM", ageRange: [age, age], abilityRange: [140, 140],
        nationality: "English", clubId: "club",
      }),
      developmentProfile: "steadyGrower" as const,
      injured: false, injuryWeeksRemaining: 0, form: 1,
    };
    let changes = 0;
    let declinedPlayers = 0;
    // A veteran can legitimately hold form for one season. Exercise a seeded
    // cohort rather than requiring a random decline for every individual.
    for (let sample = 0; sample < 12; sample++) {
      let state = makeState(player);
      const rng = new RNG(`veteran-weekly-${age}-${sample}`);
      for (let week = 1; week <= 46; week++) {
        state = { ...state, currentWeek: week };
        const result = processPlayerDevelopment(state, rng, createDevelopmentEnvironmentIndex(state));
        expect(result.breakthroughs).toHaveLength(0);
        changes += result.development.length;
        state = { ...state, players: applyWeeklyPlayerProgression(state, {
          playerDevelopment: result.development, breakthroughs: result.breakthroughs, injurySetbacks: [],
        }, (value, min, max) => Math.max(min, Math.min(max, value))) };
      }
      expect(state.players[player.id].currentAbility).toBeLessThanOrEqual(player.currentAbility);
      if (state.players[player.id].currentAbility < player.currentAbility) {
        declinedPlayers++;
        expect(state.players[player.id].attributes).not.toEqual(player.attributes);
      }
    }
    expect(changes).toBeGreaterThan(0);
    expect(declinedPlayers).toBeGreaterThan(0);
    const injuredState = makeState({ ...player, injured: true, injuryWeeksRemaining: 10 });
    expect(processPlayerDevelopment(injuredState, new RNG("injured-veteran"),
      createDevelopmentEnvironmentIndex(injuredState)).development).toHaveLength(0);
  });

  it("keeps gameLoop type exports identical to weekly type authority", () => {
    expectTypeOf<GameLoopTransfer>().toEqualTypeOf<WeeklyTransfer>();
    expectTypeOf<GameLoopPlayerDevelopmentResult>().toEqualTypeOf<WeeklyPlayerDevelopmentResult>();
    expectTypeOf<GameLoopInjuryResult>().toEqualTypeOf<WeeklyInjuryResult>();
    expectTypeOf<GameLoopBreakthroughResult>().toEqualTypeOf<WeeklyBreakthroughResult>();
    expectTypeOf<GameLoopInjurySetbackResult>().toEqualTypeOf<WeeklyInjurySetbackResult>();
    expectTypeOf<GameLoopSimulatedFixture>().toEqualTypeOf<WeeklySimulatedFixture>();
    expectTypeOf<GameLoopHistoricalWorldMatchState>().toEqualTypeOf<WeeklyHistoricalWorldMatchState>();
    expectTypeOf<GameLoopNPCScoutWeekResult>().toEqualTypeOf<WeeklyNPCScoutWeekResult>();
    expectTypeOf<GameLoopBoardDirectiveEvaluationResult>().toEqualTypeOf<WeeklyBoardDirectiveEvaluationResult>();
    expectTypeOf<GameLoopFormMomentumUpdate>().toEqualTypeOf<WeeklyFormMomentumUpdate>();
    expectTypeOf<GameLoopTickResult>().toEqualTypeOf<WeeklyTickResult>();
  });

  it("re-exports public helper functions from gameLoop without changing identity", () => {
    expect(gameLoop.createWeeklyPlayerRatingIndex).toBe(createWeeklyPlayerRatingIndex);
    expect(gameLoop.isFormMomentumUpdateNoOp).toBe(isFormMomentumUpdateNoOp);
  });

  it("keeps extracted RNG-driven development and injury phases deterministic", () => {
    const player = {
      ...generatePlayer(new RNG("weekly-player-simulation"), {
        position: "CM",
        ageRange: [19, 19],
        abilityRange: [108, 108],
        nationality: "English",
        clubId: "club",
      }),
      form: 1.2,
      morale: 8,
      injuryWeeksRemaining: 0,
      injured: false,
      attributes: {
        ...generatePlayer(new RNG("weekly-player-simulation-attrs"), {
          position: "CM",
          ageRange: [19, 19],
          abilityRange: [108, 108],
          nationality: "English",
          clubId: "club",
        }).attributes,
        injuryProneness: 18,
        professionalism: 16,
      },
    } as Player;
    const state = makeState(player);
    const environmentIndex = createDevelopmentEnvironmentIndex(state);

    const firstDevelopment = processPlayerDevelopment(
      state,
      new RNG("weekly-player-development"),
      environmentIndex,
    );
    const secondDevelopment = processPlayerDevelopment(
      state,
      new RNG("weekly-player-development"),
      environmentIndex,
    );
    const firstInjuries = processInjuries(
      state,
      new RNG("weekly-player-injuries"),
    );
    const secondInjuries = processInjuries(
      state,
      new RNG("weekly-player-injuries"),
    );

    expect(secondDevelopment).toEqual(firstDevelopment);
    expect(secondInjuries).toEqual(firstInjuries);
  });
});
