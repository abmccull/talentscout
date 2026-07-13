import { describe, expect, it } from "vitest";
import type { NarrativeEvent, NarrativeEventType } from "@/engine/core/types";
import { classifyNarrativeAudioMoment, directAudioScene } from "@/lib/audio/audioDirector";

function event(type: NarrativeEventType, overrides: Partial<NarrativeEvent> = {}): NarrativeEvent {
  return {
    id: `event-${type}`,
    type,
    week: 1,
    season: 1,
    title: type,
    description: type,
    relatedIds: [],
    acknowledged: false,
    ...overrides,
  };
}

describe("audio director", () => {
  it("keeps live observation authoritative over global narrative tension", () => {
    expect(directAudioScene({
      screen: "match",
      weather: "heavyRain",
      narrativeMoment: "politicalTension",
    })).toMatchObject({
      context: "liveObservation",
      music: "observation",
      ambience: "rain-stadium",
    });
  });

  it("uses a low-fatigue report room mix for writing", () => {
    const result = directAudioScene({ screen: "reportWriter" });
    expect(result).toMatchObject({
      context: "reportRoom",
      music: "report-writing",
      ambience: "office",
    });
    expect(result.musicGain).toBeLessThan(0.5);
  });

  it("uses ambience only on dense reading screens", () => {
    expect(directAudioScene({ screen: "reportHistory" })).toMatchObject({
      context: "readingRoom",
      music: null,
      ambience: "office",
    });
  });

  it("gives an active travel booking a distinct hub identity", () => {
    expect(directAudioScene({ screen: "internationalView", isTraveling: true }))
      .toMatchObject({ context: "travel", music: "network-groove", ambience: null });
  });

  it("preserves match music during the summary while ending stadium ambience", () => {
    expect(directAudioScene({ screen: "matchSummary" })).toMatchObject({
      context: "preserve",
      music: undefined,
      ambience: null,
    });
  });
});

describe("narrative audio classification", () => {
  it("lets unresolved tension outrank simultaneous vindication", () => {
    expect(classifyNarrativeAudioMoment([
      event("hiddenGemVindication"),
      event("boardroomCoup", { choices: [{ label: "Act", effect: "Risk" }] }),
    ])).toBe("politicalTension");
  });

  it("does not score acknowledged events as active moments", () => {
    expect(classifyNarrativeAudioMoment([
      event("exclusiveTip", { acknowledged: true }),
    ])).toBeUndefined();
  });

  it("distinguishes discovery from later vindication", () => {
    expect(classifyNarrativeAudioMoment([event("exclusiveTip")])).toBe("discovery");
    expect(classifyNarrativeAudioMoment([event("debutBrilliance")])).toBe("vindication");
  });
});
