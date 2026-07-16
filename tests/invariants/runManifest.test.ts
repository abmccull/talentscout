import { describe, expect, it } from "vitest";
import {
  createContentFingerprint,
  createDeterministicRunId,
  createNamedRNG,
  createRunManifest,
  getRunGameModeId,
  getRunKind,
  deriveNamedSeed,
  formatRunFingerprint,
  repairRunManifest,
  stableFingerprint,
  stableSerialize,
  validateRunManifest,
} from "@/engine/run";

const BASE_INPUT = {
  rootSeed: "academy-42",
  specialization: "youth" as const,
  difficulty: "normal" as const,
  selectedCountries: ["england", "spain"],
  startingCountry: "england",
  worldTraitIds: ["golden-generation", "agent-cartel"],
  mutatorIds: ["compressed-calendar", "live-only"],
  originId: "academy-insider",
  flawId: "promise-keeper",
  doctrineIds: ["first-through-door"],
  legacyUnlockIds: ["arc-family-trust", "origin-local-loyalist"],
  contentDefinitionIds: [
    "trait:golden-generation",
    "trait:agent-cartel",
    "arc:family-trust",
  ],
};

describe("deterministic run manifest", () => {
  it("produces a stable identity without wall-clock or global randomness", () => {
    const first = createRunManifest(BASE_INPUT);
    const second = createRunManifest({ ...BASE_INPUT });

    expect(first).toEqual(second);
    expect(first.runId).toBe(`run_${first.fingerprint}`);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(formatRunFingerprint(first.fingerprint)).toMatch(
      /^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/,
    );
  });

  it("normalizes unordered sets but preserves world-generation order", () => {
    const first = createRunManifest(BASE_INPUT);
    const equivalent = createRunManifest({
      ...BASE_INPUT,
      mutatorIds: [...BASE_INPUT.mutatorIds].reverse(),
      legacyUnlockIds: [...BASE_INPUT.legacyUnlockIds].reverse(),
      contentDefinitionIds: [...BASE_INPUT.contentDefinitionIds].reverse(),
    });
    const reorderedWorld = createRunManifest({
      ...BASE_INPUT,
      selectedCountries: [...BASE_INPUT.selectedCountries].reverse(),
    });

    expect(equivalent).toEqual(first);
    expect(reorderedWorld.fingerprint).not.toBe(first.fingerprint);
  });

  it("persists authoritative V3 mode identity while accepting older manifests", () => {
    const current = createRunManifest(BASE_INPUT);
    expect(current.manifestVersion).toBe(3);
    expect(current.gameModeId).toBe("youth-scout");
    expect(current.runKind).toBe("career");
    expect(current.contentDefinitionIds).toEqual([
      "arc:family-trust",
      "trait:agent-cartel",
      "trait:golden-generation",
    ]);
    expect(validateRunManifest(current, BASE_INPUT.rootSeed)).toEqual([]);

    const historical = createRunManifest({
      ...BASE_INPUT,
      manifestVersion: 1,
    });
    expect(historical.manifestVersion).toBe(1);
    expect(historical.contentDefinitionIds).toBeUndefined();
    expect(validateRunManifest(historical, BASE_INPUT.rootSeed)).toEqual([]);
    expect(getRunGameModeId(historical)).toBe("youth-scout");
    expect(getRunKind(historical)).toBe("career");
  });

  it("diagnoses a definition-ledger mismatch independently of its run hash", () => {
    const current = createRunManifest(BASE_INPUT);
    const tampered = {
      ...current,
      contentDefinitionIds: [...(current.contentDefinitionIds ?? []), "mode:planned"],
    };

    expect(validateRunManifest(tampered, BASE_INPUT.rootSeed)).toContain(
      "run manifest content fingerprint does not match its definition ledger",
    );
  });

  it("downgrades an incomplete ledger to an explicitly legacy-compatible manifest", () => {
    const current = createRunManifest(BASE_INPUT);
    const incomplete = {
      ...current,
      contentDefinitionIds: undefined,
    };

    const repaired = repairRunManifest(incomplete, BASE_INPUT.rootSeed);
    expect(repaired.manifestVersion).toBe(1);
    expect(repaired.contentDefinitionIds).toBeUndefined();
    expect(repaired.integrity).toBe("legacy-import");
    expect(validateRunManifest(repaired, BASE_INPUT.rootSeed)).toEqual([]);
  });

  it("binds career versus challenge identity into the immutable run", () => {
    const career = createRunManifest(BASE_INPUT);
    const challenge = createRunManifest({ ...BASE_INPUT, runKind: "challenge" });

    expect(challenge.runKind).toBe("challenge");
    expect(challenge.fingerprint).not.toBe(career.fingerprint);
    expect(getRunGameModeId(challenge)).toBe("youth-scout");
  });

  it("rejects a mode that contradicts the selected specialization", () => {
    expect(() => createRunManifest({
      ...BASE_INPUT,
      gameModeId: "data-scout",
    })).toThrow(/gameModeId/);
  });

  it("changes identity when an immutable run-defining choice changes", () => {
    const baseline = createRunManifest(BASE_INPUT);
    const variants = [
      createRunManifest({ ...BASE_INPUT, rootSeed: "academy-43" }),
      createRunManifest({
        ...BASE_INPUT,
        worldTraitIds: ["academy-contraction", "agent-cartel"],
      }),
      createRunManifest({ ...BASE_INPUT, originId: "data-purist" }),
      createRunManifest({ ...BASE_INPUT, difficulty: "hard" }),
    ];

    for (const variant of variants) {
      expect(variant.fingerprint).not.toBe(baseline.fingerprint);
      expect(variant.runId).not.toBe(baseline.runId);
    }
  });

  it("copies and de-duplicates caller arrays without mutating them", () => {
    const countries = ["england", "spain", "england"];
    const mutators = ["live-only", "compressed-calendar", "live-only"];
    const manifest = createRunManifest({
      ...BASE_INPUT,
      selectedCountries: countries,
      mutatorIds: mutators,
    });

    expect(countries).toEqual(["england", "spain", "england"]);
    expect(mutators).toEqual([
      "live-only",
      "compressed-calendar",
      "live-only",
    ]);
    expect(manifest.selectedCountries).toEqual(["england", "spain"]);
    expect(manifest.mutatorIds).toEqual([
      "compressed-calendar",
      "live-only",
    ]);
  });

  it("rejects incomplete identity inputs", () => {
    expect(() =>
      createRunManifest({ ...BASE_INPUT, rootSeed: "   " }),
    ).toThrow(/rootSeed/);
    expect(() =>
      createRunManifest({ ...BASE_INPUT, selectedCountries: [] }),
    ).toThrow(/selectedCountries/);
    expect(() =>
      createRunManifest({ ...BASE_INPUT, startingCountry: "germany" }),
    ).toThrow(/startingCountry/);
  });

  it("detects and explicitly downgrades a tampered or seed-divergent run", () => {
    const manifest = createRunManifest(BASE_INPUT);
    const tampered = {
      ...manifest,
      worldTraitIds: [...manifest.worldTraitIds, "hidden-tamper"],
    };

    expect(validateRunManifest(tampered, BASE_INPUT.rootSeed)).toContain(
      "run manifest fingerprint does not match its immutable inputs",
    );
    expect(validateRunManifest(manifest, "different-live-seed")).toContain(
      "run manifest root seed does not match the simulation seed",
    );

    const repaired = repairRunManifest(tampered, "different-live-seed");
    expect(repaired.integrity).toBe("legacy-import");
    expect(repaired.rootSeed).toBe("different-live-seed");
    expect(validateRunManifest(repaired, "different-live-seed")).toEqual([]);
  });
});

