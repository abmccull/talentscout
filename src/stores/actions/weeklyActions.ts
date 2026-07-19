/**
 * Weekly cycle, calendar scheduling, match, day simulation, and season
 * transition actions extracted from gameStore.
 *
 * Handles scheduleActivity, advanceWeek (the giant weekly processing loop),
 * startWeekSimulation, advanceDay, match lifecycle, autoSchedule, batchAdvance,
 * delegation, fast-forward, and related helpers.
 */
import type { GetState, SetState } from "./types";
import type { GameScreen, WeekSummary } from "../gameStoreTypes";
import { createWeekSimulationActions } from "./weekSimulationActions";
import { createMatchActions } from "./matchActions";
import { processWeeklyEconomy } from "./weeklyEconomy";
import { clearTerminalNarrativeInboxActions } from "./narrativeInboxState";
import { createAutosaveQueue, scheduleAfterPaint } from "./autosaveQueue";
import type {
  GameState,
  Activity,
  Player,
  Club,
  League,
  Fixture,
  ScoutReport,
  Contact,
  InboxMessage,
  JobOffer,
  FocusSelection,
  MatchPhase,
  NPCScout,
  NPCScoutReport,
  Territory,
  Specialization,
  NarrativeEvent,
  RivalScout,
  SeasonEvent,
  ScoutPerformanceSnapshot,
  HiddenIntel,
  ManagerDirective,
  LeaderboardEntry,
  PlayerMatchRating,
  LegacyProfile,
  ConvictionLevel,
} from "@/engine/core/types";
import type { ActivityQualityResult } from "@/engine/core/activityQuality";
import { createRNG } from "@/engine/rng";
import { getDifficultyModifiers } from "@/engine/core/difficulty";
import { getRunSimulationModifiers } from "@/engine/run";
import { getActiveSeasonEvents } from "@/engine/core/seasonEvents";
import { resolveSeasonEventChoice } from "@/engine/core/seasonEventEffects";
import {
  generateUrgentAssessment,
  isDeadlineDayPressure,
} from "@/engine/core/transferWindow";
import {
  getSeasonLength,
} from "@/engine/core/gameLoop";
import {
  compactCompletedSeasonHistory,
  createWeeklySimulationPipeline,
  evaluateWeekAdvancePreflight,
} from "@/engine/core/weeklySimulationPipeline";
import { createWeeklyTransactionJob } from "@/engine/core/weeklyTransactionProtocol";
import {
  selectDelegationPolicy,
  selectWeeklyIntent,
  type DelegationPolicyId,
  type WeeklyIntentId,
} from "@/engine/core/weeklyStrategy";
import {
  expireJobOffersAtWeekEnd,
} from "@/engine/career/progression";
import { generateContactForType } from "@/engine/network/contacts";
import {
  createWeekSchedule,
  addActivity,
  removeActivity,
  canAddActivity,
  canScheduleActivity,
  getAvailableActivities,
  getScheduledActivityInstances,
  processCompletedWeek,
  applyWeekResults,
  evaluateFatigueConsequences,
  readConsecutiveRestWeeks,
  resolveWeekActivityXp,
  ACTIVITY_SLOT_COSTS,
  ACTIVITY_SKILL_XP as ACTIVITY_SKILL_XP_MAP,
} from "@/engine/core/calendar";
import { ensureLeadershipDelegationTeam } from "@/engine/career/index";
import {
  isCareerRecoveryBlockingOffers,
  processCareerRecoveryWeek,
} from "@/engine/career/recovery";
import {
  processLeadershipPortfolioWeek,
} from "@/engine/career/leadership";
import {
  careerMomentFromLeadership,
  careerMomentFromNarrativeEvent,
  careerMomentFromPerformanceReview,
  careerMomentFromRecovery,
  createCareerMoment,
  enqueueCareerMoments,
  type CareerMoment,
} from "@/engine/career/careerMoments";
import {
  generateLegacyProfile as generateLegacyProfileEngine,
  applyLegacyPerks as applyLegacyPerksEngine,
  hasRepresentedCareerCompletionState,
  getCareerSeasonOrdinal,
  readLegacyProfile,
  writeLegacyProfile,
} from "@/engine/career/legacy";
import { isBankruptcyRecoveryActive } from "@/engine/finance/distress";
import {
  createLeaderboardEntry,
  submitLeaderboardEntry,
} from "@/lib/leaderboard";
import {
  bookTravel,
  getTravelDuration,
  getScoutHomeCountry as getScoutHome,
  processInternationalWeek,
  classifyStandingZone,
  getRegionalTravelQuote,
  getActiveWorldConditionNames,
  getWorldConditionModifiers,
  getPlayerScoutingCountry,
} from "@/engine/world/index";
import { initializeRegionalKnowledge } from "@/engine/specializations/regionalKnowledge";
import { ALL_PERKS } from "@/engine/specializations/perks";
import {
  getLifecycleWorld,
  resolvePlayerMovements,
  withLifecycleWorld,
} from "@/engine/world/playerLifecycle";
import { reconcileInboxActionRequirements } from "@/engine/world/inboxActionAuthority";
import { applyAcceptedNarrativeConsequences } from "@/engine/world/acceptedNarrativeConsequences";
import {
  initializeFinances,
  processWeeklyFinances,
  sumOperatingExpenses,
  applyDifficultyFinancialAdjustments,
  getActiveEquipmentBonuses,
  getContextualEquipmentBonuses,
  migrateEquipmentLevel,
  negotiateRetainerTerms,
  calculateSigningBonus,
  processAssistantScoutWeek,
  processWeeklyInfrastructureCosts,
  calculateInfrastructureEffects,
  processStarterStipend,
} from "@/engine/finance";
import { getCreditScore } from "@/engine/finance/creditScore";
import { getLifestyleEffects } from "@/engine/finance/expenses";
import { isFinancialPeriodClose } from "@/engine/core/annualization";
import {
  createStoryDirectorStateV2,
  directWeeklyNarrativeEvent,
  directWeeklyStoryEmissionsV2,
  inferNarrativeEntityRefsV2,
  recordEventDirectorOutcome,
  acknowledgeEvent,
  checkStorylineTriggers,
  processActiveStorylines,
  advanceChain,
  type WeeklyNarrativeEmissionV2,
} from "@/engine/events";
import {
  applyDirectedWorldPulse,
  prepareWeeklyWorldPulse,
} from "@/engine/events/worldPulse";
import { createStakeholderProfileRegistry } from "@/engine/consequences/stakeholderProfiles";
import {
  generateRivalScouts,
  processRivalScoutWeek,
  generateRivalIntelligence,
  resolveRivalSigningAttempt,
  getPoachCounterBidEligibility,
  advanceYouthRivalPressure,
  resolveRivalYouthClaim,
  selectYouthRivalTarget,
  migrateRivalOrganizationState,
  processRivalOrganizationWeek,
} from "@/engine/rivals";
import { checkToolUnlocks } from "@/engine/tools";
import { getActiveToolBonuses } from "@/engine/tools/unlockables";
import { generateManagerProfiles } from "@/engine/analytics";
import {
  advanceYouthRecruitmentBriefs,
  deriveYouthRecruitmentBriefCapacity,
  directWeeklyYouthProfessionalCase,
  generateYouthRecruitmentBriefs,
} from "@/engine/youth";
import {
  completeAcademyRecommendationReview,
} from "@/engine/youth/recommendationReviews";
import { calibrateSourceEvidenceFromReview } from "@/engine/scout/sourceCalibration";
import { applyScoutSkillXp } from "@/engine/scout/progression";
import { getCountryDataSync, getAvailableCountries } from "@/data/index";
import {
  useTutorialStore,
  resolveOnboardingSequence,
  type TutorialState,
} from "@/stores/tutorialStore";
import { IS_DEMO, isDemoLimitReached, DEMO_ALLOWED_SPECS } from "@/lib/demo";
import {
  applyScenarioOverrides,
  resolveScenarioOutcome,
} from "@/engine/scenarios";

const YOUTH_SUMMARY_ACTIVITY_TYPES = new Set<Activity["type"]>([
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "youthTournament",
  "academyVisit",
  "watchVideo",
  "followUpSession",
  "parentCoachMeeting",
  "trainingVisit",
]);

/**
 * Return narrative age for the bounded retention window without walking every
 * prior season. The calendar guarantees at least 38 weeks per season, so an
 * event older than the immediately previous season is necessarily outside the
 * ten-week archive window. Future-dated records retain the legacy negative-age
 * behavior and are not pruned as stale.
 */
export function getNarrativeRetentionAge(
  event: Pick<NarrativeEvent, "season" | "week">,
  current: { season: number; week: number },
  previousSeasonLength: number,
): number {
  if (event.season > current.season) return Number.NEGATIVE_INFINITY;
  if (event.season === current.season) return current.week - event.week;
  if (event.season === current.season - 1) {
    return previousSeasonLength - event.week + current.week;
  }
  return Number.POSITIVE_INFINITY;
}

/** Reconcile recurring cast identity after contacts, staff and rivals move. */
export function refreshWeeklyStakeholderProfiles(state: GameState): GameState {
  return {
    ...state,
    stakeholderProfiles: createStakeholderProfileRegistry(
      state,
      state.stakeholderProfiles,
    ),
  };
}

import { deriveTacticalStyleFromPhilosophy } from "@/engine/firstTeam/tacticalStyle";
import {
  createPrediction,
  generatePredictionSuggestions,
} from "@/engine/data";
import { createInsightState, accumulateInsight, calculateCapacity, tickCooldown } from "@/engine/insight/insight";
import {
  nextGameWeek,
  resolveClubDecision,
} from "@/engine/reports/scoutingCases";
import { deriveScoutingCaseObservationFocus } from "@/engine/reports/caseQuestions";
import { getActiveSaveProvider } from "@/lib/activeSaveProvider";
import { persistGameState } from "@/lib/saveProvider";
import {
  createWeeklyQuickScoutActions,
  isBatchAdvanceInProgress,
} from "./weeklyQuickScoutActions";
import {
  aggregateQualityForType,
  buildDayInteraction,
  buildDaySpanInfo,
  buildScoutQualityDataForState,
  derivePendingCelebration,
  deriveScenarioState,
  isDayInteractionPending,
  isQualityRelevantActivity,
  processInternationalTravelLifecycle,
  resolveScoutEffectiveCountry,
  rollDayActivityQuality,
  seedKnownPlayersForContact,
} from "./weeklySimulationSupport";

const OBSERVATION_FOCUS_ACTIVITY_TYPES = new Set<Activity["type"]>([
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "academyVisit",
  "youthTournament",
  "followUpSession",
  "parentCoachMeeting",
  "reserveMatch",
  "attendMatch",
  "trainingVisit",
  "trialMatch",
]);

function withScoutingCaseFocus(
  state: GameState,
  activity: Activity,
): Activity {
  if (
    !activity.targetId
    || !OBSERVATION_FOCUS_ACTIVITY_TYPES.has(activity.type)
    || activity.scoutingQuestionId
  ) {
    return activity;
  }
  const focus = deriveScoutingCaseObservationFocus(state, {
    playerId: activity.targetId,
    briefId: activity.briefId,
  });
  if (!focus) return activity;
  return {
    ...activity,
    scoutingQuestionId: focus.scoutingQuestionId,
    scoutingQuestionIds: focus.scoutingQuestionIds,
  };
}
import {
  processWeeklyContextualHint,
  processWeeklyTutorialMilestones,
} from "./weeklyPresentationEffects";
import { registerNarrativeDecisions } from "./weeklyNarrativeConsequences";
import { processWeeklyWorldProgression } from "./weeklyWorldProgression";
import { processWeeklyTransferAccountability } from "./weeklyTransferAccountability";
import { processWeeklySpecializationSystems } from "./weeklySpecializationSystems";
import {
  applyDirectedWeeklyScoutingEcology,
  prepareWeeklyScoutingEcology,
} from "./weeklyScoutingEcologyPhase";
import {
  applyDirectedWeeklyRivalCampaigns,
  prepareWeeklyRivalCampaigns,
} from "./weeklyRivalCampaigns";
import { processWeeklyPostTickSystems } from "./weeklyPostTickSystems";
import { processWeeklySeasonRollover } from "./weeklySeasonRollover";
import { processWeeklyRelationshipActivities } from "./weeklyRelationshipActivities";
import { processWeeklyReportActivities } from "./weeklyReportActivities";
import { processWeeklyActivityFeedback } from "./weeklyActivityFeedback";
import { processWeeklyObservationActivities } from "./weeklyObservationActivities";
import { processWeeklyPlacementResolution } from "./weeklyPlacementResolution";
import {
  applyWeeklyStrategyAndInteractiveModifiers,
  createWeeklyChoiceModifiers,
} from "./weeklyActivityModifiers";
import {
  applyDirectedWorldConditionArcBeats,
  prepareWorldConditionArcWeek,
} from "./weeklyWorldConditionArcs";

