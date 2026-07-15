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

describe("versioned observation authored content", () => {
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
      "observation-atmosphere-event:rain_starts@observation-atmosphere-events.1",
    );
    expect(definitionIds).toContain(
      "investigation-consequence-narrative:safe-reliable-information@investigation-consequence-narratives.1",
    );
  });
});
