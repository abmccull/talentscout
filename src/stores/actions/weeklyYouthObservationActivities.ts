import type {
  Activity,
  GameState,
  GutFeeling,
  InboxMessage,
  Observation,
  Scout,
  UnsignedYouth,
  WeekSimulationState,
} from "@/engine/core/types";
import { processCompletedWeek, getScheduledActivityInstances } from "@/engine/core/calendar";
import { getActiveEquipmentBonuses } from "@/engine/finance";
import { createRNG, type RNG } from "@/engine/rng";
import { getPerceivedAbility } from "@/engine/scout/perceivedAbility";
import {
  deriveRegionalPresence,
  getScoutHomeCountry as getScoutHome,
} from "@/engine/world";
import { ALL_PERKS } from "@/engine/specializations/perks";
import {
  discoverTournamentsPassive,
  formatGutFeelingWithPA,
  rollGutFeeling,
} from "@/engine/youth";
import {
  getYouthVenuePool,
  mapVenueTypeToContext,
  processParentCoachMeeting,
  processVenueObservation,
} from "@/engine/youth/venues";
import { recordDiscovery } from "@/engine/career";
import { buildScoutQualityDataForState } from "./weeklySimulationSupport";
import type { ActivityQualityResult } from "@/engine/core/activityQuality";

