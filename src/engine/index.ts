/**
 * TalentScout Game Engine — top-level barrel export.
 *
 * This module is the public API surface of the engine.
 * Import from here in application code.
 *
 * Usage:
 *   import { createRNG, processWeeklyTick, advanceWeek } from "@/engine";
 *   import type { GameState, Player, Scout } from "@/engine";
 */

// PRNG
export { createRNG, RNG } from "./rng/index";

// All core types and constants
export type {
  AttributeDomain,
  TechnicalAttribute,
  PhysicalAttribute,
  MentalAttribute,
  TacticalAttribute,
  HiddenAttribute,
  PlayerAttribute,
  AttributeDeltas,
  Position,
  Foot,
  DevelopmentProfile,
  WonderkidTier,
  Player,
  ScoutingPhilosophy,
  Club,
  League,
  Weather,
  Fixture,
  Specialization,
  ScoutSkill,
  ScoutAttribute,
  CareerTier,
  Scout,
  ObservationContext,
  FlaggedMoment,
  AttributeReading,
  Observation,
  ConvictionLevel,
  AttributeAssessment,
  ScoutReport,
  JobOffer,
  PerformanceReview,
  ContactType,
  Contact,
  ActivityType,
  Activity,
  WeekSchedule,
  MatchPhaseType,
  MatchEventType,
  MatchEvent,
  MatchPhase,
  InboxMessageType,
  InboxMessage,
  GameState,
  NewGameConfig,
  StandingEntry,
  TickResult,
  Transfer,
  PlayerDevelopmentResult,
  InjuryResult,
  SimulatedFixture,
} from "./core/index";

export {
  ATTRIBUTE_DOMAINS,
  ALL_ATTRIBUTES,
  TECHNICAL_ATTRIBUTES,
  PHYSICAL_ATTRIBUTES,
  MENTAL_ATTRIBUTES,
  TACTICAL_ATTRIBUTES,
  HIDDEN_ATTRIBUTES,
  ALL_POSITIONS,
  processWeeklyTick,
  advanceWeek,
  buildStandings,
  generateSeasonEvents,
  getActiveSeasonEvents,
  getUpcomingSeasonEvents,
  isInternationalBreak,
  getSeasonPhase,
} from "./core/index";
