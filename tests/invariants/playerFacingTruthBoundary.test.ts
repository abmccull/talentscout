import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  DiscoveryRecord,
  GameState,
  InjuryHistory,
  League,
  Observation,
  Player,
  ScoutReport,
} from "@/engine/core/types";
import {
  buildObservedDevelopmentTrends,
  buildObservedLeagueComparison,
  buildObservedMarketScatter,
  buildObservedPlayerRadar,
  hasObservableRecurringInjuryConcern,
} from "@/engine/scout/playerFacingIntel";
import { getPlayerFacingDiscoverySummaries } from "@/engine/career/playerFacingDiscovery";

function player(hiddenTruth: {
  currentAbility: number;
  potentialAbility: number;
  attributeValue: number;
}): Player {
  return {
    id: "player-1",
    firstName: "Alex",
    lastName: "Vale",
    age: 18,
    nationality: "England",
    position: "CM",
    clubId: "club-1",
    marketValue: 1_250_000,
    currentAbility: hiddenTruth.currentAbility,
    potentialAbility: hiddenTruth.potentialAbility,
    attributes: { passing: hiddenTruth.attributeValue },
  } as unknown as Player;
}

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: "observation-1",
    playerId: "player-1",
    scoutId: "scout-1",
    week: 3,
    season: 1,
    context: "liveMatch",
    attributeReadings: [{
      attribute: "passing",
      perceivedValue: 14,
      confidence: 0.7,
      observationCount: 1,
      rangeLow: 12,
      rangeHigh: 16,
    }, {
      attribute: "pace",
      perceivedValue: 12,
      confidence: 0.6,
      observationCount: 1,
    }, {
      attribute: "composure",
      perceivedValue: 15,
      confidence: 0.65,
      observationCount: 1,
    }],
    abilityReading: {
      perceivedCA: 3,
      caConfidence: 0.65,
      perceivedPALow: 3.5,
      perceivedPAHigh: 4.5,
      paConfidence: 0.55,
    },
    notes: [],
    flaggedMoments: [],
    ...overrides,
  };
}

function report(): ScoutReport {
  return {
    id: "report-1",
    playerId: "player-1",
    scoutId: "scout-1",
    submittedWeek: 4,
    submittedSeason: 1,
    revision: 1,
    conviction: "strongRecommend",
    assessments: [],
    strengths: ["Progressive passing"],
    weaknesses: [],
    summary: "A high-upside midfield projection.",
    estimatedValue: 1_000_000,
    qualityScore: 78,
    perceivedCAStars: 3,
    perceivedPARange: [3.5, 4.5],
    postTransferRating: 82,
  } as unknown as ScoutReport;
}

