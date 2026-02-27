"use client";

/**
 * useScreenMusic — manages background music and ambience based on the current screen.
 *
 * Each screen maps to one of 10 thematic vocal tracks. Ambience is layered
 * on top (office hum for indoor screens, stadium crowd for matches).
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

    let track: string | null = null;
    let ambience: string | null = null;

    // Screens that don't have ambient office hum (celebrations, reflection, career)
    const noAmbienceScreens = new Set([
      "discoveries", "achievements", "hallOfFame", "career", "leaderboard", "demoEnd",
    ]);

    switch (screen) {
      // Pre-game — dedicated title track
      case "mainMenu":
      case "newGame":
      case "scenarioSelect":
        track = "title-anthem";
        break;

      // Match — dedicated observation track + stadium ambience
      case "match":
        track = "observation";
        ambience = (weather === "rain" || weather === "heavyRain" || weather === "snow")
          ? "rain-stadium" : "stadium-crowd";
        break;

      // Post-match — keep match music playing, stop ambience
      case "matchSummary":
        audio.stopAmbience();
        return;

      // Settings — keep whatever is currently playing
      case "settings":
        return;

      // Everything else — full soundtrack rotation
      default:
        track = "soundtrack";
        ambience = noAmbienceScreens.has(screen) ? null : "office";
        break;
    }

    if (track) audio.playMusic(track);
    if (ambience) {
      audio.playAmbience(ambience);
    } else {
      audio.stopAmbience();
    }
  }, [screen, weather]);
}
