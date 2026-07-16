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
  Scout,
  ScoutSkill,
  ScoutAttribute,
} from "@/engine/core/types";
import {
  repairRunManifest,
  validateRunManifest,
} from "@/engine/run";
import { createConsequenceEngineState } from "@/engine/consequences";
import { createEventDirectorState } from "@/engine/events/eventDirector";
import type { CountryData } from "@/data/types";
import { reconcileFinancialLedger } from "@/engine/finance/saveMigration";
import { migrateWorldConditionState } from "@/engine/world/worldConditions";
import {
  closeOrphanedWorldConditionArcDecisions,
  createWorldConditionArcState,
  reconcileWorldConditionArcDecisions,
} from "@/engine/world/worldConditionArcs";
import { getSeasonLength } from "@/engine/core/gameDate";
import { countryKeyFromNationality, normalizeCountryKey } from "@/lib/country";
import {
  createSaveEnvelope,
  createLegacySaveRunManifest,
  migrateSaveEnvelope,
  SaveMigrationError,
  type SaveEnvelope,
} from "@/lib/saveEnvelope";
import { mergePersistedPlayerExperience } from "@/lib/playerExperience";
import { normalizeWeeklyStrategyState } from "@/engine/core/weeklyStrategy";
import { getTravelEligibleCountryKeys } from "@/engine/world/countryAvailability";
import { applyGameplaySaveMigrations } from "@/lib/gameStateGameplayMigration";
import {
  measureSerializedJsonBytes,
  recordSavePersistenceTelemetry,
} from "@/lib/saveTelemetry";
import {
  areEquivalentSaveMetadata,
  areEquivalentSaveStates,
} from "@/lib/saveStateComparison";

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
  /** Monotonic local journal revision. Legacy and cloud records may omit it. */
  storageRevision?: number;
}

/** Outcome of one local save request before optional cloud mirroring begins. */
export interface SaveGameCommit {
  record: SaveRecord;
  /** False when this request matched the authoritative revision exactly. */
  wrote: boolean;
  /** JSON bytes measured only for a real write, never for a dedupe check. */
  payloadBytes: number | null;
  /** Bytes appended to the local recovery journal by this request. */
  archivedBytes: number;
}

export type SaveArchiveKind = "previous-generation" | "conflict-loser";
export type SaveArchiveSource = "local" | "steam" | "supabase";

/**
 * Immutable, player-recoverable save generation. The complete canonical
 * record is retained so recovery passes through the same migration boundary
 * as an ordinary load.
 */
export interface SaveArchiveRecord {
  id: string;
  slot: number;
  kind: SaveArchiveKind;
  source: SaveArchiveSource;
  createdAt: number;
  reason: string;
  conflictId?: string;
  selectedSource?: SaveArchiveSource;
  /** UTF-8 bytes occupied by the serialized SaveRecord payload. */
  logicalBytes?: number;
  /** Cached journal revision so routine revision allocation avoids payload scans. */
  recordRevision?: number;
  /** New rows are validated before insertion; version-4 rows are verified lazily. */
  verified?: boolean;
  record: SaveRecord;
}

export interface SaveArchiveSummary {
  id: string;
  slot: number;
  kind: SaveArchiveKind;
  source: SaveArchiveSource;
  createdAt: number;
  reason: string;
  conflictId?: string;
  selectedSource?: SaveArchiveSource;
  name: string;
  season: number;
  week: number;
  scoutName: string;
  savedAt: number;
  logicalBytes?: number;
}

export interface SaveRecoveryNotice {
  archiveId: string;
  slot: number;
  reason: "newest-corrupt";
  recoveredSavedAt: number;
  message: string;
}

export interface SaveUnavailableNotice {
  reason: "unrecoverable-corruption";
  message: string;
}

export interface LocalSaveLoadResult {
  state: GameState;
  record: SaveRecord;
  recovery?: SaveRecoveryNotice;
}

export type SaveSyncTarget = "steam" | "supabase";
export type SaveSyncTaskStatus = "pending" | "failed";

interface SaveSyncQueueRecordBase {
  id: string;
  slot: number;
  target: SaveSyncTarget;
  status: SaveSyncTaskStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  /** Guards completion so an older in-flight operation cannot clear newer intent. */
  mutationId: string;
}

export interface SaveUploadSyncQueueRecord extends SaveSyncQueueRecordBase {
  operation: "upload";
  /** Revision observed when this coalescing mirror intent was last updated. */
  sourceStorageRevision: number;
  sourceSavedAt: number;
}

export interface SaveDeleteSyncQueueRecord extends SaveSyncQueueRecordBase {
  operation: "delete";
  deletedAt: number;
}

/** One coalescing upload or delete intent per backend and slot. */
export type SaveSyncQueueRecord =
  | SaveUploadSyncQueueRecord
  | SaveDeleteSyncQueueRecord;

/** Executable uploads are hydrated from the authoritative local head on demand. */
export interface ExecutableSaveUploadSyncTask
  extends SaveUploadSyncQueueRecord {
  record: SaveRecord;
}

export type ExecutableSaveSyncTask =
  | ExecutableSaveUploadSyncTask
  | SaveDeleteSyncQueueRecord;

/** Version-4 upload rows embedded a complete SaveRecord in every backend task. */
interface LegacyEmbeddedSaveUploadSyncQueueRecord
  extends Omit<SaveSyncQueueRecordBase, "mutationId"> {
  operation?: "upload";
  mutationId?: string;
  record: SaveRecord;
}

type StoredSaveSyncQueueRecord =
  | SaveSyncQueueRecord
  | LegacyEmbeddedSaveUploadSyncQueueRecord;

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
  saveArchives: EntityTable<SaveArchiveRecord, "id">;
  saveSyncQueue: EntityTable<StoredSaveSyncQueueRecord, "id">;
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

// Version 4: transactional save generations, conflict recovery archives, and
// a persistent offline-first remote sync queue.
db.version(4).stores({
  saves: "slot",
  saveArchives: "id, slot, kind, [slot+kind], createdAt, conflictId",
  saveSyncQueue: "id, slot, target, status, [target+slot], updatedAt",
  leaderboard: "++id, score, season, scoutName, submittedAt",
  mods: "countryKey",
});

