import type {
  BoardMeetingApproach,
  BoardPersonality,
  GameState,
  InboxMessage,
  ManagerDirective,
  ManagerMeetingApproach,
  PlayerAttribute,
  Position,
  ScoutingPreference,
  StakeholderMeetingOutcome,
  StakeholderMeetingTone,
} from "@/engine/core/types";
import {
  addGameWeeks,
  getSeasonLength,
  isGameDateAtOrAfter,
} from "@/engine/core/gameDate";
import { RNG } from "@/engine/rng";
import {
  evaluateStakeholderMemoryPolicy,
  recordStakeholderMemory,
} from "@/engine/consequences/stakeholderMemoryPolicy";
import type { StakeholderMemory } from "@/engine/consequences/types";

export const MANAGER_MEETING_FATIGUE_COST = 4;
export const BOARD_MEETING_FATIGUE_COST = 8;
export const MANAGER_MEETING_COOLDOWN_WEEKS = 4;

export const MANAGER_MEETING_APPROACHES = [
  {
    id: "listen" as const,
    label: "Listen & align",
    tradeoff: "Safest route to trust; gives the manager more control over the next priority.",
  },
  {
    id: "evidence" as const,
    label: "Present the evidence",
    tradeoff: "Builds influence with data-minded managers; a poor fit can feel evasive.",
  },
  {
    id: "challenge" as const,
    label: "Challenge professionally",
    tradeoff: "Highest influence upside, but trust falls sharply if the argument lands badly.",
  },
] as const;

export const BOARD_MEETING_APPROACHES = [
  {
    id: "accountability" as const,
    label: "Own the results",
    tradeoff: "Protects patience without changing the budget or manufacturing reputation.",
  },
  {
    id: "efficiency" as const,
    label: "Offer cost discipline",
    tradeoff: "Appeals to cost-conscious boards, but voluntarily trims the budget multiplier by 0.03x.",
  },
  {
    id: "vision" as const,
    label: "Pitch the vision",
    tradeoff: "Can earn reputation with ambitious boards; failure costs patience and credibility.",
  },
] as const;

export interface PoliticalMeetingEligibility {
  eligible: boolean;
  fatigueCost: number;
  reason?: string;
  nextAvailableAt?: { week: number; season: number };
}

export interface PoliticalMeetingResult {
  state: GameState;
  executed: boolean;
  outcome?: StakeholderMeetingOutcome;
  reason?: string;
}

interface ConductOptions {
  /** Weekly schedule processing has already charged the activity fatigue. */
  fatigueAlreadyPaid?: boolean;
}

const MANAGER_APPROACH_ALIGNMENT: Record<
  ManagerMeetingApproach,
  Record<ScoutingPreference, number>
> = {
  listen: { dataFirst: 0, eyeTest: 2, balanced: 7, resultsBased: 5 },
  evidence: { dataFirst: 9, eyeTest: -5, balanced: 4, resultsBased: -2 },
  challenge: { dataFirst: -6, eyeTest: 8, balanced: -2, resultsBased: 6 },
};

const BOARD_APPROACH_ALIGNMENT: Record<
  BoardMeetingApproach,
  Record<BoardPersonality, number>
