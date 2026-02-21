/**
 * LocalCloudSaveProvider — a CloudSaveProvider backed by IndexedDB.
 *
 * This is the default save provider used when the user is not signed in to a
 * cloud account.  All operations delegate directly to the existing db.ts
 * helpers, so save data stays on-device inside the Dexie/IndexedDB store.
 *
 * When Supabase auth is added, swap this provider for SupabaseCloudSaveProvider
 * inside the auth store or wherever the active provider is injected.
 */

import type { GameState } from "@/engine/core/types";
import type { CloudSaveProvider, CloudSaveSlot, ConflictResult } from "@/lib/cloudSave";
import { saveGame, loadGame, listSaves, deleteSave } from "@/lib/db";

export class LocalCloudSaveProvider implements CloudSaveProvider {
  /**
   * The local provider is never "authenticated" — it has no remote identity.
   * UI layers should check this to decide whether to show cloud-sync controls.
   */
  isAuthenticated(): boolean {
    return false;
  }

  /**
   * Writes the game state to IndexedDB under the given slot.
   * The save name defaults to "Manual Save" for numbered slots, matching the
   * convention used elsewhere in the codebase.  Slot 0 is the autosave slot.
   */
  async uploadSave(slot: number, state: GameState): Promise<void> {
    const name = slot === 0 ? "Autosave" : "Manual Save";
    await saveGame(slot, name, state);
  }

  /**
   * Reads a game state from IndexedDB for the given slot.
   * Returns null when the slot is empty.
   */
  async downloadSave(slot: number): Promise<GameState | null> {
    return loadGame(slot);
  }

  /**
   * Returns lightweight metadata for all occupied save slots, mapped from
   * the full SaveRecord shape that db.listSaves() returns.
   */
  async listCloudSaves(): Promise<CloudSaveSlot[]> {
    const records = await listSaves();
    return records.map((record) => ({
      slot: record.slot,
      scoutName: record.scoutName,
      season: record.season,
      week: record.week,
      reputation: record.reputation,
      savedAt: record.savedAt,
    }));
  }

  /**
   * Removes the given slot from IndexedDB.
   */
  async deleteCloudSave(slot: number): Promise<void> {
    await deleteSave(slot);
  }

  /**
   * The local provider has no remote to conflict with, so it always reports
   * no conflict.  A future Supabase implementation will compare timestamps
   * against the server record.
   */
  async checkConflict(
    _slot: number,
    _localTimestamp: number,
  ): Promise<ConflictResult> {
    return { hasConflict: false };
  }
}

/**
 * Singleton instance of the local provider.
 * Import this directly when you need a ready-to-use provider without going
 * through the auth store (e.g. in tests or server-side utilities).
 */
export const localCloudSaveProvider = new LocalCloudSaveProvider();