// Version 5 keeps the portable save-envelope schema at version 4. Only the
// local journal changes: upload intents are revision pointers and archives
// carry lazily populated retention metadata.
db.version(5).stores({
  saves: "slot",
  saveArchives:
    "id, slot, kind, [slot+kind], createdAt, conflictId, [slot+recordRevision]",
  saveSyncQueue: "id, slot, target, status, [target+slot], updatedAt",
  leaderboard: "++id, score, season, scoutName, submittedAt",
  mods: "countryKey",
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const AUTOSAVE_SLOT = 0;
export const MAX_MANUAL_SLOTS = 5;
export const MAX_PREVIOUS_GENERATIONS_PER_SLOT = 3;
export const MAX_CONFLICT_ARCHIVES_PER_SLOT = 10;
export const MAX_ARCHIVE_LOGICAL_BYTES_PER_SLOT = 128 * 1024 * 1024;

type PersistenceFaultStage =
  | "after-archive-before-head"
  | "after-head-before-commit"
  | "after-sync-head-normalization-before-intent";

let persistenceFaultInjector: ((stage: PersistenceFaultStage) => void) | null = null;
let archiveLogicalByteBudgetOverride: number | null = null;

/**
 * Fault-injection seam for transaction tests. Production code cannot enable
 * it, which keeps recovery behavior deterministic in shipped builds.
 */
export function setPersistenceFaultInjectorForTests(
  injector: ((stage: PersistenceFaultStage) => void) | null,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Persistence fault injection is available only in tests.");
  }
  persistenceFaultInjector = injector;
}

export function setArchiveLogicalByteBudgetForTests(
  bytes: number | null,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Archive retention overrides are available only in tests.");
  }
  if (
    bytes !== null
    && (!Number.isSafeInteger(bytes) || bytes < 0)
  ) {
    throw new Error("Archive retention override must be a non-negative integer.");
  }
  archiveLogicalByteBudgetOverride = bytes;
}

function createSaveRecord(
  slot: number,
  name: string,
  persistedState: GameState,
  savedAt = Date.now(),
): SaveRecord {
  // This clone is owned by the persistence boundary. Keeping the timestamp
  // here makes `lastSaved` truthful for direct DB callers as well as the UI.
  persistedState.lastSaved = savedAt;
  const envelope = createSaveEnvelope(persistedState, savedAt);
  return {
    ...envelope,
    slot,
    name,
    season: persistedState.currentSeason,
    week: persistedState.currentWeek,
    scoutName: `${persistedState.scout.firstName} ${persistedState.scout.lastName}`,
    specialization: persistedState.scout.primarySpecialization,
    reputation: persistedState.scout.reputation,
    state: persistedState,
  };
}

function archiveIdForPrevious(record: SaveRecord): string {
  return `previous:${record.slot}:${record.storageRevision ?? 0}:${record.savedAt}`;
}

function saveRecordLogicalBytes(record: SaveRecord): number {
  return measureSerializedJsonBytes(record);
}

function recordsHaveEquivalentPersistentContent(
  current: SaveRecord,
  candidate: SaveRecord,
): boolean {
  return current.name === candidate.name
    && current.schemaVersion === candidate.schemaVersion
    && current.rulesVersion === candidate.rulesVersion
    && current.buildVersion === candidate.buildVersion
    && areEquivalentSaveMetadata(current.playerExperience, candidate.playerExperience)
    && areEquivalentSaveStates(current.state, candidate.state);
}

