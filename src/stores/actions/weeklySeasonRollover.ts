import type {
  CareerTier,
  DiscoveryRecord,
  GameState,
  InboxMessage,
  Player,
  ScoutReport,
  UnsignedYouth,
} from "@/engine/core/types";
import { getSeasonLength } from "@/engine/core/gameLoop";
import { getDifficultyModifiers } from "@/engine/core/difficulty";
import { generateSeasonAwardsData } from "@/engine/core/seasonAwards";
import { generateSeasonEvents } from "@/engine/core/seasonEvents";
import {
  getCurrentTransferWindow,
  initializeTransferWindows,
  isTransferWindowOpen,
} from "@/engine/core/transferWindow";
import { createRNG } from "@/engine/rng";
import { getRunSimulationModifiers } from "@/engine/run";
import {
  calculatePerformanceReview,
  generateJobOffers,
  updateReputation,
  type TierReviewContext,
} from "@/engine/career/progression";
import { deriveSeasonReviewMetrics } from "@/engine/career/seasonReviewContext";
import { generateBoardDirectives, processSeasonDiscoveries } from "@/engine/career";
import { applyCareerPathTransition } from "@/engine/career/transitions";
import {
  isCareerRecoveryBlockingOffers,
  openCareerSetback,
} from "@/engine/career/recovery";
import { hasRequiredCoursesForTier } from "@/engine/career/courses";
import {
  applyScoutAccountability,
  generateDirectives,
  updateTransferRecords,
} from "@/engine/firstTeam";
import { generateBoardProfile } from "@/engine/firstTeam/boardAI";
import {
  calculateDepartmentBonusPool,
  calculateGoldenParachute,
  calculatePerformanceBonusAmount,
} from "@/engine/finance";
import { generateAnalystCandidate, resolvePredictions } from "@/engine/data";
import {
  groupReportRevisionsByCase,
  selectLatestReportsByCase,
} from "@/engine/reports/reportAccountability";
import { trackPostTransfer } from "@/engine/reports/reporting";
import { ensureSeasonFixtures } from "@/engine/world/fixtures";
import { getWorldConditionModifiers } from "@/engine/world";
import { generateAcademyIntake, generateRegionalYouth } from "@/engine/youth/generation";
import { generateSeasonTournaments } from "@/engine/youth";
import { getCountryDataSync, getSecondaryCountries } from "@/data";
import { normalizeCountryKey } from "@/lib/country";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { starsToAbility } from "@/engine/scout/starRating";

export interface WeeklySeasonRolloverInput {
  state: GameState;
  beforeTick: GameState;
  sourceState: GameState;
  endOfSeasonTriggered: boolean;
  predictionAccuracyBonus: number;
}

export interface WeeklySeasonRolloverResult {
  state: GameState;
  terminal?: "ironman-fired";
}

function synchronizeDiscoveryAccuracyWithReports(
  discoveries: DiscoveryRecord[],
  reports: Record<string, ScoutReport>,
): DiscoveryRecord[] {
  const ratingsByPlayerId = new Map<string, number[]>();
  const validatedReports = selectLatestReportsByCase(
    Object.values(reports).filter((report) => report.postTransferRating !== undefined),
  );
  for (const report of validatedReports) {
    if (report.postTransferRating === undefined) continue;
    const ratings = ratingsByPlayerId.get(report.playerId) ?? [];
    ratings.push(report.postTransferRating);
    ratingsByPlayerId.set(report.playerId, ratings);
  }
  return discoveries.map((discovery) => {
    const ratings = ratingsByPlayerId.get(discovery.playerId);
    return {
      ...discovery,
      predictionAccuracy: ratings && ratings.length > 0
        ? Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length)
        : undefined,
    };
  });
}

