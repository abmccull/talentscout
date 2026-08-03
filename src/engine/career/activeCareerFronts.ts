import type {
  AlumniRecord,
  GameState,
  InboxMessage,
  Player,
} from "@/engine/core/types";
import {
  createDecisionRecord,
  registerDecision,
  type DecisionOption,
  type DecisionRecord,
  type EntityRef,
} from "@/engine/consequences";
import {
  addGameWeeks,
  createGameCalendarIndex,
  gameWeeksBetweenWithCalendar,
} from "@/engine/core/gameDate";
import { getSeasonLength } from "@/engine/core/gameLoop";
import { compareGameDates } from "@/engine/consequences/decisionLedger";
import type { StoryCandidateV2 } from "@/engine/events/storyDirectorV2";
import { createNamedRNG } from "@/engine/run";
import {
  createDevelopmentEnvironmentIndex,
  projectCurrentPlayerCareerEnvironment,
  type DevelopmentEnvironmentIndex,
  type DevelopmentEnvironmentFactor,
  type PlayerDevelopmentEnvironmentProjection,
} from "@/engine/world/developmentEnvironment";

export type ActiveCareerFrontKind = "stalledPathway";
export type ActiveCareerFrontTrigger = "released" | "restrictedEnvironment";
export type ActiveCareerFrontUrgency = "watch" | "pressing" | "critical";
export type ActiveCareerFrontDecisionStatus =
  | "unaddressed"
  | "offered"
  | "monitoring"
  | "resolved";

export interface ActiveCareerFront {
  id: string;
  kind: ActiveCareerFrontKind;
  trigger: ActiveCareerFrontTrigger;
  urgency: ActiveCareerFrontUrgency;
  decisionStatus: ActiveCareerFrontDecisionStatus;
  decisionId: string;
  playerId: string;
  playerName: string;
  clubId?: string;
  clubName: string;
  alumniRecordId: string;
  caseId?: string;
  reportId?: string;
  title: string;
  premise: string;
  stakes: string[];
  originalEnvironment: PlayerDevelopmentEnvironmentProjection;
  evidenceIds: string[];
  score: number;
}

export interface PreparedActiveCareerFront {
  front: ActiveCareerFront;
  candidate: StoryCandidateV2;
  decision: DecisionRecord;
  message: InboxMessage;
}

export interface ApplyPreparedActiveCareerFrontResult {
  state: GameState;
  changed: boolean;
  error?: string;
}

const MIN_PATHWAY_AGE_WEEKS = 8;
const CALLBACK_DELAY_WEEKS = 8;
const DECISION_WINDOW_WEEKS = 2;
const NEW_FRONT_REVIEW_CADENCE_WEEKS = 4;

interface ActiveCareerFrontProjectionOptions {
  /** Candidate discovery can skip careers that already own a ledger record. */
  onlyUnaddressed?: boolean;
}

interface ActiveCareerFrontAuthority {
  decisionId?: string;
  status: ActiveCareerFrontDecisionStatus;
}

function metadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function playerName(player: Player): string {
  return `${player.firstName} ${player.lastName}`.trim() || "A former prospect";
}

function latestSeasonAppearances(record: AlumniRecord): number {
  return [...(record.seasonStats ?? [])]
    .sort((left, right) => right.season - left.season)[0]?.appearances ?? 0;
}

function strongestVisibleRisk(
  projection: PlayerDevelopmentEnvironmentProjection,
): DevelopmentEnvironmentFactor | undefined {
  return projection.factors.find((factor) => factor.impact === "strong-negative")
    ?? projection.factors.find((factor) => factor.impact === "negative");
}

function pathwayRisk(
  projection: PlayerDevelopmentEnvironmentProjection,
): DevelopmentEnvironmentFactor | undefined {
  return projection.factors.find((factor) =>
    factor.id === "playing-pathway"
    && (factor.impact === "negative" || factor.impact === "strong-negative"),
  );
}

