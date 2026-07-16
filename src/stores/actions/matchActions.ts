import type { GetState, SetState } from "./types";
import type { GameScreen } from "../gameStoreTypes";
import type {
  Activity,
  Fixture,
  GameState,
  InboxMessage,
  MatchEventType,
  Player,
} from "@/engine/core/types";
import type { LensType } from "@/engine/observation/types";
import {
  ACTIVITY_SLOT_COSTS,
  canAddActivity,
} from "@/engine/core/calendar";
import { selectStartingXI } from "@/engine/core/gameLoop";
import { createRNG } from "@/engine/rng";
import {
  generateMatchPhases,
  simulateMatchResult,
} from "@/engine/match/phases";
import {
  calculateAttendedMatchRatings,
  computeFormFromRatings,
} from "@/engine/match/ratings";
import {
  generateCardEvents,
  processCardAccumulation,
} from "@/engine/match/discipline";
import { processFocusedObservations } from "@/engine/match/focus";
import { computeScoutingBreakthroughBonus } from "@/engine/scout/perception";
import { getActiveToolBonuses } from "@/engine/tools/unlockables";
import { getActiveEquipmentBonuses } from "@/engine/finance";
import { checkTraitReveal } from "@/engine/players/traitReveal";
import { applyRegionalPresenceToObservation } from "@/engine/world/index";
import { validateAnomalyFromObservation } from "@/engine/data";
import { useTutorialStore } from "@/stores/tutorialStore";

