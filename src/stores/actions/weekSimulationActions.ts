import type { GetState, SetState } from "./types";
import type { GameScreen } from "../gameStoreTypes";
import type {
  Activity,
  DayResult,
  DiscoveryRecord,
  GameState,
  InboxMessage,
  Observation,
  Scout,
  WeekSchedule,
  WeekSimulationState,
} from "@/engine/core/types";
import type { ActivityQualityResult } from "@/engine/core/activityQuality";
import type { ScoutQualityData } from "@/engine/youth/venues";
import type { ActivityChoiceId } from "@/engine/core/activityInteractions";
import { createRNG } from "@/engine/rng";
import { expireJobOffersAtWeekEnd } from "@/engine/career/progression";
import { applyCareerPathTransition } from "@/engine/career/transitions";
import { hasRepresentedCareerCompletionState } from "@/engine/career/legacy";
import { isBankruptcyRecoveryActive } from "@/engine/finance/distress";
import {
  ACTIVITY_FATIGUE_COSTS as ACTIVITY_FATIGUE_COSTS_MAP,
  ACTIVITY_SKILL_XP as ACTIVITY_SKILL_XP_MAP,
  EMPTY_DAY_FATIGUE_RECOVERY,
  createWeekSchedule,
  getScheduledActivityInstances,
} from "@/engine/core/calendar";
import { getActiveEquipmentBonuses } from "@/engine/finance";
import {
  markInteractionAsPlayerChoice,
  normalizeWeeklyStrategyState,
  resolveAllDelegatedDayInteractions,
  resolveDelegatedDayInteraction,
} from "@/engine/core/weeklyStrategy";
import {
  applyRegionalPresenceToObservation,
} from "@/engine/world/index";
import {
  getYouthVenuePool,
  mapVenueTypeToContext,
} from "@/engine/youth/venues";
import { recordDiscovery } from "@/engine/career/index";
import { getInteractiveActivityCompletionKey } from "@/lib/activityCompletion";
import { isDemoLimitReached } from "@/lib/demo";
import { produceWeeklyVenueObservation } from "./weeklyObservationProducer";

type SimulationChoiceId = ActivityChoiceId;

interface WeekSimulationDependencies {
  buildDaySpanInfo: (
    schedule: WeekSchedule,
  ) => Map<number, { totalDays: number; occurrenceIndex: number }>;
  buildDayInteraction: (
    activity: Activity | null,
    careerPath?: GameState["scout"]["careerPath"],
  ) => DayResult["interaction"] | undefined;
  isQualityRelevantActivity: (
    activity: Activity | null,
  ) => activity is Activity;
  rollDayActivityQuality: (
    state: GameState,
    activity: Activity,
    dayIndex: number,
  ) => ActivityQualityResult;
  resolveScoutEffectiveCountry: (
    scout: Scout,
    regionalKnowledge: GameState["regionalKnowledge"],
    currentWeek: number,
  ) => string;
  buildScoutQualityDataForState: (
    state: GameState,
    effectiveCountry?: string,
  ) => ScoutQualityData;
  isDayInteractionPending: (
    dayResult: DayResult | undefined,
  ) => boolean;
}