describe("stable fingerprints", () => {
  it("canonicalizes object key order recursively", () => {
    const left = { z: 3, nested: { beta: 2, alpha: 1 } };
    const right = { nested: { alpha: 1, beta: 2 }, z: 3 };

    expect(stableSerialize(left)).toBe(stableSerialize(right));
    expect(stableFingerprint(left)).toBe(stableFingerprint(right));
  });

  it("makes catalog fingerprints independent of definition ordering", () => {
    const first = createContentFingerprint("rules.1", "content.1", [
      "trait:b",
      "trait:a",
    ]);
    const second = createContentFingerprint("rules.1", "content.1", [
      "trait:a",
      "trait:b",
      "trait:a",
    ]);

    expect(second).toBe(first);
  });
});

describe("named RNG streams", () => {
  it("replays the same sequence for the same named scope", () => {
    const first = createNamedRNG("seed", "injuries", 2, 14, "player-7");
    const second = createNamedRNG("seed", "injuries", 2, 14, "player-7");

    expect([first.next(), first.nextInt(1, 100), first.next()]).toEqual([
      second.next(),
      second.nextInt(1, 100),
      second.next(),
    ]);
  });

  it("isolates domains from extra draws in another stream", () => {
    const injuryStream = createNamedRNG("seed", "injuries", 1, 8);
    const transferBefore = createNamedRNG("seed", "transfers", 1, 8);
    const expectedTransfers = [transferBefore.next(), transferBefore.next()];

    for (let index = 0; index < 50; index++) injuryStream.next();

    const transferAfter = createNamedRNG("seed", "transfers", 1, 8);
    expect([transferAfter.next(), transferAfter.next()]).toEqual(
      expectedTransfers,
    );
  });

  it("encodes path boundaries and scalar types without collisions", () => {
    expect(deriveNamedSeed("seed", "ab", "c")).not.toBe(
      deriveNamedSeed("seed", "a", "bc"),
    );
    expect(deriveNamedSeed("seed", 1)).not.toBe(
      deriveNamedSeed("seed", "1"),
    );
    expect(() => deriveNamedSeed("seed", Number.NaN)).toThrow(/finite/);
  });

  it("creates stable gameplay IDs with no clock dependency", () => {
    const first = createDeterministicRunId(
      "narrative event",
      "seed",
      "family-trust",
      2,
      5,
    );
    const second = createDeterministicRunId(
      "narrative event",
      "seed",
      "family-trust",
      2,
      5,
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^narrative_event_[a-f0-9]{16}$/);
  });
});
