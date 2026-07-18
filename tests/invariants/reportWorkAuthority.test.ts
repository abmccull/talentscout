import { describe, expect, it } from "vitest";
import type { GameState, Observation, Player, Scout } from "@/engine/core/types";
import { processWeeklyReportActivities } from "@/stores/actions/weeklyReportActivities";

function player(): Player {
  return {
    id: "prospect-1",
    firstName: "Mara",
    lastName: "Vale",
    age: 16,
    position: "CM",
  } as Player;
}

function observation(): Observation {
  return {
    id: "observation-1",
    playerId: "prospect-1",
    scoutId: "scout-1",
    context: "schoolMatch",
    attributeReadings: [],
  } as unknown as Observation;
}

function state(): GameState {
  const prospect = player();
  return {
    currentWeek: 3,
    currentSeason: 1,
    scout: {
      id: "scout-1",
      reputation: 18,
      reportsSubmitted: 0,
    } as Scout,
    players: { [prospect.id]: prospect },
    observations: { "observation-1": observation() },
    reports: {},
    reportWorkItems: {},
    inbox: [],
    finances: {
      reportListings: [],
      consultingContracts: [],
      retainerContracts: [],
      transactions: [],
    },
  } as unknown as GameState;
}

describe("scheduled report-work authority", () => {
  it("prepares evidence exactly once without filing, rewarding, or delivering a report", () => {
    const original = state();
    const prepared = processWeeklyReportActivities({
      state: original,
      playerIds: ["prospect-1", "prospect-1"],
      qualityModifier: 4,
      equipmentQualityBonus: 0.05,
    });

    expect(prepared.reports).toEqual({});
    expect(prepared.scout.reputation).toBe(original.scout.reputation);
    expect(prepared.scout.reportsSubmitted).toBe(0);
    expect(prepared.finances?.reportListings).toEqual([]);
    expect(prepared.finances?.consultingContracts).toEqual([]);
    expect(prepared.finances?.retainerContracts).toEqual([]);
    expect(Object.values(prepared.reportWorkItems)).toEqual([
      expect.objectContaining({
        id: "report-work:scout-1:prospect-1",
        status: "ready",
        freshObservationIds: ["observation-1"],
        preparationQualityPoints: 4,
        preparationQualityBonus: 0.05,
      }),
    ]);
    expect(prepared.inbox).toHaveLength(1);
    expect(prepared.inbox[0]).toMatchObject({ actionRequired: true });

    const replay = processWeeklyReportActivities({
      state: prepared,
      playerIds: ["prospect-1"],
      qualityModifier: 4,
      equipmentQualityBonus: 0.05,
    });
    expect(replay.reportWorkItems).toEqual(prepared.reportWorkItems);
    expect(replay.inbox).toEqual(prepared.inbox);
    expect(replay.reports).toEqual({});
  });
});