function decisionStatus(
  state: GameState,
  playerId: string,
  alumniRecordId: string,
): ActiveCareerFrontAuthority {
  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const matchingDecisions = Object.values(state.consequenceState.decisions)
    .filter((decision) =>
      decision.source.kind === "activeCareerFront"
      && metadataString(decision.metadata, "playerId") === playerId
      && metadataString(decision.metadata, "alumniRecordId") === alumniRecordId,
    )
    .sort((left, right) =>
      compareGameDates(
        right.selectedAt ?? right.offeredAt,
        left.selectedAt ?? left.offeredAt,
        seasonLength,
      )
      || right.id.localeCompare(left.id),
    );
  const matchingDecisionIds = new Set(matchingDecisions.map((decision) => decision.id));
  const offered = matchingDecisions.find((decision) => decision.status === "offered");
  if (offered) return { decisionId: offered.id, status: "offered" };

  const selected = matchingDecisions.find((decision) => decision.status === "selected");
  if (selected) return { decisionId: selected.id, status: "monitoring" };

  const pendingCallback = Object.values(state.consequenceState.callbacks)
    .find((callback) => {
      if (callback.status !== "pending") return false;
      const consequence = state.consequenceState.consequences[callback.consequenceId];
      return Boolean(consequence && matchingDecisionIds.has(consequence.decisionId));
    });
  if (pendingCallback) {
    const consequence = state.consequenceState.consequences[pendingCallback.consequenceId];
    return consequence
      ? { decisionId: consequence.decisionId, status: "monitoring" }
      : { status: "monitoring" };
  }

  const liveResponseFact = Object.values(state.consequenceState.facts)
    .filter((fact) =>
      fact.kind === "activeCareerFrontResponse"
      && fact.subject?.kind === "player"
      && fact.subject.id === playerId
      && metadataString(fact.metadata, "alumniRecordId") === alumniRecordId,
    )
    .sort((left, right) =>
      compareGameDates(right.observedAt, left.observedAt, seasonLength)
      || right.id.localeCompare(left.id),
    )[0];
  if (liveResponseFact) {
    return {
      decisionId: liveResponseFact.sourceDecisionId,
      status: "monitoring",
    };
  }

  return { status: "unaddressed" };
}

function activeFrontForAlumni(input: {
  state: GameState;
  record: AlumniRecord;
  player: Player;
  elapsedWeeks: number;
  appearances: number;
  projection: PlayerDevelopmentEnvironmentProjection;
}): ActiveCareerFront | undefined {
  const { state, record, player, elapsedWeeks, appearances, projection } = input;
  if (elapsedWeeks < MIN_PATHWAY_AGE_WEEKS || record.currentStatus === "retired") {
    return undefined;
  }

  const released = record.currentStatus === "released" && !player.clubId;
  const visiblePathwayRisk = pathwayRisk(projection);
  const restricted = (
    projection.band === "restricted" || projection.band === "adverse"
  ) && Boolean(visiblePathwayRisk) && appearances <= 3;
  if (!released && !restricted) return undefined;

  const trigger: ActiveCareerFrontTrigger = released
    ? "released"
    : "restrictedEnvironment";
  const clubId = player.clubId || record.currentClubId || record.placedClubId || undefined;
  const clubName = clubId ? state.clubs[clubId]?.name ?? projection.clubName : projection.clubName;
  const name = playerName(player);
  const authority = decisionStatus(state, player.id, record.id);
  const decisionId = authority.decisionId
    ?? `active-career-front:stalled-pathway:${record.id}:s${state.currentSeason}`;
  const risk = visiblePathwayRisk ?? strongestVisibleRisk(projection);
  const urgency: ActiveCareerFrontUrgency = released || projection.band === "adverse"
    ? "critical"
    : projection.score <= 35
      ? "pressing"
      : "watch";
  const score = Math.min(
    100,
    (released ? 72 : 48)
      + Math.max(0, 45 - projection.score)
      + Math.min(12, Math.floor(elapsedWeeks / 4)),
  );
  const premise = released
    ? `${name} has left ${clubName}. The route created by your recommendation has broken before it became a stable senior pathway.`
    : `${name}'s route at ${clubName} has stalled. ${risk?.summary ?? projection.summary}`;
  const stakes = released
    ? [
        "A player you placed needs a credible route back into structured football.",
        "Your original recommendation and the club relationship are both exposed.",
        "How you respond will be compared with the next eight weeks of the player's career.",
      ]
    : [
        `Only ${appearances} appearance${appearances === 1 ? "" : "s"} are recorded in the latest season sample.`,
        "Pushing now may protect the player while straining the club relationship.",
        "Waiting protects access but keeps your reputation attached to the current timetable.",
      ];

  return {
    id: decisionId,
    kind: "stalledPathway",
    trigger,
    urgency,
    decisionStatus: authority.status,
    decisionId,
    playerId: player.id,
    playerName: name,
    ...(clubId ? { clubId } : {}),
    clubName,
    alumniRecordId: record.id,
    ...(record.caseId ? { caseId: record.caseId } : {}),
    ...(record.originatingReportId || record.placementReportId
      ? { reportId: record.originatingReportId ?? record.placementReportId }
      : {}),
    title: released
      ? `${name}: the pathway has collapsed`
      : `${name}: the pathway is stalling`,
    premise,
    stakes,
    originalEnvironment: projection,
    evidenceIds: [
      record.id,
      player.id,
      ...(record.caseId ? [record.caseId] : []),
      ...(record.originatingReportId ? [record.originatingReportId] : []),
      ...(record.placementReportId ? [record.placementReportId] : []),
    ],
    score,
  };
}

