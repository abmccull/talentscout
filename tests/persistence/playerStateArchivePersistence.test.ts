import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Dexie from "dexie";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { GameState, InjuryHistory, PersonalityProfile, Player } from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { createVisualIdentity } from "@/engine/players/portraits/identity";
import { RNG } from "@/engine/rng";
import { compactLongCareerHistory, measureSaveRetentionFootprint } from "@/engine/world/saveRetention";
import { deleteSave, loadGame, migrateSaveRecord, migrateSaveState, saveGame } from "@/lib/db";
import { CURRENT_SAVE_SCHEMA_VERSION, SaveMigrationError } from "@/lib/saveEnvelope";

const goldenPath = fileURLToPath(new URL("../fixtures/saves/v0-save-record.json", import.meta.url));
function history(id: string): InjuryHistory {
  return { playerId: id, injuries: [["kept-incident", "muscle", "minor", 3, 10, 3]],
    totalWeeksMissed: 27, injuryProneness: 0.123456789012345, reinjuryWindowWeeksLeft: 4 };
}
function profile(): PersonalityProfile {
  return { archetype: "loyal", traits: ["loyal", "leader", "loyal"],
    transferWillingness: 0.234567890123456, dressingRoomImpact: -0.123456789012345,
    formVolatility: 1.345678901234567, bigMatchModifier: 0.456789012345678,
    hiddenUntilRevealed: true, revealedTraits: ["leader"] };
}
function player(id: string): Player {
  const generated = generatePlayer(new RNG(id), { position: "CM", ageRange: [25, 25],
    abilityRange: [104, 104], nationality: "English", clubId: "club" });
  return { ...generated, id, visualIdentity: createVisualIdentity(id),
    injuryHistory: history(id), personalityProfile: profile() };
}
function handPacked(value: Player): Player {
  const h = value.injuryHistory as InjuryHistory;
  const p = value.personalityProfile as PersonalityProfile;
  return { ...value,
    injuryHistory: ["ih-own", 1, h.injuries, h.totalWeeksMissed, h.injuryProneness, h.reinjuryWindowWeeksLeft],
    personalityProfile: ["pp", 1, p.archetype, p.traits, p.transferWillingness,
      p.dressingRoomImpact, p.formVolatility, p.bigMatchModifier, p.hiddenUntilRevealed, p.revealedTraits],
  } as unknown as Player;
}
function semanticFacts(value: Player) {
  const h = value.injuryHistory as unknown;
  const p = value.personalityProfile as unknown;
  const injuryHistory = Array.isArray(h) && h[0] === "ih-own"
    ? { playerId: value.id, injuries: h[2], totalWeeksMissed: h[3], injuryProneness: h[4], reinjuryWindowWeeksLeft: h[5] }
    : Array.isArray(h) && h[0] === "ih"
      ? { playerId: h[2], injuries: h[3], totalWeeksMissed: h[4], injuryProneness: h[5], reinjuryWindowWeeksLeft: h[6] }
      : h;
  const personalityProfile = Array.isArray(p) && p[0] === "pp"
    ? { archetype: p[2], traits: p[3], transferWillingness: p[4], dressingRoomImpact: p[5],
      formVolatility: p[6], bigMatchModifier: p[7], hiddenUntilRevealed: p[8], revealedTraits: p[9] }
    : p;
  return { injuryHistory, personalityProfile };
}
function state(): GameState {
  const raw = JSON.parse(readFileSync(goldenPath, "utf8")) as { state: unknown };
  const value = migrateSaveState(raw.state);
  value.currentSeason = 3;
  value.currentWeek = 11;
  value.players = { live: player("live") };
  value.retiredPlayers = { retired: player("retired") };
  value.retiredPlayerIds = ["retired"];
  value.watchlist = ["retired"];
  value.unsignedYouth = { unsigned: {
    id: "unsigned", player: player("youth"), visibility: 20, buzzLevel: 35,
    discoveredBy: [], regionId: "region", country: "england",
    venueAppearances: ["schoolMatch"], generatedSeason: 3, placed: false, retired: false,
  } };
  value.playerMovementHistory = [
    { id: "retirement", playerId: "retired", type: "retirement", season: 3, week: 10,
      fromClubId: "club", reason: "Retained career fact" },
  ];
  return value;
}
function owners(value: GameState): Player[] {
  return [value.players.live, value.retiredPlayers.retired, value.unsignedYouth.unsigned.player];
}
function packedState(): GameState {
  const value = state();
  value.players.live = handPacked(value.players.live);
  value.retiredPlayers.retired = handPacked(value.retiredPlayers.retired);
  value.unsignedYouth.unsigned.player = handPacked(value.unsignedYouth.unsigned.player);
  return value;
}
function assertPacked(value: GameState) {
  for (const entry of owners(value)) {
    expect(entry).toBeDefined();
    expect(Array.isArray(entry.injuryHistory)).toBe(true);
    expect((entry.injuryHistory as unknown[])[0]).toBe("ih-own");
    expect(Array.isArray(entry.personalityProfile)).toBe(true);
    expect((entry.personalityProfile as unknown[])[0]).toBe("pp");
  }
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
async function readRaw(): Promise<unknown> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("saves", "readonly").objectStore("saves").get(0);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } finally { db.close(); }
}
async function putRaw(value: unknown): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("saves", "readwrite");
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      transaction.objectStore("saves").put(value);
    });
  } finally { db.close(); }
}
function malformedState(location: "live" | "retired" | "unsigned", field: "injuryHistory" | "personalityProfile") {
  const value = state();
  const entry = location === "live" ? value.players.live
    : location === "retired" ? value.retiredPlayers.retired : value.unsignedYouth.unsigned.player;
  (entry as unknown as Record<string, unknown>)[field] = field === "injuryHistory"
    ? ["ih-own", 2, [], 0, 0, 0] : ["pp", 1, "loyal", [], 0, 0, 1, 0, true];
  return value;
}

