import { beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedHowlOptions {
  src: string[];
  html5?: boolean;
  preload?: boolean | "metadata";
}

const capturedOptions: CapturedHowlOptions[] = [];

vi.mock("howler", () => ({
  Howl: class MockHowl {
    constructor(options: CapturedHowlOptions) {
      capturedOptions.push(options);
    }
  },
}));

import { getHowl, pickMusicVariant } from "@/lib/audio/audioAssets";

describe("audio asset loading policy", () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  it("streams multi-megabyte music and ambience with metadata-only preload", () => {
    pickMusicVariant("career-hub");
    getHowl("office", "ambience");

    expect(capturedOptions).toHaveLength(2);
    for (const options of capturedOptions) {
      expect(options).toMatchObject({ html5: true, preload: "metadata" });
    }
  });

  it("keeps one-shot SFX on eagerly loaded WebAudio for low latency", () => {
    getHowl("click", "sfx");

    expect(capturedOptions).toHaveLength(1);
    expect(capturedOptions[0]).toMatchObject({ html5: false, preload: true });
  });
});
