/**
 * Electron-backed Steam interface implementation.
 *
 * Bridges the synchronous SteamInterface API to Electron's async IPC layer.
 * For synchronous methods (isAvailable, getPlayerName) we eagerly pre-fetch
 * the values via IPC and cache them; the interface contract is met immediately
 * after the first resolution, which happens before any meaningful game action.
 *
 * Falls back gracefully to no-op behaviour if window.electronAPI is undefined
 * (e.g. plain web builds that somehow import this module).
 */

import type { SteamInterface } from "./steamInterface";

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function hasElectronAPI(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as { electronAPI?: unknown }).electronAPI !== "undefined" &&
    (window as { electronAPI?: { steam?: unknown } }).electronAPI?.steam !==
      undefined
  );
}

function api() {
  return (window as unknown as { electronAPI: NonNullable<Window["electronAPI"]> }).electronAPI;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ElectronSteamInterface implements SteamInterface {
  /** Cached result of the async steam:isAvailable IPC call. */
  private _available = false;

  /** Cached result of the async steam:getPlayerName IPC call. */
  private _playerName: string | null = null;

  constructor() {
    if (!hasElectronAPI()) return;

    // Eagerly populate synchronous caches.
    api()
      .steam.isAvailable()
      .then((result: boolean) => {
        this._available = result;
      })
      .catch(() => {
        this._available = false;
      });

    api()
      .steam.getPlayerName()
      .then((name: string) => {
        this._playerName = name ?? null;
      })
      .catch(() => {
        this._playerName = null;
      });
  }

  // -------------------------------------------------------------------------
  // SteamInterface implementation
  // -------------------------------------------------------------------------

  isAvailable(): boolean {
    return this._available;
  }

  unlockAchievement(apiName: string): void {
    if (!hasElectronAPI()) return;
    // Fire-and-forget — the interface contract is void, not Promise<void>.
    api().steam.unlockAchievement(apiName).catch((err: unknown) => {
      console.warn("[ElectronSteam] unlockAchievement failed:", err);
    });
  }

  async setCloudSave(slot: number, data: string): Promise<void> {
    if (!hasElectronAPI()) return;
    await api().steam.setCloudSave(String(slot), data);
  }

  async getCloudSave(slot: number): Promise<string | null> {
    if (!hasElectronAPI()) return null;
    return api().steam.getCloudSave(String(slot));
  }

  getPlayerName(): string | null {
    return this._playerName;
  }

  setRichPresence(key: string, value: string): void {
    if (!hasElectronAPI()) return;
    // Fire-and-forget — the interface contract is void, not Promise<void>.
    api().steam.setRichPresence(key, value).catch((err: unknown) => {
      console.warn("[ElectronSteam] setRichPresence failed:", err);
    });
  }

  resetAllAchievements(): void {
    if (!hasElectronAPI()) return;
    // Fire-and-forget — IPC handler may not yet exist in main.js; fails silently.
    (api().steam as unknown as { resetAllAchievements?: () => Promise<void> })
      .resetAllAchievements?.()
      ?.catch((err: unknown) => {
        console.warn("[ElectronSteam] resetAllAchievements failed:", err);
      });
  }
}
