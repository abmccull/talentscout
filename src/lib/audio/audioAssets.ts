/**
 * Audio asset manifest with variant pools and lazy-loaded Howl instances.
 *
 * Each asset can have multiple variant files. When played, a random variant
 * is selected — this prevents repetitive "same sound every time" fatigue,
 * especially important for crowd reactions and UI feedback.
 *
 * Naming convention: `{name}.mp3` (original), `{name}_1.mp3` … `{name}_N.mp3` (variants).
 * The system prefers numbered variants when available, falling back to the
 * original file if no variants exist.
 *
 * This module must only run in browser environments.
 */

import { Howl } from "howler";

export interface AudioAssetDef {
  /** Array of source paths — one per variant. A random one is chosen on each play. */
  srcs: string[];
  loop?: boolean;
  /** Base volume multiplier applied to the Howl instance itself (0–1, default 1). */
  volume?: number;
}

// ---------------------------------------------------------------------------
// Helper: generate variant paths
// ---------------------------------------------------------------------------

function variants(dir: string, name: string, count: number, ext = "mp3"): string[] {
  return Array.from({ length: count }, (_, i) => `${dir}/${name}_${i + 1}.${ext}`);
}

function single(dir: string, name: string, ext = "mp3"): string[] {
  return [`${dir}/${name}.${ext}`];
}

// ---------------------------------------------------------------------------
// Asset definitions
// ---------------------------------------------------------------------------

export const MUSIC_ASSETS: Record<string, AudioAssetDef> = {
  "title-anthem":      { srcs: variants("/audio/music", "title-anthem", 1),      loop: true },
  "career-hub":        { srcs: variants("/audio/music", "career-hub", 1),        loop: true },
  observation:         { srcs: variants("/audio/music", "observation", 1),       loop: true },
  "report-writing":    { srcs: variants("/audio/music", "report-writing", 1),    loop: true },
  "agency-theme":      { srcs: variants("/audio/music", "agency-theme", 1),      loop: true },
  "youth-scouting":    { srcs: variants("/audio/music", "youth-scouting", 1),    loop: true },
  "transfer-pressure": { srcs: variants("/audio/music", "transfer-pressure", 1), loop: true },
  "network-groove":    { srcs: variants("/audio/music", "network-groove", 1),    loop: true },
  wonderkid:           { srcs: variants("/audio/music", "wonderkid", 1),         loop: true },
  "season-review":     { srcs: variants("/audio/music", "season-review", 1),     loop: true },

  // Virtual playlist asset — contains all gameplay tracks for soundtrack rotation.
  // The multi-variant playlist system in AudioEngine will crossfade between them.
  soundtrack: {
    srcs: [
      "/audio/music/career-hub_1.mp3",
      "/audio/music/report-writing_1.mp3",
      "/audio/music/agency-theme_1.mp3",
      "/audio/music/youth-scouting_1.mp3",
      "/audio/music/transfer-pressure_1.mp3",
      "/audio/music/network-groove_1.mp3",
      "/audio/music/wonderkid_1.mp3",
      "/audio/music/season-review_1.mp3",
    ],
  },
};

export const SFX_ASSETS: Record<string, AudioAssetDef> = {
  // UI interactions
  click:              { srcs: variants("/audio/sfx", "click", 3) },
  "page-turn":        { srcs: variants("/audio/sfx", "page-turn", 5) },
  notification:       { srcs: variants("/audio/sfx", "notification", 3) },
  error:              { srcs: variants("/audio/sfx", "error", 2) },
  save:               { srcs: variants("/audio/sfx", "save", 2) },

  // Match events
  whistle:            { srcs: variants("/audio/sfx", "whistle", 3) },
  "season-end-whistle": { srcs: variants("/audio/sfx", "season-end-whistle", 2) },
  "crowd-goal":       { srcs: variants("/audio/sfx", "crowd-goal", 8) },
  "crowd-miss":       { srcs: variants("/audio/sfx", "crowd-miss", 5) },
  "crowd-chant":      { srcs: variants("/audio/sfx", "crowd-chant", 5) },

  // Career & progression
  "report-submit":    { srcs: variants("/audio/sfx", "report-submit", 3) },
  "level-up":         { srcs: variants("/audio/sfx", "level-up", 3) },
  promotion:          { srcs: variants("/audio/sfx", "promotion", 3) },
  achievement:        { srcs: variants("/audio/sfx", "achievement", 3) },
  discovery:          { srcs: variants("/audio/sfx", "discovery", 3) },
  "job-offer":        { srcs: variants("/audio/sfx", "job-offer", 2) },

  // New additions
  "pen-scribble":     { srcs: variants("/audio/sfx", "pen-scribble", 5) },
  "calendar-slide":   { srcs: variants("/audio/sfx", "calendar-slide", 3) },
  travel:             { srcs: variants("/audio/sfx", "travel", 3) },
  "camera-shutter":   { srcs: variants("/audio/sfx", "camera-shutter", 3) },
};

