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
import type { SteamInterface } from "./steamContract";

export type { SteamInterface } from "./steamContract";

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

  async deleteCloudSave(_slot: number): Promise<void> {
    // No-op in web builds
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
 * True when this renderer is running inside the packaged Electron bridge.
 * This is deliberately distinct from Steam client availability: the client
 * can be offline or still initializing while the durable cloud target remains
 * configured and therefore must receive a queued write.
 */
export function isSteamRuntimeConfigured(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as { electronAPI?: { steam?: unknown } }).electronAPI?.steam !==
      undefined
  );
}

/**
 * Returns the active Steam interface instance.
 *
 * Selection priority:
 *  1. Electron desktop build — window.electronAPI.steam is present → ElectronSteamInterface
 *  2. All other environments (web, SSR) → NoopSteamInterface
 */
export function getSteam(): SteamInterface {
  if (!instance) {
    const isElectron = isSteamRuntimeConfigured();

    if (isElectron) {
      instance = new ElectronSteamInterface();
    } else {
      instance = new NoopSteamInterface();
    }
  }
  return instance;
}