/**
 * Project live career pressure from existing player, placement, and world
 * authorities. Fronts are never persisted: the decision ledger owns choices
 * and the simulated player career owns the eventual outcome.
 */
export function projectActiveCareerFronts(
  state: GameState,
  options: ActiveCareerFrontProjectionOptions = {},
): ActiveCareerFront[] {
  if (state.scout.primarySpecialization !== "youth") return [];
  if ((state.alumniRecords ?? []).length === 0) return [];
  const calendar = createGameCalendarIndex(state.fixtures);
  let developmentIndex: DevelopmentEnvironmentIndex | undefined;
  const now = { season: state.currentSeason, week: state.currentWeek };
  const fronts: ActiveCareerFront[] = [];

  for (const record of state.alumniRecords ?? []) {
    if (
      record.currentStatus !== "released"
      && record.currentStatus !== "academy"
      && record.currentStatus !== "loaned"
    ) continue;
    const elapsedWeeks = gameWeeksBetweenWithCalendar(
      calendar,
      { season: record.placedSeason, week: record.placedWeek },
      now,
    );
    if (elapsedWeeks < MIN_PATHWAY_AGE_WEEKS) continue;
    const player = state.players[record.playerId] ?? state.retiredPlayers?.[record.playerId];
    if (!player) continue;
    const released = record.currentStatus === "released" && !player.clubId;
    const appearances = latestSeasonAppearances(record);
    // Appearance volume is the cheapest pathway-health evidence. Avoid the
    // full fixture/club index when a contracted player's route is visibly live.
    if (!released && appearances > 3) continue;
    if (options.onlyUnaddressed && decisionStatus(state, player.id, record.id).status !== "unaddressed") {
      continue;
    }
    // Released/unattached careers have an authoritative public projection and
    // must never pay to construct the contracted-player world index.
    const projection = !player.clubId
      ? projectCurrentPlayerCareerEnvironment(state, player)
      : projectCurrentPlayerCareerEnvironment(state, player, {
          index: developmentIndex ??= createDevelopmentEnvironmentIndex(state),
        });
    const front = activeFrontForAlumni({
      state,
      record,
      player,
      elapsedWeeks,
      appearances,
      projection,
    });
    if (front) fronts.push(front);
  }

  const urgencyRank: Record<ActiveCareerFrontUrgency, number> = {
    critical: 3,
    pressing: 2,
    watch: 1,
  };
  return fronts.sort((left, right) =>
    urgencyRank[right.urgency] - urgencyRank[left.urgency]
    || right.score - left.score
    || left.id.localeCompare(right.id),
  );
}