function persistenceClock(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

type NewSaveArchiveRecord = Omit<
  SaveArchiveRecord,
  "logicalBytes" | "recordRevision" | "verified"
>;

function createVerifiedArchive(
  archive: NewSaveArchiveRecord,
): SaveArchiveRecord {
  return {
    ...archive,
    logicalBytes: saveRecordLogicalBytes(archive.record),
    recordRevision: archive.record.storageRevision ?? 0,
    verified: true,
  };
}

async function nextStorageRevision(
  slot: number,
  current?: SaveRecord,
): Promise<number> {
  if (current?.storageRevision !== undefined) {
    return current.storageRevision + 1;
  }

  // Revision scans are a legacy/corruption fallback only. Normal v5 saves
  // advance directly from the authoritative head instead of cloning every
  // archived payload merely to allocate a number.
  const archives = await db.saveArchives.where("slot").equals(slot).toArray();
  return Math.max(
    0,
    ...archives.map(
      (archive) => archive.recordRevision
        ?? archive.record.storageRevision
        ?? 0,
    ),
  ) + 1;
}

interface RetentionArchive {
  archive: SaveArchiveRecord;
  logicalBytes: number;
  normalized: boolean;
}

function archiveRevision(archive: SaveArchiveRecord): number {
  return archive.recordRevision ?? archive.record.storageRevision ?? 0;
}

function newestArchiveFirst(
  kind: SaveArchiveKind,
  left: RetentionArchive,
  right: RetentionArchive,
): number {
  if (kind === "conflict-loser") {
    return right.archive.createdAt - left.archive.createdAt
      || right.archive.record.savedAt - left.archive.record.savedAt
      || archiveRevision(right.archive) - archiveRevision(left.archive)
      || right.archive.id.localeCompare(left.archive.id);
  }
  return right.archive.record.savedAt - left.archive.record.savedAt
    || right.archive.createdAt - left.archive.createdAt
    || archiveRevision(right.archive) - archiveRevision(left.archive)
    || right.archive.id.localeCompare(left.archive.id);
}

function oldestArchiveFirst(
  left: RetentionArchive,
  right: RetentionArchive,
): number {
  return left.archive.createdAt - right.archive.createdAt
    || left.archive.record.savedAt - right.archive.record.savedAt
    || archiveRevision(left.archive) - archiveRevision(right.archive)
    || left.archive.id.localeCompare(right.archive.id);
}

function currentArchiveByteBudget(): number {
  return archiveLogicalByteBudgetOverride
    ?? MAX_ARCHIVE_LOGICAL_BYTES_PER_SLOT;
}

/**
 * Enforce count caps and one aggregate logical-byte budget across both archive
 * kinds. One newest verified previous generation and one newest verified
 * conflict loser are protected even when those two recovery guarantees alone
 * exceed the budget.
 */
async function pruneArchives(slot: number): Promise<void> {
  const stored = await db.saveArchives.where("slot").equals(slot).toArray();
  const invalidIds: string[] = [];
  const retainedCandidates: RetentionArchive[] = [];

  for (const archive of stored) {
    let migrated: SaveRecord | null = null;
    if (archive.verified !== true) {
      try {
        migrated = migrateSaveRecord(archive.record);
      } catch {
        invalidIds.push(archive.id);
        continue;
      }
    }

    const logicalBytes =
      Number.isSafeInteger(archive.logicalBytes)
      && (archive.logicalBytes ?? 0) >= 0
        ? archive.logicalBytes!
        : saveRecordLogicalBytes(archive.record);
    const recordRevision = archive.recordRevision
      ?? migrated?.storageRevision
      ?? archive.record.storageRevision
      ?? 0;
    const normalized = archive.verified !== true
      || archive.logicalBytes !== logicalBytes
      || archive.recordRevision !== recordRevision;
    retainedCandidates.push({
      archive: normalized
        ? {
            ...archive,
            logicalBytes,
            recordRevision,
            verified: true,
          }
        : archive,
      logicalBytes,
      normalized,
    });
  }

  const protectedIds = new Set<string>();
  const deleteIds = new Set(invalidIds);
  const countCaps: Record<SaveArchiveKind, number> = {
    "previous-generation": MAX_PREVIOUS_GENERATIONS_PER_SLOT,
    "conflict-loser": MAX_CONFLICT_ARCHIVES_PER_SLOT,
  };

  for (const kind of ["previous-generation", "conflict-loser"] as const) {
    const matching = retainedCandidates
      .filter((candidate) => candidate.archive.kind === kind)
      .sort((left, right) => newestArchiveFirst(kind, left, right));
    if (matching[0]) protectedIds.add(matching[0].archive.id);
    for (const expired of matching.slice(countCaps[kind])) {
      if (!protectedIds.has(expired.archive.id)) {
        deleteIds.add(expired.archive.id);
      }
    }
  }

  const withinCountCaps = retainedCandidates.filter(
    (candidate) => !deleteIds.has(candidate.archive.id),
  );
  let logicalBytes = withinCountCaps.reduce(
    (total, candidate) => total + candidate.logicalBytes,
    0,
  );
  const budget = currentArchiveByteBudget();
  const removable = withinCountCaps
    .filter((candidate) => !protectedIds.has(candidate.archive.id))
    .sort(oldestArchiveFirst);
  for (const candidate of removable) {
    if (logicalBytes <= budget) break;
    deleteIds.add(candidate.archive.id);
    logicalBytes -= candidate.logicalBytes;
  }

  const metadataUpdates = retainedCandidates
    .filter(
      (candidate) => candidate.normalized
        && !deleteIds.has(candidate.archive.id),
    )
    .map((candidate) => candidate.archive);
  if (metadataUpdates.length > 0) {
    await db.saveArchives.bulkPut(metadataUpdates);
  }
  if (deleteIds.size > 0) {
    await db.saveArchives.bulkDelete([...deleteIds]);
  }
}

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

/**
 * Commit a canonical local save without serializing it through a string API.
 *
 * The journal revision is only advanced when gameplay-relevant content changes.
 * A checkpoint followed by an identical autosave therefore retains the same
 * head, recovery history, and cloud revision instead of manufacturing churn.
 */
export async function saveGameWithResult(
  slot: number,
  name: string,
  state: unknown,
): Promise<SaveGameCommit> {
  const startedAt = persistenceClock();
  // Persist a canonical snapshot without mutating the live Zustand object.
  // This is the same boundary used by IndexedDB, Steam, Supabase, conflict
  // resolution, and direct store loads.
  const persistedState = migrateSaveState(state);

  const candidate = createSaveRecord(slot, name, persistedState);

  const commit = await db.transaction("rw", db.saves, db.saveArchives, async () => {
    const rawCurrent: unknown = await db.saves.get(slot);
    let current: SaveRecord | undefined;
    if (rawCurrent) {
      try {
        current = migrateSaveRecord(rawCurrent);
      } catch {
        // A corrupt head must never displace the last known-valid generation.
        // It is intentionally not copied into the recoverable archive.
      }
    }

    // Save timestamps are delivery metadata, not world state. Ignore only the
    // root GameState.lastSaved field while comparing canonical envelopes so an
    // identical checkpoint cannot create a fake new generation.
    if (current && recordsHaveEquivalentPersistentContent(current, candidate)) {
      return {
        record: current,
        wrote: false,
        payloadBytes: null,
        archivedBytes: 0,
      } satisfies SaveGameCommit;
    }

    let archivedBytes = 0;
    if (current) {
      const archive = createVerifiedArchive({
        id: archiveIdForPrevious(current),
        slot,
        kind: "previous-generation",
        source: "local",
        createdAt: candidate.savedAt,
        reason: "Replaced by a newer local save",
        record: current,
      });
      archivedBytes = archive.logicalBytes ?? 0;
      await db.saveArchives.put(archive);
      persistenceFaultInjector?.("after-archive-before-head");
    }

    const record: SaveRecord = {
      ...candidate,
      storageRevision: await nextStorageRevision(slot, current),
    };
    // Measuring this exact JSON boundary has two jobs: durable byte telemetry
    // and an early, deterministic failure for non-serializable data that would
    // otherwise fail only when Steam later tries to mirror it.
    const payloadBytes = saveRecordLogicalBytes(record);
    await db.saves.put(record);
    persistenceFaultInjector?.("after-head-before-commit");
    await pruneArchives(slot);
    return {
      record,
      wrote: true,
      payloadBytes,
      archivedBytes,
    } satisfies SaveGameCommit;
  });

  recordSavePersistenceTelemetry({
    recordedAt: Date.now(),
    slot,
    storageRevision: commit.record.storageRevision ?? null,
    disposition: commit.wrote ? "written" : "deduplicated",
    durationMs: persistenceClock() - startedAt,
    payloadBytes: commit.payloadBytes,
    archivedBytes: commit.archivedBytes,
  });
  return commit;
}

/** Backward-compatible record-only API for direct local/cloud adapters. */
export async function saveGame(
  slot: number,
  name: string,
  state: unknown,
): Promise<SaveRecord> {
  return (await saveGameWithResult(slot, name, state)).record;
}

export async function loadGame(slot: number): Promise<GameState | null> {
  return (await loadGameWithRecovery(slot))?.state ?? null;
}

/**
 * Load the newest valid generation. If the head row is corrupt, the newest
 * valid backup is returned with an explicit recovery notice instead of
 * silently pretending the slot is empty.
 */
export async function loadGameWithRecovery(
  slot: number,
): Promise<LocalSaveLoadResult | null> {
  const rawRecord: unknown = await db.saves.get(slot);
  if (!rawRecord) return null;

  try {
    const record = migrateSaveRecord(rawRecord);
    mergePersistedPlayerExperience(record.playerExperience);
    return { state: record.state, record };
  } catch (headError) {
    const archives = await db.saveArchives
      .where("[slot+kind]")
      .equals([slot, "previous-generation"])
      .toArray();
    archives.sort((a, b) =>
      b.record.savedAt - a.record.savedAt || b.createdAt - a.createdAt,
    );

    for (const archive of archives) {
      try {
        const record = migrateSaveRecord(archive.record);
        mergePersistedPlayerExperience(record.playerExperience);
        return {
          state: record.state,
          record,
          recovery: {
            archiveId: archive.id,
            slot,
            reason: "newest-corrupt",
            recoveredSavedAt: record.savedAt,
            message:
              "The newest local save was damaged. A verified earlier generation is available and was selected for this load.",
          },
        };
      } catch {
        // Continue to the next immutable generation.
      }
    }

    const reason = headError instanceof Error ? headError.message : String(headError);
    throw new SaveMigrationError(
      "CORRUPT_SAVE",
      `The newest save is corrupt and no valid local recovery generation exists (${reason}).`,
    );
  }
}

export type SaveListEntry = Omit<SaveRecord, "state"> & {
  recovery?: SaveRecoveryNotice;
  unavailable?: SaveUnavailableNotice;
};

function unavailableSaveEntry(
  raw: unknown,
  error: unknown,
): SaveListEntry | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const slot = Number.isInteger(record.slot) ? record.slot as number : -1;
  if (slot < 0 || slot > MAX_MANUAL_SLOTS) return null;
  const message = error instanceof Error ? error.message : String(error);
  const specialization = typeof record.specialization === "string"
    ? record.specialization
    : "unknown";
  return {
    schemaVersion: typeof record.schemaVersion === "number" ? record.schemaVersion : 0,
    rulesVersion: typeof record.rulesVersion === "string" ? record.rulesVersion : "unknown",
    buildVersion: typeof record.buildVersion === "string" ? record.buildVersion : "unknown",
    savedAt: typeof record.savedAt === "number" && Number.isFinite(record.savedAt)
      ? record.savedAt
      : 0,
    slot,
    name: typeof record.name === "string" ? record.name : "Damaged save",
    season: Number.isInteger(record.season) && (record.season as number) > 0
      ? record.season as number
      : 1,
    week: Number.isInteger(record.week) && (record.week as number) > 0
      ? record.week as number
      : 1,
    scoutName: typeof record.scoutName === "string"
      ? record.scoutName
      : "Unknown scout",
    specialization,
    reputation: typeof record.reputation === "number" && Number.isFinite(record.reputation)
      ? record.reputation
      : 0,
    unavailable: {
      reason: "unrecoverable-corruption",
      message: `This save is damaged and no verified recovery generation is available. ${message}`,
    },
  };
}

