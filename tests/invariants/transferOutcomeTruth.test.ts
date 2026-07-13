import { describe, expect, it } from "vitest";
import type {
  Fixture,
  Player,
  PlayerMatchRating,
  TransferRecord,
} from "@/engine/core/types";
import {
  createTransferRecord,
  migrateLegacyTransferParticipation,
  updateTransferRecords,
} from "@/engine/firstTeam/transferTracker";
import { createRNG } from "@/engine/rng";

const CALENDAR_LENGTHS = [38, 46, 50] as const;

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    firstName: "Ari",
    lastName: "Evidence",
    clubId: "destination",
    contractClubId: "destination",
    currentAbility: 100,
    injured: false,
    injuryWeeksRemaining: 0,
    injuryHistory: {
      playerId: "player-1",
      injuries: [],
      totalWeeksMissed: 0,
      injuryProneness: 0,
      reinjuryWindowWeeksLeft: 0,
    },
    ...overrides,
  } as Player;
}

function transfer(caAtTransfer = 100, transferWeek = 1): TransferRecord {
  return createTransferRecord(
    createRNG("record-id"),
    "player-1",
    "scout-1",
    "origin",
    "destination",
    1_000_000,
    transferWeek,
    1,
    "strongRecommend",
    "report-1",
    caAtTransfer,
  );
}

function fixturesFor(seasonLength: number, season: number): Record<string, Fixture> {
  return Object.fromEntries(Array.from({ length: seasonLength }, (_, index) => {
    const week = index + 1;
    const fixture: Fixture = {
      id: `fixture-s${season}-w${week}`,
      homeClubId: week % 2 === 0 ? "destination" : "opponent",
      awayClubId: week % 2 === 0 ? "opponent" : "destination",
      leagueId: "league",
      season,
      week,
      played: true,
    };
    return [fixture.id, fixture];
  }));
}

function ratingsFor(
  fixtures: Record<string, Fixture>,
  count: number,
  rating = 7,
  minutes: number | null = 90,
): Record<string, Record<string, PlayerMatchRating>> {
  return Object.fromEntries(Object.values(fixtures).slice(0, count).map((fixture) => [
    fixture.id,
    {
      "player-1": {
        playerId: "player-1",
        fixtureId: fixture.id,
        started: true,
        ...(minutes !== null ? { minutesPlayed: minutes } : {}),
        rating,
        eventCount: 0,
        stats: {},
        source: "simulated",
      },
    },
  ]));
}

describe.each(CALENDAR_LENGTHS)("transfer outcome truth (%i-week season)", (seasonLength) => {
  it("uses every canonical appearance without a 38-match cap and records exact minutes", () => {
    const fixtures = fixturesFor(seasonLength, 1);
    const updated = updateTransferRecords(
      createRNG("update-a"),
      [transfer()],
      { "player-1": player() },
      ratingsFor(fixtures, seasonLength),
      { fixtures, completedSeason: 1, seasonLength },
    )[0];

    expect(updated.appearances).toBe(seasonLength);
    expect(updated.seasonParticipation).toEqual([
      expect.objectContaining({
        season: 1,
        seasonLength,
        teamMatches: seasonLength,
        appearances: seasonLength,
        starts: seasonLength,
        minutesPlayed: seasonLength * 90,
        appearancesWithoutMinutes: 0,
      }),
    ]);
  });

  it("is idempotent for a repeated rollover and independent of RNG seed", () => {
    const fixtures = fixturesFor(seasonLength, 1);
    const context = { fixtures, completedSeason: 1, seasonLength };
    const first = updateTransferRecords(
      createRNG("first-seed"),
      [transfer()],
      { "player-1": player() },
      ratingsFor(fixtures, 8, 7.2),
      context,
    );
    const repeated = updateTransferRecords(
      createRNG("different-seed"),
      first,
      { "player-1": player() },
      ratingsFor(fixtures, 8, 7.2),
      context,
    );

    expect(repeated).toEqual(first);
    expect(repeated[0].seasonsSinceTransfer).toBe(1);
    expect(repeated[0].seasonParticipation).toHaveLength(1);
  });

  it("matches sequential and save/reload season processing", () => {
    const fixturesOne = fixturesFor(seasonLength, 1);
    const fixturesTwo = fixturesFor(seasonLength, 2);
    const firstSeason = updateTransferRecords(
      createRNG("manual-one"),
      [transfer()],
      { "player-1": player({ currentAbility: 106 }) },
      ratingsFor(fixturesOne, Math.min(20, seasonLength), 7.1),
      { fixtures: fixturesOne, completedSeason: 1, seasonLength },
    );
    const reloaded = JSON.parse(JSON.stringify(firstSeason)) as TransferRecord[];
    const afterReload = updateTransferRecords(
      createRNG("manual-two"),
      reloaded,
      { "player-1": player({ currentAbility: 114 }) },
      ratingsFor(fixturesTwo, Math.min(22, seasonLength), 7.6),
      { fixtures: fixturesTwo, completedSeason: 2, seasonLength },
    );
    const uninterrupted = updateTransferRecords(
      createRNG("batch-two"),
      firstSeason,
      { "player-1": player({ currentAbility: 114 }) },
      ratingsFor(fixturesTwo, Math.min(22, seasonLength), 7.6),
      { fixtures: fixturesTwo, completedSeason: 2, seasonLength },
    );

    expect(afterReload).toEqual(uninterrupted);
    expect(afterReload[0]).toMatchObject({
      seasonsSinceTransfer: 2,
      outcome: "hit",
      outcomeReason: "strongPerformance",
      outcomeEvidenceLevel: "sufficient",
    });
  });
});

