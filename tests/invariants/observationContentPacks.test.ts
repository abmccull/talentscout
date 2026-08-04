import { describe, expect, it } from "vitest";
import { getRunContentDefinitionIds } from "@/engine/content/registry";
import { createRNG, type RNG } from "@/engine/rng/index";
import {
  OBSERVATION_ATMOSPHERE_EVENT_CONTENT_PACK,
  OBSERVATION_ATMOSPHERE_EVENT_TEMPLATES,
  generateAtmosphereEvent,
} from "@/engine/observation/atmosphere";
import {
  INVESTIGATION_CONSEQUENCE_NARRATIVE_CONTENT_PACK,
  generateDialogueConsequence,
  type InvestigationConsequenceNarrativeCategory,
} from "@/engine/observation/investigation";
import {
  CORE_YOUTH_OBSERVATION_ACTIVITY_TYPES,
  OBSERVATION_SITUATION_CONTENT_PACK,
  getObservationSituationDefinitionsForActivity,
  selectObservationSituationDefinition,
} from "@/engine/observation/situationCatalog";

describe("versioned observation authored content", () => {
  it("keeps observation situation variants validated, bounded, and mechanically distinct", () => {
    const pack = OBSERVATION_SITUATION_CONTENT_PACK;

    expect(pack.manifest.id).toBe("talentscout.observation-situations");
    expect(pack.manifest.contentVersion).toBe("observation-situations.1");
    expect(new Set(pack.entries.map((entry) => entry.id)).size).toBe(pack.entries.length);

    for (const activityType of CORE_YOUTH_OBSERVATION_ACTIVITY_TYPES) {
      const variants = getObservationSituationDefinitionsForActivity(activityType);
      const baseline = variants.find((entry) => entry.defaultBaseline);

      expect(variants.length).toBeGreaterThanOrEqual(3);
      expect(baseline).toBeDefined();

      for (const variant of variants) {
        expect(variant.levels.length).toBeGreaterThan(0);
        expect(variant.stakes.length).toBeGreaterThan(0);
        expect(variant.frames.length).toBeGreaterThan(0);
        expect(variant.tags.length).toBeGreaterThan(0);
        expect(variant.reasons.length).toBeGreaterThan(0);
        expect(variant.uncertainty).toBeGreaterThanOrEqual(0.7);
        expect(variant.uncertainty).toBeLessThanOrEqual(1.6);
        expect(variant.misleadingRisk).toBeGreaterThanOrEqual(0.03);
        expect(variant.misleadingRisk).toBeLessThanOrEqual(0.45);
        for (const value of Object.values(variant.signal)) {
          expect(value).toBeGreaterThanOrEqual(0.55);
          expect(value).toBeLessThanOrEqual(1.45);
        }
      }

      for (const variant of variants.filter((entry) => !entry.defaultBaseline)) {
        expect(
          JSON.stringify(variant.stakes) !== JSON.stringify(baseline?.stakes)
          || JSON.stringify(variant.frames) !== JSON.stringify(baseline?.frames)
          || JSON.stringify(variant.signal) !== JSON.stringify(baseline?.signal)
          || variant.uncertainty !== baseline?.uncertainty
          || variant.misleadingRisk !== baseline?.misleadingRisk,
        ).toBe(true);
        expect(variant.tags.some((tag) => tag.startsWith("variant:"))).toBe(true);
        expect(variant.reasons.join(" ")).not.toBe(baseline?.reasons.join(" "));
      }
    }
  });

  it("selects observation situation variants deterministically and exposes seed diversity", () => {
    for (const activityType of CORE_YOUTH_OBSERVATION_ACTIVITY_TYPES) {
      const first = selectObservationSituationDefinition(activityType, `${activityType}:stable-seed`);
      const replay = selectObservationSituationDefinition(activityType, `${activityType}:stable-seed`);
      const seen = new Set(
        Array.from({ length: 64 }, (_, index) =>
          selectObservationSituationDefinition(activityType, `${activityType}:seed-${index}`)?.id,
        ),
      );

      expect(replay?.id).toBe(first?.id);
      expect(seen.has(undefined)).toBe(false);
      expect(seen.size).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps every dynamic atmosphere event uniquely identified and playable", () => {
    const pack = OBSERVATION_ATMOSPHERE_EVENT_CONTENT_PACK;
    expect(pack.manifest.id).toBe("talentscout.observation-atmosphere-events");
    expect(pack.manifest.contentVersion).toBe("observation-atmosphere-events.1");
    expect(OBSERVATION_ATMOSPHERE_EVENT_TEMPLATES).toBe(pack.entries);
    expect(new Set(pack.entries.map((entry) => entry.id)).size).toBe(
      pack.entries.length,
    );

    const forcedFirstCandidate = {
      chance: () => true,
      pickWeighted: <T>(items: ReadonlyArray<{ item: T; weight: number }>) =>
        items[0].item,
    } as unknown as RNG;
    const event = generateAtmosphereEvent(
      forcedFirstCandidate,
      {
        venueType: "schoolMatch",
        chaosLevel: 0.2,
        amplifiedAttributes: [],
        dampenedAttributes: [],
        weather: "overcast",
        crowdIntensity: 0.3,
        description: "test venue",
      },
      0,
      4,
    );

    expect(event?.id).toBe("rain_starts_0");
    expect(event?.description).toBe(pack.entries[0].description);
  });

  it("covers every dialogue risk outcome with stable, non-empty narrative entries", () => {
    const pack = INVESTIGATION_CONSEQUENCE_NARRATIVE_CONTENT_PACK;
    const expectedCategories: InvestigationConsequenceNarrativeCategory[] = [
      "safe",
      "moderate",
      "moderate-negative",
      "bold-positive",
      "bold-negative",
      "insight",
    ];

    expect(pack.manifest.id).toBe(
      "talentscout.investigation-consequence-narratives",
    );
    expect(pack.manifest.contentVersion).toBe(
      "investigation-consequence-narratives.1",
    );
    expect(new Set(pack.entries.map((entry) => entry.id)).size).toBe(
      pack.entries.length,
    );
    for (const category of expectedCategories) {
      expect(
        pack.entries.filter((entry) => entry.category === category),
      ).not.toHaveLength(0);
    }

    const consequence = generateDialogueConsequence(
      createRNG("observation-content-pack-safe-consequence"),
      {
        id: "safe-option",
        text: "Keep the conversation open",
        riskLevel: "safe",
        outcome: { narrativeText: "" },
      },
      "networkMeeting",
    );
    expect(
      pack.entries
        .filter((entry) => entry.category === "safe")
        .map((entry) => entry.text),
    ).toContain(consequence.narrativeText);
  });

  it("includes observation content in every Youth Scout run definition ledger", () => {
    const definitionIds = getRunContentDefinitionIds("youth-scout");

    expect(definitionIds).toContain(
      "observation-situation:schoolMatch-selectionWindow@observation-situations.1",
    );
    expect(definitionIds).toContain(
      "observation-atmosphere-event:rain_starts@observation-atmosphere-events.1",
    );
    expect(definitionIds).toContain(
      "investigation-consequence-narrative:safe-reliable-information@investigation-consequence-narratives.1",
    );
  });
});
