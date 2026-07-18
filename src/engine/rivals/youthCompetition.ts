/**
 * Pure rival competition for unsigned youth.
 *
 * Rival decisions in this module are intentionally based on visible market
 * signals (buzz, visibility, venue exposure and known interest). They never
 * use a youth player's potential ability, true attributes or personality.
 */

import type { RNG } from "@/engine/rng";
import type {
  InboxMessage,
  PlacementReport,
  Player,
  RivalActivity,
  RivalScout,
  UnsignedYouth,
} from "@/engine/core/types";
import {
  assessRivalMarketCounterplay,
  type RivalMarketCounterplayAssessment,
  type RivalMarketPressureSnapshot,
  type ScoutMarketCounterplay,
} from "./organizations";

const MAX_RIVAL_ACTIVITY_HISTORY = 50;
const MAX_SCOUTING_PROGRESS = 5;
const MAX_TARGET_PLAYERS = 8;

export type YouthRivalPressureBand = "watching" | "contested" | "imminent";

/** A target ranking containing visible evidence only. */
export interface YouthRivalTargetCandidate {
  youthId: string;
  playerId: string;
  score: number;
  reasons: string[];
}

export interface AdvanceYouthRivalPressureRequest {
  rival: RivalScout;
  youth: UnsignedYouth;
  week: number;
  season: number;
  /** True when the player-scout has discovered, observed or reported this youth. */
  scoutHasInterest: boolean;
  /** Temporary organization support for this week (normally 0 or 1). */
  organizationProgressBonus?: number;
  existingActivities?: readonly RivalActivity[];
  existingMessages?: readonly InboxMessage[];
}

export interface AdvanceYouthRivalPressureResult {
  updatedRival: RivalScout;
  updatedYouth: UnsignedYouth;
  previousPressure: number;
  pressure: number;
  previousBand: YouthRivalPressureBand;
  band: YouthRivalPressureBand;
  newActivities: RivalActivity[];
  newMessages: InboxMessage[];
  /** Ready-to-persist activity history, capped consistently with rival history. */
  activities: RivalActivity[];
  /** Ready-to-persist inbox with any newly visible intelligence appended. */
  messages: InboxMessage[];
}

export interface RivalYouthClaimEligibility {
  eligible: boolean;
  chance: number;
  pressure: number;
  reason?: string;
}

export interface ResolveRivalYouthClaimRequest {
  rival: RivalScout;
  youth: UnsignedYouth;
  week: number;
  season: number;
  scoutHasInterest: boolean;
  /** Optional bounded influence from an explicit scout market response. */
  marketCounterplay?: RivalMarketCounterplayAssessment;
  placementReports?: Readonly<Record<string, PlacementReport>>;
  existingActivities?: readonly RivalActivity[];
  existingMessages?: readonly InboxMessage[];
}

export interface RivalYouthClaimResult {
  attempted: boolean;
  success: boolean;
  chance: number;
  consequence: "none" | "claimed" | "poached";
  updatedRival: RivalScout;
  updatedYouth: UnsignedYouth;
  signedPlayer?: Player;
  placementType?: "academyIntake" | "youthContract";
  displacedPlacementReportIds: string[];
  newActivities: RivalActivity[];
  newMessages: InboxMessage[];
  activities: RivalActivity[];
  messages: InboxMessage[];
  /** The explicit or placement-derived response that changed this attempt. */
  marketCounterplay?: RivalMarketCounterplayAssessment;
  marketCounterplaySource?: "explicit" | "placementReport";
  marketCounterplaySourceId?: string;
  rejectionReason?: string;
}

