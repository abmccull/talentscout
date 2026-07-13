import { describe, expect, it } from "vitest";
import type {
  HiddenIntel,
  NPCScoutReport,
  Observation,
  ReflectionHypothesisRecord,
  ScoutReport,
} from "@/engine/core/types";
import {
  buildContactEvidenceClaim,
  buildNPCAttributeEvidenceClaims,
  deriveContactPerspective,
} from "@/engine/scout/sourcePerspectives";
import {
  buildEvidenceBoardModel,
  categoryForHypothesis,
  getConnectedHypothesisIds,
  getVisibleConnectedSourceIds,
} from "./evidenceBoardModel";

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: "obs-1",
    playerId: "player-1",
    scoutId: "scout-1",
    week: 4,
    season: 1,
    context: "schoolMatch",
    attributeReadings: [{
      attribute: "passing",
      perceivedValue: 14,
      confidence: 0.75,
      observationCount: 1,
    }],
    notes: ["Saw two line-breaking passes under pressure."],
    flaggedMoments: [],
    ...overrides,
  };
}

const hypothesis: ReflectionHypothesisRecord = {
  id: "hyp-1",
  playerId: "player-1",
  text: "Can the player retain their passing range under pressure?",
  domain: "technical",
  state: "contradicted",
  createdAtWeek: 3,
  evidence: [
    {
      id: "ev-1",
      week: 3,
      direction: "for",
      description: "Positive school match evidence",
      strength: "strong",
      sourceType: "observation",
      sourceId: "obs-1",
    },
    {
      id: "ev-2",
      week: 4,
      direction: "against",
      description: "Negative tournament evidence",
      strength: "moderate",
      sourceType: "observation",
      sourceId: "obs-2",
    },
  ],
};

