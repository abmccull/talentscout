import { describe, expect, it } from "vitest";
import {
  CONTENT_SCHEMA_VERSION,
  ContentValidationError,
  defineContentPack,
  getContentDefinitionIds,
  getContentEntry,
} from "@/engine/content/contracts";
import {
  MODE_DEFINITIONS,
  getGameModeDefinition,
} from "@/engine/content/modeDefinitions";
import {
  SHIPPED_CONTENT_PACKS,
  getRunContentDefinitionIds,
  getShippedContentDefinitionIds,
} from "@/engine/content/registry";
import {
  EVENT_TEMPLATE_CONTENT_PACK,
  EVENT_TEMPLATES,
} from "@/engine/events/eventTemplates";
import {
  INSIGHT_NARRATIVE_CONTENT_PACK,
  INSIGHT_NARRATIVES,
} from "@/engine/insight/actions";
import { INSIGHT_ACTIONS } from "@/engine/insight/types";
import {
  SCENARIO_CONTENT_PACK,
  SCENARIOS,
  getScenarioDefinition,
} from "@/engine/scenarios/scenarioDefinitions";

describe("versioned authored content registry", () => {
  it("rejects malformed manifests, duplicate IDs, and invalid definitions at the authored boundary", () => {
    expect(() =>
      defineContentPack({
        manifest: {
          id: "",
          kind: "scenario",
          schemaVersion: 0,
          contentVersion: "",
        },
        entries: [{ id: "duplicate" }, { id: "duplicate" }],
        getDefinitionId: (definition) => definition.id,
        validateDefinition: () => [
          { path: "title", message: "is required" },
        ],
      }),
    ).toThrow(ContentValidationError);
  });

  it("keeps every shipped pack versioned, immutable, and addressable by stable IDs", () => {
    expect(SHIPPED_CONTENT_PACKS.map((pack) => pack.manifest.id)).toEqual([
      "talentscout.narrative-event-templates",
      "talentscout.scenarios",
      "talentscout.game-modes",
      "talentscout.insight-narratives",
      "talentscout.observation-atmosphere-events",
      "talentscout.investigation-consequence-narratives",
    ]);

    for (const pack of SHIPPED_CONTENT_PACKS) {
      expect(pack.manifest.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
      expect(pack.manifest.contentVersion.length).toBeGreaterThan(0);
      expect(Object.isFrozen(pack.entries)).toBe(true);
    }

    expect(new Set(EVENT_TEMPLATES.map((entry) => entry.type)).size).toBe(
      EVENT_TEMPLATES.length,
    );
    expect(new Set(SCENARIOS.map((entry) => entry.id)).size).toBe(
      SCENARIOS.length,
    );
    expect(new Set(MODE_DEFINITIONS.map((entry) => entry.id)).size).toBe(
      MODE_DEFINITIONS.length,
    );
    expect(
      new Set(INSIGHT_NARRATIVE_CONTENT_PACK.entries.map((entry) => entry.id)).size,
    ).toBe(INSIGHT_NARRATIVE_CONTENT_PACK.entries.length);

    const definitionIds = getShippedContentDefinitionIds();
    expect(new Set(definitionIds).size).toBe(definitionIds.length);
    expect(definitionIds).toContain("game-mode:youth-scout@modes.1");
    expect(definitionIds).toContain("scenario:the_rescue_job@scenarios.1");
    expect(definitionIds).toContain(
      "event-template:rivalPoach@events.1",
    );
    expect(definitionIds).toContain(
      "observation-atmosphere-event:rain_starts@observation-atmosphere-events.1",
    );
    expect(definitionIds).toContain(
      "investigation-consequence-narrative:safe-reliable-information@investigation-consequence-narratives.1",
    );
  });

  it("keeps scenario and event content backed by one validated lookup source", () => {
    const rescueJob = getScenarioDefinition("the_rescue_job");
    expect(rescueJob).toBeDefined();
    expect(getContentEntry(SCENARIO_CONTENT_PACK, "the_rescue_job")).toBe(
      rescueJob,
    );
    expect(SCENARIOS).toBe(SCENARIO_CONTENT_PACK.entries);
    expect(EVENT_TEMPLATES).toBe(EVENT_TEMPLATE_CONTENT_PACK.entries);
    expect(getContentDefinitionIds(EVENT_TEMPLATE_CONTENT_PACK)).toHaveLength(
      EVENT_TEMPLATES.length,
    );
  });

  it("requires active insight prose for every shipped action and specialization", () => {
    expect(INSIGHT_NARRATIVE_CONTENT_PACK.entries.map((entry) => entry.id)).toEqual(
      INSIGHT_ACTIONS.map((action) => action.id),
    );

    for (const action of INSIGHT_ACTIONS) {
      const variants = INSIGHT_NARRATIVES[action.id];
      expect(variants.universal.length).toBeGreaterThan(0);
      expect(variants.youth.length).toBeGreaterThan(0);
      expect(variants.firstTeam.length).toBeGreaterThan(0);
      expect(variants.regional.length).toBeGreaterThan(0);
      expect(variants.data.length).toBeGreaterThan(0);
    }
  });

  it("separates four career modes from the challenge play format", () => {
    expect(MODE_DEFINITIONS.map((mode) => mode.id)).toEqual([
      "youth-scout",
      "first-team-scout",
      "regional-expert",
      "data-scout",
    ]);
    expect(getGameModeDefinition("challenge-careers")).toBeUndefined();
    expect(getGameModeDefinition("youth-scout")?.status).toBe("available");
    expect(
      MODE_DEFINITIONS.filter((mode) => mode.status === "available").map(
        (mode) => mode.id,
      ),
    ).toEqual(["youth-scout"]);
  });

  it("fingerprints only the active mode and selected scenario for a run", () => {
    const youthRunIds = getRunContentDefinitionIds("youth-scout");

    expect(youthRunIds).toContain("game-mode:youth-scout@modes.1");
    expect(youthRunIds).toContain(
      "observation-atmosphere-event:rain_starts@observation-atmosphere-events.1",
    );
    expect(youthRunIds).toContain(
      "investigation-consequence-narrative:safe-reliable-information@investigation-consequence-narratives.1",
    );
    expect(youthRunIds).not.toContain("game-mode:first-team-scout@modes.1");
    expect(youthRunIds).not.toContain("scenario:the_rescue_job@scenarios.1");
    expect(getRunContentDefinitionIds("youth-scout", "the_rescue_job")).toContain(
      "scenario:the_rescue_job@scenarios.1",
    );
    expect(() => getRunContentDefinitionIds("youth-scout", "missing")).toThrow(
      "Unknown scenario content",
    );
  });
});
