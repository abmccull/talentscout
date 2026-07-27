"use client";

import type {
  Activity,
  ActivityType,
  ScoutAttribute,
  ScoutSkill,
} from "@/engine/core/types";
import {
  ACTIVITY_ATTRIBUTE_XP,
  ACTIVITY_FATIGUE_COSTS,
  ACTIVITY_SKILL_XP,
} from "@/engine/core/calendar";

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface ActivityGuide {
  context: string;
  question: string;
}

const SKILL_LABELS: Record<string, string> = {
  technicalEye: "Tech Eye",
  physicalAssessment: "Physical",
  psychologicalRead: "Psych Read",
  tacticalUnderstanding: "Tactical",
  dataLiteracy: "Data",
  playerJudgment: "Judgment",
  potentialAssessment: "Potential",
};

const ATTR_LABELS: Record<string, string> = {
  networking: "Network",
  persuasion: "Persuasion",
  endurance: "Endurance",
  adaptability: "Adapt",
  memory: "Memory",
  intuition: "Intuition",
};

const ACTIVITY_GUIDANCE: Partial<Record<ActivityType, ActivityGuide>> = {
  attendMatch: {
    context: "Full match context with team structure and level of opponent.",
    question: "Who actually changes the game when the rhythm and stakes rise?",
  },
  trainingVisit: {
    context: "Controlled environment for repetitions, habits, and coach demands.",
    question: "Does the player's technique and focus survive repetition?",
  },
  watchVideo: {
    context: "Desk review that sharpens the next live assignment.",
    question: "What should you verify in person before writing anything firm?",
  },
  schoolMatch: {
    context: "Raw youth football where physical edge and instinct show quickly.",
    question: "Is the player simply ahead early, or carrying traits that travel?",
  },
  grassrootsTournament: {
    context: "Dense prospect pool across multiple games and contrasting styles.",
    question: "Who keeps standing out when the samples stack up?",
  },
  streetFootball: {
    context: "Loose environment that exposes improvisation and technical bravery.",
    question: "Which actions come naturally without structure doing the work?",
  },
  academyTrialDay: {
    context: "Organised trial setting with stronger coaching scrutiny.",
    question: "Does the player look coachable as well as talented?",
  },
  youthFestival: {
    context: "Higher-profile youth gathering with broader comparison points.",
    question: "Who looks repeatable against better-calibrated opposition?",
  },
  youthTournament: {
    context: "Tournament football with faster reads, fatigue, and pressure.",
    question: "Which players hold their level across short-turnaround games?",
  },
  followUpSession: {
    context: "A narrow revisit to test whether the first impression still holds.",
    question: "What remains unresolved after your first watch?",
  },
  parentCoachMeeting: {
    context: "Off-pitch background on mentality, habits, and support structure.",
    question: "What character or context could change the projection?",
  },
  writeReport: {
    context: "Convert observations into a call somebody else can act on.",
    question: "What are you prepared to say clearly, and with how much conviction?",
  },
  writePlacementReport: {
    context: "Match a prospect to a club environment and pathway.",
    question: "Which destination makes the recommendation believable right now?",
  },
  networkMeeting: {
    context: "Relationship work that unlocks future leads and private intel.",
    question: "Which contact can improve next week's opportunity quality?",
  },
  study: {
    context: "Quiet development time that improves future reads.",
    question: "Which weakness in your craft is costing you the most today?",
  },
  rest: {
    context: "Recovery time that protects observation accuracy and judgment.",
    question: "Are you risking poor reads by pushing through fatigue?",
  },
};

const FIXED_WINDOW_TYPES = new Set<ActivityType>([
  "attendMatch",
  "schoolMatch",
  "reserveMatch",
  "trialMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "youthTournament",
  "followUpSession",
  "trainingVisit",
  "academyVisit",
  "agencyShowcase",
  "freeAgentOutreach",
  "scoutingMission",
  "oppositionAnalysis",
]);

const TRAVEL_HEAVY_TYPES = new Set<ActivityType>([
  "travel",
  "internationalTravel",
  "youthFestival",
  "youthTournament",
  "grassrootsTournament",
  "academyVisit",
  "scoutingMission",
  "agencyShowcase",
]);

const CONTEXT_TYPES = new Set<ActivityType>([
  "networkMeeting",
  "parentCoachMeeting",
  "managerMeeting",
  "agentShowcase",
  "analyticsTeamMeeting",
  "dataConference",
]);

const DECISION_TYPES = new Set<ActivityType>([
  "writeReport",
  "writePlacementReport",
  "reviewNPCReport",
  "boardPresentation",
  "loanRecommendation",
]);

const DESK_EVIDENCE_TYPES = new Set<ActivityType>([
  "watchVideo",
  "deepVideoAnalysis",
  "databaseQuery",
  "statsBriefing",
  "marketInefficiency",
  "study",
]);

const PROTECT_JUDGMENT_TYPES = new Set<ActivityType>([
  "rest",
  "travel",
  "internationalTravel",
  "study",
]);

export function activityPlanningKey(activity: Activity): string {
  return activity.instanceId ?? [
    activity.type,
    activity.targetId ?? "none",
    activity.destinationClubId ?? "none",
    activity.slots,
    activity.description,
    activity.targetPool?.map((target) => target.id).join(",") ?? "none",
  ].join(":");
}

