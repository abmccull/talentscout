"use client";

import { useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useScreenMusic } from "@/lib/audio/useScreenMusic";
import { useAudio } from "@/lib/audio/useAudio";
import { classifyNarrativeAudioMoment } from "@/lib/audio/audioDirector";
import { selectNextCareerMoment } from "@/engine/career/careerMoments";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Keeps non-visual audio orchestration out of the route shell. Audio assets
 * remain lazy inside AudioEngine and screen changes still update ambience.
 */
export function ScreenMusicRuntime() {
  const { playSFX } = useAudio();
  const cinematicMoments = useSettingsStore((state) => state.cinematicMoments);
  const currentScreen = useGameStore((state) => state.currentScreen);
  const matchWeather = useGameStore((state) => {
    if (state.currentScreen !== "match" || !state.activeMatch || !state.gameState) {
      return undefined;
    }

    return state.gameState.fixtures[state.activeMatch.fixtureId]?.weather;
  });
  const narrativeMoment = useGameStore((state) =>
    classifyNarrativeAudioMoment(state.gameState?.narrativeEvents),
  );
  const isTraveling = useGameStore((state) =>
    Boolean(state.gameState?.scout.travelBooking?.isAbroad),
  );
  const careerMomentCue = useGameStore((state) => {
    if (state.lastWeekSummary || state.pendingCelebration) return undefined;
    return selectNextCareerMoment(state.gameState?.careerMoments, {
      cinematicMoments,
      allowMinor: cinematicMoments === "full",
    })?.cue;
  });

  useScreenMusic({
    screen: currentScreen,
    weather: matchWeather,
    narrativeMoment,
    careerMomentCue,
    isTraveling,
  });

  useEffect(() => {
    function handleInterfaceClick(event: MouseEvent) {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;

      const control = event.target.closest<HTMLElement>(
        'button, a[href], summary, select, [role="button"], input[type="checkbox"], input[type="radio"]',
      );
      if (!control) return;
      if (control.matches(":disabled") || control.getAttribute("aria-disabled") === "true") return;
      if (control.closest('[data-audio-feedback="off"]')) return;

      playSFX("click");
    }

    document.addEventListener("click", handleInterfaceClick);
    return () => document.removeEventListener("click", handleInterfaceClick);
  }, [playSFX]);

  return null;
}
