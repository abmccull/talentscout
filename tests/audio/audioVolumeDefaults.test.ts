import { describe, expect, it } from "vitest";

import {
  DEFAULT_VOLUMES,
  deserializeVolumeState,
} from "@/lib/audio/audioEngine";

describe("audio volume defaults", () => {
  it("starts music below the interface and game-effect mix", () => {
    expect(DEFAULT_VOLUMES.music).toBeLessThan(DEFAULT_VOLUMES.sfx);
    expect(DEFAULT_VOLUMES.music).toBeLessThanOrEqual(0.35);
  });

  it("moves an untouched legacy mix to the quieter background defaults", () => {
    expect(deserializeVolumeState(JSON.stringify({
      master: 0.8,
      music: 0.6,
      sfx: 1,
      ambience: 0.4,
      muted: false,
    }))).toEqual(DEFAULT_VOLUMES);
  });

  it("preserves deliberate player volume choices", () => {
    expect(deserializeVolumeState(JSON.stringify({
      master: 0.8,
      music: 0.22,
      sfx: 0.7,
      ambience: 0.4,
      muted: true,
    }))).toEqual({
      master: 0.8,
      music: 0.22,
      sfx: 0.7,
      ambience: 0.4,
      muted: true,
    });
  });
});