export function createMatchActions(get: GetState, set: SetState) {
  return {
    // Match Lifecycle (scheduleMatch, startMatch, advancePhase, setFocus, endMatch)

  scheduleMatch: (fixtureId: string) => {
    const { gameState } = get();
    if (!gameState) return false;
    // Youth scouts cannot attend first-team matches
    if (gameState.scout.primarySpecialization === "youth") return false;

    const fixture = gameState.fixtures[fixtureId];
    if (!fixture) return false;

    // Guard: already scheduled
    const alreadyScheduled = gameState.schedule.activities.some(
      (a) => a !== null && a.type === "attendMatch" && a.targetId === fixtureId,
    );
    if (alreadyScheduled) return false;

    const slotCost = ACTIVITY_SLOT_COSTS.attendMatch;
    const homeClub = gameState.clubs[fixture.homeClubId];
    const awayClub = gameState.clubs[fixture.awayClubId];
    const activity: Activity = {
      type: "attendMatch",
      slots: slotCost,
      targetId: fixture.id,
      description: `Scout: ${homeClub?.shortName ?? "?"} vs ${awayClub?.shortName ?? "?"}`,
    };

    // Find first available consecutive slot window
    for (let dayIndex = 0; dayIndex <= 7 - slotCost; dayIndex++) {
      if (canAddActivity(gameState.schedule, activity, dayIndex)) {
        get().scheduleActivity(activity, dayIndex);
        return true;
      }
    }

    return false; // no room
  },

  // Match
  startMatch: (fixtureId: string) => {
    const { gameState } = get();
    if (!gameState) return;
    // Youth scouts cannot attend first-team league matches
    if (gameState.scout.primarySpecialization === "youth") return;
    const fixture = gameState.fixtures[fixtureId];
    if (!fixture) return;

    const homeClub = gameState.clubs[fixture.homeClubId];
    const awayClub = gameState.clubs[fixture.awayClubId];
    if (!homeClub || !awayClub) return;

    const homePlayers = selectStartingXI(
      homeClub,
      gameState.players,
      gameState.disciplinaryRecords,
      undefined,
      gameState.managerProfiles[homeClub.id],
    );
    const awayPlayers = selectStartingXI(
      awayClub,
      gameState.players,
      gameState.disciplinaryRecords,
      undefined,
      gameState.managerProfiles[awayClub.id],
    );

    const rng = createRNG(`${gameState.seed}-match-${fixtureId}`);
    const phases = generateMatchPhases(rng, {
      fixture,
      homePlayers,
      awayPlayers,
      weather: fixture.weather || "clear",
    });

    set({
      activeMatch: {
        fixtureId,
        phases,
        currentPhase: 0,
        focusSelections: [],
      },
      currentScreen: "match",
    });

    // Trigger first-match tutorial if the scout has never attended a match
    if (gameState.playedFixtures.length === 0) {
      useTutorialStore.getState().startSequence("firstMatch");
    }
    useTutorialStore.getState().completeMilestone("attendedMatch");
  },

  advancePhase: () => {
    const { activeMatch } = get();
    if (!activeMatch) return;
    if (activeMatch.currentPhase >= activeMatch.phases.length - 1) return;
    set({
      activeMatch: {
        ...activeMatch,
        currentPhase: activeMatch.currentPhase + 1,
      },
    });
  },

  setFocus: (playerId: string, lens: LensType) => {
    const { activeMatch } = get();
    if (!activeMatch) return;
    const existing = activeMatch.focusSelections.find((f) => f.playerId === playerId);
    if (existing) {
      set({
        activeMatch: {
          ...activeMatch,
          focusSelections: activeMatch.focusSelections.map((f) =>
            f.playerId === playerId
              ? {
                  ...f,
                  lens,
                  // Guard against duplicate phase indices (Fix #59)
                  phases: f.phases.includes(activeMatch.currentPhase)
                    ? f.phases
                    : [...f.phases, activeMatch.currentPhase],
                }
              : f
          ),
        },
      });
    } else {
      if (activeMatch.focusSelections.length >= 3) return; // Max 3 focus players
      set({
        activeMatch: {
          ...activeMatch,
          focusSelections: [
            ...activeMatch.focusSelections,
            { playerId, phases: [activeMatch.currentPhase], lens },
          ],
        },
      });
    }
    // Tutorial auto-advance: step expects "playerFocused"
    useTutorialStore.getState().checkAutoAdvance("playerFocused");
    useTutorialStore.getState().completeMilestone("focusedPlayer");
  },

  endMatch: () => {
    const { activeMatch, gameState } = get();
    if (!activeMatch || !gameState) return;

    const rng = createRNG(`${gameState.seed}-observe-${activeMatch.fixtureId}`);
    const newObservations = { ...gameState.observations };
    const breakthroughMessages: InboxMessage[] = [];
    const updatedPlayers = { ...gameState.players };
    const traitDiscoveries: Array<{ playerName: string; trait: string }> = [];

    // Issue 5a+6: Compute tool and equipment bonuses for observation confidence
    const toolBonuses = getActiveToolBonuses(gameState.unlockedTools);
    const equipBonuses = gameState.finances?.equipment
      ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
      : undefined;
    const equipBonus = equipBonuses?.observationConfidence ?? 0;

    for (const focus of activeMatch.focusSelections) {
      const player = updatedPlayers[focus.playerId];
      if (!player) continue;
      const existingObs = Object.values(gameState.observations).filter(
        (o) => o.playerId === focus.playerId
      );

      // Check for breakthrough BEFORE creating the observation
      const { isBreakthrough } = computeScoutingBreakthroughBonus(
        existingObs,
        focus.playerId,
        "liveMatch",
        focus.lens,
      );

      const observation = processFocusedObservations(
        rng,
        player,
        gameState.scout,
        activeMatch.phases,
        focus,
        "liveMatch",
        existingObs
      );
      observation.week = gameState.currentWeek;
      observation.season = gameState.currentSeason;
      observation.matchId = activeMatch.fixtureId;

      // Generate breakthrough inbox message
      if (isBreakthrough) {
        breakthroughMessages.push({
          id: `breakthrough_${player.id}_s${gameState.currentSeason}w${gameState.currentWeek}`,
          week: gameState.currentWeek,
          season: gameState.currentSeason,
          type: "feedback",
          title: `Breakthrough: ${player.firstName} ${player.lastName}`,
          body: `By observing ${player.firstName} ${player.lastName} across multiple settings, you've gained deeper insight into their true ability. Your confidence in this player's assessment has broken through to a new level.`,
          read: false,
          actionRequired: false,
          relatedId: player.id,
        });
      }

      // Apply tool confidence bonus + equipment observation bonus to readings
      const confBoost = (toolBonuses.confidenceBonus ?? 0) + equipBonus;
      if (confBoost > 0) {
        observation.attributeReadings = observation.attributeReadings.map((r) => ({
          ...r,
          confidence: Math.min(1, r.confidence + confBoost),
        }));
      }

      // Behavioral trait reveal: check each event type in the phase for trait discovery
      const playerTraits = player.playerTraits ?? [];
      const revealed = new Set(player.playerTraitsRevealed ?? []);
      const unrevealed = playerTraits.filter((t) => !revealed.has(t));
      if (unrevealed.length > 0) {
        const eventTypes = new Set(
          activeMatch.phases.flatMap((ph) =>
            ph.events
              .filter((e) => e.playerId === player.id)
              .map((e) => e.type)
          )
        );
        for (const eventType of eventTypes) {
          const traitResult = checkTraitReveal(rng, player, eventType as MatchEventType, gameState.scout);
          if (traitResult) {
            observation.revealedPlayerTrait = traitResult;
            revealed.add(traitResult);
            updatedPlayers[player.id] = {
              ...player,
              playerTraitsRevealed: [...revealed],
            };
            traitDiscoveries.push({
              playerName: `${player.firstName} ${player.lastName}`,
              trait: traitResult.replace(/([A-Z])/g, " $1").trim(),
            });
            break; // max one trait per observation
          }
        }
      }

      const presenceAdjustedObservation = applyRegionalPresenceToObservation(
        gameState,
        observation,
      );
      newObservations[presenceAdjustedObservation.id] = presenceAdjustedObservation;
    }

    // Simulate match result
    const fixture = gameState.fixtures[activeMatch.fixtureId];
    if (!fixture) {
      set({ activeMatch: null, lastMatchResult: null, currentScreen: "dashboard" });
      return;
    }
    const homeClub = gameState.clubs[fixture.homeClubId];
    const awayClub = gameState.clubs[fixture.awayClubId];
    if (!homeClub || !awayClub) {
      set({ activeMatch: null, lastMatchResult: null, currentScreen: "dashboard" });
      return;
    }
    const homePlayers = selectStartingXI(
      homeClub,
      gameState.players,
      gameState.disciplinaryRecords,
      undefined,
      gameState.managerProfiles[homeClub.id],
    );
    const awayPlayers = selectStartingXI(
      awayClub,
      gameState.players,
      gameState.disciplinaryRecords,
      undefined,
      gameState.managerProfiles[awayClub.id],
    );
    const resultRng = createRNG(`${gameState.seed}-result-${activeMatch.fixtureId}`);
    const result = simulateMatchResult(resultRng, homeClub, awayClub, homePlayers, awayPlayers);

    const updatedFixture: Fixture = {
      ...fixture,
      played: true,
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
    };

    // Mark this fixture as interactively played so advanceWeek() won't re-queue it
    const alreadyPlayed = gameState.playedFixtures.includes(activeMatch.fixtureId);
    const updatedPlayedFixtures = alreadyPlayed
      ? gameState.playedFixtures
      : [...gameState.playedFixtures, activeMatch.fixtureId];

    let updatedGameState: GameState = {
      ...gameState,
      players: updatedPlayers,
      observations: newObservations,
      fixtures: { ...gameState.fixtures, [fixture.id]: updatedFixture },
      playedFixtures: updatedPlayedFixtures,
      inbox: [...gameState.inbox, ...breakthroughMessages],
    };

    // --- Data anomaly validation ---
    // When a data scout attends a match where a flagged player is observed,
    // validate/refute the anomaly using the live observations.
    let anyAnomalyValidated = false;
    if (
      gameState.scout.primarySpecialization === "data" &&
      gameState.anomalyFlags.length > 0
    ) {
      const uninvestigated = gameState.anomalyFlags.filter((a) => !a.investigated);
      const observedPlayerIds = new Set(
        activeMatch.focusSelections.map((f) => f.playerId),
      );

      let updatedAnomalyFlags = [...gameState.anomalyFlags];

      for (const anomaly of uninvestigated) {
        if (!observedPlayerIds.has(anomaly.playerId)) continue;

        const playerObs = Object.values(newObservations).filter(
          (o) => o.playerId === anomaly.playerId,
        );
        const player = gameState.players[anomaly.playerId];
        if (!player) continue;

        const result = validateAnomalyFromObservation(anomaly, player, playerObs);

        updatedAnomalyFlags = updatedAnomalyFlags.map((a) =>
          a.id === anomaly.id ? result.updatedAnomaly : a,
        );

        if (result.validated) anyAnomalyValidated = true;
      }

      updatedGameState = { ...updatedGameState, anomalyFlags: updatedAnomalyFlags };
    }

    // Determine where to navigate when the user dismisses the summary screen.
    // If this match was launched from the advanceWeek() gate (i.e., it was a
    // scheduled attendMatch activity), return to the calendar so the user can
    // click "Advance Week" again and either play the next pending match or
    // proceed with the week. Otherwise go to the dashboard as before.
    const wasScheduled = gameState.schedule.activities.some(
      (a) => a?.type === "attendMatch" && a.targetId === activeMatch.fixtureId,
    );
    const continueScreen: GameScreen = wasScheduled ? "calendar" : "dashboard";

    // --- Match ratings: calculate attended ratings for all players ---
    const attendedRatings = calculateAttendedMatchRatings(
      activeMatch.phases,
      homePlayers,
      awayPlayers,
      result.homeGoals,
      result.awayGoals,
      activeMatch.fixtureId,
    );

    // Store ratings in gameState.matchRatings and update player form
    const ratingPlayers = { ...updatedGameState.players };
    for (const [playerId, rating] of Object.entries(attendedRatings)) {
      const player = ratingPlayers[playerId];
      if (!player) continue;
      const newEntry = {
        fixtureId: activeMatch.fixtureId,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
        rating: rating.rating,
      };
      const recent = [...(player.recentMatchRatings ?? []), newEntry].slice(-6);
      const form = computeFormFromRatings(recent);
      ratingPlayers[playerId] = { ...player, recentMatchRatings: recent, form };
    }

    updatedGameState = {
      ...updatedGameState,
      players: ratingPlayers,
      matchRatings: {
        ...updatedGameState.matchRatings,
        [activeMatch.fixtureId]: attendedRatings,
      },
    };

    // --- Discipline: generate card events from attended match phases ---
    const allMatchPlayers = new Map<string, Player>();
    for (const p of [...homePlayers, ...awayPlayers]) {
      allMatchPlayers.set(p.id, p);
    }
    const cardRng = createRNG(`${gameState.seed}-cards-${activeMatch.fixtureId}`);
    const { cards: matchCards, updatedPhases: phasesWithCards } = generateCardEvents(
      cardRng,
      activeMatch.phases,
      allMatchPlayers,
      activeMatch.fixtureId,
    );

    // Process card accumulation
    const currentDisciplinary = gameState.disciplinaryRecords ?? {};
    const { updatedRecords: newDisciplinary } =
      processCardAccumulation(matchCards, currentDisciplinary, gameState.currentSeason);

    // Apply disciplinary records to game state
    updatedGameState = {
      ...updatedGameState,
      disciplinaryRecords: newDisciplinary,
    };

    // Suppress unused variable warnings
    void phasesWithCards;

    set({
      gameState: updatedGameState,
      activeMatch: null,
      lastMatchResult: {
        fixtureId: activeMatch.fixtureId,
        focusedPlayerIds: activeMatch.focusSelections.map((f) => f.playerId),
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        continueScreen,
        traitDiscoveries: traitDiscoveries.length > 0 ? traitDiscoveries : undefined,
        playerRatings: attendedRatings,
        cardEvents: matchCards.length > 0 ? matchCards : undefined,
      },
      currentScreen: "matchSummary",
    });

    useTutorialStore.getState().completeMilestone("completedMatch");

    // Regional aha moment: first match in a region where the scout has familiarity >= 20
    if (
      gameState.scout.primarySpecialization === "regional" &&
      !useTutorialStore.getState().completedSequences.has("ahaMoment:regional")
    ) {
      const fixtureLeague = gameState.leagues[fixture.leagueId];
      if (fixtureLeague) {
        const matchCountry = fixtureLeague.country;
        const hasRegionalFamiliarity = Object.values(gameState.subRegions).some(
          (sr) => sr.country === matchCountry && sr.familiarity >= 20,
        );
        if (hasRegionalFamiliarity) {
          useTutorialStore.getState().queueSequence("ahaMoment:regional");
        }
      }
    }

    // Data aha: first anomaly validated via live observation
    if (
      anyAnomalyValidated &&
      !useTutorialStore.getState().completedSequences.has("ahaMoment:data")
    ) {
      useTutorialStore.getState().queueSequence("ahaMoment:data");
    }
  },
  };
}
