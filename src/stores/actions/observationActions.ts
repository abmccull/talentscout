/**
 * Observation session & insight actions extracted from gameStore.
 *
 * Handles interactive observation sessions (fullObservation, analysis,
 * investigation, quickInteraction), focus allocation, moment flagging,
 * reflection generation, insight spending, and session lifecycle.
 */
import type { GetState, SetState } from "./types";
import type { GameScreen } from "../gameStore";
import type { LensType, ObservationSession, SessionFlaggedMoment } from "@/engine/observation/types";
import type { InsightActionId, InsightState, InsightActionResult } from "@/engine/insight/types";
import type { ActivityType } from "@/engine/core/types";
import type { AttributeDomain } from "@/engine/core/types";
import { createSession, startSession, advanceSessionPhase, allocateFocus, removeFocus, flagMoment, addReflectionNote, addHypothesis, completeSession, getSessionResult } from "@/engine/observation/session";
import { populateFullObservationPhases } from "@/engine/observation/fullObservation";
import { populateAnalysisPhases } from "@/engine/observation/analysis";
import { populateInvestigationPhases } from "@/engine/observation/investigation";
import { populateQuickInteractionPhases } from "@/engine/observation/quickInteraction";
import { generateReflection } from "@/engine/observation/reflection";
import { createInsightState, accumulateInsight, calculateCapacity, canUseInsight, spendInsight } from "@/engine/insight/insight";
import { executeInsightAction } from "@/engine/insight/actions";
import { createRNG } from "@/engine/rng";
import { getActiveEquipmentBonuses } from "@/engine/finance";
import { ALL_PERKS } from "@/engine/specializations/perks";
import { calculateSystemFit } from "@/engine/firstTeam";