function stakeholderRefs(state: GameState, front: ActiveCareerFront): EntityRef[] {
  const refs: EntityRef[] = [{ kind: "player", id: front.playerId }];
  if (front.clubId && state.clubs[front.clubId]) {
    refs.push({ kind: "club", id: front.clubId });
  }
  return refs;
}

function optionEffects(input: {
  state: GameState;
  front: ActiveCareerFront;
  optionId: string;
  detail: string;
  reputationDelta: number;
  fatigueDelta: number;
  clubTrustDelta: number;
  memoryTags: string[];
  memoryValence: number;
}): DecisionOption["immediateEffects"] {
  const { state, front, optionId } = input;
  const prefix = `effect:${front.decisionId}:${optionId}`;
  const routeEffectExpiresAt = addGameWeeks(
    state.fixtures,
    { week: state.currentWeek, season: state.currentSeason },
    CALLBACK_DELAY_WEEKS,
  );
  const stakeholder: EntityRef = front.clubId && state.clubs[front.clubId]
    ? { kind: "club", id: front.clubId }
    : { kind: "player", id: front.playerId };
  return [
    {
      id: `${prefix}:reputation`,
      type: "adjustMetric",
      metricKey: "scout:reputation",
      delta: input.reputationDelta,
      min: 0,
      max: 100,
    },
    {
      id: `${prefix}:fatigue`,
      type: "adjustMetric",
      metricKey: "scout:fatigue",
      delta: input.fatigueDelta,
      min: 0,
      max: 100,
    },
    {
      id: `${prefix}:club-trust`,
      type: "adjustMetric",
      metricKey: "scout:clubTrust",
      delta: input.clubTrustDelta,
      min: 0,
      max: 100,
    },
    {
      id: `${prefix}:fact`,
      type: "recordFact",
      fact: {
        id: `fact:${front.decisionId}:${optionId}`,
        kind: "activeCareerFrontResponse",
        subject: { kind: "player", id: front.playerId },
        value: optionId,
        observedAt: { week: state.currentWeek, season: state.currentSeason },
        expiresAt: routeEffectExpiresAt,
        visibility: "stakeholders",
        sourceDecisionId: front.decisionId,
        metadata: {
          frontId: front.id,
          alumniRecordId: front.alumniRecordId,
          detail: input.detail,
          routeEffectVersion: 1,
          routeEffectKind: optionId === "back-pathway"
            ? "stability"
            : optionId === "reopen-route"
              ? "exposure"
              : "recalibration",
          routeEffectExpiresSeason: routeEffectExpiresAt.season,
          routeEffectExpiresWeek: routeEffectExpiresAt.week,
        },
      },
    },
    {
      id: `${prefix}:memory`,
      type: "addMemory",
      memory: {
        id: `memory:${front.decisionId}:${optionId}`,
        stakeholder,
        subject: { kind: "scout", id: state.scout.id },
        tags: input.memoryTags,
        valence: input.memoryValence,
        intensity: 62,
        salience: 70,
        visibility: "stakeholders",
        createdAt: { week: state.currentWeek, season: state.currentSeason },
        sourceDecisionId: front.decisionId,
        halfLifeWeeks: 24,
        metadata: {
          frontId: front.id,
          playerId: front.playerId,
          detail: input.detail,
        },
      },
    },
  ];
}

