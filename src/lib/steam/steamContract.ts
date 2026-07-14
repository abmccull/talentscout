/** Stable contract shared by platform adapters and the runtime factory. */
export interface SteamInterface {
  /** Returns true if the Steam client is available and initialized. */
  isAvailable(): boolean;

  /** Unlock a Steam achievement by its API name. */
  unlockAchievement(apiName: string): void;

  /** Save data to a Steam Cloud save slot. */
  setCloudSave(slot: number, data: string): Promise<void>;

  /** Load data from a Steam Cloud save slot. Returns null if no data. */
  getCloudSave(slot: number): Promise<string | null>;

  /** Delete data from a Steam Cloud save slot. Missing slots are a no-op. */
  deleteCloudSave(slot: number): Promise<void>;

  /** Returns the Steam player's display name, or null if unavailable. */
  getPlayerName(): string | null;

  /** Set Steam Rich Presence key/value pair. */
  setRichPresence(key: string, value: string): void;

  /** Reset all Steam achievements (development only). */
  resetAllAchievements(): void;
}
