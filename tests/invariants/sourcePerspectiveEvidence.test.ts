import { describe, expect, it } from "vitest";
import type {
  Contact,
  NPCScout,
  ScoutEvidenceClaim,
  ScoutSourcePerspective,
} from "@/engine/core/types";
import {
  buildContactEvidenceClaim,
  buildNPCAttributeEvidenceClaims,
  buildNPCRecommendationEvidenceClaim,
  capComparableClaims,
  deriveContactPerspective,
  deriveNPCScoutPerspective,
  getEffectiveClaimConfidence,
  MAX_COMPARABLE_EVIDENCE_SOURCES,
  MAX_EVIDENCE_CLAIMS_PER_SOURCE,
} from "@/engine/scout/sourcePerspectives";
import { LEGACY_SEASON_LENGTH_WEEKS } from "@/engine/core/gameDate";
import { generateContactForType } from "@/engine/network/contacts";
import { createRNG } from "@/engine/rng";

const npc: NPCScout = {
  id: "npc-alex-rivera",
  firstName: "Alex",
  lastName: "Rivera",
  quality: 4,
  specialization: "youth",
  salary: 1_500,
  fatigue: 10,
  reportsSubmitted: 0,
  morale: 8,
};

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact-marta",
    name: "Marta Silva",
    type: "academyCoach",
    organization: "Academia Norte",
    relationship: 70,
    reliability: 76,
    knownPlayerIds: ["player-1"],
    interactionHistory: [
      { week: 1, type: "meeting", trustDelta: 2 },
      { week: 4, type: "meeting", trustDelta: 1 },
      { week: 8, type: "meeting", trustDelta: 2 },
    ],
    ...overrides,
  };
}

function forcedPerspective(
  actorId: string,
  lens: ScoutSourcePerspective["lens"],
): ScoutSourcePerspective {
  return {
    actorId,
    actorKind: "npcScout",
    lens,
    riskTolerance: "balanced",
    reliabilityBand: "established",
    biases: [],
  };
}

function npcClaim(sourceId: string, perspective = deriveNPCScoutPerspective(npc)): ScoutEvidenceClaim {
  return buildNPCRecommendationEvidenceClaim({
    reportId: sourceId,
    playerId: "player-1",
    sourceName: "Alex Rivera",
    perspective,
    recommendation: "shortlist",
    quality: 72,
    week: 10,
    season: 1,
  });
}

