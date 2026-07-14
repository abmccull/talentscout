/**
 * SaveProvider — unified multi-backend save abstraction.
 *
 * Provides a single interface that writes to all available save backends
 * and reads back the most recent version across all of them.
 *
 * Backends (by priority):
 *   1. IndexedDB (primary — always available, fastest, never skipped)
 *   2. Steam Cloud — when getSteam().isAvailable() returns true
 *   3. Supabase — when the Supabase client is configured and a userId is known
 *
 * This module is intentionally decoupled from the existing CloudSaveProvider
 * hierarchy.  It is a new, higher-level abstraction designed to sit above all
 * three backends and provide a string-oriented API (serialized JSON in, JSON
 * out) so callers do not need to know which backend ultimately fulfilled the
 * request.
 *
 * Usage:
 *   const provider = createSaveProvider({ userId: authStore.userId });
 *   await provider.save("autosave", JSON.stringify(gameState));
 *   const result = await provider.load("autosave");
 *
 * Steam Cloud notes:
 *   The Steam IPC layer (SteamInterface) uses numeric slot indices.  We map
 *   named slots to numbers:
 *     "autosave" → slot 0     ("talentscout_autosave.json" conceptually)
 *     "slot_1"   → slot 1     ("talentscout_slot_1.json" conceptually)
 *     "slot_2"   → slot 2     etc.
 *   Non-canonical slot names are rejected before any backend can be touched.
 */

import {
  getSteam,
  isSteamRuntimeConfigured,
} from "@/lib/steam/steamInterface";
import { supabase } from "@/lib/supabase";
import { SupabaseCloudSaveProvider } from "@/lib/supabaseCloudSave";
import {
  saveGame,
  loadGameWithRecovery,
  listSaves,
  deleteSaveAndEnqueueRemoteDeletes,
  commitConflictResolution,
  enqueueSaveSync,
  getSaveSyncTask,
  listSaveArchives,
  listSaveSyncQueue,
  markSaveSyncTaskPending,
  processSaveSyncTask,
  restoreSaveArchive,
  migrateSaveRecord,
  type SaveArchiveSummary,
  type SaveRecoveryNotice,
  type SaveRecord,
  type SaveSyncQueueRecord,
  type SaveSyncTarget,
  type SaveUnavailableNotice,
} from "@/lib/db";
import { captureException } from "@/lib/sentry";
import { mergePersistedPlayerExperience } from "@/lib/playerExperience";
import { SaveMigrationError } from "@/lib/saveEnvelope";
import { createSaveEnvelope } from "@/lib/saveEnvelope";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The source backend that provided or will receive a particular save. */
export type SaveSource = "local" | "steam" | "supabase";

/**
 * A save entry as surfaced by listSaves().
 * Multiple sources may hold the same slotName; callers receive one entry per
 * (slotName, source) pair — deduplication happens at the slotName level only
 * inside load(), which always picks the newest version.
 */
export interface SaveEntry {
  slotName: string;
  slot: number;
  source: SaveSource;
  name: string;
  scoutName: string;
  season: number;
  week: number;
  specialization: string;
  reputation: number;
  savedAt: number; // Unix ms
  /** Present when the newest local generation is corrupt and this row is a verified fallback. */
  recovery?: SaveRecoveryNotice;
  unavailable?: SaveUnavailableNotice;
}

/**
 * Result of a successful load() call.
 * `data` is the raw serialised JSON string exactly as it was stored.
 */
export interface LoadResult {
  data: string;
  source: SaveSource;
  name: string;
  timestamp: number; // Unix ms
  recovery?: SaveRecoveryNotice;
}

export interface ConflictResolutionResult extends LoadResult {
  archived: SaveArchiveSummary;
}

export interface PersistentCloudSyncStatus {
  pendingCount: number;
  failedCount: number;
  lastError: string | null;
  oldestQueuedAt: number | null;
}

