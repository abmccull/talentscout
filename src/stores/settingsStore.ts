/**
 * Settings store — persists user accessibility and gameplay preferences.
 *
 * Backed by localStorage under the key "talentscout_settings".
 * Follows the same manual-persistence pattern used by authStore and tutorialStore
 * (no zustand persist middleware — just read on init, write on every mutation).
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppSettings {
  // Display / graphics
  fontSize: "small" | "medium" | "large";
  backgroundIntensity: "low" | "medium" | "high";
  uiContrast: "standard" | "high";
  preferFullscreen: boolean;

  // Accessibility
  colorblindMode: "none" | "protanopia" | "deuteranopia" | "tritanopia";
  reducedMotion: boolean;
  /** Presentation intensity; never changes simulation outcomes. */
  cinematicMoments: "full" | "reduced" | "off";
  /** Optional non-semantic stingers for discoveries, failures, and callbacks. */
  emotionalAudioCues: boolean;
  /** Whether career-defining moments may open automatically after weekly resolution. */
  autoOpenCareerDefiningMoments: boolean;

  // Gameplay
  autoPlayWeekSimulation: boolean;
  confirmBeforeAdvance: boolean;
}

export interface SettingsState extends AppSettings {
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetDefaults: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "talentscout_settings";

export const DEFAULT_SETTINGS: AppSettings = {
  fontSize: "medium",
  backgroundIntensity: "medium",
  uiContrast: "standard",
  preferFullscreen: false,
  colorblindMode: "none",
  reducedMotion: false,
  cinematicMoments: "full",
  emotionalAudioCues: true,
  autoOpenCareerDefiningMoments: true,
  autoPlayWeekSimulation: false,
  confirmBeforeAdvance: false,
};

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function readPersisted(): AppSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;

    // Merge with defaults so new fields added later always have a value
    return {
      fontSize:
        parsed.fontSize === "small" ||
        parsed.fontSize === "medium" ||
        parsed.fontSize === "large"
          ? parsed.fontSize
          : DEFAULT_SETTINGS.fontSize,
      backgroundIntensity:
        parsed.backgroundIntensity === "low" ||
        parsed.backgroundIntensity === "medium" ||
        parsed.backgroundIntensity === "high"
          ? parsed.backgroundIntensity
          : DEFAULT_SETTINGS.backgroundIntensity,
      uiContrast:
        parsed.uiContrast === "standard" || parsed.uiContrast === "high"
          ? parsed.uiContrast
          : DEFAULT_SETTINGS.uiContrast,
      preferFullscreen:
        typeof parsed.preferFullscreen === "boolean"
          ? parsed.preferFullscreen
          : DEFAULT_SETTINGS.preferFullscreen,
      colorblindMode:
        parsed.colorblindMode === "none" ||
        parsed.colorblindMode === "protanopia" ||
        parsed.colorblindMode === "deuteranopia" ||
        parsed.colorblindMode === "tritanopia"
          ? parsed.colorblindMode
          : DEFAULT_SETTINGS.colorblindMode,
      reducedMotion:
        typeof parsed.reducedMotion === "boolean"
          ? parsed.reducedMotion
          : DEFAULT_SETTINGS.reducedMotion,
      cinematicMoments:
        parsed.cinematicMoments === "full" ||
        parsed.cinematicMoments === "reduced" ||
        parsed.cinematicMoments === "off"
          ? parsed.cinematicMoments
          : DEFAULT_SETTINGS.cinematicMoments,
      emotionalAudioCues:
        typeof parsed.emotionalAudioCues === "boolean"
          ? parsed.emotionalAudioCues
          : DEFAULT_SETTINGS.emotionalAudioCues,
      autoOpenCareerDefiningMoments:
        typeof parsed.autoOpenCareerDefiningMoments === "boolean"
          ? parsed.autoOpenCareerDefiningMoments
          : DEFAULT_SETTINGS.autoOpenCareerDefiningMoments,
      autoPlayWeekSimulation:
        typeof parsed.autoPlayWeekSimulation === "boolean"
          ? parsed.autoPlayWeekSimulation
          : DEFAULT_SETTINGS.autoPlayWeekSimulation,
      confirmBeforeAdvance:
        typeof parsed.confirmBeforeAdvance === "boolean"
          ? parsed.confirmBeforeAdvance
          : DEFAULT_SETTINGS.confirmBeforeAdvance,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writePersisted(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable — silently ignore.
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

// readPersisted() runs at module evaluation time — after hydration in the
// browser, so localStorage is available at that point.
const persisted = readPersisted();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...persisted,

  setSetting(key, value) {
    // Build new state and persist atomically
    const current = get();
    const next: AppSettings = { ...current, [key]: value };
    writePersisted(next);
    set({ [key]: value });
  },

  resetDefaults() {
    writePersisted({ ...DEFAULT_SETTINGS });
    set({ ...DEFAULT_SETTINGS });
  },
}));