describe("explainable source perspectives", () => {
  it("is stable for the same seeded actor identity and survives save/reload", () => {
    const first = deriveNPCScoutPerspective(npc);
    const second = deriveNPCScoutPerspective({ ...npc });
    const reloaded = JSON.parse(JSON.stringify(first)) as ScoutSourcePerspective;

    expect(second).toEqual(first);
    expect(reloaded).toEqual(first);
    expect(first.biases).toHaveLength(2);
    expect(first.biases.every((bias) => Math.abs(bias.adjustment) <= 0.12)).toBe(true);

    const seededContactA = generateContactForType(
      createRNG("same-world-seed"),
      "academyCoach",
      "Academia Norte",
      "Portugal",
    );
    const seededContactB = generateContactForType(
      createRNG("same-world-seed"),
      "academyCoach",
      "Academia Norte",
      "Portugal",
    );
    expect(seededContactB).toEqual(seededContactA);
    expect(seededContactA.evidencePerspective).toBeDefined();
  });

  it("lets different reference lenses disagree about the same bounded reading", () => {
    const development = buildNPCAttributeEvidenceClaims({
      reportId: "report-development",
      playerId: "player-1",
      sourceName: "Development scout",
      perspective: forcedPerspective("dev", "developmentCeiling"),
      readings: [{ attribute: "passing", perceivedValue: 12.4, confidence: 0.65 }],
      week: 5,
      season: 1,
    })[0];
    const immediate = buildNPCAttributeEvidenceClaims({
      reportId: "report-immediate",
      playerId: "player-1",
      sourceName: "First-team scout",
      perspective: forcedPerspective("first", "immediateImpact"),
      readings: [{ attribute: "passing", perceivedValue: 12.4, confidence: 0.65 }],
      week: 5,
      season: 1,
    })[0];

    expect(development.range).not.toEqual(immediate.range);
    expect(development.direction).not.toBe(immediate.direction);
    expect(development.explanation).toContain("Different context or reference standards");
  });

  it("persists actor bias and isolates one source from every other source", () => {
    const beforeA = deriveContactPerspective(contact({ id: "contact-a" }));
    const sourceB = deriveContactPerspective(contact({ id: "contact-b", reliability: 20 }));
    const afterA = deriveContactPerspective(contact({ id: "contact-a" }));

    expect(afterA).toEqual(beforeA);
    expect(sourceB.actorId).not.toBe(beforeA.actorId);
    expect(JSON.stringify(afterA)).not.toContain("contact-b");
  });

  it("applies reliability and actual calendar recency without rerolling", () => {
    const trusted = buildContactEvidenceClaim({
      contact: contact({ reliability: 90 }),
      playerId: "player-1",
      attribute: "professionalism",
      hint: "Always first onto the training pitch.",
      isHigh: true,
      reliability: 0.9,
      week: 10,
      season: 2,
    });
    const developing = buildContactEvidenceClaim({
      contact: contact({ id: "contact-developing", reliability: 40 }),
      playerId: "player-1",
      attribute: "professionalism",
      hint: "Always first onto the training pitch.",
      isHigh: true,
      reliability: 0.4,
      week: 10,
      season: 2,
    });
    const recent = getEffectiveClaimConfidence(trusted, { week: 12, season: 2 }, 38);
    const stale = getEffectiveClaimConfidence(trusted, { week: 12, season: 3 }, 38);

    expect(trusted.confidence).toBeGreaterThan(developing.confidence);
    expect(recent).toBeGreaterThan(stale);
    expect(getEffectiveClaimConfidence(trusted, { week: 12, season: 3 }, 38)).toBe(stale);
    expect(LEGACY_SEASON_LENGTH_WEEKS).toBe(38);
  });

  it("never serializes forbidden player-truth keys", () => {
    const claims = [
      npcClaim("report-1"),
      buildContactEvidenceClaim({
        contact: contact(),
        playerId: "player-1",
        attribute: "consistency",
        hint: "A coach reports steady effort across difficult fixtures.",
        isHigh: true,
        reliability: 0.7,
        week: 4,
        season: 1,
      }),
    ];
    const forbidden = new Set([
      "currentAbility",
      "potentialAbility",
      "attributes",
      "personality",
      "hiddenTruth",
      "actualValue",
    ]);
    const keys: string[] = [];
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        keys.push(key);
        visit(nested);
      }
    };
    visit(claims);

    expect(keys.filter((key) => forbidden.has(key))).toEqual([]);
  });

  it("caps both total claims and claims from one source", () => {
    const manyClaims = Array.from({ length: 40 }, (_, index) => ({
      ...npcClaim(index < 10 ? "source-overloaded" : `source-${index}`),
      id: `claim-${index}`,
      sourceId: index < 10 ? "source-overloaded" : `source-${index}`,
    }));
    const capped = capComparableClaims(manyClaims);

    expect(capped).toHaveLength(MAX_COMPARABLE_EVIDENCE_SOURCES);
    expect(capped.filter((claim) => claim.sourceId === "source-overloaded")).toHaveLength(
      MAX_EVIDENCE_CLAIMS_PER_SOURCE,
    );
  });

  it("does not invent calibration when a report is merely reviewed", () => {
    const claim = npcClaim("reviewed-report");
    const savePayload = JSON.parse(JSON.stringify({ reviewed: true, evidenceClaims: [claim] })) as {
      reviewed: boolean;
      evidenceClaims: ScoutEvidenceClaim[];
    };

    expect(savePayload.reviewed).toBe(true);
    expect(savePayload.evidenceClaims[0].calibration).toEqual({
      status: "uncalibrated",
      note: "Reviewing a report is not an outcome; this recommendation remains uncalibrated.",
    });
  });
});
