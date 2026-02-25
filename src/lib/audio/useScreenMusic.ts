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

    switch (screen) {
      // Title / pre-game
      case "mainMenu":
      case "newGame":
      case "scenarioSelect":
        track = "title-anthem";
        break;

      // Core gameplay hub
      case "dashboard":
      case "calendar":
      case "inbox":
      case "weekSimulation":
      case "handbook":
        track = "career-hub";
        ambience = "office";
        break;

      // Match observation
      case "match":
        track = "observation";
        if (weather === "rain" || weather === "heavyRain" || weather === "snow") {
          ambience = "rain-stadium";
        } else {
          ambience = "stadium-crowd";
        }
        break;

      // Post-match — keep match music playing, just stop ambience
      case "matchSummary":
        audio.stopAmbience();
        return;

      // Report / analysis screens
      case "reportWriter":
      case "reportHistory":
      case "analytics":
      case "playerProfile":
      case "playerDatabase":
        track = "report-writing";
        ambience = "office";
        break;

      // Business / agency
      case "agency":
      case "finances":
      case "equipment":
        track = "agency-theme";
        ambience = "office";
        break;

      // Youth development
      case "youthScouting":
      case "alumniDashboard":
      case "training":
        track = "youth-scouting";
        ambience = "office";
        break;

      // Fixtures / transfer pressure
      case "fixtureBrowser":
        track = "transfer-pressure";
        ambience = "office";
        break;

      // Network / contacts
      case "network":
      case "npcManagement":
      case "internationalView":
      case "rivals":
        track = "network-groove";
        ambience = "office";
        break;

      // Celebration / payoff
      case "discoveries":
      case "achievements":
        track = "wonderkid";
        break;

      // Reflection / career
      case "hallOfFame":
      case "career":
      case "leaderboard":
      case "demoEnd":
        track = "season-review";
        break;

      // Settings — keep whatever is currently playing
      case "settings":
        return;

      default:
        track = "career-hub";
        ambience = "office";
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
