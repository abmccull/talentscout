import { computeFormFromRatings } from "../../match/ratings";
import {
  applyDevelopmentAbilityChange,
  hasSemanticImprovement,
} from "../../players/development";
import {
  appendPlayerDevelopmentHistory,
  createPlayerDevelopmentHistoryEntry,
} from "../../world/developmentEnvironment";
import type { GameState, Player, PlayerAttribute } from "../types";
import type { TickResult } from "./types";

type Clamp = (value: number, min: number, max: number) => number;
type AddToInjuryHistory = (
  player: Player,
  injury: TickResult["injuries"][number]["injury"],
) => Player["injuryHistory"];

export function applyWeeklyPlayerProgression(
  state: GameState,
  tickResult: Pick<TickResult, "playerDevelopment" | "breakthroughs" | "injurySetbacks">,
  clamp: Clamp,
): Record<string, Player> {
  const updatedPlayers = { ...state.players };

  for (const dev of tickResult.playerDevelopment) {
    const player = updatedPlayers[dev.playerId];
    if (!player) continue;

    const updatedAttributes = { ...player.attributes };
    for (const [attr, delta] of Object.entries(dev.changes) as Array<
      [PlayerAttribute, number | undefined]
    >) {
      if (delta === undefined) continue;
      updatedAttributes[attr] = clamp(updatedAttributes[attr] + delta, 1, 20);
    }

    updatedPlayers[dev.playerId] = {
      ...player,
      attributes: updatedAttributes,
      currentAbility: applyDevelopmentAbilityChange(
        player.currentAbility,
        player.potentialAbility,
        dev.abilityChange,
      ),
      developmentHistory: dev.environment
        ? appendPlayerDevelopmentHistory(
            player.developmentHistory,
            createPlayerDevelopmentHistoryEntry(
              player.id,
              state.currentSeason,
              state.currentWeek,
              dev.abilityChange > 0 || hasSemanticImprovement(dev.changes)
                ? "routine-growth"
                : "decline",
              dev.environment,
            ),
          )
        : player.developmentHistory,
    };
  }

  for (const bt of tickResult.breakthroughs) {
    const player = updatedPlayers[bt.playerId];
    if (!player) continue;

    const updatedAttributes = { ...player.attributes };
    for (const [attr, delta] of Object.entries(bt.changes) as Array<
      [PlayerAttribute, number | undefined]
    >) {
      if (delta === undefined) continue;
      updatedAttributes[attr] = clamp(updatedAttributes[attr] + delta, 1, 20);
    }

    updatedPlayers[bt.playerId] = {
      ...player,
      attributes: updatedAttributes,
      currentAbility: applyDevelopmentAbilityChange(
        player.currentAbility,
        player.potentialAbility,
        bt.abilityChange,
      ),
      developmentHistory: bt.environment
        ? appendPlayerDevelopmentHistory(
            player.developmentHistory,
            createPlayerDevelopmentHistoryEntry(
              player.id,
              state.currentSeason,
              state.currentWeek,
              "breakthrough",
              bt.environment,
            ),
          )
        : player.developmentHistory,
    };
  }

  for (const setback of tickResult.injurySetbacks) {
    const player = updatedPlayers[setback.playerId];
    if (!player) continue;

    const updatedAttributes = { ...player.attributes };
    for (const [attr, delta] of Object.entries(setback.changes) as Array<
      [PlayerAttribute, number | undefined]
    >) {
      if (delta === undefined) continue;
      updatedAttributes[attr] = clamp(updatedAttributes[attr] + delta, 1, 20);
    }

    updatedPlayers[setback.playerId] = {
      ...player,
      attributes: updatedAttributes,
      developmentHistory: setback.environment
        ? appendPlayerDevelopmentHistory(
            player.developmentHistory,
            createPlayerDevelopmentHistoryEntry(
              player.id,
              state.currentSeason,
              state.currentWeek,
              "injury-setback",
              setback.environment,
            ),
          )
        : player.developmentHistory,
    };
  }

  return updatedPlayers;
}