export const AMBIENCE_ASSETS: Record<string, AudioAssetDef> = {
  "stadium-crowd":  { srcs: variants("/audio/ambience", "stadium-crowd", 6), loop: true },
  office:           { srcs: variants("/audio/ambience", "office", 4),         loop: true, volume: 0.3 },
  "rain-stadium":   { srcs: variants("/audio/ambience", "rain-stadium", 4),  loop: true },
  rain:             { srcs: variants("/audio/ambience", "rain", 3),          loop: true },
};

// ---------------------------------------------------------------------------
// Lazy Howl cache — keyed by the specific variant file path
// ---------------------------------------------------------------------------

const howlCache: Map<string, Howl> = new Map();

/**
 * Pick a random variant source path from an asset definition.
 */
function pickVariant(def: AudioAssetDef): string {
  const idx = Math.floor(Math.random() * def.srcs.length);
  return def.srcs[idx];
}

/**
 * Returns (or creates) a Howl for a specific source file.
 */
function getOrCreateHowl(src: string, loop: boolean, volume: number): Howl {
  const cached = howlCache.get(src);
  if (cached) return cached;

  const howl = new Howl({
    src: [src],
    loop,
    volume,
    onloaderror: (_id, err) => {
      console.warn(`[AudioEngine] Failed to load ${src}:`, err);
    },
  });

  howlCache.set(src, howl);
  return howl;
}

/**
 * Returns a Howl for the given asset ID and channel.
 *
 * For SFX (one-shot sounds), a random variant is chosen each call — this
 * means successive plays of "crowd-goal" will use different crowd recordings.
 *
 * For ambience (looping), the variant is chosen once and cached
 * so the same track loops seamlessly without switching mid-play.
 *
 * For music, use `pickMusicVariant` instead — it supports playlist shuffling.
 */
export function getHowl(
  assetId: string,
  channel: "music" | "sfx" | "ambience",
): Howl {
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

  if (channel === "sfx") {
    // SFX: pick a random variant every time for variety
    const src = pickVariant(def);
    return getOrCreateHowl(src, false, def.volume ?? 1);
  }

  // Ambience: use a stable cache key so the same variant loops
  const stableKey = `${channel}:${assetId}`;
  const cached = howlCache.get(stableKey);
  if (cached) return cached;

  const src = pickVariant(def);
  const howl = new Howl({
    src: [src],
    loop: def.loop ?? false,
    volume: def.volume ?? 1,
    onloaderror: (_id, err) => {
      console.warn(`[AudioEngine] Failed to load ${src}:`, err);
    },
  });
  howlCache.set(stableKey, howl);
  return howl;
}

/**
 * Pick a music variant for playlist-style playback.
 *
 * - Multi-variant assets: returns a Howl with `loop: false` so the engine
 *   can advance to a different variant when it ends.
 * - Single-variant assets: returns a self-looping Howl.
 * - `excludeSrc` avoids an immediate repeat of the just-finished track.
 */
export function pickMusicVariant(
  assetId: string,
  excludeSrc?: string | null,
): { howl: Howl; src: string; isPlaylist: boolean } {
  const def = MUSIC_ASSETS[assetId];
  if (!def) {
    throw new Error(
      `[AudioEngine] Unknown music asset: "${assetId}". Check audioAssets.ts.`,
    );
  }

  const isPlaylist = def.srcs.length > 1;

  let candidates = def.srcs;
  if (excludeSrc && isPlaylist) {
    candidates = candidates.filter((s) => s !== excludeSrc);
  }

  const src = candidates[Math.floor(Math.random() * candidates.length)];
  const howl = getOrCreateHowl(src, !isPlaylist, def.volume ?? 1);
  return { howl, src, isPlaylist };
}
