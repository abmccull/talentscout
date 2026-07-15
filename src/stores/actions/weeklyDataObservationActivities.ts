import type {
  Activity,
  AnomalyFlag,
  GameState,
  InboxMessage,
  Observation,
  Player,
  Scout,
} from "@/engine/core/types";
import { processCompletedWeek } from "@/engine/core/calendar";
import { getActiveEquipmentBonuses } from "@/engine/finance";
import { createRNG } from "@/engine/rng";
import { observePlayerLight } from "@/engine/scout/perception";
import {
  deriveRegionalPresence,
  getPlayerScoutingCountry,
} from "@/engine/world";
import {
  executeDatabaseQuery,
  executeDeepVideoAnalysis,
  generateAnalystReport,
  generateStatsBriefing,
  updateAnalystMorale,
} from "@/engine/data";

type CompletedWeekResult = ReturnType<typeof processCompletedWeek>;
type EquipmentBonuses = ReturnType<typeof getActiveEquipmentBonuses>;

export interface WeeklyDataObservationInput {
  sourceState: GameState;
  state: GameState;
  weekResult: CompletedWeekResult;
  equipmentBonuses?: EquipmentBonuses;
  scout: Scout;
  allPlayers: readonly Player[];
  messages: readonly InboxMessage[];
  observationsGenerated: number;
  extraAttributesPerSession: number;
  playerEvidence: (playerId: string) => Observation[];
  recordObservation: (observation: Observation) => void;
  observedPlayerIds: Set<string>;
  profileModifier: (activityType: Activity["type"]) => number;
  anomalyModifier: (activityType: Activity["type"]) => number;
  relationshipModifier: (activityType: Activity["type"]) => number;
  reportQualityModifier: (activityType: Activity["type"]) => number;
  prioritizePlayers: (pool: Player[], activityType: Activity["type"]) => Player[];
}
export interface WeeklyDataObservationResult {
  state: GameState;
  messages: InboxMessage[];
  observationsGenerated: number;
}

