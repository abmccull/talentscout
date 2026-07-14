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
  attachReportEvidence,
  getFreshReportObservationIds,
  getLatestReportInScope,
} from "@/engine/reports/reportAccountability";
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
import { getWorldConditionModifiers } from "@/engine/world/worldConditions";

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
        (o) =>
          o.playerId === canonicalPlayerId
          && o.scoutId === gameState.scout.id
      );
      const previousReport = getLatestReportInScope(
        Object.values(gameState.reports),
        gameState.scout.id,
        canonicalPlayerId,
        structured?.briefId,
      );
      const freshObservationIds = getFreshReportObservationIds(observations, previousReport);
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
      if (structured) {
        const duplicate = Object.values(gameState.reports).find((candidate) =>
          candidate.submittedWeek === gameState.currentWeek
          && candidate.submittedSeason === gameState.currentSeason
          && candidate.playerId === canonicalPlayerId
          && candidate.briefId === structured.briefId
          && candidate.summary === summary
          && candidate.conviction === conviction
        );
        if (duplicate && freshObservationIds.length === 0) {
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

      // A retry or double click has neither a new ID nor new evidence. Keep it
      // silent and idempotent instead of turning it into an invalid revision.
      if (gameState.reports[report.id] && freshObservationIds.length === 0) {
        set({
          currentScreen: "reportHistory",
          ...(gameState.scout.careerPath === "independent"
            ? { pendingListingReportId: report.id }
            : {}),
        });
        return;
      }

      if (freshObservationIds.length === 0) {
        const messageId = `report-needs-evidence-${canonicalPlayerId}-${structured?.briefId ?? "general"}-s${gameState.currentSeason}w${gameState.currentWeek}`;
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
                  title: previousReport ? "Report revision needs new evidence" : "Observe before reporting",
                  body: previousReport
                    ? "This case has no unreported evidence. Observe the player again in a meaningful context before filing a revision; rewriting the same evidence cannot create reputation, client credit, or assignment progress."
                    : "A professional report needs at least one first-hand observation. Schedule a match, training visit, video review, or another valid observation context first.",
                  read: false,
                  actionRequired: true,
                  relatedId: canonicalPlayerId,
                  relatedEntityType: "player",
                }],
          },
        });
        return;
      }

      report = attachReportEvidence(report, observations, previousReport);
      // Immutable revision IDs also make stale concurrent submissions safe.
      if (gameState.reports[report.id]) {
        set({ currentScreen: "reportHistory" });
        return;
      }
      const isNewCase = previousReport === undefined;

      const qualityDetailed = prepared.quality;
      const quality = qualityDetailed.score;

      const repBefore = gameState.scout.reputation;
      const baseUpdatedScout = isNewCase
        ? updateReputation(gameState.scout, {
            type: "reportSubmitted",
            quality,
          })
        : gameState.scout;
      // Apply difficulty reputation multiplier to the delta
      const repDelta = baseUpdatedScout.reputation - gameState.scout.reputation;
      const diffMods = getDifficultyModifiers(gameState.difficulty);
      const adjustedRep = Math.max(0, Math.min(100,
        gameState.scout.reputation + Math.round(repDelta * diffMods.reputationMultiplier),
      ));
      const updatedScout = {
        ...baseUpdatedScout,
        reputation: adjustedRep,
        reportsSubmitted: isNewCase
          ? baseUpdatedScout.reportsSubmitted + 1
          : baseUpdatedScout.reportsSubmitted,
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
        isNewCase &&
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
            getWorldConditionModifiers(
              gameState,
              gameState.leagues[responseClub.leagueId]?.country,
            ).recruitmentScoreAdjustment,
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
        isNewCase &&
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
      if (isNewCase && updatedFinances && player.clubId) {
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
      const shouldOfferMarketplaceListing = isNewCase
        && gameState.scout.careerPath === "independent";

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
        ...(shouldOfferMarketplaceListing ? { pendingListingReportId: scoredReport.id } : {}),
      });
      const tutorialAfterReport = useTutorialStore.getState();
      if (isNewCase) {
        // Tutorial auto-advance: step expects the first accountable case filing.
        tutorialAfterReport.completeMilestone("wroteReport");
        tutorialAfterReport.checkAutoAdvance("reportSubmitted");
        tutorialAfterReport.completeMilestone("submittedReport");
      }

      // First-team aha moment: first positive club response
      if (firstTeamAhaTriggered) {
        tutorialAfterReport.queueSequence("ahaMoment:firstTeam");
      }
    },
  };
}
