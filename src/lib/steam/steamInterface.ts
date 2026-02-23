/**
 * Steamworks integration abstraction layer.
 *
 * Provides a clean interface for Steam features (achievements, cloud saves,
 * player identity) with a no-op implementation for web/dev builds.
 *
 * When building for Steam via Electron/Tauri, replace the factory function
 * to return a real Steamworks SDK implementation.
 */

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SteamInterface {
  /** Returns true if the Steam client is available and initialized. */
  isAvailable(): boolean;

  /** Unlock a Steam achievement by its API name. */
  unlockAchievement(apiName: string): void;

  /** Save data to a Steam Cloud save slot. */
  setCloudSave(slot: number, data: string): Promise<void>;

  /** Load data from a Steam Cloud save slot. Returns null if no data. */
  getCloudSave(slot: number): Promise<string | null>;

  /** Returns the Steam player's display name, or null if unavailable. */
  getPlayerName(): string | null;
}

// ---------------------------------------------------------------------------
// No-op implementation (web/dev builds)
// ---------------------------------------------------------------------------

class NoopSteamInterface implements SteamInterface {
  isAvailable(): boolean {
    return false;
  }

  unlockAchievement(_apiName: string): void {
    // No-op in web builds
  }

  async setCloudSave(_slot: number, _data: string): Promise<void> {
    // No-op in web builds
  }

  async getCloudSave(_slot: number): Promise<string | null> {
    return null;
  }

  getPlayerName(): string | null {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let instance: SteamInterface | null = null;

/**
 * Returns the active Steam interface instance.
 * Currently returns the no-op implementation.
 * Replace with real Steamworks SDK integration when building for Steam.
 */
export function getSteam(): SteamInterface {
  if (!instance) {
    instance = new NoopSteamInterface();
  }
  return instance;
}