describe("evidence board model", () => {
  it("builds a visible evidence chain without exposing player truth", () => {
    const intel: HiddenIntel[] = [{
      playerId: "player-1",
      attribute: "professionalism",
      hint: "A coach says the player is always first to training.",
      reliability: 0.6,
    }];

    const model = buildEvidenceBoardModel({
      observations: [observation(), observation({ id: "obs-2", week: 5, context: "academyTrialDay" })],
      contactIntel: intel,
      hypotheses: [hypothesis],
      selectedHypothesisIds: ["hyp-1"],
      unknowns: ["Adaptability outside the home region"],
    });

    expect(model.sources.map((source) => source.kind)).toEqual([
      "observation",
      "observation",
      "contactIntel",
    ]);
    expect(model.sources[0].detail).toContain("line-breaking passes");
    expect(model.sources.find((source) => source.kind === "contactIntel")?.confidence).toBeUndefined();
    expect(model.hypotheses[0]).toMatchObject({
      category: "potential",
      evidenceFor: 1,
      evidenceAgainst: 1,
      selectedForDraft: true,
    });
    expect(model.claims[0]).toMatchObject({ source: "draft", category: "potential" });
    expect(model.unknowns).toContain("Adaptability outside the home region");
    expect(model.metrics).toMatchObject({ contextCount: 2, contradictions: 1, draftClaims: 1 });
    expect(JSON.stringify(model)).not.toContain("actualAttributes");
  });

  it("maps tactical and character hypotheses into the report categories", () => {
    expect(categoryForHypothesis({ domain: "tactical" })).toBe("roleFit");
    expect(categoryForHypothesis({ domain: "mental" })).toBe("characterRisk");
    expect(categoryForHypothesis({ domain: "hidden" })).toBe("characterRisk");
    expect(categoryForHypothesis({ domain: "physical" })).toBe("potential");
  });

  it("surfaces prior report uncertainty and keeps the latest submitted claims", () => {
    const older = {
      id: "report-old",
      playerId: "player-1",
      scoutId: "scout-1",
      submittedWeek: 2,
      submittedSeason: 1,
      categoryVerdicts: {
        potential: {
          verdict: "Older verdict",
          confidence: "low",
          hypothesisIds: [],
          acknowledgedUncertainty: "Growth curve unknown",
        },
      },
    } as unknown as ScoutReport;
    const latest = {
      ...older,
      id: "report-latest",
      submittedWeek: 6,
      categoryVerdicts: {
        roleFit: {
          verdict: "Can operate as an inverted winger.",
          confidence: "medium",
          hypothesisIds: ["hyp-1"],
          acknowledgedUncertainty: "Has not faced a deep block",
        },
      },
    } as unknown as ScoutReport;

    const model = buildEvidenceBoardModel({
      observations: [],
      reports: [older, latest],
    });

    expect(model.claims).toHaveLength(1);
    expect(model.claims[0]).toMatchObject({
      id: "report-report-latest-roleFit",
      verdict: "Can operate as an inverted winger.",
      source: "submitted",
    });
    expect(model.unknowns).toEqual(expect.arrayContaining([
      "Growth curve unknown",
      "Has not faced a deep block",
    ]));
  });

  it("deduplicates repeated hypotheses and unknowns", () => {
    const model = buildEvidenceBoardModel({
      observations: [],
      hypotheses: [
        hypothesis,
        { ...hypothesis, state: "supported", evidence: [] },
      ],
      unknowns: ["Away adaptation", " away adaptation "],
    });

    expect(model.hypotheses).toHaveLength(1);
    expect(model.hypotheses[0].state).toBe("supported");
    expect(model.unknowns).toEqual(["Away adaptation"]);
  });

  it("resolves connections in both directions without counting capped-out sources", () => {
    const linkedHypothesis = {
      ...hypothesis,
      evidence: [
        ...(hypothesis.evidence ?? []),
        {
          id: "ev-hidden",
          week: 5,
          direction: "for" as const,
          description: "A source omitted by the capped board.",
          strength: "weak" as const,
          sourceType: "observation" as const,
          sourceId: "obs-not-visible",
        },
      ],
    };
    const model = buildEvidenceBoardModel({
      observations: [observation(), observation({ id: "obs-2" })],
      hypotheses: [linkedHypothesis],
    });

    expect(getConnectedHypothesisIds(model, "obs-1")).toEqual(["hyp-1"]);
    expect(getConnectedHypothesisIds(model, "unrelated")).toEqual([]);
    expect(getVisibleConnectedSourceIds(model, "hyp-1")).toEqual(["obs-1", "obs-2"]);
  });

  it("shows attributed agreement and conflict without exposing hidden truth", () => {
    const contact = {
      id: "contact-1",
      name: "Marta Silva",
      type: "academyCoach" as const,
      organization: "Academia Norte",
      relationship: 70,
      reliability: 80,
      knownPlayerIds: ["player-1"],
      interactionHistory: [
        { week: 1, type: "meeting" as const, trustDelta: 2 },
        { week: 2, type: "meeting" as const, trustDelta: 2 },
        { week: 3, type: "meeting" as const, trustDelta: 2 },
      ],
    };
    const npcPerspective = {
      actorId: "npc-1",
      actorKind: "npcScout" as const,
      lens: "immediateImpact" as const,
      riskTolerance: "cautious" as const,
      reliabilityBand: "established" as const,
      biases: [],
    };
    const npcReport: NPCScoutReport = {
      id: "npc-report-1",
      npcScoutId: "npc-1",
      playerId: "player-1",
      week: 5,
      season: 1,
      quality: 70,
      summary: "A cautious first-team read.",
      recommendation: "monitor",
      reviewed: false,
      sourcePerspective: npcPerspective,
      evidenceClaims: buildNPCAttributeEvidenceClaims({
        reportId: "npc-report-1",
        playerId: "player-1",
        sourceName: "Jonas Reed",
        perspective: npcPerspective,
        readings: [{ attribute: "passing", perceivedValue: 7, confidence: 0.7 }],
        week: 5,
        season: 1,
      }),
    };
    const intelClaim = buildContactEvidenceClaim({
      contact: { ...contact, evidencePerspective: deriveContactPerspective(contact) },
      playerId: "player-1",
      attribute: "professionalism",
      hint: "Sets the standard in training.",
      isHigh: true,
      reliability: 0.8,
      week: 5,
      season: 1,
    });
    const intel: HiddenIntel = {
      playerId: "player-1",
      attribute: "professionalism",
      hint: intelClaim.statement,
      reliability: 0.8,
      sourceContactId: contact.id,
      sourceName: contact.name,
      recordedWeek: 5,
      recordedSeason: 1,
      evidenceClaim: intelClaim,
    };

    const model = buildEvidenceBoardModel({
      observations: [
        observation(),
        observation({
          id: "obs-character",
          attributeReadings: [{
            attribute: "professionalism",
            perceivedValue: 6,
            confidence: 0.6,
            observationCount: 1,
          }],
          notes: ["Effort dropped after a difficult coaching intervention."],
        }),
      ],
      contactIntel: [intel],
      npcReports: [npcReport],
      now: { week: 6, season: 1 },
      seasonLength: 38,
    });
    const npcSource = model.sources.find((source) => source.kind === "npcReport");
    const contactSource = model.sources.find((source) => source.kind === "contactIntel");

    expect(npcSource).toMatchObject({
      attribution: "Jonas Reed · NPC scout",
      category: "Passing",
      claimDirection: "negative",
      relation: "conflict",
    });
    expect(contactSource).toMatchObject({
      attribution: "Marta Silva",
      category: "Professionalism",
      relation: "conflict",
      calibration: { status: "uncalibrated" },
    });
    expect(npcSource?.explanation).toContain("Different context or reference standards");
    expect(JSON.stringify(model)).not.toMatch(/currentAbility|potentialAbility|actualValue|hiddenTruth/);
  });

  it("keeps legacy sources neutral and caps the visible evidence model", () => {
    const legacyIntel: HiddenIntel = {
      playerId: "player-1",
      attribute: "professionalism",
      hint: "Old notebook entry.",
      reliability: 0.6,
    };
    const model = buildEvidenceBoardModel({
      observations: Array.from({ length: 20 }, (_, index) => observation({ id: `obs-${index}`, week: index + 1 })),
      contactIntel: [legacyIntel],
      npcReports: [{
        id: "legacy-report",
        npcScoutId: "legacy-scout",
        playerId: "player-1",
        week: 1,
        season: 1,
        quality: 55,
        summary: "Legacy note",
        recommendation: "shortlist",
        reviewed: true,
      }],
    });

    expect(model.sources.length).toBeLessThanOrEqual(16);
    expect(model.sources.find((source) => source.kind === "contactIntel")).toMatchObject({
      confidence: undefined,
      calibration: { status: "uncalibrated" },
    });
  });
});
