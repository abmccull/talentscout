import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SCENARIOS } from "@/engine/scenarios";
import type { GameState } from "@/engine/core";

let rescueState: GameState;
const opening = { week: 20, season: 1 } as const;

function collectRescueWorldEvidence(state: GameState) {
  const pastFixtures = Object.values(state.fixtures).filter((fixture) =>
    fixture.season === opening.season && fixture.week < opening.week
  );
  const futureFixtures = Object.values(state.fixtures).filter((fixture) =>
    fixture.season === opening.season && fixture.week >= opening.week
  );
  const ratingFixtures = Object.entries(state.matchRatings);
  const appearancesByPlayer = new Map<string, number>();
  for (const [, ratings] of ratingFixtures) {
    for (const playerId of Object.keys(ratings)) {
      appearancesByPlayer.set(playerId, (appearancesByPlayer.get(playerId) ?? 0) + 1);
    }
  }
  const playersWithRecentEvidence = Object.values(state.players).filter(
    (player) => (player.recentMatchRatings?.length ?? 0) > 0,
  );
  const disciplinaryRecords = Object.values(state.disciplinaryRecords ?? {});
  const playersWithInjuryHistory = Object.values(state.players).filter(
    (player) => (player.injuryHistory?.injuries.length ?? 0) > 0,
  );

  return {
    stateSummary: {
      activeScenarioId: state.activeScenarioId,
      currentWeek: state.currentWeek,
      currentSeason: state.currentSeason,
      schedule: state.schedule,
      weeklyStrategy: state.weeklyStrategy && {
        lastChangedWeek: state.weeklyStrategy.lastChangedWeek,
        lastChangedSeason: state.weeklyStrategy.lastChangedSeason,
      },
      transferWindow: state.transferWindow && {
        type: state.transferWindow.type,
        isOpen: state.transferWindow.isOpen,
      },
      careerChronology: state.careerChronology && {
        startedSeason: state.careerChronology.startedSeason,
        lastAgedSeason: state.careerChronology.lastAgedSeason,
        completedSeasons: state.careerChronology.completedSeasons,
      },
    },
    tierReachedAt: state.careerChronology?.tierReachedAt[state.scout.careerTier],
    inboxCount: state.inbox.length,
    inboxAtOpening: state.inbox.every((message) =>
      message.week === opening.week && message.season === opening.season
    ),
    pastFixtureCount: pastFixtures.length,
    pastFixturesCoherent: pastFixtures.every((fixture) =>
      fixture.played
      && fixture.homeGoals !== undefined
      && fixture.awayGoals !== undefined
    ),
    hasFutureUnplayedFixture: futureFixtures.some((fixture) => !fixture.played),
    ratingFixtureCount: ratingFixtures.length,
    ratingFixturesCoherent: ratingFixtures.every(([fixtureId, ratings]) => {
      const fixture = state.fixtures[fixtureId];
      return Boolean(
        fixture
        && fixture.played
        && fixture.season === opening.season
        && fixture.week < opening.week
        && Object.entries(ratings).every(([playerId, rating]) =>
          rating.playerId === playerId
          && rating.fixtureId === fixtureId
          && Boolean(state.players[playerId])
        )
      );
    }),
    hasRatedFixture: ratingFixtures.some(([, ratings]) => Object.keys(ratings).length > 0),
    maxAppearances: appearancesByPlayer.size > 0
      ? Math.max(...appearancesByPlayer.values())
      : 0,
    recentEvidencePlayerCount: playersWithRecentEvidence.length,
    recentEvidenceCoherent: playersWithRecentEvidence.every((player) => {
      const recent = player.recentMatchRatings ?? [];
      return recent.length <= 6 && recent.every((entry, index) => {
        const previous = recent[index - 1];
        return entry.season === opening.season
          && entry.week < opening.week
          && state.fixtures[entry.fixtureId]?.played === true
          && state.matchRatings[entry.fixtureId]?.[player.id]?.rating === entry.rating
          && (!previous || entry.season * 1000 + entry.week
            >= previous.season * 1000 + previous.week);
      });
    }),
    disciplinaryRecordCount: disciplinaryRecords.length,
    disciplinaryRecordsCoherent: disciplinaryRecords.every((record) =>
      record.season === opening.season
      && record.cardHistory.every((card) => {
        const fixture = state.fixtures[card.fixtureId];
        return Boolean(
          fixture
          && fixture.played
          && fixture.season === opening.season
          && fixture.week < opening.week
          && state.players[card.playerId]
        );
      })
    ),
    injuryHistoryPlayerCount: playersWithInjuryHistory.length,
    injuryHistoriesCoherent: playersWithInjuryHistory.every((player) => {
      const injuries = player.injuryHistory?.injuries ?? [];
      const eventsCoherent = injuries.every((injury) =>
        injury.playerId === player.id
        && injury.occurredSeason === opening.season
        && injury.occurredWeek < opening.week
      );
      const chronologyCoherent = injuries.every((injury, index) =>
        index === 0 || injury.occurredWeek >= injuries[index - 1].occurredWeek
      );
      const currentInjuryCoherent = !player.currentInjury || (
        player.injured
        && player.injuryWeeksRemaining > 0
        && injuries.some((injury) => injury.id === player.currentInjury?.id)
      );
      return eventsCoherent && chronologyCoherent && currentInjuryCoherent;
    }),
    totalWeeksPlayed: state.totalWeeksPlayed,
    pastSeasonEventsResolved: state.seasonEvents
      .filter((event) => event.endWeek < opening.week)
      .every((event) => event.resolved),
    youthTournamentsInOpeningSeason: Object.values(state.youthTournaments)
      .every((tournament) => tournament.season === opening.season),
    openBriefsAtOpening: Object.values(state.youthRecruitmentBriefs)
      .filter((brief) => brief.status === "open")
      .every((brief) =>
        brief.createdWeek === opening.week
        && brief.createdSeason === opening.season
      ),
    worldConditionSeason: state.worldConditionState?.activeSeason,
    worldArcsAtOpening: Object.values(state.worldConditionArcState?.active ?? {})
      .every((arc) =>
        arc.startedAt.week === opening.week
        && arc.startedAt.season === opening.season
      ),
    careerEraStartedAt: state.careerEraDirectorState?.current?.startedAt,
    stakeholderProfilesAtOpening: Object.values(state.stakeholderProfiles?.profiles ?? {})
      .every((profile) => profile.createdAt.week === opening.week
        && profile.createdAt.season === opening.season),
    culturalCalendarsInOpeningSeason: Object.values(state.culturalCalendarState?.calendars ?? {})
      .every((calendar) => calendar.season === opening.season),
  };
}

