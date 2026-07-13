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
 *   Any unrecognised slot name maps to slot 5 (a reserved overflow slot).
 */

import { getSteam } from "@/lib/steam/steamInterface";
import { supabase } from "@/lib/supabase";
import { SupabaseCloudSaveProvider } from "@/lib/supabaseCloudSave";
import {
  saveGame,
  loadGame,
  listSaves,
  deleteSave,
  migrateSaveRecord,
  migrateSaveState,
  type SaveRecord,
} from "@/lib/db";
import { captureException } from "@/lib/sentry";
import { mergePersistedPlayerExperience } from "@/lib/playerExperience";

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

/** How far apart two save timestamps must be before flagging a conflict. */
const CONFLICT_THRESHOLD_MS = 60_000; // 60 seconds

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
   * Delete the slot from all writable backends participating in this provider.
   * Backends that do not support deletion are skipped.
   */
  delete(slotName: string): Promise<void>;

  /**
   * Compare the local and cloud copies of a save slot.
   * Returns a SaveConflict when the timestamps diverge by more than
   * CONFLICT_THRESHOLD_MS.  Returns null when there is no conflict (or when
   * no cloud backend is available / the slot does not exist in the cloud).
   */
  checkConflict(slotName: string): Promise<SaveConflict | null>;
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
 *   "slot_5"    → 5 (also used as the overflow for unrecognised names)
 *
 * The numeric slot feeds directly into db.saveGame() and
 * SteamInterface.setCloudSave() / getCloudSave().
 */
