/**
 * Activity metadata — category mapping, display config, and specialization
 * theming for the calendar UI.
 *
 * Pure data module (no React imports). Follows the equipmentCatalog.ts pattern.
 * Fatigue/XP data stays in calendar.ts — this file only adds UI-facing concerns.
 */

import type { ActivityType, Specialization } from "./types";

// ---------------------------------------------------------------------------
// Activity categories
// ---------------------------------------------------------------------------

export type ActivityCategory =
  | "matches"
  | "specialist"
  | "scouting"
  | "office"
  | "networking"
  | "recovery";

export interface ActivityCategoryConfig {
  label: string;
  order: number;
  /** Per-specialization label overrides for the section header. */
  specLabel?: Partial<Record<Specialization, string>>;
}

export const ACTIVITY_CATEGORY_CONFIG: Record<ActivityCategory, ActivityCategoryConfig> = {
  matches: {
    label: "Matches",
    order: 0,
  },
  specialist: {
    label: "Your Specialty",
    order: 1,
    specLabel: {
      youth: "Youth Scouting",
      firstTeam: "First Team Operations",
      data: "Data Analysis",
    },
  },
  scouting: {
    label: "Scouting",
    order: 2,
  },
  office: {
    label: "Office Work",
    order: 3,
  },
  networking: {
    label: "Networking",
    order: 4,
  },
  recovery: {
    label: "Recovery & Travel",
    order: 5,
  },
};

/** Maps every ActivityType to its display category. */
export const ACTIVITY_CATEGORIES: Record<ActivityType, ActivityCategory> = {
  // Matches
  attendMatch: "matches",
  schoolMatch: "matches",
  reserveMatch: "matches",
  trialMatch: "matches",

  // Specialist — youth
  grassrootsTournament: "specialist",
  streetFootball: "specialist",
  academyTrialDay: "specialist",
  youthFestival: "specialist",
  followUpSession: "specialist",
  writePlacementReport: "specialist",

  // Specialist — first-team
  scoutingMission: "specialist",
  oppositionAnalysis: "specialist",
  agentShowcase: "specialist",
  contractNegotiation: "specialist",

  // Specialist — data
  databaseQuery: "specialist",
  deepVideoAnalysis: "specialist",
  algorithmCalibration: "specialist",
  marketInefficiency: "specialist",
  statsBriefing: "specialist",
  dataConference: "specialist",
  analyticsTeamMeeting: "specialist",

  // Scouting (universal)
  watchVideo: "scouting",
  trainingVisit: "scouting",
  academyVisit: "scouting",
  youthTournament: "scouting",

  // Office work
  writeReport: "office",
  study: "office",
  reviewNPCReport: "office",
  boardPresentation: "office",
  assignTerritory: "office",

  // Networking
  networkMeeting: "networking",
  parentCoachMeeting: "networking",
  managerMeeting: "networking",

  // Recovery & travel
  rest: "recovery",
  travel: "recovery",
  internationalTravel: "recovery",
};

// ---------------------------------------------------------------------------
// Specialization theming
// ---------------------------------------------------------------------------

export interface SpecializationTheme {
  label: string;
  tagline: string;
  accentColor: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export const SPECIALIZATION_THEMES: Record<Specialization, SpecializationTheme> = {
  youth: {
    label: "Youth Scout",
    tagline: "Discovering tomorrow's stars",
    accentColor: "emerald",
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-400",
    borderClass: "border-emerald-500/30",
  },
  firstTeam: {
    label: "First Team Scout",
    tagline: "Finding ready-now talent",
    accentColor: "sky",
    bgClass: "bg-sky-500/10",
    textClass: "text-sky-400",
    borderClass: "border-sky-500/30",
  },
  regional: {
    label: "Regional Expert",
    tagline: "Deep territory knowledge",
    accentColor: "amber",
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-400",
    borderClass: "border-amber-500/30",
  },
  data: {
    label: "Data Scout",
    tagline: "Numbers reveal the truth",
    accentColor: "cyan",
    bgClass: "bg-cyan-500/10",
    textClass: "text-cyan-400",
    borderClass: "border-cyan-500/30",
  },
};
