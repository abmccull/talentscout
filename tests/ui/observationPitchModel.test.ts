import { describe, expect, it } from "vitest";
import type {
  PlayerMoment,
  SessionPlayer,
} from "@/engine/observation/types";
import {
  buildObservationPitchMarkers,
  inferObservationPhaseType,
  observationPassageLabel,
  normalizeObservationPosition,
} from "@/components/game/observation/observationPitchModel";

function createPlayer(
  playerId: string,
  position: string,
  isFocused = false,
): SessionPlayer {
  return {
    playerId,
    name: `Player ${playerId}`,
    position,
    isFocused,
    focusedPhases: [],
    currentLens: isFocused ? "technical" : undefined,
    focusHistory: [],
  };
}

function createMoment(
  playerId: string,
  momentType: PlayerMoment["momentType"],
  isStandout = false,
): PlayerMoment {
  return {
    id: `moment-${playerId}-${momentType}`,
    playerId,
    momentType,
    quality: 7,
    attributesHinted: ["decisionMaking"],
    description: "A decisive action.",
    vagueDescription: "Something develops.",
    pressureContext: true,
    isStandout,
  };
}

describe("observation pitch model", () => {
  it("normalizes verbose roles without changing the source player", () => {
    expect(normalizeObservationPosition("Goalkeeper")).toBe("GK");
    expect(normalizeObservationPosition("Attacking Midfielder")).toBe("CAM");
    expect(normalizeObservationPosition("Centre Back")).toBe("CB");
    expect(normalizeObservationPosition("Forward")).toBe("ST");
  });

  it("uses a deterministic schematic layout for the dominant moment category", () => {
    const moments = [
      createMoment("one", "tacticalDecision"),
      createMoment("two", "tacticalDecision"),
      createMoment("three", "physicalTest"),
    ];

    expect(inferObservationPhaseType({ moments })).toBe("buildUp");
    expect(inferObservationPhaseType({ moments: [] })).toBe("possession");
  });

  it("keeps markers bounded, separates duplicate roles, and mirrors focus and moments", () => {
    const players = [
      createPlayer("one", "CM", true),
      createPlayer("two", "Central Midfielder"),
      createPlayer("three", "Central Midfielder"),
    ];
    const moments = [
      createMoment("one", "mentalResponse", true),
      createMoment("two", "technicalAction"),
    ];

    const markers = buildObservationPitchMarkers(players, { moments });
    const first = markers.find((marker) => marker.playerId === "one");
    const second = markers.find((marker) => marker.playerId === "two");
    const third = markers.find((marker) => marker.playerId === "three");

    expect(first).toMatchObject({
      isFocused: true,
      hasMoment: true,
      isStandout: true,
      momentCount: 1,
    });
    expect(second).toMatchObject({ hasMoment: true, isFocused: false });
    expect(third).toMatchObject({ hasMoment: false, isFocused: false });
    expect(new Set(markers.map((marker) => `${marker.x}:${marker.y}`)).size).toBe(3);

    for (const marker of markers) {
      expect(marker.x).toBeGreaterThanOrEqual(7);
      expect(marker.x).toBeLessThanOrEqual(93);
      expect(marker.y).toBeGreaterThanOrEqual(9);
      expect(marker.y).toBeLessThanOrEqual(91);
    }
  });
});

it("changing scout attention changes highlights without moving any footballer", () => {
  const players = [createPlayer("one", "CM"), createPlayer("two", "CM"), createPlayer("three", "ST")];
  const phase = { moments: [createMoment("one", "tacticalDecision"), createMoment("two", "physicalTest")] };
  const before = buildObservationPitchMarkers(players, phase);
  const focused = buildObservationPitchMarkers(players.map(p => ({ ...p, isFocused: p.playerId === "one" })), phase);
  expect(focused.map(({ playerId, x, y }) => ({ playerId, x, y })))
    .toEqual(before.map(({ playerId, x, y }) => ({ playerId, x, y })));
  expect(focused[0].isFocused).toBe(true);
  expect(before[0].isFocused).toBe(false);
});

it("labels passages without asserting unsupported football phases", () => {
  expect(observationPassageLabel({ moments: [createMoment("one", "characterReveal")] })).toBe("Player reactions");
  expect(observationPassageLabel({ moments: [createMoment("one", "technicalAction"), createMoment("two", "mentalResponse")] })).toBe("Mixed passages");
  expect(observationPassageLabel({ moments: [] })).toBe("Watching play");
});
