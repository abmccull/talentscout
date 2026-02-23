"use client";

/**
 * useScreenMusic — manages background music and ambience based on the current screen.
 *
 * Add this hook to a component that has access to `currentScreen` (e.g. page.tsx).
 * It runs a side-effect whenever the screen changes and does NOT cause any re-renders.
 *
 * @param screen  Current game screen identifier.
 * @param weather Optional weather string from the active match fixture. When the match
 *                screen is active and the weather includes rain or snow, the ambience
 *                switches to a weather-appropriate track.
 */

import { useEffect } from "react";
import { AudioEngine } from "./audioEngine";

export function useScreenMusic(screen: string, weather?: string): void {
  useEffect(() => {
    const audio = AudioEngine.getInstance();

    if (screen === "mainMenu" || screen === "newGame") {
      audio.playMusic("menu");
      audio.stopAmbience();
    } else if (screen === "match") {
      audio.playMusic("matchday");
      // Weather-aware ambience: rainy/snowy matches get rain overlay on stadium
      if (weather === "rain" || weather === "heavyRain" || weather === "snow") {
        audio.playAmbience("rain-stadium");
      } else {
        audio.playAmbience("stadium-crowd");
      }
    } else if (screen === "matchSummary") {
      // Keep match music playing; only stop ambience crowd noise.
      audio.stopAmbience();
    } else if (screen === "seasonEnd" || screen === "hallOfFame") {
      audio.playMusic("season-end");
      audio.stopAmbience();
    } else {
      // In-game screens (dashboard, calendar, reports, etc.) get office ambience
      audio.playMusic("scouting");
      audio.playAmbience("office");
    }
  }, [screen, weather]);
}
