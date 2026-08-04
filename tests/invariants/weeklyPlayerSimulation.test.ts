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