function slotNameToNumber(slotName: string): number {
  if (slotName === "autosave") return 0;
  const match = /^slot_(\d+)$/.exec(slotName);
  if (match) {
    const n = parseInt(match[1]!, 10);
    // Cap at 5 to stay within the defined manual-save range (slots 1-5).
    return Math.min(Math.max(n, 1), 5);
  }
  // Unknown names fall back to slot 5 (the last manual slot) as an overflow.
  return 5;
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
function parseSteamTimestamp(raw: string | null): number | null {
  return parseSteamSaveRecord(raw)?.savedAt ?? null;
}

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
    // db.saveGame() expects a GameState object, so we parse and migrate the
    // raw JSON here.  migrateSaveState() applies backward-compatible defaults
    // and throws when the blob is structurally invalid.
    let state;
    try {
      state = migrateSaveState(JSON.parse(data) as unknown);
    } catch (err) {
      throw new Error(
        `SaveProvider.save: invalid save data for slot "${slotName}": ${String(err)}`,
      );
    }

    const saveName =
      displayName ?? (slotName === "autosave" ? "Autosave" : `Save ${slot}`);
    const record = await saveGame(slot, saveName, state);
    let steamUpload: Promise<void> | null = null;
    const steam = getSteam();
    if (this.includeSteam && steam.isAvailable()) {
      steamUpload = steam
        .setCloudSave(slot, JSON.stringify(record))
        .catch((err: unknown) => {
          console.warn(
            `SaveProvider: Steam Cloud write failed for slot "${slotName}":`,
            err,
          );
          captureException(err);
          if (options?.waitForCloud) throw err;
        });
    }
    // IndexedDB succeeded. Remote providers receive the same versioned record
    // so reads, conflict checks, and deletion share one canonical shape.

    // ---- Secondary write: Supabase ----------------------------------------
    let supabaseUpload: Promise<void> | null = null;
    if (supabase && this.userId) {
      markCloudSyncPending();
      const supabaseProvider = new SupabaseCloudSaveProvider(this.userId);
      supabaseUpload = supabaseProvider
        .uploadSave(slot, state, saveName)
        .then(() => {
          markCloudSyncComplete();
        })
        .catch((err: unknown) => {
          markCloudSyncFailed(err);
          console.warn(
            `SaveProvider: Supabase write failed for slot "${slotName}":`,
            err,
          );
          captureException(err);
          if (options?.waitForCloud) throw err;
        });
    }

    if (options?.waitForCloud) {
      await Promise.all(
        [steamUpload, supabaseUpload].filter(
          (upload): upload is Promise<void> => upload !== null,
        ),
      );
    }
  }

  // -------------------------------------------------------------------------
  // load
  // -------------------------------------------------------------------------

  async load(slotName: string): Promise<LoadResult | null> {
    const slot = slotNameToNumber(slotName);

    // Gather candidates from all available backends in parallel.
    const candidates = await Promise.all([
      this._loadFromLocal(slot),
      this._loadFromSteam(slot),
      this._loadFromSupabase(slot),
    ]);

    // Pick the candidate with the newest timestamp.
    let best: LoadResult | null = null;
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (!best || candidate.timestamp > best.timestamp) {
        best = candidate;
      }
    }

    return best;
  }

  async loadFromSource(
    slotName: string,
    source: SaveSource,
  ): Promise<LoadResult | null> {
    const slot = slotNameToNumber(slotName);

    switch (source) {
      case "local":
        return this._loadFromLocal(slot);
      case "steam":
        return this._loadFromSteam(slot);
      case "supabase":
        return this._loadFromSupabase(slot);
    }
  }

  private async _loadFromLocal(slot: number): Promise<LoadResult | null> {
    try {
      const saves = await listSaves();
      const meta = saves.find((s) => s.slot === slot);
      if (!meta) return null;

      const state = await loadGame(slot);
      if (!state) return null;

      return {
        data: JSON.stringify(state),
        source: "local",
        name: meta.name,
        timestamp: meta.savedAt,
      };
    } catch (err) {
      console.warn("SaveProvider: IndexedDB load error:", err);
      captureException(err);
      return null;
    }
  }

  private async _loadFromSteam(slot: number): Promise<LoadResult | null> {
    if (!this.includeSteam) return null;
    const steam = getSteam();
    if (!steam.isAvailable()) return null;

    try {
      const raw = await steam.getCloudSave(slot);
      const record = parseSteamSaveRecord(raw);
      if (!record) return null;
      mergePersistedPlayerExperience(record.playerExperience);

      return {
        data: JSON.stringify(record.state),
        source: "steam",
        name: record.name,
        timestamp: record.savedAt,
      };
    } catch (err) {
      console.warn("SaveProvider: Steam Cloud load error:", err);
      captureException(err);
      return null;
    }
  }

  private async _loadFromSupabase(slot: number): Promise<LoadResult | null> {
    if (!supabase || !this.userId) return null;

    try {
      const supabaseProvider = new SupabaseCloudSaveProvider(this.userId);
      // We need the timestamp alongside the state.  Fetch metadata first,
      // then download the full state only when a record exists.
      const metas = await supabaseProvider.listCloudSaves();
      const meta = metas.find((m) => m.slot === slot);
      if (!meta) return null;

      const state = await supabaseProvider.downloadSave(slot);
      if (!state) return null;

      return {
        data: JSON.stringify(state),
        source: "supabase",
        name: meta.name,
        timestamp: meta.savedAt,
      };
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
    }));
  }

  private async _listFromSteam(): Promise<SaveEntry[]> {
    if (!this.includeSteam) return [];
    const steam = getSteam();
    if (!steam.isAvailable()) return [];

    // Probe each known slot in parallel.  Steam does not offer a "list all"
    // API, so we check every slot we might have written to (0-5).
    const KNOWN_SLOTS = [0, 1, 2, 3, 4, 5] as const;
    const settled = await Promise.allSettled(
      KNOWN_SLOTS.map(async (slot) => {
        const raw = await steam.getCloudSave(slot);
        const record = parseSteamSaveRecord(raw);
        if (!record) return null;
        return {
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
        };
      }),
    );

    const entries: SaveEntry[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value !== null) {
        entries.push(r.value);
      }
    }
    return entries;
  }

  private async _listFromSupabase(): Promise<SaveEntry[]> {
    if (!supabase || !this.userId) return [];
    const supabaseProvider = new SupabaseCloudSaveProvider(this.userId);
    const metas = await supabaseProvider.listCloudSaves();
    return metas.map((m) => ({
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
    }));
  }

  // -------------------------------------------------------------------------
  // checkConflict
  // -------------------------------------------------------------------------

  async checkConflict(slotName: string): Promise<SaveConflict | null> {
    const slot = slotNameToNumber(slotName);

    // Fetch local metadata (without loading the full state).
    let localTimestamp: number | null = null;
    let localData: string | null = null;
    try {
      const saves = await listSaves();
      const meta = saves.find((s) => s.slot === slot);
      if (meta) {
        localTimestamp = meta.savedAt;
        // Load the full state only so we can generate a preview string.
        const state = await loadGame(slot);
        if (state) {
          localData = JSON.stringify(state);
        }
      }
    } catch {
      // Local read failure — no conflict to report.
      return null;
    }

    if (localTimestamp === null) {
      // No local save exists; nothing to conflict with.
      return null;
    }

    // Check Steam Cloud first (preferred when available).
    const steam = getSteam();
    if (this.includeSteam && steam.isAvailable()) {
      try {
        const raw = await steam.getCloudSave(slot);
        const steamTimestamp = parseSteamTimestamp(raw);
        if (
          steamTimestamp !== null &&
          raw !== null &&
          Math.abs(steamTimestamp - localTimestamp) > CONFLICT_THRESHOLD_MS
        ) {
          return {
            slotName,
            local: {
              timestamp: localTimestamp,
              preview: localData ? buildPreview(localData) : "Local save",
            },
            cloud: {
              timestamp: steamTimestamp,
              preview: buildPreview(raw),
              source: "steam",
            },
          };
        }
      } catch {
        // Steam read failure — fall through to Supabase check.
      }
    }

    // Check Supabase.
    if (supabase && this.userId) {
      try {
        const supabaseProvider = new SupabaseCloudSaveProvider(this.userId);
        const { hasConflict, cloudTimestamp } =
          await supabaseProvider.checkConflict(slot, localTimestamp);

        if (hasConflict && cloudTimestamp !== undefined) {
          // We need the full cloud state to generate a preview.
          const cloudState = await supabaseProvider.downloadSave(slot);
          const cloudPreview = cloudState
            ? buildPreview(JSON.stringify(cloudState))
            : "Cloud save";

          return {
            slotName,
            local: {
              timestamp: localTimestamp,
              preview: localData ? buildPreview(localData) : "Local save",
            },
            cloud: {
              timestamp: cloudTimestamp,
              preview: cloudPreview,
              source: "supabase",
            },
          };
        }
      } catch {
        // Supabase read failure — no conflict to report.
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  async delete(slotName: string): Promise<void> {
    const slot = slotNameToNumber(slotName);
    const tasks: Promise<void>[] = [];

    tasks.push(deleteSave(slot));

    const steam = getSteam();
    if (this.includeSteam && steam.isAvailable()) {
      tasks.push(steam.deleteCloudSave(slot));
    }

    if (supabase && this.userId) {
      const supabaseProvider = new SupabaseCloudSaveProvider(this.userId);
      tasks.push(supabaseProvider.deleteCloudSave(slot));
    }

    await Promise.all(tasks);
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
