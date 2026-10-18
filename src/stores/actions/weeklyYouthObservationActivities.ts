import { mergeYouthVenuePreview } from "./mergeYouthVenuePreview";
import { getInteractiveActivityCompletionKey } from "@/lib/activityCompletion";
import type {
  Activity,
  GameState,
  GutFeeling,
  InboxMessage,
  Observation,
  ObservationContext,
  Scout,
  TournamentEvent,
  UnsignedYouth,
  WeekSimulationState,
} from "@/engine/core/types";
import { processCompletedWeek, getScheduledActivityInstances } from "@/engine/core/calendar";
import {
  getActiveEquipmentBonuses,
  getContextualEquipmentBonuses,
} from "@/engine/finance";
import { createRNG, type RNG } from "@/engine/rng";
import { getPerceivedAbility } from "@/engine/scout/perceivedAbility";
import {
  deriveRegionalPresence,
  getScoutHomeCountry as getScoutHome,
} from "@/engine/world";
import {
  resolveScoutPerkModifiers,
  type PerkModifiers,
} from "@/engine/specializations/perks";
import {
  discoverTournamentsPassive,
  formatGutFeelingWithPA,
  rollGutFeeling,
} from "@/engine/youth";
import { applyProfessionalCaseOpportunityActivity } from "@/engine/youth/professionalCaseOpportunities";
import {
  getYouthVenuePool,
  mapVenueTypeToContext,
  processParentCoachMeeting,
} from "@/engine/youth/venues";
import { recordDiscovery } from "@/engine/career";
import { buildScoutQualityDataForState } from "./weeklySimulationSupport";
import type { ActivityQualityResult } from "@/engine/core/activityQuality";
import { produceWeeklyVenueObservation, produceWeeklyPlayerObservation } from "./weeklyObservationProducer";
import { getActiveToolBonuses } from "@/engine/tools/unlockables";
import { resolveActionableProspect } from "@/engine/youth/actionableProspects";

type CompletedWeekResult = ReturnType<typeof processCompletedWeek>;
type EquipmentBonuses = ReturnType<typeof getActiveEquipmentBonuses>;

export function createWonderkidRadarAlert(input: {
  perkModifiers: Pick<PerkModifiers, "canDetectWonderkids">;
  youth: UnsignedYouth;
  observations: Observation[];
  week: number;
  season: number;
}): InboxMessage | null {
  const { perkModifiers, youth, observations, week, season } = input;
  const perceivedAbility = getPerceivedAbility(observations, youth.player.id);
  if (
    !perkModifiers.canDetectWonderkids
    || youth.player.age > 16
    || perceivedAbility === null
    || perceivedAbility.paHigh < 4
    || perceivedAbility.paConfidence < 0.25
  ) {
    return null;
  }

  return {
    id: `wk-radar-${youth.player.id}-w${week}`,
    week,
    season,
    type: "news",
    title: `High-Upside Signal: ${youth.player.firstName} ${youth.player.lastName}`,
    body: `Your radar picked up a promising pattern around ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}). This is an uncertain signal, not a hidden rating - schedule a follow-up before committing.`,
    read: false,
    actionRequired: false,
    relatedId: youth.player.id,
    relatedEntityType: "player",
  };
}

export interface WeeklyYouthObservationInput {
  sourceState: GameState;
  state: GameState;
  weekResult: CompletedWeekResult;
  equipmentBonuses?: EquipmentBonuses;
  qualityByType: ReadonlyMap<Activity["type"], ActivityQualityResult>;
  scout: Scout;
  effectiveScoutCountry: string;
  rng: RNG;
  discoveries: NonNullable<GameState["discoveryRecords"]>;
  messages: readonly InboxMessage[];
  observations: GameState["observations"];
  playersDiscovered: number;
  observationsGenerated: number;
  playerEvidence: (playerId: string) => Observation[];
  recordObservation: (observation: Observation) => void;
  hasNewObservations: () => boolean;
  discoveryModifier: (activityType: Activity["type"]) => number;
  focusDepth: (activityType: Activity["type"]) => number;
  focusPlayers: (activityType: Activity["type"]) => string[];
  prioritizeYouth: (pool: UnsignedYouth[], activityType: Activity["type"]) => UnsignedYouth[];
  weekSimulation: WeekSimulationState | null;
  completedInteractiveIds: ReadonlySet<string>;
  completedLiveActivityTypes: ReadonlySet<Activity["type"]>;
  tierLabels: Readonly<Record<string, string>>;
}
export interface WeeklyYouthObservationResult {
  state: GameState;
  discoveries: NonNullable<GameState["discoveryRecords"]>;
  messages: InboxMessage[];
  playersDiscovered: number;
  observationsGenerated: number;
}

