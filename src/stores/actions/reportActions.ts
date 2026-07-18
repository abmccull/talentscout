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
  FinancialRecord,
  InitialAssessmentInput,
  InboxMessage,
  Player,
  ScoutReport,
  StructuredReportInput,
  YouthRecruitmentBrief,
} from "@/engine/core/types";
import {
  buildFormalAssessment,
  buildInitialAssessment,
  calculateAssessmentPracticeXp,
} from "@/engine/scout/evidenceModel";
import { applyScoutSkillXp } from "@/engine/scout/progression";
import { createRNG } from "@/engine/rng";
import {
  calculatePublicRevisionReputationCost,
  scaleReputationChange,
} from "@/engine/core/difficulty";
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
  consumeAnalystReview,
  getApplicableAnalystReview,
  recordRetainerDelivery,
  ensureClientRelationship,
  recordClientDelivery,
  recordConsultingReportDelivery,
  toAppliedAnalystReview,
} from "@/engine/finance";
import {
  createPrediction,
  generatePredictionSuggestions,
} from "@/engine/data";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { useTutorialStore } from "@/stores/tutorialStore";
import { synchronizeInternationalAssignmentProgress } from "@/engine/world/internationalDeliverables";
import { getWorldConditionModifiers } from "@/engine/world/worldConditions";
import {
  consumeInsightReportQualityEffect,
  getPendingInsightReportQualityEffect,
} from "@/engine/insight/effects";
import {
  checkMasteryPerkUnlocks,
  getMasteryPerkModifiers,
} from "@/engine/specializations/masteryPerks";

export function resolveReportClientClubId(
  report: Pick<ScoutReport, "briefId" | "intendedClubId">,
  youthRecruitmentBriefs: Record<string, YouthRecruitmentBrief>,
  fallbackClubId?: string,
): string | undefined {
  if (report.intendedClubId) return report.intendedClubId;
  if (report.briefId) {
    const linkedBriefClubId = youthRecruitmentBriefs[report.briefId]?.clubId;
    if (linkedBriefClubId) return linkedBriefClubId;
  }
  return fallbackClubId;
}