describe("player-facing truth boundary", () => {
  it("keeps every analytics view invariant when only true ability and attributes change", () => {
    const lowTruth = player({ currentAbility: 25, potentialAbility: 40, attributeValue: 2 });
    const highTruth = player({ currentAbility: 195, potentialAbility: 200, attributeValue: 20 });
    const observations = [observation(), observation({
      id: "observation-2",
      season: 2,
      week: 2,
      abilityReading: {
        perceivedCA: 3.5,
        caConfidence: 0.72,
        perceivedPALow: 3.5,
        perceivedPAHigh: 4.5,
        paConfidence: 0.6,
      },
    })];
    const league = {
      id: "league-1",
      name: "Test League",
      shortName: "TL",
      clubIds: ["club-1"],
    } as League;

    const buildAll = (subject: Player) => ({
      scatter: buildObservedMarketScatter({ [subject.id]: subject }, observations, []),
      league: buildObservedLeagueComparison(
        { [subject.id]: subject },
        { [league.id]: league },
        observations,
      ),
      trends: buildObservedDevelopmentTrends([subject], observations, 2),
      radar: buildObservedPlayerRadar(subject, observations),
    });

    expect(buildAll(lowTruth)).toEqual(buildAll(highTruth));
  });

  it("does not invent analytics for an unobserved player", () => {
    const secretStar = player({ currentAbility: 200, potentialAbility: 200, attributeValue: 20 });
    expect(buildObservedMarketScatter({ [secretStar.id]: secretStar }, [], []).points).toEqual([]);
    expect(buildObservedDevelopmentTrends([secretStar], [], 1)).toEqual([]);
    expect(buildObservedPlayerRadar(secretStar, [])).toBeNull();
  });

  it("derives injury concern from visible history rather than hidden proneness", () => {
    const visibleHistory = {
      playerId: "player-1",
      injuries: [],
      totalWeeksMissed: 0,
      injuryProneness: 1,
      reinjuryWindowWeeksLeft: 4,
    } satisfies InjuryHistory;

    expect(hasObservableRecurringInjuryConcern(visibleHistory)).toBe(false);
    const visibleRecurringHistory: InjuryHistory = {
      ...visibleHistory,
      injuryProneness: 0,
      reinjuryWindowWeeksLeft: 0,
      totalWeeksMissed: 25,
    };
    expect(hasObservableRecurringInjuryConcern(visibleRecurringHistory)).toBe(true);
  });

  it("ranks and labels discoveries from reports and outcomes, not true CA/PA flags", () => {
    const makeRecord = (hidden: {
      initialCA: number;
      initialPA: number;
      wasWonderkid: boolean;
    }): DiscoveryRecord => ({
      playerId: "player-1",
      discoveredWeek: 2,
      discoveredSeason: 1,
      careerSnapshots: [],
      careerOutcome: "starPlayer",
      ...hidden,
    });
    const makeState = (record: DiscoveryRecord) => ({
      discoveryRecords: [record],
      reports: { "report-1": report() },
      players: { "player-1": player({ currentAbility: 80, potentialAbility: 90, attributeValue: 4 }) },
      retiredPlayers: {},
      unsignedYouth: {},
    } as unknown as GameState);

    const lowTruth = getPlayerFacingDiscoverySummaries(makeState(makeRecord({
      initialCA: 1,
      initialPA: 1,
      wasWonderkid: false,
    })));
    const highTruth = getPlayerFacingDiscoverySummaries(makeState(makeRecord({
      initialCA: 200,
      initialPA: 200,
      wasWonderkid: true,
    })));

    expect(lowTruth).toEqual(highTruth);
    expect(lowTruth[0]).toMatchObject({
      projectedPotentialRange: [3.5, 4.5],
      isHighUpsideProjection: true,
      careerOutcome: "starPlayer",
    });
    expect(JSON.stringify(lowTruth)).not.toMatch(/initialCA|initialPA|wasWonderkid|potentialAbility/);

    const unsignedState = makeState(makeRecord({
      initialCA: 1,
      initialPA: 1,
      wasWonderkid: false,
    }));
    unsignedState.players = {};
    unsignedState.unsignedYouth = {
      "unsigned-record-key": {
        id: "unsigned-record-key",
        player: player({ currentAbility: 80, potentialAbility: 90, attributeValue: 4 }),
      },
    } as unknown as GameState["unsignedYouth"];
    expect(getPlayerFacingDiscoverySummaries(unsignedState)[0].playerName).toBe("Alex Vale");
  });

  it("keeps confirmed player-facing modules free of direct engine-truth reads", () => {
    const files = [
      "src/components/game/AnalyticsScreen.tsx",
      "src/components/game/CareerScreen.tsx",
      "src/components/game/FreeAgentScreen.tsx",
      "src/components/game/HallOfFame.tsx",
      "src/components/game/PlayerProfile.tsx",
      "src/components/game/ScoutPerformanceDashboard.tsx",
      "src/components/game/consequence-cinema/consequenceCinemaModel.ts",
    ];
    const forbidden = /\.(?:currentAbility|potentialAbility|initialCA|initialPA|wasWonderkid|bestDiscoveryPA|injuryProneness|reinjuryWindowWeeksLeft)\b/;
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(forbidden);
    }
  });
});
