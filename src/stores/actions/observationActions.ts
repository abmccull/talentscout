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
import type {
  ActivityType,
  AttributeDomain,
  FlaggedMoment,
  GameState,
  GutFeeling,
  Observation,
  ObservationContext,
  Player,
  PlayerAttribute,
  ReflectionFlaggedMomentRecord,
  ReflectionJournalEntry,
  ReflectionHypothesisRecord,
  UnsignedYouth,
} from "@/engine/core/types";
import { createSession, startSession, advanceSessionPhase, allocateFocus, removeFocus, flagMoment, addReflectionNote, addHypothesis, acceptHypothesis, completeSession, getSessionResult } from "@/engine/observation/session";
import { populateFullObservationPhases } from "@/engine/observation/fullObservation";
import { populateAnalysisPhases } from "@/engine/observation/analysis";
import { populateInvestigationPhases } from "@/engine/observation/investigation";
import {
  resolveDataPointSelection,
  resolveDialogueOptionSelection,
} from "@/engine/observation/interactionSelection";
import {
  migrateQuickInteractionSession,
  populateQuickInteractionPhases,
  resolveQuickInteractionChoice,
} from "@/engine/observation/quickInteraction";
import { generateReflection, type ReflectionResult } from "@/engine/observation/reflection";
import { applySessionEvidenceToHypotheses } from "@/engine/observation/evidence";
import { createInsightState, accumulateInsight, calculateCapacity, canUseInsight, spendInsight } from "@/engine/insight/insight";
import { executeInsightAction } from "@/engine/insight/actions";
import { createRNG } from "@/engine/rng";
import { getActiveEquipmentBonuses } from "@/engine/finance";
import { ALL_PERKS } from "@/engine/specializations/perks";
import { calculateSystemFit } from "@/engine/firstTeam";
import { useTutorialStore } from "@/stores/tutorialStore";
import { observePlayerLight } from "@/engine/scout/perception";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { synchronizeInternationalAssignmentProgress } from "@/engine/world/internationalDeliverables";
import {
  claimOpeningDiscovery,
  isOpeningDiscoverySession,
  resolveOpeningCaseChoice as resolveOpeningCaseChoiceEngine,
  shapeOpeningObservationSession,
  type OpeningCaseChoiceId,
} from "@/engine/youth/openingCase";
import { shapeVeteranPrologueSession } from "@/engine/youth/veteranPrologueSession";

const INVESTIGATION_CONTACT_TYPES: Partial<
  Record<ActivityType, GameState["contacts"][string]["type"][]>
> = {
  followUpSession: ["academyCoach", "schoolCoach", "grassrootsOrganizer", "localScout"],
  parentCoachMeeting: ["schoolCoach", "academyCoach", "academyDirector"],
  contractNegotiation: ["agent", "youthAgent"],
  networkMeeting: [
    "agent",
    "scout",
    "clubStaff",
    "journalist",
    "academyCoach",
    "sportingDirector",
    "grassrootsOrganizer",
    "schoolCoach",
    "youthAgent",
    "academyDirector",
    "localScout",
  ],
  agentShowcase: ["agent", "youthAgent"],
  freeAgentOutreach: ["agent", "youthAgent"],
  loanMonitoring: ["clubStaff", "academyCoach", "sportingDirector"],
};

function resolveInvestigationContact(
  gameState: GameState,
  activityType: ActivityType,
  targetPlayerId: string | undefined,
  requestedContactId: string | undefined,
): GameState["contacts"][string] | undefined {
  if (requestedContactId && gameState.contacts[requestedContactId]) {
    return gameState.contacts[requestedContactId];
  }

  const allowedTypes = INVESTIGATION_CONTACT_TYPES[activityType];
  if (!allowedTypes?.length) return undefined;
  const allowed = new Set(allowedTypes);

  return Object.values(gameState.contacts)
    .filter((contact) => allowed.has(contact.type))
    .sort((left, right) => {
      const leftKnowsTarget = targetPlayerId && left.knownPlayerIds.includes(targetPlayerId) ? 1 : 0;
      const rightKnowsTarget = targetPlayerId && right.knownPlayerIds.includes(targetPlayerId) ? 1 : 0;
      return rightKnowsTarget - leftKnowsTarget
        || right.relationship - left.relationship
        || left.id.localeCompare(right.id);
    })[0];
}

