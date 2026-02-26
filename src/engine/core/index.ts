/**
 * Core engine barrel export.
 *
 * Import from here rather than from individual files to keep imports stable
 * even if the internal module structure changes.
 *
 * Usage:
 *   import { processWeeklyTick, advanceWeek, type GameState } from "@/engine/core";
 */

// All types — re-export everything
export type {
  // Attribute system
  AttributeDomain,
  TechnicalAttribute,
  PhysicalAttribute,
  MentalAttribute,
  TacticalAttribute,
  HiddenAttribute,
  PlayerAttribute,
  AttributeDeltas,

  // Player
  Position,
  Foot,
  DevelopmentProfile,
  WonderkidTier,
  Player,

  // Club & League
  ScoutingPhilosophy,
  Club,
  League,
  Weather,
  Fixture,

  // Scout
  Specialization,
  ScoutSkill,
  ScoutAttribute,
  CareerTier,
  Scout,

  // Observations
  ObservationContext,
  FlaggedMoment,
  AttributeReading,
  AbilityReading,
  Observation,

  // Reports
  ConvictionLevel,
  AttributeAssessment,
  ScoutReport,

  // Career
  JobOffer,
  PerformanceReview,

  // Network
  ContactType,
  Contact,

  // Calendar
  ActivityType,
  Activity,
  WeekSchedule,

  // Match engine
  MatchPhaseType,
  MatchEventType,
  MatchEvent,
  MatchPhase,

  // Inbox
  InboxMessageType,
  InboxMessage,

  // Game state
  GameState,
  NewGameConfig,
  StandingEntry,

  // First-team scouting
  ManagerDirective,
  ClubResponseType,
  ClubResponse,
  TransferRecord,
  SystemFitResult,

  // Data scouting
  Prediction,
  DataAnalyst,
  StatisticalProfile,
  AnomalyFlag,
  AnalystReport,

  // Injury system
  Injury,
  InjuryHistory,
  InjuryType,
  InjurySeverity,

  // Board satisfaction tracking (A4)
  BoardSatisfactionDelta,

  // Chain consequences (A5)
  NarrativeEventType,
  NarrativeEvent,
  ChainConsequence,

  // Gossip actions (A3)
  GossipAction,
  ActionableGossipItem,

  // Season awards (A8)
  SeasonAward,
  LeagueAward,
  SeasonAwardsData,
  SeasonStats,
} from "./types";

// Season awards engine (A8)
export { generateSeasonAwardsData } from "./seasonAwards";

// Runtime constants (values, not just types)
export {
  ATTRIBUTE_DOMAINS,
  ALL_ATTRIBUTES,
  TECHNICAL_ATTRIBUTES,
  PHYSICAL_ATTRIBUTES,
  MENTAL_ATTRIBUTES,
  TACTICAL_ATTRIBUTES,
  HIDDEN_ATTRIBUTES,
  ALL_POSITIONS,
} from "./types";

// Game loop functions and result types
export { processWeeklyTick, advanceWeek, buildStandings } from "./gameLoop";

export type {
  TickResult,
  Transfer,
  PlayerDevelopmentResult,
  BreakthroughResult,
  InjuryResult,
  InjurySetbackResult,
  SimulatedFixture,
} from "./gameLoop";

// Season calendar events
export {
  generateSeasonEvents,
  getActiveSeasonEvents,
  getUpcomingSeasonEvents,
  isInternationalBreak,
  getSeasonPhase,
} from "./seasonEvents";

// Season event effects
export {
  applySeasonEventEffects,
  resolveSeasonEventChoice,
  getActiveEffectModifiers,
} from "./seasonEventEffects";

export type {
  SeasonEventEffect,
  SeasonEventEffectType,
  SeasonEventChoice,
} from "./types";

// Calendar data tables (used by UI for activity previews)
export {
  ACTIVITY_SLOT_COSTS,
  ACTIVITY_FATIGUE_COSTS,
  ACTIVITY_SKILL_XP,
  ACTIVITY_ATTRIBUTE_XP,
  getAvailableActivities,
} from "./calendar";

// Activity metadata (categories, specialization themes)
export {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_CONFIG,
  SPECIALIZATION_THEMES,
} from "./activityMetadata";
export type { ActivityCategory, SpecializationTheme } from "./activityMetadata";

// Activity quality system
export { rollActivityQuality } from "./activityQuality";
export type {
  ActivityQualityTier,
  ActivityQualityResult,
} from "./activityQuality";

// Achievement engine
export {
  getAchievementProgress,
  getAchievementRarity,
  createUnlockRecord,
  RARITY_CONFIG,
} from "./achievementEngine";
export type {
  AchievementRarity,
  AchievementProgress,
  AchievementEvaluation,
  AchievementUnlock,
} from "./achievementEngine";

// Week preview (F16)
export { generateWeekPreview, suggestOptimalSchedule } from "./weekPreview";
export type {
  PreviewMatch,
  CongestionLevel,
  ScheduleSuggestion,
  SchedulePriorities,
  WeekPreview,
} from "./weekPreview";
