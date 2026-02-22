/**
 * SupabaseCloudSaveProvider — a CloudSaveProvider backed by Supabase PostgreSQL.
 *
 * Implements the CloudSaveProvider interface so it can be used as a drop-in
 * replacement for LocalCloudSaveProvider wherever a cloud-authenticated
 * provider is required.
 *
 * Database table: `save_slots`
 *   id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
 *   user_id     uuid NOT NULL
 *   slot        int  NOT NULL
 *   name        text NOT NULL
 *   scout_name  text NOT NULL
 *   season      int  NOT NULL
 *   week        int  NOT NULL
 *   specialization text NOT NULL
 *   reputation  numeric NOT NULL
 *   saved_at    bigint NOT NULL   -- Unix ms timestamp
 *   state       jsonb NOT NULL
 *   UNIQUE (user_id, slot)
 *
 * Row-Level Security on the table should enforce that users can only read and
 * write rows where user_id = auth.uid().
 */

import { supabase } from "./supabase";
import type { GameState } from "@/engine/core/types";
import { migrateSaveState } from "./db";
import type {
  CloudSaveProvider,
  CloudSaveSlot,
  ConflictResult,
} from "./cloudSave";

// ---------------------------------------------------------------------------
// Row shape returned by Supabase for metadata-only queries
// ---------------------------------------------------------------------------

interface SaveSlotMetaRow {
  slot: number;
  scout_name: string;
  season: number;
  week: number;
  reputation: number | string; // numeric comes back as string in some drivers
  saved_at: number | string;   // bigint comes back as string
}

interface SaveSlotStateRow {
  state: Record<string, unknown>;
}

interface SaveSlotTimestampRow {
  saved_at: number | string;
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class SupabaseCloudSaveProvider implements CloudSaveProvider {
  private readonly userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Always returns true — this class is only instantiated when the user has
   * an active Supabase session.  Callers should not construct this provider
   * without first verifying authentication.
   */
  isAuthenticated(): boolean {
    return true;
  }

  /**
   * Upload (upsert) a game state into the given save slot.
   *
   * Uses Supabase's upsert with `onConflict: "user_id,slot"` so that saving
   * to an occupied slot replaces the existing record rather than inserting a
   * duplicate.  `saved_at` is set to Date.now() on every write so conflict
   * detection downstream always reflects the most recent upload time.
   */
  async uploadSave(slot: number, state: GameState): Promise<void> {
    const { error } = await supabase.from("save_slots").upsert(
      {
        user_id: this.userId,
        slot,
        name: slot === 0 ? "Autosave" : `Save ${slot}`,
        scout_name: `${state.scout.firstName} ${state.scout.lastName}`,
        season: state.currentSeason,
        week: state.currentWeek,
        specialization: state.scout.primarySpecialization,
        reputation: state.scout.reputation,
        saved_at: Date.now(),
        state: state as unknown as Record<string, unknown>,
      },
      { onConflict: "user_id,slot" },
    );

    if (error) throw new Error(`Cloud save failed: ${error.message}`);
  }

  /**
   * Download a previously saved game state from the given slot.
   * Returns null when the slot is empty or does not exist for this user.
   */
  async downloadSave(slot: number): Promise<GameState | null> {
    const { data, error } = await supabase
      .from("save_slots")
      .select("state")
      .eq("user_id", this.userId)
      .eq("slot", slot)
      .maybeSingle<SaveSlotStateRow>();

    if (error) throw new Error(`Cloud load failed: ${error.message}`);
    if (!data) return null;

    return migrateSaveState(data.state);
  }

  /**
   * Return lightweight metadata for all occupied save slots belonging to this
   * user, ordered by most recently saved first.
   */
  async listCloudSaves(): Promise<CloudSaveSlot[]> {
    const { data, error } = await supabase
      .from("save_slots")
      .select("slot, scout_name, season, week, reputation, saved_at")
      .eq("user_id", this.userId)
      .order("saved_at", { ascending: false });

    if (error) throw new Error(`List saves failed: ${error.message}`);

    return (data ?? []).map((row: SaveSlotMetaRow) => ({
      slot: row.slot,
      scoutName: row.scout_name,
      season: row.season,
      week: row.week,
      reputation: Number(row.reputation),
      savedAt: Number(row.saved_at),
    }));
  }

  /**
   * Permanently delete the cloud save in the given slot for this user.
   * No-ops silently when the slot does not exist (RLS will filter the delete
   * to only affect rows owned by this user).
   */
  async deleteCloudSave(slot: number): Promise<void> {
    const { error } = await supabase
      .from("save_slots")
      .delete()
      .eq("user_id", this.userId)
      .eq("slot", slot);

    if (error) throw new Error(`Delete save failed: ${error.message}`);
  }

  /**
   * Compare a local save's timestamp against the cloud version for the same
   * slot.  A conflict exists when the cloud version is newer than the local
   * version, meaning another device has written to this slot more recently.
   *
   * Returns `{ hasConflict: false }` when the slot has no cloud save yet or
   * the local version is at least as recent as the cloud version.
   */
  async checkConflict(
    slot: number,
    localTimestamp: number,
  ): Promise<ConflictResult> {
    const { data, error } = await supabase
      .from("save_slots")
      .select("saved_at")
      .eq("user_id", this.userId)
      .eq("slot", slot)
      .maybeSingle<SaveSlotTimestampRow>();

    if (error || !data) return { hasConflict: false };

    const cloudTimestamp = Number(data.saved_at);

    if (cloudTimestamp > localTimestamp) {
      return { hasConflict: true, cloudTimestamp, localTimestamp };
    }

    return { hasConflict: false };
  }
}