export function processWeeklyDataObservationActivities(
  input: WeeklyDataObservationInput,
): WeeklyDataObservationResult {
  const gameState = input.sourceState;
  let stateWithScheduleApplied = input.state;
  const {
    weekResult,
    scout: currentScout,
    allPlayers,
    playerEvidence,
    recordObservation,
    observedPlayerIds,
  } = input;
  const weekEquipBonuses = input.equipmentBonuses;
  const extraAttrsPerSession = input.extraAttributesPerSession;
  const choiceProfileMod = input.profileModifier;
  const choiceAnomalyMod = input.anomalyModifier;
  const choiceRelationshipMod = input.relationshipModifier;
  const choiceReportQualityMod = input.reportQualityModifier;
  const prioritizeFocusedPlayers = input.prioritizePlayers;
  const actObsMessages = [...input.messages];
  let weekObservationsGenerated = input.observationsGenerated;

  // --- Database Query: generate statistical profiles for league players ---
  if (weekResult.databaseQueriesExecuted > 0) {
    // Equipment dataAccuracy bonus: extra profiles discovered per query
    const dbDataAccBonus = weekEquipBonuses?.dataAccuracy ?? 0;
    const dbRng = createRNG(
      `${gameState.seed}-dbquery-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    let queryProfileMod = choiceProfileMod("databaseQuery") + (dbDataAccBonus > 0 ? Math.round(dbDataAccBonus * 5) : 0);
    const queryAnomalyMod = choiceAnomalyMod("databaseQuery");
    const leagueIds = Object.keys(stateWithScheduleApplied.leagues);
    if (leagueIds.length > 0) {
      const targetLeagueId = dbRng.pickWeighted(
        leagueIds.map((leagueId) => ({
          item: leagueId,
          weight: deriveRegionalPresence(
            stateWithScheduleApplied,
            stateWithScheduleApplied.leagues[leagueId]?.country ?? "",
          ).effects.opportunityMultiplier || 0.25,
        })),
      );
      const targetLeague = stateWithScheduleApplied.leagues[targetLeagueId];
      if (targetLeague) {
        const dataPresence = deriveRegionalPresence(
          stateWithScheduleApplied,
          targetLeague.country,
        );
        queryProfileMod += Math.round(dataPresence.effects.dataConfidenceBonus * 10);
        const queryResult = executeDatabaseQuery(
          dbRng,
          currentScout,
          targetLeague,
          stateWithScheduleApplied.players,
          {},
          stateWithScheduleApplied.currentSeason,
          stateWithScheduleApplied.currentWeek,
        );
        let effectiveProfiles = [...queryResult.profiles];
        let effectivePlayerIds = [...queryResult.playerIds];
        const selectedSet = new Set(effectivePlayerIds);

        if (queryProfileMod > 0) {
          const leagueClubIds = new Set(targetLeague.clubIds);
          const extraCandidates = Object.values(stateWithScheduleApplied.players).filter(
            (p) => leagueClubIds.has(p.clubId) && !selectedSet.has(p.id),
          );
          const extraCount = Math.min(queryProfileMod, extraCandidates.length);
          const extraPlayers = dbRng.shuffle(extraCandidates).slice(0, extraCount);
          for (const player of extraPlayers) {
            const extraProfile = executeDeepVideoAnalysis(
              dbRng,
              currentScout,
              player,
              stateWithScheduleApplied.currentSeason,
              stateWithScheduleApplied.currentWeek,
              stateWithScheduleApplied.statisticalProfiles[player.id],
            );
            effectiveProfiles.push(extraProfile);
            effectivePlayerIds.push(player.id);
            selectedSet.add(player.id);
          }
        } else if (queryProfileMod < 0 && effectiveProfiles.length > 0) {
          const keepCount = Math.max(1, effectiveProfiles.length + queryProfileMod);
          const trimmedProfiles = dbRng.shuffle(effectiveProfiles).slice(0, keepCount);
          const keepIds = new Set(trimmedProfiles.map((p) => p.playerId));
          effectiveProfiles = trimmedProfiles;
          effectivePlayerIds = effectivePlayerIds.filter((id) => keepIds.has(id));
        }

        const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
        for (const profile of effectiveProfiles) {
          updatedProfiles[profile.playerId] = {
            ...profile,
            evidenceContext: {
              countryId: dataPresence.countryId,
              confidence: Math.min(
                1,
                0.5 + dataPresence.effects.dataConfidenceBonus + dbDataAccBonus,
              ),
              accessTier: dataPresence.accessTier,
              explanation: dataPresence.summary,
            },
          };
        }

        let nextAnomalyFlags = stateWithScheduleApplied.anomalyFlags;
        if (queryAnomalyMod > 0 && effectivePlayerIds.length > 0) {
          const anomalyCandidates = dbRng.shuffle(effectivePlayerIds).slice(
            0,
            Math.min(queryAnomalyMod, effectivePlayerIds.length),
          );
          const generated: AnomalyFlag[] = anomalyCandidates.map((playerId, idx) => {
            const player = stateWithScheduleApplied.players[playerId];
            return {
              id: `query-anomaly-${playerId}-w${stateWithScheduleApplied.currentWeek}-i${idx}`,
              playerId,
              stat: "goals",
              direction: dbRng.nextFloat(0, 1) > 0.5 ? "positive" : "negative",
              severity: +(dbRng.nextFloat(0, 1) * 1.5 + 0.5).toFixed(1),
              description: `${player?.firstName ?? "Player"} ${player?.lastName ?? ""} triggered a query-side anomaly check due to outlier metric combinations.`,
              investigated: false,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
            };
          });
          nextAnomalyFlags = [...stateWithScheduleApplied.anomalyFlags, ...generated];
        }

        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          statisticalProfiles: updatedProfiles,
          anomalyFlags: nextAnomalyFlags,
        };
        const playerNames = effectivePlayerIds
          .slice(0, 5)
          .map((id) => {
            const p = stateWithScheduleApplied.players[id];
            return p ? `${p.firstName} ${p.lastName}` : id;
          })
          .join(", ");
        actObsMessages.push({
          id: `obs-dbquery-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `Database Query: ${targetLeague.name}`,
          body: `Your database query returned ${effectivePlayerIds.length} player${effectivePlayerIds.length !== 1 ? "s" : ""} in ${targetLeague.name}. Statistical profiles generated. Key finds: ${playerNames || "none"}.${queryAnomalyMod > 0 ? ` Additional anomaly flags: +${Math.min(queryAnomalyMod, effectivePlayerIds.length)}.` : ""}`,
          read: false,
          actionRequired: false,
        });
      }
    }
  }

  // --- Deep Video Analysis: enhanced statistical profile + observation ---
  if (weekResult.deepVideoAnalysesExecuted > 0) {
    // Equipment videoConfidence + dataAccuracy bonuses for deep video analysis
    const deepVideoConfBoost = weekEquipBonuses?.videoConfidence ?? 0;
    const deepDataAccBoost = weekEquipBonuses?.dataAccuracy ?? 0;
    const deepVideoRng = createRNG(
      `${gameState.seed}-deepvideo-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const deepProfileMod = choiceProfileMod("deepVideoAnalysis");
    const previouslyObserved = allPlayers.filter((p) => observedPlayerIds.has(p.id));
    const pool = previouslyObserved.length > 0 ? [...previouslyObserved] : [...allPlayers];
    const prioritizedPlayers = prioritizeFocusedPlayers(
      deepVideoRng.shuffle(pool),
      "deepVideoAnalysis",
    );
    if (prioritizedPlayers.length > 0) {
      const analysisCount = Math.max(
        1,
        Math.min(prioritizedPlayers.length, 1 + deepProfileMod),
      );
      const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
      for (let i = 0; i < analysisCount; i++) {
        const player = prioritizedPlayers[i];
        const existingProfile = updatedProfiles[player.id];
        const deepProfile = executeDeepVideoAnalysis(
          deepVideoRng,
          currentScout,
          player,
          stateWithScheduleApplied.currentSeason,
          stateWithScheduleApplied.currentWeek,
          existingProfile,
        );
        const playerCountry = getPlayerScoutingCountry(
          stateWithScheduleApplied,
          player,
        );
        const dataPresence = playerCountry
          ? deriveRegionalPresence(stateWithScheduleApplied, playerCountry)
          : undefined;
        updatedProfiles[player.id] = dataPresence
          ? {
              ...deepProfile,
              evidenceContext: {
                countryId: dataPresence.countryId,
                confidence: Math.min(
                  1,
                  0.55 + dataPresence.effects.dataConfidenceBonus + deepDataAccBoost,
                ),
                accessTier: dataPresence.accessTier,
                explanation: dataPresence.summary,
              },
            }
          : deepProfile;

        const obs = observePlayerLight(
          deepVideoRng,
          player,
          currentScout,
          "videoAnalysis",
          playerEvidence(player.id),
          extraAttrsPerSession,
        );
        obs.week = stateWithScheduleApplied.currentWeek;
        obs.season = stateWithScheduleApplied.currentSeason;
        // Apply equipment videoConfidence + dataAccuracy boost for deep video
        if (deepVideoConfBoost > 0 || deepDataAccBoost > 0) {
          obs.attributeReadings = obs.attributeReadings.map((r) => ({
            ...r,
            confidence: Math.min(1, r.confidence + deepVideoConfBoost + deepDataAccBoost),
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
        actObsMessages.push({
          id: `obs-deepvideo-${player.id}-w${stateWithScheduleApplied.currentWeek}-i${i}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `Deep Video Analysis: ${player.firstName} ${player.lastName}`,
          body: `You conducted an intensive video analysis session on ${player.firstName} ${player.lastName} (${player.position}). Statistical profile ${existingProfile ? "refined" : "created"}. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
          read: false,
          actionRequired: false,
          relatedId: player.id,
          relatedEntityType: "player" as const,
        });
      }

      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        statisticalProfiles: updatedProfiles,
      };
    }
  }

  // --- Stats Briefing: generate anomaly flags and highlights ---
  if (weekResult.statsBriefingsExecuted > 0) {
    // Equipment dataAccuracy bonus: extra anomalies found during briefing
    const briefingDataAccBonus = weekEquipBonuses?.dataAccuracy ?? 0;
    const briefingRng = createRNG(
      `${gameState.seed}-briefing-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const anomalyMod = choiceAnomalyMod("statsBriefing") + (briefingDataAccBonus > 0 ? Math.round(briefingDataAccBonus * 3) : 0);
    const leagueIds = Object.keys(stateWithScheduleApplied.leagues);
    if (leagueIds.length > 0) {
      const targetLeagueId = leagueIds[briefingRng.nextInt(0, leagueIds.length - 1)];
      const targetLeague = stateWithScheduleApplied.leagues[targetLeagueId];
      if (targetLeague) {
        const briefing = generateStatsBriefing(
          briefingRng,
          currentScout,
          targetLeague,
          stateWithScheduleApplied.players,
          stateWithScheduleApplied.currentSeason,
          stateWithScheduleApplied.currentWeek,
        );
        let briefingAnomalies = [...briefing.anomalies];
        if (anomalyMod < 0) {
          const keepCount = Math.max(0, briefingAnomalies.length + anomalyMod);
          briefingAnomalies = briefingAnomalies.slice(0, keepCount);
        } else if (anomalyMod > 0) {
          const extraCandidates = briefing.topPerformers.filter(
            (playerId) => !briefingAnomalies.some((a) => a.playerId === playerId),
          );
          const extraCount = Math.min(anomalyMod, extraCandidates.length);
          for (let i = 0; i < extraCount; i++) {
            const playerId = extraCandidates[i];
            const player = stateWithScheduleApplied.players[playerId];
            briefingAnomalies.push({
              id: `briefing-extra-${playerId}-w${stateWithScheduleApplied.currentWeek}-i${i}`,
              playerId,
              stat: "goals",
              direction: briefingRng.nextFloat(0, 1) > 0.5 ? "positive" : "negative",
              severity: +(briefingRng.nextFloat(0, 1) * 1.2 + 0.4).toFixed(1),
              description: `${player?.firstName ?? "Player"} ${player?.lastName ?? ""} was flagged during focused anomaly review.`,
              investigated: false,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
            });
          }
        }
        const updatedAnomalyFlags = [
          ...stateWithScheduleApplied.anomalyFlags,
          ...briefingAnomalies,
        ];
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          anomalyFlags: updatedAnomalyFlags,
        };
        actObsMessages.push({
          id: `obs-briefing-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `Stats Briefing: ${targetLeague.name}`,
          body: `${briefing.highlights.join("\n")}\n\nAnomalies flagged this cycle: ${briefingAnomalies.length}.`,
          read: false,
          actionRequired: false,
        });
      }
    }
  }

  // --- Data Conference: networking + optional profile breakthroughs ---
  if (weekResult.dataConferencesExecuted > 0) {
    const conferenceRng = createRNG(
      `${gameState.seed}-conference-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const conferenceRelMod = choiceRelationshipMod("dataConference");
    const conferenceProfileMod = choiceProfileMod("dataConference");
    const conferenceQualityMod = choiceReportQualityMod("dataConference");

    let conferenceProfilesAdded = 0;
    if (conferenceProfileMod > 0) {
      const profileCandidates = conferenceRng.shuffle(
        allPlayers.filter((p) => !stateWithScheduleApplied.statisticalProfiles[p.id]),
      );
      const selected = profileCandidates.slice(
        0,
        Math.min(conferenceProfileMod, profileCandidates.length),
      );
      if (selected.length > 0) {
        const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
        for (const player of selected) {
          updatedProfiles[player.id] = executeDeepVideoAnalysis(
            conferenceRng,
            currentScout,
            player,
            stateWithScheduleApplied.currentSeason,
            stateWithScheduleApplied.currentWeek,
            updatedProfiles[player.id],
          );
        }
        conferenceProfilesAdded = selected.length;
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          statisticalProfiles: updatedProfiles,
        };
      }
    }

    if (conferenceRelMod !== 0 && stateWithScheduleApplied.dataAnalysts.length > 0) {
      const adjustedAnalysts = stateWithScheduleApplied.dataAnalysts.map((analyst) => ({
        ...analyst,
        morale: Math.max(0, Math.min(100, analyst.morale + conferenceRelMod * 2)),
      }));
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        dataAnalysts: adjustedAnalysts,
      };
    }

    actObsMessages.push({
      id: `obs-conference-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
      week: stateWithScheduleApplied.currentWeek,
      season: stateWithScheduleApplied.currentSeason,
      type: "feedback" as const,
      title: "Data Conference Attended",
      body: `You attended a data analytics conference this week. Networking with analysts and data scientists from across football expanded your professional network and sharpened your statistical toolkit.${conferenceProfilesAdded > 0 ? ` Fresh contacts opened ${conferenceProfilesAdded} new profile lead${conferenceProfilesAdded !== 1 ? "s" : ""}.` : ""}${conferenceQualityMod !== 0 ? ` Method quality signal ${conferenceQualityMod > 0 ? "+" : ""}${conferenceQualityMod}.` : ""}`,
      read: false,
      actionRequired: false,
    });
  }

  // --- Algorithm Calibration: improve accuracy of statistical profiles ---
  if (weekResult.algorithmCalibrationsExecuted > 0) {
    // Equipment anomalyDetectionRate bonus: extra anomalies from calibration
    const calibAnomalyBonus = weekEquipBonuses?.anomalyDetectionRate ?? 0;
    const calibrationRng = createRNG(
      `${gameState.seed}-calibration-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const calibrationProfileMod = choiceProfileMod("algorithmCalibration");
    const calibrationAnomalyMod = choiceAnomalyMod("algorithmCalibration") + (calibAnomalyBonus > 0 ? Math.round(calibAnomalyBonus * 3) : 0);
    // Reduce noise in existing profiles by re-running deep analysis on a sample
    const profiledPlayerIds = Object.keys(stateWithScheduleApplied.statisticalProfiles);
    const targetCalibrations = Math.max(1, 3 + calibrationProfileMod);
    const calibrated = Math.min(targetCalibrations, profiledPlayerIds.length);
    const sampleIds = calibrationRng.shuffle(profiledPlayerIds).slice(0, calibrated);
    const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
    for (const playerId of sampleIds) {
      const player = stateWithScheduleApplied.players[playerId];
      const existingProfile = updatedProfiles[playerId];
      if (player && existingProfile) {
        updatedProfiles[playerId] = executeDeepVideoAnalysis(
          calibrationRng,
          currentScout,
          player,
          stateWithScheduleApplied.currentSeason,
          stateWithScheduleApplied.currentWeek,
          existingProfile,
        );
      }
    }

    let updatedAnomalyFlags = [...stateWithScheduleApplied.anomalyFlags];
    if (calibrationAnomalyMod > 0 && sampleIds.length > 0) {
      const anomalySample = calibrationRng.shuffle(sampleIds).slice(
        0,
        Math.min(calibrationAnomalyMod, sampleIds.length),
      );
      const generatedCalibrationFlags: AnomalyFlag[] = anomalySample.map((playerId, idx) => {
        const player = stateWithScheduleApplied.players[playerId];
        return {
          id: `calibration-anomaly-${playerId}-w${stateWithScheduleApplied.currentWeek}-i${idx}`,
          playerId,
          stat: "passCompletion",
          direction: calibrationRng.nextFloat(0, 1) > 0.5 ? "positive" : "negative",
          severity: +(calibrationRng.nextFloat(0, 1) * 1.3 + 0.5).toFixed(1),
          description: `${player?.firstName ?? "Player"} ${player?.lastName ?? ""} surfaced during model recalibration as a statistical outlier.`,
          investigated: false,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
        };
      });
      updatedAnomalyFlags = [...updatedAnomalyFlags, ...generatedCalibrationFlags];
    } else if (calibrationAnomalyMod < 0 && updatedAnomalyFlags.length > 0) {
      const toTrim = Math.min(Math.abs(calibrationAnomalyMod), updatedAnomalyFlags.length);
      updatedAnomalyFlags = updatedAnomalyFlags.slice(toTrim);
    }

    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      statisticalProfiles: updatedProfiles,
      anomalyFlags: updatedAnomalyFlags,
    };
    actObsMessages.push({
      id: `obs-calibration-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
      week: stateWithScheduleApplied.currentWeek,
      season: stateWithScheduleApplied.currentSeason,
      type: "feedback" as const,
      title: "Algorithm Calibration Complete",
      body: `You recalibrated your statistical models this week. ${calibrated} player profile${calibrated !== 1 ? "s" : ""} refined with improved accuracy.${calibrationAnomalyMod > 0 ? ` Additional anomalies identified: +${Math.min(calibrationAnomalyMod, sampleIds.length)}.` : calibrationAnomalyMod < 0 ? ` Noise reduced: ${Math.min(Math.abs(calibrationAnomalyMod), stateWithScheduleApplied.anomalyFlags.length)} low-confidence flags cleared.` : ""}`,
      read: false,
      actionRequired: false,
    });
  }

  // --- Market Inefficiency Scan: identify undervalued players ---
  if (weekResult.marketInefficienciesExecuted > 0) {
    // Equipment anomalyDetectionRate + valuationAccuracy bonuses for market scans
    const marketAnomalyEquipBonus = weekEquipBonuses?.anomalyDetectionRate ?? 0;
    const marketValuationBonus = weekEquipBonuses?.valuationAccuracy ?? 0;
    const marketRng = createRNG(
      `${gameState.seed}-market-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const marketProfileMod = choiceProfileMod("marketInefficiency") + (marketValuationBonus > 0 ? Math.round(marketValuationBonus * 5) : 0);
    const marketAnomalyMod = choiceAnomalyMod("marketInefficiency") + (marketAnomalyEquipBonus > 0 ? Math.round(marketAnomalyEquipBonus * 3) : 0);
    const marketQualityMod = choiceReportQualityMod("marketInefficiency");
    // Find players whose CA significantly exceeds their market value expectations
    const undervalued = allPlayers
      .filter((p) => {
        const caExpectedValue = p.currentAbility * 50000;
        return p.marketValue < caExpectedValue * 0.7;
      })
      .slice();
    const sampleSize = Math.min(
      Math.max(1, 5 + marketProfileMod),
      undervalued.length,
    );
    const baseFinds = marketRng.shuffle(undervalued).slice(0, sampleSize);
    const effectiveFinds = marketAnomalyMod < 0
      ? baseFinds.slice(0, Math.max(0, baseFinds.length + marketAnomalyMod))
      : baseFinds;
    let marketAnomaliesAdded = 0;
    if (marketAnomalyMod > 0 && effectiveFinds.length > 0) {
      const anomalyPlayers = marketRng.shuffle(effectiveFinds).slice(
        0,
        Math.min(marketAnomalyMod, effectiveFinds.length),
      );
      const generatedMarketFlags: AnomalyFlag[] = anomalyPlayers.map((player, idx) => ({
        id: `market-anomaly-${player.id}-w${stateWithScheduleApplied.currentWeek}-i${idx}`,
        playerId: player.id,
        stat: "goals",
        direction: marketRng.nextFloat(0, 1) > 0.5 ? "positive" : "negative",
        severity: +(marketRng.nextFloat(0, 1) * 1.4 + 0.6).toFixed(1),
        description: `${player.firstName} ${player.lastName} showed a valuation/performance mismatch in this market scan.`,
        investigated: false,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
      }));
      marketAnomaliesAdded = generatedMarketFlags.length;
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        anomalyFlags: [...stateWithScheduleApplied.anomalyFlags, ...generatedMarketFlags],
      };
    }
    const findsText = effectiveFinds.length > 0
      ? effectiveFinds.map((p) => {
          const club = p.clubId ? stateWithScheduleApplied.clubs[p.clubId] : undefined;
          return `${p.firstName} ${p.lastName} (${p.position}, ${club?.name ?? "Unknown"})`;
        }).join("; ")
      : "No significant inefficiencies found this week.";
    actObsMessages.push({
      id: `obs-market-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
      week: stateWithScheduleApplied.currentWeek,
      season: stateWithScheduleApplied.currentSeason,
      type: "feedback" as const,
      title: "Market Inefficiency Scan",
      body: `Your scan identified ${effectiveFinds.length} potentially undervalued player${effectiveFinds.length !== 1 ? "s" : ""} this week.${marketAnomaliesAdded > 0 ? ` Added ${marketAnomaliesAdded} anomaly follow-up${marketAnomaliesAdded !== 1 ? "s" : ""}.` : ""}${marketQualityMod !== 0 ? ` Confidence ${marketQualityMod > 0 ? "up" : "down"} (${marketQualityMod > 0 ? "+" : ""}${marketQualityMod}).` : ""}\n\n${findsText}`,
      read: false,
      actionRequired: false,
    });
  }

  // --- Analytics Team Meeting: generate analyst reports and update morale ---
  if (weekResult.analyticsTeamMeetingsExecuted > 0) {
    const meetingRng = createRNG(
      `${gameState.seed}-analystmeeting-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const meetingRelMod = choiceRelationshipMod("analyticsTeamMeeting");
    const meetingAnomalyMod = choiceAnomalyMod("analyticsTeamMeeting");
    const meetingProfileMod = choiceProfileMod("analyticsTeamMeeting");
    const meetingQualityMod = choiceReportQualityMod("analyticsTeamMeeting");
    const updatedAnalysts = [...stateWithScheduleApplied.dataAnalysts];
    const updatedAnalystReports = { ...stateWithScheduleApplied.analystReports };
    const profileCandidateIds = new Set<string>();

    for (let analystIdx = 0; analystIdx < updatedAnalysts.length; analystIdx++) {
      const analyst = updatedAnalysts[analystIdx];
      if (!analyst.assignedLeagueId) continue;
      const analystLeague = stateWithScheduleApplied.leagues[analyst.assignedLeagueId];
      if (!analystLeague) continue;

      const reportId = `analyst-report-${analyst.id}-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`;
      const boostedAnalyst = {
        ...analyst,
        morale: Math.max(
          0,
          Math.min(100, analyst.morale + meetingRelMod * 3 + meetingQualityMod * 2),
        ),
      };
      let report = generateAnalystReport(
        meetingRng,
        boostedAnalyst,
        analystLeague,
        stateWithScheduleApplied.players,
        stateWithScheduleApplied.currentSeason,
        stateWithScheduleApplied.currentWeek,
        reportId,
      );
      if (meetingAnomalyMod !== 0) {
        if (meetingAnomalyMod < 0) {
          const keepCount = Math.max(0, report.anomalies.length + meetingAnomalyMod);
          report = { ...report, anomalies: report.anomalies.slice(0, keepCount) };
        } else if (report.highlightedPlayerIds.length > 0) {
          const existing = new Set(report.anomalies.map((a) => a.playerId));
          const extraTargets = report.highlightedPlayerIds.filter((id) => !existing.has(id)).slice(
            0,
            meetingAnomalyMod,
          );
          if (extraTargets.length > 0) {
            const extraAnomalies: AnomalyFlag[] = extraTargets.map((playerId, idx) => {
              const player = stateWithScheduleApplied.players[playerId];
              return {
                id: `meeting-anomaly-${playerId}-w${stateWithScheduleApplied.currentWeek}-i${idx}`,
                playerId,
                stat: "assists",
                direction: meetingRng.nextFloat(0, 1) > 0.5 ? "positive" : "negative",
                severity: +(meetingRng.nextFloat(0, 1) * 1.1 + 0.5).toFixed(1),
                description: `${player?.firstName ?? "Player"} ${player?.lastName ?? ""} was escalated during analyst standup anomaly triage.`,
                investigated: false,
                week: stateWithScheduleApplied.currentWeek,
                season: stateWithScheduleApplied.currentSeason,
              };
            });
            report = { ...report, anomalies: [...report.anomalies, ...extraAnomalies] };
          }
        }
      }
      for (const playerId of report.highlightedPlayerIds) {
        profileCandidateIds.add(playerId);
      }
      updatedAnalystReports[reportId] = report;

      // Morale improves when a meeting is held, with interaction-based adjustment.
      const meetingUpdated = updateAnalystMorale(analyst, { hadMeeting: true });
      updatedAnalysts[analystIdx] = {
        ...meetingUpdated,
        morale: Math.max(0, Math.min(100, meetingUpdated.morale + meetingRelMod * 2)),
      };
    }

    let profilesAddedFromMeeting = 0;
    if (meetingProfileMod > 0 && profileCandidateIds.size > 0) {
      const candidates = meetingRng.shuffle([...profileCandidateIds]);
      const selectedIds = candidates.slice(0, Math.min(meetingProfileMod, candidates.length));
      if (selectedIds.length > 0) {
        const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
        for (const playerId of selectedIds) {
          const player = stateWithScheduleApplied.players[playerId];
          if (!player) continue;
          updatedProfiles[playerId] = executeDeepVideoAnalysis(
            meetingRng,
            currentScout,
            player,
            stateWithScheduleApplied.currentSeason,
            stateWithScheduleApplied.currentWeek,
            updatedProfiles[playerId],
          );
          profilesAddedFromMeeting++;
        }
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          statisticalProfiles: updatedProfiles,
        };
      }
    }

    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      dataAnalysts: updatedAnalysts,
      analystReports: updatedAnalystReports,
    };

    actObsMessages.push({
      id: `obs-analystmeeting-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
      week: stateWithScheduleApplied.currentWeek,
      season: stateWithScheduleApplied.currentSeason,
      type: "feedback" as const,
      title: "Analytics Team Meeting",
      body: `You held a team meeting with your data analysts this week. ${updatedAnalysts.length > 0 ? `${updatedAnalysts.length} analyst${updatedAnalysts.length !== 1 ? "s" : ""} reported in.` : "No analysts are currently assigned to your team."}${profilesAddedFromMeeting > 0 ? ` ${profilesAddedFromMeeting} additional profile${profilesAddedFromMeeting !== 1 ? "s" : ""} were deepened from meeting actions.` : ""} Reports are available in your analytics dashboard.`,
      read: false,
      actionRequired: false,
    });
  }
  return {
    state: stateWithScheduleApplied,
    messages: actObsMessages,
    observationsGenerated: weekObservationsGenerated,
  };
}
