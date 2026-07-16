import type {
  Activity,
  GameState,
  InboxMessage,
  Observation,
  ObservationContext,
  Player,
  Scout,
  TournamentEvent,
  UnsignedYouth,
} from "@/engine/core/types";
import type { ActivityQualityResult } from "@/engine/core/activityQuality";
import { getActiveEquipmentBonuses } from "@/engine/finance";
import { createRNG, type RNG } from "@/engine/rng";
import { getScheduledActivityInstances, processCompletedWeek } from "@/engine/core/calendar";
import { getYouthVenuePool } from "@/engine/youth/venues";
import { processTrialOutcome } from "@/engine/firstTeam";
import { recordDiscovery } from "@/engine/career";
import { buildScoutQualityDataForState } from "./weeklySimulationSupport";
import {
  produceWeeklyPlayerObservation,
  produceWeeklyVenueObservation,
} from "./weeklyObservationProducer";

type CompletedWeekResult = ReturnType<typeof processCompletedWeek>;
type EquipmentBonuses = ReturnType<typeof getActiveEquipmentBonuses>;

export interface WeeklyProfessionalObservationInput {
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
  playersDiscovered: number;
  observationsGenerated: number;
  allPlayers: readonly Player[];
  extraAttributesPerSession: number;
  playerEvidence: (playerId: string) => Observation[];
  recordObservation: (observation: Observation) => void;
  observedPlayerIds: Set<string>;
  adjustedRange: (minimum: number, maximum: number, modifier: number) => [number, number];
  discoveryModifier: (activityType: Activity["type"]) => number;
  relationshipModifier: (activityType: Activity["type"]) => number;
  reportQualityModifier: (activityType: Activity["type"]) => number;
  focusDepth: (activityType: Activity["type"]) => number;
  focusPlayers: (activityType: Activity["type"]) => string[];
  prioritizeYouth: (pool: UnsignedYouth[], activityType: Activity["type"]) => UnsignedYouth[];
  prioritizePlayers: (pool: Player[], activityType: Activity["type"]) => Player[];
  tierLabels: Readonly<Record<string, string>>;
}
export interface WeeklyProfessionalObservationResult {
  state: GameState;
  discoveries: NonNullable<GameState["discoveryRecords"]>;
  messages: InboxMessage[];
  playersDiscovered: number;
  observationsGenerated: number;
}