function serializeReflectionHypotheses(
  session: ObservationSession,
): ReflectionHypothesisRecord[] {
  return session.hypotheses.map((hypothesis) => ({
    ...hypothesis,
    evidence: hypothesis.evidence.map((item) => ({ ...item })),
  }));
}

function loadOpenHypotheses(
  journal: Record<string, ReflectionJournalEntry>,
  playerIds: Set<string>,
): ObservationSession["hypotheses"] {
  const latestById = new Map<string, ReflectionHypothesisRecord>();
  const entries = Object.values(journal).sort((a, b) => a.createdAt - b.createdAt);

  for (const entry of entries) {
    for (const hypothesis of entry.hypotheses) {
      if (playerIds.has(hypothesis.playerId)) {
        latestById.set(hypothesis.id, hypothesis);
      }
    }
  }

  return [...latestById.values()]
    .filter((hypothesis) => hypothesis.state !== "confirmed" && hypothesis.state !== "debunked")
    .map((hypothesis) => ({
      ...hypothesis,
      evidence: (hypothesis.evidence ?? []).map((item) => ({ ...item })),
    }));
}

function serializeFlaggedMoments(
  session: ObservationSession,
): ReflectionFlaggedMomentRecord[] {
  return session.flaggedMoments.map((flagged) => ({
    id: flagged.id,
    playerId: flagged.moment.playerId,
    phaseIndex: flagged.phaseIndex,
    minute: flagged.minute,
    description: flagged.moment.description,
    reaction: flagged.reaction,
    momentType: flagged.moment.momentType,
    attributesHinted: [...flagged.moment.attributesHinted],
    pressureContext: flagged.moment.pressureContext,
    note: flagged.note,
  }));
}

function getInteractiveObservationContext(
  activityType: ActivityType,
): ObservationContext | null {
  const directContext = new Set<ObservationContext>([
    "schoolMatch",
    "grassrootsTournament",
    "streetFootball",
    "academyTrialDay",
    "youthFestival",
    "academyVisit",
    "youthTournament",
    "followUpSession",
    "reserveMatch",
    "trialMatch",
  ]);
  if (directContext.has(activityType as ObservationContext)) {
    return activityType as ObservationContext;
  }
  if (activityType === "attendMatch" || activityType === "scoutingMission") {
    return "liveMatch";
  }
  if (activityType === "trainingVisit") return "trainingGround";
  return null;
}

