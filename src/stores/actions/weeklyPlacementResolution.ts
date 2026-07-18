import type {
  Club,
  ClubDecision,
  GameState,
  InboxMessage,
  Player,
} from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import {
  createAcademyClubDecisionMemory,
  recordStakeholderMemory,
} from "@/engine/consequences";
import { getSeasonLength } from "@/engine/core/gameLoop";
import {
  getScheduledActivityInstances,
  processCompletedWeek,
} from "@/engine/core/calendar";
import {
  getActiveWorldConditionNames,
  getWorldConditionModifiers,
} from "@/engine/world";
import {
  getLifecycleWorld,
  resolvePlayerMovements,
  withLifecycleWorld,
} from "@/engine/world/playerLifecycle";
import {
  createAlumniRecord,
  assessYouthMobility,
  generatePlacementReport,
  getEligibleClubsForPlacement,
  processPlacementOutcome,
  scoreAcademyClubDecision,
} from "@/engine/youth";
import { projectProspectiveDevelopmentEnvironment } from "@/engine/world/developmentEnvironment";
import { settleYouthAgencyPlacement } from "@/engine/finance";
import {
  fulfillAcademyRecruitmentBrief,
  type AcademyRecruitmentBrief,
} from "@/engine/youth/recruitmentBriefs";
import { scheduleAcademyRecommendationReviews } from "@/engine/youth/recommendationReviews";
import { resolveUnsignedYouth } from "@/lib/playerResolution";
import { normalizeCountryKey } from "@/lib/country";
import {
  ensureScoutingCaseForReport,
  isGameDateDue,
  nextGameWeek,
  recordDirectPlacementDelivery,
  resolveClubDecision,
} from "@/engine/reports/scoutingCases";
import { updateReputation } from "@/engine/career";
import { scaleReputationChange } from "@/engine/core/difficulty";

type CompletedWeekResult = ReturnType<typeof processCompletedWeek>;