export { projectExpiredNarrativeDefaults } from "./weeklyNarrativeConsequences";

// ── Module-level state ─────────────────────────────────────────────────────
// ── Local type alias ───────────────────────────────────────────────────────

interface AutosaveRequest {
  state: GameState;
  set: SetState;
}

const autosaveQueue = createAutosaveQueue<AutosaveRequest>({
  schedule: scheduleAfterPaint,
  onRequest: ({ set }) => set({ autosaveError: null }),
  persist: async ({ state }) => {
    const provider = await getActiveSaveProvider();
    await persistGameState(provider, "autosave", state, "Autosave");
  },
  onError: (error, { set }) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Autosave failed:", error);
    set({ autosaveError: message });
  },
});

export function queueWeeklyAutosave(newState: GameState, set: SetState): void {
  // A single player command can request both a checkpoint and a final save.
  // Coalesce those synchronous requests before persistence migration starts,
  // then defer the structured commit until the completed week can paint first.
  autosaveQueue.request({ state: newState, set });
}


export interface WeeklyActionRuntime {
  /** Persistence belongs to the browser store, never the simulation worker. */
  persistenceEnabled: boolean;
  /** Presentation effects are routed through a serializable worker port. */
  getTutorialState: () => TutorialState;
}

const INTERACTIVE_WEEKLY_RUNTIME: WeeklyActionRuntime = {
  persistenceEnabled: true,
  getTutorialState: () => useTutorialStore.getState(),
};

