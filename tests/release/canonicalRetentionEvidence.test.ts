import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CANONICAL_RETENTION_COLLECTION_KEYS, CANONICAL_COLLECTION_BYTE_BUDGETS, projectCanonicalCollectionBytes } from "./canonicalRetentionEvidence";

describe("canonical retention evidence contract", () => {
  it("freezes the admitted ten-key budget and excludes supporting keys from serialized projections", () => {
    const expected = { players: 1, observations: 2, finances: 3, worldHistory: 4, fixtures: 5,
      matchRatings: 6, playerMovementHistory: 7, retiredPlayers: 8, retiredPlayerIds: 9, unsignedYouth: 10 };
    const source = { ...expected, playerPortraits: 123456789, futureDiagnostic: 999 };
    const before = structuredClone(source);
    expect(CANONICAL_RETENTION_COLLECTION_KEYS).toEqual(Object.keys(expected));
    expect(CANONICAL_COLLECTION_BYTE_BUDGETS).toEqual({
      players: 33554432, observations: 12582912, finances: 20971520, worldHistory: 25165824,
      fixtures: 8388608, matchRatings: 8388608, playerMovementHistory: 8388608,
      retiredPlayers: 6291456, retiredPlayerIds: 524288, unsignedYouth: 12582912,
    });
    const projected = projectCanonicalCollectionBytes(source);
    expect(JSON.parse(JSON.stringify(projected))).toEqual(expected);
    expect(Object.keys(projected)).toEqual(Object.keys(expected));
    projected.players = 100;
    expect(source).toEqual(before);
  });

  it("projects published per-collection maps rather than copying supporting collection keys", () => {
    const worker = readFileSync(new URL("./longCareerReleaseGate.soak.ts", import.meta.url), "utf8");
    expect(worker).not.toContain("SAVE_RETENTION_COLLECTION_KEYS");
    expect(worker).not.toMatch(/collectionBytes:\s*(?:footprint|retentionFootprint)\.collections\s*[,}]/);
    expect(worker).toContain("collectionBytes: projectCanonicalCollectionBytes(footprint.collections)");
    expect(worker).toContain("collectionBytes: projectCanonicalCollectionBytes(retentionFootprint.collections)");
    expect(worker).toContain("const bytes = retentionFootprint.totalBytes");
    expect(worker).toContain("serialized save exceeds absolute release budget");
  });
});