function callbackTemplate(
  state: GameState,
  front: ActiveCareerFront,
  optionId: string,
) {
  const dueAt = addGameWeeks(
    state.fixtures,
    { week: state.currentWeek, season: state.currentSeason },
    CALLBACK_DELAY_WEEKS,
  );
  return [{
    id: `active-career-front-review:${optionId}`,
    dueAt,
    effects: [{
      id: `effect:${front.decisionId}:${optionId}:review-due`,
      type: "recordFact" as const,
      fact: {
        id: `fact:${front.decisionId}:${optionId}:review-due`,
        kind: "activeCareerFrontReviewDue",
        subject: { kind: "player", id: front.playerId },
        value: optionId,
        observedAt: dueAt,
        visibility: "stakeholders" as const,
        sourceDecisionId: front.decisionId,
        metadata: {
          frontId: front.id,
          alumniRecordId: front.alumniRecordId,
          originalEnvironmentScore: front.originalEnvironment.score,
        },
      },
    }],
    tags: ["active-career-front", "pathway-callback"],
  }];
}

function buildOptions(state: GameState, front: ActiveCareerFront): DecisionOption[] {
  const routeLabel = front.trigger === "released"
    ? "Reopen the route search"
    : "Push for a new route";
  const patienceLabel = front.trigger === "released"
    ? "Challenge the placement club"
    : "Back the current timetable";
  const patienceDetail = front.trigger === "released"
    ? `You challenged ${front.clubName} to help rebuild ${front.playerName}'s route.`
    : `You publicly backed ${front.clubName}'s timetable for ${front.playerName}.`;
  return [
    {
      id: "back-pathway",
      label: patienceLabel,
      knownTradeoffs: front.trigger === "released"
        ? [
            "Keeps the original club accountable for the route it offered.",
            "Creates an eight-week stability window around the player's development routine.",
            "Direct pressure can damage access if the club rejects responsibility.",
          ]
        : [
            "Protects trust and gives the club's development plan more time.",
            "Creates an eight-week stability window around the player's development routine.",
            "Your reputation stays attached to a pathway that may remain blocked.",
          ],
      immediateEffects: optionEffects({
        state,
        front,
        optionId: "back-pathway",
        detail: patienceDetail,
        reputationDelta: 0,
        fatigueDelta: front.trigger === "released" ? 3 : 1,
        clubTrustDelta: front.trigger === "released" ? -3 : 2,
        memoryTags: front.trigger === "released"
          ? ["pathway", "challenged", "accountability"]
          : ["pathway", "patience", "backed-plan"],
        memoryValence: front.trigger === "released" ? -18 : 18,
      }),
      scheduledConsequences: callbackTemplate(state, front, "back-pathway"),
    },
    {
      id: "reopen-route",
      label: routeLabel,
      knownTradeoffs: [
        "Creates an eight-week showcase window around the player's current route.",
        "Extra exposure raises breakthrough opportunity but disrupts training continuity.",
        "The current club may read the intervention as a vote of no confidence.",
      ],
      immediateEffects: optionEffects({
        state,
        front,
        optionId: "reopen-route",
        detail: `You put your name behind finding a new route for ${front.playerName}.`,
        reputationDelta: 1,
        fatigueDelta: 5,
        clubTrustDelta: -2,
        memoryTags: ["pathway", "intervention", "player-first"],
        memoryValence: 8,
      }),
      scheduledConsequences: callbackTemplate(state, front, "reopen-route"),
    },
    {
      id: "revise-call",
      label: "Revise the original call",
      knownTradeoffs: [
        "Owns the evidence change and protects long-term calibration.",
        "Ends active route advocacy for eight weeks while the original judgment is reset.",
        "Costs reputation now and may close the original route permanently.",
      ],
      immediateEffects: optionEffects({
        state,
        front,
        optionId: "revise-call",
        detail: `You revised your original pathway judgment on ${front.playerName}.`,
        reputationDelta: -2,
        fatigueDelta: 1,
        clubTrustDelta: 1,
        memoryTags: ["pathway", "honesty", "recalibration"],
        memoryValence: 12,
      }),
      scheduledConsequences: callbackTemplate(state, front, "revise-call"),
    },
  ];
}

