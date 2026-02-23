/**
 * Steamworks integration abstraction layer.
 *
 * Provides a clean interface for Steam features (achievements, cloud saves,
 * player identity) with a no-op implementation for web/dev builds.
 *
 * When running inside Electron (desktop/Steam builds), the factory
 * automatically returns an ElectronSteamInterface that bridges to the
 * native IPC layer exposed by the preload script.
 */

import { ElectronSteamInterface } from "./electronSteamInterface";

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

  /** Set Steam Rich Presence key/value pair. */
  setRichPresence(key: string, value: string): void;

  /** Reset all Steam achievements (development only). */
  resetAllAchievements(): void;
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

  setRichPresence(_key: string, _value: string): void {
    // No-op in web builds
  }

  resetAllAchievements(): void {
    // No-op in web builds
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let instance: SteamInterface | null = null;

/**
 * Returns the active Steam interface instance.
 *
 * Selection priority:
 *  1. Electron desktop build — window.electronAPI.steam is present → ElectronSteamInterface
 *  2. All other environments (web, SSR) → NoopSteamInterface
 */
export function getSteam(): SteamInterface {
  if (!instance) {
    const isElectron =
      typeof window !== "undefined" &&
      (window as { electronAPI?: { steam?: unknown } }).electronAPI?.steam !==
        undefined;

    if (isElectron) {
      instance = new ElectronSteamInterface();
    } else {
      instance = new NoopSteamInterface();
    }
  }
  return instance;
}
