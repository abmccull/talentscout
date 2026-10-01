import { describe, expect, it } from "vitest";
import { mergeYouthVenuePreview } from "@/stores/actions/mergeYouthVenuePreview";
import type { GameState, Observation, UnsignedYouth, WeekSimulationState } from "@/engine/core/types";

function setup() {
  const youth = { id: "y", player: { id: "p", firstName: "Current" }, buzzLevel: 40,
    visibility: 30, discoveredBy: ["other-scout"], venueAppearances: ["streetFootball"],
    placed: true } as UnsignedYouth;
  const state = { unsignedYouth: { y: youth }, observations: {}, discoveryRecords: [] } as unknown as GameState;
  const observation = (id: string, booking: string) => ({ id, playerId: "p", scoutId: "scout",
    context: "schoolMatch", activityInstanceId: booking } as Observation);
  const preview: NonNullable<WeekSimulationState["youthVenueResults"]> = {
    updatedUnsignedYouth: { y: { ...youth, placed: false, buzzLevel: 12, visibility: 8 } },
    newObservations: { a: observation("a", "live"), b: observation("b", "skipped") },
    newDiscoveries: [{ playerId: "p" }] as GameState["discoveryRecords"],
    observationEffects: { a: { youthId: "y", buzzIncrease: 6, visibilityIncrease: 3 },
      b: { youthId: "y", buzzIncrease: 4, visibilityIncrease: 2 } },
    totalObservations: 2, totalDiscoveries: 1,
  };
  return { state, preview };
}

describe("youth preview reconciliation", () => {
  it("preserves current state and applies only the unplayed booking's effects", () => {
    const { state, preview } = setup();
    const before = structuredClone(state);
    const result = mergeYouthVenuePreview(state, preview, new Set(["live"]));
    expect(result.observations.map(o => o.id)).toEqual(["b"]);
    expect(result.unsignedYouth.y).toMatchObject({ placed: true, buzzLevel: 44, visibility: 32,
      player: { firstName: "Current" }, discoveredBy: ["other-scout", "scout"] });
    expect(result.discoveries).toHaveLength(1);
    expect(state).toEqual(before);
    const replay = mergeYouthVenuePreview({ ...state, unsignedYouth: result.unsignedYouth,
      observations: { b: result.observations[0] }, discoveryRecords: result.discoveries }, preview, new Set(["live"]));
    expect(replay.unsignedYouth).toEqual(result.unsignedYouth);
    expect(replay.observations).toHaveLength(0);
    expect(replay.discoveries).toHaveLength(0);
  });
  it("does not reveal preview-only discoveries when all bookings were played live", () => {
    const { state, preview } = setup();
    const result = mergeYouthVenuePreview(state, preview, new Set(["live", "skipped"]));
    expect(result.unsignedYouth).toEqual(state.unsignedYouth);
    expect(result.observations).toHaveLength(0);
    expect(result.discoveries).toHaveLength(0);
  });
  it("keeps legacy preview evidence without overwriting newer entity values", () => {
    const { state, preview } = setup();
    delete preview.observationEffects;
    const result = mergeYouthVenuePreview(state, preview, new Set(["live"]));
    expect(result.observations).toHaveLength(1);
    expect(result.unsignedYouth.y).toMatchObject({ placed: true, buzzLevel: 40, visibility: 30 });
  });
});
