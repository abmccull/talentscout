import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GameState } from "@/engine/core/types";
import { retainStorageCheckpoint } from "./portraitRetentionDiagnostics";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
it("never replaces an earlier retained state or claims provider persistence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "retained-owned-")); roots.push(directory);
  const state = { players: {}, seed: "fixture", currentSeason: 2, worldHistory: { latestRecordedSeason: 1 }, lastSaved: 1 } as unknown as GameState;
  const input = { directory, state, completedSeason: 1, canonicalTicks: 46, candidateCommitSha: "a".repeat(40), candidateTreeSha: "b".repeat(40), sourceTreeClean: true };
  const receipt = await retainStorageCheckpoint(input);
  const before = await readFile(join(directory, receipt.file));
  expect(receipt.storageVerification).toBe("not-run");
  await expect(retainStorageCheckpoint({ ...input, state: { ...state, seed: "replacement" } })).rejects.toThrow();
  expect(await readFile(join(directory, receipt.file))).toEqual(before);
});
