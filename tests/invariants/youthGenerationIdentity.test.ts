import { describe, expect, it } from "vitest";
import type { Club, Player, PlayerMovementEvent, UnsignedYouth } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { generatePlayer } from "@/engine/players/generation";
import {
  processYouthAging,
  reconcileYouthSigningPlacements,
  UNSIGNED_YOUTH_MAX_COMPLETED_SEASONS,
} from "@/engine/youth/generation";

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

  it("removes a prospect from the active pool when the matching signing committed", () => {
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

    expect(reconciled[youth.id]).toBeUndefined();
  });

  it("expires an unresolved cohort after four completed seasons, but not sooner", () => {
    expect(UNSIGNED_YOUTH_MAX_COMPLETED_SEASONS).toBe(4);
    const prospect = {
      ...generatedPlayer("unsigned-cohort"),
      age: 13,
    };
    const youth: UnsignedYouth = {
      ...unsignedYouth(prospect),
      generatedSeason: 1,
      placed: false,
      placedClubId: undefined,
    };
    const clubs: Record<string, Club> = {};

    const beforeCap = processYouthAging(
      createRNG("cohort-cap"),
      { [youth.id]: youth },
      clubs,
      3,
    );
    expect(beforeCap.retired).toEqual([]);
    expect(beforeCap.updated[youth.id].retired).toBe(false);

    const atCap = processYouthAging(
      createRNG("cohort-cap"),
      { [youth.id]: youth },
      clubs,
      4,
    );
    expect(atCap.retired).toEqual([youth.id]);
    expect(atCap.updated[youth.id].retired).toBe(true);
  });

  it("still lets age rules resolve a prospect before the cohort cap", () => {
    const prospect = {
      ...generatedPlayer("unsigned-age-exit"),
      age: 18,
    };
    const youth: UnsignedYouth = {
      ...unsignedYouth(prospect),
      generatedSeason: 1,
      placed: false,
      placedClubId: undefined,
    };

    const result = processYouthAging(
      createRNG("age-exit"),
      { [youth.id]: youth },
      {},
      1,
    );

    expect(result.retired).toEqual([youth.id]);
    expect(result.updated[youth.id].retired).toBe(true);
  });

  it("keeps repeated seasonal cohorts bounded without retaining terminal records", () => {
    let pool: Record<string, UnsignedYouth> = {};
    const cohortSize = 6;

    for (let season = 1; season <= 8; season++) {
      for (let index = 0; index < cohortSize; index++) {
        const player = {
          ...generatedPlayer(`unsigned-cohort-s${season}-${index}`),
          age: 13,
        };
        pool[player.id] = {
          ...unsignedYouth(player),
          generatedSeason: season,
          placed: false,
          placedClubId: undefined,
        };
      }

      const result = processYouthAging(
        createRNG(`bounded-cohorts-${season}`),
        pool,
        {},
        season,
      );
      const retired = new Set(result.retired);
      pool = Object.fromEntries(
        Object.entries(result.updated)
          .filter(([youthId, youth]) => !retired.has(youthId) && !youth.placed && !youth.retired)
          .map(([youthId, youth]) => [
            youthId,
            { ...youth, player: { ...youth.player, age: youth.player.age + 1 } },
          ]),
      );

      expect(Object.values(pool).every((youth) =>
        season - youth.generatedSeason + 1 < UNSIGNED_YOUTH_MAX_COMPLETED_SEASONS,
      )).toBe(true);
      expect(Object.keys(pool).length).toBeLessThanOrEqual(
        cohortSize * (UNSIGNED_YOUTH_MAX_COMPLETED_SEASONS - 1),
      );
    }
  });
});
