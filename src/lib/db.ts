/**
 * IndexedDB persistence layer using Dexie.js.
 *
 * Stores full game saves as serialized blobs keyed by slot number.
 * Supports up to 5 save slots plus 1 autosave slot.
 */

import Dexie, { type EntityTable } from "dexie";
import type {
  GameState,
  FreeAgent,
  LeaderboardEntry,
  ScoutSkill,
  ScoutAttribute,
} from "@/engine/core/types";
import {
  createRunManifest,
  repairRunManifest,
  validateRunManifest,
} from "@/engine/run";
import { createConsequenceEngineState } from "@/engine/consequences";
import { createEventDirectorState } from "@/engine/events/eventDirector";
import { migrateRivalOrganizationState } from "@/engine/rivals";
import { reconcileScenarioAuthority } from "@/engine/scenarios/scenarioAuthority";
import type { CountryData } from "@/data/types";
import { getUnlockedPerks } from "@/engine/specializations/perks";
import { reconcileFinancialLedger } from "@/engine/finance/saveMigration";
import { compactLongCareerHistory } from "@/engine/world/saveRetention";
import { countryKeyFromNationality, normalizeCountryKey } from "@/lib/country";
import {
  createSaveEnvelope,
  migrateSaveEnvelope,
  type SaveEnvelope,
} from "@/lib/saveEnvelope";
import { migrateInternationalAssignment } from "@/engine/world/internationalDeliverables";
import { migrateLegacyTransferParticipation } from "@/engine/firstTeam/transferTracker";
import { migratePoliticalMeetingState } from "@/engine/career/politicalMeetings";
import { mergePersistedPlayerExperience } from "@/lib/playerExperience";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export interface SaveRecord extends SaveEnvelope<GameState> {
  slot: number; // 0 = autosave, 1-5 = manual saves
  name: string;
  season: number;
  week: number;
  scoutName: string;
  specialization: string;
  reputation: number;
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

function resolveFreeAgentCountryKey(
  state: Pick<GameState, "players" | "clubs" | "leagues" | "countries">,
  agent: Pick<FreeAgent, "playerId" | "releasedFrom" | "country" | "nationality">,
): string | undefined {
  const player = state.players?.[agent.playerId];
  const formerClub = state.clubs?.[agent.releasedFrom];
  const formerLeague = formerClub ? state.leagues?.[formerClub.leagueId] : undefined;

  return (
    normalizeCountryKey(formerLeague?.country)
    ?? normalizeCountryKey(agent.country)
    ?? countryKeyFromNationality(agent.country)
    ?? countryKeyFromNationality(agent.nationality)
    ?? countryKeyFromNationality(player?.nationality)
    ?? normalizeCountryKey(player?.nationality)
    ?? state.countries?.[0]
  );
}

export function migrateFreeAgentGeography(state: GameState): void {
  const agents = state.freeAgentPool?.agents;
  if (!agents) return;

  for (const agent of agents) {
    const legacyCountry = agent.country;
    const playerNationality = state.players?.[agent.playerId]?.nationality;
    agent.nationality ??= playerNationality ?? legacyCountry;
    agent.country =
      resolveFreeAgentCountryKey(state, agent)
      ?? agent.country;
  }

  // Older saves (and pre-fix same-week movement conflicts) can retain a pool
  // index entry after the authoritative player has signed or retired. Repair
  // that derived index at every save boundary rather than preserving a player
  // in mutually incompatible contract states.
  state.freeAgentPool.agents = agents.filter((agent) => {
    const player = state.players?.[agent.playerId];
    return Boolean(
      player
      && !player.clubId
      && !player.contractClubId
      && !player.loanParentClubId
      && !player.onLoan,
    );
  });
}

export async function saveGame(
  slot: number,
  name: string,
  state: GameState,
): Promise<SaveRecord> {
  migrateFreeAgentGeography(state);

  const envelope = createSaveEnvelope(state);
  const record: SaveRecord = {
    ...envelope,
    slot,
    name,
    season: state.currentSeason,
    week: state.currentWeek,
    scoutName: `${state.scout.firstName} ${state.scout.lastName}`,
    specialization: state.scout.primarySpecialization,
    reputation: state.scout.reputation,
    state,
  };
  await db.saves.put(record);

  return record;
}

export async function loadGame(slot: number): Promise<GameState | null> {
  const rawRecord: unknown = await db.saves.get(slot);
  if (!rawRecord) return null;
  const record = migrateSaveRecord(rawRecord);
  mergePersistedPlayerExperience(record.playerExperience);
  return record.state;
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

/** Validate and migrate a complete persisted record from any backend. */
export function migrateSaveRecord(raw: unknown): SaveRecord {
  const envelope = migrateSaveEnvelope(raw);
  const requiredMetadata = [
    "slot",
    "name",
    "season",
    "week",
    "scoutName",
    "specialization",
    "reputation",
  ] as const;

  for (const key of requiredMetadata) {
    if (!(key in envelope)) {
      throw new Error(`Invalid save data: missing record metadata ${key}`);
    }
  }

  const record = envelope as unknown as SaveRecord;
  if (!Number.isInteger(record.slot) || record.slot < 0 || record.slot > MAX_MANUAL_SLOTS) {
    throw new Error("Invalid save data: slot must be between 0 and 5");
  }
  if (typeof record.name !== "string" || record.name.length === 0) {
    throw new Error("Invalid save data: missing save name");
  }
  if (!Number.isInteger(record.season) || record.season < 1) {
    throw new Error("Invalid save data: season must be a positive integer");
  }
  if (!Number.isInteger(record.week) || record.week < 1) {
    throw new Error("Invalid save data: week must be a positive integer");
  }
  if (typeof record.scoutName !== "string" || record.scoutName.length === 0) {
    throw new Error("Invalid save data: missing scout name");
  }
  if (
    typeof record.specialization !== "string" ||
    !["youth", "firstTeam", "regional", "data"].includes(record.specialization)
  ) {
    throw new Error("Invalid save data: unsupported specialization");
  }
  if (typeof record.reputation !== "number" || !Number.isFinite(record.reputation)) {
    throw new Error("Invalid save data: reputation must be finite");
  }

  return {
    ...record,
    state: migrateSaveState(record.state),
  };
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
  migrateFreeAgentGeography(state);

  // Phase 1 defaults — NPC scouts, territories, countries
  if (!state.npcScouts) state.npcScouts = {};
  if (!state.npcReports) state.npcReports = {};
  if (!(state as GameState & { npcDelegations?: GameState["npcDelegations"] }).npcDelegations) {
    (state as GameState & { npcDelegations: GameState["npcDelegations"] }).npcDelegations = {};
  }
  if (!state.territories) state.territories = {};
  if (!state.countries) state.countries = ["england"];
  if (!state.runManifest) {
    state.runManifest = createRunManifest({
      rootSeed: state.seed || "legacy-import",
      specialization: state.scout.primarySpecialization ?? "youth",
      difficulty: state.difficulty ?? "normal",
      selectedCountries: state.countries,
      startingCountry: state.countries[0],
      integrity: "legacy-import",
      creationRulesVersion: "legacy-pre-run-manifest",
    });
  } else {
    try {
      if (validateRunManifest(state.runManifest, state.seed).length > 0) {
        state.runManifest = repairRunManifest(
          state.runManifest,
          state.seed || state.runManifest.rootSeed,
        );
      }
    } catch {
      state.runManifest = createRunManifest({
        rootSeed: state.seed || "legacy-import",
        specialization: state.scout.primarySpecialization ?? "youth",
        difficulty: state.difficulty ?? "normal",
        selectedCountries: state.countries,
        startingCountry: state.countries[0],
        integrity: "legacy-import",
        creationRulesVersion: "legacy-pre-run-manifest",
      });
    }
  }
  state.consequenceState = createConsequenceEngineState(state.consequenceState);
  state.eventDirector = createEventDirectorState(state.eventDirector);

  // Phase 2 defaults — narrative, rivals, tools, manager profiles
  if (!state.narrativeEvents) state.narrativeEvents = [];
  if (!state.rivalScouts) state.rivalScouts = {};
  state.rivalOrganizationState = migrateRivalOrganizationState(
    state.seed || state.runManifest.rootSeed,
    state.rivalScouts,
    state.rivalOrganizationState,
    Math.max(1, state.currentSeason),
  );
  if (!state.unlockedTools) state.unlockedTools = [];
  if (!state.managerProfiles) state.managerProfiles = {};

  // Phase 3 defaults — season events
  if (!state.seasonEvents) state.seasonEvents = [];

  // Phase 4 defaults — discovery records, performance history
  if (!state.discoveryRecords) state.discoveryRecords = [];
  if (!state.performanceHistory) state.performanceHistory = [];
  if (!state.completedScenarioIds) state.completedScenarioIds = [];

  // Interactive match tracking — fixture IDs played via MatchScreen
  if (!state.playedFixtures) state.playedFixtures = [];

  // Interactive observation sessions — activity instance IDs completed via ObservationScreen
  if (!state.completedInteractiveSessions) state.completedInteractiveSessions = [];

  // Watchlist — player bookmarks
  if (!state.watchlist) state.watchlist = [];

  // Contact intel — hidden intel from meetings
  if (!state.contactIntel) state.contactIntel = {};

  // Youth Scouting System defaults
  if (!state.unsignedYouth) state.unsignedYouth = {};
  if (!state.placementReports) state.placementReports = {};
  if (!state.gutFeelings) state.gutFeelings = [];
  if (!state.reflectionJournal) state.reflectionJournal = {};
  if (!state.youthRecruitmentBriefs) state.youthRecruitmentBriefs = {};
  if (!state.recommendationReviews) state.recommendationReviews = {};
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
  if (!state.internationalAssignments) state.internationalAssignments = [];
  state.internationalAssignments = state.internationalAssignments.map(
    migrateInternationalAssignment,
  );
  if (state.activeInternationalAssignment) {
    state.activeInternationalAssignment = {
      ...migrateInternationalAssignment(state.activeInternationalAssignment),
      acceptedWeek: state.activeInternationalAssignment.acceptedWeek ?? state.currentWeek,
      acceptedSeason: state.activeInternationalAssignment.acceptedSeason ?? state.currentSeason,
    };
  }
  state.internationalAssignmentHistory = (
    state.internationalAssignmentHistory ?? []
  ).map(migrateInternationalAssignment);
  if (!state.retiredPlayerIds) state.retiredPlayerIds = [];
  if (!state.retiredPlayers) state.retiredPlayers = {};
  if (!state.playerMovementHistory) state.playerMovementHistory = [];
  for (const player of Object.values(state.players ?? {})) {
    if (player.contractClubId === undefined) {
      player.contractClubId = (player.loanParentClubId ?? player.clubId) || undefined;
    }
  }

  // Scout field defaults — Phase 1 extensions on the Scout object
  if (!state.scout.npcScoutIds) state.scout.npcScoutIds = [];
  if (!state.scout.countryReputations) state.scout.countryReputations = {};
  if (!state.scout.boardDirectives) state.scout.boardDirectives = [];
  // skillXp / attributeXp were introduced before Phase 1 but guard anyway
  if (!state.scout.skillXp)
    state.scout.skillXp = {} as Partial<Record<ScoutSkill, number>>;
  if (!state.scout.attributeXp)
    state.scout.attributeXp = {} as Partial<Record<ScoutAttribute, number>>;
  if (state.scout.specializationXp === undefined) state.scout.specializationXp = 0;
  if (state.scout.careerPath === undefined) {
    state.scout.careerPath = state.scout.currentClubId ? "club" : "independent";
  }
  // Established legacy careers keep their inferred historical choice. Only a
  // Tier-1 scout without an employer receives the new explicit decision.
  if (state.scout.careerPathChosen === undefined) {
    state.scout.careerPathChosen = Boolean(
      state.scout.currentClubId || state.scout.careerTier >= 2,
    );
  }
  state.scout.unlockedPerks = Array.from(new Set([
    ...(state.scout.unlockedPerks ?? []),
    ...getUnlockedPerks(
      state.scout.primarySpecialization,
      state.scout.specializationLevel ?? 1,
    ).map((perk) => perk.id),
  ]));

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
  state.transferRecords = migrateLegacyTransferParticipation(state.transferRecords);
  if (!state.systemFitCache) state.systemFitCache = {};

  // Data Scouting System defaults
  if (!state.predictions) state.predictions = [];
  if (!state.dataAnalysts) state.dataAnalysts = [];
  if (!state.statisticalProfiles) state.statisticalProfiles = {};
  if (!state.anomalyFlags) state.anomalyFlags = [];
  if (!state.analystReports) state.analystReports = {};

  // Every persistence entrypoint must reconcile legacy cash to its source
  // ledger, not only the Zustand load path.
  if (state.finances) {
    state.finances = reconcileFinancialLedger(state.finances);
  }

  return reconcileScenarioAuthority(
    migratePoliticalMeetingState(compactLongCareerHistory(state)),
  );
}

export { db };
