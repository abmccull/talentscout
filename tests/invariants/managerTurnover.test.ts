import { describe, expect, it } from "vitest";
import type { Club, GameState, NarrativeEvent } from "@/engine/core/types";
import { applyNarrativeManagerTurnovers } from "@/engine/world/managerTurnover";

function club(id: string): Club {
  return {
    id,
    name: "Northbridge FC",
    shortName: "NFC",
    leagueId: "league",
    reputation: 65,
    budget: 20_000_000,
    scoutingPhilosophy: "marketSmart",
    managerId: "manager-old",
    playerIds: ["player-a"],
    youthAcademyRating: 12,
  };
}

function managerEvent(type: "managerFired" | "managerSacked"): NarrativeEvent {
  return {
    id: `event-${type}`,
    type,
    week: 12,
    season: 3,
    title: "Manager dismissed",
    description: "The board made a change.",
    relatedIds: ["club-a"],
    acknowledged: false,
  };
}

function state(): GameState {
  return {
    seed: "manager-turnover-test",
    currentWeek: 12,
    currentSeason: 3,
    clubs: { "club-a": club("club-a") },
    players: {
      "player-a": {
        id: "player-a",
        clubId: "club-a",
        contractClubId: "club-a",
        position: "CM",
        secondaryPositions: [],
        currentAbility: 100,
        age: 24,
      },
    },
    managerProfiles: {
      "club-a": {
        clubId: "club-a",
        managerId: "manager-old",
        managerName: "Alex Morgan",
        preference: "balanced",
        reportInfluence: 0.6,
        preferredFormation: "4-4-2",
      },
    },
    managerDirectives: [],
    scout: {
      currentClubId: "club-a",
      primarySpecialization: "firstTeam",
    },
  } as unknown as GameState;
}

describe("manager turnover world authority", () => {
  it.each(["managerFired", "managerSacked"] as const)(
    "turns the %s story into a real manager and club change",
    (type) => {
      const original = state();
      const result = applyNarrativeManagerTurnovers(original, [managerEvent(type)]);
      const incoming = result.state.managerProfiles["club-a"];

      expect(result.turnovers).toHaveLength(1);
      expect(incoming.managerId).toContain(`event-${type}`);
      expect(incoming.managerId).not.toBe("manager-old");
      expect(result.state.clubs["club-a"].managerId).toBe(incoming.managerId);
      expect(result.state.managerDirectives.length).toBeGreaterThan(0);
      expect(result.state.managerDirectives.every((directive) =>
        directive.managerId === incoming.managerId
      )).toBe(true);
    },
  );

  it("ignores unrelated stories without cloning state", () => {
    const original = state();
    const unrelated = { ...managerEvent("managerFired"), type: "debutHatTrick" as const };
    const result = applyNarrativeManagerTurnovers(original, [unrelated]);

    expect(result.state).toBe(original);
    expect(result.turnovers).toEqual([]);
  });
});