export function createWeekSimulationActions(
  get: GetState,
  set: SetState,
  dependencies: WeekSimulationDependencies,
) {
  const {
    buildDaySpanInfo,
    buildDayInteraction,
    isQualityRelevantActivity,
    rollDayActivityQuality,
    resolveScoutEffectiveCountry,
    buildScoutQualityDataForState,
    isDayInteractionPending,
  } = dependencies;

  return {
    // ── Day-by-day simulation actions ────────────────────────────────────────

  startWeekSimulation: () => {
    const { gameState } = get();
    if (!gameState) return;
    if (hasRepresentedCareerCompletionState(gameState)) return;

    // Advancing the deadline week consumes pending offers. Bankruptcy recovery
    // still advances time, but its schedule is forced empty so no work resolves.
    const offerExpiry = expireJobOffersAtWeekEnd(
      gameState.jobOffers,
      gameState.currentWeek,
      gameState.currentSeason,
    );
    const recoveryActive = isBankruptcyRecoveryActive(gameState.finances);
    const hasScheduledWork = getScheduledActivityInstances(gameState.schedule).length > 0;
    if (offerExpiry.expired.length > 0 || (recoveryActive && hasScheduledWork)) {
      const expiredIds = new Set(offerExpiry.expired.map((offer) => offer.id));
      const expiredCurrentRenewal = offerExpiry.expired.some((offer) =>
        Boolean(offer.renewalOfContractId)
        && offer.clubId === gameState.scout.currentClubId
        && (gameState.scout.contractEndSeason ?? Number.POSITIVE_INFINITY)
          <= gameState.currentSeason
      );
      const expiryMessages: InboxMessage[] = offerExpiry.expired.map((offer) => ({
        id: `job-expired-${offer.id}`,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
        type: "feedback",
        title: "Job Offer Expired",
        body: `${gameState.clubs[offer.clubId]?.name ?? "The club"} has filled the role. The offer is no longer available.`,
        read: false,
        actionRequired: false,
        relatedId: offer.id,
      }));
      const stateAfterExpiry: GameState = {
          ...gameState,
          jobOffers: offerExpiry.active,
          schedule:
            recoveryActive && hasScheduledWork
              ? createWeekSchedule(gameState.currentWeek, gameState.currentSeason)
              : gameState.schedule,
          inbox: [
            ...gameState.inbox.map((message) =>
              message.relatedId && expiredIds.has(message.relatedId)
                ? { ...message, read: true, actionRequired: false }
                : message,
            ),
            ...expiryMessages,
          ],
        };
      const resolvedExpiryState = expiredCurrentRenewal && gameState.finances
        ? {
            ...applyCareerPathTransition(stateAfterExpiry, "independent"),
            inbox: [
              ...stateAfterExpiry.inbox,
              {
                id: `employment-contract-ended:s${gameState.currentSeason}w${gameState.currentWeek}`,
                week: gameState.currentWeek,
                season: gameState.currentSeason,
                type: "feedback" as const,
                title: "Contract Ended",
                body: "The renewal window closed without an agreement. You are now independent and can rebuild your client book or consider another club role.",
                read: false,
                actionRequired: false,
              },
            ],
          }
        : stateAfterExpiry;
      set({
        gameState: resolvedExpiryState,
        weekSimulation: null,
      });
      get().startWeekSimulation();
      return;
    }

    // Demo limit gate
    if (isDemoLimitReached(gameState.currentSeason)) {
      set({ currentScreen: "demoEnd" as GameScreen });
      return;
    }

    // Gate: play all scheduled attendMatch fixtures interactively first
    // Youth scouts skip — they cannot attend first-team matches.
    if (gameState.scout.primarySpecialization !== "youth") {
      const pendingFixtureIds = get().getPendingMatches();
      if (pendingFixtureIds.length > 0) {
        get().startMatch(pendingFixtureIds[0]);
        return;
      }
    }

    // Build day-by-day results
    const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const rng = createRNG(`${gameState.seed}-daysim-${gameState.currentWeek}-${gameState.currentSeason}`);
    const spanInfoByDay = buildDaySpanInfo(gameState.schedule);
    const qualityByDay = new Map<number, ActivityQualityResult>();
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const activity = gameState.schedule.activities[dayIndex];
      if (!isQualityRelevantActivity(activity)) continue;
      qualityByDay.set(dayIndex, rollDayActivityQuality(gameState, activity, dayIndex));
    }

    const dayResults: DayResult[] = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const activity = gameState.schedule.activities[dayIndex];

      if (!activity) {
        dayResults.push({
          dayIndex,
          dayName: DAY_NAMES[dayIndex],
          activity: null,
          observations: [],
          playersDiscovered: 0,
          reportsWritten: [],
          profilesGenerated: 0,
          anomaliesFound: 0,
          xpGained: {},
          fatigueChange: EMPTY_DAY_FATIGUE_RECOVERY,
          narrative: "A quiet day off. You recover a little energy.",
          inboxMessages: [],
          interaction: undefined,
        });
        continue;
      }

      const spanInfo = spanInfoByDay.get(dayIndex) ?? { totalDays: 1, occurrenceIndex: 0 };
      const totalDays = spanInfo.totalDays;
      const occurrenceIndex = spanInfo.occurrenceIndex;
      const quality = qualityByDay.get(dayIndex);
      let narrative = quality?.narrative ?? "";
      if (!narrative && activity.type === "rest") {
        narrative = "You take a well-deserved rest day to recover your energy.";
      } else if (!narrative) {
        narrative = `You complete your scheduled ${activity.type} activity.`;
      }
      if (totalDays > 1) {
        narrative = `${narrative} (Day ${occurrenceIndex + 1} of ${totalDays})`;
      }

      // Get total XP from the activity type, then split across days
      const skillXp = ACTIVITY_SKILL_XP_MAP[activity.type];
      let xpGained: Partial<Record<string, number>> = {};
      if (skillXp && totalDays > 1) {
        // Split XP exactly across days so day totals match weekly totals.
        const split: Partial<Record<string, number>> = {};
        for (const [skill, xp] of Object.entries(skillXp)) {
          const base = Math.floor(xp / totalDays);
          const remainder = xp % totalDays;
          split[skill] = base + (occurrenceIndex < remainder ? 1 : 0);
        }
        xpGained = split;
      } else if (skillXp) {
        xpGained = { ...skillXp };
      }

      // Get fatigue from the activity type, split across days
      const rawFatigue = ACTIVITY_FATIGUE_COSTS_MAP[activity.type] ?? 0;
      const endurance = gameState.scout.attributes.endurance;
      const totalFatigue = rawFatigue < 0
        ? rawFatigue
        : Math.round(rawFatigue * (1 - Math.min(0.75, endurance / 40)));
      let fatigueCost = totalFatigue;
      if (totalDays > 1) {
        // Signed distribution that preserves exact total across all days.
        const abs = Math.abs(totalFatigue);
        const base = Math.floor(abs / totalDays);
        const remainder = abs % totalDays;
        const piece = base + (occurrenceIndex < remainder ? 1 : 0);
        fatigueCost = totalFatigue < 0 ? -piece : piece;
      }

      let profilesGenerated = 0;
      let anomaliesFound = 0;
      const inboxMessages: InboxMessage[] = [];
      if (activity.type === "databaseQuery") {
        profilesGenerated = rng.nextInt(2, 5);
      } else if (activity.type === "deepVideoAnalysis") {
        profilesGenerated = rng.nextInt(1, 3);
        anomaliesFound = rng.nextInt(0, 2);
      } else if (activity.type === "statsBriefing") {
        anomaliesFound = rng.nextInt(1, 3);
      } else if (activity.type === "marketInefficiency") {
        anomaliesFound = rng.nextInt(1, 4);
      } else if (activity.type === "analyticsTeamMeeting") {
        inboxMessages.push({
          id: `sim-analytics-${dayIndex}`,
          week: gameState.currentWeek,
          season: gameState.currentSeason,
          type: "feedback",
          title: "Analyst Standup Notes",
          body: "Your analysts highlighted a few leagues to prioritize this month.",
          read: false,
          actionRequired: false,
        });
      }

      dayResults.push({
        dayIndex,
        dayName: DAY_NAMES[dayIndex],
        activity,
        observations: [], // Populated by youth discovery pre-computation below
        playersDiscovered: 0,
        reportsWritten: activity.type === "writeReport" && activity.targetId ? [activity.targetId] : [],
        profilesGenerated,
        anomaliesFound,
        xpGained: xpGained as Partial<Record<import("@/engine/core/types").ScoutSkill, number>>,
        fatigueChange: fatigueCost,
        narrative,
        inboxMessages,
        interaction: buildDayInteraction(activity, gameState.scout.careerPath),
      });
    }

    // ── Youth venue discovery pre-computation ───────────────────────────
    // Process youth venues now so players see discoveries during the simulation.
    const YOUTH_VENUE_TYPES = ["schoolMatch", "grassrootsTournament", "streetFootball", "academyTrialDay", "youthFestival"] as const;
    type YouthVenueType = typeof YOUTH_VENUE_TYPES[number];
    const YOUTH_VENUE_DAILY_RANGE: Record<YouthVenueType, [number, number]> = {
      schoolMatch: [1, 2],
      grassrootsTournament: [1, 3],
      streetFootball: [1, 2],
      academyTrialDay: [1, 2],
      youthFestival: [1, 3],
    };

    const currentScout = gameState.scout;
    const effectiveScoutCountry = resolveScoutEffectiveCountry(
      currentScout,
      gameState.regionalKnowledge,
      gameState.currentWeek,
    );
    let youthVenueResults: WeekSimulationState["youthVenueResults"] | undefined;

    if (currentScout.primarySpecialization === "youth") {
      const obsRng = createRNG(`${gameState.seed}-simobs-${gameState.currentWeek}-${gameState.currentSeason}`);
      const updatedUnsignedYouth = { ...gameState.unsignedYouth };

      // The persistent pool is replenished only at season boundaries.
      // Scouting venues draw from the persistent pool. New prospects enter at
      // the season boundary, so simulating an ordinary week cannot inflate it.
      const newObservations: Record<string, Observation> = {};
      const newDiscoveries: DiscoveryRecord[] = [];
      let totalObservations = 0;
      let totalDiscoveries = 0;

      for (const instance of getScheduledActivityInstances(gameState.schedule)) {
        if (!(YOUTH_VENUE_TYPES as readonly string[]).includes(instance.activity.type)) continue;
        const venueType = instance.activity.type as YouthVenueType;
        const equipBonuses = gameState.finances?.equipment
          ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
          : { youthDiscoveryBonus: 0 };
        const youthBonus = equipBonuses.youthDiscoveryBonus ?? 0;
        const [dailyMin, dailyMax] = YOUTH_VENUE_DAILY_RANGE[venueType];
        const slotDays = [...instance.slotIndexes].sort((a, b) => a - b);

        for (const daySlot of slotDays) {
          const pool = getYouthVenuePool(
            obsRng,
            venueType,
            updatedUnsignedYouth,
            currentScout,
            undefined,
            undefined,
            youthBonus,
            gameState.currentWeek,
            undefined,
            buildScoutQualityDataForState(
              gameState,
              effectiveScoutCountry,
            ),
          );
          const quality = qualityByDay.get(daySlot);
          const discoveryMod = quality?.discoveryModifier ?? 0;
          const dayRoll = obsRng.nextInt(dailyMin, dailyMax) + discoveryMod;
          const adjustedCount = Math.max(0, Math.min(pool.length, dayRoll));
          const effectivePool = pool.slice(0, adjustedCount);
          const observations: DayResult["observations"] = [];

          for (const youth of effectivePool) {
            const existingObs = [
              ...Object.values(newObservations),
              ...Object.values(gameState.observations),
            ].filter((o) => o.playerId === youth.player.id);

            const activityInstanceId = getInteractiveActivityCompletionKey(
              instance.activity,
              daySlot,
            );
            const result = produceWeeklyVenueObservation({
              state: gameState,
              rng: obsRng,
              scout: currentScout,
              youth,
              context: mapVenueTypeToContext(venueType),
              activityType: venueType,
              venueType,
              existingObservations: existingObs,
              activityInstanceId,
              occurrenceKey: `day-${daySlot}-observation-${existingObs.length}`,
            });
            const observation = applyRegionalPresenceToObservation(
              gameState,
              result.observation,
            );

            newObservations[observation.id] = observation;
            updatedUnsignedYouth[youth.id] = result.updatedYouth;
            totalObservations++;

            const alreadyDiscovered = newDiscoveries.some((r) => r.playerId === youth.player.id)
              || (gameState.discoveryRecords ?? []).some((r: DiscoveryRecord) => r.playerId === youth.player.id);
            if (!alreadyDiscovered) {
              newDiscoveries.push(recordDiscovery(
                youth.player,
                currentScout,
                gameState.currentWeek,
                gameState.currentSeason,
              ));
              totalDiscoveries++;
            }

            const topAttrs = observation.attributeReadings
              .sort((a: { perceivedValue: number }, b: { perceivedValue: number }) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r: { attribute: string; perceivedValue: number }) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");

            observations.push({
              playerId: youth.player.id,
              playerName: `${youth.player.firstName} ${youth.player.lastName}`,
              topAttributes: topAttrs,
              age: youth.player.age,
              position: youth.player.position,
            });
          }

          const dayResult = dayResults[daySlot];
          if (!dayResult) continue;
          dayResult.observations = observations;
          dayResult.playersDiscovered = observations.filter((obs) =>
            newDiscoveries.some((d) => d.playerId === obs.playerId),
          ).length;
          if (observations.length === 0) {
            dayResult.narrative = `${dayResult.narrative} No clear standouts emerged today.`;
          } else if (dayResult.playersDiscovered >= 2) {
            dayResult.narrative = `${dayResult.narrative} A strong day produced multiple promising leads.`;
          } else {
            dayResult.narrative = `${dayResult.narrative} You leave with a few actionable notes.`;
          }
        }
      }

      if (totalObservations > 0) {
        youthVenueResults = {
          updatedUnsignedYouth,
          newObservations,
          newDiscoveries,
          totalObservations,
          totalDiscoveries,
        };
      }
    }

    // ── Preview observations for youth-focused core scouting activities ──────
    // These previews drive day-by-day interactivity (focus target selection),
    // while authoritative world-state changes still happen in advanceWeek().
    if (currentScout.primarySpecialization === "youth") {
      type PreviewVenueType = "academyTrialDay" | "youthFestival" | "schoolMatch" | "grassrootsTournament";
      type PreviewContext = "academyVisit" | "youthTournament" | "videoAnalysis";
      interface PreviewConfig {
        venueType: PreviewVenueType;
        context: PreviewContext;
        min: number;
        max: number;
      }

      const previewRng = createRNG(`${gameState.seed}-simpreview-${gameState.currentWeek}-${gameState.currentSeason}`);
      const equipBonuses = gameState.finances?.equipment
        ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
        : { youthDiscoveryBonus: 0 };
      const youthBonus = equipBonuses.youthDiscoveryBonus ?? 0;

      const previewUnsignedYouth = {
        ...(youthVenueResults?.updatedUnsignedYouth ?? gameState.unsignedYouth),
      };
      const previewDiscovered = new Set<string>();
      for (const day of dayResults) {
        for (const obs of day.observations) {
          previewDiscovered.add(obs.playerId);
        }
      }

      const getPreviewConfig = (activity: Activity): PreviewConfig | null => {
        if (activity.type === "academyVisit") {
          return { venueType: "academyTrialDay", context: "academyVisit", min: 1, max: 2 };
        }
        if (activity.type === "youthTournament") {
          return { venueType: "youthFestival", context: "youthTournament", min: 1, max: 3 };
        }
        if (activity.type === "watchVideo") {
          const venueType: PreviewVenueType =
            activity.targetId === "video-academy"
              ? "academyTrialDay"
              : activity.targetId === "video-grassroots"
                ? "grassrootsTournament"
                : activity.targetId === "video-school"
                  ? "schoolMatch"
                  : "youthFestival";
          return { venueType, context: "videoAnalysis", min: 1, max: 2 };
        }
        return null;
      };

      for (const dayResult of dayResults) {
        if (!dayResult.activity || dayResult.observations.length > 0) continue;
        const cfg = getPreviewConfig(dayResult.activity);
        if (!cfg) continue;

        const pool = getYouthVenuePool(
          previewRng,
          cfg.venueType,
          previewUnsignedYouth,
          currentScout,
          undefined,
          undefined,
          youthBonus,
          gameState.currentWeek,
          undefined,
          buildScoutQualityDataForState(
            gameState,
            effectiveScoutCountry,
          ),
        );
        const count = Math.min(pool.length, previewRng.nextInt(cfg.min, cfg.max));
        if (count === 0) continue;

        const dayObservations: DayResult["observations"] = [];
        let dayDiscoveries = 0;

        for (let i = 0; i < count; i++) {
          const youth = pool[i];
          const existingObsForYouth = Object.values(gameState.observations).filter(
            (o) => o.playerId === youth.player.id,
          );
          const previewObs = produceWeeklyVenueObservation({
            state: gameState,
            rng: previewRng,
            scout: currentScout,
            youth,
            context: cfg.context,
            activityType: dayResult.activity.type,
            venueType: cfg.venueType,
            existingObservations: existingObsForYouth,
            activityInstanceId: getInteractiveActivityCompletionKey(
              dayResult.activity,
              dayResult.dayIndex,
            ),
            occurrenceKey: `preview-day-${dayResult.dayIndex}-player-${i}`,
          });
          previewUnsignedYouth[youth.id] = previewObs.updatedYouth;

          const topAttrs = previewObs.observation.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");

          dayObservations.push({
            playerId: youth.player.id,
            playerName: `${youth.player.firstName} ${youth.player.lastName}`,
            topAttributes: topAttrs,
            age: youth.player.age,
            position: youth.player.position,
          });

          if (!previewDiscovered.has(youth.player.id)) {
            previewDiscovered.add(youth.player.id);
            dayDiscoveries++;
          }
        }

        dayResult.observations = dayObservations;
        dayResult.playersDiscovered = dayDiscoveries;
      }
    }

    set({
      weekSimulation: {
        dayResults,
        currentDay: 0,
        pendingWorldTick: false,
        focusedYouthPlayerId: undefined,
        focusedYouthPlayerIds: undefined,
        youthVenueResults,
      },
      currentScreen: "weekSimulation",
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Week Simulation — Interaction & Day Advancement
  // ══════════════════════════════════════════════════════════════════════════

  chooseSimulationInteraction: (optionId: string, focusedPlayerIds?: string[]) => {
    const { weekSimulation, gameState } = get();
    if (!weekSimulation || !gameState) return;
    const currentDay = weekSimulation.currentDay;
    const current = weekSimulation.dayResults[currentDay];
    if (!current?.interaction) return;
    if (optionId !== "scan" && optionId !== "focus" && optionId !== "network") return;

    const choice = optionId as SimulationChoiceId;
    let focusedPlayerId = current.interaction.focusedPlayerId ?? weekSimulation.focusedYouthPlayerId;
    let selectedFocusIds = [...(current.interaction.focusedPlayerIds ?? weekSimulation.focusedYouthPlayerIds ?? [])];

    if (choice === "focus") {
      const validProvidedIds = Array.from(new Set((focusedPlayerIds ?? []).filter(Boolean))).slice(0, 3);
      if (validProvidedIds.length > 0) {
        selectedFocusIds = validProvidedIds;
      }
      if (selectedFocusIds.length === 0 && !focusedPlayerId && current.observations.length > 0) {
        selectedFocusIds = [current.observations[0].playerId];
      }
      if (selectedFocusIds.length === 0 && !focusedPlayerId) {
        const priorObservedIds = weekSimulation.dayResults
          .slice(0, currentDay + 1)
          .flatMap((day) => day.observations.map((obs) => obs.playerId));
        if (priorObservedIds.length > 0) {
          const uniquePrior = Array.from(new Set(priorObservedIds));
          selectedFocusIds = uniquePrior.slice(0, current.interaction.maxFocusPlayers ?? 3);
          focusedPlayerId = selectedFocusIds[0];
        }
      }
      if (!focusedPlayerId) {
        const obsCounts = new Map<string, number>();
        for (const obs of Object.values(gameState.observations)) {
          obsCounts.set(obs.playerId, (obsCounts.get(obs.playerId) ?? 0) + 1);
        }
        if (gameState.scout.primarySpecialization === "youth") {
          const target = Object.values(gameState.unsignedYouth)
            .filter((y) => !y.placed && !y.retired)
            .sort((a, b) => {
              const aScore = (obsCounts.get(a.player.id) ?? 0) * 10 + a.buzzLevel;
              const bScore = (obsCounts.get(b.player.id) ?? 0) * 10 + b.buzzLevel;
              return bScore - aScore;
            })[0];
          focusedPlayerId = target?.player.id;
        } else {
          const topObserved = [...obsCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([playerId]) => playerId);
          if (topObserved.length > 0) {
            selectedFocusIds = topObserved.slice(0, current.interaction.maxFocusPlayers ?? 3);
            focusedPlayerId = selectedFocusIds[0];
          }
        }
      }
      if (selectedFocusIds.length === 0 && focusedPlayerId) {
        selectedFocusIds = [focusedPlayerId];
      }
      focusedPlayerId = selectedFocusIds[0] ?? focusedPlayerId;
    } else {
      selectedFocusIds = [];
    }

    let focusNarrative = "";
    if (choice === "focus") {
      const focusCount = Math.max(1, selectedFocusIds.length);
      if (focusCount === 1) {
        focusNarrative = "You lock onto one prospect for maximum depth and repeated reads.";
      } else if (focusCount === 2) {
        focusNarrative = "You split attention across two prospects, balancing breadth and depth.";
      } else {
        focusNarrative = "You track three prospects at once, accepting shallower depth per player.";
      }
    }

    const narrativeSuffix: Record<SimulationChoiceId, string> = {
      scan: "You decide to scan broadly and maximize exposure to different players.",
      focus: focusNarrative || "You narrow your focus to build deeper confidence on standout prospects.",
      network: "You spend more time gathering context from people around the match environment.",
    };

    const updatedDayResult: DayResult = {
      ...current,
      narrative: `${current.narrative}\n\n${narrativeSuffix[choice]}`,
      interaction: markInteractionAsPlayerChoice({
        ...current.interaction,
        selectedOptionId: choice,
        focusedPlayerId,
        focusedPlayerIds: selectedFocusIds,
      }),
    };

    const updatedDayResults = [...weekSimulation.dayResults];
    updatedDayResults[currentDay] = updatedDayResult;

    set({
      weekSimulation: {
        ...weekSimulation,
        dayResults: updatedDayResults,
        focusedYouthPlayerId: focusedPlayerId ?? weekSimulation.focusedYouthPlayerId,
        focusedYouthPlayerIds: selectedFocusIds.length > 0
          ? selectedFocusIds
          : weekSimulation.focusedYouthPlayerIds,
      },
    });
  },

  advanceDay: async () => {
    const sim = get().weekSimulation;
    if (!sim || sim.currentDay >= 7) return;
    let current = sim.dayResults[sim.currentDay];

    // A skipped call follows the player's persisted standing order. The same
    // pure resolver is used by fast-forward, keeping manual skips and batch
    // advancement equivalent.
    if (isDayInteractionPending(current) && current?.interaction) {
      const gameState = get().gameState;
      const policyId = normalizeWeeklyStrategyState(
        gameState?.weeklyStrategy,
        gameState?.currentWeek ?? 1,
        gameState?.currentSeason ?? 1,
      ).delegationPolicyId;
      current = resolveDelegatedDayInteraction(current, policyId);
      const updatedDayResults = [...sim.dayResults];
      updatedDayResults[sim.currentDay] = current;
      set({ weekSimulation: { ...sim, dayResults: updatedDayResults } });
    }

    // Re-read sim after possible auto-resolve update
    const updatedSim = get().weekSimulation;
    if (!updatedSim) return;

    const nextDay = updatedSim.currentDay + 1;
    const isDone = nextDay >= updatedSim.dayResults.length;

    if (isDone) {
      // All days shown — run the full advanceWeek to process everything
      set({
        weekSimulation: {
          ...updatedSim,
          currentDay: 7,
          pendingWorldTick: true,
        },
      });
      // Trigger the actual week advancement
      const sourceSeason = get().gameState?.currentSeason;
      const sourceWeek = get().gameState?.currentWeek;
      await get().advanceWeekAsync();
      const committedState = get().gameState;
      const advanced = committedState == null
        || committedState.currentSeason !== sourceSeason
        || committedState.currentWeek !== sourceWeek;
      if (!advanced) return;
      const { currentScreen } = get();
      if (currentScreen === "weekSimulation") {
        set({ weekSimulation: null, currentScreen: "calendar" });
      } else {
        set({ weekSimulation: null });
      }
    } else {
      set({
        weekSimulation: {
          ...updatedSim,
          currentDay: nextDay,
        },
      });
    }
  },

  fastForwardWeek: async () => {
    const sim = get().weekSimulation;
    if (!sim) return;

    const gameState = get().gameState;
    const policyId = normalizeWeeklyStrategyState(
      gameState?.weeklyStrategy,
      gameState?.currentWeek ?? 1,
      gameState?.currentSeason ?? 1,
    ).delegationPolicyId;
    const resolvedDayResults = resolveAllDelegatedDayInteractions(
      sim.dayResults,
      policyId,
    );

    set({
      weekSimulation: {
        ...sim,
        dayResults: resolvedDayResults,
        currentDay: 7,
        pendingWorldTick: true,
      },
    });

    // Skip to end and run the full advanceWeek
    const sourceSeason = get().gameState?.currentSeason;
    const sourceWeek = get().gameState?.currentWeek;
    await get().advanceWeekAsync();
    const committedState = get().gameState;
    const advanced = committedState == null
      || committedState.currentSeason !== sourceSeason
      || committedState.currentWeek !== sourceWeek;
    if (!advanced) return;
    const { currentScreen } = get();
    if (currentScreen === "weekSimulation") {
      set({ weekSimulation: null, currentScreen: "calendar" });
    } else {
      set({ weekSimulation: null });
    }
  },

  };
}
