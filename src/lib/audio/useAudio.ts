"use client";

/**
 * useAudio — React hook exposing the AudioEngine singleton with reactive volume state.
 *
 * Uses useSyncExternalStore so consumers re-render only when volumes change.
 * Safe to call on the server (SSR snapshot returns default volumes without
 * touching Howler or localStorage).
 */

import { useSyncExternalStore, useCallback } from "react";
import { AudioEngine, type AudioChannel, type VolumeState } from "./audioEngine";

const DEFAULT_VOLUMES: VolumeState = {
  master: 0.8,
  music: 0.6,
  sfx: 1.0,
  ambience: 0.4,
  muted: false,
};

function subscribe(callback: () => void): () => void {
  const engine = AudioEngine.getInstance();
  // AudioEngine.subscribe receives a listener that includes the new volumes,
  // but useSyncExternalStore only needs a plain callback — so we wrap it.
  return engine.subscribe(() => callback());
}

function getSnapshot(): VolumeState {
  return AudioEngine.getInstance().getVolumes();
}

function getServerSnapshot(): VolumeState {
  // During SSR we don't have localStorage, so return the static defaults.
  return DEFAULT_VOLUMES;
}

export interface UseAudioReturn {
  playMusic: (id: string) => void;
  playSFX: (id: string) => void;
  playAmbience: (id: string) => void;
  stopMusic: () => void;
  stopAmbience: () => void;
  setVolume: (channel: AudioChannel | "master", value: number) => void;
  toggleMute: () => void;
  volumes: VolumeState;
}

export function useAudio(): UseAudioReturn {
  const volumes = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const engine = AudioEngine.getInstance();

  const playMusic = useCallback((id: string) => engine.playMusic(id), [engine]);
  const playSFX = useCallback((id: string) => engine.playSFX(id), [engine]);
  const playAmbience = useCallback(
    (id: string) => engine.playAmbience(id),
    [engine],
  );
  const stopMusic = useCallback(() => engine.stopMusic(), [engine]);
  const stopAmbience = useCallback(() => engine.stopAmbience(), [engine]);
  const setVolume = useCallback(
    (channel: AudioChannel | "master", value: number) =>
      engine.setVolume(channel, value),
    [engine],
  );
  const toggleMute = useCallback(() => engine.toggleMute(), [engine]);

  return {
    playMusic,
    playSFX,
    playAmbience,
    stopMusic,
    stopAmbience,
    setVolume,
    toggleMute,
    volumes,
  };
}
