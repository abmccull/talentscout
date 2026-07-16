"use client";

/** Runtime adapter for the pure, state-aware audio director. */

import { useEffect } from "react";
import { AudioEngine } from "./audioEngine";
import { directAudioScene, type AudioDirectorInput } from "./audioDirector";

export function useScreenMusic(input: AudioDirectorInput): void {
  const { screen, weather, narrativeMoment, careerMomentCue, isTraveling } = input;

  useEffect(() => {
    const audio = AudioEngine.getInstance();
    const directed = directAudioScene({
      screen,
      weather,
      narrativeMoment,
      careerMomentCue,
      isTraveling,
    });

    if (directed.context !== "preserve") {
      audio.setSceneMix({
        musicGain: directed.musicGain,
        ambienceGain: directed.ambienceGain,
      });
    }

    if (directed.music === null) audio.stopMusic();
    else if (directed.music !== undefined) audio.playMusic(directed.music);

    if (directed.ambience === null) audio.stopAmbience();
    else if (directed.ambience !== undefined) audio.playAmbience(directed.ambience);
  }, [screen, weather, narrativeMoment, careerMomentCue, isTraveling]);
}