describe("transfer outcome evidence boundaries", () => {
  it("migrates fabricated legacy evidence once without rewriting applied history", () => {
    const legacy: TransferRecord = {
      ...transfer(),
      seasonParticipation: undefined,
      seasonsSinceTransfer: 2,
      appearances: 67,
      avgMatchRating: 6.1,
      outcome: "flop",
      outcomeReason: "characterIssues",
      accountabilityApplied: true,
    };

    const migrated = migrateLegacyTransferParticipation([legacy]);
    expect(migrated[0]).toMatchObject({
      outcome: "flop",
      outcomeReason: "insufficientEvidence",
      accountabilityApplied: true,
      outcomeEvidenceLevel: "none",
      seasonParticipation: [],
    });
    expect(migrated[0].appearances).toBeUndefined();
    expect(migrateLegacyTransferParticipation(migrated)).toEqual(migrated);
  });

  it("leaves an outcome unresolved when the world has no authoritative evidence", () => {
    const first = updateTransferRecords(
      createRNG("none-one"),
      [transfer()],
      { "player-1": player({ currentAbility: 90 }) },
      {},
      { fixtures: {}, completedSeason: 1, seasonLength: 38 },
    );
    const second = updateTransferRecords(
      createRNG("none-two"),
      first,
      { "player-1": player({ currentAbility: 90 }) },
      {},
      { fixtures: {}, completedSeason: 2, seasonLength: 38 },
    )[0];

    expect(second.outcome).toBeUndefined();
    expect(second.outcomeReason).toBe("insufficientEvidence");
    expect(second.appearances).toBe(0);
    expect(second.accountabilityApplied).toBe(false);
  });

  it("describes low participation without inventing tactical or character causes", () => {
    const fixturesOne = fixturesFor(50, 1);
    const fixturesTwo = fixturesFor(50, 2);
    const afterOne = updateTransferRecords(
      createRNG("low-one"),
      [transfer()],
      { "player-1": player({ currentAbility: 98 }) },
      ratingsFor(fixturesOne, 2, 5.8),
      { fixtures: fixturesOne, completedSeason: 1, seasonLength: 50 },
    );
    const afterTwo = updateTransferRecords(
      createRNG("low-two"),
      afterOne,
      { "player-1": player({ currentAbility: 94 }) },
      ratingsFor(fixturesTwo, 1, 5.7),
      { fixtures: fixturesTwo, completedSeason: 2, seasonLength: 50 },
    )[0];

    expect(afterTwo.outcome).toBe("flop");
    expect(afterTwo.outcomeReason).toBe("limitedOpportunity");
    expect(afterTwo.outcomeReason).not.toMatch(/tactical|character/i);
  });

  it("records unknown minutes honestly and uses only post-transfer injuries", () => {
    const fixturesOne = fixturesFor(38, 1);
    const fixturesTwo = fixturesFor(38, 2);
    const injuredPlayer = player({
      currentAbility: 94,
      injuryHistory: {
        playerId: "player-1",
        injuries: [
          {
            id: "before-transfer",
            playerId: "player-1",
            type: "muscle",
            severity: "moderate",
            recoveryWeeks: 12,
            weeksRemaining: 0,
            reinjuryRisk: 0,
            occurredWeek: 2,
            occurredSeason: 1,
          },
          {
            id: "after-transfer",
            playerId: "player-1",
            type: "ligament",
            severity: "serious",
            recoveryWeeks: 8,
            weeksRemaining: 0,
            reinjuryRisk: 0.2,
            occurredWeek: 12,
            occurredSeason: 1,
          },
        ],
        totalWeeksMissed: 20,
        injuryProneness: 0.2,
        reinjuryWindowWeeksLeft: 0,
      },
    });
    const afterOne = updateTransferRecords(
      createRNG("injury-one"),
      [transfer(100, 10)],
      { "player-1": injuredPlayer },
      ratingsFor(fixturesOne, 12, 6.2, null),
      { fixtures: fixturesOne, completedSeason: 1, seasonLength: 38 },
    );
    const afterTwo = updateTransferRecords(
      createRNG("injury-two"),
      afterOne,
      { "player-1": injuredPlayer },
      ratingsFor(fixturesTwo, 2, 6.1, null),
      { fixtures: fixturesTwo, completedSeason: 2, seasonLength: 38 },
    )[0];

    expect(afterTwo.seasonParticipation?.[0]).toMatchObject({
      injuryIncidents: 1,
      recordedInjuryWeeks: 8,
    });
    expect(afterTwo.seasonParticipation?.[0].minutesPlayed).toBeUndefined();
    expect(afterTwo.seasonParticipation?.[0].appearancesWithoutMinutes).toBeGreaterThan(0);
    expect(afterTwo.outcomeReason).toBe("injury");
    expect(afterTwo.outcomeEvidence).toContainEqual(
      expect.stringContaining("Exact minutes were unavailable"),
    );
  });
});
