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
  // Display
  fontSize: "small" | "medium" | "large";

  // Accessibility
  colorblindMode: "none" | "protanopia" | "deuteranopia" | "tritanopia";
  reducedMotion: boolean;

  // Gameplay
  autoAdvanceSpeed: "slow" | "normal" | "fast";
  confirmBeforeAdvance: boolean;

  // Notifications
  notificationLevel: "all" | "important" | "critical";
}

export interface SettingsState extends AppSettings {
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetDefaults: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "talentscout_settings";

const DEFAULT_SETTINGS: AppSettings = {
  fontSize: "medium",
  colorblindMode: "none",
  reducedMotion: false,
  autoAdvanceSpeed: "normal",
  confirmBeforeAdvance: false,
  notificationLevel: "all",
};

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function readPersisted(): AppSettings {
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
      autoAdvanceSpeed:
        parsed.autoAdvanceSpeed === "slow" ||
        parsed.autoAdvanceSpeed === "normal" ||
        parsed.autoAdvanceSpeed === "fast"
          ? parsed.autoAdvanceSpeed
          : DEFAULT_SETTINGS.autoAdvanceSpeed,
      confirmBeforeAdvance:
        typeof parsed.confirmBeforeAdvance === "boolean"
          ? parsed.confirmBeforeAdvance
          : DEFAULT_SETTINGS.confirmBeforeAdvance,
      notificationLevel:
        parsed.notificationLevel === "all" ||
        parsed.notificationLevel === "important" ||
        parsed.notificationLevel === "critical"
          ? parsed.notificationLevel
          : DEFAULT_SETTINGS.notificationLevel,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writePersisted(settings: AppSettings): void {
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
