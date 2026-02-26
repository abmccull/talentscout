/**
 * Season Event Effects — applies mechanical effects from active season events.
 *
 * This module is the bridge between the season calendar (informational) and
 * actual game-state changes. Each effect type has a handler that modifies
 * the appropriate part of the state.
 *
 * All functions are pure: they take state in and return new state out.
 * No React imports, no side effects.
 */

import type {
  GameState,
  SeasonEvent,
  SeasonEventEffect,
  SeasonEventEffectType,
  InboxMessage,
} from "./types";
import type { RNG } from "../rng/index";

// =============================================================================
// PUBLIC TYPES
// =============================================================================

/**
 * Aggregated modifiers from all currently active season events.
 * Consumed by other systems (scouting, transfers, match sim) to adjust
 * their calculations without coupling to the event system directly.
 */
export interface ActiveEffectModifiers {
  /** Multiplicative modifier on transfer prices (e.g., 0.3 = +30%). */
  transferPriceModifier: number;
  /** Multiplicative modifier on scouting costs (e.g., -0.4 = -40%). */
  scoutingCostModifier: number;
  /** Additive modifier on weekly fatigue change (positive = more fatigue). */
  fatigueModifier: number;
  /** Flat reputation bonus applied this week. */
  reputationBonus: number;
  /** Multiplicative modifier on youth intake quality. */
  youthIntakeModifier: number;
  /** Fraction of players unavailable (e.g., 0.15 = 15% unavailable). */
  playerAvailabilityReduction: number;
  /** Multiplicative modifier on injury risk (e.g., 0.2 = +20%). */
  injuryRiskModifier: number;
  /** Multiplicative bonus on attribute reveal quality. */
  attributeRevealBonus: number;
}

// =============================================================================
// EFFECT AGGREGATION
// =============================================================================

/**
 * Create a zero-value modifiers object (no effects active).
 */
function emptyModifiers(): ActiveEffectModifiers {
  return {
    transferPriceModifier: 0,
    scoutingCostModifier: 0,
    fatigueModifier: 0,
    reputationBonus: 0,
    youthIntakeModifier: 0,
    playerAvailabilityReduction: 0,
    injuryRiskModifier: 0,
    attributeRevealBonus: 0,
  };
}

/**
 * Accumulate a single effect into the modifiers aggregate.
 */
function accumulateEffect(
  mods: ActiveEffectModifiers,
  effect: SeasonEventEffect,
): ActiveEffectModifiers {
  const result = { ...mods };

  switch (effect.type) {
    case "transferPriceModifier":
      result.transferPriceModifier += effect.value;
      break;
    case "scoutingCostModifier":
      result.scoutingCostModifier += effect.value;
      break;
    case "fatigueModifier":
      result.fatigueModifier += effect.value;
      break;
    case "reputationBonus":
      result.reputationBonus += effect.value;
      break;
    case "youthIntake":
      result.youthIntakeModifier += effect.value;
      break;
    case "playerAvailability":
      // value is negative (reduction), flip to positive for the reduction field
      result.playerAvailabilityReduction += Math.abs(effect.value);
      break;
    case "injuryRiskModifier":
      result.injuryRiskModifier += effect.value;
      break;
    case "attributeRevealBonus":
      result.attributeRevealBonus += effect.value;
      break;
  }

  return result;
}

/**
 * Get the effective effects for a season event, considering whether a choice
 * has been made. If the event has been resolved with a choice, use that
 * choice's effects; otherwise use the event's base effects.
 */