export function createObservationActions(get: GetState, set: SetState) {
  return {
    startObservationSession: (
      activityType: string,
      playerPool: Array<{ playerId: string; name: string; position: string }>,
      targetPlayerId?: string,
      options?: {
        activityInstanceId?: string;
        returnScreen?: GameScreen;
      },
    ) => {
      const { gameState } = get();
      if (!gameState) return;

      const dedupedPool = Array.from(
        playerPool.reduce((map, player) => {
          if (!player.playerId) return map;
          if (!map.has(player.playerId)) {
            map.set(player.playerId, player);
          }
          return map;
        }, new Map<string, { playerId: string; name: string; position: string }>())
        .values(),
      );
      if (dedupedPool.length === 0) return;

      const activityInstanceId = options?.activityInstanceId;
      const targetId = (
        targetPlayerId && dedupedPool.some((p) => p.playerId === targetPlayerId)
      )
        ? targetPlayerId
        : dedupedPool[0]?.playerId;

      const seedKey =
        activityInstanceId
        ?? `${activityType}-${gameState.currentWeek}-${gameState.currentSeason}`;
      const rng = createRNG(`${gameState.seed}-session-${seedKey}`);

      const config = {
        activityType: activityType as ActivityType,
        activityInstanceId,
        specialization: gameState.scout.primarySpecialization,
        playerPool: dedupedPool,
        targetPlayerId: targetId,
        seed: `${gameState.seed}-session-${seedKey}`,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
      };

      let session = createSession(config, rng);

      // Populate phases for the session's observation mode
      switch (session.mode) {
        case "fullObservation":
          session = populateFullObservationPhases(session, rng);
          break;
        case "analysis":
          session = populateAnalysisPhases(session, rng);
          break;
        case "investigation":
          session = populateInvestigationPhases(session, rng);
          break;
        case "quickInteraction":
          session = populateQuickInteractionPhases(session, rng);
          break;
      }

      set({
        activeSession: session,
        sessionReturnScreen: options?.returnScreen
          ?? (get().weekSimulation ? "weekSimulation" : "dashboard"),
        currentScreen: "observation" as GameScreen,
      });
    },

    beginSession: () => {
      const { activeSession } = get();
      if (!activeSession) return;
      set({ activeSession: startSession(activeSession) });
    },

    advanceSessionPhase: () => {
      const { activeSession } = get();
      if (!activeSession) return;
      const updated = advanceSessionPhase(activeSession);
      set({ activeSession: updated });

      // If we transitioned to reflection, generate reflection content
      if (updated.state === "reflection" && activeSession.state === "active") {
        const { gameState } = get();
        if (!gameState) return;
        const rng = createRNG(`${gameState.seed}-reflection-${gameState.currentWeek}`);
        // Equipment gutFeelingBonus: boost effective intuition for gut feeling trigger chance
        // checkGutFeelingTrigger uses intuition/200 as bonus, so multiply equipment bonus by 200
        const reflEquipBonuses = gameState.finances?.equipment
          ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
          : undefined;
        const gutBoost = (reflEquipBonuses?.gutFeelingBonus ?? 0) * 200;

        // Check if scout has the PA estimate perk (Generational Eye)
        const hasPAEstimatePerk = gameState.scout.unlockedPerks.some((perkId) => {
          const perk = ALL_PERKS.find((p) => p.id === perkId);
          return perk?.effect.type === "paEstimate";
        });
        const paAccuracyBonus = reflEquipBonuses?.paEstimateAccuracy ?? 0;

        const reflectionResult = generateReflection(
          updated,
          rng,
          gameState.scout.attributes.intuition + gutBoost,
          gameState.scout.specializationLevel,
          { paEstimate: hasPAEstimatePerk },
          paAccuracyBonus,
          gameState.players,
        );
        set({ lastReflectionResult: reflectionResult });
      }
    },

    allocateSessionFocus: (playerId: string, lens: LensType) => {
      const { activeSession } = get();
      if (!activeSession) return;
      set({ activeSession: allocateFocus(activeSession, playerId, lens) });
    },

    removeSessionFocus: (playerId: string) => {
      const { activeSession } = get();
      if (!activeSession) return;
      set({ activeSession: removeFocus(activeSession, playerId) });
    },

    flagSessionMoment: (momentId: string, reaction: SessionFlaggedMoment['reaction']) => {
      const { activeSession } = get();
      if (!activeSession) return;
      set({ activeSession: flagMoment(activeSession, momentId, reaction) });
    },

    addSessionNote: (note: string) => {
      const { activeSession } = get();
      if (!activeSession) return;
      set({ activeSession: addReflectionNote(activeSession, note) });
    },

    addSessionHypothesis: (playerId: string, text: string, domain: string) => {
      const { activeSession, gameState } = get();
      if (!activeSession || !gameState) return;
      const week = gameState.currentWeek;
      set({ activeSession: addHypothesis(activeSession, playerId, text, domain as AttributeDomain, week) });
    },

    endObservationSession: () => {
      const { activeSession, gameState, sessionReturnScreen } = get();
      if (!activeSession || !gameState) return;

      const completed = completeSession(activeSession);
      const result = getSessionResult(completed);

      // Accumulate insight points
      const scout = gameState.scout;
      const currentInsight = (scout.insightState ?? createInsightState()) as InsightState;
      const capacity = calculateCapacity(scout.attributes.intuition);
      const updatedInsight = accumulateInsight(currentInsight, result.insightPointsEarned, capacity);

      // Track the completed session
      const completedSessions = new Set(gameState.completedInteractiveSessions ?? []);
      const completionId = completed.activityInstanceId ?? completed.id;
      completedSessions.add(completionId);

      const fallbackReturnScreen: GameScreen =
        get().weekSimulation ? "weekSimulation" : "dashboard";
      const nextScreen = sessionReturnScreen ?? fallbackReturnScreen;

      set({
        activeSession: null,
        sessionReturnScreen: null,
        lastReflectionResult: null,
        currentScreen: nextScreen,
        gameState: {
          ...gameState,
          scout: {
            ...scout,
            insightState: updatedInsight,
          },
          completedInteractiveSessions: [...completedSessions],
        },
      });
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Insight Actions
    // ═══════════════════════════════════════════════════════════════════════════

    useInsight: (actionId: InsightActionId) => {
      const { activeSession, gameState } = get();
      if (!activeSession || !gameState) return;

      const scout = gameState.scout;
      const insightState = (scout.insightState ?? createInsightState()) as InsightState;

      // Check if can use
      const check = canUseInsight(insightState, actionId, scout, activeSession.mode);
      if (!check.canUse) return;

      // Spend IP and check for fizzle
      const rng = createRNG(`${gameState.seed}-insight-${gameState.currentWeek}-${actionId}`);
      const { state: newInsightState, fizzled } = spendInsight(
        insightState, actionId, scout,
        gameState.currentWeek, gameState.currentSeason, rng
      );

      // Execute the action
      const context = {
        scout,
        session: activeSession,
        targetPlayerId: activeSession.focusTokens.allocations[0]?.playerId,
        players: gameState.players,
        contacts: gameState.contacts,
      };
      const result = executeInsightAction(actionId, context, rng, fizzled);

      // Update scout fatigue
      const newFatigue = Math.min(100, scout.fatigue + 8);

      // If "perfectFit" insight succeeded and scout is first-team with a club,
      // calculate full system fit and populate cache
      let updatedFitCache = gameState.systemFitCache;
      if (
        result.actionId === "perfectFit" &&
        result.systemFitData &&
        scout.primarySpecialization === "firstTeam" &&
        scout.currentClubId &&
        context.targetPlayerId
      ) {
        const targetPlayer = gameState.players[context.targetPlayerId];
        const club = gameState.clubs[scout.currentClubId];
        const manager = gameState.managerProfiles[scout.currentClubId];
        if (targetPlayer && club && manager) {
          const fitRng = createRNG(
            `${gameState.seed}-sysfit-insight-${context.targetPlayerId}-${scout.currentClubId}`,
          );
          const equipBonuses = gameState.finances?.equipment
            ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
            : undefined;
          const fitResult = calculateSystemFit(
            targetPlayer,
            club,
            manager,
            gameState.players,
            undefined,
            equipBonuses?.systemFitAccuracy ?? 0,
            fitRng,
          );
          const cacheKey = `${context.targetPlayerId}:${scout.currentClubId}`;
          updatedFitCache = { ...updatedFitCache, [cacheKey]: fitResult };
        }
      }

      set({
        gameState: {
          ...gameState,
          scout: {
            ...scout,
            fatigue: newFatigue,
            insightState: newInsightState,
          },
          systemFitCache: updatedFitCache,
        },
        lastInsightResult: result,
      });
    },

    dismissInsightResult: () => {
      set({ lastInsightResult: null });
    },
  };
}