export interface WeeklyPlacementResolutionInput {
  sourceState: GameState;
  state: GameState;
  weekResult: CompletedWeekResult;
}
export function processWeeklyPlacementResolution(
  input: WeeklyPlacementResolutionInput,
): GameState {
  const gameState = input.sourceState;
  let stateWithScheduleApplied = input.state;
  const { weekResult } = input;

  // ── Youth placement resolution ────────────────────────────────────────
  // A placement is a delivery of an existing authored report, not a second
  // standalone opinion. Persist it now, then let the club decide no earlier
  // than the following game week.
  const hasPendingPlacement = Object.values(stateWithScheduleApplied.placementReports).some(
    (report) => report.clubResponse === "pending",
  );
  if (weekResult.writePlacementReportsExecuted > 0 || hasPendingPlacement) {
    const placementRng = createRNG(
      `${gameState.seed}-placement-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    let preparedPlacementReports = { ...stateWithScheduleApplied.placementReports };
    let preparedReports = { ...stateWithScheduleApplied.reports };
    let preparedScoutingCases = { ...(stateWithScheduleApplied.scoutingCases ?? {}) };
    let preparedReportDeliveries = { ...(stateWithScheduleApplied.reportDeliveries ?? {}) };
    const submissionMessages: InboxMessage[] = [];
    const scheduledPlacementActivities = weekResult.writePlacementReportsExecuted > 0
      ? getScheduledActivityInstances(stateWithScheduleApplied.schedule)
          .map((entry) => entry.activity)
          .filter((activity) => activity.type === "writePlacementReport" && !!activity.targetId)
      : [];

    for (const placementActivity of scheduledPlacementActivities) {
      if (!placementActivity.targetId) continue;
      const youth = resolveUnsignedYouth(stateWithScheduleApplied, placementActivity.targetId);
      if (!youth || youth.placed || youth.retired) continue;
      const existingPending = Object.values(preparedPlacementReports).some(
        (r) => r.unsignedYouthId === youth.id && r.clubResponse === "pending",
      );
      if (existingPending) continue;

      const youthObservations = Object.values(stateWithScheduleApplied.observations).filter(
        (o) => o.playerId === youth.player.id,
      );
      if (youthObservations.length === 0) continue;

      const sourceReport = Object.values(preparedReports)
        .filter((report) =>
          report.playerId === youth.player.id
          && report.scoutId === stateWithScheduleApplied.scout.id
        )
        .sort((left, right) =>
          right.submittedSeason - left.submittedSeason
          || right.submittedWeek - left.submittedWeek
          || right.id.localeCompare(left.id)
        )[0];
      if (!sourceReport) {
        submissionMessages.push({
          id: `placement-report-required-${youth.id}-${stateWithScheduleApplied.currentSeason}-${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback",
          title: "Authored Report Required",
          body: `Write and submit a scouting report for ${youth.player.firstName} ${youth.player.lastName} before pitching a club. A placement must stand behind a preserved opinion, not just raw observations.`,
          read: false,
          actionRequired: true,
          relatedId: youth.player.id,
          relatedEntityType: "player",
        });
        continue;
      }

      const targetClubId = sourceReport.intendedClubId
        ?? placementActivity.destinationClubId;
      if (!targetClubId) {
        submissionMessages.push({
          id: `placement-club-required-${youth.id}-s${stateWithScheduleApplied.currentSeason}w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback",
          title: "Choose the club you are pitching",
          body: `Your opinion on ${youth.player.firstName} ${youth.player.lastName} is ready, but a placement pitch needs a named academy. Return to Planner, choose the destination club, and schedule the pitch again.`,
          read: false,
          actionRequired: true,
          relatedId: youth.player.id,
          relatedEntityType: "player",
        });
        continue;
      }
      const eligibleClubs = getEligibleClubsForPlacement(
        youth,
        Object.values(stateWithScheduleApplied.clubs),
        stateWithScheduleApplied.scout,
        stateWithScheduleApplied.leagues,
        { preferredClubId: targetClubId },
      );
      const targetClub = eligibleClubs.find((club) => club.id === targetClubId);
      if (!targetClub) {
        submissionMessages.push({
          id: `placement-club-ineligible-${youth.id}-${targetClubId}-s${stateWithScheduleApplied.currentSeason}w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback",
          title: "That academy is not a credible destination",
          body: `The selected club is not currently eligible for this placement. Review the player's route, registration risk, academy fit, and your access before choosing another destination.`,
          read: false,
          actionRequired: true,
          relatedId: youth.player.id,
          relatedEntityType: "player",
        });
        continue;
      }

      const generatedReport = {
        ...generatePlacementReport(
        placementRng,
        youth,
        targetClub,
        youthObservations,
        stateWithScheduleApplied.scout,
        stateWithScheduleApplied.currentWeek,
        stateWithScheduleApplied.currentSeason,
        ),
        conviction: sourceReport.conviction,
        qualityScore: sourceReport.qualityScore,
        briefId: sourceReport.briefId,
        pitchPosture: placementActivity.placementPitchPosture ?? "evidenceLed",
        supportCondition: placementActivity.placementSupportCondition ?? "none",
      };
      const linked = ensureScoutingCaseForReport(preparedScoutingCases, sourceReport);
      const recorded = recordDirectPlacementDelivery({
        scoutingCases: linked.scoutingCases,
        reportDeliveries: preparedReportDeliveries,
        report: linked.report,
        placementReport: generatedReport,
        seasonLength: getSeasonLength(
          stateWithScheduleApplied.fixtures,
          stateWithScheduleApplied.currentSeason,
        ),
      });
      preparedReports[sourceReport.id] = recorded.report;
      preparedScoutingCases = recorded.scoutingCases;
      preparedReportDeliveries = recorded.reportDeliveries;
      preparedPlacementReports[recorded.placementReport.id] = recorded.placementReport;
    }

    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      reports: preparedReports,
      placementReports: preparedPlacementReports,
      scoutingCases: preparedScoutingCases,
      reportDeliveries: preparedReportDeliveries,
      inbox: [...stateWithScheduleApplied.inbox, ...submissionMessages],
    };

    const pendingReports = Object.values(preparedPlacementReports).filter(
      (report) =>
        report.clubResponse === "pending"
        && report.deliveryId
        && isGameDateDue(
          stateWithScheduleApplied.currentWeek,
          stateWithScheduleApplied.currentSeason,
          report.responseDueWeek ?? report.week + 1,
          report.responseDueSeason ?? report.season,
        ),
    );

    if (pendingReports.length > 0) {
      let updatedPlacementReports = { ...stateWithScheduleApplied.placementReports };
      let updatedUnsignedYouth = { ...stateWithScheduleApplied.unsignedYouth };
      let placementLifecycle = getLifecycleWorld(stateWithScheduleApplied);
      let updatedAlumniRecords = [...stateWithScheduleApplied.alumniRecords];
      let updatedScoutingCases = { ...stateWithScheduleApplied.scoutingCases };
      let updatedReportDeliveries = { ...stateWithScheduleApplied.reportDeliveries };
      let updatedClubDecisions = { ...(stateWithScheduleApplied.clubDecisions ?? {}) };
      let updatedConsequenceState = stateWithScheduleApplied.consequenceState;
      let updatedRecruitmentBriefs = { ...stateWithScheduleApplied.youthRecruitmentBriefs };
      let updatedRecommendationReviews = { ...stateWithScheduleApplied.recommendationReviews };
      let updatedFinances = stateWithScheduleApplied.finances;
      const placementMessages: InboxMessage[] = [];
      let updatedScout = stateWithScheduleApplied.scout;

      for (const report of pendingReports) {
        const currentScoutForPlacement = updatedScout;
        let resolvedClubDecision: ClubDecision | undefined;
        const youth = updatedUnsignedYouth[report.unsignedYouthId];
        const club = placementLifecycle.clubs[report.targetClubId];
        if (!youth || !club) continue;
        if (!report.deliveryId || updatedReportDeliveries[report.deliveryId]?.decisionId) continue;
        const sourceReport = report.reportId
          ? stateWithScheduleApplied.reports[report.reportId]
          : undefined;
        const brief = sourceReport?.briefId
          ? updatedRecruitmentBriefs[sourceReport.briefId]
          : undefined;
        const relationshipScore = Math.max(
          0,
          ...Object.values(stateWithScheduleApplied.contacts)
            .filter((contact) => contact.organization === club.name)
            .map((contact) => contact.relationship),
        );
        const targetLeague = stateWithScheduleApplied.leagues[club.leagueId];
        const targetCountryKey = normalizeCountryKey(targetLeague?.country);
        const targetRegionalKnowledge = targetCountryKey
          ? stateWithScheduleApplied.regionalKnowledge[targetCountryKey]
            ?? Object.values(stateWithScheduleApplied.regionalKnowledge).find(
              (knowledge) => normalizeCountryKey(knowledge.countryId) === targetCountryKey,
            )
          : undefined;
        const worldConditionModifiers = targetLeague
          ? getWorldConditionModifiers(stateWithScheduleApplied, targetLeague.country)
          : undefined;
        const mobilityAssessment = targetLeague
          ? assessYouthMobility({
              youth,
              targetClub: club,
              targetLeague,
              targetRegionalKnowledge,
              worldContext: worldConditionModifiers,
              developmentEnvironment: projectProspectiveDevelopmentEnvironment(
                stateWithScheduleApplied,
                youth.player,
                club.id,
              ),
            })
          : undefined;
        const structuredDecision = sourceReport && brief
          ? scoreAcademyClubDecision({
              rng: createRNG(`${stateWithScheduleApplied.seed}-academy-decision-${report.id}`),
              report: sourceReport,
              brief: brief as AcademyRecruitmentBrief,
              player: youth.player,
              observations: Object.values(stateWithScheduleApplied.observations).filter(
                (observation) => observation.playerId === youth.player.id,
              ),
              scout: currentScoutForPlacement,
              club,
              relationshipScore,
              placementStrategy: {
                pitchPosture: report.pitchPosture,
                supportCondition: report.supportCondition,
              },
              mobilityAssessment,
              stakeholderContext: {
                consequenceState: updatedConsequenceState,
                now: {
                  week: stateWithScheduleApplied.currentWeek,
                  season: stateWithScheduleApplied.currentSeason,
                },
                seasonLength: getSeasonLength(
                  stateWithScheduleApplied.fixtures,
                  stateWithScheduleApplied.currentSeason,
                ),
              },
              worldConditionContext: {
                scoreAdjustment: getWorldConditionModifiers(
                  stateWithScheduleApplied,
                  stateWithScheduleApplied.leagues[club.leagueId]?.country,
                ).recruitmentScoreAdjustment,
                label: getActiveWorldConditionNames(
                  stateWithScheduleApplied,
                  stateWithScheduleApplied.leagues[club.leagueId]?.country,
                ).join(" and ") || "The seasonal recruitment climate",
              },
            })
          : undefined;
        const legacyDecisionScore = Math.round(
          report.qualityScore * 0.65
          + ({ note: 20, recommend: 50, strongRecommend: 75, tablePound: 92 } as const)[report.conviction] * 0.35
          + (mobilityAssessment?.clubDecisionAdjustment.score ?? 0)
          + (placementRng.next() - 0.5) * 8,
        );
        let decisionOutcome = structuredDecision?.outcome
          ?? (legacyDecisionScore >= 58 ? "accepted" as const : "rejected" as const);
        if (mobilityAssessment?.status === "blocked") {
          decisionOutcome = "followUpRequested";
        }
        const mobilityFallbackReasons = mobilityAssessment
          ? [
              mobilityAssessment.clubDecisionAdjustment.summary,
              ...(mobilityAssessment.visibleReasons[0]
                ? [mobilityAssessment.visibleReasons[0]]
                : []),
              ...(mobilityAssessment.suggestedMitigationActions[0]
                ? [`Required next step: ${mobilityAssessment.suggestedMitigationActions[0]}`]
                : []),
            ]
          : [];
        const decisionReasons = structuredDecision?.reasons ?? mobilityFallbackReasons;
        const decisionReasonText = decisionReasons.join(" ");
        const outcome = decisionOutcome === "accepted"
          ? processPlacementOutcome(placementRng, report, 1, youth, club)
          : processPlacementOutcome(placementRng, report, 0, youth, club);

        let signedPlayerId: string | undefined;
        let signedMovement = undefined;
        let signingRejectionReason: string | undefined;
        if (outcome.success && outcome.newPlayer) {
          const detachedPlayer = {
            ...outcome.newPlayer,
            clubId: "",
            contractClubId: undefined,
            contractExpiry: 0,
            wage: 0,
          };
          const resolution = resolvePlayerMovements(
            {
              ...placementLifecycle,
              players: {
                ...placementLifecycle.players,
                [detachedPlayer.id]: detachedPlayer,
              },
            },
            [{
              type: "youthSigning",
              playerId: detachedPlayer.id,
              toClubId: club.id,
              contractLength: 3,
              wage: Math.max(100, Math.round(sourceReport?.estimatedWeeklyWage ?? 250)),
              reason: `Placement report ${report.id} accepted`,
            }],
            stateWithScheduleApplied.currentWeek,
            stateWithScheduleApplied.currentSeason,
            getSeasonLength(
              stateWithScheduleApplied.fixtures,
              stateWithScheduleApplied.currentSeason,
            ),
          );
          if (resolution.applied.length > 0) {
            placementLifecycle = resolution.state;
            signedPlayerId = detachedPlayer.id;
            signedMovement = resolution.applied.find((movement) =>
              movement.playerId === detachedPlayer.id && movement.type === "youthSigning"
            );
          } else {
            signingRejectionReason = resolution.rejected[0]?.reason;
          }
        }

        if (decisionOutcome === "accepted" && !signedPlayerId) {
          decisionOutcome = "rejected";
        }

        if (signedPlayerId) {
          const resolved = resolveClubDecision({
            scoutingCases: updatedScoutingCases,
            reportDeliveries: updatedReportDeliveries,
            clubDecisions: updatedClubDecisions,
            deliveryId: report.deliveryId,
            outcome: "accepted",
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            reason: decisionReasonText || "Club accepted the youth placement recommendation",
            reasons: decisionReasons.length > 0 ? decisionReasons : undefined,
            scoreBreakdown: structuredDecision?.breakdown,
          });
          updatedScoutingCases = resolved.scoutingCases;
          updatedReportDeliveries = resolved.reportDeliveries;
          updatedClubDecisions = resolved.clubDecisions;
          resolvedClubDecision = resolved.decision;
          // Update placement report as accepted
          const acceptedPlacement = {
            ...report,
            clubResponse: "accepted" as const,
            placementType: outcome.placementType ?? undefined,
            decisionId: resolved.decision?.id,
          };
          updatedPlacementReports[report.id] = acceptedPlacement;

          // The authoritative Player, movement, report, case, and alumni
          // record now own this history. Keep the unsigned pool limited to
          // live opportunities instead of retaining a duplicate dossier.
          delete updatedUnsignedYouth[report.unsignedYouthId];

          // Create alumni record
          const alumniRecord = createAlumniRecord(
            youth,
            club.id,
            stateWithScheduleApplied.currentWeek,
            stateWithScheduleApplied.currentSeason,
            {
              caseId: report.caseId,
              placementReportId: report.id,
              originatingReportId: report.reportId,
            },
          );
          updatedAlumniRecords = [...updatedAlumniRecords, alumniRecord];
          if (report.caseId && updatedScoutingCases[report.caseId]) {
            updatedScoutingCases[report.caseId] = {
              ...updatedScoutingCases[report.caseId],
              status: "placed",
              alumniRecordId: alumniRecord.id,
            };
          }
          const placedCase = report.caseId ? updatedScoutingCases[report.caseId] : undefined;
          const signedPlayer = signedPlayerId
            ? placementLifecycle.players[signedPlayerId]
            : undefined;
          if (
            brief
            && placedCase
            && sourceReport
            && resolved.decision
            && signedMovement
            && signedPlayer
          ) {
            const fulfilled = fulfillAcademyRecruitmentBrief({
              brief: brief as AcademyRecruitmentBrief,
              player: signedPlayer,
              scoutingCase: placedCase,
              report: sourceReport,
              placementReport: acceptedPlacement,
              clubDecision: resolved.decision,
              movementHistory: placementLifecycle.playerMovementHistory,
              currentWeek: stateWithScheduleApplied.currentWeek,
              currentSeason: stateWithScheduleApplied.currentSeason,
              seasonLength: getSeasonLength(
                stateWithScheduleApplied.fixtures,
                stateWithScheduleApplied.currentSeason,
              ),
            });
            updatedRecruitmentBriefs[brief.id] = fulfilled.fulfilled
              ? { ...fulfilled.brief, fulfillmentFailures: undefined }
              : { ...fulfilled.brief, fulfillmentFailures: fulfilled.failures };
          }

          const placementReputation = updateReputation(updatedScout, {
            type: "youthPlacement",
            convictionLevel: report.conviction,
          });
          const rawReputationGain = placementReputation.reputation - updatedScout.reputation;
          const scaledReputationGain = scaleReputationChange(
            rawReputationGain,
            stateWithScheduleApplied.difficulty,
          );
          updatedScout = {
            ...placementReputation,
            reputation: Math.max(
              0,
              Math.min(100, updatedScout.reputation + scaledReputationGain),
            ),
          };

          let commercialOutcome = "Commercial outcome: no finance ledger was available to settle this placement.";
          if (updatedFinances && sourceReport && signedMovement) {
            const settlement = settleYouthAgencyPlacement({
              finances: updatedFinances,
              scout: currentScoutForPlacement,
              report: sourceReport,
              placementReport: acceptedPlacement,
              club,
              playerId: signedPlayerId,
              playerAge: youth.player.age,
              movementId: signedMovement.id,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
            });
            updatedFinances = settlement.finances;
            commercialOutcome = settlement.commercialOutcome;
          }

          if (placedCase && sourceReport && resolved.decision) {
            const reviewSchedule = scheduleAcademyRecommendationReviews({
              scoutingCase: placedCase,
              report: sourceReport,
              placementReport: acceptedPlacement,
              clubDecision: resolved.decision,
              movementHistory: placementLifecycle.playerMovementHistory,
              existingReviews: Object.values(updatedRecommendationReviews),
              seasonLength: getSeasonLength(
                stateWithScheduleApplied.fixtures,
                stateWithScheduleApplied.currentSeason,
              ),
            });
            for (const review of reviewSchedule.created) {
              updatedRecommendationReviews[review.id] = review;
            }
            if (reviewSchedule.created.length > 0) {
              updatedScoutingCases[placedCase.id] = {
                ...placedCase,
                reviewIds: [
                  ...(placedCase.reviewIds ?? []),
                  ...reviewSchedule.created.map((review) => review.id),
                ],
              };
            }
          }

          placementMessages.push({
            id: `placement-accepted-${report.id}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "event" as const,
            title: `Placement Accepted: ${youth.player.firstName} ${youth.player.lastName}`,
            body: `${club.name} accepted your placement recommendation for ${youth.player.firstName} ${youth.player.lastName}! The ${outcome.placementType === "academyIntake" ? "academy intake" : "youth contract"} has been finalized. Your standing increased by ${scaledReputationGain.toFixed(1)} reputation. ${commercialOutcome} You can track their career progress in your alumni records.`,
            read: false,
            actionRequired: false,
            relatedId: signedPlayerId,
            relatedEntityType: "player" as const,
          });
        } else if (decisionOutcome === "followUpRequested") {
          const followUpDue = nextGameWeek(
            stateWithScheduleApplied.currentWeek,
            stateWithScheduleApplied.currentSeason,
            getSeasonLength(
              stateWithScheduleApplied.fixtures,
              stateWithScheduleApplied.currentSeason,
            ),
          );
          const resolved = resolveClubDecision({
            scoutingCases: updatedScoutingCases,
            reportDeliveries: updatedReportDeliveries,
            clubDecisions: updatedClubDecisions,
            deliveryId: report.deliveryId,
            outcome: "followUpRequested",
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            reason: decisionReasonText || "The club requested more evidence.",
            reasons: decisionReasons.length > 0 ? decisionReasons : undefined,
            scoreBreakdown: structuredDecision?.breakdown,
            requestedEvidenceCategory: structuredDecision?.requestedEvidenceCategory,
            followUpDueWeek: followUpDue.week,
            followUpDueSeason: followUpDue.season,
          });
          updatedScoutingCases = resolved.scoutingCases;
          updatedReportDeliveries = resolved.reportDeliveries;
          updatedClubDecisions = resolved.clubDecisions;
          resolvedClubDecision = resolved.decision;
          updatedPlacementReports[report.id] = {
            ...report,
            clubResponse: "followUpRequested",
            decisionId: resolved.decision?.id,
          };
          placementMessages.push({
            id: `placement-follow-up-${report.id}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback",
            title: `More Evidence Requested: ${youth.player.firstName} ${youth.player.lastName}`,
            body: `${club.name} is not ready to offer a place. ${decisionReasonText || "Build the case in another context."} Requested focus: ${mobilityAssessment?.status === "blocked" ? "registration clearance and route verification" : structuredDecision?.requestedEvidenceCategory ?? "overall confidence"}.`,
            read: false,
            actionRequired: true,
            relatedId: youth.player.id,
            relatedEntityType: "player",
          });
        } else {
          const resolved = resolveClubDecision({
            scoutingCases: updatedScoutingCases,
            reportDeliveries: updatedReportDeliveries,
            clubDecisions: updatedClubDecisions,
            deliveryId: report.deliveryId,
            outcome: "rejected",
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            reason: signingRejectionReason
              ?? (decisionReasonText || "Club declined the youth placement recommendation"),
            reasons: signingRejectionReason
              ? [signingRejectionReason]
              : decisionReasons.length > 0 ? decisionReasons : undefined,
            scoreBreakdown: structuredDecision?.breakdown,
          });
          updatedScoutingCases = resolved.scoutingCases;
          updatedReportDeliveries = resolved.reportDeliveries;
          updatedClubDecisions = resolved.clubDecisions;
          resolvedClubDecision = resolved.decision;
          // Update placement report as rejected
          updatedPlacementReports[report.id] = {
            ...report,
            clubResponse: "rejected",
            decisionId: resolved.decision?.id,
          };

          placementMessages.push({
            id: `placement-rejected-${report.id}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "event" as const,
            title: `Placement Declined: ${youth.player.firstName} ${youth.player.lastName}`,
            body: `${club.name} declined your placement recommendation for ${youth.player.firstName} ${youth.player.lastName}. ${signingRejectionReason ?? (decisionReasonText || "Consider building more observations or targeting a different club.")}`,
            read: false,
            actionRequired: false,
            relatedId: youth.player.id,
            relatedEntityType: "player" as const,
          });
        }
        if (resolvedClubDecision && sourceReport) {
          const memoryResult = recordStakeholderMemory(
            updatedConsequenceState,
            createAcademyClubDecisionMemory({
              decision: resolvedClubDecision,
              report: sourceReport,
              scoutId: currentScoutForPlacement.id,
            }),
          );
          if (memoryResult.success) updatedConsequenceState = memoryResult.state;
        }
      }

      stateWithScheduleApplied = {
        ...withLifecycleWorld(stateWithScheduleApplied, placementLifecycle),
        placementReports: updatedPlacementReports,
        unsignedYouth: updatedUnsignedYouth,
        alumniRecords: updatedAlumniRecords,
        scoutingCases: updatedScoutingCases,
        reportDeliveries: updatedReportDeliveries,
        clubDecisions: updatedClubDecisions,
        consequenceState: updatedConsequenceState,
        scout: updatedScout,
        youthRecruitmentBriefs: updatedRecruitmentBriefs,
        recommendationReviews: updatedRecommendationReviews,
        finances: updatedFinances,
        inbox: [...stateWithScheduleApplied.inbox, ...placementMessages],
      };
    }
  }
  return stateWithScheduleApplied;
}