function getEffectiveEffects(event: SeasonEvent): SeasonEventEffect[] {
  if (
    event.resolved &&
    event.choiceSelected !== undefined &&
    event.choices &&
    event.choices[event.choiceSelected]
  ) {
    return event.choices[event.choiceSelected].effects;
  }
  return event.effects ?? [];
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Compute the aggregated effect modifiers from all currently active season
 * events. This is a read-only query — it does not modify state.
 *
 * @param activeEvents - Events that are currently active this week.
 * @returns Aggregated modifiers for use by other systems.
 */
export function getActiveEffectModifiers(
  activeEvents: SeasonEvent[],
): ActiveEffectModifiers {
  let mods = emptyModifiers();

  for (const event of activeEvents) {
    const effects = getEffectiveEffects(event);
    for (const effect of effects) {
      mods = accumulateEffect(mods, effect);
    }
  }

  return mods;
}

/**
 * Apply season event effects to the game state. Called once per week during
 * processWeeklyTick for each active event.
 *
 * This applies the "instant" effects that modify state directly:
 * - reputationBonus: added to scout reputation
 * - fatigueModifier: adjusts scout fatigue
 *
 * Modifier-based effects (transferPriceModifier, scoutingCostModifier, etc.)
 * are NOT applied here — they are queried via getActiveEffectModifiers() by
 * the systems that need them (transfer engine, scouting engine, etc.).
 *
 * @param state        - Current game state (not mutated).
 * @param activeEvents - Events active this week.
 * @param rng          - Seeded PRNG.
 * @returns New game state with direct effects applied, plus any inbox messages.
 */
export function applySeasonEventEffects(
  state: GameState,
  activeEvents: SeasonEvent[],
  rng: RNG,
): { state: GameState; messages: InboxMessage[] } {
  if (activeEvents.length === 0) {
    return { state, messages: [] };
  }

  const mods = getActiveEffectModifiers(activeEvents);
  const messages: InboxMessage[] = [];

  // Apply direct state modifications
  let updatedScout = { ...state.scout };

  // Reputation bonus (clamped to [0, 100])
  if (mods.reputationBonus !== 0) {
    updatedScout = {
      ...updatedScout,
      reputation: Math.min(
        100,
        Math.max(0, updatedScout.reputation + mods.reputationBonus),
      ),
    };
  }

  // Fatigue modifier (clamped to [0, 100])
  if (mods.fatigueModifier !== 0) {
    const fatigueChange = Math.round(mods.fatigueModifier * 10);
    updatedScout = {
      ...updatedScout,
      fatigue: Math.min(
        100,
        Math.max(0, updatedScout.fatigue + fatigueChange),
      ),
    };
  }

  // Generate notification messages for events with unresolved choices
  for (const event of activeEvents) {
    if (event.choices && event.choices.length > 0 && !event.resolved) {
      // Only send a message on the first week the event is active
      if (state.currentWeek === event.startWeek) {
        const choiceId = `se_choice_${rng.nextInt(100000, 999999)}`;
        messages.push({
          id: choiceId,
          type: "event",
          title: `${event.name} — Decision Required`,
          body: `${event.description}. You have a decision to make regarding your scouting strategy during this period.`,
          week: state.currentWeek,
          season: state.currentSeason,
          read: false,
          actionRequired: true,
        });
      }
    }
  }

  const newState: GameState = {
    ...state,
    scout: updatedScout,
  };

  return { state: newState, messages };
}

/**
 * Resolve a season event by selecting one of its choices.
 * The choice's effects replace the event's base effects for the remainder
 * of the event's active period.
 *
 * @param state       - Current game state (not mutated).
 * @param eventId     - ID of the season event to resolve.
 * @param choiceIndex - Index of the chosen option in the event's choices array.
 * @returns New game state with the event marked as resolved.
 */
export function resolveSeasonEventChoice(
  state: GameState,
  eventId: string,
  choiceIndex: number,
): GameState {
  const eventIndex = state.seasonEvents.findIndex((e) => e.id === eventId);
  if (eventIndex === -1) return state;

  const event = state.seasonEvents[eventIndex];

  // Cannot resolve if already resolved or no choices available
  if (event.resolved) return state;
  if (!event.choices || choiceIndex < 0 || choiceIndex >= event.choices.length) {
    return state;
  }

  const updatedEvent: SeasonEvent = {
    ...event,
    resolved: true,
    choiceSelected: choiceIndex,
  };

  const updatedEvents = [...state.seasonEvents];
  updatedEvents[eventIndex] = updatedEvent;

  return {
    ...state,
    seasonEvents: updatedEvents,
  };
}