> = {
  accountability: {
    patient: 8,
    impatient: 2,
    "penny-pinching": 0,
    ambitious: 1,
    "hands-off": 5,
  },
  efficiency: {
    patient: 1,
    impatient: 4,
    "penny-pinching": 10,
    ambitious: -4,
    "hands-off": -2,
  },
  vision: {
    patient: 1,
    impatient: 5,
    "penny-pinching": -7,
    ambitious: 10,
    "hands-off": -5,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function currentDate(state: GameState): { week: number; season: number } {
  return { week: state.currentWeek, season: state.currentSeason };
}

function managerStakeholderId(state: GameState): string {
  const clubId = state.scout.currentClubId ?? "unemployed";
  const managerId = state.clubs[clubId]?.managerId ?? "unidentified";
  const managerName = state.managerProfiles[clubId]?.managerName
    ?? state.scout.managerRelationship?.managerName
    ?? "unknown-manager";
  const nameKey = managerName.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${clubId}:${managerId}:${nameKey}`;
}

function hasScheduledPoliticalMeeting(
  state: GameState,
  activityType: "managerMeeting" | "boardPresentation",
): boolean {
  return !state.schedule.completed
    && state.schedule.week === state.currentWeek
    && state.schedule.season === state.currentSeason
    && state.schedule.activities.some((activity) => activity?.type === activityType);
}

function isSameDate(
  outcome: StakeholderMeetingOutcome | undefined,
  state: GameState,
): boolean {
  return outcome?.week === state.currentWeek && outcome.season === state.currentSeason;
}

function baseEligibility(
  state: GameState,
  fatigueCost: number,
  nextMeetingAt: { week: number; season: number } | undefined,
  lastOutcome: StakeholderMeetingOutcome | undefined,
  fatigueAlreadyPaid: boolean,
): PoliticalMeetingEligibility {
  if (isSameDate(lastOutcome, state)) {
    return {
      eligible: false,
      fatigueCost,
      nextAvailableAt: nextMeetingAt,
      reason: "This stakeholder has already met with you this week.",
    };
  }
  if (nextMeetingAt && !isGameDateAtOrAfter(currentDate(state), nextMeetingAt)) {
    return {
      eligible: false,
      fatigueCost,
      nextAvailableAt: nextMeetingAt,
      reason: `Available again in Season ${nextMeetingAt.season}, Week ${nextMeetingAt.week}.`,
    };
  }
  if (!fatigueAlreadyPaid && state.scout.fatigue + fatigueCost > 100) {
    return {
      eligible: false,
      fatigueCost,
      reason: `You need at least ${fatigueCost} fatigue capacity for this meeting.`,
    };
  }
  return { eligible: true, fatigueCost };
}

export function getManagerMeetingEligibility(
  state: GameState,
  options: ConductOptions = {},
): PoliticalMeetingEligibility {
  if (state.scout.careerTier < 4) {
    return { eligible: false, fatigueCost: MANAGER_MEETING_FATIGUE_COST, reason: "Requires Career Tier 4." };
  }
  if (!state.scout.currentClubId || state.scout.careerPath !== "club") {
    return { eligible: false, fatigueCost: MANAGER_MEETING_FATIGUE_COST, reason: "Requires active club employment." };
  }
  const relationship = state.scout.managerRelationship;
  if (!relationship) {
    return { eligible: false, fatigueCost: MANAGER_MEETING_FATIGUE_COST, reason: "No manager relationship is established." };
  }
  if (!options.fatigueAlreadyPaid && hasScheduledPoliticalMeeting(state, "managerMeeting")) {
    return {
      eligible: false,
      fatigueCost: MANAGER_MEETING_FATIGUE_COST,
      reason: "This manager meeting is already scheduled in the current week.",
    };
  }
  return baseEligibility(
    state,
    MANAGER_MEETING_FATIGUE_COST,
    relationship.nextMeetingAt,
    relationship.lastMeetingOutcome,
    Boolean(options.fatigueAlreadyPaid),
  );
}

export function getBoardMeetingCooldownWeeks(personality: BoardPersonality): number {
  if (personality === "impatient") return 4;
  if (personality === "hands-off") return 8;
  return 6;
}

export function getBoardMeetingEligibility(
  state: GameState,
  options: ConductOptions = {},
): PoliticalMeetingEligibility {
  if (state.scout.careerTier < 5) {
    return { eligible: false, fatigueCost: BOARD_MEETING_FATIGUE_COST, reason: "Requires Career Tier 5." };
  }
  if (!state.scout.currentClubId || state.scout.careerPath !== "club") {
    return { eligible: false, fatigueCost: BOARD_MEETING_FATIGUE_COST, reason: "Requires active club employment." };
  }
  if (!state.boardProfile) {
    return { eligible: false, fatigueCost: BOARD_MEETING_FATIGUE_COST, reason: "No board relationship is established." };
  }
  if (!options.fatigueAlreadyPaid && hasScheduledPoliticalMeeting(state, "boardPresentation")) {
    return {
      eligible: false,
      fatigueCost: BOARD_MEETING_FATIGUE_COST,
      reason: "This board meeting is already scheduled in the current week.",
    };
  }
  return baseEligibility(
    state,
    BOARD_MEETING_FATIGUE_COST,
    state.boardProfile.nextMeetingAt,
    state.boardProfile.lastMeetingOutcome,
    Boolean(options.fatigueAlreadyPaid),
  );
}

function toneForScore(score: number): StakeholderMeetingTone {
  if (score >= 63) return "positive";
  if (score >= 36) return "neutral";
  return "negative";
}

function managerDeltas(
  approach: ManagerMeetingApproach,
  tone: StakeholderMeetingTone,
): { trust: number; influence: number } {
  const byApproach = {
    listen: {
      positive: { trust: 7, influence: 1 },
      neutral: { trust: 2, influence: 0 },
      negative: { trust: -2, influence: 0 },
    },
    evidence: {
      positive: { trust: 3, influence: 5 },
      neutral: { trust: 0, influence: 1 },
      negative: { trust: -4, influence: -2 },
    },
    challenge: {
      positive: { trust: 2, influence: 8 },
      neutral: { trust: -1, influence: 1 },
      negative: { trust: -8, influence: -4 },
    },
  } as const;
  return byApproach[approach][tone];
}

function boardDeltas(
  approach: BoardMeetingApproach,
  tone: StakeholderMeetingTone,
): { satisfaction: number; patience: number; budget: number; reputation: number } {
  const byApproach = {
    accountability: {
      positive: { satisfaction: 4, patience: 8, budget: 0, reputation: 0 },
      neutral: { satisfaction: 1, patience: 4, budget: 0, reputation: 0 },
      negative: { satisfaction: -2, patience: -1, budget: 0, reputation: 0 },
    },
    efficiency: {
      positive: { satisfaction: 7, patience: 3, budget: -0.03, reputation: 0 },
      neutral: { satisfaction: 3, patience: 1, budget: -0.03, reputation: 0 },
      negative: { satisfaction: -4, patience: -4, budget: -0.03, reputation: 0 },
    },
    vision: {
      positive: { satisfaction: 8, patience: 2, budget: 0, reputation: 1 },
      neutral: { satisfaction: 1, patience: -2, budget: 0, reputation: 0 },
      negative: { satisfaction: -7, patience: -7, budget: 0, reputation: -1 },
    },
  } as const;
  return byApproach[approach][tone];
}

function managerMemoryTags(
  approach: ManagerMeetingApproach,
  tone: StakeholderMeetingTone,
  directiveCreated: boolean | undefined,
): string[] {
  const approachTag = approach === "listen"
    ? "listened"
    : approach === "evidence"
      ? "evidencePresented"
      : "professionalChallenge";
  return [
    "managerMeeting",
    approachTag,
    tone === "positive" ? "meetingPositive" : tone === "negative" ? "meetingNegative" : "meetingNeutral",
    ...(directiveCreated === true ? ["directiveIssued"] : directiveCreated === false ? ["directiveReaffirmed"] : []),
  ];
}

function boardMemoryTags(
  approach: BoardMeetingApproach,
  tone: StakeholderMeetingTone,
): string[] {
  const approachTag = approach === "accountability"
    ? "accountability"
    : approach === "efficiency"
      ? "costDiscipline"
      : "strategicVision";
  return [
    "boardMeeting",
    approachTag,
    tone === "positive" ? "meetingPositive" : tone === "negative" ? "meetingNegative" : "meetingNeutral",
  ];
}

function meetingMemory(input: {
  state: GameState;
  stakeholder: "manager" | "board";
  stakeholderId: string;
  approach: ManagerMeetingApproach | BoardMeetingApproach;
  tone: StakeholderMeetingTone;
  tags: string[];
}): StakeholderMemory {
  const toneProfile = input.tone === "positive"
    ? { valence: 58, intensity: 66, salience: 72 }
    : input.tone === "negative"
      ? { valence: -64, intensity: 74, salience: 78 }
      : { valence: 5, intensity: 38, salience: 42 };
  const prefix = `${input.stakeholder}-meeting-${input.stakeholderId}-s${input.state.currentSeason}-w${input.state.currentWeek}`;
  return {
    id: prefix,
    stakeholder: { kind: input.stakeholder, id: input.stakeholderId },
    subject: { kind: "scout", id: input.state.scout.id },
    tags: input.tags,
    ...toneProfile,
    visibility: "stakeholders",
    createdAt: currentDate(input.state),
    halfLifeWeeks: input.tone === "neutral" ? 20 : 52,
    metadata: { approach: input.approach, tone: input.tone },
  };
}

function appendInboxOnce(state: GameState, message: InboxMessage): InboxMessage[] {
  return state.inbox.some((candidate) => candidate.id === message.id)
    ? state.inbox
    : [...state.inbox, message];
}

function directiveNarrative(
  directive: ManagerDirective | undefined,
  created: boolean | undefined,
): string {
  if (!directive) return "No recruitment priority changed.";
  const verb = created ? "issued" : "reaffirmed";
  return `The manager ${verb} a ${directive.priority} priority for ${directive.position}.`;
}

function createMeetingDirective(
  state: GameState,
  rng: RNG,
  tone: StakeholderMeetingTone,
  approach: ManagerMeetingApproach,
): { directive?: ManagerDirective; created?: boolean; directives: ManagerDirective[] } {
  const clubId = state.scout.currentClubId;
  if (!clubId || tone === "negative") return { directives: state.managerDirectives };
  const baseChance = tone === "positive" ? 0.72 : 0.34;
  const approachModifier = approach === "listen" ? 0.08 : approach === "evidence" ? 0.04 : -0.06;
  if (!rng.chance(clamp(baseChance + approachModifier, 0, 0.9))) {
    return { directives: state.managerDirectives };
  }

  const active = state.managerDirectives
    .filter((directive) => directive.clubId === clubId && directive.season === state.currentSeason && !directive.fulfilled)
    .sort((left, right) => left.id.localeCompare(right.id));
  const club = state.clubs[clubId];
  const manager = state.managerProfiles[clubId];
  if (!club || !manager) {
    const reaffirmed = active[0];
    return { directive: reaffirmed, created: reaffirmed ? false : undefined, directives: state.managerDirectives };
  }

  const activePositions = new Set(active.map((directive) => directive.position));
  const positions: Position[] = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];
  const availablePositions = positions.filter((position) => !activePositions.has(position));
  if (availablePositions.length === 0) {
    const reaffirmed = active[0];
    return { directive: reaffirmed, created: reaffirmed ? false : undefined, directives: state.managerDirectives };
  }
  const position = rng.pick(availablePositions);
  const attributeProfiles: Record<Position, PlayerAttribute[]> = {
    GK: ["positioning", "composure", "decisionMaking", "leadership"],
    CB: ["tackling", "heading", "strength", "marking"],
    LB: ["pace", "crossing", "stamina", "tackling"],
    RB: ["pace", "crossing", "stamina", "tackling"],
    CDM: ["tackling", "marking", "passing", "anticipation"],
    CM: ["passing", "stamina", "vision", "teamwork"],
    CAM: ["vision", "dribbling", "finishing", "firstTouch"],
    LW: ["pace", "dribbling", "crossing", "agility"],
    RW: ["pace", "dribbling", "crossing", "agility"],
    ST: ["finishing", "heading", "pace", "composure"],
  };
  const ageRanges = {
    winNow: [24, 31],
    academyFirst: [17, 23],
    marketSmart: [21, 27],
    globalRecruiter: [19, 29],
  } as const;
  const priority: ManagerDirective["priority"] = tone === "positive" ? "high" : "medium";
  const minCAStars = club.reputation >= 80 ? 3.5 : club.reputation >= 60 ? 3 : club.reputation >= 40 ? 2.5 : 2;
  const budgetShare = priority === "high" ? 0.3 : 0.2;
  const issued: ManagerDirective = {
    id: `dir_${club.id.slice(0, 8)}_${position}_s${state.currentSeason}_meeting_w${state.currentWeek}`,
    clubId,
    managerId: manager.clubId,
    position,
    priority,
    budgetAllocation: Math.round(club.budget * budgetShare * (state.boardProfile?.budgetMultiplier ?? 1)),
    ageRange: [...ageRanges[club.scoutingPhilosophy]],
    minCAStars,
    keyAttributes: attributeProfiles[position],
    submittedReportIds: [],
    fulfilled: false,
    season: state.currentSeason,
    tacticalNotes: `Raised during your meeting: recruit a ${position} for ${manager.preferredFormation}. The manager favours a ${manager.preference} scouting case.`,
  };
  return { directive: issued, created: true, directives: [...state.managerDirectives, issued] };
}

export function conductManagerMeeting(
  state: GameState,
  approach: ManagerMeetingApproach,
  options: ConductOptions = {},
): PoliticalMeetingResult {
  const eligibility = getManagerMeetingEligibility(state, options);
  if (!eligibility.eligible) return { state, executed: false, reason: eligibility.reason };

  const clubId = state.scout.currentClubId!;
  const stakeholderId = managerStakeholderId(state);
  const relationship = state.scout.managerRelationship!;
  const preference = state.managerProfiles[clubId]?.preference ?? relationship.scoutingPreference;
  const now = currentDate(state);
  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const memory = evaluateStakeholderMemoryPolicy({
    memories: state.consequenceState.memories,
    obligations: state.consequenceState.obligations,
    stakeholder: { kind: "manager", id: stakeholderId },
    subject: { kind: "scout", id: state.scout.id },
    now,
    domain: "managerMeeting",
    seasonLength,
  });
  const rng = new RNG(
    `${state.seed}-politics-manager-${clubId}-s${state.currentSeason}-w${state.currentWeek}-${approach}`,
  );
  const softSkill = ((state.scout.attributes.networking + state.scout.attributes.persuasion) / 40) * 20;
  const score = relationship.trust * 0.55
    + relationship.influence * 0.15
    + softSkill
    + MANAGER_APPROACH_ALIGNMENT[approach][preference]
    + memory.scoreAdjustment
    + rng.nextFloat(-9, 9);
  const tone = toneForScore(score);
  const intended = managerDeltas(approach, tone);
  const trust = clamp(relationship.trust + intended.trust, 0, 100);
  const influence = clamp(relationship.influence + intended.influence, 0, 100);
  const directiveResult = createMeetingDirective(state, rng, tone, approach);
  const trustDelta = trust - relationship.trust;
  const influenceDelta = influence - relationship.influence;
  const nextMeetingAt = addGameWeeks(state.fixtures, now, MANAGER_MEETING_COOLDOWN_WEEKS);
  const approachLabel = MANAGER_MEETING_APPROACHES.find((item) => item.id === approach)!.label;
  const summary = `${approachLabel} produced a ${tone} response. ${directiveNarrative(directiveResult.directive, directiveResult.created)}`;
  const outcome: StakeholderMeetingOutcome = {
    stakeholder: "manager",
    approach,
    tone,
    week: state.currentWeek,
    season: state.currentSeason,
    summary,
    fatigueCost: MANAGER_MEETING_FATIGUE_COST,
    trustDelta,
    influenceDelta,
    directiveId: directiveResult.directive?.id,
    directiveCreated: directiveResult.created,
    memoryReason: memory.reason,
  };
  const updatedRelationship = {
    ...relationship,
    trust,
    influence,
    meetingsThisSeason: relationship.meetingsThisSeason + 1,
    nextMeetingAt,
    lastMeetingOutcome: outcome,
  };
  const episode = meetingMemory({
    state,
    stakeholder: "manager",
    stakeholderId,
    approach,
    tone,
    tags: managerMemoryTags(approach, tone, directiveResult.created),
  });
  const memoryResult = recordStakeholderMemory(state.consequenceState, episode);
  const message: InboxMessage = {
    id: `manager-meeting-${stakeholderId}-s${state.currentSeason}-w${state.currentWeek}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "feedback",
    title: `Meeting with ${relationship.managerName}`,
    body: [
      summary,
      `Trust ${trustDelta >= 0 ? "+" : ""}${trustDelta}; influence ${influenceDelta >= 0 ? "+" : ""}${influenceDelta}.`,
      memory.reason,
      `Next meeting: Season ${nextMeetingAt.season}, Week ${nextMeetingAt.week}.`,
    ].filter(Boolean).join("\n"),
    read: false,
    actionRequired: false,
    relatedId: directiveResult.directive?.id,
  };

  return {
    executed: true,
    outcome,
    state: {
      ...state,
      scout: {
        ...state.scout,
        fatigue: options.fatigueAlreadyPaid
          ? state.scout.fatigue
          : clamp(state.scout.fatigue + MANAGER_MEETING_FATIGUE_COST, 0, 100),
        managerRelationship: updatedRelationship,
      },
      managerDirectives: directiveResult.directives,
      consequenceState: memoryResult.state,
      inbox: appendInboxOnce(state, message),
    },
  };
}

export function conductBoardMeeting(
  state: GameState,
  approach: BoardMeetingApproach,
  options: ConductOptions = {},
): PoliticalMeetingResult {
  const eligibility = getBoardMeetingEligibility(state, options);
  if (!eligibility.eligible) return { state, executed: false, reason: eligibility.reason };

  const clubId = state.scout.currentClubId!;
  const profile = state.boardProfile!;
  const now = currentDate(state);
  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const memory = evaluateStakeholderMemoryPolicy({
    memories: state.consequenceState.memories,
    obligations: state.consequenceState.obligations,
    stakeholder: { kind: "board", id: clubId },
    subject: { kind: "scout", id: state.scout.id },
    now,
    domain: "boardMeeting",
    seasonLength,
  });
  const rng = new RNG(
    `${state.seed}-politics-board-${clubId}-s${state.currentSeason}-w${state.currentWeek}-${approach}`,
  );
  const softSkill = (state.scout.attributes.persuasion * 0.65 + state.scout.attributes.networking * 0.35) / 20 * 16;
  const score = profile.satisfactionLevel * 0.48
    + profile.patience * 0.2
    + softSkill
    + BOARD_APPROACH_ALIGNMENT[approach][profile.personality]
    + memory.scoreAdjustment
    + rng.nextFloat(-10, 10);
  const tone = toneForScore(score);
  const intended = boardDeltas(approach, tone);
  const satisfaction = clamp(profile.satisfactionLevel + intended.satisfaction, 0, 100);
  const patience = clamp(profile.patience + intended.patience, 0, 100);
  const budgetMultiplier = clamp(profile.budgetMultiplier + intended.budget, 0.5, 2);
  const reputation = clamp(state.scout.reputation + intended.reputation, 0, 100);
  const satisfactionDelta = round1(satisfaction - profile.satisfactionLevel);
  const patienceDelta = round1(patience - profile.patience);
  const budgetDelta = round1((budgetMultiplier - profile.budgetMultiplier) * 100) / 100;
  const reputationDelta = reputation - state.scout.reputation;
  const cooldown = getBoardMeetingCooldownWeeks(profile.personality);
  const nextMeetingAt = addGameWeeks(state.fixtures, now, cooldown);
  const approachLabel = BOARD_MEETING_APPROACHES.find((item) => item.id === approach)!.label;
  const summary = `${approachLabel} produced a ${tone} response from the ${profile.personality} board.`;
  const outcome: StakeholderMeetingOutcome = {
    stakeholder: "board",
    approach,
    tone,
    week: state.currentWeek,
    season: state.currentSeason,
    summary,
    fatigueCost: BOARD_MEETING_FATIGUE_COST,
    satisfactionDelta,
    patienceDelta,
    budgetMultiplierDelta: budgetDelta,
    reputationDelta,
    memoryReason: memory.reason,
  };
  const episode = meetingMemory({
    state,
    stakeholder: "board",
    stakeholderId: clubId,
    approach,
    tone,
    tags: boardMemoryTags(approach, tone),
  });
  const memoryResult = recordStakeholderMemory(state.consequenceState, episode);
  const updatedProfile = {
    ...profile,
    satisfactionLevel: round1(satisfaction),
    patience: round1(patience),
    budgetMultiplier: round1(budgetMultiplier * 100) / 100,
    nextMeetingAt,
    lastMeetingOutcome: outcome,
  };
  const message: InboxMessage = {
    id: `board-meeting-${clubId}-s${state.currentSeason}-w${state.currentWeek}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "feedback",
    title: "Board Meeting Concluded",
    body: [
      summary,
      `Satisfaction ${satisfactionDelta >= 0 ? "+" : ""}${satisfactionDelta}; patience ${patienceDelta >= 0 ? "+" : ""}${patienceDelta}.`,
      budgetDelta !== 0 ? `Budget multiplier ${budgetDelta >= 0 ? "+" : ""}${budgetDelta.toFixed(2)}x.` : undefined,
      reputationDelta !== 0 ? `Reputation ${reputationDelta >= 0 ? "+" : ""}${reputationDelta}.` : undefined,
      memory.reason,
      profile.ultimatumIssued ? "The existing ultimatum deadline remains unchanged." : undefined,
      `Next meeting: Season ${nextMeetingAt.season}, Week ${nextMeetingAt.week}.`,
    ].filter(Boolean).join("\n"),
    read: false,
    actionRequired: false,
  };
  const satisfactionHistory = satisfactionDelta === 0
    ? state.satisfactionHistory
    : [
        ...(state.satisfactionHistory ?? []),
        {
          reason: `Board meeting: ${approachLabel}`,
          delta: satisfactionDelta,
          week: state.currentWeek,
          season: state.currentSeason,
        },
      ].slice(-30);

  return {
    executed: true,
    outcome,
    state: {
      ...state,
      scout: {
        ...state.scout,
        fatigue: options.fatigueAlreadyPaid
          ? state.scout.fatigue
          : clamp(state.scout.fatigue + BOARD_MEETING_FATIGUE_COST, 0, 100),
        reputation,
      },
      boardProfile: updatedProfile,
      consequenceState: memoryResult.state,
      satisfactionHistory,
      inbox: appendInboxOnce(state, message),
    },
  };
}

/** Normalize malformed legacy optional fields without inventing past meetings. */
export function migratePoliticalMeetingState(state: GameState): GameState {
  const relationship = state.scout.managerRelationship;
  const managerRelationship = relationship
    ? {
        ...relationship,
        meetingsThisSeason: Number.isFinite(relationship.meetingsThisSeason)
          ? Math.max(0, Math.floor(relationship.meetingsThisSeason))
          : 0,
      }
    : undefined;
  const boardProfile = state.boardProfile
    ? {
        ...state.boardProfile,
        nextMeetingAt: state.boardProfile.nextMeetingAt
          && Number.isInteger(state.boardProfile.nextMeetingAt.week)
          && Number.isInteger(state.boardProfile.nextMeetingAt.season)
          ? state.boardProfile.nextMeetingAt
          : undefined,
      }
    : undefined;
  return {
    ...state,
    scout: { ...state.scout, managerRelationship },
    boardProfile,
  };
}