export function getBestReturns(activity: Activity): string[] {
  const skillXp = ACTIVITY_SKILL_XP[activity.type];
  const attrXp = ACTIVITY_ATTRIBUTE_XP[activity.type];

  const skillReturns = skillXp
    ? (Object.entries(skillXp) as [ScoutSkill, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([skill, xp]) => `${SKILL_LABELS[skill] ?? skill} +${xp}`)
    : [];

  const attrReturns = attrXp
    ? (Object.entries(attrXp) as [ScoutAttribute, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1)
        .map(([attr, xp]) => `${ATTR_LABELS[attr] ?? attr} +${xp}`)
    : [];

  return [...skillReturns, ...attrReturns].slice(0, 3);
}

export function getTargetPoolLabel(activity: Activity): string | null {
  if (!activity.targetPool?.length) return null;

  const suffix =
    activity.type === "networkMeeting"
      ? "contacts"
      : activity.type === "watchVideo"
        ? "clips"
        : "targets";

  return `${activity.targetPool.length} ${suffix}`;
}

export function getActivityGuide(activity: Activity): ActivityGuide {
  return (
    ACTIVITY_GUIDANCE[activity.type] ?? {
      context: activity.description || "A scouting task for the current week.",
      question: "What new information can this slot buy for you this week?",
    }
  );
}

export function getActivityEvidenceReturn(activity: Activity): string {
  if (DECISION_TYPES.has(activity.type)) return "Turns your existing read into a decision somebody can act on.";
  if (CONTEXT_TYPES.has(activity.type)) return "Builds context and access around the case, not just another surface read.";
  if (PROTECT_JUDGMENT_TYPES.has(activity.type)) return "Protects future judgment rather than producing fresh evidence today.";
  if (DESK_EVIDENCE_TYPES.has(activity.type)) return "Improves desk evidence, pattern recognition, or the next assignment.";
  return "Buys live evidence that can deepen or challenge the current case.";
}

export function getActivityTravelLabel(activity: Activity): string {
  if (activity.type === "internationalTravel") return "International travel block with recovery and logistics overhead.";
  if (activity.type === "travel") return "Travel day that protects future access but adds little direct evidence.";
  if (TRAVEL_HEAVY_TYPES.has(activity.type) || activity.slots >= 2) return "Away-day commitment with material travel and recovery pressure.";
  if (PROTECT_JUDGMENT_TYPES.has(activity.type)) return "Desk-based or recovery work with no major travel requirement.";
  return "Primarily a local field or desk commitment.";
}

export function getActivityExpiryLabel(activity: Activity): string {
  if (FIXED_WINDOW_TYPES.has(activity.type)) return "Time-bound window inside this week. If you skip it, the context is gone.";
  if (activity.targetPool?.length) return "Flexible this week, but each unscheduled target leaves evidence untested.";
  return "Flexible inside this week. The cost is what you displace, not a hard expiry date.";
}

export function getActivityFatigueSummary(activity: Activity): {
  fatigueCost: number;
  fatigueLabel: string;
  fatigueTone: string;
} {
  const fatigueCost = ACTIVITY_FATIGUE_COSTS[activity.type];
  const fatigueTone =
    fatigueCost < 0
      ? "text-emerald-300"
      : fatigueCost <= 5
        ? "text-zinc-300"
        : fatigueCost <= 8
          ? "text-amber-300"
          : "text-red-300";
  const fatigueLabel = fatigueCost < 0
    ? `${Math.abs(fatigueCost)} fatigue recovered`
    : `+${fatigueCost} fatigue`;

  return { fatigueCost, fatigueLabel, fatigueTone };
}

export function getOpportunityCostLabel(activity: Activity, openDayCount: number): string {
  if (openDayCount === 0) {
    return `Needs ${activity.slots} day${activity.slots === 1 ? "" : "s"}; none open`;
  }
  return activity.slots === 1
    ? `Uses 1 of ${openDayCount} open day${openDayCount === 1 ? "" : "s"}`
    : `Uses ${activity.slots} of ${openDayCount} open days`;
}

export function getObligationCostLabel(activity: Activity, openDayCount: number): string {
  const remaining = Math.max(0, openDayCount - activity.slots);
  if (activity.slots >= openDayCount) {
    return `Commits the remaining ${openDayCount} open day${openDayCount === 1 ? "" : "s"} to this choice.`;
  }
  return `Commits ${activity.slots} day${activity.slots === 1 ? "" : "s"} and leaves ${remaining} day${remaining === 1 ? "" : "s"} for the rest of the week.`;
}

export function getAvailabilitySummary(
  activity: Activity,
  canScheduleAt: (activity: Activity, dayIndex: number) => boolean,
): {
  availableDays: string[];
  firstAvailableDayIndex: number;
  availabilityLabel: string;
} {
  const availableDays = DAY_LABELS.filter((_, dayIndex) => canScheduleAt(activity, dayIndex));
  const firstAvailableDayIndex = DAY_LABELS.findIndex((_, dayIndex) => canScheduleAt(activity, dayIndex));
  const availabilityLabel =
    availableDays.length === 0
      ? "No open window this week"
      : availableDays.length === 1
        ? `Open ${availableDays[0]} only`
        : `${availableDays.length} start windows`;

  return {
    availableDays,
    firstAvailableDayIndex,
    availabilityLabel,
  };
}
