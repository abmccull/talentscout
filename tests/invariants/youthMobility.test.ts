import { describe, expect, it } from "vitest";
import type {
  YouthMobilityAssessment,
  YouthMobilityAssessmentInput,
} from "@/engine/youth/youthMobility";
import {
  YOUTH_MOBILITY_MODEL_NOTICE,
  assessYouthMobility,
} from "@/engine/youth/youthMobility";

function makeInput(options: {
  age?: number;
  origin?: string;
  nationality?: string;
  target?: string;
  academy?: number;
  philosophy?: YouthMobilityAssessmentInput["targetClub"]["scoutingPhilosophy"];
  regionalKnowledge?: YouthMobilityAssessmentInput["targetRegionalKnowledge"];
  worldContext?: YouthMobilityAssessmentInput["worldContext"];
  developmentEnvironment?: YouthMobilityAssessmentInput["developmentEnvironment"];
} = {}): YouthMobilityAssessmentInput {
  const target = options.target ?? "england";
  return {
    youth: {
      id: "youth-1",
      country: options.origin ?? "england",
      player: {
        id: "player-1",
        age: options.age ?? 17,
        nationality: options.nationality ?? "English",
      },
    },
    targetClub: {
      id: "club-1",
      name: "Pathway Athletic",
      leagueId: `league-${target}`,
      reputation: 58,
      youthAcademyRating: options.academy ?? 17,
      scoutingPhilosophy: options.philosophy ?? "academyFirst",
      playerIds: Array.from({ length: 20 }, (_, index) => `senior-${index}`),
      academyPlayerIds: Array.from({ length: 10 }, (_, index) => `academy-${index}`),
    },
    targetLeague: {
      id: `league-${target}`,
      country: target,
      tier: 2,
    },
    targetRegionalKnowledge: options.regionalKnowledge ?? {
      countryId: target,
      knowledgeLevel: 80,
      culturalInsights: [
        {
          type: "developmentCulture",
          description: "Visible local academy context.",
          gameplayEffect: "Improves interpretation of support plans.",
        },
      ],
      localContacts: ["contact-1", "contact-2"],
    },
    worldContext: options.worldContext,
    developmentEnvironment: options.developmentEnvironment,
  };
}

function expectBounded(assessment: YouthMobilityAssessment): void {
  expect(assessment.overallRiskScore).toBeGreaterThanOrEqual(0);
  expect(assessment.overallRiskScore).toBeLessThanOrEqual(100);
  expect(assessment.confidence.score).toBeGreaterThanOrEqual(0);
  expect(assessment.confidence.score).toBeLessThanOrEqual(100);
  expect(assessment.clubDecisionAdjustment.score).toBeGreaterThanOrEqual(-12);
  expect(assessment.clubDecisionAdjustment.score).toBeLessThanOrEqual(3);
  expect(assessment.clubDecisionAdjustment.summary.length).toBeGreaterThan(0);
  for (const dimension of Object.values(assessment.dimensions)) {
    expect(dimension.riskScore).toBeGreaterThanOrEqual(0);
    expect(dimension.riskScore).toBeLessThanOrEqual(100);
    expect(dimension.summary.length).toBeGreaterThan(0);
    expect(new Set(dimension.reasons).size).toBe(dimension.reasons.length);
    expect(new Set(dimension.mitigationActions).size).toBe(
      dimension.mitigationActions.length,
    );
  }
  expect(assessment.visibleReasons.length).toBeLessThanOrEqual(5);
  expect(assessment.suggestedMitigationActions.length).toBeLessThanOrEqual(8);
  expect(new Set(assessment.visibleReasons).size).toBe(
    assessment.visibleReasons.length,
  );
  expect(new Set(assessment.suggestedMitigationActions).size).toBe(
    assessment.suggestedMitigationActions.length,
  );
}

