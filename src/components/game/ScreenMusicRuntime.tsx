"use client";

import { useGameStore } from "@/stores/gameStore";
import { useScreenMusic } from "@/lib/audio/useScreenMusic";
import { classifyNarrativeAudioMoment } from "@/lib/audio/audioDirector";

/**
 * Keeps non-visual audio orchestration out of the route shell. Audio assets
 * remain lazy inside AudioEngine and screen changes still update ambience.
 */
export function ScreenMusicRuntime() {
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

  useScreenMusic({
    screen: currentScreen,
    weather: matchWeather,
    narrativeMoment,
    isTraveling,
  });
  return null;
}
