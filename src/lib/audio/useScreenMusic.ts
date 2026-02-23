"use client";

/**
 * useScreenMusic — manages background music and ambience based on the current screen.
 *
 * Add this hook to a component that has access to `currentScreen` (e.g. page.tsx).
 * It runs a side-effect whenever the screen changes and does NOT cause any re-renders.
 */

import { useEffect } from "react";
import { AudioEngine } from "./audioEngine";

export function useScreenMusic(screen: string): void {
  useEffect(() => {
    const audio = AudioEngine.getInstance();

    if (screen === "mainMenu" || screen === "newGame") {
      audio.playMusic("menu");
    } else if (screen === "match") {
      audio.playMusic("matchday");
      audio.playAmbience("stadium-crowd");
    } else if (screen === "matchSummary") {
      // Keep match music playing; only stop ambience crowd noise.
      audio.stopAmbience();
    } else {
      audio.playMusic("scouting");
      audio.stopAmbience();
    }
  }, [screen]);
}
