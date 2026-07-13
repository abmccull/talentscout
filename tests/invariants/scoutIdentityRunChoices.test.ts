import { describe, expect, it } from "vitest";
import type { Contact, NewGameConfig } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import {
  SCOUT_DOCTRINES,
  SCOUT_FLAWS,
  SCOUT_ORIGINS,
  applyScoutIdentityContactEffects,
  createRunManifest,
  getRunSimulationModifiers,
  getScoutIdentityContentDefinitionIds,
} from "@/engine/run";
import { createScout } from "@/engine/scout/creation";
import { createSaveEnvelope, extractSaveStatePayload } from "@/lib/saveEnvelope";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Morgan",
  scoutLastName: "Reed",
  scoutAge: 31,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "identity-run-choice",
  selectedCountries: ["england"],
  startingCountry: "england",
  skillAllocations: {
    potentialAssessment: 5,
    psychologicalRead: 2,
    playerJudgment: 1,
  },
};

function manifestChoices(overrides: {
  originId?: string;
  flawId?: string;
  doctrineIds?: string[];
} = {}) {
  return createRunManifest({
    rootSeed: CONFIG.worldSeed,
    specialization: CONFIG.specialization,
    difficulty: CONFIG.difficulty,
    selectedCountries: ["england"],
    startingCountry: "england",
    worldTraitIds: [],
    contentDefinitionIds: getScoutIdentityContentDefinitionIds(),
    ...overrides,
  });
}

describe("run-defining scout identity choices", () => {
  it("ships four unique, mechanically defined choices in every category", () => {
    const catalogs = [SCOUT_ORIGINS, SCOUT_FLAWS, SCOUT_DOCTRINES];
    for (const catalog of catalogs) {
      expect(catalog.length).toBeGreaterThanOrEqual(4);
      expect(new Set(catalog.map((definition) => definition.id)).size).toBe(catalog.length);
      for (const definition of catalog) {
        expect(definition.name).not.toBe("");
        expect(definition.description).not.toBe("");
        expect(definition.playerFacingEffects.length).toBeGreaterThan(0);
        expect(Boolean(definition.startingEffects || definition.simulationModifiers)).toBe(true);
      }
    }
  });

  it("applies every origin and flaw deterministically to real starting scout state", () => {
    const baseline = createScout(CONFIG, new RNG("identity-effects"));

    for (const origin of SCOUT_ORIGINS) {
      const first = createScout(
        { ...CONFIG, originId: origin.id },
        new RNG("identity-effects"),
      );
      const replay = createScout(
        { ...CONFIG, originId: origin.id },
        new RNG("identity-effects"),
      );
      expect(first).toEqual(replay);
      expect(first).not.toEqual(baseline);
    }

    for (const flaw of SCOUT_FLAWS) {
      const first = createScout(
        { ...CONFIG, flawId: flaw.id },
        new RNG("identity-effects"),
      );
      const replay = createScout(
        { ...CONFIG, flawId: flaw.id },
        new RNG("identity-effects"),
      );
      expect(first).toEqual(replay);
      expect(first).not.toEqual(baseline);
    }
  });

  it("applies network effects to authoritative contact relationship and trust", () => {
    const contact: Contact = {
      id: "contact-1",
      name: "Casey Holt",
      type: "academyCoach",
      organization: "Riverside Academy",
      relationship: 30,
      reliability: 75,
      knownPlayerIds: [],
      trustLevel: 30,
      loyalty: 50,
    };

    const connected = applyScoutIdentityContactEffects([contact], {
      originId: "grassroots-organizer",
    });
    expect(connected[0]).toMatchObject({ relationship: 38, trustLevel: 35 });

    const fragile = applyScoutIdentityContactEffects([contact], {
      flawId: "fragile-network",
    });
    expect(fragile[0]).toMatchObject({ relationship: 22, trustLevel: 25 });
    expect(contact).toMatchObject({ relationship: 30, trustLevel: 30 });
  });

  it("makes every doctrine alter the ongoing simulation modifier set", () => {
    const baseline = getRunSimulationModifiers(manifestChoices());
    for (const doctrine of SCOUT_DOCTRINES) {
      const first = getRunSimulationModifiers(manifestChoices({ doctrineIds: [doctrine.id] }));
      const replay = getRunSimulationModifiers(manifestChoices({ doctrineIds: [doctrine.id] }));
      expect(first).toEqual(replay);
      expect(first).not.toEqual(baseline);
    }

    const proactive = getRunSimulationModifiers(
      manifestChoices({ doctrineIds: ["move-before-market"] }),
    );
    expect(proactive.narrativeEventChanceMultiplier).toBeCloseTo(1.12);
    expect(proactive.rivalDiscoveryChanceMultiplier).toBeCloseTo(0.88);
    expect(proactive.rivalSigningChanceMultiplier).toBeCloseTo(0.82);
  });

  it("persists selections through a versioned JSON save round trip", () => {
    const runManifest = manifestChoices({
      originId: "video-analyst",
      flawId: "travel-worn",
      doctrineIds: ["contrarian-eye"],
    });
    const envelope = createSaveEnvelope({ runManifest, marker: "identity-save" });
    const restored = extractSaveStatePayload(
      JSON.parse(JSON.stringify(envelope)),
    ) as { runManifest: typeof runManifest; marker: string };

    expect(restored.marker).toBe("identity-save");
    expect(restored.runManifest).toEqual(runManifest);
    expect(restored.runManifest).toMatchObject({
      originId: "video-analyst",
      flawId: "travel-worn",
      doctrineIds: ["contrarian-eye"],
    });
  });
});