export interface SaveOptions {
  waitForCloud?: boolean;
}

/**
 * Describes a conflict between a local save and a cloud save for the same
 * slot.  A conflict exists when the timestamps differ by more than
 * CONFLICT_THRESHOLD_MS.
 *
 * The `preview` field is a short human-readable description of the save
 * (e.g. "Season 3 · Week 22 · Rep 75") to help the player decide which
 * version to keep without loading the full state.
 */
export interface SaveConflict {
  slotName: string;
  local: { timestamp: number; preview: string };
  cloud: { timestamp: number; preview: string; source: "steam" | "supabase" };
}

/** Canonical mirrors share an exact timestamp; any difference is a branch. */
const CONFLICT_THRESHOLD_MS = 0;

// ---------------------------------------------------------------------------
// SaveProvider interface
// ---------------------------------------------------------------------------

export interface SaveProvider {
  /**
   * Persist serialised game data to all available backends.
   * The promise resolves when the primary backend (IndexedDB) has succeeded.
   * Steam Cloud and Supabase writes are fire-and-forget: they do not block
   * the caller and their failures are logged but not re-thrown.
   */
  save(
    slotName: string,
    data: string,
    displayName?: string,
    options?: SaveOptions,
  ): Promise<void>;

  /**
   * Load game data for the given slot.
   * Queries all available backends in parallel and returns the entry with
   * the newest timestamp.  Returns null when the slot is empty everywhere.
   */
  load(slotName: string): Promise<LoadResult | null>;

  /**
   * Load a specific backend copy for the slot instead of automatically
   * choosing the newest source.
   */
  loadFromSource(slotName: string, source: SaveSource): Promise<LoadResult | null>;

  /**
   * List all available saves across every configured backend.
   * Returns one entry per (slotName, source) pair; the list is not
   * deduplicated — a slot that exists in both IndexedDB and Steam will
   * appear twice.  Sorted newest-first by savedAt.
   */
  listSaves(): Promise<SaveEntry[]>;

  /**
   * Commit deletion locally and enqueue an idempotent tombstone for every
   * configured or previously queued remote backend. Offline deletions remain
   * queued and stale remote copies are hidden until retry succeeds.
   */
  delete(slotName: string): Promise<void>;

  /**
   * Compare the local and cloud copies of a save slot.
   * Returns a SaveConflict when the timestamps diverge by more than
   * CONFLICT_THRESHOLD_MS.  Returns null when there is no conflict (or when
   * no cloud backend is available / the slot does not exist in the cloud).
   */
  checkConflict(slotName: string): Promise<SaveConflict | null>;

  /**
   * Resolve a divergence without destroying the unselected branch. The loser
   * is committed to the local recovery journal before any remote overwrite.
   */
  resolveConflict(
    slotName: string,
    preferredSource: SaveSource,
  ): Promise<ConflictResolutionResult>;

  /** Player-visible immutable recovery copies, newest first. */
  listRecoveryCopies(slotName?: string): Promise<SaveArchiveSummary[]>;

  /** Restore a journal generation locally while preserving the displaced head. */
  restoreRecoveryCopy(archiveId: string): Promise<LoadResult>;

  /** Persistent offline queue state; unlike the legacy status it survives reloads. */
  getSyncStatus(): Promise<PersistentCloudSyncStatus>;

  /** Retry every queued backend write that is available in this runtime. */
  retryPendingSync(): Promise<PersistentCloudSyncStatus>;
}

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

export interface SaveProviderOptions {
  /**
   * The authenticated Supabase user ID.
   * When provided (and `supabase` is configured), Supabase will be included
   * as a backend.  When null/undefined, Supabase is skipped entirely.
   */
  userId?: string | null;

  /**
   * Whether Steam Cloud should participate in reads/listing/conflict checks.
   * Defaults to true. Some beta flows intentionally disable Steam reads so
   * Supabase-backed cloud saves do not collide with stale mirrored copies.
   */
  includeSteam?: boolean;
}

