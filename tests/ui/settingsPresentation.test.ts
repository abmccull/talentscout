import { describe, expect, it } from "vitest";
import { DEFAULT_VOLUMES } from "@/lib/audio/audioEngine";
import { DEFAULT_SETTINGS } from "@/stores/settingsStore";

describe("settings contract", () => {
  it("only persists controls the game can actually honor", () => {
    expect(DEFAULT_SETTINGS).toEqual({
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
    });
    expect(DEFAULT_VOLUMES.muted).toBe(false);
    expect(DEFAULT_VOLUMES.master).toBeGreaterThan(0);
  });
});
