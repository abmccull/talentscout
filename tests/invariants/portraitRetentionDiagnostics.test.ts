import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import { revealPortraits } from "@/engine/players/portraits/allocation";
import { bundledPortraitCatalog } from "@/engine/players/portraits/bundledCatalog";
import { measureSaveRetentionFootprint } from "@/engine/world/saveRetention";
import { persistentStateDigest, portraitContinuityViolations, portraitRetentionDiagnostic, retainStorageCheckpoint } from "../release/portraitRetentionDiagnostics";

function photographedWorld() {
  return revealPortraits({ players: {
    ari: { id: "ari", age: 15, firstName: "Ari", lastName: "Reed" },
    noa: { id: "noa", age: 16, firstName: "Noa", lastName: "Hart" },
  } }, ["ari", "noa"], { season: 1, week: 2 }, "observed", bundledPortraitCatalog);
}

describe("permanent portrait retention diagnostics", () => {
  it("counts retained identities and tombstones after player records disappear without changing state", () => {
    const world = photographedWorld();
    const archived = { ...world, players: {} };
    archived.playerPortraits.faceOwners["f".repeat(64)] = "person:v1:historical";
    const before = structuredClone(archived);
    const result = portraitRetentionDiagnostic(archived);
    expect(result.seen).toBe(2);
    expect(result.retainedPeopleWithoutPlayerRecord).toBe(2);
    expect(result.ownershipTombstonesWithoutReservation).toBe(1);
    expect(result.ledgerBytes).toBe(Buffer.byteLength(JSON.stringify(archived.playerPortraits), "utf8"));
    expect(result.violations).toEqual([]);
    expect(archived).toEqual(before);
    expect(measureSaveRetentionFootprint(archived as unknown as GameState).collections.playerPortraits).toBe(result.ledgerBytes);
  });

  it("detects a missing owner instead of silently repairing the ledger", () => {
    const world = photographedWorld();
    const face = world.playerPortraits.reservations["person:v1:ari"]!.binding!.canonicalFaceSha256;
    delete world.playerPortraits.faceOwners[face];
    expect(portraitRetentionDiagnostic(world).violations).toContain(`owner-mismatch:person:v1:ari:${face}`);
    expect(world.playerPortraits.faceOwners[face]).toBeUndefined();
  });

  it("rejects released tombstones and replacing a saved face but permits a waiting first binding", () => {
    const world = photographedWorld();
    const before = structuredClone(world.playerPortraits);
    const after = structuredClone(before);
    const reservation = after.reservations["person:v1:ari"]!;
    delete after.faceOwners[reservation.binding!.canonicalFaceSha256];
    reservation.binding = after.reservations["person:v1:noa"]!.binding;
    expect(portraitContinuityViolations(before, after).some((failure) => failure.startsWith("released-or-reassigned-face:"))).toBe(true);
    expect(portraitContinuityViolations(before, after)).toContain("changed-face:person:v1:ari");
    const waiting = structuredClone(before);
    delete waiting.reservations["person:v1:ari"]!.binding;
    expect(portraitContinuityViolations(waiting, before)).toEqual([]);
  });

  it.each([1, 10, 30])("retains completed season %i with checksums without claiming provider verification", async (completedSeason) => {
    const directory = await mkdtemp(join(tmpdir(), "talentscout-retained-checkpoint-"));
    try {
      const state = { ...photographedWorld(), seed: "checkpoint-seed", currentSeason: completedSeason + 1,
        worldHistory: { latestRecordedSeason: completedSeason }, lastSaved: 1 } as unknown as GameState;
      const input = { directory, state, completedSeason, canonicalTicks: completedSeason * 50,
        candidateCommitSha: "a".repeat(40), candidateTreeSha: "b".repeat(40), sourceTreeClean: true };
      const receipt = await retainStorageCheckpoint(input);
      const file = await readFile(join(directory, receipt.file));
      expect(createHash("sha256").update(file).digest("hex")).toBe(receipt.sha256);
      expect(receipt.storageVerification).toBe("not-run");
      expect(JSON.parse(file.toString())).toEqual(state);
      expect(persistentStateDigest({ ...state, lastSaved: 99 })).toBe(receipt.persistentStateSha256);
      expect(persistentStateDigest({ ...state, currentSeason: 32 })).not.toBe(receipt.persistentStateSha256);
      await expect(retainStorageCheckpoint({ ...input, completedSeason: 2 })).rejects.toThrow("canonical season boundary");
      await expect(retainStorageCheckpoint({ ...input, candidateCommitSha: "wrong" })).rejects.toThrow("exact source identity");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
