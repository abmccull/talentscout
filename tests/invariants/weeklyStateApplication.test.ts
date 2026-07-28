import { describe, expect, it } from "vitest";

import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import {
  applyWeeklyFixtureRatings,
  applyWeeklyFormAndAvailability,
  applyWeeklyPlayerProgression,
} from "@/engine/core/weekly/stateApplication";
import type { GameState, Player } from "@/engine/core/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function state(player: Player): GameState {
  return {
    currentSeason: 3,
    currentWeek: 11,
    players: { [player.id]: player },
    matchRatings: {},
  } as unknown as GameState;
}

describe("weekly state application helpers", () => {
  it("applies development, breakthroughs, and injury setbacks without mutating source state", () => {
    const player = generatePlayer(new RNG("weekly-progress"), {
      position: "CM",
      ageRange: [22, 22],
      abilityRange: [108, 108],
      nationality: "English",
      clubId: "club",
    });
    const source = state(player);

    const updatedPlayers = applyWeeklyPlayerProgression(source, {
      playerDevelopment: [{
        playerId: player.id,
        changes: { vision: 1 },
        abilityChange: 1,
      }],
      breakthroughs: [{
        playerId: player.id,
        changes: { firstTouch: 2 },
        abilityChange: 2,
        improvedAttributes: ["firstTouch"],
      }],
      injurySetbacks: [{
        playerId: player.id,
        changes: { stamina: -1 },
      }],
    }, clamp);

    expect(source.players[player.id].attributes.vision).toBe(player.attributes.vision);
    expect(updatedPlayers[player.id].attributes.vision).toBe(player.attributes.vision + 1);
    expect(updatedPlayers[player.id].attributes.firstTouch).toBe(
      clamp(player.attributes.firstTouch + 2, 1, 20),
    );
    expect(updatedPlayers[player.id].attributes.stamina).toBe(
      clamp(player.attributes.stamina - 1, 1, 20),
    );
    expect(updatedPlayers[player.id].currentAbility).toBeGreaterThan(player.currentAbility);
  });

  it("resolves form and availability before applying new injuries for the same player", () => {
    const player = {
      ...generatePlayer(new RNG("weekly-availability"), {
        position: "CB",
        ageRange: [25, 25],
        abilityRange: [104, 104],
        nationality: "English",
        clubId: "club",
      }),
      injured: true,
      injuryWeeksRemaining: 1,
      currentInjury: {
        id: "old-injury",
        playerId: "weekly-availability",
        type: "muscle",
        severity: "minor",
        recoveryWeeks: 1,
        weeksRemaining: 1,
        reinjuryRisk: 0.1,
        occurredWeek: 10,
        occurredSeason: 3,
      },
      injuryHistory: {
        playerId: "weekly-availability",
        injuries: [],
        totalWeeksMissed: 0,
        injuryProneness: 0.1,
        reinjuryWindowWeeksLeft: 0,
      },
    } as unknown as Player;
    player.currentInjury = {
      ...player.currentInjury!,
      playerId: player.id,
    };
    player.injuryHistory = {
      ...player.injuryHistory!,
      playerId: player.id,
    };

    const result = applyWeeklyFormAndAvailability(
      { [player.id]: player },
      {
        formMomentumUpdates: [{
          playerId: player.id,
          form: 1.4,
          formMomentum: 2,
          formTrend: "rising",
          formLockWeeks: 1,
        }],
        injuries: [{
          playerId: player.id,
          weeksOut: 4,
          injury: {
            id: "new-injury",
            playerId: player.id,
            type: "ligament",
            severity: "moderate",
            recoveryWeeks: 4,
            weeksRemaining: 4,
            reinjuryRisk: 0.2,
            occurredWeek: 11,
            occurredSeason: 3,
          },
        }],
      },
      clamp,
      (_, injury) => ({
        playerId: player.id,
        injuries: [injury],
        totalWeeksMissed: injury.recoveryWeeks,
        injuryProneness: 0.2,
        reinjuryWindowWeeksLeft: 4,
      }),
    );

    expect(result.newlyInjuredPlayerIds.has(player.id)).toBe(true);
    expect(result.updatedPlayers[player.id]).toMatchObject({
      injured: true,
      injuryWeeksRemaining: 4,
      formMomentum: 2,
      formTrend: "rising",
      formLockWeeks: 1,
    });
    expect(result.updatedPlayers[player.id].currentInjury?.id).toBe("new-injury");
  });

  it("records per-fixture ratings and updates the rolling rating window", () => {
    const player = generatePlayer(new RNG("weekly-ratings"), {
      position: "ST",
      ageRange: [24, 24],
      abilityRange: [112, 112],
      nationality: "English",
      clubId: "club",
    });
    const source = state({
      ...player,
      recentMatchRatings: [{
        fixtureId: "prior",
        week: 10,
        season: 3,
        rating: 6.8,
      }],
    });

    const result = applyWeeklyFixtureRatings(
      source,
      source.players,
      [{
        id: "fixture-1",
        leagueId: "league-1",
        season: 3,
        week: 11,
        played: true,
        homeClubId: "club",
        awayClubId: "other",
        homeGoals: 2,
        awayGoals: 1,
        attendance: 20000,
        weather: "clear",
        playerRatings: {
          [player.id]: {
            playerId: player.id,
            fixtureId: "fixture-1",
            rating: 7.4,
            eventCount: 0,
            stats: {},
            source: "simulated",
          },
        },
      }],
    );

    expect(result.updatedMatchRatings["fixture-1"]?.[player.id]?.rating).toBe(7.4);
    expect(result.updatedPlayers[player.id].recentMatchRatings).toHaveLength(2);
    expect(result.updatedPlayers[player.id].recentMatchRatings?.at(-1)?.fixtureId).toBe("fixture-1");
  });
});
