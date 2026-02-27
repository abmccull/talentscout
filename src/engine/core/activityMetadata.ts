/**
 * Activity metadata — category mapping, display config, and specialization
 * theming for the calendar UI.
 *
 * Pure data module (no React imports). Follows the equipmentCatalog.ts pattern.
 * Fatigue/XP data stays in calendar.ts — this file only adds UI-facing concerns.
 */

import type { ActivityType, Specialization } from "./types";

// ---------------------------------------------------------------------------
// Activity categories — three groups for a clean calendar layout
// ---------------------------------------------------------------------------

export type ActivityCategory =
  | "scouting"
  | "networking"
  | "recovery";

export interface ActivityCategoryConfig {
  label: string;
  order: number;
  /** Per-specialization label overrides for the section header. */
  specLabel?: Partial<Record<Specialization, string>>;
}

export const ACTIVITY_CATEGORY_CONFIG: Record<ActivityCategory, ActivityCategoryConfig> = {
  scouting: {
    label: "Scouting",
    order: 0,
    specLabel: {
      youth: "Scouting & Youth",
      firstTeam: "Scouting & First Team",
      data: "Scouting & Analysis",
    },
  },
  networking: {
    label: "Networking",
    order: 1,
  },
  recovery: {
    label: "Recovery, Travel & Development",
    order: 2,
  },
};

/** Maps every ActivityType to its display category. */
export const ACTIVITY_CATEGORIES: Record<ActivityType, ActivityCategory> = {
  // Scouting — matches, specialist activities, and general scouting
  attendMatch: "scouting",
  schoolMatch: "scouting",
  reserveMatch: "scouting",
  trialMatch: "scouting",

  // Scouting — youth specialist
  grassrootsTournament: "scouting",
  streetFootball: "scouting",
  academyTrialDay: "scouting",
  youthFestival: "scouting",
  followUpSession: "scouting",
  writePlacementReport: "scouting",
  agencyShowcase: "scouting",

  // Scouting — first-team specialist
  scoutingMission: "scouting",
  oppositionAnalysis: "scouting",
  agentShowcase: "scouting",
  contractNegotiation: "scouting",

  // Scouting — data specialist
  databaseQuery: "scouting",
  deepVideoAnalysis: "scouting",
  algorithmCalibration: "scouting",
  marketInefficiency: "scouting",
  statsBriefing: "scouting",
  dataConference: "scouting",
  analyticsTeamMeeting: "scouting",

  // Free agent activities
  freeAgentOutreach: "scouting",

  // Loan activities
  loanMonitoring: "scouting",
  loanRecommendation: "scouting",

  // Scouting — universal
  watchVideo: "scouting",
  trainingVisit: "scouting",
  academyVisit: "scouting",
  youthTournament: "scouting",

  // Scouting — reports (core scouting output)
  writeReport: "scouting",
  reviewNPCReport: "scouting",
  boardPresentation: "scouting",
  assignTerritory: "scouting",

  // Networking
  networkMeeting: "networking",
  parentCoachMeeting: "networking",
  managerMeeting: "networking",

  // Recovery, travel & development
  rest: "recovery",
  travel: "recovery",
  internationalTravel: "recovery",
  study: "recovery",
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
