import { describe, expect, it } from "vitest";
import type { JobOffer, NewGameConfig } from "@/engine/core/types";
import {
  acceptJobOffer,
  endClubEmployment,
} from "@/engine/career/progression";
import { createScout } from "@/engine/scout/creation";
import { RNG } from "@/engine/rng";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Career",
  scoutLastName: "Ledger",
  scoutAge: 34,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "career-employment",
  startingCountry: "england",
  selectedCountries: ["england"],
  skillAllocations: {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    tacticalUnderstanding: 1,
    dataLiteracy: 1,
    playerJudgment: 1,
    potentialAssessment: 1,
  },
};

describe("career employment integrity", () => {
  it("preserves lifetime history across hiring, firing, and rehiring", () => {
    const created = createScout(CONFIG, new RNG("career-employment-scout"));
    const independent = {
      ...created,
      careerPath: "independent" as const,
      independentTier: 3 as const,
      reportsSubmitted: 27,
      successfulFinds: 9,
      discoveryCredits: ["prospect-a", "prospect-b"],
      reputation: 63,
      specializationXp: 480,
    };
    const offer: JobOffer = {
      id: "offer-club-a",
      clubId: "club-a",
      tier: 3,
      role: "Senior Youth Scout",
      salary: 1_500,
      contractLength: 2,
      expiresWeek: 38,
    };

    const hired = acceptJobOffer(independent, offer, 2);
    expect(hired).toMatchObject({
      careerPath: "club",
      independentTier: undefined,
      currentClubId: "club-a",
      reportsSubmitted: 27,
      successfulFinds: 9,
      discoveryCredits: ["prospect-a", "prospect-b"],
      reputation: 63,
      specializationXp: 480,
    });

    const fired = endClubEmployment({
      ...hired,
      clubTrust: 14,
      boardDirectives: [{ id: "directive-a" }] as typeof hired.boardDirectives,
    });
    expect(fired).toMatchObject({
      careerPath: "independent",
      independentTier: 1,
      salary: 0,
      clubTrust: 0,
      reportsSubmitted: 27,
      successfulFinds: 9,
      discoveryCredits: ["prospect-a", "prospect-b"],
      reputation: 63,
      specializationXp: 480,
    });
    expect(fired.currentClubId).toBeUndefined();
    expect(fired.contractEndSeason).toBeUndefined();
    expect(fired.managerRelationship).toBeUndefined();
    expect(fired.boardDirectives).toEqual([]);

    const rehired = acceptJobOffer(
      fired,
      { ...offer, id: "offer-club-b", clubId: "club-b", tier: 4 },
      3,
    );
    expect(rehired.reportsSubmitted).toBe(27);
    expect(rehired.successfulFinds).toBe(9);
    expect(rehired.discoveryCredits).toEqual(["prospect-a", "prospect-b"]);
  });
});