function getDominantFocusLens(
  player: ObservationSession["players"][number],
): Observation["focusLens"] | undefined {
  const counts = new Map<Observation["focusLens"], number>();
  for (const entry of player.focusHistory ?? []) {
    if (entry.lens === "general") continue;
    const lens = entry.lens as Observation["focusLens"];
    counts.set(lens, (counts.get(lens) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function toObservationFlaggedMoments(
  session: ObservationSession,
  playerId: string,
): FlaggedMoment[] {
  return session.flaggedMoments
    .filter((flagged) => flagged.moment.playerId === playerId)
    .map((flagged) => ({
      phase: flagged.phaseIndex,
      description: flagged.moment.description,
      attribute: flagged.moment.attributesHinted[0] ?? "composure",
      positive: flagged.reaction === "promising"
        || (flagged.reaction === "interesting" && flagged.moment.quality >= 6),
    }));
}

function collectMomentAttributes(
  session: ObservationSession,
  playerId: string,
  focusedPhases: Set<number>,
): PlayerAttribute[] {
  const ordered = new Set<PlayerAttribute>();
  const flagged = session.flaggedMoments.filter(
    (item) => item.moment.playerId === playerId,
  );
  for (const item of flagged) {
    for (const attribute of item.moment.attributesHinted) ordered.add(attribute);
  }
  for (const phase of session.phases) {
    if (!focusedPhases.has(phase.index)) continue;
    for (const moment of phase.moments) {
      if (moment.playerId !== playerId) continue;
      for (const attribute of moment.attributesHinted) ordered.add(attribute);
    }
  }
  return [...ordered];
}

function resolveSessionPlayerProfile(
  gameState: Pick<GameState, "players" | "unsignedYouth">,
  simulatedYouth: Record<string, UnsignedYouth> | undefined,
  playerId: string,
): Player | null {
  const resolved = resolvePlayerEntity(gameState, playerId);
  if (resolved) return resolved.player;
  return Object.values(simulatedYouth ?? {}).find(
    (youth) => youth.player.id === playerId || youth.id === playerId,
  )?.player ?? null;
}

function applyObservationReveals(player: Player, observation: Observation): Player {
  let updated = player;
  if (
    observation.revealedPersonalityTrait
    && !player.personalityRevealed.includes(observation.revealedPersonalityTrait)
  ) {
    updated = {
      ...updated,
      personalityRevealed: [
        ...updated.personalityRevealed,
        observation.revealedPersonalityTrait,
      ],
    };
  }
  if (observation.updatedPersonalityProfile) {
    updated = {
      ...updated,
      personalityProfile: observation.updatedPersonalityProfile,
    };
  }
  return updated;
}

function buildInteractiveObservationBatch(
  gameState: GameState,
  session: ObservationSession,
  simulatedYouth: Record<string, UnsignedYouth> | undefined,
): {
  observations: Record<string, Observation>;
  observationIds: string[];
  players: GameState["players"];
  unsignedYouth: GameState["unsignedYouth"];
  simulatedYouth?: Record<string, UnsignedYouth>;
} {
  const context = getInteractiveObservationContext(session.activityType);
  const observations: Record<string, Observation> = {};
  const observationIds: string[] = [];
  const players = { ...gameState.players };
  const unsignedYouth = { ...gameState.unsignedYouth };
  const nextSimulatedYouth = simulatedYouth ? { ...simulatedYouth } : undefined;

  if (session.mode !== "fullObservation" || !context) {
    return { observations, observationIds, players, unsignedYouth, simulatedYouth: nextSimulatedYouth };
  }

  const existingObservations = Object.values(gameState.observations);
  for (const sessionPlayer of session.players) {
    const player = resolveSessionPlayerProfile(
      gameState,
      nextSimulatedYouth,
      sessionPlayer.playerId,
    );
    if (!player) continue;

    const focusedPhases = new Set(sessionPlayer.focusedPhases);
    const flaggedMoments = toObservationFlaggedMoments(session, sessionPlayer.playerId);
    const evidenceAttributes = collectMomentAttributes(
      session,
      sessionPlayer.playerId,
      focusedPhases,
    );
    const focusLens = getDominantFocusLens(sessionPlayer);
    const focusDepth = focusedPhases.size;
    const extraAttributes = Math.min(
      4,
      Math.ceil(focusDepth / 2) + (flaggedMoments.length > 0 ? 1 : 0),
    );
    const evidencePasses = focusDepth >= 4 ? 3 : focusDepth >= 2 ? 2 : 1;
    const confidenceBonus = Math.min(
      0.1,
      focusDepth * 0.015 + flaggedMoments.length * 0.01,
    );
    const rng = createRNG(
      `${gameState.seed}-interactive-evidence-${session.id}-${player.id}`,
    );
    const generated = observePlayerLight(
      rng,
      player,
      gameState.scout,
      context,
      existingObservations,
      extraAttributes > 0 ? extraAttributes : undefined,
      {
        evidenceAttributes,
        focusLens,
        confidenceBonus,
        evidencePasses,
        flaggedMoments,
        sourceSessionId: session.id,
        activityInstanceId: session.activityInstanceId,
      },
    );
    const observation: Observation = {
      ...generated,
      week: session.startedAtWeek,
      season: session.startedAtSeason,
    };

    observations[observation.id] = observation;
    observationIds.push(observation.id);
    existingObservations.push(observation);

    const revealedPlayer = applyObservationReveals(player, observation);
    if (players[player.id]) players[player.id] = revealedPlayer;
    for (const [youthId, youth] of Object.entries(unsignedYouth)) {
      if (youth.player.id === player.id) {
        unsignedYouth[youthId] = { ...youth, player: revealedPlayer };
        break;
      }
    }
    if (nextSimulatedYouth) {
      for (const [youthId, youth] of Object.entries(nextSimulatedYouth)) {
        if (youth.player.id === player.id) {
          nextSimulatedYouth[youthId] = { ...youth, player: revealedPlayer };
          break;
        }
      }
    }
  }

  return {
    observations,
    observationIds,
    players,
    unsignedYouth,
    simulatedYouth: nextSimulatedYouth,
  };
}

function persistGutFeeling(
  session: ObservationSession,
  reflectionResult: ReflectionResult | null,
  existingGutFeelings: GutFeeling[],
): { gutFeelings: GutFeeling[]; gutFeelingId?: string } {
  const candidate = reflectionResult?.gutFeelingCandidate;
  if (!candidate) {
    return { gutFeelings: existingGutFeelings };
  }

  const existing = existingGutFeelings.find((gutFeeling) =>
    gutFeeling.playerId === candidate.playerId &&
    gutFeeling.narrative === candidate.narrative &&
    gutFeeling.triggerDomain === candidate.domain &&
    gutFeeling.week === session.startedAtWeek &&
    gutFeeling.season === session.startedAtSeason,
  );

  if (existing) {
    return {
      gutFeelings: existingGutFeelings,
      gutFeelingId: existing.id,
    };
  }

  const persistedGutFeeling: GutFeeling = {
    id: crypto.randomUUID(),
    playerId: candidate.playerId,
    narrative: candidate.narrative,
    triggerDomain: candidate.domain,
    reliability: candidate.reliability,
    week: session.startedAtWeek,
    season: session.startedAtSeason,
  };

  return {
    gutFeelings: [...existingGutFeelings, persistedGutFeeling],
    gutFeelingId: persistedGutFeeling.id,
  };
}

function buildReflectionJournalEntry(
  session: ObservationSession,
  reflectionResult: ReflectionResult | null,
  gutFeelingId: string | undefined,
  observationIds: string[],
): ReflectionJournalEntry | null {
  const notes = session.reflectionNotes
    .map((note) => note.trim())
    .filter((note) => note.length > 0);
  const hypotheses = serializeReflectionHypotheses(session);
  const flaggedMoments = serializeFlaggedMoments(session);
  const summary = reflectionResult?.sessionSummary?.trim();
  const gutFeelingPlayerId = reflectionResult?.gutFeelingCandidate?.playerId;
  const playerIds = Array.from(new Set([
    ...(observationIds.length > 0 ? session.players.map((player) => player.playerId) : []),
    ...session.focusTokens.allocations.map((allocation) => allocation.playerId),
    ...session.flaggedMoments.map((flaggedMoment) => flaggedMoment.moment.playerId),
    ...hypotheses.map((hypothesis) => hypothesis.playerId),
    ...(gutFeelingPlayerId ? [gutFeelingPlayerId] : []),
  ]));

  if (
    notes.length === 0 &&
    hypotheses.length === 0 &&
    flaggedMoments.length === 0 &&
    observationIds.length === 0 &&
    !gutFeelingId &&
    !summary
  ) {
    return null;
  }

  return {
    id: session.id,
    sessionId: session.id,
    activityType: session.activityType,
    week: session.startedAtWeek,
    season: session.startedAtSeason,
    playerIds,
    notes,
    hypotheses,
    flaggedMoments,
    observationIds,
    gutFeelingId,
    summary: summary || undefined,
    createdAt: Date.now(),
  };
}

export function createObservationActions(get: GetState, set: SetState) {
  return {
    startObservationSession: (
      activityType: string,
      playerPool: Array<{ playerId: string; name: string; position: string }>,
      targetPlayerId?: string,
      options?: {
        activityInstanceId?: string;
        returnScreen?: GameScreen;
        contactId?: string;
      },
    ) => {
      const { gameState, weekSimulation } = get();
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
      const playerIds = new Set(dedupedPool.map((player) => player.playerId));
      const initialHypotheses = loadOpenHypotheses(
        gameState.reflectionJournal ?? {},
        playerIds,
      );
      const simulatedYouth = weekSimulation?.youthVenueResults?.updatedUnsignedYouth;
      const playerProfiles = Object.fromEntries(
        dedupedPool.flatMap((entry) => {
          const profile = resolveSessionPlayerProfile(
            gameState,
            simulatedYouth,
            entry.playerId,
          );
          return profile ? [[entry.playerId, profile] as const] : [];
        }),
      );
      const sourceContact = resolveInvestigationContact(
        gameState,
        activityType as ActivityType,
        targetId,
        options?.contactId,
      );

      const config = {
        activityType: activityType as ActivityType,
        activityInstanceId,
        specialization: gameState.scout.primarySpecialization,
        playerPool: dedupedPool,
        initialHypotheses,
        targetPlayerId: targetId,
        seed: `${gameState.seed}-session-${seedKey}`,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
        careerPath: gameState.scout.careerPath as "club" | "independent" | undefined,
        sourceContactId: sourceContact?.id,
        sourceContactName: sourceContact?.name,
        sourceRelationshipScore: sourceContact?.relationship,
      };

      let session = createSession(config, rng);

      // Populate phases for the session's observation mode
      switch (session.mode) {
        case "fullObservation":
          session = populateFullObservationPhases(session, rng, playerProfiles);
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

      const openingLead = targetId ? playerProfiles[targetId] : undefined;
      if (openingLead && isOpeningDiscoverySession(session)) {
        const veteranPrologue = gameState.veteranPrologue;
        session = veteranPrologue
          && veteranPrologue.activityInstanceId === session.activityInstanceId
          ? shapeVeteranPrologueSession(session, openingLead, veteranPrologue)
          : shapeOpeningObservationSession(session, openingLead);
      }

      const completionId = session.activityInstanceId ?? session.id;
      if ((gameState.completedInteractiveSessions ?? []).includes(completionId)) {
        return;
      }

      set({
        activeSession: session,
        gameState: {
          ...gameState,
          activeObservationSession: session,
        },
        sessionReturnScreen: options?.returnScreen
          ?? (get().weekSimulation ? "weekSimulation" : "dashboard"),
        currentScreen: "observation" as GameScreen,
      });
    },

    beginSession: () => {
      const { activeSession, gameState } = get();
      if (!activeSession) return;
      const sessionForStart = activeSession.mode === "quickInteraction"
        ? migrateQuickInteractionSession(
            activeSession,
            createRNG(`${gameState?.seed ?? activeSession.id}-quick-branch-${activeSession.id}`),
          )
        : activeSession;
      const updatedSession = startSession(sessionForStart);
      set({
        activeSession: updatedSession,
        gameState: gameState
          ? { ...gameState, activeObservationSession: updatedSession }
          : gameState,
      });
      if (
        gameState?.scout.primarySpecialization === "youth" &&
        activeSession.state === "setup" &&
        updatedSession.state === "active"
      ) {
        useTutorialStore.getState().completeMilestone("attendedMatch");
      }
    },

    advanceSessionPhase: () => {
      const { activeSession, gameState } = get();
      if (!activeSession) return;
      const sessionForAdvance = activeSession.mode === "quickInteraction"
        ? migrateQuickInteractionSession(
            activeSession,
            createRNG(`${gameState?.seed ?? activeSession.id}-quick-branch-${activeSession.id}`),
          )
        : activeSession;
      const updated = advanceSessionPhase(sessionForAdvance);
      set({
        activeSession: updated,
        gameState: gameState
          ? { ...gameState, activeObservationSession: updated }
          : gameState,
      });

      // If we transitioned to reflection, generate reflection content
      if (updated.state === "reflection" && sessionForAdvance.state === "active") {
        const latestGameState = get().gameState;
        if (!latestGameState) return;
        const rng = createRNG(`${latestGameState.seed}-reflection-${latestGameState.currentWeek}`);
        // Equipment gutFeelingBonus: boost effective intuition for gut feeling trigger chance
        // checkGutFeelingTrigger uses intuition/200 as bonus, so multiply equipment bonus by 200
        const reflEquipBonuses = latestGameState.finances?.equipment
          ? getActiveEquipmentBonuses(latestGameState.finances.equipment.loadout)
          : undefined;
        const gutBoost = (reflEquipBonuses?.gutFeelingBonus ?? 0) * 200;

        // Check if scout has the PA estimate perk (Generational Eye)
        const hasPAEstimatePerk = latestGameState.scout.unlockedPerks.some((perkId) => {
          const perk = ALL_PERKS.find((p) => p.id === perkId);
          return perk?.effect.type === "paEstimate";
        });
        const paAccuracyBonus = reflEquipBonuses?.paEstimateAccuracy ?? 0;

        const reflectionResult = generateReflection(
          updated,
          rng,
          latestGameState.scout.attributes.intuition + gutBoost,
          latestGameState.scout.specializationLevel,
          { paEstimate: hasPAEstimatePerk },
          paAccuracyBonus,
          latestGameState.players,
        );
        set({ lastReflectionResult: reflectionResult });
      }
    },

    allocateSessionFocus: (playerId: string, lens: LensType) => {
      const { activeSession, gameState } = get();
      if (!activeSession) return;
      const wasFocused = activeSession.players.find((player) => player.playerId === playerId)?.isFocused ?? false;
      const updatedSession = allocateFocus(activeSession, playerId, lens);
      set({
        activeSession: updatedSession,
        gameState: gameState
          ? { ...gameState, activeObservationSession: updatedSession }
          : gameState,
      });

      if (
        gameState?.scout.primarySpecialization === "youth" &&
        !wasFocused &&
        updatedSession.players.find((player) => player.playerId === playerId)?.isFocused
      ) {
        useTutorialStore.getState().completeMilestone("focusedPlayer");
      }
    },

    removeSessionFocus: (playerId: string) => {
      const { activeSession, gameState } = get();
      if (!activeSession) return;
      const updatedSession = removeFocus(activeSession, playerId);
      set({
        activeSession: updatedSession,
        gameState: gameState
          ? { ...gameState, activeObservationSession: updatedSession }
          : gameState,
      });
    },

    flagSessionMoment: (momentId: string, reaction: SessionFlaggedMoment['reaction']) => {
      const { activeSession, gameState } = get();
      if (!activeSession) return;
      const updatedSession = flagMoment(activeSession, momentId, reaction);
      set({
        activeSession: updatedSession,
        gameState: gameState
          ? { ...gameState, activeObservationSession: updatedSession }
          : gameState,
      });

      const flaggedMoment = updatedSession.flaggedMoments.find(
        (candidate) => candidate.moment.id === momentId,
      );
      if (
        gameState?.scout.primarySpecialization === "youth"
        && isOpeningDiscoverySession(updatedSession)
        && flaggedMoment?.moment.isStandout
        && flaggedMoment.moment.playerId === gameState.openingCase?.playerId
      ) {
        useTutorialStore.getState().completeMilestone("flaggedBreakthrough");
      }
    },

    addSessionNote: (note: string) => {
      const { activeSession, gameState } = get();
      if (!activeSession) return;
      const updatedSession = addReflectionNote(activeSession, note);
      set({
        activeSession: updatedSession,
        gameState: gameState
          ? { ...gameState, activeObservationSession: updatedSession }
          : gameState,
      });
    },

    addSessionHypothesis: (playerId: string, text: string, domain: string) => {
      const { activeSession, gameState, lastReflectionResult } = get();
      if (!activeSession || !gameState) return;
      const week = gameState.currentWeek;
      const suggested = lastReflectionResult?.suggestedHypotheses.find(
        (hypothesis: ObservationSession["hypotheses"][number]) =>
          hypothesis.playerId === playerId
          && hypothesis.text === text
          && hypothesis.domain === domain,
      );
      const updatedSession = suggested
          ? acceptHypothesis(
              activeSession,
              suggested,
              week,
              gameState.currentSeason,
            )
          : addHypothesis(
              activeSession,
              playerId,
              text,
              domain as AttributeDomain,
              week,
              gameState.currentSeason,
            );
      set({
        activeSession: updatedSession,
        gameState: {
          ...gameState,
          activeObservationSession: updatedSession,
        },
      });

    },

    endObservationSession: () => {
      const {
        activeSession,
        gameState,
        sessionReturnScreen,
        lastReflectionResult,
        weekSimulation,
      } = get();
      if (!activeSession || !gameState) return;
      if (
        isOpeningDiscoverySession(activeSession)
        && activeSession.state !== "reflection"
        && activeSession.state !== "complete"
      ) {
        return;
      }

      const sessionWithEvidence = activeSession.state === "reflection"
        ? applySessionEvidenceToHypotheses(activeSession).session
        : activeSession;
      const completed = completeSession(sessionWithEvidence);
      const result = getSessionResult(completed);
      const didCompleteLifecycle =
        activeSession.state === "reflection" && completed.state === "complete";
      const observationBatch = didCompleteLifecycle
        ? buildInteractiveObservationBatch(
            gameState,
            completed,
            weekSimulation?.youthVenueResults?.updatedUnsignedYouth,
          )
        : {
            observations: {} as Record<string, Observation>,
            observationIds: [] as string[],
            players: gameState.players,
            unsignedYouth: gameState.unsignedYouth,
            simulatedYouth: weekSimulation?.youthVenueResults?.updatedUnsignedYouth,
          };

      // Accumulate insight points
      const scout = gameState.scout;
      const currentInsight = (scout.insightState ?? createInsightState()) as InsightState;
      const capacity = calculateCapacity(scout.attributes.intuition);
      // Incomplete sessions do not bank rewards. Otherwise the same scheduled
      // activity can be abandoned and relaunched to farm its early choices.
      const bankedInsight = didCompleteLifecycle ? result.insightPointsEarned : 0;
      const updatedInsight = accumulateInsight(currentInsight, bankedInsight, capacity);
      const completedFatigue = didCompleteLifecycle
        ? Math.max(0, Math.min(100, scout.fatigue + result.fatigueDelta))
        : scout.fatigue;

      // Track the completed session
      const completedSessions = new Set(gameState.completedInteractiveSessions ?? []);
      if (didCompleteLifecycle) {
        const completionId = completed.activityInstanceId ?? completed.id;
        completedSessions.add(completionId);
      }

      const fallbackReturnScreen: GameScreen =
        get().weekSimulation ? "weekSimulation" : "dashboard";
      const requestedNextScreen = sessionReturnScreen ?? fallbackReturnScreen;
      const {
        gutFeelings: persistedGutFeelings,
        gutFeelingId,
      } = didCompleteLifecycle
        ? persistGutFeeling(
            completed,
            lastReflectionResult as ReflectionResult | null,
            gameState.gutFeelings,
          )
        : { gutFeelings: gameState.gutFeelings, gutFeelingId: undefined };
      const reflectionJournalEntry = didCompleteLifecycle
        ? buildReflectionJournalEntry(
            completed,
            lastReflectionResult as ReflectionResult | null,
            gutFeelingId,
            observationBatch.observationIds,
          )
        : null;
      const reflectionJournal = reflectionJournalEntry
        ? {
            ...gameState.reflectionJournal,
            [reflectionJournalEntry.id]: reflectionJournalEntry,
          }
        : gameState.reflectionJournal;

      const synchronizedState = synchronizeInternationalAssignmentProgress({
        ...gameState,
        activeObservationSession: null,
        players: observationBatch.players,
        unsignedYouth: observationBatch.unsignedYouth,
        observations: {
          ...gameState.observations,
          ...observationBatch.observations,
        },
        scout: {
          ...scout,
          fatigue: completedFatigue,
          insightState: updatedInsight,
        },
        completedInteractiveSessions: didCompleteLifecycle
          ? [...completedSessions]
          : (gameState.completedInteractiveSessions ?? []),
        gutFeelings: persistedGutFeelings,
        reflectionJournal,
      });
      const openingDiscoveryCompleted = didCompleteLifecycle
        && isOpeningDiscoverySession(completed);
      const nextGameState = openingDiscoveryCompleted
        ? claimOpeningDiscovery(synchronizedState)
        : synchronizedState;

      set({
        activeSession: null,
        sessionReturnScreen: null,
        lastReflectionResult: null,
        currentScreen: openingDiscoveryCompleted
          ? "openingDiscovery" as GameScreen
          : requestedNextScreen,
        weekSimulation: weekSimulation?.youthVenueResults && observationBatch.simulatedYouth
          ? {
              ...weekSimulation,
              youthVenueResults: {
                ...weekSimulation.youthVenueResults,
                updatedUnsignedYouth: observationBatch.simulatedYouth,
              },
            }
          : weekSimulation,
        gameState: nextGameState,
      });

      if (
        didCompleteLifecycle &&
        gameState.scout.primarySpecialization === "youth"
      ) {
        useTutorialStore.getState().completeMilestone("completedMatch");
      }
    },

    resolveOpeningDiscoveryChoice: (choiceId: OpeningCaseChoiceId) => {
      const { gameState } = get();
      if (!gameState) return;
      const resolved = resolveOpeningCaseChoiceEngine(gameState, choiceId);
      if (resolved === gameState) return;
      set({
        gameState: resolved,
        selectedPlayerId: resolved.openingCase?.playerId ?? get().selectedPlayerId,
        currentScreen: "reportWriter" as GameScreen,
      });
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Insight Actions
    // ═══════════════════════════════════════════════════════════════════════════

    useInsight: (actionId: InsightActionId) => {
      const { activeSession, gameState } = get();
      if (!activeSession || !gameState) return false;

      const scout = gameState.scout;
      const insightState = (scout.insightState ?? createInsightState()) as InsightState;

      // Check if can use
      const check = canUseInsight(insightState, actionId, scout, activeSession.mode);
      if (!check.canUse) return false;

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
      return true;
    },

    dismissInsightResult: () => {
      set({ lastInsightResult: null });
    },

    selectDialogueOption: (nodeId: string, optionId: string) => {
      const { activeSession, gameState } = get();
      if (!activeSession || !gameState) return;

      const selection = resolveDialogueOptionSelection(activeSession, nodeId, optionId);
      if (!selection.applied || !selection.resolution) return;

      const sourceContactId = selection.resolution.sourceContactId;
      const sourceContact = sourceContactId
        ? gameState.contacts[sourceContactId]
        : undefined;
      const contacts = sourceContact
        ? {
            ...gameState.contacts,
            [sourceContact.id]: {
              ...sourceContact,
              relationship: selection.session.sourceRelationshipScore
                ?? sourceContact.relationship,
              lastInteractionWeek: gameState.currentWeek,
              dormant: (selection.session.sourceRelationshipScore
                ?? sourceContact.relationship) <= 20,
            },
          }
        : gameState.contacts;
      const updatedGameState = {
        ...gameState,
        contacts,
        activeObservationSession: selection.session,
      };

      set({
        activeSession: selection.session,
        gameState: updatedGameState,
      });
    },

    selectDataPoint: (pointId: string) => {
      const { activeSession, gameState } = get();
      if (!activeSession || !gameState) return;

      const selection = resolveDataPointSelection(activeSession, pointId);
      if (!selection.applied) return;

      set({
        activeSession: selection.session,
        gameState: {
          ...gameState,
          activeObservationSession: selection.session,
        },
      });
    },

    selectStrategicChoice: (choiceId: string) => {
      const { activeSession, gameState } = get();
      if (!activeSession || activeSession.state !== "active") return;
      const rng = createRNG(
        `${gameState?.seed ?? activeSession.id}-quick-branch-${activeSession.id}`,
      );
      const updatedSession = resolveQuickInteractionChoice(activeSession, choiceId, rng);
      set({
        activeSession: updatedSession,
        gameState: gameState
          ? { ...gameState, activeObservationSession: updatedSession }
          : gameState,
      });
    },
  };
}
