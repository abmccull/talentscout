import { describe, expect, it } from "vitest";

import { createObservationSituation } from "./situations";
import { getTravelPostureEffects } from "@/engine/world/travel";

describe("observation situations with travel postures", () => {
  it("makes academyEmbed materially stronger than showcaseSweep in academy contexts", () => {
    const embed = createObservationSituation({
      activityType: "academyVisit",
      seed: "academy-posture",
      travelPosture: "academyEmbed",
      countryId: "spain",
    });
    const sweep = createObservationSituation({
      activityType: "academyVisit",
      seed: "academy-posture",
      travelPosture: "showcaseSweep",
      countryId: "spain",
    });

    expect(embed.signalByDomain.technical).toBeGreaterThan(sweep.signalByDomain.technical);
    expect(embed.signalByDomain.tactical).toBeGreaterThan(sweep.signalByDomain.tactical);
    expect(embed.uncertaintyMultiplier).toBeLessThan(sweep.uncertaintyMultiplier);
  });

  it("makes communityCircuit stronger than academyEmbed in school-match contexts", () => {
    const community = createObservationSituation({
      activityType: "schoolMatch",
      seed: "school-posture",
      travelPosture: "communityCircuit",
      countryId: "england",
    });
    const embed = createObservationSituation({
      activityType: "schoolMatch",
      seed: "school-posture",
      travelPosture: "academyEmbed",
      countryId: "england",
    });

    expect(community.signalByDomain.technical).toBeGreaterThan(embed.signalByDomain.technical);
    expect(community.signalByDomain.mental).toBeGreaterThan(embed.signalByDomain.mental);
  });

  it("makes agentTour stronger than academyEmbed in agent-showcase contexts", () => {
    const agentTour = createObservationSituation({
      activityType: "agentShowcase",
      seed: "agent-posture",
      travelPosture: "agentTour",
      countryId: "portugal",
    });
    const academyEmbed = createObservationSituation({
      activityType: "agentShowcase",
      seed: "agent-posture",
      travelPosture: "academyEmbed",
      countryId: "portugal",
    });

    expect(agentTour.signalByDomain.technical).toBeGreaterThan(academyEmbed.signalByDomain.technical);
    expect(getTravelPostureEffects("agentTour").contactQualityMultiplier).toBeGreaterThan(
      getTravelPostureEffects("academyEmbed").contactQualityMultiplier,
    );
    expect(getTravelPostureEffects("agentTour").opportunityMultiplier).toBeGreaterThan(
      getTravelPostureEffects("academyEmbed").opportunityMultiplier,
    );
    expect(agentTour.reasons.join(" ")).toContain("agent tour");
  });
});