// ---------------------------------------------------------------------------
// Slot name ↔ number mapping
// ---------------------------------------------------------------------------

/**
 * Maps a string slot name to the numeric index used by the IndexedDB and
 * Steam Cloud APIs.
 *
 * Convention:
 *   "autosave"  → 0
 *   "slot_1"    → 1
 *   "slot_2"    → 2
 *   "slot_3"    → 3
 *   "slot_4"    → 4
 *   "slot_5"    → 5
 *
 * The numeric slot feeds directly into db.saveGame() and
 * SteamInterface.setCloudSave() / getCloudSave().
 */
function slotNameToNumber(slotName: string): number {
  if (slotName === "autosave") return 0;
  const match = /^slot_([1-5])$/.exec(slotName);
  if (match) return Number(match[1]);
  throw new RangeError(
    `Unknown save slot "${slotName}". Expected autosave or slot_1 through slot_5.`,
  );
}

/**
 * Inverse mapping — converts a numeric slot to its canonical string name.
 * Used when reading saves from backends that return numeric slot indices.
 */
function slotNumberToName(slot: number): string {
  if (slot === 0) return "autosave";
  return `slot_${slot}`;
}

// ---------------------------------------------------------------------------
// Helpers — Steam
// ---------------------------------------------------------------------------

/**
 * Parse the timestamp from a validated, supported Steam Cloud save record.
 * Future or corrupt records are deliberately excluded from conflict choices.
 *
 * Returns null when the blob is missing, empty, or malformed.
 */
/**
 * Build a short preview string from a SaveRecord-shaped blob.
 * Falls back to a generic label when the shape is unexpected.
 */
function buildPreview(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const r = parsed as Record<string, unknown>;
      const season =
        typeof r["season"] === "number"
          ? r["season"]
          : typeof r["currentSeason"] === "number"
            ? r["currentSeason"]
            : "?";
      const week =
        typeof r["week"] === "number"
          ? r["week"]
          : typeof r["currentWeek"] === "number"
            ? r["currentWeek"]
            : "?";
      const scout =
        typeof r["scout"] === "object" && r["scout"] !== null
          ? (r["scout"] as Record<string, unknown>)
          : null;
      const rep =
        typeof r["reputation"] === "number"
          ? r["reputation"]
          : typeof scout?.["reputation"] === "number"
            ? scout["reputation"]
            : "?";
      return `Season ${season} · Week ${week} · Rep ${rep}`;
    }
  } catch {
    // Ignore — return fallback below.
  }
  return "Save data";
}