let rescueEvidence: ReturnType<typeof collectRescueWorldEvidence>;

beforeAll(async () => {
  // Building a mid-season scenario intentionally generates the inherited world
  // history that the assertions inspect. Keep that integration-fixture work out
  // of the timed assertion so a cold module graph or busy worker cannot turn a
  // coherent world into a false test failure.
  vi.stubEnv("NEXT_PUBLIC_YOUTH_EARLY_ACCESS", "false");
  vi.resetModules();
  try {
    const { useGameStore } = await import("@/stores/gameStore");
    useGameStore.getState().setSelectedScenario("the_rescue_job");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Scenario",
      scoutLastName: "Integrity",
      scoutAge: 31,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "scenario-opening-coherence",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
    });
    rescueState = useGameStore.getState().gameState!;
    rescueEvidence = collectRescueWorldEvidence(rescueState);
  } finally {
    vi.unstubAllEnvs();
  }
}, 120_000);

describe("scenario opening coherence", () => {
  it("uses the one-based engine season model for every shipped challenge", () => {
    expect(SCENARIOS.every((scenario) => scenario.setup.startingSeason === 1)).toBe(true);
  });

  it("builds the Rescue Job as one coherent mid-season world", () => {
    const evidence = rescueEvidence;
    expect(evidence.stateSummary).toMatchObject({
      activeScenarioId: "the_rescue_job",
      currentWeek: opening.week,
      currentSeason: opening.season,
      schedule: opening,
      weeklyStrategy: {
        lastChangedWeek: opening.week,
        lastChangedSeason: opening.season,
      },
      transferWindow: {
        type: "winter",
        isOpen: true,
      },
      careerChronology: {
        startedSeason: opening.season,
        lastAgedSeason: opening.season,
        completedSeasons: 0,
      },
    });
    expect(evidence.tierReachedAt).toEqual(opening);
    expect(evidence.inboxCount).toBeGreaterThan(0);
    expect(evidence.inboxAtOpening).toBe(true);
    expect(evidence.pastFixtureCount).toBeGreaterThan(0);
    expect(evidence.pastFixturesCoherent).toBe(true);
    expect(evidence.hasFutureUnplayedFixture).toBe(true);
    expect(evidence.ratingFixtureCount).toBeGreaterThan(0);
    expect(evidence.ratingFixturesCoherent).toBe(true);
    expect(evidence.hasRatedFixture).toBe(true);
    expect(evidence.maxAppearances).toBeGreaterThan(0);
    expect(evidence.recentEvidencePlayerCount).toBeGreaterThan(0);
    expect(evidence.recentEvidenceCoherent).toBe(true);
    expect(evidence.disciplinaryRecordCount).toBeGreaterThan(0);
    expect(evidence.disciplinaryRecordsCoherent).toBe(true);
    expect(evidence.injuryHistoryPlayerCount).toBeGreaterThan(0);
    expect(evidence.injuryHistoriesCoherent).toBe(true);

    // Inherited world history must not masquerade as weeks played by the
    // scout or mint any of the normal weekly player-facing rewards.
    expect(evidence.totalWeeksPlayed).toBe(0);
    expect(evidence.pastSeasonEventsResolved).toBe(true);
    expect(evidence.youthTournamentsInOpeningSeason).toBe(true);
    expect(evidence.openBriefsAtOpening).toBe(true);
    expect(evidence.worldConditionSeason).toBe(opening.season);
    expect(evidence.worldArcsAtOpening).toBe(true);
    expect(evidence.careerEraStartedAt).toEqual(opening);
    expect(evidence.stakeholderProfilesAtOpening).toBe(true);
    expect(evidence.culturalCalendarsInOpeningSeason).toBe(true);
  });
});
