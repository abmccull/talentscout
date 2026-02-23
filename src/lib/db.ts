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
import type { CountryData } from "@/data/types";
import { getSteam } from "@/lib/steam/steamInterface";

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

export interface ModRecord {
  countryKey: string;
  data: CountryData;
  importedAt: number;
}

const db = new Dexie("TalentScoutDB") as Dexie & {
  saves: EntityTable<SaveRecord, "slot">;
  leaderboard: EntityTable<LeaderboardRecord, "id">;
  mods: EntityTable<ModRecord, "countryKey">;
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

// Version 3: add mods table for user-imported country data.
db.version(3).stores({
  saves: "slot",
  leaderboard: "++id, score, season, scoutName, submittedAt",
  mods: "countryKey",
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

  // Sync to Steam Cloud (no-op in web builds).
  const steam = getSteam();
  if (steam.isAvailable()) {
    try {
      await steam.setCloudSave(slot, JSON.stringify(record));
    } catch {
      // Steam cloud save failure is non-fatal.
    }
  }
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
export function migrateSaveState(raw: unknown): GameState {
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

  // Interactive match tracking — fixture IDs played via MatchScreen
  if (!state.playedFixtures) state.playedFixtures = [];

  // Watchlist — player bookmarks
  if (!state.watchlist) state.watchlist = [];

  // Contact intel — hidden intel from meetings
  if (!state.contactIntel) state.contactIntel = {};

  // Youth Scouting System defaults
  if (!state.unsignedYouth) state.unsignedYouth = {};
  if (!state.placementReports) state.placementReports = {};
  if (!state.gutFeelings) state.gutFeelings = [];
  if (!state.alumniRecords) state.alumniRecords = [];
  if (!state.legacyScore) state.legacyScore = { youthFound: 0, firstTeamBreakthroughs: 0, internationalCapsFromFinds: 0, totalScore: 0, clubsWorkedAt: 0, countriesScouted: 0, careerHighTier: 0, totalSeasons: 0, bestDiscoveryName: "", bestDiscoveryPA: 0, scenariosCompleted: 0 };
  // Backfill extended LegacyScore fields on saves that predate them
  if (state.legacyScore.clubsWorkedAt === undefined) state.legacyScore.clubsWorkedAt = 0;
  if (state.legacyScore.countriesScouted === undefined) state.legacyScore.countriesScouted = 0;
  if (state.legacyScore.careerHighTier === undefined) state.legacyScore.careerHighTier = 0;
  if (state.legacyScore.totalSeasons === undefined) state.legacyScore.totalSeasons = 0;
  if (state.legacyScore.bestDiscoveryName === undefined) state.legacyScore.bestDiscoveryName = "";
  if (state.legacyScore.bestDiscoveryPA === undefined) state.legacyScore.bestDiscoveryPA = 0;
  if (state.legacyScore.scenariosCompleted === undefined) state.legacyScore.scenariosCompleted = 0;
  if (!state.subRegions) state.subRegions = {};
  if (!state.retiredPlayerIds) state.retiredPlayerIds = [];

  // Scout field defaults — Phase 1 extensions on the Scout object
  if (!state.scout.npcScoutIds) state.scout.npcScoutIds = [];
  if (!state.scout.countryReputations) state.scout.countryReputations = {};
  if (!state.scout.boardDirectives) state.scout.boardDirectives = [];
  // skillXp / attributeXp were introduced before Phase 1 but guard anyway
  if (!state.scout.skillXp)
    state.scout.skillXp = {} as Partial<Record<ScoutSkill, number>>;
  if (!state.scout.attributeXp)
    state.scout.attributeXp = {} as Partial<Record<ScoutAttribute, number>>;

  // New scout skills — playerJudgment and potentialAssessment
  if (state.scout.skills.playerJudgment === undefined) {
    state.scout.skills.playerJudgment = 5;
  }
  if (state.scout.skills.potentialAssessment === undefined) {
    state.scout.skills.potentialAssessment = 5;
  }

  // First-Team Scouting System defaults
  if (!state.managerDirectives) state.managerDirectives = [];
  if (!state.clubResponses) state.clubResponses = [];
  if (!state.transferRecords) state.transferRecords = [];
  if (!state.systemFitCache) state.systemFitCache = {};

  // Data Scouting System defaults
  if (!state.predictions) state.predictions = [];
  if (!state.dataAnalysts) state.dataAnalysts = [];
  if (!state.statisticalProfiles) state.statisticalProfiles = {};
  if (!state.anomalyFlags) state.anomalyFlags = [];
  if (!state.analystReports) state.analystReports = {};

  return state;
}

export { db };
