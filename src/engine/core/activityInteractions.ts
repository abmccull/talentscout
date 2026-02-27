import type {
  Activity,
  ActivityType,
  DayInteractionOption,
  DayInteractionState,
} from "@/engine/core/types";

export type ActivityChoiceId = "scan" | "focus" | "network";

export interface ActivityInteractionEffect {
  discoveryModifier?: number;
  profileModifier?: number;
  anomalyModifier?: number;
  relationshipModifier?: number;
  reportQualityModifier?: number;
}

export interface ActivityInteractionProfile {
  prompt: string;
  options: DayInteractionOption[];
  maxFocusPlayers?: number;
  defaultChoiceId?: ActivityChoiceId;
  effects: Record<ActivityChoiceId, ActivityInteractionEffect>;
}

const SCOUTING_OPTIONS: DayInteractionOption[] = [
  {
    id: "scan",
    label: "Cast Wide Net",
    description: "Prioritize volume and surface more potential targets.",
  },
  {
    id: "focus",
    label: "Focus Prospect",
    description: "Reduce volume and deepen confidence on selected players.",
  },
  {
    id: "network",
    label: "Build Context",
    description: "Trade some volume for intel and off-ball context.",
  },
];

const DATA_OPTIONS: DayInteractionOption[] = [
  {
    id: "scan",
    label: "Broad Scan",
    description: "Wider query for more profiles, with less depth per case.",
  },
  {
    id: "focus",
    label: "Deep Dive",
    description: "Concentrate on fewer profiles with stronger confidence.",
  },
  {
    id: "network",
    label: "Cross-Check",
    description: "Validate findings through context and human inputs.",
  },
];

const NEGOTIATION_OPTIONS: DayInteractionOption[] = [
  {
    id: "scan",
    label: "Push Volume",
    description: "Cover more cases quickly with lighter detail.",
  },
  {
    id: "focus",
    label: "Target Deal",
    description: "Concentrate effort on a smaller set of high-priority deals.",
  },
  {
    id: "network",
    label: "Relationship Route",
    description: "Lean into trust and persuasion to improve outcomes.",
  },
];

