import type { GameState } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { processTrialOutcome } from "@/engine/firstTeam";
import {
  generateAnalystReport,
  resolvePredictions,
  updateAnalystMorale,
} from "@/engine/data";

export interface WeeklySpecializationSystemsInput {
  state: GameState;
  analyticsTeamMeetingsExecuted: number;
  predictionAccuracyBonus: number;
}

/** Resolve specialization-specific staff work before the shared world tick. */
export function processWeeklySpecializationSystems(
  input: WeeklySpecializationSystemsInput,
): GameState {
  let state = input.state;

  if (state.scout.primarySpecialization === "firstTeam") {
    const pendingTrials = state.clubResponses.filter(
      (response) => response.response === "trial",
    );
    if (pendingTrials.length > 0 && state.scout.currentClubId) {
      const rng = createRNG(
        `${state.seed}-trialresolve-${state.currentWeek}-${state.currentSeason}`,
      );
      const club = state.clubs[state.scout.currentClubId];
      if (club) {
        state = {
          ...state,
          clubResponses: state.clubResponses.map((response) => {
            if (response.response !== "trial") return response;
            const player = state.players[response.reportId]
              ?? Object.values(state.players).find((candidate) =>
                state.reports[response.reportId]?.playerId === candidate.id,
              );
            return player
              ? { ...response, response: processTrialOutcome(rng, player, club, state.players) }
              : response;
          }),
        };
      }
    }
  }

  if (state.scout.primarySpecialization !== "data") return state;

  if (state.dataAnalysts.length > 0) {
    const rng = createRNG(
      `${state.seed}-passivereports-${state.currentWeek}-${state.currentSeason}`,
    );
    const analysts = [...state.dataAnalysts];
    const reports = { ...state.analystReports };
    const hadMeeting = input.analyticsTeamMeetingsExecuted > 0;

    for (let index = 0; index < analysts.length; index += 1) {
      const analyst = analysts[index];
      if (!analyst.assignedLeagueId) {
        analysts[index] = updateAnalystMorale(analyst, { ignored: true });
        continue;
      }
      const league = state.leagues[analyst.assignedLeagueId];
      if (!league) continue;
      const reportId = `passive-${analyst.id}-w${state.currentWeek}-s${state.currentSeason}`;
      if (!reports[reportId]) {
        reports[reportId] = generateAnalystReport(
          rng,
          analyst,
          league,
          state.players,
          state.currentSeason,
          state.currentWeek,
          reportId,
        );
      }
      if (!hadMeeting) {
        analysts[index] = updateAnalystMorale(analyst, { ignored: false });
      }
    }
    state = { ...state, dataAnalysts: analysts, analystReports: reports };
  }

  if (state.predictions.length > 0) {
    const rng = createRNG(
      `${state.seed}-predresolve-${state.currentWeek}-${state.currentSeason}`,
    );
    const freeAgentPlayerIds = new Set(
      (state.freeAgentPool?.agents ?? []).map((agent) => agent.playerId),
    );
    const predictions = resolvePredictions(
      state.predictions,
      state.players,
      state.currentSeason,
      state.currentWeek,
      rng,
      freeAgentPlayerIds,
      input.predictionAccuracyBonus,
    );
    if (predictions.some((prediction, index) => prediction !== state.predictions[index])) {
      state = { ...state, predictions };
    }
  }

  return state;
}
