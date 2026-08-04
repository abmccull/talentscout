"use client";

import {
  getBoardMeetingEligibility,
  getManagerMeetingEligibility,
} from "@/engine/career/politicalMeetings";
import {
  deriveCareerRolePackage,
  type CareerRolePackage,
} from "@/engine/career/rolePackages";
import {
  deriveCareerOperatingModel,
  getMinimumClubTrustForRole,
} from "@/engine/career/roleProfile";
import type { GameState } from "@/engine/core/types";
import { deriveAgencyStrategicHealth } from "@/engine/finance/agency";
import type { DashboardPriorityCandidate } from "./types";

export type CareerStageBand = "early" | "mid" | "late";

export type CareerStagePressure =
  | "craft"
  | "territory"
  | "recovery"
  | "politics"
  | "delegation"
  | "agency";

export type CareerAdaptiveTrack =
  | "planner"
  | "craft"
  | "territory"
  | "relationship"
  | "rival"
  | "leadership"
  | "politics"
  | "agency"
  | "legacy"
  | "unknown";

export interface CareerStageProfile {
  band: CareerStageBand;
  operatingPath: ReturnType<typeof deriveCareerOperatingModel>;
  pressure: CareerStagePressure;
  rolePackage: CareerRolePackage;
  knownCountryCount: number;
  openLeadershipCount: number;
  activeDelegationCount: number;
  politicalPressure: boolean;
  agencyPressure: boolean;
  suppressAdvancedManagement: boolean;
  prioritizeLateCareerSystems: boolean;
  currentEraTheme?: string;
}

export interface CareerAdaptiveCandidate<
  TCandidate extends DashboardPriorityCandidate = DashboardPriorityCandidate,
> {
  candidate: TCandidate;
  track: CareerAdaptiveTrack;
  adjustedScore: number;
  scoreDelta: number;
  blocking: boolean;
  advancedManagement: boolean;
  adjustmentReasons: string[];
}

export interface CareerStageQueueResult<
  TCandidate extends DashboardPriorityCandidate = DashboardPriorityCandidate,
> {
  profile: CareerStageProfile;
  ranked: CareerAdaptiveCandidate<TCandidate>[];
  selected: CareerAdaptiveCandidate<TCandidate>[];
}

const ACTIVE_LEADERSHIP_STATUSES = new Set([
  "open",
  "owned",
  "delegated",
  "deferred",
]);

const ADVANCED_MANAGEMENT_TRACKS = new Set<CareerAdaptiveTrack>([
  "leadership",
  "politics",
  "agency",
  "legacy",
]);

const TRACK_PATTERNS: Array<{ track: CareerAdaptiveTrack; pattern: RegExp }> = [
  { track: "agency", pattern: /\bagency\b|\bclient\b|\bretainer\b|\brunway\b|\boffice\b|\boperating policy\b|\bsatellite\b/i },
  { track: "politics", pattern: /\bboard\b|\bmanager\b|\bdirective\b|\btrust\b|\bultimatum\b|\bpolitic/i },
  { track: "leadership", pattern: /\bleadership\b|\bdelegat|\bstaff\b|\bdepartment\b|\bnpc\b|\bresponsibilit/i },
  { track: "legacy", pattern: /\blegacy\b|\bcallback\b|\bhistory\b|\btimeline\b|\btrack record\b|\breview\b|\balumni\b/i },
  { track: "relationship", pattern: /\brelationship\b|\bobligation\b|\bpromise\b|\bcontact\b|\bstakeholder\b/i },
  { track: "territory", pattern: /\bterritory\b|\bregional\b|\btravel\b|\bcountry\b|\bworld\b|\binternational\b/i },
  { track: "rival", pattern: /\brival\b|\bshowcase\b|\bcontested\b|\bclosing\b|\bpoach/i },
  { track: "craft", pattern: /\breport\b|\bfollow up\b|\bprospect\b|\bplayer\b|\bevidence\b|\bobservation\b|\brecommend/i },
];

const TRACK_SCORE_ADJUSTMENTS: Record<
  CareerStageBand,
  Partial<Record<CareerAdaptiveTrack, number>>
