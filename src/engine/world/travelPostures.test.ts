import { describe, expect, it } from "vitest";

import {
  getTravelPostureEffects,
  TRAVEL_POSTURE_DEFINITIONS,
} from "./travel";

describe("travel postures", () => {
  it("preserves legacy posture values exactly", () => {
    expect(TRAVEL_POSTURE_DEFINITIONS.deepDive.effects).toMatchObject({
      observationSignalMultiplier: 1.1,
      observationUncertaintyMultiplier: 0.9,
      regionalKnowledgeMultiplier: 1.35,
      contactQualityMultiplier: 0.8,
      discoveryMultiplier: 0.82,
      opportunityMultiplier: 0.8,
      costMultiplier: 1.12,
      fatigueMultiplier: 1.12,
    });
    expect(TRAVEL_POSTURE_DEFINITIONS.networkBuild.effects).toMatchObject({
      observationSignalMultiplier: 0.94,
      observationUncertaintyMultiplier: 1.06,
      regionalKnowledgeMultiplier: 1.08,
      contactQualityMultiplier: 1.55,
      discoveryMultiplier: 0.92,
      opportunityMultiplier: 1.18,
      costMultiplier: 1.08,
      fatigueMultiplier: 0.96,
    });
    expect(TRAVEL_POSTURE_DEFINITIONS.opportunityBlitz.effects).toMatchObject({
      observationSignalMultiplier: 0.88,
      observationUncertaintyMultiplier: 1.16,
      regionalKnowledgeMultiplier: 0.75,
      contactQualityMultiplier: 0.7,
      discoveryMultiplier: 1.45,
      opportunityMultiplier: 1.35,
      costMultiplier: 1.18,
      fatigueMultiplier: 1.25,
    });
    expect(TRAVEL_POSTURE_DEFINITIONS.assignmentFirst.effects).toMatchObject({
      observationSignalMultiplier: 1,
      observationUncertaintyMultiplier: 1,
      regionalKnowledgeMultiplier: 1,
      contactQualityMultiplier: 1,
      discoveryMultiplier: 0.82,
      opportunityMultiplier: 0.82,
      costMultiplier: 1,
      fatigueMultiplier: 0.9,
    });
  });

  it("adds new regional operating modes with distinct lead, relationship, and knowledge tradeoffs", () => {
    const academyEmbed = getTravelPostureEffects("academyEmbed");
    const communityCircuit = getTravelPostureEffects("communityCircuit");
    const agentTour = getTravelPostureEffects("agentTour");
    const showcaseSweep = getTravelPostureEffects("showcaseSweep");

    expect(academyEmbed.regionalKnowledgeMultiplier).toBeGreaterThan(showcaseSweep.regionalKnowledgeMultiplier);
    expect(academyEmbed.contactQualityMultiplier).toBeGreaterThan(showcaseSweep.contactQualityMultiplier);
    expect(showcaseSweep.discoveryMultiplier).toBeGreaterThan(academyEmbed.discoveryMultiplier);
    expect(agentTour.contactQualityMultiplier).toBeGreaterThan(communityCircuit.contactQualityMultiplier);
    expect(communityCircuit.discoveryMultiplier).toBeGreaterThan(agentTour.discoveryMultiplier);
    expect(agentTour.opportunityMultiplier).toBeGreaterThan(academyEmbed.opportunityMultiplier);
  });

  it("remains backward compatible for legacy bookings without a posture", () => {
    expect(getTravelPostureEffects(undefined)).toMatchObject({
      observationSignalMultiplier: 1,
      observationUncertaintyMultiplier: 1,
      regionalKnowledgeMultiplier: 1,
      contactQualityMultiplier: 1,
      discoveryMultiplier: 1,
      opportunityMultiplier: 1,
      costMultiplier: 1,
      fatigueMultiplier: 1,
    });
  });
});
