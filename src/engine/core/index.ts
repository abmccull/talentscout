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
} from "./types";

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
  InjuryResult,
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

// Activity quality system
export { rollActivityQuality } from "./activityQuality";
export type {
  ActivityQualityTier,
  ActivityQualityResult,
} from "./activityQuality";
