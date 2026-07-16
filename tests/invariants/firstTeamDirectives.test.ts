import { describe, expect, it } from "vitest";

import type { Club, ManagerProfile, Player, Position } from "@/engine/core/types";
import { generateDirectives } from "@/engine/firstTeam/directives";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";

function makePlayer(
  seed: string,
  clubId: string,
  position: Position,
  currentAbility: number,
): Player {
  return generatePlayer(new RNG(seed), {
    position,
    ageRange: [24, 24],
    abilityRange: [currentAbility, currentAbility],
    nationality: "English",
    clubId,
  });
}

function makeClub(id: string, playerIds: string[]): Club {
  return {
    id,
    name: `Club ${id}`,
    shortName: id.toUpperCase(),
    leagueId: "league-1",
    reputation: 62,
    budget: 8_000_000,
    weeklyWageBudget: 200_000,
    scoutingBudget: 500_000,
    scoutingPhilosophy: "marketSmart",
    managerId: `${id}-manager`,
    playerIds,
    academyPlayerIds: [],
    youthAcademyRating: 11,
    tacticalStyle: {
      defensiveLine: 10,
      pressingIntensity: 10,
      tempo: 10,
      width: 10,
      directness: 10,
      tacticalIdentity: "balanced",
    },
  };
}

function makeManager(clubId: string, preferredFormation: string): ManagerProfile {
  return {
    clubId,
    managerId: `${clubId}-manager`,
    managerName: "Coach",
    preferredFormation,
    preference: "balanced",
    reportInfluence: 0.7,
  } as ManagerProfile;
}

describe("first-team directives", () => {
  it("never generates unusable CAM or CDM asks for a 4-4-2 manager", () => {
    const clubId = "flat-four";
    const squad = [
      makePlayer("442-gk", clubId, "GK", 110),
      makePlayer("442-lb", clubId, "LB", 108),
      makePlayer("442-cb-1", clubId, "CB", 109),
      makePlayer("442-cb-2", clubId, "CB", 107),
      makePlayer("442-rb", clubId, "RB", 108),
      makePlayer("442-lw", clubId, "LW", 104),
      makePlayer("442-cm-1", clubId, "CM", 111),
      makePlayer("442-cm-2", clubId, "CM", 110),
      makePlayer("442-rw", clubId, "RW", 103),
      makePlayer("442-st-1", clubId, "ST", 112),
      makePlayer("442-st-2", clubId, "ST", 109),
      makePlayer("442-cam", clubId, "CAM", 75),
      makePlayer("442-cdm", clubId, "CDM", 74),
    ];
    const players = Object.fromEntries(squad.map((player) => [player.id, player]));
    const club = makeClub(clubId, squad.map((player) => player.id));
    const manager = makeManager(clubId, "4-4-2");

    const directives = generateDirectives(
      new RNG("442-directives"),
      club,
      manager,
      players,
      4,
    );

    expect(directives.every((directive) =>
      directive.position !== "CAM" && directive.position !== "CDM")).toBe(true);
  });

  it("detects real starter depth gaps inside the manager's formation", () => {
    const clubId = "double-pivot";
    const squad = [
      makePlayer("4231-gk", clubId, "GK", 109),
      makePlayer("4231-lb", clubId, "LB", 108),
      makePlayer("4231-cb-1", clubId, "CB", 110),
      makePlayer("4231-cb-2", clubId, "CB", 109),
      makePlayer("4231-rb", clubId, "RB", 108),
      makePlayer("4231-cdm-1", clubId, "CDM", 111),
      makePlayer("4231-cam", clubId, "CAM", 110),
      makePlayer("4231-lw", clubId, "LW", 109),
      makePlayer("4231-rw", clubId, "RW", 108),
      makePlayer("4231-st", clubId, "ST", 112),
      makePlayer("4231-cm-cover", clubId, "CM", 109),
      makePlayer("4231-gk-backup", clubId, "GK", 95),
      makePlayer("4231-cb-cover", clubId, "CB", 98),
    ];
    const players = Object.fromEntries(squad.map((player) => [player.id, player]));
    const club = makeClub(clubId, squad.map((player) => player.id));
    const manager = makeManager(clubId, "4-2-3-1");

    const directives = generateDirectives(
      new RNG("4231-depth-gap"),
      club,
      manager,
      players,
      6,
    );

    expect(directives.some((directive) => directive.position === "CDM")).toBe(true);
  });
});