interface VisibleYouthProfile {
  youthId: string;
  playerId: string;
  age: number;
  visibility: number;
  buzzLevel: number;
  venueCount: number;
  knownScoutCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

function visibleProfile(youth: UnsignedYouth): VisibleYouthProfile {
  return {
    youthId: youth.id,
    playerId: youth.player.id,
    age: youth.player.age,
    visibility: clamp(youth.visibility, 0, 100),
    buzzLevel: clamp(youth.buzzLevel, 0, 100),
    venueCount: new Set(youth.venueAppearances).size,
    knownScoutCount: new Set(youth.discoveredBy).size,
  };
}

/**
 * Eligibility is contractual, not ability-based. A record must still be an
 * active, genuinely unsigned youth and the rival must specialize in youth.
 */
export function isEligibleYouthRivalTarget(
  rival: RivalScout,
  youth: UnsignedYouth,
): boolean {
  if (rival.specialization !== "youth" || youth.placed || youth.retired) {
    return false;
  }
  if (youth.player.age > 18) return false;
  if (youth.player.clubId || youth.player.contractClubId) return false;
  return (rival.scoutingProgress?.[youth.player.id] ?? 0) < MAX_SCOUTING_PROGRESS;
}

function candidateScore(rival: RivalScout, profile: VisibleYouthProfile): number {
  const venueEvidence = Math.min(profile.venueCount, 5) * 5;
  const knownInterest = Math.min(profile.knownScoutCount, 5) * 3;
  let score = profile.visibility * 0.35
    + profile.buzzLevel * 0.4
    + venueEvidence
    + knownInterest;

  switch (rival.personality) {
    case "aggressive":
      score += profile.buzzLevel * 0.15;
      break;
    case "methodical":
      score += profile.venueCount * 4 + profile.visibility * 0.1;
      break;
    case "connected":
      score += profile.knownScoutCount * 5 + profile.visibility * 0.05;
      break;
    case "lucky":
      // Lucky rivals look where the market is quiet, but still need a visible
      // signal. Low visibility is not a proxy for hidden potential.
      score += (100 - profile.visibility) * 0.1 + profile.buzzLevel * 0.05;
      break;
  }

  // Slight urgency as a player approaches the end of the unsigned pathway.
  score += Math.max(0, profile.age - 15) * 2;
  return roundHundredth(clamp(score, 1, 100));
}

/** Rank eligible unsigned youth using only information visible in the world. */
export function rankYouthRivalTargets(
  rival: RivalScout,
  unsignedYouth: Readonly<Record<string, UnsignedYouth>>,
): YouthRivalTargetCandidate[] {
  return Object.values(unsignedYouth)
    .filter((youth) => isEligibleYouthRivalTarget(rival, youth))
    .map((youth) => {
      const profile = visibleProfile(youth);
      const reasons: string[] = [];
      if (profile.buzzLevel >= 50) reasons.push("Public buzz is accelerating.");
      if (profile.visibility >= 50) reasons.push("The player is widely visible.");
      if (profile.venueCount >= 2) reasons.push("Evidence exists across multiple venues.");
      if (profile.knownScoutCount >= 2) reasons.push("Other scouts are already watching.");
      if (reasons.length === 0) reasons.push("The player is an accessible unsigned prospect.");
      return {
        youthId: profile.youthId,
        playerId: profile.playerId,
        score: candidateScore(rival, profile),
        reasons,
      };
    })
    .sort((left, right) => right.score - left.score
      || left.youthId.localeCompare(right.youthId));
}

/** Select from the visible ranking with seeded variation for career replayability. */
export function selectYouthRivalTarget(
  rng: RNG,
  rival: RivalScout,
  unsignedYouth: Readonly<Record<string, UnsignedYouth>>,
): YouthRivalTargetCandidate | null {
  const candidates = rankYouthRivalTargets(rival, unsignedYouth);
  if (candidates.length === 0) return null;
  return rng.pickWeighted(candidates.map((candidate) => ({
    item: candidate,
    weight: Math.max(1, candidate.score),
  })));
}

export function getYouthRivalPressure(
  rival: RivalScout,
  youth: UnsignedYouth,
): number {
  const profile = visibleProfile(youth);
  const isTracked = rival.targetPlayerIds.includes(profile.playerId)
    || rival.currentTarget === profile.playerId
    || (rival.scoutingProgress?.[profile.playerId] ?? 0) > 0;
  if (!isTracked) return 0;
  const progress = clamp(
    rival.scoutingProgress?.[profile.playerId] ?? 0,
    0,
    MAX_SCOUTING_PROGRESS,
  );
  return Math.round(clamp(
    progress * 10
      + profile.visibility * 0.2
      + profile.buzzLevel * 0.2
      + clamp(rival.aggressiveness, 0, 1) * 10,
    0,
    100,
  ));
}

export function getYouthRivalPressureBand(pressure: number): YouthRivalPressureBand {
  if (pressure >= 55) return "imminent";
  if (pressure >= 35) return "contested";
  return "watching";
}

function placementMarketResponse(report: PlacementReport): ScoutMarketCounterplay {
  if (report.conviction === "tablePound" || report.conviction === "strongRecommend") {
    return "advocate";
  }
  if (
    report.pitchPosture === "relationshipLed"
    || report.supportCondition === "familySupport"
  ) return "protect";
  return report.conviction === "recommend" || report.pitchPosture === "pathwayLed"
    ? "advocate"
    : "verify";
}

function placementCounterplayPressure(
  rival: RivalScout,
  youth: UnsignedYouth,
): RivalMarketPressureSnapshot {
  const score = getYouthRivalPressure(rival, youth);
  return {
    playerId: youth.player.id,
    score,
    band: score >= 70 ? "closing" : score >= 45 ? "contested" : score >= 20 ? "watched" : "uncontested",
    watchers: [{
      rivalId: rival.id,
      rivalName: rival.name,
      clubId: rival.clubId,
      scoutingProgress: clamp(rival.scoutingProgress?.[youth.player.id] ?? 0, 0, MAX_SCOUTING_PROGRESS),
      evidenceConfidence: 0,
      urgency: score,
    }],
    informationExposure: youth.buzzLevel >= 45 || youth.discoveredBy.length >= 2
      ? "circulating"
      : "contained",
    leakSourceIds: [],
    family: {
      preference: "unverified",
      explanation: "No recorded family preference is available to this claim resolver.",
    },
    reasons: ["The pressure comes from visible unsigned-youth market activity."],
  };
}

function derivePlacementMarketCounterplay(request: ResolveRivalYouthClaimRequest): {
  assessment: RivalMarketCounterplayAssessment;
  sourceId: string;
} | undefined {
  const report = Object.values(request.placementReports ?? {})
    .filter((candidate) =>
      candidate.unsignedYouthId === request.youth.id
      && (
        candidate.clubResponse === undefined
        || candidate.clubResponse === "pending"
        || candidate.clubResponse === "trial"
        || candidate.clubResponse === "followUpRequested"
      )
    )
    .sort((left, right) =>
      right.season - left.season
      || right.week - left.week
      || right.id.localeCompare(left.id)
    )[0];
  if (!report) return undefined;
  return {
    sourceId: report.id,
    assessment: assessRivalMarketCounterplay({
      pressure: placementCounterplayPressure(request.rival, request.youth),
      response: placementMarketResponse(report),
    }),
  };
}

function appendActivities(
  existing: readonly RivalActivity[],
  additions: readonly RivalActivity[],
): RivalActivity[] {
  return [...existing, ...additions].slice(-MAX_RIVAL_ACTIVITY_HISTORY);
}

function pressureMessage(
  rival: RivalScout,
  youth: UnsignedYouth,
  band: YouthRivalPressureBand,
  week: number,
  season: number,
): InboxMessage {
  const playerName = `${youth.player.firstName} ${youth.player.lastName}`;
  const imminent = band === "imminent";
  return {
    id: `rival-youth-pressure-${rival.id}-${youth.id}-${band}-s${season}w${week}`,
    week,
    season,
    type: "warning",
    title: imminent ? "Rival Youth Claim Imminent" : "Prospect Now Contested",
    body: imminent
      ? `${rival.name} is close to recommending ${playerName} to their club. Waiting may cost you the opportunity.`
      : `${rival.name} has stepped up their work on ${playerName}. The prospect is no longer yours to assess alone.`,
    read: false,
    actionRequired: false,
    relatedId: youth.player.id,
    relatedEntityType: "player",
  };
}

/**
 * Advance one rival's visible work on one unsigned youth and return complete
 * append-ready activity and inbox collections for persistence by the store.
 */
export function advanceYouthRivalPressure(
  request: AdvanceYouthRivalPressureRequest,
): AdvanceYouthRivalPressureResult {
  const existingActivities = [...(request.existingActivities ?? [])];
  const existingMessages = [...(request.existingMessages ?? [])];
  const previousPressure = getYouthRivalPressure(request.rival, request.youth);
  const previousBand = getYouthRivalPressureBand(previousPressure);

  if (!isEligibleYouthRivalTarget(request.rival, request.youth)) {
    return {
      updatedRival: request.rival,
      updatedYouth: request.youth,
      previousPressure,
      pressure: previousPressure,
      previousBand,
      band: previousBand,
      newActivities: [],
      newMessages: [],
      activities: existingActivities,
      messages: existingMessages,
    };
  }

  const playerId = request.youth.player.id;
  const wasTargeted = request.rival.targetPlayerIds.includes(playerId);
  const progressIncrement = (request.rival.quality >= 4 ? 2 : 1)
    + clamp(Math.round(request.organizationProgressBonus ?? 0), 0, 1);
  const nextProgress = Math.min(
    MAX_SCOUTING_PROGRESS,
    (request.rival.scoutingProgress?.[playerId] ?? 0) + progressIncrement,
  );
  const updatedRival: RivalScout = {
    ...request.rival,
    targetPlayerIds: wasTargeted
      ? request.rival.targetPlayerIds
      : [...request.rival.targetPlayerIds, playerId].slice(-MAX_TARGET_PLAYERS),
    currentTarget: playerId,
    scoutingProgress: {
      ...(request.rival.scoutingProgress ?? {}),
      [playerId]: nextProgress,
    },
    competingForPlayers: request.scoutHasInterest
      ? [...new Set([...request.rival.competingForPlayers, playerId])]
      : request.rival.competingForPlayers,
  };
  const visibilityGain = 2 + request.rival.quality;
  const buzzGain = Math.max(1, Math.round(
    request.rival.quality + request.rival.reputation / 40,
  ));
  const updatedYouth: UnsignedYouth = {
    ...request.youth,
    visibility: clamp(request.youth.visibility + visibilityGain, 0, 100),
    buzzLevel: clamp(request.youth.buzzLevel + buzzGain, 0, 100),
    discoveredBy: request.youth.discoveredBy.includes(request.rival.id)
      ? request.youth.discoveredBy
      : [...request.youth.discoveredBy, request.rival.id],
  };
  const pressure = getYouthRivalPressure(updatedRival, updatedYouth);
  const band = getYouthRivalPressureBand(pressure);
  const newActivities: RivalActivity[] = [];
  const newMessages: InboxMessage[] = [];

  if (!wasTargeted) {
    newActivities.push({
      rivalId: request.rival.id,
      type: "targetAcquired",
      playerId,
      week: request.week,
      season: request.season,
    });
  }
  if (band !== previousBand) {
    newActivities.push({
      rivalId: request.rival.id,
      type: band === "imminent" ? "reportSubmitted" : "spotted",
      playerId,
      week: request.week,
      season: request.season,
    });
    if (request.scoutHasInterest) {
      newMessages.push(pressureMessage(
        request.rival,
        updatedYouth,
        band,
        request.week,
        request.season,
      ));
    }
  }

  return {
    updatedRival,
    updatedYouth,
    previousPressure,
    pressure,
    previousBand,
    band,
    newActivities,
    newMessages,
    activities: appendActivities(existingActivities, newActivities),
    messages: [...existingMessages, ...newMessages],
  };
}

export function getRivalYouthClaimEligibility(
  rival: RivalScout,
  youth: UnsignedYouth,
  marketCounterplay?: RivalMarketCounterplayAssessment,
): RivalYouthClaimEligibility {
  const pressure = getYouthRivalPressure(rival, youth);
  if (rival.specialization !== "youth") {
    return { eligible: false, chance: 0, pressure, reason: "Only youth-specialist rivals can claim unsigned youth." };
  }
  if (youth.placed || youth.retired || youth.player.clubId || youth.player.contractClubId) {
    return { eligible: false, chance: 0, pressure, reason: "The prospect is no longer unsigned and available." };
  }
  if (!rival.targetPlayerIds.includes(youth.player.id)) {
    return { eligible: false, chance: 0, pressure, reason: "The rival is not tracking this prospect." };
  }
  if (getYouthRivalPressureBand(pressure) !== "imminent") {
    return { eligible: false, chance: 0, pressure, reason: "Rival pressure is not yet high enough for a claim." };
  }

  // This chance uses public pressure and rival characteristics only. Hidden PA
  // and true player attributes are deliberately absent.
  const chance = roundHundredth(clamp(
    (0.15
      + pressure / 200
      + (rival.quality - 1) * 0.04
      + clamp(rival.aggressiveness, 0, 1) * 0.12)
      * (marketCounterplay?.rivalPressureMultiplier ?? 1),
    0.08,
    0.9,
  ));
  return { eligible: true, chance, pressure };
}

/** Resolve a rival club claiming an unsigned youth before the player-scout. */
export function resolveRivalYouthClaim(
  rng: RNG,
  request: ResolveRivalYouthClaimRequest,
): RivalYouthClaimResult {
  const existingActivities = [...(request.existingActivities ?? [])];
  const existingMessages = [...(request.existingMessages ?? [])];
  const placementCounterplay = request.marketCounterplay
    ? undefined
    : derivePlacementMarketCounterplay(request);
  const marketCounterplay = request.marketCounterplay ?? placementCounterplay?.assessment;
  const eligibility = getRivalYouthClaimEligibility(
    request.rival,
    request.youth,
    marketCounterplay,
  );
  const baseResult = {
    chance: eligibility.chance,
    updatedRival: request.rival,
    updatedYouth: request.youth,
    displacedPlacementReportIds: [] as string[],
    newActivities: [] as RivalActivity[],
    newMessages: [] as InboxMessage[],
    activities: existingActivities,
    messages: existingMessages,
    marketCounterplay,
    marketCounterplaySource: request.marketCounterplay
      ? "explicit" as const
      : placementCounterplay
        ? "placementReport" as const
        : undefined,
    marketCounterplaySourceId: placementCounterplay?.sourceId,
  };

  if (!eligibility.eligible) {
    return {
      ...baseResult,
      attempted: false,
      success: false,
      consequence: "none",
      rejectionReason: eligibility.reason,
    };
  }
  if (!rng.chance(eligibility.chance)) {
    return {
      ...baseResult,
      attempted: true,
      success: false,
      consequence: "none",
    };
  }

  const playerId = request.youth.player.id;
  const placementType = request.youth.player.age <= 15
    ? "academyIntake" as const
    : "youthContract" as const;
  const signedPlayer: Player = {
    ...request.youth.player,
    clubId: request.rival.clubId,
    contractClubId: request.rival.clubId,
    contractExpiry: request.season + 3,
    // Youth wages reflect the rival organisation, not hidden player ability.
    wage: Math.max(100, request.rival.quality * 150),
  };
  const updatedYouth: UnsignedYouth = {
    ...request.youth,
    player: signedPlayer,
    placed: true,
    placedClubId: request.rival.clubId,
  };
  const updatedRival: RivalScout = {
    ...request.rival,
    targetPlayerIds: request.rival.targetPlayerIds.filter((id) => id !== playerId),
    competingForPlayers: request.rival.competingForPlayers.filter((id) => id !== playerId),
    currentTarget: request.rival.currentTarget === playerId
      ? undefined
      : request.rival.currentTarget,
    winsAgainstPlayer: (request.rival.winsAgainstPlayer ?? 0)
      + (request.scoutHasInterest ? 1 : 0),
  };
  const displacedPlacementReportIds = Object.values(request.placementReports ?? {})
    .filter((report) => report.unsignedYouthId === request.youth.id
      && (report.clubResponse === undefined || report.clubResponse === "pending"
        || report.clubResponse === "trial" || report.clubResponse === "followUpRequested"))
    .map((report) => report.id);
  const wasPoached = request.scoutHasInterest || displacedPlacementReportIds.length > 0;
  const consequence = wasPoached ? "poached" as const : "claimed" as const;
  const playerName = `${request.youth.player.firstName} ${request.youth.player.lastName}`;
  const activity: RivalActivity = {
    rivalId: request.rival.id,
    type: "playerSigned",
    playerId,
    week: request.week,
    season: request.season,
  };
  const message: InboxMessage = {
    id: `rival-youth-claim-${request.rival.id}-${request.youth.id}-s${request.season}w${request.week}`,
    week: request.week,
    season: request.season,
    type: "warning",
    title: wasPoached ? "Rival Poached Your Prospect" : "Rival Youth Signing",
    body: wasPoached
      ? `${request.rival.name} moved first: ${playerName} has joined their club before your recommendation could land.`
      : `${request.rival.name}'s club has signed unsigned prospect ${playerName}.`,
    read: false,
    actionRequired: false,
    relatedId: playerId,
    relatedEntityType: "player",
  };

  return {
    ...baseResult,
    attempted: true,
    success: true,
    chance: eligibility.chance,
    consequence,
    updatedRival,
    updatedYouth,
    signedPlayer,
    placementType,
    displacedPlacementReportIds,
    newActivities: [activity],
    newMessages: [message],
    activities: appendActivities(existingActivities, [activity]),
    messages: [...existingMessages, message],
  };
}
