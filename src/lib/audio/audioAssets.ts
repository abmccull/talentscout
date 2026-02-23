/**
 * Audio asset manifest with lazy-loaded Howl instances.
 *
 * Howl instances are created on first play and cached in-memory.
 * Missing audio files are handled gracefully — Howler will log a warning
 * but the game will continue running without audio.
 *
 * This module must only run in browser environments (imported dynamically
 * from AudioEngine.requireAssets()).
 */

import { Howl } from "howler";

export interface AudioAssetDef {
  src: string;
  loop?: boolean;
  /** Base volume multiplier applied to the Howl instance itself (0–1, default 1). */
  volume?: number;
}

export const MUSIC_ASSETS: Record<string, AudioAssetDef> = {
  menu: { src: "/audio/music/menu.mp3", loop: true },
  scouting: { src: "/audio/music/scouting.mp3", loop: true },
  matchday: { src: "/audio/music/matchday.mp3", loop: true },
  "season-end": { src: "/audio/music/season-end.mp3", loop: true },
};

export const SFX_ASSETS: Record<string, AudioAssetDef> = {
  click: { src: "/audio/sfx/click.mp3" },
  "page-turn": { src: "/audio/sfx/page-turn.mp3" },
  notification: { src: "/audio/sfx/notification.mp3" },
  whistle: { src: "/audio/sfx/whistle.mp3" },
  "crowd-goal": { src: "/audio/sfx/crowd-goal.mp3" },
  "crowd-miss": { src: "/audio/sfx/crowd-miss.mp3" },
  "report-submit": { src: "/audio/sfx/report-submit.mp3" },
  "level-up": { src: "/audio/sfx/level-up.mp3" },
  "job-offer": { src: "/audio/sfx/job-offer.mp3" },
  "season-end-whistle": { src: "/audio/sfx/season-end-whistle.mp3" },
  error: { src: "/audio/sfx/error.mp3" },
  save: { src: "/audio/sfx/save.mp3" },
  achievement: { src: "/audio/sfx/achievement.mp3" },
  discovery: { src: "/audio/sfx/discovery.mp3" },
  promotion: { src: "/audio/sfx/promotion.mp3" },
};

export const AMBIENCE_ASSETS: Record<string, AudioAssetDef> = {
  "stadium-crowd": { src: "/audio/ambience/stadium-crowd.mp3", loop: true },
  office: { src: "/audio/ambience/office.mp3", loop: true, volume: 0.3 },
};

// ── Lazy Howl cache ─────────────────────────────────────────────────────────

const howlCache: Map<string, Howl> = new Map();

/**
 * Returns (or creates) a Howl for the given asset ID and channel.
 * Throws if the asset ID is not registered in the manifest.
 */
export function getHowl(
  assetId: string,
  channel: "music" | "sfx" | "ambience",
): Howl {
  const cacheKey = `${channel}:${assetId}`;

  const cached = howlCache.get(cacheKey);
  if (cached) return cached;

  const assetMap =
    channel === "music"
      ? MUSIC_ASSETS
      : channel === "sfx"
        ? SFX_ASSETS
        : AMBIENCE_ASSETS;

  const def = assetMap[assetId];
  if (!def) {
    throw new Error(
      `[AudioEngine] Unknown ${channel} asset: "${assetId}". Check audioAssets.ts.`,
    );
  }

  const howl = new Howl({
    src: [def.src],
    loop: def.loop ?? false,
    volume: def.volume ?? 1,
    // Gracefully handle missing files — Howler emits a loaderror but does not crash.
    onloaderror: (_id, err) => {
      console.warn(`[AudioEngine] Failed to load ${def.src}:`, err);
    },
  });

  howlCache.set(cacheKey, howl);
  return howl;
}
