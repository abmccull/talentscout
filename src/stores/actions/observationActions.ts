/**
 * Observation session & insight actions extracted from gameStore.
 *
 * Handles interactive observation sessions (fullObservation, analysis,
 * investigation, quickInteraction), focus allocation, moment flagging,
 * reflection generation, insight spending, and session lifecycle.
 */
import type { GetState, SetState } from "./types";
import type { GameScreen } from "../gameStoreTypes";
import type { LensType, ObservationSession, SessionFlaggedMoment } from "@/engine/observation/types";
import type { InsightActionId } from "@/engine/insight/types";
import { INSIGHT_FATIGUE_COST } from "@/engine/insight/types";
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
import {
  applyInsightActionResult,
  normalizeInsightState,
} from "@/engine/insight/effects";
import { createRNG } from "@/engine/rng";
import { getActiveEquipmentBonuses } from "@/engine/finance";
import { ALL_PERKS } from "@/engine/specializations/perks";
import { useTutorialStore } from "@/stores/tutorialStore";
import { observePlayerLight } from "@/engine/scout/perception";
import {
  applyRegionalPresenceToObservation,
  getPlayerScoutingCountry,
} from "@/engine/world/regionalPresence";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { synchronizeInternationalAssignmentProgress } from "@/engine/world/internationalDeliverables";
import { isScoutAbroad } from "@/engine/world/travel";
import { normalizeCountryKey } from "@/lib/country";
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
  const context = session.situation?.observationContext
    ?? getInteractiveObservationContext(session.activityType);
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
        situation: session.situation,
      },
    );
    const observation = applyRegionalPresenceToObservation(gameState, {
      ...generated,
      week: session.startedAtWeek,
      season: session.startedAtSeason,
    } satisfies Observation);

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

function buildInsightPlayerIndex(
  gameState: GameState,
  simulatedYouth?: Record<string, UnsignedYouth>,
): Record<string, Player> {
  const players: Record<string, Player> = { ...gameState.players };
  const addYouth = (youth: UnsignedYouth) => {
    players[youth.id] = youth.player;
    players[youth.player.id] = youth.player;
  };
  Object.values(gameState.unsignedYouth).forEach(addYouth);
  Object.values(simulatedYouth ?? {}).forEach(addYouth);
  return players;
}

function resolveInsightTargetPlayerId(session: ObservationSession): string | undefined {
  return session.focusTokens.allocations[0]?.playerId
    ?? session.players.find((player) => player.isFocused)?.playerId
    ?? session.players[0]?.playerId;
}

function resolveInsightLeagueContext(
  gameState: GameState,
  session: ObservationSession,
  players: Record<string, Player>,
  targetPlayerId?: string,
): { leagueId?: string; leaguePlayers?: Player[] } {
  const sessionPlayerIds = [
    ...(targetPlayerId ? [targetPlayerId] : []),
    ...session.players.map((player) => player.playerId),
  ];
  let leagueId = sessionPlayerIds
    .map((playerId) => players[playerId])
    .map((player) => player && gameState.clubs[player.clubId]?.leagueId)
    .find((candidate): candidate is string => !!candidate && !!gameState.leagues[candidate]);

  if (!leagueId && session.countryId) {
    const countryId = normalizeCountryKey(session.countryId);
    leagueId = Object.values(gameState.leagues)
      .filter((league) => normalizeCountryKey(league.country) === countryId)
      .sort((left, right) => left.tier - right.tier || left.id.localeCompare(right.id))[0]?.id;
  }
  if (!leagueId && session.mode === "analysis") {
    leagueId = Object.values(gameState.leagues)
      .sort((left, right) => left.tier - right.tier || left.id.localeCompare(right.id))[0]?.id;
  }
  if (!leagueId) return {};

  const league = gameState.leagues[leagueId];
  const clubIds = new Set(league.clubIds);
  const leaguePlayers = Array.from(
    new Map(
      Object.values(players)
        .filter((player) => clubIds.has(player.clubId))
        .map((player) => [player.id, player] as const),
    ).values(),
  );
  return { leagueId, leaguePlayers };
}