describe.sequential("player archive canonical save and refusal contracts", () => {
  beforeEach(async () => { await deleteSave(0); });
  afterAll(async () => { await deleteSave(0); await Dexie.delete("TalentScoutDB"); });

  it("compacts ordinary facts in every owner location without changing the source", () => {
    const value = state();
    const before = JSON.stringify(value);
    const expected = owners(value).map(semanticFacts);
    const compacted = compactLongCareerHistory(value);
    assertPacked(compacted);
    expect(owners(compacted).map(semanticFacts)).toEqual(expected);
    expect(JSON.stringify(value)).toBe(before);
    const footprint = measureSaveRetentionFootprint(compacted);
    expect(footprint.totalBytes).toBe(new TextEncoder().encode(JSON.stringify(compacted)).byteLength);
    expect(footprint.collections.players).toBe(new TextEncoder().encode(JSON.stringify(compacted.players)).byteLength);
  });

  it("keeps hand-authored packed facts canonical through the actual common loader", () => {
    const raw = packedState();
    const before = JSON.stringify(raw);
    const expected = owners(raw).map(semanticFacts);
    const migrated = migrateSaveState(raw);
    assertPacked(migrated);
    expect(owners(migrated).map(semanticFacts)).toEqual(expected);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("persists schema9 canonical rows through actual journal save, raw read-back and load/save", async () => {
    const raw = state();
    const before = JSON.stringify(raw);
    const expected = owners(raw).map(semanticFacts);
    const saved = await saveGame(0, "Player archive facts", raw);
    expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(10);
    expect(saved.schemaVersion).toBe(10);
    assertPacked(saved.state);
    expect(owners(saved.state).map(semanticFacts)).toEqual(expected);
    const persisted = await readRaw() as typeof saved;
    expect(persisted.schemaVersion).toBe(10);
    assertPacked(persisted.state);
    const loaded = await loadGame(0);
    expect(loaded).not.toBeNull();
    assertPacked(loaded!);
    expect(owners(loaded!).map(semanticFacts)).toEqual(expected);
    const savedAgain = await saveGame(0, "Player archive facts", loaded!);
    assertPacked(savedAgain.state);
    expect(owners(savedAgain.state).map(semanticFacts)).toEqual(expected);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("keeps ordinary custom/extension records as fallback on the canonical path", () => {
    const raw = state();
    raw.players.live.injuryHistory = { ...history("live"), importedMedicalFact: null } as InjuryHistory;
    raw.players.live.personalityProfile = { ...profile(), importedPersonalityFact: ["custom", null] } as PersonalityProfile;
    const expected = semanticFacts(raw.players.live);
    const migrated = migrateSaveState(raw);
    expect(Array.isArray(migrated.players.live.injuryHistory)).toBe(false);
    expect(Array.isArray(migrated.players.live.personalityProfile)).toBe(false);
    expect(semanticFacts(migrated.players.live)).toEqual(expected);
  });

  it("leaves historical nil-default behavior in the old normalizers", () => {
    const absent = state();
    const explicitNull = state();
    for (const value of [absent.players.live, absent.unsignedYouth.unsigned.player]) {
      delete value.injuryHistory;
      delete value.personalityProfile;
    }
    for (const value of [explicitNull.players.live, explicitNull.unsignedYouth.unsigned.player]) {
      (value as unknown as Record<string, unknown>).injuryHistory = null;
      (value as unknown as Record<string, unknown>).personalityProfile = null;
    }
    const before = JSON.stringify(explicitNull);
    const expected = migrateSaveState(absent);
    const actual = migrateSaveState(explicitNull);
    expect(semanticFacts(actual.players.live)).toEqual(semanticFacts(expected.players.live));
    expect(semanticFacts(actual.unsignedYouth.unsigned.player)).toEqual(semanticFacts(expected.unsignedYouth.unsigned.player));
    expect(semanticFacts(actual.players.live).injuryHistory).toEqual({
      playerId: "live", injuries: [], totalWeeksMissed: 0, injuryProneness: 0, reinjuryWindowWeeksLeft: 0,
    });
    expect(JSON.stringify(explicitNull)).toBe(before);
  });

  it.each([
    ["live", "injuryHistory"], ["live", "personalityProfile"],
    ["retired", "injuryHistory"], ["retired", "personalityProfile"],
    ["unsigned", "injuryHistory"], ["unsigned", "personalityProfile"],
  ] as const)("refuses malformed %s %s before common repair or journal mutation", async (location, field) => {
    const invalid = malformedState(location, field);
    const before = JSON.stringify(invalid);
    expect(() => migrateSaveState(invalid)).toThrow(SaveMigrationError);
    expect(JSON.stringify(invalid)).toBe(before);
    const supported = await saveGame(0, "Only supported generation", state());
    const corrupt = { ...supported, schemaVersion: 7, state: invalid };
    await putRaw(corrupt);
    const rawBytes = JSON.stringify(await readRaw());
    await expect(loadGame(0)).rejects.toMatchObject({ code: "CORRUPT_SAVE" });
    expect(JSON.stringify(await readRaw())).toBe(rawBytes);
  });

  it("preserves source-array refusal even if the array carries valid-looking state properties", () => {
    const raw = Object.assign([], state());
    const before = JSON.stringify(raw);
    expect(() => migrateSaveState(raw)).toThrow(SaveMigrationError);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it.each([6, 7])("adds schema%s→8 without bypassing future9 refusal or overwriting its raw head", async schemaVersion => {
    const saved = await saveGame(0, "Schema8 support", state());
    const old = { ...saved, schemaVersion, state: state() };
    const oldBytes = JSON.stringify(old);
    const migrated = migrateSaveRecord(old);
    expect(migrated.schemaVersion).toBe(10);
    assertPacked(migrated.state);
    expect(JSON.stringify(old)).toBe(oldBytes);
    const future = { ...saved, schemaVersion: 11, state: { ...saved.state, futureOpaqueFacts: [null, "keep"] } };
    await putRaw(future);
    const before = JSON.stringify(await readRaw());
    await expect(loadGame(0)).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    expect(JSON.stringify(await readRaw())).toBe(before);
  });
});
