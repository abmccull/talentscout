import { describe, expect, it } from "vitest";

import type {
  Club,
  ManagerDirective,
  ManagerProfile,
  Player,
  Scout,
  ScoutReport,
} from "@/engine/core/types";
import {
  generateClubResponse,
  processTrialOutcome,
} from "@/engine/firstTeam/clubResponse";
import { createRNG } from "@/engine/rng";

const PLAYER = {
  id: "player-1",
  firstName: "Luca",
  lastName: "Mendez",
  age: 22,
  position: "CM",
  marketValue: 2_000_000,
  currentAbility: 121,
  form: 1.5,
  attributes: { passing: 15, vision: 14, workRate: 13 },
} as unknown as Player;

const CLUB = {
  id: "club-1",
  shortName: "AFC",
  name: "Alpha FC",
  playerIds: [],
  tacticalStyle: { tacticalIdentity: "balanced" },
} as unknown as Club;

const MANAGER = {
  preferredFormation: "4-3-3",
  preference: "balanced",
} as unknown as ManagerProfile;

const DIRECTIVE = {
  id: "directive-1",
  clubId: "club-1",
  managerId: "manager-1",
  position: "CM",
  priority: "high",
  budgetAllocation: 5_000_000,
  ageRange: [20, 25],
  minCAStars: 3,
  keyAttributes: ["passing", "vision"],
  submittedReportIds: [],
  fulfilled: false,
  season: 1,
} as unknown as ManagerDirective;

const SCOUT = {
  id: "scout-1",
  attributes: { persuasion: 16 },
} as unknown as Scout;

const REPORT = {
  id: "report-1",
  submittedWeek: 4,
  submittedSeason: 1,
  conviction: "tablePound",
  qualityScore: 88,
} as unknown as ScoutReport;

describe("first-team club responses", () => {
  it("never claims a signing before the authoritative movement exists", () => {
    const seen = new Set<string>();

    for (let index = 0; index < 50; index += 1) {
      const response = generateClubResponse(
        createRNG(`first-team-response-${index}`),
        REPORT,
        PLAYER,
        CLUB,
        MANAGER,
        DIRECTIVE,
        SCOUT,
        86,
        2,
      );
      seen.add(response.response);
      expect(response.response).not.toBe("signed");
      expect(response.response).not.toBe("loanSigned");
      expect(response.reputationDelta).toBeLessThanOrEqual(5);
    }

    expect(seen.has("interested") || seen.has("trial")).toBe(true);
  });

  it("keeps a trial inside the recruitment process until a movement is registered", () => {
    const squadPlayer = {
      ...PLAYER,
      id: "squad-player",
      clubId: CLUB.id,
      currentAbility: 115,
    } as Player;

    for (let index = 0; index < 100; index += 1) {
      const outcome = processTrialOutcome(
        createRNG(`first-team-trial-${index}`),
        PLAYER,
        CLUB,
        { [squadPlayer.id]: squadPlayer },
      );
      expect(["interested", "doesNotFit"]).toContain(outcome);
      expect(outcome).not.toBe("signed");
      expect(outcome).not.toBe("loanSigned");
    }
  });
});
