/**
 * AudioEngine — singleton managing music, SFX, and ambience channels via Howler.js.
 *
 * SSR-safe: all Howler access is guarded by `typeof window !== "undefined"`.
 * Volume state is persisted to localStorage under STORAGE_KEY.
 */

// Howler is a client-only library. Import the type only so SSR bundles stay clean.
import type { Howl as HowlType } from "howler";

export type AudioChannel = "music" | "sfx" | "ambience";

export interface VolumeState {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  muted: boolean;
}

type ChangeListener = (volumes: VolumeState) => void;

const STORAGE_KEY = "talentscout_audio";

const DEFAULT_VOLUMES: VolumeState = {
  master: 0.8,
  music: 0.6,
  sfx: 1.0,
  ambience: 0.4,
  muted: false,
};

const CROSSFADE_DURATION_MS = 1000;

export class AudioEngine {
  private static instance: AudioEngine;

  private volumes: VolumeState;
  private currentMusic: HowlType | null = null;
  private currentAmbience: HowlType | null = null;
  /** Track IDs so we can skip re-loading the same track. */
  private musicId: string | null = null;
  private ambienceId: string | null = null;
  /** Deferred playback requests while audio assets are still lazy-loading. */
  private pendingMusicId: string | null = null;
  private pendingAmbienceId: string | null = null;

  private listeners = new Set<ChangeListener>();

  private constructor() {
    this.volumes = this.loadVolumes();
  }