export function createWeeklyActions(
  get: GetState,
  set: SetState,
  runtime: WeeklyActionRuntime = INTERACTIVE_WEEKLY_RUNTIME,
) {
  return {
  // ══════════════════════════════════════════════════════════════════════════
  // Schedule Management (scheduleActivity, unscheduleActivity)
  // ══════════════════════════════════════════════════════════════════════════

  scheduleActivity: (activity: Activity, dayIndex: number) => {
    const { gameState } = get();
    if (!gameState) return;
    if (
      hasRepresentedCareerCompletionState(gameState) ||
      isBankruptcyRecoveryActive(gameState.finances)
    ) {
      return;
    }
    // Equipment travelSlotReduction: reduce slot cost for travel activities
    let effectiveActivity = withScoutingCaseFocus(gameState, activity);
    if (effectiveActivity.type === "travel" || effectiveActivity.type === "internationalTravel") {
      const travelEquipBonuses = gameState.finances?.equipment
        ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
        : undefined;
      const slotReduction = travelEquipBonuses?.travelSlotReduction ?? 0;
      if (slotReduction > 0 && effectiveActivity.slots > 1) {
        effectiveActivity = {
          ...effectiveActivity,
          slots: Math.max(1, effectiveActivity.slots - slotReduction),
        };
      }
    }
    if (!canScheduleActivity(
      gameState.schedule,
      effectiveActivity,
      dayIndex,
      gameState.scout,
    )) {
      return;
    }
    const schedule = addActivity(gameState.schedule, effectiveActivity, dayIndex);
    set({
      gameState: { ...gameState, schedule },
      weekSimulation: null,
    });

    // Tutorial auto-advance — generic and specialization-specific conditions.
    const tutorial = runtime.getTutorialState();
    tutorial.checkAutoAdvance("activityScheduled");
    tutorial.completeMilestone("scheduledActivity");

    const YOUTH_ACTIVITIES = new Set([
      "schoolMatch", "grassrootsTournament", "streetFootball",
      "academyTrialDay", "youthFestival", "youthTournament",
    ]);
    if (YOUTH_ACTIVITIES.has(effectiveActivity.type)) {
      tutorial.checkAutoAdvance("youthActivityScheduled");
      // Contextual trigger: first youth activity → specialization onboarding
      const hasClub = !!gameState.scout.currentClubId;
      tutorial.startSequence(resolveOnboardingSequence("youth", hasClub));
    }

    const DATA_ACTIVITIES = new Set([
      "databaseQuery", "deepVideoAnalysis", "statsBriefing",
      "algorithmCalibration", "marketInefficiency",
    ]);
    if (DATA_ACTIVITIES.has(effectiveActivity.type)) {
      tutorial.checkAutoAdvance("dataActivityScheduled");
      // Contextual trigger: first data activity → specialization onboarding
      const hasClub = !!gameState.scout.currentClubId;
      tutorial.startSequence(resolveOnboardingSequence("data", hasClub));
    }

    // Contextual trigger: first opposition analysis → first team onboarding
    const FT_ACTIVITIES = new Set([
      "oppositionAnalysis", "reserveMatch", "tacticalBriefing",
    ]);
    if (FT_ACTIVITIES.has(effectiveActivity.type)) {
      const hasClub = !!gameState.scout.currentClubId;
      tutorial.startSequence(resolveOnboardingSequence("firstTeam", hasClub));
    }
  },

  unscheduleActivity: (dayIndex: number) => {
    const { gameState } = get();
    if (!gameState) return;
    const schedule = removeActivity(gameState.schedule, dayIndex);
    set({
      gameState: { ...gameState, schedule },
      weekSimulation: null,
    });
  },

  setWeeklyIntent: (intentId: WeeklyIntentId) => {
    const { gameState } = get();
    if (!gameState) return;
    set({
      gameState: {
        ...gameState,
        weeklyStrategy: selectWeeklyIntent(
          gameState.weeklyStrategy,
          intentId,
          gameState.currentWeek,
          gameState.currentSeason,
        ),
      },
      weekSimulation: null,
    });
  },

  setDelegationPolicy: (policyId: DelegationPolicyId) => {
    const { gameState } = get();
    if (!gameState) return;
    set({
      gameState: {
        ...gameState,
        weeklyStrategy: selectDelegationPolicy(
          gameState.weeklyStrategy,
          policyId,
          gameState.currentWeek,
          gameState.currentSeason,
        ),
      },
      weekSimulation: null,
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Week Advancement (requestWeekAdvance, resolveSeasonEvent, advanceWeek)
  // ══════════════════════════════════════════════════════════════════════════

  requestWeekAdvance: () => {
    const { weekSimulation } = get();
    if (weekSimulation) {
      set({ currentScreen: "weekSimulation" });
      return;
    }
    runtime.getTutorialState().completeMilestone("advancedWeek");
    get().startWeekSimulation();
  },

  resolveSeasonEvent: (eventId: string, choiceIndex: number) => {
    const { gameState } = get();
    if (!gameState) return;
    const newState = resolveSeasonEventChoice(gameState, eventId, choiceIndex);
    set({
      gameState: newState,
      weekSimulation: null,
    });
  },

  advanceWeek: () => {
    const { gameState } = get();
    if (!gameState) return;

    // Checkpoint autosave before processing — if the game crashes during week
    // simulation the player has a save from immediately before.
    if (runtime.persistenceEnabled && !isBatchAdvanceInProgress()) {
      getActiveSaveProvider()
        .then((provider) => persistGameState(provider, "autosave", gameState, "Autosave"))
        .catch((err) => {
          console.warn("Pre-advance checkpoint autosave failed:", err);
        });
    }

    const simState = get().weekSimulation;
    const pendingFixtureIds = simState && gameState.scout.primarySpecialization !== "youth"
      ? get().getPendingMatches()
      : [];
    const preflight = evaluateWeekAdvancePreflight({
      hasWeekSimulation: Boolean(simState),
      hasPendingDayInteractions: simState?.dayResults.some((day) => isDayInteractionPending(day)) ?? false,
      demoLimitReached: isDemoLimitReached(gameState.currentSeason),
      hasPendingInteractiveMatch: pendingFixtureIds.length > 0,
    });

    // Keep progression consistent across all entry points:
    // advancing a week must flow through day-by-day simulation first.
    if (preflight.kind === "start-week-simulation") {
      get().startWeekSimulation();
      return;
    }
    if (preflight.kind === "await-day-interaction") {
      return;
    }

    // ── Demo limit gate ────────────────────────────────────────────────────
    if (preflight.kind === "show-demo-end") {
      set({ currentScreen: "demoEnd" as GameScreen });
      return;
    }

    // ── Gate: play all scheduled attendMatch fixtures interactively first ───
    // Find every attendMatch activity in this week's schedule that has a
    // targetId (fixture ID) which hasn't been played via the MatchScreen yet.
    // Youth scouts skip this gate — they cannot attend first-team matches.
    if (preflight.kind === "start-pending-match") {
      if (pendingFixtureIds.length > 0) {
        // Launch the first unplayed fixture. The user will call endMatch(), which
        // records it in playedFixtures. They then click "Advance Week" again and
        // this gate re-evaluates — eventually clearing all pending matches.
        get().startMatch(pendingFixtureIds[0]);
        return;
      }
    }

    // Non-match interactive sessions are optional, but skipped sessions now
    // incur opportunity-cost penalties in the modifier aggregation stage below.

    const rng = createRNG(`${gameState.seed}-week-${gameState.currentWeek}-${gameState.currentSeason}`);

    // Process scheduled activities → fatigue, skill XP, attribute XP
    // Travel posture is supplied to the calendar's single authoritative
    // fatigue path, keeping manual, batch, and save/reload advancement equal.
    const scheduledTravelActivity = gameState.schedule.activities.find(
      (activity) => activity?.type === "internationalTravel" || activity?.type === "travel",
    );
    const travelDestination = scheduledTravelActivity?.targetId
      ?? gameState.scout.travelBooking?.destinationCountry;
    const travelPosture = gameState.scout.travelBooking?.posture;
    const quotedTravelFatigueMultiplier = travelDestination
      ? getRegionalTravelQuote(
          gameState,
          travelDestination,
          travelPosture,
        ).fatigueMultiplier
      : 1;
    const infrastructureTravelMultiplier = calculateInfrastructureEffects(
      gameState.scoutingInfrastructure,
    ).travelFatigueMultiplier;
    const travelFatigueMultiplier = Math.max(
      0,
      quotedTravelFatigueMultiplier * infrastructureTravelMultiplier,
    );
    const weekResult = processCompletedWeek(
      gameState.schedule,
      gameState.scout,
      rng,
      scheduledTravelActivity
        ? { [scheduledTravelActivity.type]: travelFatigueMultiplier }
        : undefined,
    );

    // ── Roll activity quality per day/instance ─────────────────────────────
    // This keeps multi-day activities dynamic (e.g., day 1 excellent, day 2 poor)
    // while remaining deterministic across save/load.
    const qualityRollsByDay: Array<{
      dayIndex: number;
      activity: Activity;
      result: ActivityQualityResult;
    }> = [];
    const qualityBucketsByType = new Map<Activity["type"], ActivityQualityResult[]>();
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const activity = gameState.schedule.activities[dayIndex];
      if (!isQualityRelevantActivity(activity)) continue;
      const result = rollDayActivityQuality(gameState, activity, dayIndex);
      qualityRollsByDay.push({ dayIndex, activity, result });
      const bucket = qualityBucketsByType.get(activity.type) ?? [];
      bucket.push(result);
      qualityBucketsByType.set(activity.type, bucket);
    }
    const qualityByType = new Map<Activity["type"], ActivityQualityResult>();
    for (const [activityType, rolls] of qualityBucketsByType.entries()) {
      qualityByType.set(activityType, aggregateQualityForType(activityType, rolls));
    }

    // Each activity earns XP from its own quality roll. Multi-day work uses
    // the mean of its occupied days; unrelated excellent work cannot inflate
    // a poor session elsewhere in the week.
    const qualityMultiplierByDay = new Map(
      qualityRollsByDay.map(({ dayIndex, result }) => [dayIndex, result.multiplier]),
    );
    const qualityMultiplierByInstance = new Map<string, number>();
    for (const instance of getScheduledActivityInstances(gameState.schedule)) {
      const multipliers = instance.slotIndexes
        .map((dayIndex) => qualityMultiplierByDay.get(dayIndex))
        .filter((value): value is number => value !== undefined);
      if (multipliers.length === 0) continue;
      qualityMultiplierByInstance.set(
        instance.key,
        multipliers.reduce((sum, value) => sum + value, 0) / multipliers.length,
      );
    }
    const consecutiveRestWeeks = readConsecutiveRestWeeks(
      gameState.consequenceState?.metrics,
    );
    const fatigueConsequences = evaluateFatigueConsequences(
      gameState.scout.fatigue,
      consecutiveRestWeeks,
    );
    const resolvedXp = resolveWeekActivityXp(gameState.schedule, gameState.scout, {
      qualityMultiplierByInstance,
      refreshed: fatigueConsequences.refreshedBuff,
    });
    weekResult.skillXpGained = resolvedXp.skillXpGained;
    weekResult.attributeXpGained = resolvedXp.attributeXpGained;

    const simChoices = get().weekSimulation;
    const activityModifiers = createWeeklyChoiceModifiers({
      gameState,
      weekSimulation: simChoices,
    });
    const {
      discoveryModifiers: choiceDiscoveryModifiers,
      profileModifiers: choiceProfileModifiers,
      anomalyModifiers: choiceAnomalyModifiers,
      relationshipModifiers: choiceRelationshipModifiers,
      reportQualityModifiers: choiceReportQualityModifiers,
      focusDepthByType: choiceFocusDepthByType,
      focusedPlayersByType: choiceFocusedPlayersByType,
      completedInteractiveIds,
      completedLiveActivityTypes,
    } = activityModifiers;

    // This serializable identity is telemetry/worker-protocol metadata only.
    // The mature synchronous transaction below remains authoritative until a
    // complete worker implementation can preserve every interaction gate.
    const weeklyTransaction = createWeeklyTransactionJob(gameState);
    const weeklyPipeline = createWeeklySimulationPipeline(gameState, {
      transaction: weeklyTransaction,
    });
    weeklyPipeline.enter("activity-resolution");

    applyWeeklyStrategyAndInteractiveModifiers(
      { gameState, weekSimulation: simChoices },
      activityModifiers,
    );

    let updatedScout = applyWeekResults(gameState.scout, weekResult);
    const priorPerkIds = new Set(gameState.scout.unlockedPerks ?? []);
    const newlyUnlockedPerks = updatedScout.unlockedPerks
      .filter((perkId) => !priorPerkIds.has(perkId))
      .map((perkId) => ALL_PERKS.find((perk) => perk.id === perkId))
      .filter((perk): perk is NonNullable<typeof perk> => !!perk);

      // Central equipment bonus aggregation for the week
      const weekEquipBonuses = gameState.finances?.equipment
        ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
        : undefined;
      const scoutHomeCountry = getScoutHome(gameState.scout);

    // Issue 5c+5d: Apply tool fatigue reduction bonuses
    const weekToolBonuses = getActiveToolBonuses(gameState.unlockedTools);
    const hasReportActivity = gameState.schedule.activities.some(
      (activity) => activity?.type === "writeReport" || activity?.type === "writePlacementReport",
    );
    const workActivityCount = gameState.schedule.activities.filter(
      (activity) => activity !== null && activity.type !== "rest",
    ).length;
    const fatigueReduction = hasReportActivity
      ? weekToolBonuses.fatigueReduction ?? 0
      : 0;
    const workflowFatigueReduction = workActivityCount >= 3
      ? weekToolBonuses.workflowFatigueReduction ?? 0
      : 0;

      // Equipment fatigueReduction: per-activity-type reductions from equipped items
      let equipFatigueReduction = 0;
      if (weekEquipBonuses?.fatigueReduction) {
        const seenTypes = new Set<string>();
        for (const activity of gameState.schedule.activities) {
          if (activity && !seenTypes.has(activity.type)) {
            seenTypes.add(activity.type);
            const activityBonuses = gameState.finances?.equipment && (
              activity.type === "travel"
              || activity.type === "internationalTravel"
              || activity.type === "attendMatch"
            )
              ? getContextualEquipmentBonuses(
                  gameState.finances.equipment.loadout,
                  {
                    scoutHomeCountry,
                    country: activity.type === "attendMatch"
                      ? (scheduledTravelActivity?.targetId ?? scoutHomeCountry)
                      : activity.targetId,
                  },
                )
              : weekEquipBonuses;
            const activityReduction = activityBonuses?.fatigueReduction[activity.type] ?? 0;
            if (activityReduction > 0) equipFatigueReduction += activityReduction;
          }
        }
      }

    if (
      fatigueReduction > 0
      || (weekToolBonuses.travelFatigueReduction ?? 0) > 0
      || workflowFatigueReduction > 0
      || equipFatigueReduction > 0
    ) {
      // Check if any travel activities were scheduled this week
      const hasTravelActivity = gameState.schedule.activities.some(
        (a) => a?.type === "internationalTravel" || a?.type === "travel",
      );
      const travelFatigueReduction = hasTravelActivity
        ? Math.max(
            0,
            Math.round(
              Math.max(0, weekResult.fatigueChange)
              * (weekToolBonuses.travelFatigueReduction ?? 0),
            ),
          )
        : 0;
      const totalReduction = fatigueReduction
        + workflowFatigueReduction
        + travelFatigueReduction
        + equipFatigueReduction;
      if (totalReduction > 0) {
        updatedScout = {
          ...updatedScout,
          fatigue: Math.max(0, updatedScout.fatigue - totalReduction),
        };
      }
    }

    // Tick insight cooldown
    const currentInsightForTick = updatedScout.insightState;
    if (currentInsightForTick) {
      updatedScout = {
        ...updatedScout,
        insightState: tickCooldown(currentInsightForTick),
      };
    }

    // Accumulate Insight Points earned during the week
    if (weekResult.insightPointsEarned > 0) {
      const insightForAccum = updatedScout.insightState ?? createInsightState();
      const ipCapacity = calculateCapacity(updatedScout.attributes.intuition);
      updatedScout = {
        ...updatedScout,
        insightState: accumulateInsight(insightForAccum, weekResult.insightPointsEarned, ipCapacity),
      };
    }

    let stateWithScheduleApplied = {
      ...gameState,
      scout: updatedScout,
      inbox: updatedScout.specializationLevel > gameState.scout.specializationLevel
        ? [
            ...gameState.inbox,
            {
              id: `specialization-level-${updatedScout.specializationLevel}-s${gameState.currentSeason}w${gameState.currentWeek}`,
              week: gameState.currentWeek,
              season: gameState.currentSeason,
              type: "performance" as const,
              title: `${updatedScout.primarySpecialization === "youth" ? "Youth Scouting" : "Scouting"} Mastery: Level ${updatedScout.specializationLevel}`,
              body: newlyUnlockedPerks.length > 0
                ? `Your fieldwork unlocked ${newlyUnlockedPerks.map((perk) => perk.name).join(", ")}. ${newlyUnlockedPerks.map((perk) => perk.description).join(" ")}`
                : "Continued fieldwork has deepened your specialization mastery.",
              read: false,
              actionRequired: false,
            },
          ]
        : gameState.inbox,
    };

    // ── Process week results for new activity types ─────────────────────────

    stateWithScheduleApplied = processWeeklyRelationshipActivities({
      state: stateWithScheduleApplied,
      sourceState: gameState,
      result: weekResult,
      relationshipModifiers: choiceRelationshipModifiers,
    });

    // d2) Free agent outreach — direct, schedule-driven discovery pressure.
    // This makes the calendar activity materially different from passive weekly
    // pool discovery by surfacing immediate leads tied to player choices.
    if (weekResult.freeAgentOutreachExecuted > 0 && stateWithScheduleApplied.freeAgentPool) {
      const qr = qualityByType.get("freeAgentOutreach");
      const qualityDiscoveryMod = qr?.discoveryModifier ?? 0;
      const choiceDiscoveryMod = choiceDiscoveryModifiers.get("freeAgentOutreach") ?? 0;
      const totalDiscoveryBudget = Math.max(
        1,
        weekResult.freeAgentOutreachExecuted + qualityDiscoveryMod + choiceDiscoveryMod,
      );
      const focusIds = new Set(choiceFocusedPlayersByType.get("freeAgentOutreach") ?? []);
      const candidates = stateWithScheduleApplied.freeAgentPool.agents.filter(
        (agent) => agent.status === "available" && !agent.discoveredByScout,
      );
      const prioritized = [...candidates].sort((a, b) => {
        const aFocus = focusIds.has(a.playerId) ? 1 : 0;
        const bFocus = focusIds.has(b.playerId) ? 1 : 0;
        if (aFocus !== bFocus) return bFocus - aFocus;
        const interestDelta = b.npcInterest.length - a.npcInterest.length;
        if (interestDelta !== 0) return interestDelta;
        return b.weeksInPool - a.weeksInPool;
      });
      const discoveredNow = prioritized.slice(0, totalDiscoveryBudget);

      if (discoveredNow.length > 0) {
        const discoveredIds = new Set(discoveredNow.map((agent) => agent.playerId));
        const updatedAgents = stateWithScheduleApplied.freeAgentPool.agents.map((agent) =>
          discoveredIds.has(agent.playerId)
            ? { ...agent, discoveredByScout: true, discoverySource: "contactTip" as const }
            : agent,
        );
        const outreachMessages: InboxMessage[] = [];
        for (const [idx, agent] of discoveredNow.entries()) {
          const player = stateWithScheduleApplied.players[agent.playerId];
          if (!player) continue;
          const formerClub = stateWithScheduleApplied.clubs[agent.releasedFrom];
          const formerClubName = formerClub?.name ?? "an unknown club";
          const qualityPrefix = qr && idx === 0 ? `${qr.narrative}\n\n` : "";
          outreachMessages.push({
            id: `fa-outreach-${agent.playerId}-w${stateWithScheduleApplied.currentWeek}-${idx}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "news" as const,
            title: `Free Agent Lead: ${player.firstName} ${player.lastName}`,
            body: `${qualityPrefix}Your outreach work surfaced ${player.firstName} ${player.lastName} (${player.position}, ${player.age}) after release from ${formerClubName}. This player is now in your known free agent pool.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }

        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          freeAgentPool: {
            ...stateWithScheduleApplied.freeAgentPool,
            agents: updatedAgents,
          },
          inbox: [...stateWithScheduleApplied.inbox, ...outreachMessages],
        };
      }
    }

    // d3) Loan activity counters → reputation bumps
    if (weekResult.loanMonitoringExecuted > 0) {
      const monitoringRep = weekResult.loanMonitoringExecuted * 1;
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        scout: {
          ...stateWithScheduleApplied.scout,
          reputation: Math.min(100, stateWithScheduleApplied.scout.reputation + monitoringRep),
        },
      };
    }

    // e) Write Reports — process scheduled writeReport activities into actual reports
    stateWithScheduleApplied = processWeeklyReportActivities({
      state: stateWithScheduleApplied,
      playerIds: weekResult.reportsWritten,
      qualityModifier: choiceReportQualityModifiers.get("writeReport") ?? 0,
      equipmentQualityBonus: weekEquipBonuses?.reportQuality ?? 0,
    });

    // f) Activity feedback — narrative-driven feedback using quality rolls
    stateWithScheduleApplied = processWeeklyActivityFeedback({
      state: stateWithScheduleApplied,
      qualityRolls: qualityRollsByDay,
      weekResult,
    });

    const observationActivities = processWeeklyObservationActivities({
      gameState,
      state: stateWithScheduleApplied,
      weekResult,
      equipmentBonuses: weekEquipBonuses,
      qualityByType,
      completedInteractiveIds,
      completedLiveActivityTypes,
      discoveryModifiers: choiceDiscoveryModifiers,
      profileModifiers: choiceProfileModifiers,
      anomalyModifiers: choiceAnomalyModifiers,
      relationshipModifiers: choiceRelationshipModifiers,
      reportQualityModifiers: choiceReportQualityModifiers,
      focusDepthByType: choiceFocusDepthByType,
      focusedPlayersByType: choiceFocusedPlayersByType,
      weekSimulation: simChoices,
    });
    stateWithScheduleApplied = observationActivities.state;
    const weekPlayersDiscovered = observationActivities.playersDiscovered;
    const weekObservationsGenerated = observationActivities.observationsGenerated;

    stateWithScheduleApplied = processWeeklyPlacementResolution({
      sourceState: gameState,
      state: stateWithScheduleApplied,
      weekResult,
    });

    // h) New contact generation — every 8th week, 30% chance
    // Academy briefs age every week: pressure rises, expired opportunities
    // close, and a bounded number of new club needs enter the market.
    const academyBriefSeasonLength = Math.max(
      stateWithScheduleApplied.currentWeek,
      getSeasonLength(
        stateWithScheduleApplied.fixtures,
        stateWithScheduleApplied.currentSeason,
      ),
    );
    const academyBriefDate = nextGameWeek(
      stateWithScheduleApplied.currentWeek,
      stateWithScheduleApplied.currentSeason,
      academyBriefSeasonLength,
    );
    const academyBriefCapacity = deriveYouthRecruitmentBriefCapacity(
      getWorldConditionModifiers(stateWithScheduleApplied).opportunityMultiplier,
    );
    const briefCycle = advanceYouthRecruitmentBriefs(
      stateWithScheduleApplied.youthRecruitmentBriefs,
      academyBriefDate.week,
      academyBriefDate.season,
      academyBriefSeasonLength,
      academyBriefCapacity,
    );
    const replacementBriefs = generateYouthRecruitmentBriefs(
      createRNG(`${stateWithScheduleApplied.seed}-academy-brief-refresh-s${academyBriefDate.season}w${academyBriefDate.week}`),
      Object.values(stateWithScheduleApplied.clubs),
      stateWithScheduleApplied.players,
      academyBriefDate.week,
      academyBriefDate.season,
      briefCycle.briefs,
      academyBriefCapacity,
      academyBriefSeasonLength,
      stateWithScheduleApplied.seed,
    );
    const recruitmentBriefs = {
      ...briefCycle.briefs,
      ...Object.fromEntries(replacementBriefs.map((brief) => [brief.id, brief])),
    };
    const briefMessages: InboxMessage[] = [
      ...briefCycle.expiredIds.map((briefId) => {
        const brief = briefCycle.briefs[briefId];
        const clubName = brief ? stateWithScheduleApplied.clubs[brief.clubId]?.name : undefined;
        return {
          id: `academy-brief-expired-${briefId}`,
          week: academyBriefDate.week,
          season: academyBriefDate.season,
          type: "event" as const,
          title: "Academy Brief Expired",
          body: `${clubName ?? "A client club"} closed its ${brief?.requiredPositions.join("/") ?? "youth"} request. Waiting for certainty carried an opportunity cost.`,
          read: false,
          actionRequired: false,
        };
      }),
      ...replacementBriefs.map((brief) => ({
        id: `academy-brief-opened-${brief.id}`,
        week: academyBriefDate.week,
        season: academyBriefDate.season,
        type: "event" as const,
        title: `New Academy Brief: ${brief.requiredPositions.join("/")}`,
        body: `${stateWithScheduleApplied.clubs[brief.clubId]?.name ?? "A client club"} needs a ${brief.requiredPositions.join("/")} prospect by Season ${brief.expiresSeason}, Week ${brief.expiresWeek}. Rival pressure is ${brief.competitionPressure}/100.`,
        read: false,
        actionRequired: false,
      })),
    ];
    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      youthRecruitmentBriefs: recruitmentBriefs,
      inbox: briefMessages.length > 0
        ? [...stateWithScheduleApplied.inbox, ...briefMessages]
        : stateWithScheduleApplied.inbox,
    };

    // Complete due one- and two-season reviews from canonical movement,
    // appearance/rating, and injury history. Hidden ability is never read.
    let recommendationReviews = { ...stateWithScheduleApplied.recommendationReviews };
    let calibratedNPCReports = stateWithScheduleApplied.npcReports;
    let calibratedContactIntel = stateWithScheduleApplied.contactIntel;
    let recommendationCalibrationXp = 0;
    const reviewMessages: InboxMessage[] = [];
    for (const review of Object.values(recommendationReviews)) {
      if (review.status !== "scheduled") continue;
      const due = stateWithScheduleApplied.currentSeason > review.dueSeason
        || (
          stateWithScheduleApplied.currentSeason === review.dueSeason
          && stateWithScheduleApplied.currentWeek >= review.dueWeek
        );
      if (!due) continue;
      const scoutingCase = stateWithScheduleApplied.scoutingCases[review.caseId];
      const sourceReport = stateWithScheduleApplied.reports[review.reportId];
      const placementReport = scoutingCase?.placementReportIds
        .map((id) => stateWithScheduleApplied.placementReports[id])
        .find((placement) =>
          placement?.reportId === review.reportId
          && placement.targetClubId === review.clubId
          && placement.clubResponse === "accepted"
        );
      const clubDecision = placementReport?.decisionId
        ? stateWithScheduleApplied.clubDecisions[placementReport.decisionId]
        : undefined;
      const reviewedPlayer = stateWithScheduleApplied.players[review.playerId]
        ?? stateWithScheduleApplied.retiredPlayers[review.playerId];
      if (!scoutingCase || !sourceReport || !placementReport || !clubDecision || !reviewedPlayer) {
        continue;
      }
      const result = completeAcademyRecommendationReview({
        review,
        scoutingCase,
        report: sourceReport,
        caseReports: scoutingCase.reportIds
          .map((id) => stateWithScheduleApplied.reports[id])
          .filter((candidate): candidate is ScoutReport => Boolean(candidate)),
        placementReport,
        clubDecision,
        player: reviewedPlayer,
        movementHistory: stateWithScheduleApplied.playerMovementHistory,
        currentWeek: stateWithScheduleApplied.currentWeek,
        currentSeason: stateWithScheduleApplied.currentSeason,
        seasonLength: getSeasonLength(
          stateWithScheduleApplied.fixtures,
          stateWithScheduleApplied.currentSeason,
        ),
      });
      if (result.status !== "completed") continue;
      recommendationReviews[result.review.id] = result.review;
      const sourceCalibration = calibrateSourceEvidenceFromReview({
        npcReports: calibratedNPCReports,
        contactIntel: calibratedContactIntel,
        review: result.review,
      });
      calibratedNPCReports = sourceCalibration.npcReports;
      calibratedContactIntel = sourceCalibration.contactIntel;
      recommendationCalibrationXp += result.review.confidenceCalibration === undefined
        ? 1
        : result.review.confidenceCalibration >= 75
          ? 5
          : 3;
      reviewMessages.push({
        id: `recommendation-review-${result.review.id}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "feedback",
        title: `${review.checkpoint === "oneSeason" ? "One-Season" : "Two-Season"} Recommendation Review`,
        body: `Your recommendation for ${reviewedPlayer.firstName} ${reviewedPlayer.lastName} scored ${result.review.overallScore ?? "unresolved"}/100. ${(result.review.findings ?? []).join(" ")}${sourceCalibration.calibratedClaimIds.length > 0 ? ` ${sourceCalibration.calibratedClaimIds.length} attributed source claim${sourceCalibration.calibratedClaimIds.length === 1 ? " was" : "s were"} calibrated against the observable outcome.` : ""}`,
        read: false,
        actionRequired: false,
        relatedId: reviewedPlayer.id,
        relatedEntityType: "player",
      });
    }
    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      recommendationReviews,
      npcReports: calibratedNPCReports,
      contactIntel: calibratedContactIntel,
      scout: recommendationCalibrationXp > 0
        ? applyScoutSkillXp(stateWithScheduleApplied.scout, {
            playerJudgment: recommendationCalibrationXp,
            potentialAssessment: Math.max(1, Math.floor(recommendationCalibrationXp / 2)),
          })
        : stateWithScheduleApplied.scout,
      inbox: reviewMessages.length > 0
        ? [...stateWithScheduleApplied.inbox, ...reviewMessages]
        : stateWithScheduleApplied.inbox,
    };

    if (stateWithScheduleApplied.currentWeek % 8 === 0) {
      const contactRng = createRNG(
        `${gameState.seed}-newcontact-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      if (contactRng.nextFloat(0, 1) < 0.3) {
        const contactTypes: Array<"agent" | "scout" | "clubStaff" | "journalist" | "academyCoach" | "sportingDirector"> = [
          "agent", "scout", "clubStaff", "journalist", "academyCoach", "sportingDirector",
        ];
        const type = contactRng.pick(contactTypes);
        const orgs = ["Base Soccer", "Elite Scouting", "Global Football Network", "Football Insights"];
        const org = contactRng.pick(orgs);
        const newContact = generateContactForType(
          contactRng,
          type,
          org,
          getScoutHome(gameState.scout),
        );
        const knownIds = seedKnownPlayersForContact(
          contactRng,
          newContact,
          stateWithScheduleApplied,
        );
        const contactWithPlayers = { ...newContact, knownPlayerIds: knownIds };
        const contactMsg: InboxMessage = {
          id: `new-contact-${newContact.id}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "event" as const,
          title: `New Contact: ${newContact.name}`,
          body: `You've been introduced to ${newContact.name} (${type}) from ${org}${newContact.region ? `, covering ${newContact.region}` : ""}. They know ${knownIds.length} player${knownIds.length !== 1 ? "s" : ""} and appear in your contact network.`,
          read: false,
          actionRequired: false,
          relatedId: newContact.id,
          relatedEntityType: "contact" as const,
        };
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          contacts: { ...stateWithScheduleApplied.contacts, [newContact.id]: contactWithPlayers },
          inbox: [...stateWithScheduleApplied.inbox, contactMsg],
        };
      }
    }

    // ── Process cross-country transfers (only when multiple countries are active) ──
    // ── Process international system — generate/expire assignments periodically ──
    const internationalRng = createRNG(
      `${gameState.seed}-international-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const internationalResult = processInternationalWeek(
      internationalRng,
      stateWithScheduleApplied.scout,
      stateWithScheduleApplied,
      stateWithScheduleApplied.internationalAssignments,
    );

    // Surface new international assignments as inbox messages so the player is notified
    const retainedAssignments = stateWithScheduleApplied.internationalAssignments.filter(
      (assignment) => !internationalResult.expiredAssignmentIds.includes(assignment.id),
    );
    const updatedAssignments = [...retainedAssignments, ...internationalResult.newAssignments];
    let stateWithInternational = {
      ...stateWithScheduleApplied,
      internationalAssignments: updatedAssignments,
    };
    if (internationalResult.newAssignments.length > 0) {
      const newMessages: InboxMessage[] = internationalResult.newAssignments.map((assignment) => ({
        id: `assignment-${assignment.id}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "assignment" as const,
        title: `International Assignment: ${assignment.country}`,
        body: assignment.description,
        read: false,
        actionRequired: true,
        relatedId: assignment.id,
        relatedEntityType: "assignment" as const,
      }));
      stateWithInternational = {
        ...stateWithInternational,
        inbox: [...stateWithScheduleApplied.inbox, ...newMessages],
      };
    }

    // ── Phase 2: Finance, Rivals, Narrative Events, Tools ──────────────────

    weeklyPipeline.enter("world-systems");
    let stateWithPhase2 = stateWithInternational;

    // 1. Process finances at the competition's twelve financial period closes.
    //    Difficulty modifiers adjust income and expenses.
    if (stateWithPhase2.finances) {
      const financeRng = createRNG(
        `${gameState.seed}-finance-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      void financeRng; // seed is consumed for determinism; finance is pure math
      const rawFinances = processWeeklyFinances(
        stateWithPhase2.finances,
        stateWithPhase2.scout,
        stateWithPhase2.currentWeek,
        stateWithPhase2.currentSeason,
        getSeasonLength(stateWithPhase2.fixtures, stateWithPhase2.currentSeason),
      );

      // Apply starter stipend (guaranteed income for first 4 weeks)
      const updatedFinances = processStarterStipend(
        rawFinances,
        stateWithPhase2.difficulty,
        stateWithPhase2.currentWeek,
        stateWithPhase2.currentSeason,
      );

      // Apply difficulty multipliers to income/expenses on pay weeks
      const diffMods = getDifficultyModifiers(stateWithPhase2.difficulty);
      if (isFinancialPeriodClose(
        stateWithPhase2.currentWeek,
        getSeasonLength(stateWithPhase2.fixtures, stateWithPhase2.currentSeason),
      )) {
        const baseIncome = updatedFinances.monthlyIncome;
        // Contractual debt service is not an operating expense and must not be
        // charged again through the difficulty expense multiplier.
        const baseExpenseTotal = sumOperatingExpenses(updatedFinances.expenses);
        // Compute the difference caused by difficulty multipliers
        const incomeAdjustment = Math.round(baseIncome * (diffMods.incomeMultiplier - 1));
        const expenseAdjustment = Math.round(baseExpenseTotal * (diffMods.expenseMultiplier - 1));
        const adjustedFinances = applyDifficultyFinancialAdjustments(
          updatedFinances,
          incomeAdjustment,
          expenseAdjustment,
          stateWithPhase2.currentWeek,
          stateWithPhase2.currentSeason,
        );
        stateWithPhase2 = { ...stateWithPhase2, finances: adjustedFinances };
      } else {
        stateWithPhase2 = { ...stateWithPhase2, finances: updatedFinances };
      }
    }

    // 1a. Economics, marketplace, agency, and career-business processing
    stateWithPhase2 = processWeeklyEconomy(stateWithPhase2, gameState);

    // 1aa. F14: Process weekly infrastructure costs and assistant scout work
    {
      stateWithPhase2 = processWeeklyInfrastructureCosts(stateWithPhase2);
      const asstRng = createRNG(
        `${gameState.seed}-asst-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      stateWithPhase2 = processAssistantScoutWeek(stateWithPhase2, asstRng);
    }

    // 1b. Transfer window urgency — generate urgent assessments during open windows
    // Youth scouts discover talent organically; they don't receive club-driven
    // urgent assessment requests for signed players.
    const activeTransferWindow = stateWithPhase2.transferWindow;
    if (activeTransferWindow?.isOpen && stateWithPhase2.scout.primarySpecialization !== "youth") {
      const twRng = createRNG(
        `${gameState.seed}-tw-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      const urgent = generateUrgentAssessment(twRng, stateWithPhase2);
      if (urgent) {
        const urgentPlayer = stateWithPhase2.players[urgent.playerId];
        const urgentMsg: InboxMessage = {
          id: `urgent-${urgent.id}`,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          type: "assignment" as const,
          title: "Urgent Assessment Request",
          body: `${urgent.requestedBy} needs a report on ${urgentPlayer ? `${urgentPlayer.firstName} ${urgentPlayer.lastName}` : "a player"} by day ${urgent.deadline}. Reward: +${urgent.reputationReward} reputation.`,
          read: false,
          actionRequired: true,
          relatedId: urgent.playerId,
          relatedEntityType: "player" as const,
        };
        stateWithPhase2 = {
          ...stateWithPhase2,
          inbox: [...stateWithPhase2.inbox, urgentMsg],
        };
      }
      if (isDeadlineDayPressure(activeTransferWindow, stateWithPhase2.currentWeek)) {
        const deadlineMsg: InboxMessage = {
          id: `deadline-w${stateWithPhase2.currentWeek}-s${stateWithPhase2.currentSeason}`,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          type: "news" as const,
          title: "Transfer Deadline Approaching",
          body: "The transfer window closes this week. Clubs are making final decisions — file any outstanding reports now.",
          read: false,
          actionRequired: false,
        };
        stateWithPhase2 = {
          ...stateWithPhase2,
          inbox: [...stateWithPhase2.inbox, deadlineMsg],
        };
      }
    }

    // 2. Process the persistent organization layer before individual rivals.
    // The resulting pressure is ephemeral for this week, while the action,
    // agenda progression, opportunity, and fact all survive save/load.
    const organizationBase = migrateRivalOrganizationState(
      stateWithPhase2.seed,
      stateWithPhase2.rivalScouts,
      stateWithPhase2.rivalOrganizationState,
      Math.max(1, stateWithPhase2.currentSeason),
    );
    const organizationResult = processRivalOrganizationWeek(
      organizationBase,
      {
        rootSeed: stateWithPhase2.seed,
        season: stateWithPhase2.currentSeason,
        week: stateWithPhase2.currentWeek,
        seasonLength: getSeasonLength(
          stateWithPhase2.fixtures,
          stateWithPhase2.currentSeason,
        ),
        rivalScouts: stateWithPhase2.rivalScouts,
      },
    );
    const organizationFacts = Object.fromEntries(
      organizationResult.facts.map((fact) => [fact.id, fact]),
    );
    stateWithPhase2 = {
      ...stateWithPhase2,
      rivalOrganizationState: organizationResult.state,
      consequenceState: {
        ...stateWithPhase2.consequenceState,
        facts: {
          ...stateWithPhase2.consequenceState.facts,
          ...organizationFacts,
        },
      },
    };
    const rivalCampaignWeek = prepareWeeklyRivalCampaigns({
      state: stateWithPhase2,
      seasonLength: getSeasonLength(
        stateWithPhase2.fixtures,
        stateWithPhase2.currentSeason,
      ),
    });
    stateWithPhase2 = rivalCampaignWeek.state;

    // 2a. Process individual rival scouts under this week's organization pressure.
    const rivalRng = createRNG(
      `${gameState.seed}-rivals-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const rivalModifiers = getRunSimulationModifiers(stateWithPhase2.runManifest);
    const getRivalConditionPressure = (
      rival: (typeof stateWithPhase2.rivalScouts)[string],
      playerId?: string,
    ): number => {
      const playerCountry = playerId
        ? getPlayerScoutingCountry(stateWithPhase2, playerId)
        : undefined;
      const rivalClub = rival.clubId ? stateWithPhase2.clubs[rival.clubId] : undefined;
      const rivalCountry = rivalClub
        ? stateWithPhase2.leagues[rivalClub.leagueId]?.country
        : undefined;
      return getWorldConditionModifiers(
        stateWithPhase2,
        playerCountry ?? rivalCountry,
      ).rivalPressureMultiplier;
    };
    const rivalResult = processRivalScoutWeek(rivalRng, stateWithPhase2, {
      discoveryChanceMultiplier:
        rivalModifiers.rivalDiscoveryChanceMultiplier
        * organizationResult.pressure.discoveryChanceMultiplier,
      poachChanceMultiplier:
        rivalModifiers.rivalPoachChanceMultiplier
        * organizationResult.pressure.poachChanceMultiplier,
      signingChanceMultiplier:
        rivalModifiers.rivalSigningChanceMultiplier
        * organizationResult.pressure.signingChanceMultiplier,
      contextualPressureMultiplier: getRivalConditionPressure,
    });
    let rivalInboxMessages: InboxMessage[] = [...rivalResult.newMessages];
    if (rivalResult.poachWarnings.length > 0) {
      const poachMessages = rivalResult.poachWarnings.map((warning) => {
        const rivalScout = rivalResult.updatedRivals[warning.rivalId];
        const player = stateWithPhase2.players[warning.playerId];
        const rivalName = rivalScout?.name ?? "A rival scout";
        const playerName = player
          ? `${player.firstName} ${player.lastName}`
          : "a player you have reported on";
        return {
          id: `rival-poach-${warning.rivalId}-${warning.playerId}-w${stateWithPhase2.currentWeek}`,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          type: "event" as const,
          title: "Rival Scout Alert",
          body: `${rivalName} is now tracking ${playerName} — a player you have already reported on. Consider submitting a stronger recommendation before they act.`,
          read: false,
          actionRequired: false,
          relatedId: warning.playerId,
          relatedEntityType: "player" as const,
        };
      });
      rivalInboxMessages = [...rivalInboxMessages, ...poachMessages];
    }
    // Generate contact intelligence about rival movements (F8)
    const intelMessages = generateRivalIntelligence(rivalRng, stateWithPhase2, stateWithPhase2.contacts);
    rivalInboxMessages = [...rivalInboxMessages, ...intelMessages];
    // Track rival activities (F8), capping at 50 entries
    const existingActivities = stateWithPhase2.rivalActivities ?? [];
    const mergedActivities = [...existingActivities, ...rivalResult.newActivities].slice(-50);
    stateWithPhase2 = {
      ...stateWithPhase2,
      rivalScouts: rivalResult.updatedRivals,
      rivalActivities: mergedActivities,
      inbox: [...stateWithPhase2.inbox, ...rivalInboxMessages],
    };

    // 2b. Process poach signings — generate rivalPoachBid narrative events
    // Youth rivals compete for the same unsigned prospects using only public
    // buzz, visibility, venue exposure, and known interest. Successful claims
    // go through the canonical movement ledger and displace pending pitches.
    let youthRivalLifecycle = getLifecycleWorld(stateWithPhase2);
    let youthRivalScouts = { ...stateWithPhase2.rivalScouts };
    let youthRivalPool = { ...stateWithPhase2.unsignedYouth };
    let youthRivalActivities = [...(stateWithPhase2.rivalActivities ?? [])];
    let youthRivalInbox = [...stateWithPhase2.inbox];
    let youthRivalPlacementReports = { ...stateWithPhase2.placementReports };
    let youthRivalCases = { ...stateWithPhase2.scoutingCases };
    let youthRivalDeliveries = { ...stateWithPhase2.reportDeliveries };
    let youthRivalDecisions = { ...stateWithPhase2.clubDecisions };
    let youthRivalBriefs = { ...stateWithPhase2.youthRecruitmentBriefs };

    for (const rival of Object.values(youthRivalScouts).filter(
      (candidate) => candidate.specialization === "youth",
    )) {
      const target = selectYouthRivalTarget(
        createRNG(`${stateWithPhase2.seed}-youth-rival-target-${rival.id}-s${stateWithPhase2.currentSeason}w${stateWithPhase2.currentWeek}`),
        rival,
        youthRivalPool,
      );
      if (!target) continue;
      const youth = youthRivalPool[target.youthId];
      if (!youth) continue;
      const scoutHasInterest = youth.discoveredBy.includes(stateWithPhase2.scout.id)
        || Object.values(stateWithPhase2.observations).some(
          (observation) => observation.playerId === youth.player.id,
        )
        || Object.values(stateWithPhase2.reports).some(
          (report) => report.playerId === youth.player.id,
        );
      const pressureResult = advanceYouthRivalPressure({
        rival,
        youth,
        week: stateWithPhase2.currentWeek,
        season: stateWithPhase2.currentSeason,
        scoutHasInterest,
        organizationProgressBonus:
          organizationResult.pressure.sourceOrganizationId
          && organizationResult.state.organizations[
            organizationResult.pressure.sourceOrganizationId
          ]?.memberRivalIds.includes(rival.id)
            ? organizationResult.pressure.youthProgressBonus
            : 0,
        existingActivities: youthRivalActivities,
        existingMessages: youthRivalInbox,
      });
      youthRivalScouts[rival.id] = pressureResult.updatedRival;
      youthRivalPool[youth.id] = pressureResult.updatedYouth;
      youthRivalActivities = pressureResult.activities;
      youthRivalInbox = pressureResult.messages;

      for (const brief of Object.values(youthRivalBriefs)) {
        if (
          brief.status === "open"
          && (
            brief.requiredPositions.includes(youth.player.position)
            || youth.player.secondaryPositions.some((position) => brief.requiredPositions.includes(position))
          )
          && pressureResult.pressure > brief.competitionPressure
        ) {
          youthRivalBriefs[brief.id] = {
            ...brief,
            competitionPressure: pressureResult.pressure,
          };
        }
      }

      const claim = resolveRivalYouthClaim(
        createRNG(`${stateWithPhase2.seed}-youth-rival-claim-${rival.id}-${youth.id}-s${stateWithPhase2.currentSeason}w${stateWithPhase2.currentWeek}`),
        {
          rival: pressureResult.updatedRival,
          youth: pressureResult.updatedYouth,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          scoutHasInterest,
          placementReports: youthRivalPlacementReports,
          existingActivities: youthRivalActivities,
          existingMessages: youthRivalInbox,
        },
      );
      if (!claim.success || !claim.signedPlayer) continue;

      const detachedPlayer = {
        ...youth.player,
        clubId: "",
        contractClubId: undefined,
        contractExpiry: 0,
        wage: 0,
      };
      const movement = resolvePlayerMovements(
        {
          ...youthRivalLifecycle,
          players: {
            ...youthRivalLifecycle.players,
            [detachedPlayer.id]: detachedPlayer,
          },
        },
        [{
          type: "youthSigning",
          playerId: detachedPlayer.id,
          toClubId: rival.clubId,
          contractLength: 3,
          wage: Math.max(100, rival.quality * 150),
          reason: `Rival youth recommendation by ${rival.name}`,
        }],
        stateWithPhase2.currentWeek,
        stateWithPhase2.currentSeason,
        getSeasonLength(stateWithPhase2.fixtures, stateWithPhase2.currentSeason),
      );
      if (movement.applied.length === 0) continue;
      youthRivalLifecycle = movement.state;
      const movedPlayer = youthRivalLifecycle.players[detachedPlayer.id];
      youthRivalPool[youth.id] = {
        ...claim.updatedYouth,
        ...(movedPlayer ? { player: movedPlayer } : {}),
      };
      youthRivalScouts[rival.id] = claim.updatedRival;
      youthRivalActivities = claim.activities;
      youthRivalInbox = claim.messages;

      for (const placementReportId of claim.displacedPlacementReportIds) {
        const placementReport = youthRivalPlacementReports[placementReportId];
        if (!placementReport) continue;
        youthRivalPlacementReports[placementReportId] = {
          ...placementReport,
          clubResponse: "rejected",
        };
        if (placementReport.deliveryId && !youthRivalDeliveries[placementReport.deliveryId]?.decisionId) {
          const resolved = resolveClubDecision({
            scoutingCases: youthRivalCases,
            reportDeliveries: youthRivalDeliveries,
            clubDecisions: youthRivalDecisions,
            deliveryId: placementReport.deliveryId,
            outcome: "rejected",
            week: stateWithPhase2.currentWeek,
            season: stateWithPhase2.currentSeason,
            reason: `${rival.name} moved first and the prospect is no longer available.`,
            reasons: [
              "A rival recruitment team completed the youth signing first.",
              "Additional certainty came at the cost of the opportunity.",
            ],
          });
          youthRivalCases = resolved.scoutingCases;
          youthRivalDeliveries = resolved.reportDeliveries;
          youthRivalDecisions = resolved.clubDecisions;
          youthRivalPlacementReports[placementReportId] = {
            ...youthRivalPlacementReports[placementReportId],
            decisionId: resolved.decision?.id,
          };
        } else if (placementReport.caseId && youthRivalCases[placementReport.caseId]) {
          youthRivalCases[placementReport.caseId] = {
            ...youthRivalCases[placementReport.caseId],
            status: "closed",
            lastUpdatedWeek: stateWithPhase2.currentWeek,
            lastUpdatedSeason: stateWithPhase2.currentSeason,
          };
        }
      }
    }

    stateWithPhase2 = {
      ...withLifecycleWorld(stateWithPhase2, youthRivalLifecycle),
      rivalScouts: youthRivalScouts,
      unsignedYouth: youthRivalPool,
      rivalActivities: youthRivalActivities.slice(-50),
      inbox: youthRivalInbox,
      placementReports: youthRivalPlacementReports,
      scoutingCases: youthRivalCases,
      reportDeliveries: youthRivalDeliveries,
      clubDecisions: youthRivalDecisions,
      youthRecruitmentBriefs: youthRivalBriefs,
    };

    if (rivalResult.poachSignings && rivalResult.poachSignings.length > 0) {
      const poachNarrativeEvents: NarrativeEvent[] = [];
      const poachInboxMessages: InboxMessage[] = [];

      for (const signing of rivalResult.poachSignings) {
        const rivalScout = stateWithPhase2.rivalScouts[signing.rivalId];
        const player = stateWithPhase2.players[signing.playerId];
        if (!rivalScout || !player) continue;

        const resolvedSigning = resolveRivalSigningAttempt(
          getLifecycleWorld(stateWithPhase2),
          rivalScout,
          player.id,
          stateWithPhase2.currentWeek,
          stateWithPhase2.currentSeason,
        );
        if (!resolvedSigning.success) continue;

        stateWithPhase2 = withLifecycleWorld(
          stateWithPhase2,
          resolvedSigning.lifecycle,
        );
        const signedPlayer = stateWithPhase2.players[player.id];
        if (!signedPlayer) continue;

        const rivalName = rivalScout.name;
        const playerName = `${signedPlayer.firstName} ${signedPlayer.lastName}`;
        const rivalClub = stateWithPhase2.clubs[rivalScout.clubId];
        const eligibility = getPoachCounterBidEligibility(
          getLifecycleWorld(stateWithPhase2),
          rivalScout,
          signedPlayer,
          stateWithPhase2.scout,
        );
        const cleanedRival = {
          ...rivalScout,
          targetPlayerIds: rivalScout.targetPlayerIds.filter((id) => id !== player.id),
          competingForPlayers: rivalScout.competingForPlayers.filter((id) => id !== player.id),
          currentTarget: rivalScout.currentTarget === player.id
            ? undefined
            : rivalScout.currentTarget,
        };
        stateWithPhase2 = {
          ...stateWithPhase2,
          rivalScouts: {
            ...stateWithPhase2.rivalScouts,
            [rivalScout.id]: cleanedRival,
          },
          rivalActivities: [
            ...(stateWithPhase2.rivalActivities ?? []),
            {
              rivalId: rivalScout.id,
              type: "playerSigned" as const,
              playerId: player.id,
              week: stateWithPhase2.currentWeek,
              season: stateWithPhase2.currentSeason,
            },
          ].slice(-50),
        };

        const eventId = `poach-bid-${signing.rivalId}-${signing.playerId}-w${stateWithPhase2.currentWeek}`;

        if (!eligibility.eligible) {
          stateWithPhase2 = {
            ...stateWithPhase2,
            rivalScouts: {
              ...stateWithPhase2.rivalScouts,
              [rivalScout.id]: {
                ...cleanedRival,
                winsAgainstPlayer: (cleanedRival.winsAgainstPlayer ?? 0) + 1,
              },
            },
          };
          poachInboxMessages.push({
            id: `rival-signing-${eventId}`,
            week: stateWithPhase2.currentWeek,
            season: stateWithPhase2.currentSeason,
            type: "event" as const,
            title: `Player Signed by ${rivalClub?.name ?? "Rival Club"}`,
            body: `${rivalClub?.name ?? "The rival club"} completed the signing of ${playerName} following ${rivalName}'s recommendation. ${eligibility.reason ?? "Your club cannot submit a valid counter-bid."}`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
          continue;
        }

        const narrativeEvent: NarrativeEvent = {
          id: eventId,
          type: "rivalPoachBid",
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          title: `Rival Signing: ${playerName}`,
          description:
            `${rivalName} has signed ${playerName} — a player you previously reported on. ` +
            `Your club can attempt a ${eligibility.cost.toLocaleString()} transfer or concede the player.`,
          relatedIds: [signing.playerId, signing.rivalId],
          acknowledged: false,
          choices: [
            { label: `Counter-Bid (${eligibility.cost.toLocaleString()})`, effect: "counterBid" },
            { label: "Concede", effect: "concede" },
          ],
          selectedChoice: undefined,
        };

        poachNarrativeEvents.push(narrativeEvent);

        poachInboxMessages.push({
          id: `narrative-${eventId}`,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          type: "event" as const,
          title: narrativeEvent.title,
          body: narrativeEvent.description,
          read: false,
          actionRequired: true,
          relatedId: narrativeEvent.id,
        });
      }

      stateWithPhase2 = registerNarrativeDecisions({
        ...stateWithPhase2,
        narrativeEvents: [...stateWithPhase2.narrativeEvents, ...poachNarrativeEvents],
        inbox: [...stateWithPhase2.inbox, ...poachInboxMessages],
      }, poachNarrativeEvents);
    }

    // 3. Generate narrative event (12% weekly chance, with F2 chain support)
    const eventRng = createRNG(
      `${gameState.runManifest.rootSeed}-events-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    // Ensure eventChains is initialized for chain processing
    if (!stateWithPhase2.eventChains) {
      stateWithPhase2 = { ...stateWithPhase2, eventChains: [] };
    }
    const priorNarrativeEvents = stateWithPhase2.narrativeEvents;
    const priorEventDirector = stateWithPhase2.eventDirector;
    const weeklyResult = directWeeklyNarrativeEvent(eventRng, stateWithPhase2);
    const narrativeEvent = weeklyResult.event;

    // 3b. Storyline system — trigger new storylines and advance active ones
    const storylineRng = createRNG(
      `${gameState.runManifest.rootSeed}-storylines-${gameState.currentWeek}-${gameState.currentSeason}`,
    );

    // Attempt to start a new storyline (5% weekly chance, max 2 active)
    const storylineModifiers = getRunSimulationModifiers(stateWithPhase2.runManifest);
    const newStoryline = checkStorylineTriggers(
      stateWithPhase2,
      storylineRng,
      0.05 * storylineModifiers.storylineChanceMultiplier,
    );
    // A new storyline remains provisional until the unified director grants it
    // this week's opening slot. Existing due beats retain continuation priority.
    const storylinesForProcessing = newStoryline
      ? [...stateWithPhase2.activeStorylines, newStoryline]
      : stateWithPhase2.activeStorylines;
    const storylineProcessingState = newStoryline
      ? { ...stateWithPhase2, activeStorylines: storylinesForProcessing }
      : stateWithPhase2;

    const { events: storylineEvents, updatedStorylines } = processActiveStorylines(
      storylineProcessingState,
      storylineRng,
    );

    // Persistent world-condition arcs share the same opening/continuation gate
    // as standalone events, chains, storylines, and specials. This prevents a
    // second narrative authority from flooding the same week with prompts.
    const worldArcWeek = prepareWorldConditionArcWeek(stateWithPhase2);
    stateWithPhase2 = worldArcWeek.state;
    const scoutingEcologyWeek = prepareWeeklyScoutingEcology({
      state: stateWithPhase2,
      rivalOpportunity: organizationResult.opportunity,
    });

    const emissions: WeeklyNarrativeEmissionV2[] = [];
    if (narrativeEvent) {
      emissions.push({
        event: narrativeEvent,
        ...inferNarrativeEntityRefsV2(stateWithPhase2, narrativeEvent),
        chain: weeklyResult.advancedChain?.chain ?? weeklyResult.newChain?.chain,
        continuation: Boolean(weeklyResult.advancedChain),
      });
    }
    for (const event of storylineEvents) {
      emissions.push({
        event,
        ...inferNarrativeEntityRefsV2(stateWithPhase2, event),
        storyline: updatedStorylines.find((storyline) => storyline.id === event.storylineId),
        continuation: !newStoryline || event.storylineId !== newStoryline.id,
      });
    }
    const seasonLength = getSeasonLength(
      stateWithPhase2.fixtures,
      stateWithPhase2.currentSeason,
    );
    const worldPulseWeek = prepareWeeklyWorldPulse({
      state: stateWithPhase2,
      seasonLength,
      blockedByActivity:
        Boolean(narrativeEvent)
        || storylineEvents.length > 0
        || worldArcWeek.beats.length > 0
        || scoutingEcologyWeek.candidates.length > 0
        || rivalCampaignWeek.candidates.length > 0,
    });

    const storyDirection = directWeeklyStoryEmissionsV2({
      rootSeed: stateWithPhase2.runManifest.rootSeed,
      state: createStoryDirectorStateV2(stateWithPhase2.storyDirectorV2),
      now: {
        week: stateWithPhase2.currentWeek,
        season: stateWithPhase2.currentSeason,
      },
      priorEvents: priorNarrativeEvents,
      emissions,
      candidates: [
        ...worldArcWeek.beats.map((beat) => beat.candidate),
        ...scoutingEcologyWeek.candidates,
        ...rivalCampaignWeek.candidates,
        ...(worldPulseWeek ? [worldPulseWeek.candidate] : []),
      ],
      activeChoiceCount: Object.values(stateWithPhase2.consequenceState.decisions)
        .filter((decision) => decision.status === "offered")
        .length,
      seasonLength,
    });
    const acceptedEventIds = new Set(
      storyDirection.accepted.map(({ emission }) => emission.event.id),
    );
    const acceptedNarrativeEvents = emissions
      .map(({ event }) => event)
      .filter((event) => acceptedEventIds.has(event.id));
    stateWithPhase2 = applyAcceptedNarrativeConsequences(
      stateWithPhase2,
      acceptedNarrativeEvents,
    ).state;
    const acceptedNewStoryline = Boolean(
      newStoryline
      && acceptedNarrativeEvents.some((event) => event.storylineId === newStoryline.id),
    );
    const authoritativeStorylines = newStoryline && !acceptedNewStoryline
      ? updatedStorylines.filter((storyline) => storyline.id !== newStoryline.id)
      : updatedStorylines;
    let authoritativeChains = stateWithPhase2.eventChains ?? [];
    if (
      weeklyResult.advancedChain
      && weeklyResult.advancedChain.event
      && acceptedEventIds.has(weeklyResult.advancedChain.event.id)
    ) {
      authoritativeChains = authoritativeChains.map((chain) =>
        chain.id === weeklyResult.advancedChain!.chain.id
          ? weeklyResult.advancedChain!.chain
          : chain,
      );
    }
    if (weeklyResult.newChain && acceptedEventIds.has(weeklyResult.newChain.event.id)) {
      authoritativeChains = [...authoritativeChains, weeklyResult.newChain.chain];
    }

    const featuredEvent = acceptedNarrativeEvents[0] ?? null;
    stateWithPhase2 = {
      ...stateWithPhase2,
      storyDirectorV2: storyDirection.state,
      eventDirector: recordEventDirectorOutcome(
        priorEventDirector,
        featuredEvent,
        Boolean(featuredEvent?.specialEventId),
        stateWithPhase2.currentSeason,
      ),
      eventChains: authoritativeChains,
      activeStorylines: authoritativeStorylines,
    };
    const acceptedStoryCandidateIds = new Set(
      storyDirection.acceptedCandidates.map(({ candidate }) => candidate.id),
    );
    stateWithPhase2 = applyDirectedWorldConditionArcBeats({
      state: stateWithPhase2,
      beats: worldArcWeek.beats,
      acceptedBeatIds: acceptedStoryCandidateIds,
    });
    stateWithPhase2 = applyDirectedWeeklyScoutingEcology({
      state: stateWithPhase2,
      prepared: scoutingEcologyWeek,
      acceptedCandidateIds: acceptedStoryCandidateIds,
    });
    stateWithPhase2 = applyDirectedWorldPulse({
      state: stateWithPhase2,
      prepared: worldPulseWeek,
      acceptedCandidateIds: acceptedStoryCandidateIds,
    });
    stateWithPhase2 = applyDirectedWeeklyRivalCampaigns({
      state: stateWithPhase2,
      prepared: rivalCampaignWeek,
      acceptedCandidateIds: acceptedStoryCandidateIds,
    });

    if (acceptedNarrativeEvents.length > 0) {
      const narrativeInboxMessages: InboxMessage[] = acceptedNarrativeEvents.map((evt) => ({
        id: `narrative-${evt.id}`,
        week: stateWithPhase2.currentWeek,
        season: stateWithPhase2.currentSeason,
        type: "event" as const,
        title: evt.title,
        body: evt.description,
        read: false,
        actionRequired: (evt.choices?.length ?? 0) > 0,
        relatedId: evt.id,
        relatedEntityType: "narrative" as const,
      }));

      stateWithPhase2 = registerNarrativeDecisions({
        ...stateWithPhase2,
        narrativeEvents: [...stateWithPhase2.narrativeEvents, ...acceptedNarrativeEvents],
        inbox: [...stateWithPhase2.inbox, ...narrativeInboxMessages],
      }, acceptedNarrativeEvents);
    }

    stateWithPhase2 = directWeeklyYouthProfessionalCase({
      state: stateWithPhase2,
    }).state;

    // 4. Check for newly unlocked tools
    const toolRng = createRNG(
      `${gameState.seed}-tools-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    void toolRng; // deterministic seed; unlock check is pure
    const newlyUnlocked = checkToolUnlocks(stateWithPhase2.scout, stateWithPhase2.unlockedTools);
    if (newlyUnlocked.length > 0) {
      const toolMessages: InboxMessage[] = newlyUnlocked.map((toolId) => ({
        id: `tool-unlocked-${toolId}-w${stateWithPhase2.currentWeek}`,
        week: stateWithPhase2.currentWeek,
        season: stateWithPhase2.currentSeason,
        type: "event" as const,
        title: "New Tool Unlocked",
        body: `You have unlocked a new scouting tool: ${toolId}. Check your tools panel to see the bonuses it provides.`,
        read: false,
        actionRequired: false,
        relatedId: toolId,
        relatedEntityType: "tool" as const,
      }));
      stateWithPhase2 = {
        ...stateWithPhase2,
        unlockedTools: [...stateWithPhase2.unlockedTools, ...newlyUnlocked],
        inbox: [...stateWithPhase2.inbox, ...toolMessages],
      };
    }

    // ── Specialization-specific weekly systems ──────────────────────────────

    stateWithPhase2 = processWeeklySpecializationSystems({
      state: stateWithPhase2,
      analyticsTeamMeetingsExecuted: weekResult.analyticsTeamMeetingsExecuted,
      predictionAccuracyBonus: weekEquipBonuses?.predictionAccuracy ?? 0,
    });

    // ── Core game loop tick ─────────────────────────────────────────────────

    weeklyPipeline.enter("core-world-tick");
    const worldProgression = processWeeklyWorldProgression({
      state: stateWithPhase2,
      sourceWeek: gameState.currentWeek,
      sourceSeason: gameState.currentSeason,
      dayResults: simChoices?.dayResults ?? [],
      rng,
    });
    const tickResult = worldProgression.tick;
    let newState = worldProgression.state;

    // ── B10: Link transfers to scout reports for accountability tracking ────
    // Only transfers accepted by the authoritative lifecycle resolver may
    // produce records, bonuses, placement fees, or sell-on payments. A market
    // proposal can still be rejected when a higher-priority lifecycle event
    // resolves for the same player in this tick.
    weeklyPipeline.enter("post-tick-accountability");
    newState = processWeeklyTransferAccountability({
      beforeTick: stateWithPhase2,
      state: newState,
      transfers: tickResult.transfers,
    });
    newState = processWeeklyPostTickSystems({
      beforeWeek: gameState,
      state: newState,
      alumniMilestones: tickResult.alumniMilestones,
    });
    // ── Season transition: regenerate events, fixtures, and transfer windows ─
    weeklyPipeline.enter("season-rollover");
    const seasonRollover = processWeeklySeasonRollover({
      state: newState,
      beforeTick: stateWithPhase2,
      sourceState: gameState,
      endOfSeasonTriggered: tickResult.endOfSeasonTriggered,
      predictionAccuracyBonus: weekEquipBonuses?.predictionAccuracy ?? 0,
    });
    if (seasonRollover.terminal === "ironman-fired") {
      set({ gameState: null, isLoaded: false, currentScreen: "mainMenu" });
      return;
    }
    newState = seasonRollover.state;

    // The season-opening world condition is selected inside the core rollover,
    // after the ordinary brief refresh above. Reconcile once more against that
    // new market so a contraction cannot leave more open work than the player
    // is told the market supports.
    if (tickResult.endOfSeasonTriggered) {
      const seasonOpeningBriefCapacity = deriveYouthRecruitmentBriefCapacity(
        getWorldConditionModifiers(newState).opportunityMultiplier,
      );
      const seasonOpeningBriefCycle = advanceYouthRecruitmentBriefs(
        newState.youthRecruitmentBriefs,
        newState.currentWeek,
        newState.currentSeason,
        getSeasonLength(newState.fixtures, newState.currentSeason),
        seasonOpeningBriefCapacity,
      );
      if (seasonOpeningBriefCycle.expiredIds.length > 0) {
        const existingMessageIds = new Set(newState.inbox.map((message) => message.id));
        const capacityMessages: InboxMessage[] = seasonOpeningBriefCycle.expiredIds
          .flatMap((briefId): InboxMessage[] => {
            const messageId = `academy-brief-expired-${briefId}`;
            if (existingMessageIds.has(messageId)) return [];
            const brief = seasonOpeningBriefCycle.briefs[briefId];
            return [{
              id: messageId,
              week: newState.currentWeek,
              season: newState.currentSeason,
              type: "event" as const,
              title: "Academy Brief Closed",
              body: `${newState.clubs[brief?.clubId ?? ""]?.name ?? "A client club"} closed its ${brief?.requiredPositions.join("/") ?? "youth"} request as the market shifted at the start of the season.`,
              read: false,
              actionRequired: false,
            }];
          });
        newState = {
          ...newState,
          youthRecruitmentBriefs: seasonOpeningBriefCycle.briefs,
          inbox: capacityMessages.length > 0
            ? [...newState.inbox, ...capacityMessages]
            : newState.inbox,
        };
      }
    }

    // Resolved or orphaned narrative prompts must not remain permanently pinned
    // as action-required messages in long-running saves.
    const repairedNarrativeInbox = clearTerminalNarrativeInboxActions(
      newState.inbox,
      newState.narrativeEvents,
    );
    if (repairedNarrativeInbox !== newState.inbox) {
      newState = { ...newState, inbox: repairedNarrativeInbox };
    }

    const reconciledInbox = reconcileInboxActionRequirements(newState);
    if (reconciledInbox !== newState.inbox) {
      newState = { ...newState, inbox: reconciledInbox };
    }

    // Prune inbox to keep most recent messages, but never drop unread action-required ones (Fix #57)
    if (newState.inbox.length > 200) {
      const priority = newState.inbox.filter((m) => m.actionRequired && !m.read);
      const rest = newState.inbox.filter((m) => !(m.actionRequired && !m.read));
      const trimmedRest = rest.slice(-Math.max(0, 200 - priority.length));
      newState = { ...newState, inbox: [...trimmedRest, ...priority] };
    }

    // Issue 17: Prune old acknowledged narrative events (keep last 10 weeks)
    if (newState.narrativeEvents.length > 0) {
      const previousSeasonLength = getSeasonLength(
        newState.fixtures,
        Math.max(1, newState.currentSeason - 1),
      );
      const prunedNarratives = newState.narrativeEvents.filter(
        (e) =>
          !e.acknowledged
          || getNarrativeRetentionAge(
            e,
            {
              season: newState.currentSeason,
              week: newState.currentWeek,
            },
            previousSeasonLength,
          ) < 10,
      );
      newState = { ...newState, narrativeEvents: prunedNarratives };
    }

    // ── Build week summary for UI feedback ──────────────────────────────────
    // Career-high and completed-season history must survive setbacks such as a
    // later firing or bankruptcy; legacy perks are based on what was actually
    // achieved, not only the scout's final-week tier.
    newState = {
      ...newState,
      legacyScore: {
        ...newState.legacyScore,
        careerHighTier: Math.max(
          newState.legacyScore.careerHighTier,
          newState.scout.careerTier,
        ),
        totalSeasons: Math.max(
          newState.legacyScore.totalSeasons,
          getCareerSeasonOrdinal(newState.currentSeason) - 1,
        ),
      },
    };

    newState = processCareerRecoveryWeek(newState, gameState.schedule);

    // Leadership is a real responsibility unlock, not merely a navigation
    // gate. Bootstrap a small, assigned team exactly once when Tier 4 is first
    // reached, regardless of the path that produced the promotion.
    const leadershipBootstrap = isCareerRecoveryBlockingOffers(newState)
      ? { state: newState, addedScoutIds: [] }
      : ensureLeadershipDelegationTeam(
          newState,
          createRNG(
            `${newState.seed}-leadership-bootstrap-${newState.scout.id}-tier${newState.scout.careerTier}`,
          ),
        );
    if (leadershipBootstrap.addedScoutIds.length > 0) {
      newState = {
        ...leadershipBootstrap.state,
        inbox: [
          ...leadershipBootstrap.state.inbox,
          {
            id: `leadership-team-tier${leadershipBootstrap.state.scout.careerTier}`,
            week: leadershipBootstrap.state.currentWeek,
            season: leadershipBootstrap.state.currentSeason,
            type: "event",
            title: "Your scouting team is ready",
            body: `${leadershipBootstrap.addedScoutIds.length} scouts have joined your department and received regional assignments. You can now delegate focused player follow-ups from NPC Scout Management.`,
            read: false,
            actionRequired: false,
          },
        ],
      };
    }
    newState = processLeadershipPortfolioWeek(newState);

    const momentCandidates: CareerMoment[] = [];
    const priorNarrativeIds = new Set(gameState.narrativeEvents.map((event) => event.id));
    for (const event of newState.narrativeEvents) {
      if (priorNarrativeIds.has(event.id)) continue;
      const moment = careerMomentFromNarrativeEvent(event, newState.runManifest.rootSeed);
      if (moment) momentCandidates.push(moment);
    }
    const priorReviewKeys = new Set(gameState.performanceReviews.map((review) =>
      `${review.season}:${review.outcome}`,
    ));
    for (const review of newState.performanceReviews) {
      if (priorReviewKeys.has(`${review.season}:${review.outcome}`)) continue;
      const moment = careerMomentFromPerformanceReview(
        review,
        newState.runManifest.rootSeed,
        { week: newState.currentWeek, season: newState.currentSeason },
      );
      if (moment) momentCandidates.push(moment);
    }
    const previousRecoveryStatus = new Map(
      [gameState.careerRecovery?.current, ...(gameState.careerRecovery?.history ?? [])]
        .filter((episode): episode is NonNullable<typeof episode> => Boolean(episode))
        .map((episode) => [episode.id, episode.status]),
    );
    for (const episode of [
      newState.careerRecovery?.current,
      ...(newState.careerRecovery?.history ?? []),
    ]) {
      if (!episode || previousRecoveryStatus.get(episode.id) === episode.status) continue;
      const moment = careerMomentFromRecovery(episode, newState.runManifest.rootSeed);
      if (moment) momentCandidates.push(moment);
    }
    const previousLeadershipStatus = new Map(
      Object.values(gameState.leadershipPortfolio?.responsibilities ?? {})
        .map((responsibility) => [responsibility.id, responsibility.status]),
    );
    for (const responsibility of Object.values(
      newState.leadershipPortfolio?.responsibilities ?? {},
    )) {
      if (previousLeadershipStatus.get(responsibility.id) === responsibility.status) continue;
      const moment = careerMomentFromLeadership(
        responsibility,
        newState.runManifest.rootSeed,
      );
      if (moment) momentCandidates.push(moment);
    }
    for (const consequence of Object.values(newState.consequenceState.consequences)) {
      const previousStatus = gameState.consequenceState.consequences[consequence.id]?.status;
      if (consequence.status !== "applied" || previousStatus === "applied") continue;
      const isLateCareerCallback = consequence.tags.includes("lateCareerDilemma")
        && consequence.tags.includes("callback");
      const isTurningPoint = consequence.tags.includes("turning-point");
      if (!isLateCareerCallback && !isTurningPoint) continue;
      const decision = newState.consequenceState.decisions[consequence.decisionId];
      const positive = consequence.tags.includes("favorable")
        || consequence.tags.includes("crossroads-success");
      const title = typeof decision?.metadata?.title === "string"
        ? decision.metadata.title
        : positive ? "Your judgment was vindicated" : "The risk came due";
      const selectedOption = decision?.options.find(
        (option) => option.id === decision.selectedOptionId,
      );
      momentCandidates.push(createCareerMoment({
        rootSeed: newState.runManifest.rootSeed,
        id: `consequence:${consequence.id}`,
        source: { kind: "consequence", id: consequence.id },
        occurredAt: { week: newState.currentWeek, season: newState.currentSeason },
        category: positive ? "vindication" : "failure",
        tone: positive ? "positive" : "negative",
        magnitude: isLateCareerCallback ? "careerDefining" : "major",
        cue: positive ? "vindication" : "failure",
        title,
        summary: selectedOption
          ? `${selectedOption.label} produced its long-term ${positive ? "vindication" : "cost"}. The outcome is now part of your permanent career record.`
          : `A long-running decision produced its ${positive ? "favorable" : "costly"} outcome.`,
        playerId: typeof decision?.metadata?.relatedPlayerId === "string"
          ? decision.metadata.relatedPlayerId
          : undefined,
        stakeholderIds: decision?.stakeholders.map((stakeholder) => stakeholder.id) ?? [],
        tags: consequence.tags,
      }));
    }
    if (momentCandidates.length > 0) {
      newState = {
        ...newState,
        careerMoments: enqueueCareerMoments(
          newState.careerMoments,
          momentCandidates,
          { week: newState.currentWeek, season: newState.currentSeason },
        ),
      };
    }
    newState = compactCompletedSeasonHistory(gameState, newState);
    newState = refreshWeeklyStakeholderProfiles(newState);
    weeklyPipeline.enter("finalize");
    newState = weeklyPipeline.complete(newState);

    const newInboxCount = newState.inbox.length - gameState.inbox.length;
    const isPayWeek = isFinancialPeriodClose(
      gameState.currentWeek,
      getSeasonLength(gameState.fixtures, gameState.currentSeason),
    );
    const actualFatigueChange = newState.scout.fatigue - gameState.scout.fatigue;
    const actualReputationChange = newState.scout.reputation - gameState.scout.reputation;
    const actualPlayersDiscovered = Math.max(
      0,
      newState.discoveryRecords.length - gameState.discoveryRecords.length,
    );
    const actualObservationsGenerated = Math.max(
      0,
      Object.keys(newState.observations).length - Object.keys(gameState.observations).length,
    );
    const youthActivityCount = getScheduledActivityInstances(gameState.schedule).filter(({ activity }) =>
      YOUTH_SUMMARY_ACTIVITY_TYPES.has(activity.type),
    ).length;
    void weekPlayersDiscovered;
    void weekObservationsGenerated;
    const weekSummary: WeekSummary = {
      continueScreen:
        tickResult.endOfSeasonTriggered && newState.seasonAwardsData
          ? "seasonAwards"
          : undefined,
      fatigueChange: actualFatigueChange,
      reputationChange: actualReputationChange,
      skillXpGained: weekResult.skillXpGained as Record<string, number>,
      attributeXpGained: weekResult.attributeXpGained as Record<string, number>,
      matchesAttended: gameState.scout.primarySpecialization === "youth"
        ? youthActivityCount
        : weekResult.matchesAttended.length,
      reportsWritten: weekResult.reportsWritten.length,
      meetingsHeld: weekResult.meetingsHeld.length,
      newMessages: Math.max(0, newInboxCount),
      rivalAlerts: rivalInboxMessages.length,
      financeSummary: isPayWeek && gameState.finances
        ? {
            income: gameState.finances.monthlyIncome,
            expenses: Object.values(gameState.finances.expenses).reduce((s, v) => s + v, 0),
          }
        : null,
      activityQualities: qualityRollsByDay.map(({ dayIndex, result }) => ({
        activityType: result.activityType,
        tier: result.tier,
        narrative: `[${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dayIndex]}] ${result.narrative}`,
      })),
      playersDiscovered: actualPlayersDiscovered,
      observationsGenerated: actualObservationsGenerated,
    };

    // ── Scenario objective checking ─────────────────────────────────────────
    const { scenarioProgressUpdate, scenarioOutcomeUpdate } = deriveScenarioState(newState);
    const pendingCelebration = derivePendingCelebration(
      gameState,
      newState,
      scenarioOutcomeUpdate,
      newlyUnlocked,
    );
    let resolvedScenarioId: string | null = null;
    if (scenarioOutcomeUpdate !== null) {
      const latched = resolveScenarioOutcome(newState, scenarioOutcomeUpdate);
      newState = latched.state;
      resolvedScenarioId = latched.resolvedScenarioId;
    }
    const tierPromoted = newState.scout.careerTier > gameState.scout.careerTier;

    // ── Guided session milestone ──────────────────────────────────────────────
    processWeeklyTutorialMilestones(
      gameState,
      newState,
      tierPromoted,
      runtime.getTutorialState(),
    );

    // ── Weekly mentor check-ins (first season only) ─────────────────────────

    // ── Tutorial trigger: career progression ─────────────────────────────────

    // ── Feature discovery tracking ─────────────────────────────────────────
    // ── Aha moment triggers ────────────────────────────────────────────────
    set({
      gameState: newState,
      lastWeekSummary: weekSummary,
      ...(scenarioProgressUpdate !== null ? { scenarioProgress: scenarioProgressUpdate } : {}),
      ...(scenarioOutcomeUpdate !== null
        ? {
            scenarioOutcome: scenarioOutcomeUpdate,
            scenarioOutcomeScenarioId: resolvedScenarioId,
          }
        : {}),
      ...(pendingCelebration !== null ? { pendingCelebration } : {}),
      ...(tickResult.endOfSeasonTriggered && newState.seasonAwardsData
        ? { currentScreen: "calendar" as GameScreen }
        : {}),
    });
    // ── Evaluate contextual hints ────────────────────────────────────────────

    processWeeklyContextualHint(newState, runtime.getTutorialState());

    // Autosave after each week advance — guard against race condition (Fix #24)
    if (runtime.persistenceEnabled && !isBatchAdvanceInProgress()) {
      queueWeeklyAutosave(newState, set);
    }
  },

  // ── Quick Scout Mode (F17) ──────────────────────────────────────────────
  // Quick Scout orchestration stays on the canonical weekly transaction.
  ...createWeeklyQuickScoutActions(get, set, { queueAutosave: queueWeeklyAutosave }),
  ...createWeekSimulationActions(get, set, {
    buildDaySpanInfo,
    buildDayInteraction,
    isQualityRelevantActivity,
    rollDayActivityQuality,
    resolveScoutEffectiveCountry,
    buildScoutQualityDataForState,
    isDayInteractionPending,
  }),

  ...createMatchActions(get, set),
  };
}
