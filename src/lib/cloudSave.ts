/**
 * Cloud save abstraction layer.
 *
 * Defines the provider interface that all save backends must implement.
 * The local (IndexedDB) implementation is used by default until a cloud
 * backend (e.g. Supabase) is configured.
 */

import type { GameState } from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

/**
 * Metadata for a single save slot as stored in the cloud.
 * Mirrors the shape of SaveRecord (minus the full state blob) so the UI
 * can render a save list without downloading the full payload.
 */
export interface CloudSaveSlot {
  slot: number;
  scoutName: string;
  season: number;
  week: number;
  reputation: number;
  savedAt: number; // Unix ms timestamp
}

/**
 * Result of a conflict check between a local and cloud save for the same slot.
 * When hasConflict is true, both timestamps are present so the UI can offer
 * the player a choice of which version to keep.
 */
export interface ConflictResult {
  hasConflict: boolean;
  /** Unix ms timestamp of the cloud version (present when hasConflict is true). */
  cloudTimestamp?: number;
  /** Unix ms timestamp of the local version (present when hasConflict is true). */
  localTimestamp?: number;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * CloudSaveProvider defines the contract every save backend must fulfil.
 *
 * Implementations:
 *  - LocalCloudSaveProvider  (src/lib/localCloudSave.ts) — delegates to IndexedDB,
 *    used as the default before authentication is configured.
 *  - SupabaseCloudSaveProvider (future) — persists to Supabase storage / database.
 */
export interface CloudSaveProvider {
  /** Returns true when the user has an active cloud session. */
  isAuthenticated(): boolean;

  /**
   * Persist a game state to the given slot number.
   * Implementations should update an internal "savedAt" timestamp as part of
   * the write so subsequent conflict checks reflect the latest upload time.
   */
  uploadSave(slot: number, state: GameState): Promise<void>;

  /**
   * Retrieve a previously uploaded save from the given slot.
   * Returns null when the slot is empty or cannot be found.
   */
  downloadSave(slot: number): Promise<GameState | null>;

  /**
   * Return lightweight metadata for all occupied save slots, sorted by
   * savedAt descending (most recent first).
   */
  listCloudSaves(): Promise<CloudSaveSlot[]>;

  /** Permanently remove a cloud save for the given slot. */
  deleteCloudSave(slot: number): Promise<void>;

  /**
   * Compare a local save's timestamp against the cloud version for the same
   * slot and report whether a conflict exists.
   *
   * A conflict means the cloud version was saved more recently than the local
   * version (i.e. another device wrote to the same slot), and the player
   * should be prompted to choose which version to keep.
   */
  checkConflict(slot: number, localTimestamp: number): Promise<ConflictResult>;
}