  static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  // ── Subscription (for React useSyncExternalStore) ──────────────────────────

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((l) => l(this.volumes));
  }

  // ── Playback ───────────────────────────────────────────────────────────────

  playMusic(trackId: string): void {
    if (!this.isBrowserEnv()) return;
    if (this.musicId === trackId && this.currentMusic?.playing()) return;

    const assets = this.getAssets();
    if (!assets) {
      this.pendingMusicId = trackId;
      this._assetsLoading
        ?.then(() => {
          // Only honor the latest pending request.
          if (this.pendingMusicId === trackId) {
            this.pendingMusicId = null;
            this.playMusic(trackId);
          }
        })
        .catch((err) => {
          console.warn("[AudioEngine] Failed to load audio assets:", err);
        });
      return;
    }
    this.pendingMusicId = null;
    const nextHowl = assets.getHowl(trackId, "music");
    this.crossfade(this.currentMusic, nextHowl, "music");
    this.currentMusic = nextHowl;
    this.musicId = trackId;
  }

  playSFX(sfxId: string): void {
    if (!this.isBrowserEnv()) return;
    const assets = this.getAssets();
    if (!assets) return;
    const howl = assets.getHowl(sfxId, "sfx");
    const vol = this.effectiveVolume("sfx");
    howl.volume(vol);
    howl.play();
  }

  playAmbience(ambienceId: string): void {
    if (!this.isBrowserEnv()) return;
    if (this.ambienceId === ambienceId && this.currentAmbience?.playing()) return;

    const assets = this.getAssets();
    if (!assets) {
      this.pendingAmbienceId = ambienceId;
      this._assetsLoading
        ?.then(() => {
          // Only honor the latest pending request.
          if (this.pendingAmbienceId === ambienceId) {
            this.pendingAmbienceId = null;
            this.playAmbience(ambienceId);
          }
        })
        .catch((err) => {
          console.warn("[AudioEngine] Failed to load audio assets:", err);
        });
      return;
    }
    this.pendingAmbienceId = null;
    const nextHowl = assets.getHowl(ambienceId, "ambience");
    this.crossfade(this.currentAmbience, nextHowl, "ambience");
    this.currentAmbience = nextHowl;
    this.ambienceId = ambienceId;
  }

  stopMusic(): void {
    if (!this.isBrowserEnv()) return;
    this.pendingMusicId = null;
    if (this.currentMusic) {
      this.fadeOut(this.currentMusic);
      this.currentMusic = null;
      this.musicId = null;
    }
  }

  stopAmbience(): void {
    if (!this.isBrowserEnv()) return;
    this.pendingAmbienceId = null;
    if (this.currentAmbience) {
      this.fadeOut(this.currentAmbience);
      this.currentAmbience = null;
      this.ambienceId = null;
    }
  }

  // ── Volume control ─────────────────────────────────────────────────────────

  setVolume(channel: AudioChannel | "master", value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.volumes = { ...this.volumes, [channel]: clamped };
    this.applyVolumes();
    this.persistVolumes();
    this.notify();
  }

  getVolumes(): VolumeState {
    // Return the same reference — this.volumes is replaced (never mutated)
    // by setVolume/mute/unmute, so callers already get a stable snapshot.
    // Returning a spread copy here would break useSyncExternalStore, which
    // compares snapshots with Object.is and would see every call as a change.
    return this.volumes;
  }

  mute(): void {
    this.volumes = { ...this.volumes, muted: true };
    this.applyVolumes();
    this.persistVolumes();
    this.notify();
  }

  unmute(): void {
    this.volumes = { ...this.volumes, muted: false };
    this.applyVolumes();
    this.persistVolumes();
    this.notify();
  }

  toggleMute(): void {
    if (this.volumes.muted) {
      this.unmute();
    } else {
      this.mute();
    }
  }

  // ── Crossfade ──────────────────────────────────────────────────────────────

  crossfade(
    fromHowl: HowlType | null,
    toHowl: HowlType,
    channel: "music" | "ambience",
    durationMs = CROSSFADE_DURATION_MS,
  ): void {
    if (!this.isBrowserEnv()) return;
    const targetVol = this.effectiveVolume(channel);

    if (fromHowl && fromHowl !== toHowl) {
      fromHowl.fade(fromHowl.volume(), 0, durationMs);
      setTimeout(() => {
        fromHowl.stop();
      }, durationMs);
    }

    // Start new track at 0 and fade in to target volume.
    toHowl.volume(0);
    if (!toHowl.playing()) {
      toHowl.play();
    }
    toHowl.fade(0, targetVol, durationMs);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private fadeOut(howl: HowlType, durationMs = CROSSFADE_DURATION_MS): void {
    howl.fade(howl.volume(), 0, durationMs);
    setTimeout(() => howl.stop(), durationMs);
  }

  /** Returns the effective (possibly muted) volume for a given channel. */
  private effectiveVolume(channel: AudioChannel): number {
    if (this.volumes.muted) return 0;
    return this.volumes.master * this.volumes[channel];
  }

  /** Re-apply current volume state to live Howl instances. */
  private applyVolumes(): void {
    if (!this.isBrowserEnv()) return;
    if (this.currentMusic) {
      this.currentMusic.volume(this.effectiveVolume("music"));
    }
    if (this.currentAmbience) {
      this.currentAmbience.volume(this.effectiveVolume("ambience"));
    }
  }

  private persistVolumes(): void {
    if (!this.isBrowserEnv()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.volumes));
    } catch {
      // localStorage may be unavailable in some environments — ignore silently.
    }
  }

  private loadVolumes(): VolumeState {
    if (!this.isBrowserEnv()) return { ...DEFAULT_VOLUMES };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_VOLUMES };
      const parsed = JSON.parse(raw) as Partial<VolumeState>;
      return {
        master: parsed.master ?? DEFAULT_VOLUMES.master,
        music: parsed.music ?? DEFAULT_VOLUMES.music,
        sfx: parsed.sfx ?? DEFAULT_VOLUMES.sfx,
        ambience: parsed.ambience ?? DEFAULT_VOLUMES.ambience,
        muted: parsed.muted ?? DEFAULT_VOLUMES.muted,
      };
    } catch {
      return { ...DEFAULT_VOLUMES };
    }
  }

  private isBrowserEnv(): boolean {
    return typeof window !== "undefined";
  }

  /**
   * Lazy-cached reference to the getHowl function from audioAssets.
   * Loaded via dynamic import() on first use — works in both browser and Electron.
   */
  private _getHowlFn: ((id: string, channel: "music" | "sfx" | "ambience") => HowlType) | null = null;
  private _assetsLoading: Promise<void> | null = null;

  private getAssets(): {
    getHowl: (id: string, channel: "music" | "sfx" | "ambience") => HowlType;
  } | null {
    if (this._getHowlFn) {
      return { getHowl: this._getHowlFn };
    }
    // Kick off lazy load if not started
    if (!this._assetsLoading) {
      this._assetsLoading = import("./audioAssets").then((mod) => {
        this._getHowlFn = mod.getHowl;
      });
    }
    return null; // Not ready yet — callers silently skip
  }
}
