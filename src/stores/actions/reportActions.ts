/**
 * Report writing & submission actions extracted from gameStore.
 *
 * Handles starting a report, generating content, submitting with conviction,
 * quality scoring, club response generation, discovery recording,
 * prediction auto-generation, and retainer/client delivery tracking.
 */
import type { GetState, SetState } from "./types";
import type { ConvictionLevel, InboxMessage } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { getDifficultyModifiers } from "@/engine/core/difficulty";
import { generateReportContent, finalizeReport, calculateReportQuality } from "@/engine/reports/reporting";
import { updateReputation } from "@/engine/career/progression";
import { recordDiscovery } from "@/engine/career/index";
import {
  evaluateReportAgainstDirectives,
  generateClubResponse,
  calculateSystemFit,
} from "@/engine/firstTeam";
import {
  getActiveEquipmentBonuses,
  calculateInfrastructureEffects,
  recordRetainerDelivery,
  ensureClientRelationship,
  recordClientDelivery,
} from "@/engine/finance";
import {
  createPrediction,
  generatePredictionSuggestions,
} from "@/engine/data";
import { useTutorialStore } from "@/stores/tutorialStore";

export function createReportActions(get: GetState, set: SetState) {
  return {
    startReport: (playerId: string) => {
      set({ selectedPlayerId: playerId, currentScreen: "reportWriter" });
      // Use the more detailed firstReportWriting tutorial for first-timers
      useTutorialStore.getState().startSequence("firstReportWriting");
      useTutorialStore.getState().completeMilestone("wroteReport");
    },

    submitReport: (conviction: ConvictionLevel, summary: string, strengths: string[], weaknesses: string[]) => {
      const { gameState, selectedPlayerId } = get();
      if (!gameState || !selectedPlayerId) return;

      const player = gameState.players[selectedPlayerId]
        ?? gameState.unsignedYouth[selectedPlayerId]?.player;
      if (!player) return;

      const observations = Object.values(gameState.observations).filter(
        (o) => o.playerId === selectedPlayerId
      );
      const draft = generateReportContent(player, observations, gameState.scout);
      const report = finalizeReport(
        draft,
        conviction,
        summary,
        strengths,
        weaknesses,
        gameState.scout,
        gameState.currentWeek,
        gameState.currentSeason,
        selectedPlayerId
      );

      // F14: Include infrastructure + equipment report quality bonus
      const infraEffectsForReport = calculateInfrastructureEffects(gameState.scoutingInfrastructure);
      const submitEquipBonuses = gameState.finances?.equipment
        ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
        : undefined;
      const quality = calculateReportQuality(report, player, infraEffectsForReport.reportQualityBonus + (submitEquipBonuses?.reportQuality ?? 0));

      const repBefore = gameState.scout.reputation;
      const baseUpdatedScout = updateReputation(gameState.scout, {
        type: "reportSubmitted",
        quality,
      });
      // Apply difficulty reputation multiplier to the delta
      const repDelta = baseUpdatedScout.reputation - gameState.scout.reputation;
      const diffMods = getDifficultyModifiers(gameState.difficulty);
      const adjustedRep = Math.max(0, Math.min(100,
        gameState.scout.reputation + Math.round(repDelta * diffMods.reputationMultiplier),
      ));
      const updatedScout = {
        ...baseUpdatedScout,
        reputation: adjustedRep,
        reportsSubmitted: baseUpdatedScout.reportsSubmitted + 1,
      };
      const reputationDelta = +(updatedScout.reputation - repBefore).toFixed(1);
      let scoredReport = { ...report, qualityScore: quality, reputationDelta };

      // Record discovery if this player has not been tracked before
      const alreadyDiscovered = gameState.discoveryRecords.some(
        (r) => r.playerId === selectedPlayerId,
      );
      const newDiscoveryRecord = alreadyDiscovered
        ? null
        : recordDiscovery(player, gameState.scout, gameState.currentWeek, gameState.currentSeason);

      const updatedDiscoveryRecords = newDiscoveryRecord
        ? [...gameState.discoveryRecords, newDiscoveryRecord]
        : gameState.discoveryRecords;

      // First-team: evaluate report against directives and generate club response
      let updatedClubResponses = gameState.clubResponses;
      let responseInboxMessage: InboxMessage | null = null;
      let updatedScoutAfterResponse = updatedScout;
      let firstTeamAhaTriggered = false;
      let updatedSystemFitCache = gameState.systemFitCache;

      if (
        gameState.scout.primarySpecialization === "firstTeam" &&
        gameState.scout.currentClubId
      ) {
        const responseRng = createRNG(
          `${gameState.seed}-response-${scoredReport.id}`,
        );
        const responsePlayer = gameState.players[selectedPlayerId];
        const responseClub = gameState.clubs[gameState.scout.currentClubId];
        const responseManager = gameState.managerProfiles[gameState.scout.currentClubId];

        if (responsePlayer && responseClub && responseManager) {
          // Calculate system fit for this player-club combination
          const fitRng = createRNG(
            `${gameState.seed}-sysfit-${selectedPlayerId}-${gameState.scout.currentClubId}`,
          );
          const fitAccuracy = submitEquipBonuses?.systemFitAccuracy ?? 0;
          const systemFitResult = calculateSystemFit(
            responsePlayer,
            responseClub,
            responseManager,
            gameState.players,
            undefined,
            fitAccuracy,
            fitRng,
          );
          const fitCacheKey = `${selectedPlayerId}:${gameState.scout.currentClubId}`;
          updatedSystemFitCache = { ...updatedSystemFitCache, [fitCacheKey]: systemFitResult };
          scoredReport = { ...scoredReport, systemFitScore: systemFitResult.overallFit };

          const directiveMatch = evaluateReportAgainstDirectives(
            scoredReport,
            gameState.managerDirectives,
            responsePlayer,
            responseClub,
          );
          const matchedDirective = directiveMatch
            ? gameState.managerDirectives.find((d) => d.id === directiveMatch.directiveId)
            : undefined;
          let clubResponse = generateClubResponse(
            responseRng,
            scoredReport,
            responsePlayer,
            responseClub,
            responseManager,
            matchedDirective,
            updatedScout,
            systemFitResult.overallFit,
          );

          // First-outcome guarantee: first report with conviction >= recommend
          // always gets at least "interested" to ensure the aha moment fires early.
          const GUARANTEED_CONVICTIONS = new Set(["recommend", "strongRecommend", "tablePound"]);
          const hasNoPriorResponses = gameState.clubResponses.length === 0;
          const NEGATIVE_RESPONSES = new Set(["ignored", "doesNotFit", "tooExpensive"]);
          if (
            hasNoPriorResponses &&
            GUARANTEED_CONVICTIONS.has(conviction) &&
            NEGATIVE_RESPONSES.has(clubResponse.response)
          ) {
            clubResponse = {
              ...clubResponse,
              response: "interested",
              feedback: `The manager has added ${responsePlayer.firstName} ${responsePlayer.lastName} to the shortlist based on your report. Keep scouting — this is a promising start.`,
              reputationDelta: Math.max(clubResponse.reputationDelta, 2),
            };
          }

          updatedClubResponses = [...gameState.clubResponses, clubResponse];

          // Check for first-team aha moment: first positive response
          const POSITIVE_RESPONSES = new Set(["interested", "trial", "signed", "loanSigned"]);
          if (
            POSITIVE_RESPONSES.has(clubResponse.response) &&
            !gameState.clubResponses.some((r) => POSITIVE_RESPONSES.has(r.response))
          ) {
            firstTeamAhaTriggered = true;
          }

          // Apply reputation delta from club response
          const repAfterResponse = Math.max(
            0,
            Math.min(100, updatedScoutAfterResponse.reputation + clubResponse.reputationDelta),
          );
          updatedScoutAfterResponse = {
            ...updatedScoutAfterResponse,
            reputation: repAfterResponse,
          };

          responseInboxMessage = {
            id: `club-response-${scoredReport.id}`,
            week: gameState.currentWeek,
            season: gameState.currentSeason,
            type: "feedback" as const,
            title: `Club Response: ${responsePlayer.firstName} ${responsePlayer.lastName}`,
            body: `${clubResponse.feedback}\n\nReputation change: ${clubResponse.reputationDelta >= 0 ? "+" : ""}${clubResponse.reputationDelta}`,
            read: false,
            actionRequired: false,
            relatedId: selectedPlayerId,
            relatedEntityType: "player" as const,
          };
        }
      }

      // Data scout: auto-generate prediction when submitting strong-conviction reports
      let updatedPredictions = gameState.predictions;
      if (
        gameState.scout.primarySpecialization === "data" &&
        (conviction === "strongRecommend" || conviction === "tablePound")
      ) {
        const predRng = createRNG(`${gameState.seed}-pred-${scoredReport.id}`);
        const suggestions = generatePredictionSuggestions(
          predRng,
          gameState.scout,
          player,
          gameState.currentSeason,
        );
        if (suggestions.length > 0) {
          const top = suggestions[0];
          const prediction = createPrediction(
            `pred_${scoredReport.id}`,
            selectedPlayerId,
            gameState.scout.id,
            top.type,
            top.statement,
            top.suggestedConfidence,
            gameState.currentSeason,
            gameState.currentWeek,
          );
          updatedPredictions = [...gameState.predictions, prediction];
        }
      }

      // W3a/W3b: Wire retainer and client delivery tracking
      let updatedFinances = gameState.finances;
      if (updatedFinances && player.clubId) {
        // W3a: Record retainer delivery if an active retainer matches the player's club
        const hasActiveRetainer = updatedFinances.retainerContracts.some(
          (c) => c.clubId === player.clubId && c.status === "active",
        );
        if (hasActiveRetainer) {
          updatedFinances = recordRetainerDelivery(updatedFinances, player.clubId);
        }

        // W3b: Record client delivery — ensure relationship exists then record
        if (gameState.scout.careerPath === "independent") {
          updatedFinances = ensureClientRelationship(
            updatedFinances,
            player.clubId,
            gameState.currentWeek,
            gameState.currentSeason,
          );
          updatedFinances = recordClientDelivery(
            updatedFinances,
            player.clubId,
            0, // revenue: report-based delivery, not directly monetized
            gameState.currentWeek,
            gameState.currentSeason,
          );
        }
      }

      set({
        gameState: {
          ...gameState,
          reports: { ...gameState.reports, [scoredReport.id]: scoredReport },
          scout: updatedScoutAfterResponse,
          finances: updatedFinances,
          discoveryRecords: updatedDiscoveryRecords,
          clubResponses: updatedClubResponses,
          predictions: updatedPredictions,
          systemFitCache: updatedSystemFitCache,
          inbox: responseInboxMessage
            ? [...gameState.inbox, responseInboxMessage]
            : gameState.inbox,
        },
        currentScreen: "reportHistory",
      });
      // Tutorial auto-advance: step expects "reportSubmitted"
      const tutorialAfterReport = useTutorialStore.getState();
      tutorialAfterReport.checkAutoAdvance("reportSubmitted");
      tutorialAfterReport.completeMilestone("submittedReport");

      // First-team aha moment: first positive club response
      if (firstTeamAhaTriggered) {
        tutorialAfterReport.queueSequence("ahaMoment:firstTeam");
      }
    },
  };
}