export function prepareWeeklyActiveCareerFrontCandidate(
  state: GameState,
): PreparedActiveCareerFront | undefined {
  if (Object.values(state.consequenceState.decisions).some((decision) =>
    decision.status === "offered" && decision.source.kind === "activeCareerFront",
  )) return undefined;
  // New career pressure is reviewed on a bounded cadence. Existing/open fronts
  // remain available through the uncadenced public projector and dashboard.
  if (state.currentWeek % NEW_FRONT_REVIEW_CADENCE_WEEKS !== 0) return undefined;
  const front = projectActiveCareerFronts(state, { onlyUnaddressed: true })[0];
  if (!front) return undefined;

  const now = { week: state.currentWeek, season: state.currentSeason };
  const stakeholders = stakeholderRefs(state, front);
  const options = buildOptions(state, front);
  const decision = createDecisionRecord({
    id: front.decisionId,
    source: { kind: "activeCareerFront", id: front.id },
    offeredAt: now,
    deadlineAt: addGameWeeks(state.fixtures, now, DECISION_WINDOW_WEEKS),
    visibility: "stakeholders",
    stakeholders,
    options,
    defaultOptionId: "back-pathway",
    outcomeRoll: createNamedRNG(
      state.runManifest.rootSeed,
      "active-career-front-outcome",
      front.decisionId,
    ).next(),
    opportunitySetId: `opportunity-set:${front.id}:response`,
    metadata: {
      title: front.title,
      premise: [front.premise, ...front.stakes].join(" "),
      frontId: front.id,
      frontKind: front.kind,
      frontTrigger: front.trigger,
      playerId: front.playerId,
      relatedPlayerId: front.playerId,
      playerName: front.playerName,
      alumniRecordId: front.alumniRecordId,
      ...(front.clubId ? { clubId: front.clubId } : {}),
      ...(front.caseId ? { caseId: front.caseId } : {}),
      ...(front.reportId ? { reportId: front.reportId } : {}),
      originalEnvironmentScore: front.originalEnvironment.score,
      originalEnvironmentBand: front.originalEnvironment.band,
      callbackDelayWeeks: CALLBACK_DELAY_WEEKS,
      semanticSignature: `active-career-front:${front.kind}:${front.trigger}`,
    },
  });
  const candidate: StoryCandidateV2 = {
    id: `candidate:${front.id}`,
    templateId: `active-career-front:${front.kind}`,
    kind: "callback",
    category: "active-career-front",
    semanticSignature: `active-career-front:${front.kind}:${front.trigger}:${front.playerId}`,
    baseWeight: 2 + front.score / 100,
    cast: stakeholders,
    topics: [
      { kind: "player", id: front.playerId },
      { kind: "alumniRecord", id: front.alumniRecordId },
    ],
    requiresChoice: true,
    templateCooldownWeeks: 6,
    semanticCooldownWeeks: 8,
    castWindowWeeks: 8,
    castMaxUses: 1,
    topicCooldownWeeks: 6,
  };
  const message: InboxMessage = {
    id: `inbox:${front.decisionId}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "feedback",
    title: front.title,
    body: [front.premise, ...front.stakes].join("\n\n"),
    read: false,
    actionRequired: true,
    relatedId: front.decisionId,
    relatedEntityType: "narrative",
  };
  return { front, candidate, decision, message };
}

export function applyPreparedActiveCareerFront(
  state: GameState,
  prepared: PreparedActiveCareerFront,
): ApplyPreparedActiveCareerFrontResult {
  const registered = registerDecision(state.consequenceState, prepared.decision);
  if (registered.error) return { state, changed: false, error: registered.error };
  const hasMessage = state.inbox.some((message) => message.id === prepared.message.id);
  if (!registered.changed && hasMessage) return { state, changed: false };
  return {
    state: {
      ...state,
      consequenceState: registered.state,
      inbox: hasMessage ? state.inbox : [...state.inbox, prepared.message],
    },
    changed: registered.changed || !hasMessage,
  };
}
