import { describe, expect, it } from "vitest";
import type { Player, PlayerMovementEvent, UnsignedYouth } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { generatePlayer } from "@/engine/players/generation";
import { reconcileYouthSigningPlacements } from "@/engine/youth/generation";

function generatedPlayer(namespace?: string): Player {
  return generatePlayer(createRNG("aligned-player-stream"), {
    position: "LB",
    ageRange: [17, 17],
    abilityRange: [40, 40],
    nationality: "English",
    clubId: "",
    currentSeason: 11,
    idNamespace: namespace,
    firstName: "Test",
    lastName: "Prospect",
  });
}

function unsignedYouth(player: Player): UnsignedYouth {
  return {
    id: player.id,
    player,
    visibility: 0,
    buzzLevel: 0,
    discoveredBy: [],
    regionId: "region-test",
    country: "england",
    venueAppearances: [],
    generatedSeason: 11,
    placed: true,
    placedClubId: "club-b",
    retired: false,
  };
}

describe("long-career youth identity and placement integrity", () => {
  it("keeps generated player categories disjoint even when RNG streams align exactly", () => {
    const worldPlayer = generatedPlayer();
    const unsignedPlayer = generatedPlayer("unsigned_season-start_england_s11_w1");

    expect(worldPlayer.id).not.toBe(unsignedPlayer.id);
    expect(worldPlayer.id).toBe(
      unsignedPlayer.id.replace(/^unsigned_season-start_england_s11_w1_/, ""),
    );
  });

  it("rolls back an optimistic youth placement when lifecycle signing is rejected", () => {
    const prospect = generatedPlayer("unsigned_season-start_england_s11_w1");
    const youth = unsignedYouth(prospect);

    const reconciled = reconcileYouthSigningPlacements(
      { [youth.id]: youth },
      [{ youthId: youth.id, clubId: "club-b" }],
      [],
    );

    expect(reconciled[youth.id]).toMatchObject({
      placed: false,
      retired: false,
    });
    expect(reconciled[youth.id].placedClubId).toBeUndefined();
  });

  it("preserves placement only when the matching youth-signing movement committed", () => {
    const prospect = generatedPlayer("unsigned_season-start_england_s11_w1");
    const youth = unsignedYouth(prospect);
    const movement: PlayerMovementEvent = {
      id: "movement-1",
      playerId: prospect.id,
      type: "youthSigning",
      week: 46,
      season: 11,
      toClubId: "club-b",
    };

    const reconciled = reconcileYouthSigningPlacements(
      { [youth.id]: youth },
      [{ youthId: youth.id, clubId: "club-b" }],
      [movement],
    );

    expect(reconciled[youth.id]).toBe(youth);
    expect(reconciled[youth.id]).toMatchObject({
      placed: true,
      placedClubId: "club-b",
    });
  });
});