export function processWeeklyProfessionalObservationActivities(
  input: WeeklyProfessionalObservationInput,
): WeeklyProfessionalObservationResult {
  const gameState = input.sourceState;
  let stateWithScheduleApplied = input.state;
  const {
    weekResult,
    scout: currentScout,
    effectiveScoutCountry,
    rng: actObsRng,
    allPlayers,
    playerEvidence,
    recordObservation,
    observedPlayerIds,
    adjustedRange,
    focusDepth,
    focusPlayers,
  } = input;
  const weekEquipBonuses = input.equipmentBonuses;
  const qualityMap = input.qualityByType;
  const extraAttrsPerSession = input.extraAttributesPerSession;
  let actDiscoveries = [...input.discoveries];
  const actObsMessages = [...input.messages];
  let weekPlayersDiscovered = input.playersDiscovered;
  let weekObservationsGenerated = input.observationsGenerated;
  const choiceDiscoveryMod = input.discoveryModifier;
  const choiceRelationshipMod = input.relationshipModifier;
  const choiceReportQualityMod = input.reportQualityModifier;
  const prioritizeFocusedYouth = input.prioritizeYouth;
  const prioritizeFocusedPlayers = input.prioritizePlayers;
  const TIER_LABELS = input.tierLabels;

  // Every automatic observation is routed through the shared deterministic
  // situation producer before perception runs. Keep these positional adapters
  // local so the mature activity handlers below cannot accidentally bypass it.
  const observePlayerLight = (
    observationRng: RNG,
    player: Player,
    scout: Scout,
    context: ObservationContext,
    existingObservations: Observation[],
    extraAttributes?: number,
  ): Observation => produceWeeklyPlayerObservation({
    state: stateWithScheduleApplied,
    rng: observationRng,
    player,
    scout,
    context,
    existingObservations,
    extraAttributes,
  });
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

  // --- Academy Visit: base 2-3, modified by quality ---
  // Youth scouts use the proper youth venue system to draw from unsignedYouth.
  if (weekResult.academyVisitsExecuted > 0) {
    const qr = qualityMap.get("academyVisit");
    const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("academyVisit");
    const [rangeMin, rangeMax] = adjustedRange(2, 3, discMod);
    const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

    if (currentScout.primarySpecialization === "youth") {
      // Youth scouts: use getYouthVenuePool to draw from unsigned youth
      const venuePool = getYouthVenuePool(
        actObsRng,
        "academyTrialDay", // academyVisit maps to academyTrialDay venue
        stateWithScheduleApplied.unsignedYouth,
        currentScout,
        undefined,
        undefined,
        undefined,
        stateWithScheduleApplied.currentWeek,
        undefined,
        buildScoutQualityDataForState(
          stateWithScheduleApplied,
          effectiveScoutCountry,
        ),
      );
      const prioritizedPool = prioritizeFocusedYouth([...venuePool], "academyVisit");
      const count = Math.min(prioritizedPool.length, actObsRng.nextInt(rangeMin, rangeMax));
      for (let i = 0; i < count; i++) {
        const youth = prioritizedPool[i];
        const existingObsForYouth = playerEvidence(youth.player.id);
        const result = processVenueObservation(
          actObsRng, currentScout, youth, "academyVisit",
          existingObsForYouth, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason,
        );
        recordObservation(result.observation);
        weekObservationsGenerated++;
        const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
        if (!alreadyDiscovered) {
          actDiscoveries = [...actDiscoveries, recordDiscovery(youth.player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
          weekPlayersDiscovered++;
        }
        const topAttrs = result.observation.attributeReadings
          .sort((a, b) => b.perceivedValue - a.perceivedValue)
          .slice(0, 3)
          .map((r) => `${r.attribute} ${r.perceivedValue}`)
          .join(", ");
        const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
        actObsMessages.push({
          id: `obs-academy-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `Academy Visit${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
          body: `${narrativePrefix}You observed ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country} during an academy visit. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
          read: false,
          actionRequired: false,
          relatedId: youth.player.id,
          relatedEntityType: "player" as const,
        });
      }

      const focusTargetIds = focusPlayers("academyVisit");
      const focusRepeats = focusDepth("academyVisit");
      if (focusTargetIds.length > 0 && focusRepeats > 0) {
        const focusedYouthList = focusTargetIds
          .map((id) =>
            prioritizedPool.find((y) => y.player.id === id)
            ?? Object.values(stateWithScheduleApplied.unsignedYouth).find((y) => y.player.id === id),
          )
          .filter((y): y is UnsignedYouth => !!y);

        if (focusedYouthList.length > 0) {
          for (let repeat = 0; repeat < focusRepeats; repeat++) {
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
            weekObservationsGenerated++;
          }
        }
      }
    } else {
      // Non-youth scouts: existing behaviour using signed players
      const youthPool = allPlayers.filter(
        (p) => p.age <= 21 && !observedPlayerIds.has(p.id),
      );
      const prioritizedPlayers = prioritizeFocusedPlayers(
        actObsRng.shuffle([...youthPool]),
        "academyVisit",
      );
      const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));

      for (let i = 0; i < count; i++) {
        const player = prioritizedPlayers[i];

        const obs = observePlayerLight(actObsRng, player, currentScout, "academyVisit", playerEvidence(player.id), extraAttrsPerSession);
        obs.week = stateWithScheduleApplied.currentWeek;
        obs.season = stateWithScheduleApplied.currentSeason;
        recordObservation(obs);
        observedPlayerIds.add(player.id);
        weekObservationsGenerated++;

        const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
        if (!alreadyDiscovered) {
          actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
          weekPlayersDiscovered++;
        }

        const topAttrs = obs.attributeReadings
          .sort((a, b) => b.perceivedValue - a.perceivedValue)
          .slice(0, 3)
          .map((r) => `${r.attribute} ${r.perceivedValue}`)
          .join(", ");
        const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
        const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
        actObsMessages.push({
          id: `obs-academy-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `Academy Visit${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
          body: `${narrativePrefix}You observed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} during an academy visit. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
          read: false,
          actionRequired: false,
          relatedId: player.id,
          relatedEntityType: "player" as const,
        });
      }

      const focusTargetIds = focusPlayers("academyVisit");
      const focusRepeats = focusDepth("academyVisit");
      if (focusTargetIds.length > 0 && focusRepeats > 0) {
        const focusedPlayers = focusTargetIds
          .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
          .filter((p): p is Player => !!p);

        for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
          const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
          const focusObs = observePlayerLight(
            actObsRng,
            focusedPlayer,
            currentScout,
            "academyVisit",
            playerEvidence(focusedPlayer.id),
            extraAttrsPerSession,
          );
          focusObs.week = stateWithScheduleApplied.currentWeek;
          focusObs.season = stateWithScheduleApplied.currentSeason;
          recordObservation(focusObs);
          observedPlayerIds.add(focusedPlayer.id);
          weekObservationsGenerated++;
        }
      }
    }
  }

  // --- Youth Tournament: base 3-5, modified by quality ---
  // Youth scouts use the proper youth venue system to draw from unsignedYouth.
  if (weekResult.youthTournamentsExecuted > 0) {
    const qr = qualityMap.get("youthTournament");
    const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("youthTournament");
    const [rangeMin, rangeMax] = adjustedRange(3, 5, discMod);
    const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

    if (currentScout.primarySpecialization === "youth") {
      // Youth scouts: use getYouthVenuePool with youthFestival venue type
      const venuePool = getYouthVenuePool(
        actObsRng,
        "youthFestival", // youthTournament maps to youthFestival venue
        stateWithScheduleApplied.unsignedYouth,
        currentScout,
        undefined,
        undefined,
        undefined,
        stateWithScheduleApplied.currentWeek,
        undefined,
        buildScoutQualityDataForState(
          stateWithScheduleApplied,
          effectiveScoutCountry,
        ),
      );
      const prioritizedPool = prioritizeFocusedYouth([...venuePool], "youthTournament");
      const count = Math.min(prioritizedPool.length, actObsRng.nextInt(rangeMin, rangeMax));
      for (let i = 0; i < count; i++) {
        const youth = prioritizedPool[i];
        const existingObsForYouth = playerEvidence(youth.player.id);
        const result = processVenueObservation(
          actObsRng, currentScout, youth, "youthTournament",
          existingObsForYouth, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason,
        );
        recordObservation(result.observation);
        weekObservationsGenerated++;
        const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
        if (!alreadyDiscovered) {
          actDiscoveries = [...actDiscoveries, recordDiscovery(youth.player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
          weekPlayersDiscovered++;
        }
        const topAttrs = result.observation.attributeReadings
          .sort((a, b) => b.perceivedValue - a.perceivedValue)
          .slice(0, 3)
          .map((r) => `${r.attribute} ${r.perceivedValue}`)
          .join(", ");
        const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
        actObsMessages.push({
          id: `obs-tournament-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `Youth Tournament${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
          body: `${narrativePrefix}You spotted ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country} at a youth tournament. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
          read: false,
          actionRequired: false,
          relatedId: youth.player.id,
          relatedEntityType: "player" as const,
        });
      }

      const focusTargetIds = focusPlayers("youthTournament");
      const focusRepeats = focusDepth("youthTournament");
      if (focusTargetIds.length > 0 && focusRepeats > 0) {
        const focusedYouthList = focusTargetIds
          .map((id) =>
            prioritizedPool.find((y) => y.player.id === id)
            ?? Object.values(stateWithScheduleApplied.unsignedYouth).find((y) => y.player.id === id),
          )
          .filter((y): y is UnsignedYouth => !!y);

        if (focusedYouthList.length > 0) {
          for (let repeat = 0; repeat < focusRepeats; repeat++) {
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
            weekObservationsGenerated++;
          }
        }
      }
    } else {
      // Non-youth scouts: existing behaviour using signed players
      const youthPool = allPlayers.filter(
        (p) => p.age <= 21 && !observedPlayerIds.has(p.id),
      );
      const prioritizedPlayers = prioritizeFocusedPlayers(
        actObsRng.shuffle([...youthPool]),
        "youthTournament",
      );
      const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));

      for (let i = 0; i < count; i++) {
        const player = prioritizedPlayers[i];

        const obs = observePlayerLight(actObsRng, player, currentScout, "youthTournament", playerEvidence(player.id), extraAttrsPerSession);
        obs.week = stateWithScheduleApplied.currentWeek;
        obs.season = stateWithScheduleApplied.currentSeason;
        recordObservation(obs);
        observedPlayerIds.add(player.id);
        weekObservationsGenerated++;

        const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
        if (!alreadyDiscovered) {
          actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
          weekPlayersDiscovered++;
        }

        const topAttrs = obs.attributeReadings
          .sort((a, b) => b.perceivedValue - a.perceivedValue)
          .slice(0, 3)
          .map((r) => `${r.attribute} ${r.perceivedValue}`)
          .join(", ");
        const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
        const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
        actObsMessages.push({
          id: `obs-tournament-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `Youth Tournament${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
          body: `${narrativePrefix}You spotted ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} at a youth tournament. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
          read: false,
          actionRequired: false,
          relatedId: player.id,
          relatedEntityType: "player" as const,
        });
      }

      const focusTargetIds = focusPlayers("youthTournament");
      const focusRepeats = focusDepth("youthTournament");
      if (focusTargetIds.length > 0 && focusRepeats > 0) {
        const focusedPlayers = focusTargetIds
          .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
          .filter((p): p is Player => !!p);

        for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
          const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
          const focusObs = observePlayerLight(
            actObsRng,
            focusedPlayer,
            currentScout,
            "youthTournament",
            playerEvidence(focusedPlayer.id),
            extraAttrsPerSession,
          );
          focusObs.week = stateWithScheduleApplied.currentWeek;
          focusObs.season = stateWithScheduleApplied.currentSeason;
          recordObservation(focusObs);
          observedPlayerIds.add(focusedPlayer.id);
          weekObservationsGenerated++;
        }
      }
    }
  }

  // --- Training Visit: base 1-2, modified by quality ---
  if (weekResult.trainingVisitsExecuted > 0) {
    const qr = qualityMap.get("trainingVisit");
    const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("trainingVisit");
    const [rangeMin, rangeMax] = adjustedRange(1, 2, discMod);
    const clubId = currentScout.currentClubId;
    const candidatePool = clubId
      ? allPlayers.filter((p) => p.clubId === clubId)
      : allPlayers;
    const pool = candidatePool.length > 0 ? [...candidatePool] : [...allPlayers];
    const prioritizedPlayers = prioritizeFocusedPlayers(
      actObsRng.shuffle(pool),
      "trainingVisit",
    );
    const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
    const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

    for (let i = 0; i < count; i++) {
      const player = prioritizedPlayers[i];

      const obs = observePlayerLight(actObsRng, player, currentScout, "trainingGround", playerEvidence(player.id), extraAttrsPerSession);
      obs.week = stateWithScheduleApplied.currentWeek;
      obs.season = stateWithScheduleApplied.currentSeason;
      recordObservation(obs);
      observedPlayerIds.add(player.id);
      weekObservationsGenerated++;

      const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
      if (!alreadyDiscovered) {
        actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
        weekPlayersDiscovered++;
      }

      const topAttrs = obs.attributeReadings
        .sort((a, b) => b.perceivedValue - a.perceivedValue)
        .slice(0, 3)
        .map((r) => `${r.attribute} ${r.perceivedValue}`)
        .join(", ");
      const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
      const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
      actObsMessages.push({
        id: `obs-training-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "feedback" as const,
        title: `Training Visit${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
        body: `${narrativePrefix}You observed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} during training. ${obs.attributeReadings.length} attributes assessed with high accuracy. Notable: ${topAttrs}.`,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "player" as const,
      });
    }

    const focusTargetIds = focusPlayers("trainingVisit");
    const focusRepeats = focusDepth("trainingVisit");
    if (focusTargetIds.length > 0 && focusRepeats > 0) {
      const focusedPlayers = focusTargetIds
        .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
        .filter((p): p is Player => !!p);

      for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
        const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
        const focusObs = observePlayerLight(
          actObsRng,
          focusedPlayer,
          currentScout,
          "trainingGround",
          playerEvidence(focusedPlayer.id),
          extraAttrsPerSession,
        );
        focusObs.week = stateWithScheduleApplied.currentWeek;
        focusObs.season = stateWithScheduleApplied.currentSeason;
        recordObservation(focusObs);
        observedPlayerIds.add(focusedPlayer.id);
        weekObservationsGenerated++;
      }
    }
  }

  // --- Video Analysis: base 1-2, modified by quality ---
  if (weekResult.videoSessionsExecuted > 0) {
    // Equipment videoConfidence bonus: boost confidence on video-sourced observations
    const videoConfBoost = weekEquipBonuses?.videoConfidence ?? 0;
    const qr = qualityMap.get("watchVideo");
    const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("watchVideo");
    const [rangeMin, rangeMax] = adjustedRange(1, 2, discMod);
    const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
    const scheduledVideoActivities = getScheduledActivityInstances(stateWithScheduleApplied.schedule)
      .filter((entry) => entry.activity.type === "watchVideo")
      .map((entry) => entry.activity);

    if (currentScout.primarySpecialization === "youth") {
      // Youth scouts: each scheduled video choice maps to its own youth venue pool
      const venueMapping: Record<string, string> = {
        "video-academy": "academyTrialDay",
        "video-grassroots": "grassrootsTournament",
        "video-school": "schoolMatch",
      };
      let updatedUnsignedYouthVideo = { ...stateWithScheduleApplied.unsignedYouth };
      scheduledVideoActivities.forEach((videoActivity, videoIdx) => {
        const venueType = (venueMapping[videoActivity.targetId ?? ""] ?? "youthFestival") as
          "academyTrialDay" | "grassrootsTournament" | "schoolMatch" | "youthFestival";
        const venuePool = getYouthVenuePool(
          actObsRng,
          venueType,
          updatedUnsignedYouthVideo,
          currentScout,
          undefined,
          undefined,
          undefined,
          stateWithScheduleApplied.currentWeek,
          undefined,
          buildScoutQualityDataForState(
            stateWithScheduleApplied,
            effectiveScoutCountry,
          ),
        );
        const prioritizedPool = prioritizeFocusedYouth([...venuePool], "watchVideo");
        const count = Math.min(prioritizedPool.length, actObsRng.nextInt(rangeMin, rangeMax));

        for (let i = 0; i < count; i++) {
          const youth = prioritizedPool[i];
          const existingObsForYouth = playerEvidence(youth.player.id);
          const result = processVenueObservation(
            actObsRng, currentScout, youth, "videoAnalysis",
            existingObsForYouth, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason,
          );
          // Apply equipment videoConfidence boost
          if (videoConfBoost > 0) {
            result.observation.attributeReadings = result.observation.attributeReadings.map((r) => ({
              ...r,
              confidence: Math.min(1, r.confidence + videoConfBoost),
            }));
          }
          recordObservation(result.observation);
          weekObservationsGenerated++;
          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(youth.player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }
          // Smaller visibility/buzz boost for video vs physical venue
          const updatedYouth = updatedUnsignedYouthVideo[youth.id];
          if (updatedYouth) {
            updatedUnsignedYouthVideo = {
              ...updatedUnsignedYouthVideo,
              [youth.id]: {
                ...updatedYouth,
                visibility: Math.min(100, updatedYouth.visibility + 2),
                buzzLevel: Math.min(100, updatedYouth.buzzLevel + 2),
                discoveredBy: updatedYouth.discoveredBy.includes(currentScout.id)
                  ? updatedYouth.discoveredBy
                  : [...updatedYouth.discoveredBy, currentScout.id],
              },
            };
          }
          const topAttrs = result.observation.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const narrativePrefix = qr && videoIdx === 0 && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-video-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}-v${videoIdx}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Video Analysis${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
            body: `${narrativePrefix}You reviewed footage of ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country}. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: youth.player.id,
            relatedEntityType: "player" as const,
          });
        }
      });

      const focusTargetIds = focusPlayers("watchVideo");
      const focusRepeats = focusDepth("watchVideo");
      if (focusTargetIds.length > 0 && focusRepeats > 0) {
        const focusedYouthList = focusTargetIds
          .map((id) => Object.values(updatedUnsignedYouthVideo).find((y) => y.player.id === id))
          .filter((y): y is UnsignedYouth => !!y);

        if (focusedYouthList.length > 0) {
          for (let repeat = 0; repeat < focusRepeats; repeat++) {
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
            weekObservationsGenerated++;
          }
        }
      }
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        unsignedYouth: updatedUnsignedYouthVideo,
      };
    } else {
      // Non-youth scouts: existing senior player video analysis
      const previouslyObserved = allPlayers.filter((p) => observedPlayerIds.has(p.id));
      const pool = previouslyObserved.length > 0 ? [...previouslyObserved] : [...allPlayers];
      const prioritizedPlayers = prioritizeFocusedPlayers(
        actObsRng.shuffle(pool),
        "watchVideo",
      );
      const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));

      for (let i = 0; i < count; i++) {
        const player = prioritizedPlayers[i];

        const obs = observePlayerLight(actObsRng, player, currentScout, "videoAnalysis", playerEvidence(player.id), extraAttrsPerSession);
        obs.week = stateWithScheduleApplied.currentWeek;
        obs.season = stateWithScheduleApplied.currentSeason;
        // Apply equipment videoConfidence boost
        if (videoConfBoost > 0) {
          obs.attributeReadings = obs.attributeReadings.map((r) => ({
            ...r,
            confidence: Math.min(1, r.confidence + videoConfBoost),
          }));
        }
        recordObservation(obs);
        observedPlayerIds.add(player.id);
        weekObservationsGenerated++;

        const topAttrs = obs.attributeReadings
          .sort((a, b) => b.perceivedValue - a.perceivedValue)
          .slice(0, 3)
          .map((r) => `${r.attribute} ${r.perceivedValue}`)
          .join(", ");
        const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
        actObsMessages.push({
          id: `obs-video-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `Video Analysis${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
          body: `${narrativePrefix}You reviewed video footage of ${player.firstName} ${player.lastName} (${player.position}). ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}. This supplements your existing observations.`,
          read: false,
          actionRequired: false,
          relatedId: player.id,
          relatedEntityType: "player" as const,
        });
      }

      const focusTargetIds = focusPlayers("watchVideo");
      const focusRepeats = focusDepth("watchVideo");
      if (focusTargetIds.length > 0 && focusRepeats > 0) {
        const focusedPlayers = focusTargetIds
          .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
          .filter((p): p is Player => !!p);

        for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
          const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
          const focusObs = observePlayerLight(
            actObsRng,
            focusedPlayer,
            currentScout,
            "videoAnalysis",
            playerEvidence(focusedPlayer.id),
            extraAttrsPerSession,
          );
          focusObs.week = stateWithScheduleApplied.currentWeek;
          focusObs.season = stateWithScheduleApplied.currentSeason;
          recordObservation(focusObs);
          observedPlayerIds.add(focusedPlayer.id);
          weekObservationsGenerated++;
        }
      }
    }
  }

  // --- Reserve Match: observe 2-4 fringe players from scout's own club ---
  if (weekResult.reserveMatchesExecuted > 0) {
    const qr = qualityMap.get("reserveMatch");
    const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("reserveMatch");
    const [rangeMin, rangeMax] = adjustedRange(2, 4, discMod);
    const clubId = currentScout.currentClubId;
    const candidatePool = clubId
      ? allPlayers.filter((p) => p.clubId === clubId && !observedPlayerIds.has(p.id))
      : allPlayers.filter((p) => !observedPlayerIds.has(p.id));
    const pool = candidatePool.length > 0 ? [...candidatePool] : [...allPlayers.filter((p) => !observedPlayerIds.has(p.id))];
    const prioritizedPlayers = prioritizeFocusedPlayers(
      actObsRng.shuffle(pool),
      "reserveMatch",
    );
    const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
    const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

    for (let i = 0; i < count; i++) {
      const player = prioritizedPlayers[i];

      const obs = observePlayerLight(actObsRng, player, currentScout, "reserveMatch", playerEvidence(player.id), extraAttrsPerSession);
      obs.week = stateWithScheduleApplied.currentWeek;
      obs.season = stateWithScheduleApplied.currentSeason;
      recordObservation(obs);
      observedPlayerIds.add(player.id);
      weekObservationsGenerated++;

      const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
      if (!alreadyDiscovered) {
        actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
        weekPlayersDiscovered++;
      }

      const topAttrs = obs.attributeReadings
        .sort((a, b) => b.perceivedValue - a.perceivedValue)
        .slice(0, 3)
        .map((r) => `${r.attribute} ${r.perceivedValue}`)
        .join(", ");
      const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
      const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
      actObsMessages.push({
        id: `obs-reserve-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "feedback" as const,
        title: `Reserve Match${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
        body: `${narrativePrefix}You observed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} in a reserve fixture. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "player" as const,
      });
    }

    const focusTargetIds = focusPlayers("reserveMatch");
    const focusRepeats = focusDepth("reserveMatch");
    if (focusTargetIds.length > 0 && focusRepeats > 0) {
      const focusedPlayers = focusTargetIds
        .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
        .filter((p): p is Player => !!p);
      for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
        const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
        const focusObs = observePlayerLight(
          actObsRng,
          focusedPlayer,
          currentScout,
          "reserveMatch",
          playerEvidence(focusedPlayer.id),
          extraAttrsPerSession,
        );
        focusObs.week = stateWithScheduleApplied.currentWeek;
        focusObs.season = stateWithScheduleApplied.currentSeason;
        recordObservation(focusObs);
        observedPlayerIds.add(focusedPlayer.id);
        weekObservationsGenerated++;
      }
    }
  }

  // --- Scouting Mission: observe 4-6 players across one league ---
  if (weekResult.scoutingMissionsExecuted > 0) {
    const qr = qualityMap.get("scoutingMission");
    const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("scoutingMission");
    const [rangeMin, rangeMax] = adjustedRange(4, 6, discMod);
    // Pick players from a random league's clubs (prefer scout's territory)
    const leagueIds = Object.keys(stateWithScheduleApplied.leagues);
    const targetLeagueId = leagueIds.length > 0
      ? leagueIds[actObsRng.nextInt(0, leagueIds.length - 1)]
      : null;
    const targetLeague = targetLeagueId ? stateWithScheduleApplied.leagues[targetLeagueId] : null;
    const leagueClubIds = targetLeague ? new Set(targetLeague.clubIds) : new Set<string>();
    const pool = (targetLeague && leagueClubIds.size > 0
      ? allPlayers.filter((p) => leagueClubIds.has(p.clubId) && !observedPlayerIds.has(p.id))
      : allPlayers.filter((p) => !observedPlayerIds.has(p.id))
    ).slice();
    const prioritizedPlayers = prioritizeFocusedPlayers(
      actObsRng.shuffle(pool),
      "scoutingMission",
    );
    const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
    const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

    for (let i = 0; i < count; i++) {
      const player = prioritizedPlayers[i];

      const obs = observePlayerLight(actObsRng, player, currentScout, "liveMatch", playerEvidence(player.id), extraAttrsPerSession);
      obs.week = stateWithScheduleApplied.currentWeek;
      obs.season = stateWithScheduleApplied.currentSeason;
      recordObservation(obs);
      observedPlayerIds.add(player.id);
      weekObservationsGenerated++;

      const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
      if (!alreadyDiscovered) {
        actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
        weekPlayersDiscovered++;
      }

      const topAttrs = obs.attributeReadings
        .sort((a, b) => b.perceivedValue - a.perceivedValue)
        .slice(0, 3)
        .map((r) => `${r.attribute} ${r.perceivedValue}`)
        .join(", ");
      const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
      const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
      actObsMessages.push({
        id: `obs-mission-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "feedback" as const,
        title: `Scouting Mission${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
        body: `${narrativePrefix}You spotted ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} during a scouting mission. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "player" as const,
      });
    }

    const focusTargetIds = focusPlayers("scoutingMission");
    const focusRepeats = focusDepth("scoutingMission");
    if (focusTargetIds.length > 0 && focusRepeats > 0) {
      const focusedPlayers = focusTargetIds
        .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
        .filter((p): p is Player => !!p);
      for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
        const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
        const focusObs = observePlayerLight(
          actObsRng,
          focusedPlayer,
          currentScout,
          "liveMatch",
          playerEvidence(focusedPlayer.id),
          extraAttrsPerSession,
        );
        focusObs.week = stateWithScheduleApplied.currentWeek;
        focusObs.season = stateWithScheduleApplied.currentSeason;
        recordObservation(focusObs);
        observedPlayerIds.add(focusedPlayer.id);
        weekObservationsGenerated++;
      }
    }
  }

  // --- Opposition Analysis: observe 2-3 players from an opposing team ---
  if (weekResult.oppositionAnalysesExecuted > 0) {
    const qr = qualityMap.get("oppositionAnalysis");
    const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("oppositionAnalysis");
    const [rangeMin, rangeMax] = adjustedRange(2, 3, discMod);
    // Pick a random opposing club (any club that is not the scout's own)
    const clubIds = Object.keys(stateWithScheduleApplied.clubs).filter(
      (id) => id !== currentScout.currentClubId,
    );
    const targetClubId = clubIds.length > 0
      ? clubIds[actObsRng.nextInt(0, clubIds.length - 1)]
      : null;
    const pool = (targetClubId
      ? allPlayers.filter((p) => p.clubId === targetClubId && !observedPlayerIds.has(p.id))
      : allPlayers.filter((p) => !observedPlayerIds.has(p.id))
    ).slice();
    const prioritizedPlayers = prioritizeFocusedPlayers(
      actObsRng.shuffle(pool),
      "oppositionAnalysis",
    );
    const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
    const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

    for (let i = 0; i < count; i++) {
      const player = prioritizedPlayers[i];

      const obs = observePlayerLight(actObsRng, player, currentScout, "oppositionAnalysis", playerEvidence(player.id), extraAttrsPerSession);
      obs.week = stateWithScheduleApplied.currentWeek;
      obs.season = stateWithScheduleApplied.currentSeason;
      recordObservation(obs);
      observedPlayerIds.add(player.id);
      weekObservationsGenerated++;

      const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
      if (!alreadyDiscovered) {
        actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
        weekPlayersDiscovered++;
      }

      const topAttrs = obs.attributeReadings
        .sort((a, b) => b.perceivedValue - a.perceivedValue)
        .slice(0, 3)
        .map((r) => `${r.attribute} ${r.perceivedValue}`)
        .join(", ");
      const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
      const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
      actObsMessages.push({
        id: `obs-opposition-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "feedback" as const,
        title: `Opposition Analysis${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
        body: `${narrativePrefix}You analysed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} ahead of a fixture. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "player" as const,
      });
    }

    const focusTargetIds = focusPlayers("oppositionAnalysis");
    const focusRepeats = focusDepth("oppositionAnalysis");
    if (focusTargetIds.length > 0 && focusRepeats > 0) {
      const focusedPlayers = focusTargetIds
        .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
        .filter((p): p is Player => !!p);
      for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
        const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
        const focusObs = observePlayerLight(
          actObsRng,
          focusedPlayer,
          currentScout,
          "oppositionAnalysis",
          playerEvidence(focusedPlayer.id),
          extraAttrsPerSession,
        );
        focusObs.week = stateWithScheduleApplied.currentWeek;
        focusObs.season = stateWithScheduleApplied.currentSeason;
        recordObservation(focusObs);
        observedPlayerIds.add(focusedPlayer.id);
        weekObservationsGenerated++;
      }
    }
  }

  // --- Agent Showcase: observe 2-3 players presented by agents ---
  if (weekResult.agentShowcasesExecuted > 0) {
    const qr = qualityMap.get("agentShowcase");
    const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("agentShowcase");
    const [rangeMin, rangeMax] = adjustedRange(2, 3, discMod);
    const pool = allPlayers.filter((p) => !observedPlayerIds.has(p.id)).slice();
    const prioritizedPlayers = prioritizeFocusedPlayers(
      actObsRng.shuffle(pool),
      "agentShowcase",
    );
    const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
    const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

    for (let i = 0; i < count; i++) {
      const player = prioritizedPlayers[i];

      const obs = observePlayerLight(actObsRng, player, currentScout, "agentShowcase", playerEvidence(player.id), extraAttrsPerSession);
      obs.week = stateWithScheduleApplied.currentWeek;
      obs.season = stateWithScheduleApplied.currentSeason;
      recordObservation(obs);
      observedPlayerIds.add(player.id);
      weekObservationsGenerated++;

      const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
      if (!alreadyDiscovered) {
        actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
        weekPlayersDiscovered++;
      }

      const topAttrs = obs.attributeReadings
        .sort((a, b) => b.perceivedValue - a.perceivedValue)
        .slice(0, 3)
        .map((r) => `${r.attribute} ${r.perceivedValue}`)
        .join(", ");
      const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
      const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
      actObsMessages.push({
        id: `obs-showcase-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "feedback" as const,
        title: `Agent Showcase${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
        body: `${narrativePrefix}An agent presented ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} to you directly. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "player" as const,
      });
    }

    const focusTargetIds = focusPlayers("agentShowcase");
    const focusRepeats = focusDepth("agentShowcase");
    if (focusTargetIds.length > 0 && focusRepeats > 0) {
      const focusedPlayers = focusTargetIds
        .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
        .filter((p): p is Player => !!p);
      for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
        const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
        const focusObs = observePlayerLight(
          actObsRng,
          focusedPlayer,
          currentScout,
          "agentShowcase",
          playerEvidence(focusedPlayer.id),
          extraAttrsPerSession,
        );
        focusObs.week = stateWithScheduleApplied.currentWeek;
        focusObs.season = stateWithScheduleApplied.currentSeason;
        recordObservation(focusObs);
        observedPlayerIds.add(focusedPlayer.id);
        weekObservationsGenerated++;
      }
    }
  }

  // --- Trial Match: observe 1-2 players in a controlled trial ---
  if (weekResult.trialMatchesExecuted > 0) {
    const qr = qualityMap.get("trialMatch");
    const discMod = (qr?.discoveryModifier ?? 0) + choiceDiscoveryMod("trialMatch");
    const [rangeMin, rangeMax] = adjustedRange(1, 2, discMod);
    const pool = allPlayers.filter((p) => !observedPlayerIds.has(p.id)).slice();
    const prioritizedPlayers = prioritizeFocusedPlayers(
      actObsRng.shuffle(pool),
      "trialMatch",
    );
    const count = Math.min(prioritizedPlayers.length, actObsRng.nextInt(rangeMin, rangeMax));
    const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

    for (let i = 0; i < count; i++) {
      const player = prioritizedPlayers[i];

      const obs = observePlayerLight(actObsRng, player, currentScout, "trialMatch", playerEvidence(player.id), extraAttrsPerSession);
      obs.week = stateWithScheduleApplied.currentWeek;
      obs.season = stateWithScheduleApplied.currentSeason;
      recordObservation(obs);
      observedPlayerIds.add(player.id);
      weekObservationsGenerated++;

      const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
      if (!alreadyDiscovered) {
        actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
        weekPlayersDiscovered++;
      }

      // Resolve trial outcome for any pending trial responses
      if (currentScout.currentClubId) {
        const trialRng = createRNG(
          `${gameState.seed}-trial-${player.id}-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
        );
        const trialClub = stateWithScheduleApplied.clubs[currentScout.currentClubId];
        if (trialClub) {
          const trialOutcome = processTrialOutcome(
            trialRng,
            player,
            trialClub,
            stateWithScheduleApplied.players,
          );
          // Update any pending trial ClubResponse with the resolved outcome
          const updatedClubResponses = stateWithScheduleApplied.clubResponses.map((resp) =>
            resp.response === "trial" && !resp.directiveId
              ? { ...resp, response: trialOutcome }
              : resp,
          );
          stateWithScheduleApplied = {
            ...stateWithScheduleApplied,
            clubResponses: updatedClubResponses,
          };
        }
      }

      const topAttrs = obs.attributeReadings
        .sort((a, b) => b.perceivedValue - a.perceivedValue)
        .slice(0, 3)
        .map((r) => `${r.attribute} ${r.perceivedValue}`)
        .join(", ");
      const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
      const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
      actObsMessages.push({
        id: `obs-trial-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "feedback" as const,
        title: `Trial Match${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
        body: `${narrativePrefix}${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} participated in a trial match. Closely assessed under controlled conditions. ${obs.attributeReadings.length} attributes recorded. Notable: ${topAttrs}.`,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "player" as const,
      });
    }

    const focusTargetIds = focusPlayers("trialMatch");
    const focusRepeats = focusDepth("trialMatch");
    if (focusTargetIds.length > 0 && focusRepeats > 0) {
      const focusedPlayers = focusTargetIds
        .map((id) => prioritizedPlayers.find((p) => p.id === id) ?? stateWithScheduleApplied.players[id])
        .filter((p): p is Player => !!p);
      for (let repeat = 0; repeat < focusRepeats && focusedPlayers.length > 0; repeat++) {
        const focusedPlayer = focusedPlayers[repeat % focusedPlayers.length];
        const focusObs = observePlayerLight(
          actObsRng,
          focusedPlayer,
          currentScout,
          "trialMatch",
          playerEvidence(focusedPlayer.id),
          extraAttrsPerSession,
        );
        focusObs.week = stateWithScheduleApplied.currentWeek;
        focusObs.season = stateWithScheduleApplied.currentSeason;
        recordObservation(focusObs);
        observedPlayerIds.add(focusedPlayer.id);
        weekObservationsGenerated++;
      }
    }
  }

  // --- Contract Negotiations: no observations — just XP and inbox message ---
  if (weekResult.contractNegotiationsExecuted > 0) {
    const relationshipDelta = choiceRelationshipMod("contractNegotiation");
    const qualityDelta = choiceReportQualityMod("contractNegotiation");
    actObsMessages.push({
      id: `obs-negotiation-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
      week: stateWithScheduleApplied.currentWeek,
      season: stateWithScheduleApplied.currentSeason,
      type: "feedback" as const,
      title: "Contract Negotiation Assistance",
      body: `You assisted the club's negotiation team this week. Your insight into the player's strengths and market value helped structure the offer. XP gained in persuasion and network skills.${relationshipDelta !== 0 ? ` Relationship leverage ${relationshipDelta > 0 ? "+" : ""}${relationshipDelta}.` : ""}${qualityDelta !== 0 ? ` Deal quality signal ${qualityDelta > 0 ? "+" : ""}${qualityDelta}.` : ""}`,
      read: false,
      actionRequired: false,
    });
  }

  return {
    state: stateWithScheduleApplied,
    discoveries: actDiscoveries,
    messages: actObsMessages,
    playersDiscovered: weekPlayersDiscovered,
    observationsGenerated: weekObservationsGenerated,
  };
}