export async function listSaves(): Promise<SaveListEntry[]> {
  const all = await db.saves.toArray();
  const entries: SaveListEntry[] = [];
  for (const raw of all) {
    try {
      const record = migrateSaveRecord(raw);
      const { state: _state, ...meta } = record;
      entries.push(meta);
    } catch {
      try {
        const recovered = await loadGameWithRecovery(raw.slot);
        if (!recovered) continue;
        const { state: _state, ...meta } = recovered.record;
        entries.push({ ...meta, recovery: recovered.recovery });
      } catch (error) {
        const unavailable = unavailableSaveEntry(raw, error);
        if (unavailable) entries.push(unavailable);
      }
    }
  }
  return entries.sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteSave(slot: number): Promise<void> {
  await db.transaction(
    "rw",
    db.saves,
    db.saveArchives,
    db.saveSyncQueue,
    async () => {
      await db.saves.delete(slot);
      await db.saveArchives.where("slot").equals(slot).delete();
      await db.saveSyncQueue.where("slot").equals(slot).delete();
    },
  );
}

export async function autosave(state: GameState): Promise<void> {
  await saveGame(AUTOSAVE_SLOT, "Autosave", state);
}

function archiveSummary(archive: SaveArchiveRecord): SaveArchiveSummary {
  return {
    id: archive.id,
    slot: archive.slot,
    kind: archive.kind,
    source: archive.source,
    createdAt: archive.createdAt,
    reason: archive.reason,
    conflictId: archive.conflictId,
    selectedSource: archive.selectedSource,
    name: archive.record.name,
    season: archive.record.season,
    week: archive.record.week,
    scoutName: archive.record.scoutName,
    savedAt: archive.record.savedAt,
    logicalBytes: archive.logicalBytes,
  };
}

export async function listSaveArchives(
  slot?: number,
): Promise<SaveArchiveSummary[]> {
  const archives = slot === undefined
    ? await db.saveArchives.toArray()
    : await db.saveArchives.where("slot").equals(slot).toArray();
  return archives
    .map(archiveSummary)
    .sort((a, b) => b.createdAt - a.createdAt || b.savedAt - a.savedAt);
}

export interface ConflictResolutionCommit {
  conflictId: string;
  slot: number;
  expectedLocalTimestamp: number;
  selectedSource: SaveArchiveSource;
  losingSource: SaveArchiveSource;
  selected: SaveRecord;
  losing: SaveRecord;
}

export interface ConflictResolutionCommitResult {
  applied: boolean;
  selected: SaveRecord;
  archive: SaveArchiveSummary;
}

/**
 * Atomically archives the losing branch and promotes the chosen branch.
 * `conflictId` is the exact-once key, so retries cannot duplicate archives or
 * apply a second branch after the first resolution committed.
 */
export async function commitConflictResolution(
  input: ConflictResolutionCommit,
): Promise<ConflictResolutionCommitResult> {
  const archiveId = `conflict:${input.conflictId}`;
  const selected = migrateSaveRecord({ ...input.selected, slot: input.slot });
  const losing = migrateSaveRecord({ ...input.losing, slot: input.slot });

  return db.transaction("rw", db.saves, db.saveArchives, async () => {
    const priorArchive = await db.saveArchives.get(archiveId);
    if (priorArchive) {
      const currentRaw: unknown = await db.saves.get(input.slot);
      if (!currentRaw) {
        throw new Error("Resolved conflict archive exists but the selected save is missing.");
      }
      return {
        applied: false,
        selected: migrateSaveRecord(currentRaw),
        archive: archiveSummary(priorArchive),
      };
    }

    const currentRaw: unknown = await db.saves.get(input.slot);
    if (!currentRaw) throw new Error("The local save disappeared before conflict resolution.");
    const current = migrateSaveRecord(currentRaw);
    if (current.savedAt !== input.expectedLocalTimestamp) {
      throw new Error(
        "This save changed after the conflict prompt opened. Review the updated versions before choosing again.",
      );
    }

    const archive = createVerifiedArchive({
      id: archiveId,
      slot: input.slot,
      kind: "conflict-loser",
      source: input.losingSource,
      createdAt: Date.now(),
      reason: `Preserved when ${input.selectedSource} was chosen during conflict resolution`,
      conflictId: input.conflictId,
      selectedSource: input.selectedSource,
      record: losing,
    });
    const promoted: SaveRecord = {
      ...selected,
      storageRevision: await nextStorageRevision(input.slot, current),
    };
    await db.saveArchives.put(archive);
    await db.saves.put(promoted);
    await pruneArchives(input.slot);

    return {
      applied: true,
      selected: promoted,
      archive: archiveSummary(archive),
    };
  });
}

/** Restore a recovery generation while preserving the displaced current row. */
export async function restoreSaveArchive(id: string): Promise<SaveRecord> {
  return db.transaction("rw", db.saves, db.saveArchives, async () => {
    const archive = await db.saveArchives.get(id);
    if (!archive) throw new Error("That recovery copy is no longer available.");
    const recovered = migrateSaveRecord(archive.record);
    const currentRaw: unknown = await db.saves.get(archive.slot);
    let current: SaveRecord | undefined;
    if (currentRaw) {
      try {
        current = migrateSaveRecord(currentRaw);
      } catch {
        // Replacing a corrupt head is safe; the corrupt bytes are not copied.
      }
    }
    if (current) {
      await db.saveArchives.put(createVerifiedArchive({
        id: archiveIdForPrevious(current),
        slot: archive.slot,
        kind: "previous-generation",
        source: "local",
        createdAt: Date.now(),
        reason: "Displaced by an explicit recovery restore",
        record: current,
      }));
    }
    const restored: SaveRecord = {
      ...createSaveRecord(archive.slot, recovered.name, recovered.state),
      playerExperience: recovered.playerExperience,
      storageRevision: await nextStorageRevision(archive.slot, current),
    };
    await db.saves.put(restored);
    await pruneArchives(archive.slot);
    return restored;
  });
}

function syncTaskId(target: SaveSyncTarget, slot: number): string {
  return `sync:${target}:${slot}`;
}

let syncMutationSequence = 0;

function createSyncMutationId(
  operation: SaveSyncQueueRecord["operation"],
  target: SaveSyncTarget,
  slot: number,
  timestamp: number,
): string {
  syncMutationSequence += 1;
  return `${operation}:${target}:${slot}:${timestamp}:${syncMutationSequence}`;
}

function isLegacyEmbeddedUpload(
  stored: StoredSaveSyncQueueRecord,
): stored is LegacyEmbeddedSaveUploadSyncQueueRecord {
  return stored.operation !== "delete" && "record" in stored;
}

function syncTaskFromStored(
  stored: StoredSaveSyncQueueRecord,
): SaveSyncQueueRecord {
  if (stored.operation === "delete") return stored;
  if (!isLegacyEmbeddedUpload(stored)) return stored;

  const { record, ...legacy } = stored;
  const sourceStorageRevision =
    Number.isSafeInteger(record.storageRevision)
    && (record.storageRevision ?? -1) >= 0
      ? record.storageRevision!
      : 0;
  const sourceSavedAt =
    typeof record.savedAt === "number" && Number.isFinite(record.savedAt)
      ? record.savedAt
      : 0;
  return {
    ...legacy,
    operation: "upload",
    mutationId:
      stored.mutationId
      ?? `legacy-upload:${stored.target}:${stored.slot}:${sourceStorageRevision}:${sourceSavedAt}`,
    sourceStorageRevision,
    sourceSavedAt,
  };
}

async function authoritativeHeadWithRevision(slot: number): Promise<SaveRecord> {
  const raw: unknown = await db.saves.get(slot);
  if (!raw) {
    throw new Error(
      "The queued cloud upload has no authoritative local save and cannot be replayed.",
    );
  }
  const migrated = migrateSaveRecord(raw);
  if (migrated.storageRevision !== undefined) return migrated;

  const normalized: SaveRecord = {
    ...migrated,
    storageRevision: await nextStorageRevision(slot),
  };
  await db.saves.put(normalized);
  return normalized;
}

function uploadPointerForHead(
  stored: StoredSaveSyncQueueRecord,
  head: SaveRecord,
): SaveUploadSyncQueueRecord {
  const summary = syncTaskFromStored(stored);
  if (summary.operation !== "upload" || head.storageRevision === undefined) {
    throw new Error("A cloud upload could not be assigned to a local save revision.");
  }
  return {
    ...summary,
    sourceStorageRevision: head.storageRevision,
    sourceSavedAt: head.savedAt,
  };
}

async function normalizeLegacyUpload(
  stored: LegacyEmbeddedSaveUploadSyncQueueRecord,
): Promise<SaveUploadSyncQueueRecord> {
  const head = await authoritativeHeadWithRevision(stored.slot);
  const pointer = uploadPointerForHead(stored, head);
  await db.saveSyncQueue.put(pointer);
  return pointer;
}

export async function enqueueSaveSync(
  record: SaveRecord,
  target: SaveSyncTarget,
): Promise<SaveSyncQueueRecord> {
  const slot = record.slot;
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_MANUAL_SLOTS) {
    throw new Error("A cloud upload must reference a valid local save slot.");
  }

  return db.transaction(
    "rw",
    db.saves,
    db.saveArchives,
    db.saveSyncQueue,
    async () => {
      const head = await authoritativeHeadWithRevision(slot);
      persistenceFaultInjector?.("after-sync-head-normalization-before-intent");
      const now = Date.now();
      const id = syncTaskId(target, slot);
      const existing = await db.saveSyncQueue.get(id);
      const task: SaveUploadSyncQueueRecord = {
        id,
        slot,
        target,
        status: "pending",
        attempts: 0,
        createdAt: existing?.operation === "delete"
          ? now
          : existing?.createdAt ?? now,
        updatedAt: now,
        operation: "upload",
        mutationId: createSyncMutationId("upload", target, slot, now),
        sourceStorageRevision: head.storageRevision!,
        sourceSavedAt: head.savedAt,
      };
      await db.saveSyncQueue.put(task);
      return task;
    },
  );
}