type CompletedWeekResult = ReturnType<typeof processCompletedWeek>;
type EquipmentBonuses = ReturnType<typeof getActiveEquipmentBonuses>;

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
    completedInteractiveIds,
    completedLiveActivityTypes,
  } = input;
  const weekEquipBonuses = input.equipmentBonuses;
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

  // ── Youth-exclusive activity observation handlers ──────────────────────
  // These use the proper youth venue system (getYouthVenuePool + processVenueObservation)
  // which draws from unsignedYouth rather than signed professionals.

  // Check for pre-computed results from week simulation
  const simYouthResults = simChoices?.youthVenueResults;
  if (simYouthResults) {
    // A completed live session has already written authoritative evidence
    // for its activity instance. Keep the pre-computed result only when
    // the player skipped the session, so reports never count both paths.
    const applicableSimObservations = Object.values(
      simYouthResults.newObservations,
    ).filter(
      (observation) => !observation.activityInstanceId
        || !completedInteractiveIds.has(observation.activityInstanceId),
    );
    for (const observation of applicableSimObservations) {
      recordObservation(observation);
    }
    const dedupedNewDiscoveries = simYouthResults.newDiscoveries.filter(
      (nd) => !actDiscoveries.some((d) => d.playerId === nd.playerId),
    );
    actDiscoveries = [...actDiscoveries, ...dedupedNewDiscoveries];
    weekObservationsGenerated += applicableSimObservations.length;
    weekPlayersDiscovered += simYouthResults.totalDiscoveries;
    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      unsignedYouth: { ...stateWithScheduleApplied.unsignedYouth, ...simYouthResults.updatedUnsignedYouth },
      observations: updatedObservations,
      discoveryRecords: actDiscoveries,
    };

    let updatedUnsignedYouthObs = { ...stateWithScheduleApplied.unsignedYouth };

    // --- Follow-Up Session: deepens observation on a specific youth ---
    if (weekResult.followUpSessionsExecuted > 0) {
      const qr = qualityMap.get("followUpSession");
      const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
      const followUpActivities = getScheduledActivityInstances(stateWithScheduleApplied.schedule)
        .map((entry) => entry.activity)
        .filter((a) => a.type === "followUpSession" && !!a.targetId);
      for (const followUpAct of followUpActivities) {
        if (!followUpAct.targetId) continue;
        const targetYouthId = followUpAct.targetId;
        const pool = getYouthVenuePool(
          actObsRng,
          "followUpSession",
          updatedUnsignedYouthObs,
          currentScout,
          undefined,
          targetYouthId,
          undefined,
          stateWithScheduleApplied.currentWeek,
          undefined,
          buildScoutQualityDataForState(
            stateWithScheduleApplied,
            effectiveScoutCountry,
          ),
        );
        if (pool.length === 0) continue;
        const youth = pool[0];
        const existingObsForYouth = playerEvidence(youth.player.id);
        const result = processVenueObservation(
          actObsRng,
          currentScout,
          youth,
          "followUpSession",
          existingObsForYouth,
          stateWithScheduleApplied.currentWeek,
          stateWithScheduleApplied.currentSeason,
        );

        recordObservation(result.observation);
        updatedUnsignedYouthObs[youth.id] = result.updatedYouth;
        weekObservationsGenerated++;

        const topAttrs = result.observation.attributeReadings
          .sort((a, b) => b.perceivedValue - a.perceivedValue)
          .slice(0, 3)
          .map((r) => `${r.attribute} ${r.perceivedValue}`)
          .join(", ");
        const narrativePrefix = qr ? `${qr.narrative}\n\n` : "";
        actObsMessages.push({
          id: `obs-followup-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `Follow-Up Session${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
          body: `${narrativePrefix}You conducted a focused follow-up session on ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}). This deeper assessment refines your earlier observations. ${result.observation.attributeReadings.length} attributes assessed with higher confidence. Notable: ${topAttrs}.`,
          read: false,
          actionRequired: false,
          relatedId: youth.player.id,
          relatedEntityType: "player" as const,
        });
      }
    }

    // --- Parent/Coach Meeting: reveals hidden intel, no attribute observations ---
    if (weekResult.parentCoachMeetingsExecuted > 0) {
      const qr = qualityMap.get("parentCoachMeeting");
      const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
      const meetingActivities = getScheduledActivityInstances(stateWithScheduleApplied.schedule)
        .map((entry) => entry.activity)
        .filter((a) => a.type === "parentCoachMeeting" && !!a.targetId);
      for (const meetingAct of meetingActivities) {
        if (!meetingAct.targetId) continue;
        const targetYouthId = meetingAct.targetId;
        const youth = updatedUnsignedYouthObs[targetYouthId];
        if (!youth || youth.placed || youth.retired) continue;

        const meetingResult = processParentCoachMeeting(actObsRng, currentScout, youth);
        const intelLines = [
          ...meetingResult.hiddenIntel.map((h) => `Intel: ${h}`),
          ...meetingResult.characterNotes.map((c) => `Character: ${c}`),
        ];
        const narrativePrefix = qr ? `${qr.narrative}\n\n` : "";
        actObsMessages.push({
          id: `obs-parentcoach-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `Parent/Coach Meeting${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
          body: `${narrativePrefix}You met with ${youth.player.firstName} ${youth.player.lastName}'s family and coaching staff.\n\n${intelLines.join("\n")}`,
          read: false,
          actionRequired: false,
          relatedId: youth.player.id,
          relatedEntityType: "player" as const,
        });
      }
    }

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
  const newGutFeelings: GutFeeling[] = [];
  const gutEquipBonuses = stateWithScheduleApplied.finances?.equipment
    ? getActiveEquipmentBonuses(stateWithScheduleApplied.finances.equipment.loadout)
    : undefined;
  const hasGutFeelingBonus = stateWithScheduleApplied.scout.unlockedPerks.some((perkId) => {
    const perk = ALL_PERKS.find((p) => p.id === perkId);
    return perk?.effect.type === "gutFeelingBonus";
  });
  const hasPAEstimate = stateWithScheduleApplied.scout.unlockedPerks.some((perkId) => {
    const perk = ALL_PERKS.find((p) => p.id === perkId);
    return perk?.effect.type === "paEstimate";
  });
  const gutPerkMods = {
    gutFeelingBonus: hasGutFeelingBonus,
    paEstimate: hasPAEstimate,
  };
  const hasWonderkidRadar = stateWithScheduleApplied.scout.unlockedPerks.some((perkId) => {
    const perk = ALL_PERKS.find((p) => p.id === perkId);
    return perk?.effect.type === "wonderkidDetection";
  });
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
    const youthBonus = equipBonuses.youthDiscoveryBonus ?? 0;

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
      const travelCostReductionRate = weekEquipBonuses?.travelCostReduction ?? 0;
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
        if (hasPAEstimate) {
          gutFeeling.narrative = formatGutFeelingWithPA(
            gutFeeling,
            youth,
            gutPerkMods,
            gutEquipBonuses?.paEstimateAccuracy ?? 0,
          );
        }
        newGutFeelings.push(gutFeeling);
      }

      // The perk surfaces an evidence-based signal, not hidden PA truth.
      const perceivedAbility = getPerceivedAbility(
        playerEvidence(youth.player.id),
        youth.player.id,
      );
      if (
        hasWonderkidRadar &&
        youth.player.age <= 16 &&
        perceivedAbility !== null &&
        perceivedAbility.paHigh >= 4 &&
        perceivedAbility.paConfidence >= 0.25 &&
        !highUpsideAlertsSent.has(youth.player.id)
      ) {
        highUpsideAlertsSent.add(youth.player.id);
        actObsMessages.push({
          id: `wk-radar-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "news" as const,
          title: `High-Upside Signal: ${youth.player.firstName} ${youth.player.lastName}`,
          body: `Your radar picked up a promising pattern around ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}). This is an uncertain signal, not a hidden rating—schedule a follow-up before committing.`,
          read: false,
          actionRequired: false,
          relatedId: youth.player.id,
          relatedEntityType: "player" as const,
        });
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
          if (hasPAEstimate) {
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

  // --- Follow-Up Session: deepens observation on a specific youth ---
    if (weekResult.followUpSessionsExecuted > 0) {
      const qr = qualityMap.get("followUpSession");
      const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
      // Find the followUpSession activity to get its targetId
      const followUpActivities = getScheduledActivityInstances(stateWithScheduleApplied.schedule)
        .map((entry) => entry.activity)
        .filter((a) => a.type === "followUpSession" && !!a.targetId);
      for (const followUpAct of followUpActivities) {
        if (!followUpAct?.targetId) continue;
        const targetYouthId = followUpAct.targetId;
      const pool = getYouthVenuePool(
        actObsRng,
        "followUpSession",
        updatedUnsignedYouthObs,
        currentScout,
        undefined,
        targetYouthId,
        undefined,
        stateWithScheduleApplied.currentWeek,
        undefined,
        buildScoutQualityDataForState(
          stateWithScheduleApplied,
          effectiveScoutCountry,
        ),
      );
      if (pool.length === 0) continue;
      const youth = pool[0];
      const existingObsForYouth = playerEvidence(youth.player.id);
      const result = processVenueObservation(
        actObsRng,
        currentScout,
        youth,
        "followUpSession",
        existingObsForYouth,
        stateWithScheduleApplied.currentWeek,
        stateWithScheduleApplied.currentSeason,
      );

      recordObservation(result.observation);
      updatedUnsignedYouthObs[youth.id] = result.updatedYouth;
      weekObservationsGenerated++;

      // Roll gut feeling for standalone follow-up observation
      const followUpGutFeeling = rollGutFeeling(
        actObsRng,
        currentScout,
        youth,
        "followUpSession",
        gutPerkMods,
        gutEquipBonuses?.gutFeelingBonus ?? 0,
      );
      if (followUpGutFeeling) {
        followUpGutFeeling.week = stateWithScheduleApplied.currentWeek;
        followUpGutFeeling.season = stateWithScheduleApplied.currentSeason;
        if (hasPAEstimate) {
          followUpGutFeeling.narrative = formatGutFeelingWithPA(
            followUpGutFeeling,
            youth,
            gutPerkMods,
            gutEquipBonuses?.paEstimateAccuracy ?? 0,
          );
        }
        newGutFeelings.push(followUpGutFeeling);
      }

      const topAttrs = result.observation.attributeReadings
        .sort((a, b) => b.perceivedValue - a.perceivedValue)
        .slice(0, 3)
        .map((r) => `${r.attribute} ${r.perceivedValue}`)
        .join(", ");
      const narrativePrefix = qr ? `${qr.narrative}\n\n` : "";
      actObsMessages.push({
        id: `obs-followup-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "feedback" as const,
        title: `Follow-Up Session${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
        body: `${narrativePrefix}You conducted a focused follow-up session on ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}). This deeper assessment refines your earlier observations. ${result.observation.attributeReadings.length} attributes assessed with higher confidence. Notable: ${topAttrs}.`,
        read: false,
        actionRequired: false,
        relatedId: youth.player.id,
        relatedEntityType: "player" as const,
      });
    }
  }

  // --- Parent/Coach Meeting: reveals hidden intel, no attribute observations ---
    if (weekResult.parentCoachMeetingsExecuted > 0) {
      const qr = qualityMap.get("parentCoachMeeting");
      const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
      const meetingActivities = getScheduledActivityInstances(stateWithScheduleApplied.schedule)
        .map((entry) => entry.activity)
        .filter((a) => a.type === "parentCoachMeeting" && !!a.targetId);
      for (const meetingAct of meetingActivities) {
        if (!meetingAct?.targetId) continue;
      const targetYouthId = meetingAct.targetId;
      const youth = updatedUnsignedYouthObs[targetYouthId];
      if (!youth || youth.placed || youth.retired) continue;

      const meetingResult = processParentCoachMeeting(actObsRng, currentScout, youth);

      const intelLines = [
        ...meetingResult.hiddenIntel.map((h) => `Intel: ${h}`),
        ...meetingResult.characterNotes.map((c) => `Character: ${c}`),
      ];
      const narrativePrefix = qr ? `${qr.narrative}\n\n` : "";
      actObsMessages.push({
        id: `obs-parentcoach-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "feedback" as const,
        title: `Parent/Coach Meeting${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
        body: `${narrativePrefix}You met with ${youth.player.firstName} ${youth.player.lastName}'s family and coaching staff.\n\n${intelLines.join("\n")}`,
        read: false,
        actionRequired: false,
        relatedId: youth.player.id,
        relatedEntityType: "player" as const,
      });
    }
  }

  // Apply updated unsigned youth back to state
  stateWithScheduleApplied = {
    ...stateWithScheduleApplied,
    unsignedYouth: updatedUnsignedYouthObs,
  };

  if (actObsMessages.length > 0 || Object.keys(updatedObservations).length !== Object.keys(stateWithScheduleApplied.observations).length) {
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

  return {
    state: stateWithScheduleApplied,
    discoveries: actDiscoveries,
    messages: actObsMessages,
    playersDiscovered: weekPlayersDiscovered,
    observationsGenerated: weekObservationsGenerated,
  };
}