export function applyWeeklyFormAndAvailability(
  updatedPlayers: Record<string, Player>,
  tickResult: Pick<TickResult, "formMomentumUpdates" | "injuries">,
  clamp: Clamp,
  addToInjuryHistory: AddToInjuryHistory,
): {
  updatedPlayers: Record<string, Player>;
  newlyInjuredPlayerIds: Set<string>;
} {
  const nextPlayers = { ...updatedPlayers };

  for (const fmUpdate of tickResult.formMomentumUpdates) {
    const player = nextPlayers[fmUpdate.playerId];
    if (!player) continue;
    nextPlayers[fmUpdate.playerId] = {
      ...player,
      form: clamp(Math.round(fmUpdate.form * 10) / 10, -3, 3),
      formMomentum: fmUpdate.formMomentum,
      formTrend: fmUpdate.formTrend,
      formLockWeeks: fmUpdate.formLockWeeks,
    };
  }

  for (const [id, player] of Object.entries(nextPlayers)) {
    if (player.injured && player.injuryWeeksRemaining > 0) {
      const newRemaining = player.injuryWeeksRemaining - 1;
      const justRecovered = newRemaining === 0;
      const updatedCurrentInjury = player.currentInjury
        ? { ...player.currentInjury, weeksRemaining: newRemaining }
        : undefined;
      const updatedHistory = justRecovered && player.injuryHistory
        ? { ...player.injuryHistory, reinjuryWindowWeeksLeft: 4 }
        : player.injuryHistory;

      nextPlayers[id] = {
        ...player,
        injuryWeeksRemaining: newRemaining,
        injured: !justRecovered,
        currentInjury: justRecovered ? undefined : updatedCurrentInjury,
        injuryHistory: updatedHistory,
      };
    } else if (!player.injured && player.injuryHistory && player.injuryHistory.reinjuryWindowWeeksLeft > 0) {
      nextPlayers[id] = {
        ...player,
        injuryHistory: {
          ...player.injuryHistory,
          reinjuryWindowWeeksLeft: player.injuryHistory.reinjuryWindowWeeksLeft - 1,
        },
      };
    }
  }

  const newlyInjuredPlayerIds = new Set<string>();
  for (const injuryResult of tickResult.injuries) {
    const player = nextPlayers[injuryResult.playerId];
    if (!player) continue;
    newlyInjuredPlayerIds.add(injuryResult.playerId);
    nextPlayers[injuryResult.playerId] = {
      ...player,
      injured: true,
      injuryWeeksRemaining: injuryResult.weeksOut,
      currentInjury: injuryResult.injury,
      injuryHistory: addToInjuryHistory(player, injuryResult.injury),
    };
  }

  return {
    updatedPlayers: nextPlayers,
    newlyInjuredPlayerIds,
  };
}

export function applyWeeklyFixtureRatings(
  state: GameState,
  updatedPlayers: Record<string, Player>,
  fixturesPlayed: TickResult["fixturesPlayed"],
): {
  updatedPlayers: Record<string, Player>;
  updatedMatchRatings: GameState["matchRatings"];
} {
  const nextPlayers = { ...updatedPlayers };
  const updatedMatchRatings = { ...state.matchRatings };

  for (const played of fixturesPlayed) {
    if (!played.playerRatings) continue;
    updatedMatchRatings[played.id] = played.playerRatings;

    for (const [playerId, rating] of Object.entries(played.playerRatings)) {
      const player = nextPlayers[playerId];
      if (!player) continue;

      const newEntry = {
        fixtureId: played.id,
        week: state.currentWeek,
        season: state.currentSeason,
        rating: rating.rating,
      };
      const recent = [...(player.recentMatchRatings ?? []), newEntry].slice(-6);
      nextPlayers[playerId] = {
        ...player,
        recentMatchRatings: recent,
        form: computeFormFromRatings(recent, player),
      };
    }
  }

  return { updatedPlayers: nextPlayers, updatedMatchRatings };
}
