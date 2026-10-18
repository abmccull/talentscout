import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import { migrateVisualIdentities, canonicalPlayers } from "@/engine/players/portraits/state";
import { revealKnownGamePortraits, revealGamePortraits } from "@/engine/players/portraits/gameIntegration";
import { portraitCoverage } from "@/engine/players/portraits/allocation";

// Explicit checkpoint diagnostic. No game store, database, cloud, or browser access.
it("measures portrait migration and repeated visibility on an aged career", async () => {
  if (!process.env.PORTRAIT_PROFILE_INPUT || !process.env.PORTRAIT_PROFILE_OUTPUT) {
    throw new Error("Set PORTRAIT_PROFILE_INPUT and PORTRAIT_PROFILE_OUTPUT");
  }
  const input = resolve(process.env.PORTRAIT_PROFILE_INPUT);
  const output = resolve(process.env.PORTRAIT_PROFILE_OUTPUT);
  if (input === output) throw new Error("Output must not overwrite the input checkpoint");
  const raw = await readFile(input);
  const checkpoint = JSON.parse(raw.toString("utf8"));
  const state: GameState = checkpoint.gameState ?? checkpoint;
  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
  const beforeBytes = bytes(state);
  const started = performance.now();
  const migrated = migrateVisualIdentities(state);
  const migrationMs = performance.now() - started;
  const migratedBytes = bytes(migrated);
  const revealStart = performance.now();
  const known = revealKnownGamePortraits(migrated);
  const revealKnownMs = performance.now() - revealStart;
  const knownBytes = bytes(known);
  const repeatStart = performance.now();
  const repeat = revealKnownGamePortraits(known);
  const repeatKnownMs = performance.now() - repeatStart;
  expect(repeat).toBe(known);
  // Worst-case visibility stress: every retained person, without changing football state.
  const allIds = [...canonicalPlayers(known).keys()];
  const allStart = performance.now();
  const all = revealGamePortraits(known, allIds, "observed");
  const revealAllMs = performance.now() - allStart;
  const allRepeatStart = performance.now();
  const allRepeat = revealGamePortraits(all, allIds, "observed");
  const repeatAllMs = performance.now() - allRepeatStart;
  expect(allRepeat).toBe(all);
  expect(all.players).toBe(known.players);
  expect(all.unsignedYouth).toBe(known.unsignedYouth);
  const report = {
    input, inputSha256: createHash("sha256").update(raw).digest("hex"),
    scope: "Isolated portrait migration and visibility diagnostic; all-person visibility is stress coverage, not normal gameplay or a release performance gate.",
    date: { season: state.currentSeason, week: state.currentWeek },
    beforeBytes, migratedBytes, identityGrowthBytes: migratedBytes - beforeBytes,
    knownBytes, knownLedgerBytes: bytes(known.playerPortraits), allBytes: bytes(all),
    migrationMs, revealKnownMs, repeatKnownMs, revealAllMs, repeatAllMs,
    knownCoverage: portraitCoverage(known), allCoverage: portraitCoverage(all),
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
});