function recordRetainerReportDelivery(
  finances: FinancialRecord,
  clubId: string,
  report: Pick<ScoutReport, "id" | "qualityScore">,
  player: Pick<Player, "position" | "age">,
): FinancialRecord {
  return recordRetainerDelivery(finances, clubId, report, player);
}

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
      initialAssessment?: InitialAssessmentInput,
    ) => {
      const { gameState, selectedPlayerId } = get();
      if (!gameState || !selectedPlayerId) return;

      const resolvedPlayer = resolvePlayerEntity(gameState, selectedPlayerId);
      if (!resolvedPlayer) return;

      const player = resolvedPlayer.player;
      const canonicalPlayerId = resolvedPlayer.playerId;
      const availableEvidenceCards = Object.values(gameState.reflectionJournal ?? {})
        .flatMap((entry) => entry.evidenceCards ?? [])
        .filter((card) => card.playerId === canonicalPlayerId);
      const initialAssessmentResult = initialAssessment
        ? buildInitialAssessment(
            initialAssessment,
            availableEvidenceCards,
            `${player.firstName} ${player.lastName}`,
          )
        : undefined;
      const formalAssessmentResult = structured?.evidenceVersion === 1
        ? buildFormalAssessment(
            structured,
            availableEvidenceCards,
            `${player.firstName} ${player.lastName}`,
            gameState.clubs[structured.intendedClubId]?.name ?? "the academy",
          )
        : undefined;
      if (initialAssessmentResult && !initialAssessmentResult.valid) {
        const messageId = `initial-assessment-validation-${canonicalPlayerId}-${gameState.currentSeason}-${gameState.currentWeek}`;
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
                  title: "Initial assessment needs one complete judgment",
                  body: initialAssessmentResult.errors.join("\n"),
                  read: false,
                  actionRequired: true,
                  relatedId: canonicalPlayerId,
                  relatedEntityType: "player",
                }],
          },
        });
        return;
      }
      if (formalAssessmentResult && !formalAssessmentResult.valid) {
        const messageId = `formal-assessment-validation-${canonicalPlayerId}-${gameState.currentSeason}-${gameState.currentWeek}`;
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
                  title: "Formal assessment needs traceable evidence",
                  body: formalAssessmentResult.errors.join("\n"),
                  read: false,
                  actionRequired: true,
                  relatedId: canonicalPlayerId,
                  relatedEntityType: "player",
                }],
          },
        });
        return;
      }
      const evidenceAssessment = initialAssessmentResult?.assessment
        ?? formalAssessmentResult?.assessment;
      const authoritativeSummary = evidenceAssessment?.generatedSummary ?? summary;

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
          new Set(availableEvidenceCards.map((card) => card.id)),
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
      const analystReview = gameState.finances
        ? getApplicableAnalystReview(
            gameState.finances.analystReviews ?? [],
            canonicalPlayerId,
            previousReport,
          )
        : undefined;
      const freshObservationIds = getFreshReportObservationIds(observations, previousReport);
      const preparedWorkItem = Object.values(gameState.reportWorkItems ?? {})
        .filter((item) =>
          item.status === "ready"
          && item.playerId === canonicalPlayerId
          && item.scoutId === gameState.scout.id
          && item.freshObservationIds.some((id) => freshObservationIds.includes(id))
        )
        .sort((left, right) =>
          right.createdSeason - left.createdSeason
          || right.createdWeek - left.createdWeek
        )[0];
      const draft = generateReportContent(player, observations, gameState.scout);
      // F14: Include infrastructure + equipment report quality bonus. This
      // exact preparation path is also used by ReportWriter's live preview.
      const infraEffectsForReport = calculateInfrastructureEffects(gameState.scoutingInfrastructure);
      const submitEquipBonuses = gameState.finances?.equipment
        ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
        : undefined;
      const pendingInsightReportEffect = getPendingInsightReportQualityEffect(
        gameState.scout.insightState,
        canonicalPlayerId,
      );
      const insightReportQualityBonus = (
        pendingInsightReportEffect?.bonusPoints ?? 0
      ) / 100;
      const masteryModifiers = getMasteryPerkModifiers(
        checkMasteryPerkUnlocks(gameState.scout),
      );
      const systemFitCraftBonus = masteryModifiers.canAnalyseSystemFit
        && structured?.intendedClubId
        && structured.projectedRole
          ? 0.03
          : 0;
      const totalReportQualityBonus = infraEffectsForReport.reportQualityBonus
        + Math.max(
            submitEquipBonuses?.reportQuality ?? 0,
            preparedWorkItem?.preparationQualityBonus ?? 0,
          )
        + (preparedWorkItem?.preparationQualityPoints ?? 0) / 100
        + systemFitCraftBonus
        + insightReportQualityBonus;
      const prepared = prepareReportSubmission({
        draft,
        conviction,
        summary: authoritativeSummary,
        strengths,
        weaknesses,
        scout: gameState.scout,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
        playerId: canonicalPlayerId,
        observations,
        playerContext: player,
        reportQualityBonus: totalReportQualityBonus,
        analystReviewBonus: analystReview?.craftQualityBonus,
      });
      let report = prepared.report;
      if (evidenceAssessment) {
        const claim = evidenceAssessment.claims[0];
        const unknown = evidenceAssessment.unknowns[0];
        const evidenceStrengths = evidenceAssessment.claims
          .filter((assessmentClaim) => assessmentClaim.support !== "withheld")
          .map((assessmentClaim) => assessmentClaim.statement);
        const evidenceLimits = [
          ...evidenceAssessment.unknowns.map((assessmentUnknown) => assessmentUnknown.statement),
          ...(structured?.riskAssessments ?? [])
            .filter((risk) => risk.id !== "noMaterialSignal")
            .map((risk) => `${risk.label}: ${risk.status}.`),
        ];
        report = {
          ...report,
          summary: evidenceAssessment.generatedSummary,
          strengths: evidenceStrengths,
          weaknesses: evidenceLimits,
          evidenceAssessment,
          recommendedAction: evidenceAssessment.recommendation,
          categoryVerdicts: claim ? {
            [claim.category]: {
              verdict: claim.statement,
              confidence: claim.confidence === "tentative"
                ? "low"
                : claim.confidence === "working"
                  ? "medium"
                  : "high",
              hypothesisIds: claim.hypothesisIds,
              acknowledgedUncertainty: unknown?.statement ?? "No further claim was made.",
            },
          } : undefined,
        };
      }
      if (structured) {
        const duplicate = Object.values(gameState.reports).find((candidate) =>
          candidate.submittedWeek === gameState.currentWeek
          && candidate.submittedSeason === gameState.currentSeason
          && candidate.playerId === canonicalPlayerId
          && candidate.briefId === structured.briefId
          && candidate.summary === authoritativeSummary
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
      if (analystReview) {
        report = {
          ...report,
          analystReview: toAppliedAnalystReview(analystReview),
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
      const quality = evidenceAssessment?.score.total ?? qualityDetailed.score;

      const repBefore = gameState.scout.reputation;
      const baseUpdatedScout = isNewCase
        ? updateReputation(gameState.scout, {
            type: "reportSubmitted",
            quality,
        })
        : gameState.scout;
      const practicedScout = evidenceAssessment
        ? applyScoutSkillXp(
            baseUpdatedScout,
            calculateAssessmentPracticeXp(evidenceAssessment),
          )
        : baseUpdatedScout;
      // Difficulty is sign-aware: easier modes improve gains and soften
      // losses, while harder modes do the reverse.
      const repDelta = baseUpdatedScout.reputation - gameState.scout.reputation;
      const publicRevisionCost = calculatePublicRevisionReputationCost(
        previousReport,
        report,
        gameState.difficulty,
      );
      const adjustedRep = Math.max(0, Math.min(100,
        gameState.scout.reputation
          + scaleReputationChange(repDelta, gameState.difficulty)
          - publicRevisionCost,
      ));
      const updatedScout = {
        ...practicedScout,
        reputation: adjustedRep,
        reportsSubmitted: isNewCase
          ? practicedScout.reportsSubmitted + 1
          : practicedScout.reportsSubmitted,
        ...(pendingInsightReportEffect && practicedScout.insightState
          ? {
              insightState: consumeInsightReportQualityEffect(
                practicedScout.insightState,
                pendingInsightReportEffect.id,
              ),
            }
          : {}),
      };
      const reputationDelta = +(updatedScout.reputation - repBefore).toFixed(1);
      let scoredReport: ScoutReport = {
        ...report,
        preparationWorkItemId: preparedWorkItem?.id,
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
          const clubResponse = generateClubResponse(
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

          updatedClubResponses = [...gameState.clubResponses, clubResponse];
          const reportResponse = new Set(["interested", "trial"]).has(clubResponse.response)
            ? "shortlisted"
            : "ignored";
          scoredReport = { ...scoredReport, clubResponse: reportResponse };

          // Check for first-team aha moment: first positive response
          const POSITIVE_RESPONSES = new Set(["interested", "trial"]);
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
      const intendedClientClubId = resolveReportClientClubId(
        scoredReport,
        gameState.youthRecruitmentBriefs,
        player.clubId,
      );
      if (isNewCase && updatedFinances && intendedClientClubId) {
        // W3a: record report-credit deliverables against the intended client,
        // not the current registration of the player.
        updatedFinances = recordRetainerReportDelivery(
          updatedFinances,
          intendedClientClubId,
          scoredReport,
          player,
        );
        updatedFinances = recordConsultingReportDelivery(
          updatedFinances,
          intendedClientClubId,
          scoredReport,
          player,
        );

        // W3b: authored delivery opens or strengthens the client relationship once.
        if (gameState.scout.careerPath === "independent") {
          updatedFinances = ensureClientRelationship(
            updatedFinances,
            intendedClientClubId,
            gameState.currentWeek,
            gameState.currentSeason,
          );
          updatedFinances = recordClientDelivery(
            updatedFinances,
            intendedClientClubId,
            0,
            gameState.currentWeek,
            gameState.currentSeason,
          );
        }
      }

      if (analystReview && updatedFinances) {
        updatedFinances = consumeAnalystReview(
          updatedFinances,
          analystReview.id,
          scoredReport.id,
          gameState.currentWeek,
          gameState.currentSeason,
        );
      }

      // For independent scouts, flag the newly submitted report for the listing prompt
      const shouldOfferMarketplaceListing = isNewCase
        && gameState.scout.careerPath === "independent";
      const revisionCostMessage: InboxMessage | null = publicRevisionCost > 0
        ? {
            id: `public-revision-cost-${scoredReport.id}`,
            week: gameState.currentWeek,
            season: gameState.currentSeason,
            type: "feedback",
            title: "Public stance revised",
            body: `This revision materially changed your filed conviction, role, or recommended action. Owning the change preserves the evidence trail, but it costs ${publicRevisionCost} reputation on ${gameState.difficulty} difficulty.`,
            read: false,
            actionRequired: false,
            relatedId: canonicalPlayerId,
            relatedEntityType: "player",
          }
        : null;

      set({
        gameState: synchronizeInternationalAssignmentProgress({
          ...gameState,
          reportWorkItems: preparedWorkItem
            ? Object.fromEntries(
                Object.entries(gameState.reportWorkItems ?? {}).map(([id, item]) => [
                  id,
                  id === preparedWorkItem.id
                    ? {
                        ...item,
                        status: "consumed" as const,
                        consumedByReportId: scoredReport.id,
                      }
                    : item,
                ]),
              )
            : gameState.reportWorkItems,
          reports: { ...gameState.reports, [scoredReport.id]: scoredReport },
          scoutingCases: caseLink.scoutingCases,
          scout: updatedScoutAfterResponse,
          finances: updatedFinances,
          discoveryRecords: updatedDiscoveryRecords,
          clubResponses: updatedClubResponses,
          predictions: updatedPredictions,
          systemFitCache: updatedSystemFitCache,
          inbox: [
            ...gameState.inbox,
            ...(responseInboxMessage ? [responseInboxMessage] : []),
            ...(revisionCostMessage ? [revisionCostMessage] : []),
          ],
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

      // First-team aha moment: a first report earns a real next step. Transfer
      // completion remains a separate, authoritative negotiation/world event.
      if (firstTeamAhaTriggered) {
        tutorialAfterReport.queueSequence("ahaMoment:firstTeam");
      }
    },
  };
}