/**
 * Commit deletion locally and replace every known remote write with a durable
 * delete tombstone in the same transaction. Existing tombstones are reused so
 * repeated delete requests remain idempotent.
 */
export async function deleteSaveAndEnqueueRemoteDeletes(
  slot: number,
  requestedTargets: readonly SaveSyncTarget[],
): Promise<SaveDeleteSyncQueueRecord[]> {
  return db.transaction(
    "rw",
    db.saves,
    db.saveArchives,
    db.saveSyncQueue,
    async () => {
      const existing = await db.saveSyncQueue.where("slot").equals(slot).toArray();
      const targets = new Set<SaveSyncTarget>(requestedTargets);
      for (const task of existing) targets.add(task.target);

      const now = Date.now();
      const tombstones: SaveDeleteSyncQueueRecord[] = [];
      for (const target of targets) {
        const id = syncTaskId(target, slot);
        const priorStored = existing.find((task) => task.id === id);
        const tombstone: SaveDeleteSyncQueueRecord = priorStored?.operation === "delete"
          ? {
              ...priorStored,
              status: "pending",
              updatedAt: now,
              lastError: undefined,
            }
          : {
              id,
              slot,
              target,
              operation: "delete",
              mutationId: createSyncMutationId("delete", target, slot, now),
              deletedAt: now,
              status: "pending",
              attempts: 0,
              createdAt: now,
              updatedAt: now,
            };
        await db.saveSyncQueue.put(tombstone);
        tombstones.push(tombstone);
      }

      await db.saves.delete(slot);
      await db.saveArchives.where("slot").equals(slot).delete();
      return tombstones;
    },
  );
}

