import { describe, expect, it } from "vitest";
import type { GameState, Player } from "@/engine/core/types";
import { calculateTransferMotivation } from "@/engine/world/transferMotivation";

function state(player: Player, teammatePositions: Player["position"][]): GameState {
  const teammateIds = teammatePositions.map((_, index) => `mate-${index}`);
  return {
    currentSeason: 4,
    currentWeek: 20,
    players: {
      [player.id]: player,
      ...Object.fromEntries(teammatePositions.map((position, index) => [
        teammateIds[index],
        { id: teammateIds[index], position },
      ])),
    },
    clubs: {
      club: { id: "club", reputation: 45, playerIds: [player.id, ...teammateIds] },
    },
    managerProfiles: {
      club: { clubId: "club", preferredFormation: "4-3-3" },
    },
    fixtures: {},
    matchRatings: {},
  } as unknown as GameState;
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "target",
    age: 27,
    position: "CAM",
    secondaryPositions: [],
    currentAbility: 125,
    clubId: "club",
    contractClubId: "club",
    contractExpiry: 4,
    morale: 2,
    injured: false,
    onLoan: false,
    ...overrides,
  } as Player;
}

describe("organic transfer motivation", () => {
  it("makes an unhappy, unused, expiring surplus player materially movable", () => {
    const candidate = player();
    const motivation = calculateTransferMotivation(
      candidate,
      state(candidate, ["CAM", "CAM", "CAM", "CAM"]),
    );

    expect(motivation.willingToMove).toBe(true);
    expect(motivation.weeklyMoveProbability).toBeGreaterThan(0.05);
    expect(motivation.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps a happy, regularly used player on a long contract settled", () => {
    const candidate = player({ contractExpiry: 8, morale: 9, position: "ST" });
    const game = state(candidate, []);
    game.fixtures = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
      `f${index}`,
      { id: `f${index}`, season: 4, week: index + 1, played: true, homeClubId: "club", awayClubId: "other" },
    ])) as GameState["fixtures"];
    game.matchRatings = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
      `f${index}`,
      { target: { playerId: "target", rating: 7, started: true, minutesPlayed: 90 } },
    ])) as unknown as GameState["matchRatings"];

    expect(calculateTransferMotivation(candidate, game).willingToMove).toBe(false);
  });

  it("uses personality and career stage to separate similar blocked players", () => {
    const mercenary = player({
      age: 22,
      contractExpiry: 6,
      morale: 5,
      personalityProfile: {
        archetype: "mercenary",
        traits: [],
        transferWillingness: 0.9,
        dressingRoomImpact: -1,
        formVolatility: 0.5,
        bigMatchModifier: 0,
        hiddenUntilRevealed: true,
        revealedTraits: [],
      },
    });
    const veteran = player({
      id: "veteran",
      age: 31,
      contractExpiry: 6,
      morale: 5,
      personalityProfile: {
        archetype: "loyal",
        traits: [],
        transferWillingness: 0.15,
        dressingRoomImpact: 2,
        formVolatility: 0.25,
        bigMatchModifier: 0,
        hiddenUntilRevealed: true,
        revealedTraits: [],
      },
    });

    const mercenaryState = state(mercenary, ["CAM", "CAM", "CAM"]);
    mercenaryState.managerProfiles.club = {
      clubId: "club",
      preferredFormation: "4-4-2",
    } as GameState["managerProfiles"][string];
    const veteranState = state(veteran, ["CAM", "CAM", "CAM"]);
    veteranState.managerProfiles.club = {
      clubId: "club",
      preferredFormation: "4-4-2",
    } as GameState["managerProfiles"][string];

    const mercenaryMotivation = calculateTransferMotivation(mercenary, mercenaryState);
    const veteranMotivation = calculateTransferMotivation(veteran, veteranState);

    expect(mercenaryMotivation.score).toBeGreaterThan(veteranMotivation.score + 6);
    expect(mercenaryMotivation.weeklyMoveProbability).toBeGreaterThan(
      veteranMotivation.weeklyMoveProbability,
    );
  });
});