function resolveInsightSubRegionId(
  gameState: GameState,
  session: ObservationSession,
  targetPlayerId?: string,
): string | undefined {
  const activityInstanceId = session.activityInstanceId?.replace(/:d\d+$/, "");
  const scheduledActivity = activityInstanceId
    ? gameState.schedule?.activities.find(
        (activity) => activity?.instanceId === activityInstanceId,
      )
    : undefined;
  const scheduledTargetId = scheduledActivity?.targetId;
  if (scheduledTargetId && gameState.subRegions[scheduledTargetId]) {
    return scheduledTargetId;
  }
  const tournamentSubRegionId = scheduledTargetId
    ? gameState.youthTournaments[scheduledTargetId]?.subRegionId
    : undefined;
  if (tournamentSubRegionId && gameState.subRegions[tournamentSubRegionId]) {
    return tournamentSubRegionId;
  }

  const targetYouth = Object.values(gameState.unsignedYouth).find(
    (youth) =>
      youth.id === targetPlayerId
      || youth.player.id === targetPlayerId
      || youth.id === scheduledTargetId
      || youth.player.id === scheduledTargetId,
  );
  if (targetYouth?.regionId && gameState.subRegions[targetYouth.regionId]) {
    return targetYouth.regionId;
  }

  const countryId = normalizeCountryKey(session.countryId);
  return Object.values(gameState.subRegions)
    .filter((subRegion) =>
      normalizeCountryKey(subRegion.countryKey ?? subRegion.country) === countryId,
    )
    .sort((left, right) => right.familiarity - left.familiarity || left.id.localeCompare(right.id))[0]?.id;
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
      const countryId = targetId
        ? getPlayerScoutingCountry(gameState, targetId)
        : undefined;
      const regionalKnowledge = countryId
        ? gameState.regionalKnowledge[countryId]
          ?? Object.values(gameState.regionalKnowledge).find(
            (knowledge) => knowledge.countryId === countryId,
          )
        : undefined;
      const activeTravelPosture = gameState.scout.travelBooking
        && isScoutAbroad(gameState.scout, gameState.currentWeek)
        && normalizeCountryKey(gameState.scout.travelBooking.destinationCountry) === countryId
        ? gameState.scout.travelBooking.posture
        : undefined;

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
        countryId,
        culturalInsights: regionalKnowledge?.culturalInsights,
        travelPosture: activeTravelPosture,
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
      const currentInsight = normalizeInsightState(
        scout.insightState ?? createInsightState(),
      );
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
      const { activeSession, gameState, weekSimulation } = get();
      if (!activeSession || !gameState) return false;

      const scout = gameState.scout;
      const insightState = normalizeInsightState(
        scout.insightState ?? createInsightState(),
      );

      // Check if can use
      const check = canUseInsight(insightState, actionId, scout, activeSession.mode);
      if (!check.canUse) return false;

      // Spend IP and check for fizzle
      const rng = createRNG(`${gameState.seed}-insight-${gameState.currentWeek}-${actionId}`);
      const { state: newInsightState, fizzled } = spendInsight(
        insightState, actionId, scout,
        gameState.currentWeek, gameState.currentSeason, rng
      );

      const simulatedUnsignedYouth = weekSimulation?.youthVenueResults?.updatedUnsignedYouth;
      const players = buildInsightPlayerIndex(gameState, simulatedUnsignedYouth);
      const targetPlayerId = resolveInsightTargetPlayerId(activeSession);
      const leagueContext = resolveInsightLeagueContext(
        gameState,
        activeSession,
        players,
        targetPlayerId,
      );

      // Execute the action against complete session, geography, and league context.
      const context = {
        scout,
        session: activeSession,
        targetPlayerId,
        players,
        contacts: gameState.contacts,
        subRegionId: resolveInsightSubRegionId(
          gameState,
          activeSession,
          targetPlayerId,
        ),
        ...leagueContext,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
      };
      const result = executeInsightAction(actionId, context, rng, fizzled);

      const applied = applyInsightActionResult({
        state: gameState,
        session: activeSession,
        context,
        result,
        insightState: newInsightState,
        simulatedUnsignedYouth,
      });
      const nextGameState = {
        ...applied.state,
        scout: {
          ...applied.state.scout,
          fatigue: Math.min(100, scout.fatigue + INSIGHT_FATIGUE_COST),
        },
      };
      const nextWeekSimulation = weekSimulation?.youthVenueResults
        && applied.simulatedUnsignedYouth
        ? {
            ...weekSimulation,
            youthVenueResults: {
              ...weekSimulation.youthVenueResults,
              updatedUnsignedYouth: applied.simulatedUnsignedYouth,
            },
          }
        : weekSimulation;

      set({
        gameState: nextGameState,
        weekSimulation: nextWeekSimulation,
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
              lastInteractionAt: {
                season: gameState.currentSeason,
                week: gameState.currentWeek,
              },
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