export function processWeeklyYouthObservationActivities(
  input: WeeklyYouthObservationInput,
): WeeklyYouthObservationResult {
  const gameState = input.sourceState;
  let stateWithScheduleApplied = input.state;
  const {
    weekResult,
    scout: currentScout,
    effectiveScoutCountry,
    playerEvidence,
    recordObservation,
    hasNewObservations,
    completedInteractiveIds,
    completedLiveActivityTypes,
  } = input;
  const qualityMap = input.qualityByType;
  const actObsRng = input.rng;
  let actDiscoveries = [...input.discoveries];
  const actObsMessages = [...input.messages];
  const updatedObservations = input.observations;
  let weekPlayersDiscovered = input.playersDiscovered;
  let weekObservationsGenerated = input.observationsGenerated;
  const choiceDiscoveryMod = input.discoveryModifier;
  const focusDepth = input.focusDepth;
  const focusPlayers = input.focusPlayers;
  const prioritizeFocusedYouth = input.prioritizeYouth;
  const simChoices = input.weekSimulation;
  const TIER_LABELS = input.tierLabels;

  // Positional compatibility adapter for the existing youth handlers. It
  // ensures fallback, focused, tournament, and post-simulation observations
  // all receive the same persisted deterministic situation contract.
  const processVenueObservation = (
    observationRng: RNG,
    scout: Scout,
    youth: UnsignedYouth,
    context: ObservationContext,
    existingObservations: Observation[],
    _week: number,
    _season: number,
    extraAttributes?: number,
    tournament?: TournamentEvent,
  ) => produceWeeklyVenueObservation({
    state: stateWithScheduleApplied,
    rng: observationRng,
    scout,
    youth,
    context,
    existingObservations,
    extraAttributes,
      tournament,
  });

  // ── Youth-exclusive activity observation handlers ──────────────────────
  // These use the proper youth venue system (getYouthVenuePool + processVenueObservation)
  // which draws from unsignedYouth rather than signed professionals.

  // Check for pre-computed results from week simulation
  const simYouthResults = simChoices?.youthVenueResults;
  if (simYouthResults) {
    // A completed live session has already written authoritative evidence
    // for its activity instance. Keep the pre-computed result only when
    // the player skipped the session, so reports never count both paths.
    const previewMerge = mergeYouthVenuePreview({
      ...stateWithScheduleApplied, observations: updatedObservations, discoveryRecords: actDiscoveries,
    }, simYouthResults, completedInteractiveIds);
    const applicableSimObservations = previewMerge.observations;
    for (const observation of applicableSimObservations) {
      recordObservation(observation);
    }
    actDiscoveries = [...actDiscoveries, ...previewMerge.discoveries];
    weekObservationsGenerated += applicableSimObservations.length;
    weekPlayersDiscovered += previewMerge.discoveries.length;
    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      unsignedYouth: previewMerge.unsignedYouth,
      observations: updatedObservations,
      discoveryRecords: actDiscoveries,
    };

    let updatedUnsignedYouthObs = { ...stateWithScheduleApplied.unsignedYouth };

    // ── Focus observations for youth venues (main path) ──────────────
    // The fallback path has this inline; the main path must run it too.
    const YOUTH_VENUE_TYPES_FOR_FOCUS = [
      "schoolMatch", "grassrootsTournament", "streetFootball",
      "academyTrialDay", "youthFestival",
    ] as const;
    for (const venueType of YOUTH_VENUE_TYPES_FOR_FOCUS) {
      if (completedLiveActivityTypes.has(venueType)) continue;
      const focusTargetIds = focusPlayers(venueType);
      const focusRepeats = focusDepth(venueType);
      if (focusTargetIds.length === 0 || focusRepeats === 0) continue;

      const focusedYouthList = focusTargetIds
        .map((id) => Object.values(updatedUnsignedYouthObs).find((y) => y.player.id === id))
        .filter((y): y is UnsignedYouth => !!y);

      for (let repeat = 0; repeat < focusRepeats && focusedYouthList.length > 0; repeat++) {
        const focusedYouth = focusedYouthList[repeat % focusedYouthList.length];
        const focusObsForYouth = playerEvidence(focusedYouth.player.id);
        const focusResult = processVenueObservation(
          actObsRng,
          currentScout,
          focusedYouth,
          "followUpSession",
          focusObsForYouth,
          stateWithScheduleApplied.currentWeek,
          stateWithScheduleApplied.currentSeason,
          2, // extraAttributes — focus reveals more per pass
        );
        recordObservation(focusResult.observation);
        updatedUnsignedYouthObs[focusedYouth.id] = focusResult.updatedYouth;
        weekObservationsGenerated++;
      }
    }

    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      unsignedYouth: updatedUnsignedYouthObs,
      observations: updatedObservations,
      discoveryRecords: actDiscoveries,
      inbox: [...stateWithScheduleApplied.inbox, ...actObsMessages],
    };
  } else {
  // Fallback: process youth venues for old/incomplete live-session saves.
  // Missing results are also normal on weeks without a youth venue, so
  // prospect supply must remain a season-boundary responsibility.

  let updatedUnsignedYouthObs = { ...stateWithScheduleApplied.unsignedYouth };

  // ── Passive tournament discovery ─────────────────────────────────────
  {
    const discoveryRng = createRNG(
      `${gameState.seed}-discovery-w${gameState.currentWeek}-s${gameState.currentSeason}`,
    );
    const scoutCountry = getScoutHome(stateWithScheduleApplied.scout);
    const { updatedTournaments, discovered } = discoverTournamentsPassive(
      discoveryRng,
      stateWithScheduleApplied.youthTournaments ?? {},
      stateWithScheduleApplied.subRegions,
      stateWithScheduleApplied.currentWeek,
      scoutCountry,
    );
    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      youthTournaments: updatedTournaments,
    };
    for (const t of discovered) {
      actObsMessages.push({
        id: `tournament-discovered-${t.id}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "event" as const,
        title: `Tournament Discovered: ${t.name}`,
        body: `You've heard about ${t.name}, a ${t.prestige} youth tournament in ${t.country}. It runs from week ${t.startWeek} to ${t.endWeek}. Schedule a visit to scout the talent on show.`,
        read: false,
        actionRequired: false,
      });
    }
  }

  // Extract tournament IDs from scheduled activities
  const scheduledForTournament = getScheduledActivityInstances(stateWithScheduleApplied.schedule);
  const tournamentIdForType = (type: string): string | undefined =>
    scheduledForTournament.find(i => i.activity.type === type)?.activity.targetId;

  // ── Gut feeling setup for youth observations ──────────────────────
  const youthPerkModifiers = resolveScoutPerkModifiers(
    stateWithScheduleApplied.scout,
  );
  const newGutFeelings: GutFeeling[] = [];
  const gutEquipBonuses = stateWithScheduleApplied.finances?.equipment
    ? getActiveEquipmentBonuses(stateWithScheduleApplied.finances.equipment.loadout)
    : undefined;
  const gutPerkMods = {
    gutFeelingMultiplier: youthPerkModifiers.gutFeelingMultiplier,
    gutFeelingMaxAge: youthPerkModifiers.gutFeelingMaxAge,
    paEstimate: youthPerkModifiers.hasPAEstimate,
  };
  const highUpsideAlertsSent = new Set<string>();

  // Helper for youth venue observation processing
  const processYouthVenueActivity = (
    venueType: "schoolMatch" | "grassrootsTournament" | "streetFootball" | "academyTrialDay" | "youthFestival" | "agencyShowcase",
    executedCount: number,
    activityLabel: string,
    msgPrefix: string,
    tournamentId?: string,
  ) => {
    if (executedCount <= 0) return;
    // Look up tournament for pool/observation bonuses
    const tournament = tournamentId
      ? stateWithScheduleApplied.youthTournaments?.[tournamentId]
      : undefined;
    const displayLabel = tournament ? tournament.name : activityLabel;
    const qr = qualityMap.get(venueType === "agencyShowcase" ? "youthFestival" : venueType);
    const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod(venueType === "agencyShowcase" ? "youthFestival" : venueType);
    const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
    const equipBonuses = stateWithScheduleApplied.finances?.equipment
      ? getActiveEquipmentBonuses(stateWithScheduleApplied.finances.equipment.loadout)
      : { youthDiscoveryBonus: 0 };
    const youthBonus = (equipBonuses.youthDiscoveryBonus ?? 0)
      + (getActiveToolBonuses(stateWithScheduleApplied.unlockedTools).youthDiscoveryBonus ?? 0);

    // agencyShowcase uses youthFestival venue mechanics
    const effectiveVenueType = venueType === "agencyShowcase" ? "youthFestival" as const : venueType;

    const pool = getYouthVenuePool(
      actObsRng,
      effectiveVenueType,
      updatedUnsignedYouthObs,
      currentScout,
      undefined,
      undefined,
      youthBonus,
      stateWithScheduleApplied.currentWeek,
      tournament,
      buildScoutQualityDataForState(
        stateWithScheduleApplied,
        tournament?.country ?? effectiveScoutCountry,
      ),
    );

    // Deduct travel cost for international tournaments (first attendance)
    // Equipment travelCostReduction bonus reduces the cost
    if (tournament?.travelCost && stateWithScheduleApplied.finances) {
      const travelContextBonuses = stateWithScheduleApplied.finances.equipment
        ? getContextualEquipmentBonuses(
            stateWithScheduleApplied.finances.equipment.loadout,
            {
              scoutHomeCountry: getScoutHome(currentScout),
              country: tournament.country,
            },
          )
        : undefined;
      const travelCostReductionRate = travelContextBonuses?.travelCostReduction ?? 0;
      const tournamentPresence = deriveRegionalPresence(
        stateWithScheduleApplied,
        tournament.country,
      );
      const reducedTravelCost = Math.round(
        tournament.travelCost
          * tournamentPresence.effects.travelCostMultiplier
          * (1 - travelCostReductionRate),
      );
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        finances: {
          ...stateWithScheduleApplied.finances,
          balance: stateWithScheduleApplied.finances.balance - reducedTravelCost,
          transactions: [
            ...stateWithScheduleApplied.finances.transactions,
            {
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              amount: -reducedTravelCost,
              description: `Travel + accommodation: ${tournament.name} (${tournamentPresence.accessTier} regional route)`,
            },
          ],
        },
      };
    }

    // Deduct organization cost for agency showcase
    if (tournament?.organizationCost && stateWithScheduleApplied.finances) {
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        finances: {
          ...stateWithScheduleApplied.finances,
          balance: stateWithScheduleApplied.finances.balance - tournament.organizationCost,
          transactions: [
            ...stateWithScheduleApplied.finances.transactions,
            {
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              amount: -tournament.organizationCost,
              description: `Organization cost: ${tournament.name}`,
            },
          ],
        },
      };
    }

    // Apply quality modifier to pool size
    const adjustedCount = Math.max(1, pool.length + discMod);
    const finalPool = prioritizeFocusedYouth([...pool], venueType).slice(0, adjustedCount);

    for (let i = 0; i < finalPool.length; i++) {
      const youth = finalPool[i];
      const context = mapVenueTypeToContext(effectiveVenueType);
      const existingObsForYouth = playerEvidence(youth.player.id);
      const result = processVenueObservation(
        actObsRng,
        currentScout,
        youth,
        context,
        existingObsForYouth,
        stateWithScheduleApplied.currentWeek,
        stateWithScheduleApplied.currentSeason,
        undefined,
        tournament,
      );

      recordObservation(result.observation);
      updatedUnsignedYouthObs[youth.id] = result.updatedYouth;
      weekObservationsGenerated++;

      const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
      if (!alreadyDiscovered) {
        actDiscoveries = [...actDiscoveries, recordDiscovery(
          youth.player,
          currentScout,
          stateWithScheduleApplied.currentWeek,
          stateWithScheduleApplied.currentSeason,
        )];
        weekPlayersDiscovered++;
      }

      // Roll gut feeling for this youth observation
      const gutFeeling = rollGutFeeling(
        actObsRng,
        currentScout,
        youth,
        context,
        gutPerkMods,
        gutEquipBonuses?.gutFeelingBonus ?? 0,
      );
      if (gutFeeling) {
        gutFeeling.week = stateWithScheduleApplied.currentWeek;
        gutFeeling.season = stateWithScheduleApplied.currentSeason;
        if (youthPerkModifiers.hasPAEstimate) {
          gutFeeling.narrative = formatGutFeelingWithPA(
            gutFeeling,
            youth,
            gutPerkMods,
            gutEquipBonuses?.paEstimateAccuracy ?? 0,
          );
        }
        newGutFeelings.push(gutFeeling);
      }

      const wonderkidAlert = createWonderkidRadarAlert({
        perkModifiers: youthPerkModifiers,
        youth,
        observations: playerEvidence(youth.player.id),
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
      });
      if (wonderkidAlert && !highUpsideAlertsSent.has(youth.player.id)) {
        highUpsideAlertsSent.add(youth.player.id);
        actObsMessages.push(wonderkidAlert);
      }

      const topAttrs = result.observation.attributeReadings
        .sort((a, b) => b.perceivedValue - a.perceivedValue)
        .slice(0, 3)
        .map((r) => `${r.attribute} ${r.perceivedValue}`)
        .join(", ");
      const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
      actObsMessages.push({
        id: `obs-${venueType}-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "feedback" as const,
        title: `${displayLabel}${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
        body: `${narrativePrefix}${msgPrefix} ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country}. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}. Buzz +${result.buzzIncrease}, Visibility +${result.visibilityIncrease}.`,
        read: false,
        actionRequired: false,
        relatedId: youth.player.id,
        relatedEntityType: "player" as const,
      });
    }

    const focusTargetIds = focusPlayers(venueType);
    const focusRepeats = focusDepth(venueType);
    if (focusTargetIds.length > 0 && focusRepeats > 0) {
      const focusedYouthList = focusTargetIds
        .map((id) =>
          finalPool.find((y) => y.player.id === id)
          ?? Object.values(updatedUnsignedYouthObs).find((y) => y.player.id === id),
        )
        .filter((y): y is UnsignedYouth => !!y);

      for (let repeat = 0; repeat < focusRepeats && focusedYouthList.length > 0; repeat++) {
        const focusedYouth = focusedYouthList[repeat % focusedYouthList.length];
        const focusObsForYouth = playerEvidence(focusedYouth.player.id);
        const focusResult = processVenueObservation(
          actObsRng,
          currentScout,
          focusedYouth,
          "followUpSession",
          focusObsForYouth,
          stateWithScheduleApplied.currentWeek,
          stateWithScheduleApplied.currentSeason,
        );
        recordObservation(focusResult.observation);
        updatedUnsignedYouthObs[focusedYouth.id] = focusResult.updatedYouth;
        weekObservationsGenerated++;

        // Roll gut feeling for focused follow-up observation
        const focusGutFeeling = rollGutFeeling(
          actObsRng,
          currentScout,
          focusedYouth,
          "followUpSession",
          gutPerkMods,
          gutEquipBonuses?.gutFeelingBonus ?? 0,
        );
        if (focusGutFeeling) {
          focusGutFeeling.week = stateWithScheduleApplied.currentWeek;
          focusGutFeeling.season = stateWithScheduleApplied.currentSeason;
          if (youthPerkModifiers.hasPAEstimate) {
            focusGutFeeling.narrative = formatGutFeelingWithPA(
              focusGutFeeling,
              focusedYouth,
              gutPerkMods,
              gutEquipBonuses?.paEstimateAccuracy ?? 0,
            );
          }
          newGutFeelings.push(focusGutFeeling);
        }
      }
    }

    // Mark tournament as attended
    if (tournament && tournamentId && stateWithScheduleApplied.youthTournaments) {
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        youthTournaments: {
          ...stateWithScheduleApplied.youthTournaments,
          [tournamentId]: { ...tournament, attended: true },
        },
      };
    }
  };

  processYouthVenueActivity(
    "schoolMatch",
    weekResult.schoolMatchesExecuted,
    "School Match",
    "You watched",
  );
  processYouthVenueActivity(
    "grassrootsTournament",
    weekResult.grassrootsTournamentsExecuted,
    "Grassroots Tournament",
    "You scouted",
    tournamentIdForType("grassrootsTournament"),
  );
  processYouthVenueActivity(
    "streetFootball",
    weekResult.streetFootballExecuted,
    "Street Football",
    "You observed",
  );
  processYouthVenueActivity(
    "academyTrialDay",
    weekResult.academyTrialDaysExecuted,
    "Academy Trial Day",
    "You evaluated",
  );
  processYouthVenueActivity(
    "youthFestival",
    weekResult.youthFestivalsExecuted,
    "Youth Festival",
    "You spotted",
    tournamentIdForType("youthFestival"),
  );
  processYouthVenueActivity(
    "agencyShowcase",
    weekResult.agencyShowcasesExecuted,
    "Agency Showcase",
    "You hosted",
    tournamentIdForType("agencyShowcase"),
  );

  // Apply updated unsigned youth back to state
  stateWithScheduleApplied = {
    ...stateWithScheduleApplied,
    unsignedYouth: updatedUnsignedYouthObs,
  };

  if (actObsMessages.length > 0 || hasNewObservations()) {
    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      observations: updatedObservations,
      discoveryRecords: actDiscoveries,
      inbox: [...stateWithScheduleApplied.inbox, ...actObsMessages],
    };
  }

  // Merge any gut feelings generated during youth observations
  if (newGutFeelings.length > 0) {
    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      gutFeelings: [...stateWithScheduleApplied.gutFeelings, ...newGutFeelings],
    };
  }
  } // end else (fallback for old saves)

  // Targeted work follows the person after placement. Signed Player is the truth;
  // an observation must never recreate a duplicate unsigned-youth record.
  const successfullyCompletedTargets = new Set<string>();
  const targetedMessages: InboxMessage[] = [];
  for (const booking of getScheduledActivityInstances(stateWithScheduleApplied.schedule)) {
    const activity = booking.activity;
    if (!activity.targetId || (activity.type !== "followUpSession" && activity.type !== "parentCoachMeeting")) continue;
    const activityInstanceId = getInteractiveActivityCompletionKey(activity, booking.dayIndex);
    const evidenceKey = `s${stateWithScheduleApplied.currentSeason}-w${stateWithScheduleApplied.currentWeek}-${activityInstanceId}`;
    const alreadyFiled = Object.values(updatedObservations).some(observation =>
      observation.activityInstanceId === activityInstanceId
      && observation.week === stateWithScheduleApplied.currentWeek
      && observation.season === stateWithScheduleApplied.currentSeason);
    if (completedInteractiveIds.has(activityInstanceId) || alreadyFiled) {
      successfullyCompletedTargets.add(activityInstanceId);
      continue;
    }
    const executed = activity.type === "followUpSession"
      ? weekResult.followUpSessionsExecuted : weekResult.parentCoachMeetingsExecuted;
    if (executed <= 0) continue;
    const target = resolveActionableProspect(stateWithScheduleApplied, activity.targetId);
    if (!target) {
      targetedMessages.push({ id: `unavailable-${evidenceKey}`, week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason, type: "feedback", title: "Follow-up target unavailable",
        body: "This scheduled follow-up could not take place because the player is no longer available. Review the dossier before booking another session. No evidence or case completion was credited.",
        read: false, actionRequired: false, relatedId: activity.targetId, relatedEntityType: "player" });
      continue;
    }
    const { player, unsignedYouth } = target;
    let observation: Observation;
    if (activity.type === "parentCoachMeeting") {
      const meeting = processParentCoachMeeting(actObsRng, currentScout,
        unsignedYouth ?? { player, buzzLevel: 0 });
      observation = { id: `meeting-${evidenceKey}`, playerId: player.id, scoutId: currentScout.id,
        activityInstanceId, week: stateWithScheduleApplied.currentWeek, season: stateWithScheduleApplied.currentSeason,
        context: "parentCoachMeeting", attributeReadings: [], flaggedMoments: [],
        notes: [...meeting.hiddenIntel, ...meeting.characterNotes].map(note => `Reported testimony (unverified): ${note}`) };
    } else if (unsignedYouth) {
      const result = produceWeeklyVenueObservation({ state: stateWithScheduleApplied, rng: actObsRng,
        scout: currentScout, youth: unsignedYouth, context: "followUpSession",
        existingObservations: playerEvidence(player.id), activityInstanceId });
      observation = result.observation;
      stateWithScheduleApplied = { ...stateWithScheduleApplied, unsignedYouth: {
        ...stateWithScheduleApplied.unsignedYouth, [unsignedYouth.id]: result.updatedYouth,
      } };
    } else {
      observation = produceWeeklyPlayerObservation({ state: stateWithScheduleApplied, rng: actObsRng,
        scout: currentScout, player, context: "followUpSession", existingObservations: playerEvidence(player.id), activityInstanceId });
    }
    recordObservation(observation);
    // Preserve the unsigned follow-up instinct roll from the legacy resolver.
    if (activity.type === "followUpSession" && unsignedYouth && !simYouthResults) {
      const perks = resolveScoutPerkModifiers(currentScout);
      const modifiers = { gutFeelingMultiplier: perks.gutFeelingMultiplier,
        gutFeelingMaxAge: perks.gutFeelingMaxAge, paEstimate: perks.hasPAEstimate };
      const equipment = stateWithScheduleApplied.finances?.equipment
        ? getActiveEquipmentBonuses(stateWithScheduleApplied.finances.equipment.loadout) : undefined;
      const feeling = rollGutFeeling(actObsRng, currentScout, unsignedYouth, "followUpSession", modifiers, equipment?.gutFeelingBonus ?? 0);
      if (feeling) {
        feeling.week = stateWithScheduleApplied.currentWeek;
        feeling.season = stateWithScheduleApplied.currentSeason;
        if (perks.hasPAEstimate) feeling.narrative = formatGutFeelingWithPA(feeling, unsignedYouth, modifiers, equipment?.paEstimateAccuracy ?? 0);
        stateWithScheduleApplied = { ...stateWithScheduleApplied,
          gutFeelings: [...stateWithScheduleApplied.gutFeelings, feeling] };
      }
    }
    weekObservationsGenerated++;
    successfullyCompletedTargets.add(activityInstanceId);
    const name = `${player.firstName} ${player.lastName}`;
    targetedMessages.push({ id: `completed-${evidenceKey}`, week: stateWithScheduleApplied.currentWeek,
      season: stateWithScheduleApplied.currentSeason, type: "feedback", title: `${activity.type === "parentCoachMeeting" ? "Parent/Coach Meeting" : "Follow-Up Session"}: ${name}`,
      body: activity.type === "parentCoachMeeting"
        ? `You met with ${name}'s family and coaching staff. Their accounts are testimony to cross-check, not confirmed facts.\n\n${observation.notes.join("\n")}`
        : `You completed a focused follow-up on ${name}. ${observation.attributeReadings.length} attributes were assessed; the evidence is filed in the same dossier as the original recommendation.`,
      read: false, actionRequired: false, relatedId: player.id, relatedEntityType: "player" });
  }
  actObsMessages.push(...targetedMessages);
  const existingMessageIds = new Set(stateWithScheduleApplied.inbox.map(message => message.id));
  if (targetedMessages.length > 0) {
    stateWithScheduleApplied = { ...stateWithScheduleApplied,
      ...(hasNewObservations() ? { observations: updatedObservations } : {}),
      inbox: [...stateWithScheduleApplied.inbox, ...targetedMessages.filter(message => !existingMessageIds.has(message.id))] };
  }

  const completedTargetedActivities = getScheduledActivityInstances(stateWithScheduleApplied.schedule)
    .filter(entry => entry.activity.type === "writePlacementReport" || successfullyCompletedTargets.has(
      getInteractiveActivityCompletionKey(entry.activity, entry.dayIndex),
    ))
    .map((entry) => entry.activity)
    .filter((activity) =>
      Boolean(activity.targetId) && (
        (activity.type === "followUpSession" && weekResult.followUpSessionsExecuted > 0)
        || (activity.type === "parentCoachMeeting" && weekResult.parentCoachMeetingsExecuted > 0)
        || (activity.type === "writePlacementReport" && weekResult.writePlacementReportsExecuted > 0)
      ),
    );
  for (const activity of completedTargetedActivities) {
    if (!activity.targetId) continue;
    stateWithScheduleApplied = applyProfessionalCaseOpportunityActivity(
      stateWithScheduleApplied,
      activity.type,
      activity.targetId,
    );
  }

  return {
    state: stateWithScheduleApplied,
    discoveries: actDiscoveries,
    messages: actObsMessages,
    playersDiscovered: weekPlayersDiscovered,
    observationsGenerated: weekObservationsGenerated,
  };
}