describe("Youth Scout mobility assessment", () => {
  it("is deterministic, bounded, and does not mutate its input", () => {
    const input = makeInput({
      age: 17,
      origin: "Argentina",
      nationality: "Argentine",
      target: "Spain",
    });
    const before = JSON.stringify(input);

    const first = assessYouthMobility(input);
    const second = assessYouthMobility(input);

    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
    expect(first.originCountry.key).toBe("argentina");
    expect(first.targetCountry.key).toBe("spain");
    expect(first.modelNotice).toBe(YOUTH_MOBILITY_MODEL_NOTICE);
    expect(first.modelNotice).toMatch(/gameplay abstraction/i);
    expectBounded(first);
  });

  it("keeps a domestic route clear but blocks the same under-16 prospect cross-border", () => {
    const domestic = assessYouthMobility(makeInput({ age: 15, target: "england" }));
    const foreign = assessYouthMobility(makeInput({ age: 15, target: "spain" }));

    expect(domestic.status).toBe("clear");
    expect(domestic.dimensions.registration.status).toBe("clear");
    expect(foreign.status).toBe("blocked");
    expect(foreign.dimensions.registration.status).toBe("blocked");
    expect(foreign.clubDecisionAdjustment.score).toBe(-12);
    expect(foreign.clubDecisionAdjustment.summary).toMatch(/must not proceed/i);
    expect(foreign.dimensions.registration.riskScore).toBeGreaterThan(
      domestic.dimensions.registration.riskScore,
    );
    expect(foreign.suggestedMitigationActions.join(" ")).toMatch(/16th birthday/i);
  });

  it("makes an established, language-bridged route safer than a distant uncommon route", () => {
    const spain = assessYouthMobility(makeInput({
      age: 17,
      origin: "argentina",
      nationality: "Argentine",
      target: "spain",
    }));
    const japan = assessYouthMobility(makeInput({
      age: 17,
      origin: "argentina",
      nationality: "Argentine",
      target: "japan",
    }));

    expect(spain.routeFamiliarity).toBe("established");
    expect(japan.routeFamiliarity).toBe("uncommon");
    expect(spain.dimensions.adaptation.riskScore).toBeLessThan(
      japan.dimensions.adaptation.riskScore,
    );
    expect(spain.dimensions.familyEducation.riskScore).toBeLessThan(
      japan.dimensions.familyEducation.riskScore,
    );
    expect(spain.overallRiskScore).toBeLessThan(japan.overallRiskScore);
    expect(spain.clubDecisionAdjustment.score).toBeGreaterThan(
      japan.clubDecisionAdjustment.score,
    );
  });

  it("uses regional knowledge for confidence without changing intrinsic route facts", () => {
    const noDossier = assessYouthMobility({
      ...makeInput({ age: 18, origin: "spain", target: "france" }),
      targetRegionalKnowledge: undefined,
    });
    const strongDossier = assessYouthMobility(makeInput({
      age: 18,
      origin: "spain",
      target: "france",
      regionalKnowledge: {
        countryId: "france",
        knowledgeLevel: 95,
        culturalInsights: [
          { type: "playingStyle", description: "A", gameplayEffect: "A" },
          { type: "developmentCulture", description: "B", gameplayEffect: "B" },
          { type: "mentalityPattern", description: "C", gameplayEffect: "C" },
          { type: "physicalTrait", description: "D", gameplayEffect: "D" },
        ],
        localContacts: ["one", "two", "three"],
      },
    }));

    expect(noDossier.confidence.band).toBe("limited");
    expect(strongDossier.confidence.band).toBe("strong");
    expect(strongDossier.confidence.score).toBeGreaterThan(noDossier.confidence.score);
    expect(strongDossier.dimensions).toEqual(noDossier.dimensions);
    expect(strongDossier.overallRiskScore).toBeLessThan(noDossier.overallRiskScore);
  });

  it("uses only a matching target-country regional dossier", () => {
    const mismatched = assessYouthMobility(makeInput({
      origin: "england",
      target: "spain",
      regionalKnowledge: {
        countryId: "germany",
        knowledgeLevel: 100,
        culturalInsights: [],
        localContacts: ["contact"],
      },
    }));

    expect(mismatched.confidence.band).toBe("limited");
    expect(mismatched.confidence.summary).toMatch(/Germany, not Spain/i);
  });

  it("lets player-safe development and public world context change support risk", () => {
    const supportive = assessYouthMobility(makeInput({
      age: 18,
      origin: "spain",
      target: "france",
      developmentEnvironment: {
        score: 82,
        band: "excellent",
        factors: [
          {
            id: "playing-pathway",
            label: "Playing pathway",
            impact: "strong-positive",
            summary: "A visible route to appropriately staged match minutes is in place.",
          },
        ],
      },
      worldContext: {
        developmentMultiplier: 1.1,
        opportunityMultiplier: 1.08,
        travelDurationDelta: -1,
        travelFatigueMultiplier: 0.95,
      },
    }));
    const adverse = assessYouthMobility(makeInput({
      age: 18,
      origin: "spain",
      target: "france",
      developmentEnvironment: {
        score: 32,
        band: "restricted",
        factors: [
          {
            id: "playing-pathway",
            label: "Playing pathway",
            impact: "strong-negative",
            summary: "Visible squad congestion leaves no credible staged route to minutes.",
          },
        ],
      },
      worldContext: {
        developmentMultiplier: 0.85,
        opportunityMultiplier: 0.8,
        travelDurationDelta: 2,
        travelFatigueMultiplier: 1.2,
      },
    }));

    expect(supportive.dimensions.pathwaySupport.riskScore).toBeLessThan(
      adverse.dimensions.pathwaySupport.riskScore,
    );
    expect(supportive.dimensions.adaptation.riskScore).toBeLessThan(
      adverse.dimensions.adaptation.riskScore,
    );
    expect(supportive.dimensions.familyEducation.riskScore).toBeLessThan(
      adverse.dimensions.familyEducation.riskScore,
    );
    expect(adverse.dimensions.pathwaySupport.reasons.join(" ")).toMatch(
      /squad congestion/i,
    );
  });

  it("cannot leak or react to hidden current or potential ability values", () => {
    const base = makeInput({ age: 17, origin: "brazil", target: "spain" });
    const lowHidden = {
      ...base,
      youth: {
        ...base.youth,
        player: {
          ...base.youth.player,
          currentAbility: 20,
          potentialAbility: 40,
        } as typeof base.youth.player,
      },
    };
    const highHidden = {
      ...base,
      youth: {
        ...base.youth,
        player: {
          ...base.youth.player,
          currentAbility: 190,
          potentialAbility: 200,
        } as typeof base.youth.player,
      },
    };

    const low = assessYouthMobility(lowHidden);
    const high = assessYouthMobility(highHidden);

    expect(low).toEqual(high);
    expect(JSON.stringify(low)).not.toMatch(
      /\b(?:currentAbility|potentialAbility|CA|PA)\b/,
    );
  });
});