> = {
  early: {
    planner: 34,
    craft: 36,
    territory: 22,
    relationship: 10,
    rival: 6,
    legacy: -18,
    leadership: -40,
    politics: -48,
    agency: -42,
  },
  mid: {
    planner: 8,
    craft: 18,
    territory: 18,
    relationship: 16,
    rival: 14,
    leadership: 6,
    politics: 6,
    agency: 14,
    legacy: 4,
  },
  late: {
    planner: -18,
    craft: -6,
    territory: -4,
    relationship: 18,
    rival: 16,
    leadership: 34,
    politics: 36,
    agency: 32,
    legacy: 28,
  },
};

const STAGE_BLUEPRINTS: Record<CareerStageBand, readonly CareerAdaptiveTrack[][]> = {
  early: [
    ["craft", "planner"],
    ["craft", "territory"],
    ["planner", "territory", "relationship"],
    ["rival", "craft", "territory"],
    [],
  ],
  mid: [
    ["craft", "relationship", "rival"],
    ["territory", "agency", "craft"],
    ["relationship", "rival", "agency"],
    ["craft", "planner", "territory"],
    [],
  ],
  late: [
    ["leadership", "politics", "agency"],
    ["leadership", "politics", "agency"],
    ["legacy", "relationship", "rival"],
    ["politics", "agency", "legacy"],
    [],
  ],
};

const ERA_TRACKS: Partial<Record<string, readonly CareerAdaptiveTrack[]>> = {
  proveJudgment: ["craft"],
  territoryBuild: ["territory"],
  relationshipDebt: ["relationship"],
  rivalPressure: ["rival"],
  careerLeverage: ["politics", "leadership"],
  leadershipQuality: ["leadership"],
  agencyRunway: ["agency"],
  recovery: ["legacy", "craft"],
};

function countKnownCountries(state: GameState): number {
  return Object.values(state.regionalKnowledge ?? {}).filter((knowledge) =>
    (knowledge?.knowledgeLevel ?? 0) >= 10,
  ).length;
}

function countOpenLeadershipResponsibilities(state: GameState): number {
  return Object.values(state.leadershipPortfolio?.responsibilities ?? {}).filter(
    (responsibility) => ACTIVE_LEADERSHIP_STATUSES.has(responsibility.status),
  ).length;
}

function countActiveDelegations(state: GameState): number {
  return Object.values(state.npcDelegations ?? {}).filter((delegation) =>
    !delegation.completed,
  ).length;
}

function resolveCareerStageBand(rolePackage: CareerRolePackage): CareerStageBand {
  if (
    (rolePackage.operatingModel === "club" && rolePackage.tier >= 4)
    || (rolePackage.operatingModel === "agency" && rolePackage.tier >= 4)
    || rolePackage.stage === "leader"
    || rolePackage.stage === "executive"
    || rolePackage.stage === "agencyLeader"
  ) {
    return "late";
  }

  if (
    rolePackage.stage === "territoryOwner"
    || rolePackage.stage === "independentBuilder"
    || rolePackage.tier >= 3
  ) {
    return "mid";
  }

  return "early";
}

function hasPoliticalPressure(
  state: GameState,
  rolePackage: CareerRolePackage,
): boolean {
  if (rolePackage.operatingModel !== "club") return false;

  const managerEligibility = getManagerMeetingEligibility(state, {
    fatigueAlreadyPaid: true,
  });
  const boardEligibility = getBoardMeetingEligibility(state, {
    fatigueAlreadyPaid: true,
  });
  const lowTrust =
    state.scout.clubTrust < getMinimumClubTrustForRole(rolePackage.tier) + 10;
  const activeBoardDirectives = (state.scout.boardDirectives ?? []).some(
    (directive) => !directive.completed,
  );

  return Boolean(
    managerEligibility.eligible
    || boardEligibility.eligible
    || lowTrust
    || activeBoardDirectives
    || state.boardProfile?.ultimatumIssued,
  );
}

function hasAgencyPressure(state: GameState): boolean {
  if (!state.finances) return false;
  const operatingPath = deriveCareerOperatingModel(state.scout, state.finances);
  if (operatingPath !== "agency") return false;

  const health = deriveAgencyStrategicHealth(state.finances, state.scout);
  return (
    health.status === "stretched"
    || health.status === "fragile"
    || health.status === "critical"
    || !health.seniorAgencyReady
  );
}