export async function listSaveSyncQueue(): Promise<SaveSyncQueueRecord[]> {
  return db.transaction(
    "rw",
    db.saves,
    db.saveArchives,
    db.saveSyncQueue,
    async () => {
      const tasks: SaveSyncQueueRecord[] = [];
      for (const stored of await db.saveSyncQueue.toArray()) {
        if (isLegacyEmbeddedUpload(stored)) {
          try {
            tasks.push(await normalizeLegacyUpload(stored));
            continue;
          } catch {
            // Keep an orphaned/corrupt legacy row visible as failed work. It
            // must not resurrect its embedded snapshot without a valid head.
          }
        }
        tasks.push(syncTaskFromStored(stored));
      }
      return tasks.sort((a, b) =>
        a.updatedAt - b.updatedAt || a.id.localeCompare(b.id)
      );
    },
  );
}

export async function getSaveSyncTask(
  target: SaveSyncTarget,
  slot: number,
): Promise<SaveSyncQueueRecord | null> {
  return db.transaction(
    "rw",
    db.saves,
    db.saveArchives,
    db.saveSyncQueue,
    async () => {
      const stored = await db.saveSyncQueue.get(syncTaskId(target, slot));
      if (!stored) return null;
      if (isLegacyEmbeddedUpload(stored)) {
        try {
          return await normalizeLegacyUpload(stored);
        } catch {
          // Surface the pending legacy intent without treating its payload as
          // authoritative when no valid local head exists.
        }
      }
      return syncTaskFromStored(stored);
    },
  );
}

export async function markSaveSyncTaskPending(
  taskId: string,
): Promise<SaveSyncQueueRecord | null> {
  return db.transaction(
    "rw",
    db.saves,
    db.saveArchives,
    db.saveSyncQueue,
    async () => {
      const stored = await db.saveSyncQueue.get(taskId);
      if (!stored) return null;
      let writable: StoredSaveSyncQueueRecord = stored;
      if (isLegacyEmbeddedUpload(stored)) {
        try {
          writable = await normalizeLegacyUpload(stored);
        } catch {
          // A retry will fail closed during hydration, but the intent remains
          // visible and cancellable rather than disappearing on migration.
        }
      }
      const task = syncTaskFromStored(writable);
      const pending: SaveSyncQueueRecord = {
        ...task,
        status: "pending",
        updatedAt: Date.now(),
        lastError: undefined,
      };
      await db.saveSyncQueue.put(
        isLegacyEmbeddedUpload(writable)
          ? {
              ...writable,
              mutationId: pending.mutationId,
              status: pending.status,
              updatedAt: pending.updatedAt,
              lastError: undefined,
            }
          : pending,
      );
      return pending;
    },
  );
}

type SyncTaskHydrationResult =
  | { status: "ready"; task: ExecutableSaveSyncTask }
  | { status: "missing" | "superseded" };