const PROFILES: Partial<Record<ActivityType, ActivityInteractionProfile>> = {
  attendMatch: {
    prompt: "How do you approach this match day?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  watchVideo: {
    prompt: "How do you run your video session today?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1, profileModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  writeReport: {
    prompt: "What reporting style are you using?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 2,
    defaultChoiceId: "focus",
    effects: {
      scan: { reportQualityModifier: -1 },
      focus: { reportQualityModifier: 2 },
      network: { relationshipModifier: 1, reportQualityModifier: 1 },
    },
  },
  networkMeeting: {
    prompt: "How do you run this meeting?",
    options: NEGOTIATION_OPTIONS,
    defaultChoiceId: "network",
    effects: {
      scan: { relationshipModifier: 0 },
      focus: { relationshipModifier: 1, reportQualityModifier: 1 },
      network: { relationshipModifier: 2 },
    },
  },
  trainingVisit: {
    prompt: "What is your training-ground approach today?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  academyVisit: {
    prompt: "How do you approach this academy day?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  youthTournament: {
    prompt: "How do you scout this tournament day?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  schoolMatch: {
    prompt: "What is your school-match focus today?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  grassrootsTournament: {
    prompt: "What is your grassroots strategy today?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  streetFootball: {
    prompt: "How do you read this street football session?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  academyTrialDay: {
    prompt: "How do you approach this trial day?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  youthFestival: {
    prompt: "How do you scout this festival day?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  followUpSession: {
    prompt: "How intensive is your follow-up session?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 2,
    defaultChoiceId: "focus",
    effects: {
      scan: { discoveryModifier: 0 },
      focus: { reportQualityModifier: 2 },
      network: { relationshipModifier: 1, reportQualityModifier: 1 },
    },
  },
  parentCoachMeeting: {
    prompt: "How do you run the parent/coach discussion?",
    options: NEGOTIATION_OPTIONS,
    defaultChoiceId: "network",
    effects: {
      scan: { relationshipModifier: 0 },
      focus: { reportQualityModifier: 1 },
      network: { relationshipModifier: 2 },
    },
  },
  reserveMatch: {
    prompt: "How do you scout this reserve match?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  scoutingMission: {
    prompt: "What mission approach are you taking?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "scan",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  oppositionAnalysis: {
    prompt: "How do you run opposition analysis?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "focus",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 2 },
      network: { relationshipModifier: 1 },
    },
  },
  agentShowcase: {
    prompt: "How do you approach this showcase?",
    options: NEGOTIATION_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "network",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 1 },
      network: { relationshipModifier: 2 },
    },
  },
  trialMatch: {
    prompt: "How do you run this trial assessment?",
    options: SCOUTING_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "focus",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: -1, reportQualityModifier: 2 },
      network: { relationshipModifier: 1 },
    },
  },
  contractNegotiation: {
    prompt: "What is your negotiation approach?",
    options: NEGOTIATION_OPTIONS,
    defaultChoiceId: "network",
    effects: {
      scan: { relationshipModifier: 0 },
      focus: { reportQualityModifier: 1, relationshipModifier: 1 },
      network: { relationshipModifier: 2, reportQualityModifier: 1 },
    },
  },
  freeAgentOutreach: {
    prompt: "How do you run this free agent outreach day?",
    options: NEGOTIATION_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "focus",
    effects: {
      scan: { discoveryModifier: 1 },
      focus: { discoveryModifier: 0, reportQualityModifier: 1 },
      network: { relationshipModifier: 2, discoveryModifier: 1 },
    },
  },
  databaseQuery: {
    prompt: "How do you run your query cycle today?",
    options: DATA_OPTIONS,
    defaultChoiceId: "scan",
    effects: {
      scan: { profileModifier: 2, anomalyModifier: 0 },
      focus: { profileModifier: -1, anomalyModifier: 1, reportQualityModifier: 1 },
      network: { profileModifier: 0, anomalyModifier: 1, relationshipModifier: 1 },
    },
  },
  deepVideoAnalysis: {
    prompt: "What analysis mode do you use for deep video?",
    options: DATA_OPTIONS,
    maxFocusPlayers: 3,
    defaultChoiceId: "focus",
    effects: {
      scan: { profileModifier: 1 },
      focus: { profileModifier: 0, reportQualityModifier: 2 },
      network: { anomalyModifier: 1, relationshipModifier: 1 },
    },
  },
  statsBriefing: {
    prompt: "How do you steer the stats briefing?",
    options: DATA_OPTIONS,
    defaultChoiceId: "network",
    effects: {
      scan: { anomalyModifier: 1 },
      focus: { anomalyModifier: 2, profileModifier: -1 },
      network: { anomalyModifier: 1, relationshipModifier: 1 },
    },
  },
  dataConference: {
    prompt: "What is your conference strategy?",
    options: DATA_OPTIONS,
    defaultChoiceId: "network",
    effects: {
      scan: { profileModifier: 1 },
      focus: { reportQualityModifier: 1 },
      network: { relationshipModifier: 2 },
    },
  },
  algorithmCalibration: {
    prompt: "How do you calibrate models this week?",
    options: DATA_OPTIONS,
    defaultChoiceId: "focus",
    effects: {
      scan: { profileModifier: 1 },
      focus: { profileModifier: 2, anomalyModifier: 1 },
      network: { relationshipModifier: 1 },
    },
  },
  marketInefficiency: {
    prompt: "How do you run market inefficiency scans?",
    options: DATA_OPTIONS,
    defaultChoiceId: "scan",
    effects: {
      scan: { profileModifier: 2, anomalyModifier: 1 },
      focus: { profileModifier: 0, anomalyModifier: 2, reportQualityModifier: 1 },
      network: { relationshipModifier: 1, anomalyModifier: 1 },
    },
  },
  analyticsTeamMeeting: {
    prompt: "How do you run your analyst meeting?",
    options: DATA_OPTIONS,
    defaultChoiceId: "network",
    effects: {
      scan: { profileModifier: 1 },
      focus: { reportQualityModifier: 1 },
      network: { relationshipModifier: 2, anomalyModifier: 1 },
    },
  },
};

const EMPTY_EFFECT: ActivityInteractionEffect = {};

export function getActivityInteractionProfile(
  activityType: ActivityType,
): ActivityInteractionProfile | undefined {
  return PROFILES[activityType];
}

export function getActivityInteractionEffect(
  activityType: ActivityType,
  choiceId: string | undefined,
): ActivityInteractionEffect {
  const profile = PROFILES[activityType];
  if (!profile) return EMPTY_EFFECT;
  if (choiceId !== "scan" && choiceId !== "focus" && choiceId !== "network") return EMPTY_EFFECT;
  return profile.effects[choiceId] ?? EMPTY_EFFECT;
}

export function buildActivityInteractionState(
  activity: Activity | null,
): DayInteractionState | undefined {
  if (!activity) return undefined;
  const profile = PROFILES[activity.type];
  if (!profile) return undefined;
  return {
    prompt: profile.prompt,
    options: profile.options,
    maxFocusPlayers: profile.maxFocusPlayers,
  };
}

export function getActivityDefaultChoice(
  activityType: ActivityType,
): ActivityChoiceId {
  return PROFILES[activityType]?.defaultChoiceId ?? "scan";
}
