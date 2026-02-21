/**
 * IndexedDB persistence layer using Dexie.js.
 *
 * Stores full game saves as serialized blobs keyed by slot number.
 * Supports up to 5 save slots plus 1 autosave slot.
 */

import Dexie, { type EntityTable } from "dexie";
import type {
  GameState,
  LeaderboardEntry,
  ScoutSkill,
  ScoutAttribute,
} from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export interface SaveRecord {
  slot: number; // 0 = autosave, 1-5 = manual saves
  name: string;
  savedAt: number; // Date.now()
  season: number;
  week: number;
  scoutName: string;
  specialization: string;
  reputation: number;
  state: GameState;
}

/**
 * Stored leaderboard entry. `id` is the auto-incremented primary key
 * (the `++id` Dexie sugar); all other fields mirror LeaderboardEntry exactly.
 */
export type LeaderboardRecord = LeaderboardEntry;

const db = new Dexie("TalentScoutDB") as Dexie & {
  saves: EntityTable<SaveRecord, "slot">;
  leaderboard: EntityTable<LeaderboardRecord, "id">;
};

db.version(1).stores({
  saves: "slot", // primary key is slot number
});

// Version 2: add leaderboard table.
// Index on score (for sorted queries), season, scoutName, and submittedAt.
db.version(2).stores({
  saves: "slot",
  leaderboard: "++id, score, season, scoutName, submittedAt",
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const AUTOSAVE_SLOT = 0;
export const MAX_MANUAL_SLOTS = 5;

export async function saveGame(
  slot: number,
  name: string,
  state: GameState,
): Promise<void> {
  const record: SaveRecord = {
    slot,
    name,
    savedAt: Date.now(),
    season: state.currentSeason,
    week: state.currentWeek,
    scoutName: `${state.scout.firstName} ${state.scout.lastName}`,
    specialization: state.scout.primarySpecialization,
    reputation: state.scout.reputation,
    state,
  };
  await db.saves.put(record);
}

export async function loadGame(slot: number): Promise<GameState | null> {
  const record = await db.saves.get(slot);
  if (!record) return null;
  return migrateSaveState(record.state);
}

export async function listSaves(): Promise<Omit<SaveRecord, "state">[]> {
  const all = await db.saves.toArray();
  return all
    .map(({ state: _state, ...meta }) => meta)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteSave(slot: number): Promise<void> {
  await db.saves.delete(slot);
}

export async function autosave(state: GameState): Promise<void> {
  await saveGame(AUTOSAVE_SLOT, "Autosave", state);
}

// ---------------------------------------------------------------------------
// Save migration
// ---------------------------------------------------------------------------

/**
 * Applies backward-compatible defaults to a raw save blob loaded from
 * IndexedDB. Called on every load path so that saves created before a given
 * phase's fields were introduced still deserialise to a valid GameState.
 *
 * Mutation is intentional here — this is a one-time deserialisation step,
 * not engine logic, so we don't need the immutability guarantees of the
 * pure engine functions.
 */
function migrateSaveState(raw: unknown): GameState {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("scout" in raw) ||
    !("currentSeason" in raw) ||
    !("currentWeek" in raw)
  ) {
    throw new Error("Invalid save data: missing required game state fields");
  }

  const state = raw as GameState;

  // Phase 1 defaults — NPC scouts, territories, countries
  if (!state.npcScouts) state.npcScouts = {};
  if (!state.npcReports) state.npcReports = {};
  if (!state.territories) state.territories = {};
  if (!state.countries) state.countries = ["england"];

  // Phase 2 defaults — narrative, rivals, tools, manager profiles
  if (!state.narrativeEvents) state.narrativeEvents = [];
  if (!state.rivalScouts) state.rivalScouts = {};
  if (!state.unlockedTools) state.unlockedTools = [];
  if (!state.managerProfiles) state.managerProfiles = {};

  // Phase 3 defaults — season events
  if (!state.seasonEvents) state.seasonEvents = [];

  // Phase 4 defaults — discovery records, performance history
  if (!state.discoveryRecords) state.discoveryRecords = [];
  if (!state.performanceHistory) state.performanceHistory = [];

  // Scout field defaults — Phase 1 extensions on the Scout object
  if (!state.scout.npcScoutIds) state.scout.npcScoutIds = [];
  if (!state.scout.countryReputations) state.scout.countryReputations = {};
  if (!state.scout.boardDirectives) state.scout.boardDirectives = [];
  // skillXp / attributeXp were introduced before Phase 1 but guard anyway
  if (!state.scout.skillXp)
    state.scout.skillXp = {} as Partial<Record<ScoutSkill, number>>;
  if (!state.scout.attributeXp)
    state.scout.attributeXp = {} as Partial<Record<ScoutAttribute, number>>;

  return state;
}

export { db };