async function hydrateSaveSyncTask(
  taskId: string,
  expectedMutationId: string,
): Promise<SyncTaskHydrationResult> {
  return db.transaction(
    "rw",
    db.saves,
    db.saveArchives,
    db.saveSyncQueue,
    async () => {
      const stored = await db.saveSyncQueue.get(taskId);
      if (!stored) return { status: "missing" };
      const summary = syncTaskFromStored(stored);
      if (summary.mutationId !== expectedMutationId) {
        return { status: "superseded" };
      }
      if (summary.operation === "delete") {
        return { status: "ready", task: summary };
      }

      const head = await authoritativeHeadWithRevision(summary.slot);
      let pointer = isLegacyEmbeddedUpload(stored)
        ? uploadPointerForHead(stored, head)
        : summary;
      if (
        !Number.isSafeInteger(pointer.sourceStorageRevision)
        || pointer.sourceStorageRevision < 0
        || !Number.isFinite(pointer.sourceSavedAt)
      ) {
        throw new Error("The queued cloud upload has invalid revision metadata.");
      }
      if (head.storageRevision! < pointer.sourceStorageRevision) {
        throw new Error(
          "The local save journal is older than the queued cloud revision.",
        );
      }
      if (
        head.storageRevision === pointer.sourceStorageRevision
        && head.savedAt !== pointer.sourceSavedAt
      ) {
        throw new Error(
          "The queued cloud revision does not match the authoritative save timestamp.",
        );
      }
      if (
        head.storageRevision! > pointer.sourceStorageRevision
        || isLegacyEmbeddedUpload(stored)
      ) {
        pointer = {
          ...pointer,
          sourceStorageRevision: head.storageRevision!,
          sourceSavedAt: head.savedAt,
        };
        await db.saveSyncQueue.put(pointer);
      }
      return {
        status: "ready",
        task: { ...pointer, record: head },
      };
    },
  );
}

/**
 * Run one persisted task with an injected uploader. Completion/failure writes
 * are revision-guarded so an older in-flight upload cannot clear newer work.
 */
