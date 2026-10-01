import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { MatchFormEntry, Player } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { generatePlayer } from "@/engine/players/generation";
import { createVisualIdentity } from "@/engine/players/portraits/identity";
import { expandMatchFormEntry } from "@/engine/players/matchFormArchive";
import { deleteSave, loadGameWithRecovery, migrateSaveRecord, migrateSaveState, saveGameWithResult, type SaveRecord } from "@/lib/db";

const OWNER = "legacy-form-owner";
const SLOT = 5;
const FIELDS = ["fixtureId", "week", "season", "rating"] as const;
const COMPLETE = { fixtureId: "fixture-england-premier-s2-w07-0038", week: 7, season: 2, rating: 7.123456789012345 };
const CASES = FIELDS.flatMap((field) => [
  { label: "missing " + field, field, explicitNull: false },
  { label: "null " + field, field, explicitNull: true },
]);

function legacyCareer(row: Record<string, unknown>): Record<string, unknown> {
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8")) as {
    state: Record<string, unknown>;
  };
  const generated: Player = {
    ...generatePlayer(createRNG(OWNER), {
      position: "CM", ageRange: [17, 17], abilityRange: [45, 45],
      nationality: "England", clubId: "", firstName: "Ari", lastName: "Legacy",
    }),
    id: OWNER,
    visualIdentity: createVisualIdentity(OWNER),
    recentMatchRatings: [row as unknown as MatchFormEntry],
  };
  // Recreate imported JSON, rather than adding non-JSON values to its boundary.
  return JSON.parse(JSON.stringify({
    ...fixture.state, seed: "legacy-form-persistence", players: { [OWNER]: generated },
    unsignedYouth: {}, retiredPlayers: {}, watchlist: [OWNER],
  })) as Record<string, unknown>;
}

async function readActualHead(): Promise<SaveRecord> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise<SaveRecord>((resolve, reject) => {
      const request = database.transaction("saves", "readonly").objectStore("saves").get(SLOT);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as SaveRecord);
    });
  } finally {
    database.close();
  }
}

beforeEach(async () => { await deleteSave(SLOT); });
afterAll(async () => { await deleteSave(SLOT); });

describe.sequential("legacy match-form facts through the actual persistence boundary", () => {
  it.each(CASES)("preserves $label through normalization, stored head, JSON and recovery load", async ({ field, explicitNull }) => {
    const row: Record<string, unknown> = { ...COMPLETE };
    if (explicitNull) row[field] = null;
    else delete row[field];
    const source = legacyCareer(row);
    const originalBytes = JSON.stringify(source);
    const expected = JSON.parse(JSON.stringify(row));
    const normalized = migrateSaveState(source);

    expect(normalized.players[OWNER].recentMatchRatings.map(expandMatchFormEntry)).toEqual([expected]);
    const commit = await saveGameWithResult(SLOT, "Legacy form facts", source);
    expect(commit.wrote).toBe(true);
    const rawHead = await readActualHead();
    expect(rawHead.state.players[OWNER].recentMatchRatings.map(expandMatchFormEntry)).toEqual([expected]);
    expect(commit.payloadBytes).toBe(new TextEncoder().encode(JSON.stringify(rawHead)).byteLength);

    const jsonRecord = JSON.parse(JSON.stringify(rawHead)) as unknown;
    const jsonLoaded = migrateSaveRecord(jsonRecord);
    expect(jsonLoaded.state.players[OWNER].recentMatchRatings.map(expandMatchFormEntry)).toEqual([expected]);
    const loaded = await loadGameWithRecovery(SLOT);
    expect(loaded?.state.players[OWNER].recentMatchRatings.map(expandMatchFormEntry)).toEqual([expected]);
    expect(JSON.stringify(source)).toBe(originalBytes);
  });
});