/** Resolve season-end simulation while reporting store-level terminal outcomes. */
export function processWeeklySeasonRollover(
  input: WeeklySeasonRolloverInput,
): WeeklySeasonRolloverResult {
  let newState = input.state;
  const stateWithPhase2 = input.beforeTick;
  const gameState = input.sourceState;
  const tickResult = { endOfSeasonTriggered: input.endOfSeasonTriggered };
  const weekEquipBonuses = { predictionAccuracy: input.predictionAccuracyBonus };
    if (tickResult.endOfSeasonTriggered) {
      const completedSeason = stateWithPhase2.currentSeason;
      if (newState.scout.managerRelationship) {
        newState = {
          ...newState,
          scout: {
            ...newState.scout,
            managerRelationship: {
              ...newState.scout.managerRelationship,
              meetingsThisSeason: 0,
            },
          },
        };
      }
      // Process end-of-season discoveries before transitioning
      const updatedDiscoveryRecords = processSeasonDiscoveries(
        newState.discoveryRecords,
        newState.players,
        completedSeason,
      );
      newState = { ...newState, discoveryRecords: updatedDiscoveryRecords };

      // B10: Update transfer records with season data and classify outcomes
      const trUpdateRng = createRNG(
        `${gameState.seed}-trupdate-${stateWithPhase2.currentSeason}`,
      );
      const updatedTransferRecs = updateTransferRecords(
        trUpdateRng,
        newState.transferRecords,
        { ...newState.retiredPlayers, ...newState.players },
        newState.matchRatings,
        {
          fixtures: newState.fixtures,
          completedSeason,
          seasonLength: getSeasonLength(newState.fixtures, completedSeason),
          retiredPlayerIds: new Set(newState.retiredPlayerIds),
        },
      );
      newState = { ...newState, transferRecords: updatedTransferRecs };

      // B10: Apply scout accountability for newly classified outcomes
      const accountabilityResult = applyScoutAccountability(
        newState.transferRecords,
        { ...newState.retiredPlayers, ...newState.players },
        newState.clubs,
        newState.currentWeek,
        newState.currentSeason,
      );
      if (accountabilityResult.reputationDelta !== 0 || accountabilityResult.messages.length > 0) {
        const newReputation = Math.max(
          0,
          Math.min(100, newState.scout.reputation + accountabilityResult.reputationDelta),
        );
        newState = {
          ...newState,
          transferRecords: accountabilityResult.updatedRecords,
          scout: { ...newState.scout, reputation: newReputation },
          inbox: [...newState.inbox, ...accountabilityResult.messages],
        };
      }

      const seasonEndMessages: InboxMessage[] = [];
      const seasonReviewMetrics = deriveSeasonReviewMetrics(
        newState,
        completedSeason,
      );

      // ── Issue 3: Performance review ──────────────────────────────────────
      const seasonReports = Object.values(newState.reports).filter(
        (r) => r.submittedSeason === completedSeason,
      );
      const tierContext: TierReviewContext = {
        countriesScoutedThisSeason:
          seasonReviewMetrics.countriesScoutedThisSeason,
        regionsScoutedThisSeason:
          seasonReviewMetrics.regionsScoutedThisSeason,
        homeCountry: seasonReviewMetrics.homeCountry,
        npcScouts: Object.values(newState.npcScouts),
        managerRelationship: newState.scout.managerRelationship,
        boardDirectives: newState.scout.boardDirectives,
        unsignedYouthDiscovered:
          seasonReviewMetrics.unsignedYouthDiscovered,
        successfulPlacements: seasonReviewMetrics.successfulPlacements,
        alumniMilestonesThisSeason:
          seasonReviewMetrics.alumniMilestonesThisSeason,
      };
      const review = calculatePerformanceReview(
        newState.scout,
        seasonReports,
        completedSeason,
        tierContext,
      );
      newState = {
        ...newState,
        performanceReviews: [...newState.performanceReviews, review],
      };

      // An independent scout cannot be "fired" by a non-existent employer.
      // The same score becomes a formal career warning and opens a recovery
      // plan; bankruptcy remains the independent path's true terminal crisis.
      const hasActiveEmployer = Boolean(
        newState.scout.careerPath === "club" && newState.scout.currentClubId,
      );
      let effectiveReview = review.outcome === "fired" && !hasActiveEmployer
        ? { ...review, outcome: "warning" as const }
        : review;
      if (effectiveReview !== review) {
        newState = {
          ...newState,
          performanceReviews: [
            ...newState.performanceReviews.slice(0, -1),
            effectiveReview,
          ],
        };
      }

      // Ironman permadeath: if fired at end-of-season, trigger game over
      if (
        effectiveReview.outcome === "fired" &&
        getDifficultyModifiers(newState.difficulty).permadeath
      ) {
        return { state: newState, terminal: "ironman-fired" };
      }

      // Enforce tier gate: block promotion if required courses not completed
      if (review.outcome === "promoted" && newState.scout.careerTier < 5) {
        const targetTier = (newState.scout.careerTier + 1) as CareerTier;
        if (!hasRequiredCoursesForTier(newState.finances?.completedCourses ?? [], targetTier)) {
          effectiveReview = { ...review, outcome: "retained" };
          // Update the stored review with the blocked outcome
          newState = {
            ...newState,
            performanceReviews: [
              ...newState.performanceReviews.slice(0, -1),
              effectiveReview,
            ],
          };
          seasonEndMessages.push({
            id: `promotion-blocked-s${completedSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "feedback" as const,
            title: "Promotion Blocked",
            body: "Your performance merited a promotion, but you lack the required course qualifications for the next tier. Complete the necessary courses to advance.",
            read: false,
            actionRequired: false,
          });
        }
      }

      // Apply reputation change from review
      const reviewedScout = updateReputation(newState.scout, {
        type: "seasonEnd",
        reviewOutcome: effectiveReview.outcome,
      });
      newState = { ...newState, scout: reviewedScout };

      // If promoted, advance career tier
      if (effectiveReview.outcome === "promoted" && newState.scout.careerTier < 5) {
        const newTier = (newState.scout.careerTier + 1) as CareerTier;
        newState = {
          ...newState,
          scout: {
            ...newState.scout,
            careerTier: newTier,
          },
        };

        // F10: Generate board profile on promotion to tier 5
        if (newTier === 5 && !newState.boardProfile) {
          const boardRng = createRNG(`${gameState.seed}-board-profile-${completedSeason}`);
          newState = {
            ...newState,
            boardProfile: generateBoardProfile(boardRng),
          };
        }
      }

      const reviewOutcomeText =
        effectiveReview.outcome === "promoted"
          ? "Congratulations! You have been promoted."
          : effectiveReview.outcome === "retained"
            ? "You have been retained for next season."
            : effectiveReview.outcome === "warning"
              ? "You have received a formal warning. Improve your performance next season."
              : "Your contract has been terminated.";
      seasonEndMessages.push({
        id: `review-s${completedSeason}`,
        week: newState.currentWeek,
        season: newState.currentSeason,
        type: "feedback" as const,
        title: `Season ${completedSeason} Performance Review`,
        body: `Reports submitted: ${review.reportsSubmitted} | Avg quality: ${review.averageQuality}/100\nSuccessful recommendations: ${review.successfulRecommendations}\nReputation change: ${review.reputationChange >= 0 ? "+" : ""}${review.reputationChange}\n\n${reviewOutcomeText}`,
        read: false,
        actionRequired: false,
      });

      // W3d: Performance bonus for club-path scouts
      if (newState.scout.careerPath === "club" && newState.finances) {
        const perfBonus = calculatePerformanceBonusAmount(
          effectiveReview,
          newState.scout.careerTier,
        );
        if (perfBonus > 0) {
          newState = {
            ...newState,
            finances: {
              ...newState.finances,
              balance: newState.finances.balance + perfBonus,
              bonusRevenue: newState.finances.bonusRevenue + perfBonus,
              transactions: [
                ...newState.finances.transactions,
                {
                  week: newState.currentWeek,
                  season: newState.currentSeason,
                  amount: perfBonus,
                  description: `Performance bonus (${effectiveReview.outcome})`,
                },
              ],
            },
          };
          seasonEndMessages.push({
            id: `perf-bonus-s${completedSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "event" as const,
            title: "Performance Bonus",
            body: `You've received a £${perfBonus.toLocaleString()} performance bonus based on your season review.`,
            read: false,
            actionRequired: false,
          });
        }
      }

      // W3d: Golden parachute for tier 5 club scouts who are fired
      if (
        effectiveReview.outcome === "fired" &&
        newState.scout.careerPath === "club" &&
        newState.finances &&
        newState.scout.careerTier === 5
      ) {
        const remainingSeasons = Math.max(
          0,
          (newState.scout.contractEndSeason ?? newState.currentSeason) - newState.currentSeason,
        );
        const parachute = calculateGoldenParachute(
          newState.scout.salary,
          remainingSeasons,
        );
        if (parachute > 0) {
          newState = {
            ...newState,
            finances: {
              ...newState.finances,
              balance: newState.finances.balance + parachute,
              bonusRevenue: newState.finances.bonusRevenue + parachute,
              transactions: [
                ...newState.finances.transactions,
                {
                  week: newState.currentWeek,
                  season: newState.currentSeason,
                  amount: parachute,
                  description: "Golden parachute severance",
                },
              ],
            },
          };
          seasonEndMessages.push({
            id: `golden-parachute-s${completedSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "event" as const,
            title: "Golden Parachute",
            body: `Your contract included a golden parachute clause. You've received £${parachute.toLocaleString()} in severance pay for ${remainingSeasons} remaining season(s).`,
            read: false,
            actionRequired: false,
          });
        }
      }

      // ── Issue 1: Generate job offers ─────────────────────────────────────
      // A normal-mode firing is an atomic employment transition, not only a
      // narrative outcome. Preserve lifetime career statistics while clearing
      // every field that would otherwise leave the scout employed on paper.
      if (
        effectiveReview.outcome === "fired"
        && newState.scout.careerPath === "club"
        && newState.scout.currentClubId
      ) {
        const previousTier = newState.scout.careerTier;
        const previousClubId = newState.scout.currentClubId;
        newState = applyCareerPathTransition(newState, "independent");
        newState = openCareerSetback(newState, {
          kind: "firing",
          previousTier,
          previousClubId,
        });
        seasonEndMessages.push({
          id: `employment-ended-s${completedSeason}`,
          week: newState.currentWeek,
          season: newState.currentSeason,
          type: "feedback" as const,
          title: "Now Available for Work",
          body: "Your club employment has ended. Your career record remains intact, and you can rebuild independently or accept a new offer.",
          read: false,
          actionRequired: false,
        });
      } else if (
        effectiveReview.outcome === "warning"
        && (
          !newState.careerRecovery?.current
          || newState.careerRecovery.current.status === "completed"
          || newState.careerRecovery.current.status === "failed"
        )
      ) {
        newState = openCareerSetback(newState, {
          kind: "warning",
          previousTier: newState.scout.careerTier,
          previousClubId: newState.scout.currentClubId,
        });
      }

      const seasonEndRng = createRNG(`${gameState.seed}-seasonend-${completedSeason}`);
      const offers = isCareerRecoveryBlockingOffers(newState)
        ? []
        : generateJobOffers(
            seasonEndRng,
            newState.scout,
            newState.clubs,
            newState.currentSeason,
            getSeasonLength(newState.fixtures, newState.currentSeason),
          );
      if (offers.length > 0) {
        newState = { ...newState, jobOffers: [...newState.jobOffers, ...offers] };
        for (const offer of offers) {
          const club = newState.clubs[offer.clubId];
          seasonEndMessages.push({
            id: `job-offer-${offer.id}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            title: `Job Offer: ${club?.name ?? "Unknown"}`,
            body: `You've been offered a ${offer.role} position. Salary: £${offer.salary}/month. Contract: ${offer.contractLength} season${offer.contractLength !== 1 ? "s" : ""}. Expires week ${offer.expiresWeek}.`,
            type: "jobOffer" as const,
            read: false,
            actionRequired: true,
            relatedId: offer.id,
            relatedEntityType: "jobOffer" as const,
          });
        }
      }

      // ── Issue 8: Post-transfer retrospective accuracy ────────────────────
      const alumniPlayerIds = new Set(
        newState.alumniRecords.map((record) => record.playerId),
      );
      const transferredReportIds = new Set(
        newState.transferRecords.map((record) => record.reportId),
      );
      const reportCases = groupReportRevisionsByCase(
        Object.values(newState.reports),
      );
      const casesReadyForValidation = reportCases.filter((reportCase) =>
        reportCase.latestReport.postTransferRating === undefined
        && completedSeason - reportCase.latestReport.submittedSeason >= 2
        && (
          alumniPlayerIds.has(reportCase.latestReport.playerId)
          || reportCase.revisions.some((report) =>
            report.clubResponse === "signed"
            || transferredReportIds.has(report.id)
          )
        )
      );
      if (casesReadyForValidation.length > 0) {
        const updatedReports = { ...newState.reports };
        let validationScout = newState.scout;
        const accuracyHistory = [...(validationScout.accuracyHistory ?? [])];
        for (const reportCase of casesReadyForValidation) {
          const accountableReport = reportCase.latestReport;
          const player = resolvePlayerEntity(
            newState,
            accountableReport.playerId,
          )?.player;
          if (!player) continue;
          const seasonsSinceSigning = completedSeason - accountableReport.submittedSeason;
          const accountableAccuracy = trackPostTransfer(
            accountableReport,
            player,
            seasonsSinceSigning,
          );
          const reputationBefore = validationScout.reputation;
          if (!reportCase.wasPreviouslyValidated) {
            validationScout = updateReputation(validationScout, {
              type: "reportValidated",
              accuracy: accountableAccuracy,
            });
          }
          const accuracyReputationDelta = reportCase.wasPreviouslyValidated
            ? 0
            : +(
              validationScout.reputation - reputationBefore
            ).toFixed(1);
          const assessmentAverage = accountableReport.attributeAssessments.length > 0
            ? accountableReport.attributeAssessments.reduce(
                (sum, assessment) => sum + assessment.estimatedValue,
                0,
              ) / accountableReport.attributeAssessments.length
            : 10;
          const predictedCA = accountableReport.perceivedCAStars !== undefined
            ? starsToAbility(accountableReport.perceivedCAStars)
            : Math.round((assessmentAverage / 20) * 200);
          if (!reportCase.wasPreviouslyValidated) {
            accuracyHistory.push({
              week: newState.currentWeek,
              season: newState.currentSeason,
              predictedCA,
              actualCA: player.currentAbility,
            });
          }
          for (const report of reportCase.revisions) {
            if (
              report.postTransferRating !== undefined
              || completedSeason - report.submittedSeason < 2
            ) {
              continue;
            }
            updatedReports[report.id] = {
              ...report,
              postTransferRating: trackPostTransfer(
                report,
                player,
                completedSeason - report.submittedSeason,
              ),
              accuracyReputationDelta:
                report.id === accountableReport.id
                  ? accuracyReputationDelta
                  : 0,
            };
          }
          seasonEndMessages.push({
            id: `retro-${accountableReport.id}-s${completedSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            title: `Report Validated: ${player.firstName} ${player.lastName}`,
            body: `Your active judgment on ${player.firstName} ${player.lastName} from season ${accountableReport.submittedSeason} has been validated after ${seasonsSinceSigning} seasons. Accuracy: ${accountableAccuracy}/100. This scouting case changed reputation ${accuracyReputationDelta >= 0 ? "+" : ""}${accuracyReputationDelta}; earlier revisions were reviewed without multiplying the reward.`,
            type: "feedback" as const,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }
        newState = {
          ...newState,
          reports: updatedReports,
          scout: {
            ...validationScout,
            accuracyHistory: accuracyHistory.slice(-50),
          },
        };
      }
      newState = {
        ...newState,
        discoveryRecords: synchronizeDiscoveryAccuracyWithReports(
          newState.discoveryRecords,
          newState.reports,
        ),
      };

      // W3d: Department bonus pool for tier 4+ club scouts at season end
      if (
        newState.scout.careerPath === "club" &&
        newState.scout.careerTier >= 4 &&
        newState.finances
      ) {
        // Count successful signings from transfer records this season
        const seasonSuccesses = newState.transferRecords.filter(
          (tr) =>
            tr.transferSeason === completedSeason &&
            tr.reportId &&
            (tr.outcome === "hit" || tr.outcome === "decent"),
        ).length;
        const deptBonus = calculateDepartmentBonusPool(
          seasonSuccesses,
          newState.scout.careerTier,
        );
        if (deptBonus > 0) {
          newState = {
            ...newState,
            finances: {
              ...newState.finances,
              balance: newState.finances.balance + deptBonus,
              bonusRevenue: newState.finances.bonusRevenue + deptBonus,
              transactions: [
                ...newState.finances.transactions,
                {
                  week: newState.currentWeek,
                  season: newState.currentSeason,
                  amount: deptBonus,
                  description: `Department bonus pool (${seasonSuccesses} successful signings)`,
                },
              ],
            },
          };
          seasonEndMessages.push({
            id: `dept-bonus-s${completedSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            type: "event" as const,
            title: "Department Bonus",
            body: `Your department achieved ${seasonSuccesses} successful signing(s) this season. You've received a £${deptBonus.toLocaleString()} department bonus.`,
            read: false,
            actionRequired: false,
          });
        }
      }

      // A8: Generate season awards data before transitioning
      const seasonAwardsData = generateSeasonAwardsData(newState, completedSeason);
      newState = { ...newState, seasonAwardsData };

      // Add all season-end messages to inbox
      if (seasonEndMessages.length > 0) {
        newState = { ...newState, inbox: [...newState.inbox, ...seasonEndMessages] };
      }

      // Generate new season fixtures for core leagues only (skip secondary talent pools)
      const fixtureRng = createRNG(`${gameState.seed}-fixtures-s${newState.currentSeason}`);
      const secondaryCountryKeys = new Set(getSecondaryCountries());
      const scheduledLeagueIds: string[] = [];
      for (const league of Object.values(newState.leagues)) {
        // Derive country key from territory to skip secondary leagues
        const territory = Object.values(newState.territories).find(
          (t) => t.leagueIds.includes(league.id),
        );
        const countryKey = territory
          ? territory.countryKey
            ?? normalizeCountryKey(territory.country)
            ?? territory.id.replace("territory_", "")
          : "";
        if (secondaryCountryKeys.has(countryKey)) continue;
        scheduledLeagueIds.push(league.id);
      }
      newState = {
        ...newState,
        fixtures: ensureSeasonFixtures(
          fixtureRng,
          newState.leagues,
          newState.fixtures,
          newState.currentSeason,
          scheduledLeagueIds,
          completedSeason,
        ),
      };

      const newSeasonEvents = generateSeasonEvents(
        newState.currentSeason,
        getSeasonLength(newState.fixtures, newState.currentSeason),
      );
      const newTransferWindows = initializeTransferWindows(newState.currentSeason);
      const newTransferWindow = getCurrentTransferWindow(
        newTransferWindows.map((w) => ({
          ...w,
          isOpen: isTransferWindowOpen([w], newState.currentWeek),
        })),
        newState.currentWeek,
      );
      // Generate youth tournaments for the new season
      const tournamentRng = createRNG(`${newState.seed}-tournaments-s${newState.currentSeason}`);
      const newTournaments = generateSeasonTournaments(
        tournamentRng, newState.currentSeason, newState.countries, newState.scout,
      );
      newState = {
        ...newState,
        seasonEvents: newSeasonEvents,
        transferWindow: newTransferWindow,
        youthTournaments: newTournaments,
        // Reset at the start of each new season — every fixture is fresh
        playedFixtures: [],
        completedInteractiveSessions: [],
      };

      // ── Generate unsigned youth and academy intakes for the new season ──────
      // Country data was loaded into the sync registry during startNewGame, so
      // getCountryDataSync is safe to call here without awaiting.
      const youthRng = createRNG(`${gameState.seed}-youth-s${newState.currentSeason}`);
      const newYouth: UnsignedYouth[] = [];
      const newAcademyPlayers: Player[] = [];

      for (const countryKey of newState.countries) {
        const countryData = getCountryDataSync(countryKey);
        if (!countryData) continue;

        // Regional youth generation
        const countrySubRegions = Object.values(newState.subRegions).filter(
          (sr) => sr.country.toLowerCase() === countryData.name.toLowerCase(),
        );
        // Use week=1 for the season-start batch (season boundary context)
        const batch = generateRegionalYouth(
          youthRng,
          countryData,
          newState.currentSeason,
          1,
          countrySubRegions,
          getDifficultyModifiers(newState.difficulty).wonderkidRateMultiplier
            * getRunSimulationModifiers(newState.runManifest).youthTalentMultiplier,
          "season-start",
          getWorldConditionModifiers(newState, countryKey).discoveryMultiplier,
        );
        newYouth.push(...batch);

        // Academy intake for all clubs in this country
        const countryClubs = Object.values(newState.clubs).filter((c) => {
          const league = newState.leagues[c.leagueId];
          return league?.country.toLowerCase() === countryData.name.toLowerCase();
        });
        for (const club of countryClubs) {
          const intake = generateAcademyIntake(
            youthRng,
            club,
            countryData,
            newState.currentSeason,
          );
          newAcademyPlayers.push(...intake);
        }
      }

      // Merge unsigned youth pool
      if (newYouth.length > 0) {
        const updatedUnsignedYouth = { ...newState.unsignedYouth };
        for (const y of newYouth) {
          updatedUnsignedYouth[y.id] = y;
        }
        newState = { ...newState, unsignedYouth: updatedUnsignedYouth };
      }

      // Merge academy intake players into players + club rosters
      if (newAcademyPlayers.length > 0) {
        const updatedPlayers = { ...newState.players };
        const updatedClubs = { ...newState.clubs };
        for (const p of newAcademyPlayers) {
          updatedPlayers[p.id] = p;
          const club = updatedClubs[p.clubId];
          if (club) {
            updatedClubs[p.clubId] = {
              ...club,
              academyPlayerIds: [
                ...new Set([...(club.academyPlayerIds ?? []), p.id]),
              ],
            };
          }
        }
        newState = { ...newState, players: updatedPlayers, clubs: updatedClubs };
      }

      // ── First-team season-end: regenerate directives and update transfer records ──
      if (newState.scout.primarySpecialization === "firstTeam") {
        // Generate new manager directives for the new season
        if (newState.scout.currentClubId) {
          const newSeasonDirectiveRng = createRNG(
            `${gameState.seed}-directives-s${newState.currentSeason}`,
          );
          const scoutClub = newState.clubs[newState.scout.currentClubId];
          const scoutManager = newState.managerProfiles[newState.scout.currentClubId];
          if (scoutClub && scoutManager) {
            const newDirectives = generateDirectives(
              newSeasonDirectiveRng,
              scoutClub,
              scoutManager,
              newState.players,
              newState.currentSeason,
            );
            newState = { ...newState, managerDirectives: newDirectives };
          }
        }

      }

      // ── Board directives for tier 5+ scouts ────────────────────────────────
      if (newState.scout.careerTier >= 5) {
        const boardDirRng = createRNG(
          `${gameState.seed}-board-directives-s${newState.currentSeason}`,
        );
        const directives = generateBoardDirectives(boardDirRng, newState.scout, newState.currentSeason);
        newState = {
          ...newState,
          scout: { ...newState.scout, boardDirectives: directives },
        };
      }

      // ── Season consolidation: matchRatings → player.seasonRatings, then wipe ──
      if (Object.keys(newState.matchRatings).length > 0) {
        const consolidatedPlayers = { ...newState.players };

        // Gather all ratings per player from all fixtures this season
        const playerSeasonRatings = new Map<string, import("@/engine/core/types").PlayerMatchRating[]>();
        for (const fixtureRatings of Object.values(newState.matchRatings)) {
          for (const [pid, rating] of Object.entries(fixtureRatings)) {
            if (!playerSeasonRatings.has(pid)) playerSeasonRatings.set(pid, []);
            playerSeasonRatings.get(pid)!.push(rating);
          }
        }

        // Build SeasonRatingRecord for each player
        for (const [pid, ratings] of playerSeasonRatings) {
          const player = consolidatedPlayers[pid];
          if (!player) continue;

          const avgRating = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
          const appearances = ratings.length;
          let goals = 0;
          let assists = 0;
          let cleanSheets = 0;
          for (const r of ratings) {
            goals += r.stats.goals ?? 0;
            assists += r.stats.assists ?? 0;
            if (r.stats.cleanSheet) cleanSheets++;
          }

          const seasonRecord = {
            season: completedSeason,
            avgRating: Math.round(avgRating * 10) / 10,
            appearances,
            goals,
            assists,
            cleanSheets,
          };

          consolidatedPlayers[pid] = {
            ...player,
            seasonRatings: [...(player.seasonRatings ?? []), seasonRecord],
          };
        }

        // Wipe per-fixture match ratings, keep recentMatchRatings on players (carries form)
        newState = { ...newState, players: consolidatedPlayers, matchRatings: {} };
      }

      // ── Data scout season-end: resolve predictions and generate new analyst candidates ──
      if (newState.scout.primarySpecialization === "data") {
        // Resolve all outstanding predictions for the completed season
        if (newState.predictions.length > 0) {
          const endSeasonPredRng = createRNG(
            `${gameState.seed}-predend-s${completedSeason}`,
          );
          const faPlayerIdsEnd = new Set(
            (newState.freeAgentPool?.agents ?? []).map((a) => a.playerId),
          );
          const endPredAccBonus = weekEquipBonuses?.predictionAccuracy ?? 0;
          const resolvedAtSeasonEnd = resolvePredictions(
            newState.predictions,
            newState.players,
            completedSeason,
            newState.currentWeek,
            endSeasonPredRng,
            faPlayerIdsEnd,
            endPredAccBonus,
          );
          newState = { ...newState, predictions: resolvedAtSeasonEnd };
        }

        // Generate a new analyst candidate as an end-of-season event
        const analystCandidateRng = createRNG(
          `${gameState.seed}-analystcandidate-s${newState.currentSeason}`,
        );
        const candidate = generateAnalystCandidate(
          analystCandidateRng,
          newState.currentSeason,
          `season-${newState.currentSeason}`,
        );
        const candidateMsg: InboxMessage = {
          id: `analyst-candidate-s${newState.currentSeason}`,
          week: newState.currentWeek,
          season: newState.currentSeason,
          type: "event" as const,
          title: "New Analyst Candidate Available",
          body: `A data analyst has expressed interest in joining your team. ${candidate.name} (Skill: ${candidate.skill}/20, Focus: ${candidate.focus}) is available for £${candidate.salary}/week. Review their profile in your analytics dashboard.`,
          read: false,
          actionRequired: false,
        };
        newState = {
          ...newState,
          inbox: [...newState.inbox, candidateMsg],
        };
      }

    } else {
      // Keep season events as-is; update transfer window open/closed state
      const existingWindows = initializeTransferWindows(newState.currentSeason);
      const updatedTransferWindow = getCurrentTransferWindow(
        existingWindows.map((w) => ({
          ...w,
          isOpen: isTransferWindowOpen([w], newState.currentWeek),
        })),
        newState.currentWeek,
      );
      newState = { ...newState, transferWindow: updatedTransferWindow };
    }
  return { state: newState };
}