function resolveCareerPressure(input: {
  state: GameState;
  band: CareerStageBand;
  rolePackage: CareerRolePackage;
  knownCountryCount: number;
  openLeadershipCount: number;
  activeDelegationCount: number;
  politicalPressure: boolean;
  agencyPressure: boolean;
}): CareerStagePressure {
  if (input.state.careerRecovery?.current) return "recovery";
  if (input.agencyPressure) return "agency";
  if (input.politicalPressure && input.band === "late") return "politics";
  if (input.openLeadershipCount > 0 || input.activeDelegationCount > 0) {
    return "delegation";
  }
  if (input.politicalPressure) return "politics";
  if (input.knownCountryCount <= 2 && input.rolePackage.tier >= 3) {
    return "territory";
  }
  return "craft";
}

function normalizeText(candidate: Pick<
  DashboardPriorityCandidate,
  "title" | "explanation" | "sourceSystem" | "collector"
>): string {
  return [
    candidate.sourceSystem,
    candidate.collector,
    candidate.title,
    candidate.explanation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function classifyCareerAdaptiveTrack(
  candidate: Pick<
    DashboardPriorityCandidate,
    "title" | "explanation" | "category" | "sourceSystem" | "collector"
  >,
): CareerAdaptiveTrack {
  if (candidate.sourceSystem === "planner") {
    return "planner";
  }
  if (candidate.sourceSystem === "rivals" || candidate.collector === "rivals") {
    return "rival";
  }
  if (candidate.sourceSystem === "relationships") {
    return "relationship";
  }
  if (candidate.sourceSystem === "agency") {
    return "agency";
  }
  if (candidate.category === "career_story") {
    return "legacy";
  }

  const text = normalizeText(candidate);
  for (const { track, pattern } of TRACK_PATTERNS) {
    if (pattern.test(text)) return track;
  }

  if (candidate.sourceSystem === "reports" || candidate.sourceSystem === "scouting") {
    return "craft";
  }
  if (candidate.sourceSystem === "career") {
    return "legacy";
  }

  return "unknown";
}

function isBlockingCandidate(candidate: DashboardPriorityCandidate): boolean {
  const hasBlockingFactor = candidate.scoreBreakdown.some(
    (factor) => factor.factor === "must_resolve_before_advance",
  );
  return hasBlockingFactor
    || (
      (candidate.category === "deadline" || candidate.category === "required_action")
      && (candidate.dueInWeeks ?? Number.POSITIVE_INFINITY) <= 0
    );
}

function applyPressureAdjustment(
  track: CareerAdaptiveTrack,
  pressure: CareerStagePressure,
): number {
  switch (pressure) {
    case "recovery":
      return track === "legacy" ? 16 : track === "craft" ? 8 : 0;
    case "territory":
      return track === "territory" ? 14 : 0;
    case "politics":
      return track === "politics" ? 16 : track === "leadership" ? 6 : 0;
    case "delegation":
      return track === "leadership" ? 16 : track === "agency" ? 6 : 0;
    case "agency":
      return track === "agency" ? 16 : track === "leadership" ? 6 : 0;
    case "craft":
    default:
      return track === "craft" ? 12 : track === "planner" ? 4 : 0;
  }
}

function applyEraAdjustment(
  track: CareerAdaptiveTrack,
  theme: string | undefined,
): number {
  if (!theme) return 0;
  const boostedTracks = ERA_TRACKS[theme] ?? [];
  return boostedTracks.includes(track) ? 8 : 0;
}

export function deriveCareerStageProfile(state: GameState): CareerStageProfile {
  const finances = state.finances ?? undefined;
  const operatingPath = deriveCareerOperatingModel(state.scout, finances);
  const rolePackage = deriveCareerRolePackage({
    scout: state.scout,
    finances,
    club: state.scout.currentClubId
      ? state.clubs?.[state.scout.currentClubId]
      : undefined,
    leadershipPortfolio: state.leadershipPortfolio,
  });
  const knownCountryCount = countKnownCountries(state);
  const openLeadershipCount = countOpenLeadershipResponsibilities(state);
  const activeDelegationCount = countActiveDelegations(state);
  const politicalPressure = hasPoliticalPressure(state, rolePackage);
  const agencyPressure = hasAgencyPressure(state);
  const band = resolveCareerStageBand(rolePackage);

  return {
    band,
    operatingPath,
    pressure: resolveCareerPressure({
      state,
      band,
      rolePackage,
      knownCountryCount,
      openLeadershipCount,
      activeDelegationCount,
      politicalPressure,
      agencyPressure,
    }),
    rolePackage,
    knownCountryCount,
    openLeadershipCount,
    activeDelegationCount,
    politicalPressure,
    agencyPressure,
    suppressAdvancedManagement: band === "early",
    prioritizeLateCareerSystems: band === "late",
    currentEraTheme: state.careerEraDirectorState?.current?.theme,
  };
}

export function adaptCareerStageCandidate<
  TCandidate extends DashboardPriorityCandidate,
>(
  candidate: TCandidate,
  profile: CareerStageProfile,
): CareerAdaptiveCandidate<TCandidate> {
  const track = classifyCareerAdaptiveTrack(candidate);
  const blocking = isBlockingCandidate(candidate);
  const advancedManagement = ADVANCED_MANAGEMENT_TRACKS.has(track);
  const adjustmentReasons: string[] = [];
  let scoreDelta = TRACK_SCORE_ADJUSTMENTS[profile.band][track] ?? 0;

  if (scoreDelta !== 0) {
    adjustmentReasons.push(`stage:${profile.band}:${track}:${scoreDelta >= 0 ? "+" : ""}${scoreDelta}`);
  }

  const pressureDelta = applyPressureAdjustment(track, profile.pressure);
  if (pressureDelta !== 0) {
    scoreDelta += pressureDelta;
    adjustmentReasons.push(`pressure:${profile.pressure}:${pressureDelta >= 0 ? "+" : ""}${pressureDelta}`);
  }

  const eraDelta = applyEraAdjustment(track, profile.currentEraTheme);
  if (eraDelta !== 0) {
    scoreDelta += eraDelta;
    adjustmentReasons.push(`era:${profile.currentEraTheme}:${eraDelta >= 0 ? "+" : ""}${eraDelta}`);
  }

  if (profile.suppressAdvancedManagement && advancedManagement && !blocking) {
    scoreDelta -= 80;
    adjustmentReasons.push("suppressed:advanced-management");
  }

  if (profile.prioritizeLateCareerSystems && advancedManagement) {
    scoreDelta += 12;
    adjustmentReasons.push("prioritized:late-career-system");
  }

  if (track === "planner" && profile.band === "late" && !blocking) {
    scoreDelta -= 12;
    adjustmentReasons.push("deemphasized:planner-noise");
  }

  return {
    candidate,
    track,
    adjustedScore: candidate.score + scoreDelta,
    scoreDelta,
    blocking,
    advancedManagement,
    adjustmentReasons,
  };
}

export function adaptCareerStageCandidates<
  TCandidate extends DashboardPriorityCandidate,
>(
  candidates: readonly TCandidate[],
  profile: CareerStageProfile,
): CareerAdaptiveCandidate<TCandidate>[] {
  return candidates
    .map((candidate) => adaptCareerStageCandidate(candidate, profile))
    .sort((left, right) =>
      right.adjustedScore - left.adjustedScore
      || left.track.localeCompare(right.track)
      || left.candidate.id.localeCompare(right.candidate.id),
    );
}

function fillBlueprintSlots<
  TCandidate extends DashboardPriorityCandidate,
>(
  ranked: readonly CareerAdaptiveCandidate<TCandidate>[],
  band: CareerStageBand,
  maxItems: number,
): CareerAdaptiveCandidate<TCandidate>[] {
  const selected: CareerAdaptiveCandidate<TCandidate>[] = [];
  const usedIds = new Set<string>();
  const blueprint = STAGE_BLUEPRINTS[band];

  for (const slotTracks of blueprint.slice(0, maxItems)) {
    const choice = ranked.find((candidate) =>
      !usedIds.has(candidate.candidate.id)
      && (slotTracks.length === 0 || slotTracks.includes(candidate.track)),
    );
    if (!choice) continue;
    selected.push(choice);
    usedIds.add(choice.candidate.id);
  }

  for (const candidate of ranked) {
    if (selected.length >= maxItems) break;
    if (usedIds.has(candidate.candidate.id)) continue;
    selected.push(candidate);
    usedIds.add(candidate.candidate.id);
  }

  return selected;
}

export function buildCareerStageQueue<
  TCandidate extends DashboardPriorityCandidate,
>(
  candidates: readonly TCandidate[],
  profile: CareerStageProfile,
  maxItems = 5,
): CareerStageQueueResult<TCandidate> {
  const ranked = adaptCareerStageCandidates(candidates, profile);
  return {
    profile,
    ranked,
    selected: fillBlueprintSlots(ranked, profile.band, Math.max(0, maxItems)),
  };
}