function parseSteamSaveRecord(raw: string | null): SaveRecord | null {
  if (!raw) return null;
  try {
    return migrateSaveRecord(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

interface RecordCandidate {
  record: SaveRecord;
  source: SaveSource;
  recovery?: SaveRecoveryNotice;
}

function candidateToLoadResult(candidate: RecordCandidate): LoadResult {
  return {
    data: JSON.stringify(candidate.record.state),
    source: candidate.source,
    name: candidate.record.name,
    timestamp: candidate.record.savedAt,
    recovery: candidate.recovery,
  };
}

function conflictIdFor(
  slot: number,
  local: SaveRecord,
  cloud: RecordCandidate,
): string {
  return [
    "slot",
    slot,
    "local",
    local.savedAt,
    cloud.source,
    cloud.record.savedAt,
  ].join(":");
}

// A slot can be saved again while an earlier mirror is still in flight.
// Serializing by persisted queue key prevents a slower old upload from
// landing after the newer one and leaving the remote silently stale.
const syncTaskLocks = new Map<string, Promise<void>>();

function serializeSyncTask<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = syncTaskLocks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(work);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  syncTaskLocks.set(key, settled);
  return run.finally(() => {
    if (syncTaskLocks.get(key) === settled) syncTaskLocks.delete(key);
  });
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class SaveProviderImpl implements SaveProvider {
  private readonly userId: string | null;
  private readonly includeSteam: boolean;

  constructor(options: SaveProviderOptions) {
    this.userId = options.userId ?? null;
    this.includeSteam = options.includeSteam ?? true;
  }

  private configuredSyncTargets(): SaveSyncTarget[] {
    const targets: SaveSyncTarget[] = [];
    const steam = getSteam();
    // The packaged Steam target remains configured while the client is
    // offline or its asynchronous initialization is still resolving. Enqueue
    // first; uploadQueuedRecord will fail safely and retain the task for retry.
    if (
      this.includeSteam
      && (isSteamRuntimeConfigured() || steam.isAvailable())
    ) {
      targets.push("steam");
    }
    if (supabase && this.userId) targets.push("supabase");
    return targets;
  }

  private async uploadQueuedRecord(
    target: SaveSyncTarget,
    record: SaveRecord,
  ): Promise<void> {
    if (target === "steam") {
      const steam = getSteam();
      if (!this.includeSteam || !steam.isAvailable()) {
        throw new Error("Steam Cloud is unavailable. The local save remains queued.");
      }
      await steam.setCloudSave(record.slot, JSON.stringify(record));
      return;
    }

    if (!supabase || !this.userId) {
      throw new Error("Cloud sync is unavailable. The local save remains queued.");
    }
    const cloud = new SupabaseCloudSaveProvider(this.userId);
    await cloud.uploadSave(
      record.slot,
      record.state,
      record.name,
      record.savedAt,
    );
  }

  private async deleteQueuedRemote(target: SaveSyncTarget, slot: number): Promise<void> {
    if (target === "steam") {
      const steam = getSteam();
      if (!this.includeSteam || !steam.isAvailable()) {
        throw new Error("Steam Cloud is unavailable. The deletion remains queued.");
      }
      await steam.deleteCloudSave(slot);
      return;
    }

    if (!supabase || !this.userId) {
      throw new Error("Cloud sync is unavailable. The deletion remains queued.");
    }
    const cloud = new SupabaseCloudSaveProvider(this.userId);
    await cloud.deleteCloudSave(slot);
  }

  private async processQueuedTask(task: SaveSyncQueueRecord): Promise<boolean> {
    return serializeSyncTask(task.id, async () => {
      const outcome = await processSaveSyncTask(task.id, (current) =>
        current.operation === "upload"
          ? this.uploadQueuedRecord(current.target, current.record)
          : this.deleteQueuedRemote(current.target, current.slot),
      );
      if (outcome === "failed") {
        const queue = await listSaveSyncQueue();
        const failed = queue.find((entry) => entry.id === task.id);
        const error = failed?.lastError ?? `${task.target} sync failed`;
        markCloudSyncFailed(error);
        captureException(new Error(error));
        return false;
      }
      if (outcome === "synced") markCloudSyncComplete();
      return true;
    });
  }

  private async hasPendingDelete(
    target: SaveSyncTarget,
    slot: number,
  ): Promise<boolean> {
    return (await getSaveSyncTask(target, slot))?.operation === "delete";
  }

  private async mirrorRecord(
    record: SaveRecord,
    waitForCloud: boolean,
    requestedTargets?: readonly SaveSyncTarget[],
  ): Promise<void> {
    const configured = new Set(this.configuredSyncTargets());
    const targets = requestedTargets
      ? requestedTargets.filter((target) => configured.has(target))
      : [...configured];
    if (targets.length === 0) return;

    const tasks: SaveSyncQueueRecord[] = [];
    for (const target of targets) {
      tasks.push(await enqueueSaveSync(record, target));
    }
    markCloudSyncPending();

    const upload = async () => {
      const outcomes = await Promise.all(
        tasks.map((task) => this.processQueuedTask(task)),
      );
      if (outcomes.some((succeeded) => !succeeded)) {
        throw new Error(
          "The save is safe locally, but one or more cloud copies remain queued.",
        );
      }
    };

    if (waitForCloud) {
      await upload();
    } else {
      void upload().catch((error: unknown) => {
        console.warn("SaveProvider: remote mirror remains queued:", error);
      });
    }
  }

  // -------------------------------------------------------------------------
  // save
  // -------------------------------------------------------------------------

  async save(
    slotName: string,
    data: string,
    displayName?: string,
    options?: SaveOptions,
  ): Promise<void> {
    const slot = slotNameToNumber(slotName);

    // ---- Primary write: IndexedDB (must succeed before we return) ----------
    //
    // IndexedDB owns the one canonical write migration. Remote backends then
    // receive that exact migrated snapshot rather than independently
    // interpreting the caller's JSON.
    const saveName =
      displayName ?? (slotName === "autosave" ? "Autosave" : `Save ${slot}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch (err) {
      throw new Error(
        `SaveProvider.save: invalid save data for slot "${slotName}": ${String(err)}`,
      );
    }

    let record: SaveRecord;
    try {
      record = await saveGame(slot, saveName, parsed);
    } catch (err) {
      if (err instanceof SaveMigrationError) {
        throw new Error(
          `SaveProvider.save: invalid save data for slot "${slotName}": ${err.message}`,
        );
      }
      throw err;
    }

    // The queue row commits before upload begins, so going offline or closing
    // the app cannot turn a successful local save into an untracked cloud gap.
    await this.mirrorRecord(record, options?.waitForCloud ?? false);
  }

  // -------------------------------------------------------------------------
  // load
  // -------------------------------------------------------------------------

  async load(slotName: string): Promise<LoadResult | null> {
    const slot = slotNameToNumber(slotName);

    // Gather candidates from all available backends in parallel.
    const candidates = await Promise.all([
      this._loadLocalRecord(slot),
      this._loadSteamRecord(slot),
      this._loadSupabaseRecord(slot),
    ]);

    // Pick the candidate with the newest timestamp.
    let best: RecordCandidate | null = null;
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (!best || candidate.record.savedAt > best.record.savedAt) {
        best = candidate;
      }
    }

    if (!best) return null;
    mergePersistedPlayerExperience(best.record.playerExperience);
    return candidateToLoadResult(best);
  }

  async loadFromSource(
    slotName: string,
    source: SaveSource,
  ): Promise<LoadResult | null> {
    const slot = slotNameToNumber(slotName);
    const candidate = await this._loadRecordFromSource(slot, source);
    if (!candidate) return null;
    mergePersistedPlayerExperience(candidate.record.playerExperience);
    return candidateToLoadResult(candidate);
  }

  private _loadRecordFromSource(
    slot: number,
    source: SaveSource,
  ): Promise<RecordCandidate | null> {
    switch (source) {
      case "local":
        return this._loadLocalRecord(slot);
      case "steam":
        return this._loadSteamRecord(slot);
      case "supabase":
        return this._loadSupabaseRecord(slot);
    }
  }

  private async _loadLocalRecord(slot: number): Promise<RecordCandidate | null> {
    try {
      const loaded = await loadGameWithRecovery(slot);
      if (!loaded) return null;
      return {
        source: "local",
        record: loaded.record,
        recovery: loaded.recovery,
      };
    } catch (err) {
      console.warn("SaveProvider: IndexedDB load error:", err);
      captureException(err);
      return null;
    }
  }

  private async _loadSteamRecord(slot: number): Promise<RecordCandidate | null> {
    if (!this.includeSteam) return null;
    if (await this.hasPendingDelete("steam", slot)) return null;
    const steam = getSteam();
    if (!steam.isAvailable()) return null;

    try {
      const raw = await steam.getCloudSave(slot);
      const record = parseSteamSaveRecord(raw);
      if (!record) return null;
      return {
        source: "steam",
        record,
      };
    } catch (err) {
      console.warn("SaveProvider: Steam Cloud load error:", err);
      captureException(err);
      return null;
    }
  }

  private async _loadSupabaseRecord(slot: number): Promise<RecordCandidate | null> {
    if (!supabase || !this.userId) return null;
    if (await this.hasPendingDelete("supabase", slot)) return null;

    try {
      const supabaseProvider = new SupabaseCloudSaveProvider(this.userId);
      // We need the timestamp alongside the state.  Fetch metadata first,
      // then download the full state only when a record exists.
      const metas = await supabaseProvider.listCloudSaves();
      const meta = metas.find((m) => m.slot === slot);
      if (!meta) return null;

      const state = await supabaseProvider.downloadSave(slot);
      if (!state) return null;

      const envelope = createSaveEnvelope(state, meta.savedAt);
      const record = migrateSaveRecord({
        ...envelope,
        slot: meta.slot,
        name: meta.name,
        season: meta.season,
        week: meta.week,
        scoutName: meta.scoutName,
        specialization: meta.specialization,
        reputation: meta.reputation,
      });
      return { source: "supabase", record };
    } catch (err) {
      console.warn("SaveProvider: Supabase load error:", err);
      captureException(err);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // listSaves
  // -------------------------------------------------------------------------

  async listSaves(): Promise<SaveEntry[]> {
    const results = await Promise.allSettled([
      this._listFromLocal(),
      this._listFromSteam(),
      this._listFromSupabase(),
    ]);

    const entries: SaveEntry[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        entries.push(...result.value);
      }
      // Rejected promises are silently skipped — a backend being unavailable
      // should not prevent the others from returning their results.
    }

    // Sort newest-first.
    entries.sort((a, b) => b.savedAt - a.savedAt);
    return entries;
  }

  private async _listFromLocal(): Promise<SaveEntry[]> {
    const records = await listSaves();
    return records.map((r) => ({
      slotName: slotNumberToName(r.slot),
      slot: r.slot,
      source: "local" as const,
      name: r.name,
      scoutName: r.scoutName,
      season: r.season,
      week: r.week,
      specialization: r.specialization,
      reputation: r.reputation,
      savedAt: r.savedAt,
      recovery: r.recovery,
      unavailable: r.unavailable,
    }));
  }

  private async _listFromSteam(): Promise<SaveEntry[]> {
    if (!this.includeSteam) return [];
    const steam = getSteam();
    if (!steam.isAvailable()) return [];

    // Steam save reads are intentionally sequential. Each read owns a bounded
    // main-process transfer; parallel probing can exceed that capacity and make
    // valid cloud slots disappear from the list.
    const KNOWN_SLOTS = [0, 1, 2, 3, 4, 5] as const;
    const entries: SaveEntry[] = [];
    for (const slot of KNOWN_SLOTS) {
      try {
        if (await this.hasPendingDelete("steam", slot)) continue;
        const raw = await steam.getCloudSave(slot);
        const record = parseSteamSaveRecord(raw);
        if (!record) continue;
        entries.push({
          slotName: slotNumberToName(slot),
          slot: record.slot,
          source: "steam" as const,
          name: record.name,
          scoutName: record.scoutName,
          season: record.season,
          week: record.week,
          specialization: record.specialization,
          reputation: record.reputation,
          savedAt: record.savedAt,
        });
      } catch (error) {
        console.warn(`SaveProvider: Steam Cloud slot ${slot} list error:`, error);
        captureException(error);
      }
    }
    return entries;
  }

  private async _listFromSupabase(): Promise<SaveEntry[]> {
    if (!supabase || !this.userId) return [];
    const supabaseProvider = new SupabaseCloudSaveProvider(this.userId);
    const metas = await supabaseProvider.listCloudSaves();
    const entries = await Promise.all(
      metas.map(async (m) => {
        if (await this.hasPendingDelete("supabase", m.slot)) return null;
        return {
          slotName: slotNumberToName(m.slot),
          slot: m.slot,
          source: "supabase" as const,
          name: m.name,
          scoutName: m.scoutName,
          season: m.season,
          week: m.week,
          specialization: m.specialization,
          reputation: m.reputation,
          savedAt: m.savedAt,
        };
      }),
    );
    return entries.filter(
      (entry): entry is NonNullable<(typeof entries)[number]> => entry !== null,
    );
  }

  // -------------------------------------------------------------------------
  // checkConflict
  // -------------------------------------------------------------------------

  async checkConflict(slotName: string): Promise<SaveConflict | null> {
    const slot = slotNameToNumber(slotName);

    const local = await this._loadLocalRecord(slot);
    if (!local) return null;

    const cloudCandidates = await Promise.all([
      this._loadSteamRecord(slot),
      this._loadSupabaseRecord(slot),
    ]);
    for (const cloud of cloudCandidates) {
      if (!cloud) continue;
      if (
        Math.abs(cloud.record.savedAt - local.record.savedAt)
        <= CONFLICT_THRESHOLD_MS
      ) {
        continue;
      }
      return {
        slotName,
        local: {
          timestamp: local.record.savedAt,
          preview: buildPreview(JSON.stringify(local.record.state)),
        },
        cloud: {
          timestamp: cloud.record.savedAt,
          preview: buildPreview(JSON.stringify(cloud.record.state)),
          source: cloud.source as "steam" | "supabase",
        },
      };
    }
    return null;

  }

  async resolveConflict(
    slotName: string,
    preferredSource: SaveSource,
  ): Promise<ConflictResolutionResult> {
    const slot = slotNameToNumber(slotName);
    const conflict = await this.checkConflict(slotName);
    if (!conflict) {
      throw new Error("This save no longer has a conflict. Refresh the save list.");
    }
    if (preferredSource !== "local" && preferredSource !== conflict.cloud.source) {
      throw new Error("The selected cloud copy is no longer part of this conflict.");
    }

    let [local, cloud] = await Promise.all([
      this._loadLocalRecord(slot),
      this._loadRecordFromSource(slot, conflict.cloud.source),
    ]);
    if (!local || !cloud) {
      throw new Error("One side of the save conflict disappeared. Refresh before choosing.");
    }
    if (
      local.record.savedAt !== conflict.local.timestamp
      || cloud.record.savedAt !== conflict.cloud.timestamp
    ) {
      throw new Error("This conflict changed while it was open. Review the updated copies.");
    }

    if (local.recovery) {
      // A conflict decision must never operate against corrupt head bytes.
      // Promote the verified generation first, then re-check the remote branch
      // before atomically archiving whichever valid branch the player rejects.
      const restored = await restoreSaveArchive(local.recovery.archiveId);
      const refreshedCloud = await this._loadRecordFromSource(
        slot,
        conflict.cloud.source,
      );
      if (
        !refreshedCloud
        || refreshedCloud.record.savedAt !== conflict.cloud.timestamp
      ) {
        throw new Error(
          "The cloud save changed while the verified local recovery was restored. Review the updated copies.",
        );
      }
      local = { source: "local", record: restored };
      cloud = refreshedCloud;
    }

    const selected = preferredSource === "local" ? local : cloud;
    const losing = preferredSource === "local" ? cloud : local;
    const commit = await commitConflictResolution({
      conflictId: conflictIdFor(slot, local.record, cloud),
      slot,
      expectedLocalTimestamp: local.record.savedAt,
      selectedSource: selected.source,
      losingSource: losing.source,
      selected: selected.record,
      losing: losing.record,
    });

    // Resolve only the branch the player reviewed. A second divergent remote
    // remains untouched and will receive its own conflict prompt.
    await this.mirrorRecord(commit.selected, true, [conflict.cloud.source]);
    mergePersistedPlayerExperience(commit.selected.playerExperience);
    return {
      ...candidateToLoadResult({ source: "local", record: commit.selected }),
      archived: commit.archive,
    };
  }

  async listRecoveryCopies(slotName?: string): Promise<SaveArchiveSummary[]> {
    return listSaveArchives(
      slotName === undefined ? undefined : slotNameToNumber(slotName),
    );
  }

  async restoreRecoveryCopy(archiveId: string): Promise<LoadResult> {
    const record = await restoreSaveArchive(archiveId);
    // Restoring selects canonical history. Queue that exact record for each
    // configured remote so an older cloud branch cannot silently reappear.
    // The local restore remains successful while an offline mirror is retried.
    await this.mirrorRecord(record, false);
    mergePersistedPlayerExperience(record.playerExperience);
    return candidateToLoadResult({ source: "local", record });
  }

  async getSyncStatus(): Promise<PersistentCloudSyncStatus> {
    const queue = await listSaveSyncQueue();
    const failed = queue.filter((task) => task.status === "failed");
    return {
      pendingCount: queue.length,
      failedCount: failed.length,
      lastError: failed.at(-1)?.lastError ?? null,
      oldestQueuedAt: queue[0]?.createdAt ?? null,
    };
  }

  async retryPendingSync(): Promise<PersistentCloudSyncStatus> {
    const available = new Set(this.configuredSyncTargets());
    const queue = await listSaveSyncQueue();
    const retryable = queue.filter((task) => available.has(task.target));
    if (retryable.length > 0) markCloudSyncPending();
    for (const task of retryable) {
      const pending = await markSaveSyncTaskPending(task.id);
      if (pending) await this.processQueuedTask(pending);
    }
    return this.getSyncStatus();
  }

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  async delete(slotName: string): Promise<void> {
    const slot = slotNameToNumber(slotName);
    const configured = new Set(this.configuredSyncTargets());
    const tombstones = await deleteSaveAndEnqueueRemoteDeletes(
      slot,
      [...configured],
    );
    const retryable = tombstones.filter((task) => configured.has(task.target));
    if (retryable.length === 0) return;

    markCloudSyncPending();
    // Local deletion is already committed. Remote failures deliberately do
    // not reject this operation: their tombstones stay visible in sync status,
    // suppress stale cloud reads, and can be retried after reconnecting.
    await Promise.all(retryable.map((task) => this.processQueuedTask(task)));
  }
}

// ---------------------------------------------------------------------------
// Cloud sync status tracking
// ---------------------------------------------------------------------------

interface CloudSyncStatus {
  lastSync: Date | null;
  pending: boolean;
  lastError: string | null;
}

let _cloudSyncStatus: CloudSyncStatus = {
  lastSync: null,
  pending: false,
  lastError: null,
};

export function getLastCloudSyncStatus(): CloudSyncStatus {
  return { ..._cloudSyncStatus };
}

function markCloudSyncPending(): void {
  _cloudSyncStatus = { ..._cloudSyncStatus, pending: true, lastError: null };
}

function markCloudSyncComplete(): void {
  _cloudSyncStatus = { lastSync: new Date(), pending: false, lastError: null };
}

function markCloudSyncFailed(error?: unknown): void {
  const message = error instanceof Error ? error.message : error ? String(error) : "Cloud sync failed";
  _cloudSyncStatus = { ..._cloudSyncStatus, pending: false, lastError: message };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a SaveProvider instance configured for the current environment.
 *
 * The returned provider automatically discovers which backends are available
 * (IndexedDB always, Steam when in Electron, Supabase when userId is given)
 * and routes reads/writes accordingly.
 *
 * Call this once per session (e.g. in the auth store after sign-in) and
 * share the instance across the application.
 *
 * @example
 *   const provider = createSaveProvider({ userId: authStore.userId });
 *   await provider.save("autosave", JSON.stringify(gameState));
 */
export function createSaveProvider(options: SaveProviderOptions = {}): SaveProvider {
  return new SaveProviderImpl(options);
}
