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
import { saveGame, loadGame, listSaves, migrateSaveState } from "@/lib/db";

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
  source: SaveSource;
  timestamp: number; // Unix ms
}

/**
 * Result of a successful load() call.
 * `data` is the raw serialised JSON string exactly as it was stored.
 */
export interface LoadResult {
  data: string;
  source: SaveSource;
  timestamp: number; // Unix ms
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
  save(slotName: string, data: string): Promise<void>;

  /**
   * Load game data for the given slot.
   * Queries all available backends in parallel and returns the entry with
   * the newest timestamp.  Returns null when the slot is empty everywhere.
   */
  load(slotName: string): Promise<LoadResult | null>;

  /**
   * List all available saves across every configured backend.
   * Returns one entry per (slotName, source) pair; the list is not
   * deduplicated — a slot that exists in both IndexedDB and Steam will
   * appear twice.  Sorted newest-first by timestamp.
   */
  listSaves(): Promise<SaveEntry[]>;

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
 * Parse the timestamp out of a raw Steam Cloud save blob without fully
 * deserialising the game state.  The Steam backend stores a full SaveRecord
 * JSON object (see db.ts saveGame()), so we only need the `savedAt` field.
 *
 * Returns null when the blob is missing, empty, or malformed.
 */
function parseSteamTimestamp(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "savedAt" in parsed &&
      typeof (parsed as { savedAt: unknown }).savedAt === "number"
    ) {
      return (parsed as { savedAt: number }).savedAt;
    }
  } catch {
    // Malformed JSON — treat as empty.
  }
  return null;
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
      const season = typeof r["season"] === "number" ? r["season"] : "?";
      const week = typeof r["week"] === "number" ? r["week"] : "?";
      const rep =
        typeof r["reputation"] === "number" ? r["reputation"] : "?";
      return `Season ${season} · Week ${week} · Rep ${rep}`;
    }
  } catch {
    // Ignore — return fallback below.
  }
  return "Save data";
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class SaveProviderImpl implements SaveProvider {
  private readonly userId: string | null;

  constructor(options: SaveProviderOptions) {
    this.userId = options.userId ?? null;
  }

  // -------------------------------------------------------------------------
  // save
  // -------------------------------------------------------------------------

  async save(slotName: string, data: string): Promise<void> {
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

    const saveName = slotName === "autosave" ? "Autosave" : `Save ${slot}`;
    await saveGame(slot, saveName, state);
    // IndexedDB succeeded — from here on, secondary writes are fire-and-forget.
    // Note: db.saveGame() already mirrors the canonical SaveRecord envelope to
    // Steam Cloud when Steam is available. Avoid writing `data` again here,
    // which may not include `savedAt` metadata expected by cloud reads.

    // ---- Secondary write: Supabase ----------------------------------------
    if (supabase && this.userId) {
      const supabaseProvider = new SupabaseCloudSaveProvider(this.userId);
      supabaseProvider.uploadSave(slot, state).catch((err: unknown) => {
        console.warn(
          `SaveProvider: Supabase write failed for slot "${slotName}":`,
          err,
        );
      });
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
        timestamp: meta.savedAt,
      };
    } catch (err) {
      console.warn("SaveProvider: IndexedDB load error:", err);
      return null;
    }
  }

  private async _loadFromSteam(slot: number): Promise<LoadResult | null> {
    const steam = getSteam();
    if (!steam.isAvailable()) return null;

    try {
      const raw = await steam.getCloudSave(slot);
      if (!raw) return null;
      const timestamp = parseSteamTimestamp(raw);
      if (timestamp === null) return null;

      return { data: raw, source: "steam", timestamp };
    } catch (err) {
      console.warn("SaveProvider: Steam Cloud load error:", err);
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
        timestamp: meta.savedAt,
      };
    } catch (err) {
      console.warn("SaveProvider: Supabase load error:", err);
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
    entries.sort((a, b) => b.timestamp - a.timestamp);
    return entries;
  }

  private async _listFromLocal(): Promise<SaveEntry[]> {
    const records = await listSaves();
    return records.map((r) => ({
      slotName: slotNumberToName(r.slot),
      source: "local" as const,
      timestamp: r.savedAt,
    }));
  }

  private async _listFromSteam(): Promise<SaveEntry[]> {
    const steam = getSteam();
    if (!steam.isAvailable()) return [];

    // Probe each known slot in parallel.  Steam does not offer a "list all"
    // API, so we check every slot we might have written to (0-5).
    const KNOWN_SLOTS = [0, 1, 2, 3, 4, 5] as const;
    const settled = await Promise.allSettled(
      KNOWN_SLOTS.map(async (slot) => {
        const raw = await steam.getCloudSave(slot);
        const timestamp = parseSteamTimestamp(raw);
        if (timestamp === null) return null;
        return { slotName: slotNumberToName(slot), source: "steam" as const, timestamp };
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
      source: "supabase" as const,
      timestamp: m.savedAt,
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
    if (steam.isAvailable()) {
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