export async function processSaveSyncTask(
  taskId: string,
  execute: (task: ExecutableSaveSyncTask) => Promise<void>,
): Promise<"synced" | "failed" | "superseded" | "missing"> {
  const stored = await db.saveSyncQueue.get(taskId);
  if (!stored) return "missing";
  const mutationId = syncTaskFromStored(stored).mutationId;
  try {
    const hydration = await hydrateSaveSyncTask(taskId, mutationId);
    if (hydration.status !== "ready") return hydration.status;
    const task = hydration.task;
    await execute(task);
    return db.transaction("rw", db.saves, db.saveSyncQueue, async () => {
      const latestStored = await db.saveSyncQueue.get(taskId);
      if (!latestStored) return "missing" as const;
      const latest = syncTaskFromStored(latestStored);
      if (latest.mutationId !== mutationId) return "superseded" as const;

      if (task.operation === "upload") {
        if (latest.operation !== "upload") return "superseded" as const;
        const rawHead = await db.saves.get(task.slot);
        if (!rawHead) {
          throw new Error(
            "The authoritative local save disappeared during cloud upload.",
          );
        }
        const currentRevision = rawHead.storageRevision;
        if (
          currentRevision === undefined
          || !Number.isSafeInteger(currentRevision)
          || currentRevision < task.sourceStorageRevision
        ) {
          throw new Error(
            "The local save journal changed incompatibly during cloud upload.",
          );
        }
        if (currentRevision > task.sourceStorageRevision) {
          const rebased: SaveUploadSyncQueueRecord = {
            ...latest,
            status: "pending",
            sourceStorageRevision: currentRevision,
            sourceSavedAt: rawHead.savedAt,
            updatedAt: Date.now(),
            lastError: undefined,
          };
          await db.saveSyncQueue.put(rebased);
          return "superseded" as const;
        }
        if (rawHead.savedAt !== task.sourceSavedAt) {
          throw new Error(
            "The local save timestamp changed without a journal revision.",
          );
        }
      }
      await db.saveSyncQueue.delete(taskId);
      return "synced" as const;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return db.transaction("rw", db.saveSyncQueue, async () => {
      const latestStored = await db.saveSyncQueue.get(taskId);
      if (!latestStored) return "missing" as const;
      const latest = syncTaskFromStored(latestStored);
      if (latest.mutationId !== mutationId) return "superseded" as const;
      await db.saveSyncQueue.put({
        ...latestStored,
        mutationId: latest.mutationId,
        status: "failed",
        attempts: latest.attempts + 1,
        updatedAt: Date.now(),
        lastError: message,
      });
      return "failed" as const;
    });
  }
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
  if (
    record.storageRevision !== undefined
    && (!Number.isInteger(record.storageRevision) || record.storageRevision < 0)
  ) {
    throw new Error("Invalid save data: storageRevision must be a non-negative integer");
  }

  const state = migrateSaveState(record.state);
  const stateScoutName = [state.scout.firstName, state.scout.lastName]
    .filter((part): part is string =>
      typeof part === "string" && part.trim().length > 0
    )
    .join(" ");
  const stateSpecialization = state.scout.primarySpecialization;
  const canonicalSpecialization = ["youth", "firstTeam", "regional", "data"]
    .includes(stateSpecialization)
    ? stateSpecialization
    : record.specialization;
  return {
    ...record,
    // Save-list metadata is a projection of the authoritative state payload.
    // Reconcile valid but stale remote/legacy metadata so the UI cannot claim
    // a different week, scout, specialization, or reputation than it loads.
    season: state.currentSeason,
    week: state.currentWeek,
    scoutName: stateScoutName || record.scoutName,
    specialization: canonicalSpecialization,
    reputation: Number.isFinite(state.scout.reputation)
      ? state.scout.reputation
      : record.reputation,
    state,
  };
}

// ---------------------------------------------------------------------------
// Save migration
// ---------------------------------------------------------------------------

/**
 * Applies backward-compatible defaults at every local, cloud, conflict, and
 * direct-store persistence boundary.
 *
 * The source is never mutated, and a migrated result can safely pass through
 * this function again.
 */
export function migrateSaveState(raw: unknown): GameState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SaveMigrationError(
      "CORRUPT_SAVE",
      "Invalid save data: expected an object game state",
    );
  }

  const candidate = raw as Record<string, unknown>;
  if (
    !Number.isInteger(candidate.currentSeason)
    || (candidate.currentSeason as number) < 1
    || !Number.isInteger(candidate.currentWeek)
    || (candidate.currentWeek as number) < 1
  ) {
    throw new SaveMigrationError(
      "CORRUPT_SAVE",
      "Invalid save data: currentSeason and currentWeek must be positive integers",
    );
  }
  if (
    typeof candidate.scout !== "object"
    || candidate.scout === null
    || Array.isArray(candidate.scout)
  ) {
    throw new SaveMigrationError(
      "CORRUPT_SAVE",
      "Invalid save data: scout must be an object",
    );
  }

  let state: GameState;
  try {
    // GameState is a JSON persistence contract. Clone before applying any
    // compatibility repair so failed imports and previews retain their exact
    // source bytes and direct store loads cannot mutate caller-owned state.
    state = structuredClone(raw) as GameState;
  } catch (error) {
    throw new SaveMigrationError(
      "CORRUPT_SAVE",
      `Invalid save data: game state is not cloneable (${String(error)})`,
    );
  }

  const scoutRecord = state.scout as Scout & { skills?: Scout["skills"] | null };
  if (
    typeof scoutRecord.skills !== "object"
    || scoutRecord.skills === null
    || Array.isArray(scoutRecord.skills)
  ) {
    scoutRecord.skills = {} as Scout["skills"];
  }
  migrateFreeAgentGeography(state);

  // Phase 1 defaults — NPC scouts, territories, countries
  if (!state.npcScouts) state.npcScouts = {};
  if (!state.npcReports) state.npcReports = {};
  if (!(state as GameState & { npcDelegations?: GameState["npcDelegations"] }).npcDelegations) {
    (state as GameState & { npcDelegations: GameState["npcDelegations"] }).npcDelegations = {};
  }
  if (!state.territories) state.territories = {};
  state.countries = Array.isArray(state.countries)
    ? Array.from(new Set(
        state.countries.filter(
          (country): country is string =>
            typeof country === "string" && country.trim().length > 0,
        ),
      ))
    : [];
  if (state.countries.length === 0) state.countries = ["england"];

  // The first public save format predates several required entity indexes.
  // Treat omitted indexes as empty collections, while rejecting malformed
  // primitives above, so a structurally valid early career remains loadable.
  state.leagues ??= {};
  state.clubs ??= {};
  state.players ??= {};
  state.fixtures ??= {};
  state.observations ??= {};
  state.reports ??= {};
  state.contacts ??= {};
  state.inbox ??= [];
  state.jobOffers ??= [];
  state.performanceReviews ??= [];
  const generatedCountries = getTravelEligibleCountryKeys(state);
  if (generatedCountries.length > 0) {
    // `countries` is a presentation/order hint everywhere else, but at the
    // persistence boundary it must be reconciled with generated world facts
    // before seasonal conditions are migrated. This prevents a stale legacy
    // catalogue entry from receiving a live regional condition.
    state.countries = generatedCountries;
  }
  if (!state.runManifest) {
    state.runManifest = createLegacySaveRunManifest(
      state as unknown as Record<string, unknown>,
    );
  } else {
    try {
      if (validateRunManifest(state.runManifest, state.seed).length > 0) {
        state.runManifest = repairRunManifest(
          state.runManifest,
          state.seed || state.runManifest.rootSeed,
        );
      }
    } catch {
      state.runManifest = createLegacySaveRunManifest(
        state as unknown as Record<string, unknown>,
      );
    }
  }
  state.worldConditionState = migrateWorldConditionState(
    state.worldConditionState,
    state.runManifest,
    state.countries,
    state.currentSeason,
  );
  state.consequenceState = createConsequenceEngineState(state.consequenceState);
  const migratedWorldConditionArcs = createWorldConditionArcState(
    state.worldConditionArcState,
    state.countries,
  );
  const repairedWorldArcDecisions = closeOrphanedWorldConditionArcDecisions({
    state: migratedWorldConditionArcs,
    decisions: state.consequenceState.decisions,
    now: { week: state.currentWeek, season: state.currentSeason },
  });
  if (repairedWorldArcDecisions.closedDecisionIds.length > 0) {
    state.consequenceState = {
      ...state.consequenceState,
      decisions: repairedWorldArcDecisions.decisions,
    };
    const closed = new Set(repairedWorldArcDecisions.closedDecisionIds);
    state.inbox = state.inbox.map((message) =>
      message.relatedId && closed.has(message.relatedId)
        ? { ...message, actionRequired: false }
        : message,
    );
  }
  state.worldConditionArcState = reconcileWorldConditionArcDecisions({
    state: migratedWorldConditionArcs,
    decisions: state.consequenceState.decisions,
    now: { week: state.currentWeek, season: state.currentSeason },
    seasonLength: getSeasonLength(state.fixtures, state.currentSeason),
  });
  state.eventDirector = createEventDirectorState(state.eventDirector);
  state.weeklyStrategy = normalizeWeeklyStrategyState(
    state.weeklyStrategy,
    state.currentWeek,
    state.currentSeason,
  );

  // Phase 2 defaults — narrative, rivals, tools, manager profiles
  if (!state.narrativeEvents) state.narrativeEvents = [];
  if (!state.rivalScouts) state.rivalScouts = {};
  if (!state.unlockedTools) state.unlockedTools = [];
  if (!state.managerProfiles) state.managerProfiles = {};
  for (const [clubId, manager] of Object.entries(state.managerProfiles)) {
    manager.managerId ??= state.clubs[clubId]?.managerId;
  }

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
  if (!state.scoutingCases) state.scoutingCases = {};
  if (!state.reportDeliveries) state.reportDeliveries = {};
  if (!state.clubDecisions) state.clubDecisions = {};
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
  // New scout skills — playerJudgment and potentialAssessment
  if (state.scout.skills.playerJudgment === undefined) {
    state.scout.skills.playerJudgment = 5;
  }
  if (state.scout.skills.potentialAssessment === undefined) {
    state.scout.skills.potentialAssessment = 5;
  }

  // Every persistence entrypoint must reconcile legacy cash to its source
  // ledger, not only the Zustand load path.
  if (state.finances) {
    state.finances = reconcileFinancialLedger(state.finances);
  }

  return applyGameplaySaveMigrations(state);
}

export { db };
