/**
 * Report writing & submission actions extracted from gameStore.
 *
 * Handles starting a report, generating content, submitting with conviction,
 * quality scoring, club response generation, discovery recording,
 * prediction auto-generation, and retainer/client delivery tracking.
 */
import type { GetState, SetState } from "./types";
import type {
  ConvictionLevel,
  InboxMessage,
  ScoutReport,
  StructuredReportInput,
} from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { getDifficultyModifiers } from "@/engine/core/difficulty";
import { generateReportContent, prepareReportSubmission } from "@/engine/reports/reporting";
import {
  ensureScoutingCaseForReport,
  getScoutingCaseId,
} from "@/engine/reports/scoutingCases";
import {
  applyStructuredReportInput,
  validateStructuredReportInput,
} from "@/engine/reports/structuredYouthReport";
import { getRemainingTablePounds } from "@/engine/reports/conviction";
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
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { useTutorialStore } from "@/stores/tutorialStore";
import { synchronizeInternationalAssignmentProgress } from "@/engine/world/internationalDeliverables";

export function createReportActions(get: GetState, set: SetState) {
  return {
    startReport: (playerId: string) => {
      set({ selectedPlayerId: playerId, currentScreen: "reportWriter" });
      // Use the more detailed firstReportWriting tutorial for first-timers
      useTutorialStore.getState().startSequence("firstReportWriting");
    },

    submitReport: (
      conviction: ConvictionLevel,
      summary: string,
      strengths: string[],
      weaknesses: string[],
      structured?: StructuredReportInput,
    ) => {
      const { gameState, selectedPlayerId } = get();
      if (!gameState || !selectedPlayerId) return;

      const resolvedPlayer = resolvePlayerEntity(gameState, selectedPlayerId);
      if (!resolvedPlayer) return;

      const player = resolvedPlayer.player;
      const canonicalPlayerId = resolvedPlayer.playerId;

      if (
        conviction === "tablePound"
        && getRemainingTablePounds({
          reports: Object.values(gameState.reports),
          scoutId: gameState.scout.id,
          season: gameState.currentSeason,
          careerTier: gameState.scout.careerTier,
        }) <= 0
      ) {
        const messageId = `table-pound-spent-s${gameState.currentSeason}`;
        set({
          gameState: {
            ...gameState,
            inbox: gameState.inbox.some((message) => message.id === messageId)
              ? gameState.inbox
              : [...gameState.inbox, {
                  id: messageId,
                  week: gameState.currentWeek,
                  season: gameState.currentSeason,
                  type: "feedback",
                  title: "No table-pounds remaining",
                  body: "You have already staked your maximum reputational capital this season. Choose a lower conviction or wait until next season.",
                  read: false,
                  actionRequired: true,
                }],
          },
        });
        return;
      }

      if (structured) {
        const validation = validateStructuredReportInput(
          structured,
          gameState.youthRecruitmentBriefs[structured.briefId],
        );
        if (!validation.valid) {
          const messageId = `report-validation-${canonicalPlayerId}-${gameState.currentSeason}-${gameState.currentWeek}`;
          set({
            gameState: {
              ...gameState,
              inbox: gameState.inbox.some((message) => message.id === messageId)
                ? gameState.inbox
                : [...gameState.inbox, {
                    id: messageId,
                    week: gameState.currentWeek,
                    season: gameState.currentSeason,
                    type: "feedback",
                    title: "Report needs professional context",
                    body: validation.errors.join("\n"),
                    read: false,
                    actionRequired: true,
                    relatedId: canonicalPlayerId,
                    relatedEntityType: "player",
                  }],
            },
          });
          return;
        }
      }

      const observations = Object.values(gameState.observations).filter(
        (o) => o.playerId === canonicalPlayerId
      );
      const draft = generateReportContent(player, observations, gameState.scout);
      // F14: Include infrastructure + equipment report quality bonus. This
      // exact preparation path is also used by ReportWriter's live preview.
      const infraEffectsForReport = calculateInfrastructureEffects(gameState.scoutingInfrastructure);
      const submitEquipBonuses = gameState.finances?.equipment
        ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
        : undefined;
      const totalReportQualityBonus = infraEffectsForReport.reportQualityBonus + (submitEquipBonuses?.reportQuality ?? 0);
      const prepared = prepareReportSubmission({
        draft,
        conviction,
        summary,
        strengths,
        weaknesses,
        scout: gameState.scout,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
        playerId: canonicalPlayerId,
        observations,
        playerContext: player,
        reportQualityBonus: totalReportQualityBonus,
      });
      let report = prepared.report;
      const previousReport = Object.values(gameState.reports)
        .filter((candidate) =>
          candidate.playerId === canonicalPlayerId
          && candidate.scoutId === gameState.scout.id
          && (!structured || candidate.briefId === structured.briefId)
        )
        .sort((left, right) =>
          right.submittedSeason - left.submittedSeason
          || right.submittedWeek - left.submittedWeek
          || (right.revision ?? 1) - (left.revision ?? 1)
          || right.id.localeCompare(left.id)
        )[0];
      if (structured) {
        const duplicate = Object.values(gameState.reports).find((candidate) =>
          candidate.submittedWeek === gameState.currentWeek
          && candidate.submittedSeason === gameState.currentSeason
          && candidate.playerId === canonicalPlayerId
          && candidate.briefId === structured.briefId
          && candidate.summary === summary
          && candidate.conviction === conviction
        );
        if (duplicate) {
          set({ currentScreen: "reportHistory" });
          return;
        }
        report = applyStructuredReportInput(report, structured, previousReport);
        report = {
          ...report,
          caseId: previousReport?.caseId
            ?? getScoutingCaseId(gameState.scout.id, canonicalPlayerId, structured.briefId),
        };
      }

      // A report ID is the immutable scout/player/week revision key. A retry,
      // double click, or stale ReportWriter must not overwrite that revision or
      // replay reputation, delivery, prediction, and tutorial side effects.
      if (gameState.reports[report.id]) {
        set({
          currentScreen: "reportHistory",
          ...(gameState.scout.careerPath === "independent"
            ? { pendingListingReportId: report.id }
            : {}),
        });
        return;
      }

      const qualityDetailed = prepared.quality;
      const quality = qualityDetailed.score;

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
      let scoredReport: ScoutReport = {
        ...report,
        qualityScore: quality,
        reputationDelta,
        craftBreakdown: qualityDetailed.breakdown,
        validationSnapshot: Object.fromEntries(
          report.attributeAssessments.map((assessment) => [
            assessment.attribute,
            player.attributes[assessment.attribute],
          ]),
        ),
      };
      const caseLink = ensureScoutingCaseForReport(
        gameState.scoutingCases ?? {},
        scoredReport,
      );
      scoredReport = caseLink.report;

      // Record discovery if this player has not been tracked before
      const alreadyDiscovered = gameState.discoveryRecords.some(
        (r) => r.playerId === canonicalPlayerId,
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
        const responsePlayer = gameState.players[canonicalPlayerId];
        const responseClub = gameState.clubs[gameState.scout.currentClubId];
        const responseManager = gameState.managerProfiles[gameState.scout.currentClubId];

        if (responsePlayer && responseClub && responseManager) {
          // Calculate system fit for this player-club combination
          const fitRng = createRNG(
            `${gameState.seed}-sysfit-${canonicalPlayerId}-${gameState.scout.currentClubId}`,
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
          const fitCacheKey = `${canonicalPlayerId}:${gameState.scout.currentClubId}`;
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
          const reportResponse = clubResponse.response === "signed"
            ? "signed"
            : new Set(["interested", "trial", "loanSigned"]).has(clubResponse.response)
              ? "shortlisted"
              : "ignored";
          scoredReport = { ...scoredReport, clubResponse: reportResponse };

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
            relatedId: canonicalPlayerId,
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
            canonicalPlayerId,
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

      // For independent scouts, flag the newly submitted report for the listing prompt
      const isIndependent = gameState.scout.careerPath === "independent";

      set({
        gameState: synchronizeInternationalAssignmentProgress({
          ...gameState,
          reports: { ...gameState.reports, [scoredReport.id]: scoredReport },
          scoutingCases: caseLink.scoutingCases,
          scout: updatedScoutAfterResponse,
          finances: updatedFinances,
          discoveryRecords: updatedDiscoveryRecords,
          clubResponses: updatedClubResponses,
          predictions: updatedPredictions,
          systemFitCache: updatedSystemFitCache,
          inbox: responseInboxMessage
            ? [...gameState.inbox, responseInboxMessage]
            : gameState.inbox,
        }),
        currentScreen: "reportHistory",
        ...(isIndependent ? { pendingListingReportId: scoredReport.id } : {}),
      });
      // Tutorial auto-advance: step expects "reportSubmitted"
      const tutorialAfterReport = useTutorialStore.getState();
      tutorialAfterReport.completeMilestone("wroteReport");
      tutorialAfterReport.checkAutoAdvance("reportSubmitted");
      tutorialAfterReport.completeMilestone("submittedReport");

      // First-team aha moment: first positive club response
      if (firstTeamAhaTriggered) {
        tutorialAfterReport.queueSequence("ahaMoment:firstTeam");
      }
    },
  };
}
