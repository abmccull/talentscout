/**
 * Discipline / Card System
 *
 * Generates yellow/red card events from match phases, tracks accumulation,
 * handles suspensions, and provides availability checks.
 *
 * Card probability is driven by:
 *   - Tackle/foul event quality (lower quality = higher chance)
 *   - Player temperament personality trait (doubles probability)
 *   - Player defensiveAwareness attribute (lower = slightly higher card risk)
 *
 * Suspension thresholds:
 *   - 5 yellows  → 1 match ban
 *   - 10 yellows → 2 match ban
 *   - Red card    → 1–3 matches depending on reason
 */

import type { RNG } from "@/engine/rng";
import type {
  MatchPhase,
  Player,
  CardEvent,
  CardReason,
  DisciplinaryRecord,
} from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Base yellow card probability for a tackle/foul event with quality < 3. */
const BASE_YELLOW_PROBABILITY = 0.40;
/** Base red card probability for a tackle/foul event with quality < 3. */
const BASE_RED_PROBABILITY = 0.05;

/** Yellow probability for events with quality 3-4 (moderate). */
const MODERATE_YELLOW_PROBABILITY = 0.12;
/** Red probability for moderate quality events. */
const MODERATE_RED_PROBABILITY = 0.01;

/** Yellow probability for higher quality events (5+). Very rare. */
const HIGH_QUALITY_YELLOW_PROBABILITY = 0.03;

/** Multiplier applied when a player has the "temperamental" personality trait. */
const TEMPERAMENT_MULTIPLIER = 2.0;

/** Suspension lengths by red card reason. */
const RED_CARD_SUSPENSION: Record<CardReason, number> = {
  recklessTackle: 1,
  professionalFoul: 1,
  dissent: 1,
  timewasting: 1,
  handball: 1,
  violentConduct: 3,
};

/** Card reason weights for yellow cards. */
const YELLOW_REASON_WEIGHTS: Array<{ item: CardReason; weight: number }> = [
  { item: "recklessTackle", weight: 40 },
  { item: "professionalFoul", weight: 25 },
  { item: "dissent", weight: 15 },
  { item: "timewasting", weight: 10 },
  { item: "handball", weight: 10 },
];

/** Card reason weights for red cards. */
const RED_REASON_WEIGHTS: Array<{ item: CardReason; weight: number }> = [
  { item: "violentConduct", weight: 30 },
  { item: "recklessTackle", weight: 30 },
  { item: "professionalFoul", weight: 25 },
  { item: "handball", weight: 10 },
  { item: "dissent", weight: 5 },
];

/** Commentary templates for card events. */
const CARD_COMMENTARY = {
  yellow: [
    (name: string, m: number, reason: string) =>
      `${m}' — YELLOW CARD! ${name} is booked for ${reason}.`,
    (name: string, m: number, reason: string) =>
      `${m}' — The referee reaches for the yellow card. ${name} is cautioned for ${reason}.`,
    (name: string, m: number, reason: string) =>
      `${m}' — ${name} goes into the book after ${reason}. That's a booking.`,
  ],
  red: [
    (name: string, m: number, reason: string) =>
      `${m}' — RED CARD! ${name} is sent off for ${reason}! Down to 10 men.`,
    (name: string, m: number, reason: string) =>
      `${m}' — The referee shows red! ${name} is dismissed for ${reason}.`,
    (name: string, m: number, reason: string) =>
      `${m}' — Straight red card for ${name}! ${reason}. A huge blow.`,
  ],
};

/** Human-readable reason descriptions. */
const REASON_DESCRIPTIONS: Record<CardReason, string> = {
  recklessTackle: "a reckless tackle",
  professionalFoul: "a professional foul",
  dissent: "dissent towards the referee",
  timewasting: "time-wasting",
  handball: "a deliberate handball",
  violentConduct: "violent conduct",
};

// =============================================================================
// CARD GENERATION
// =============================================================================

/**
 * Post-process match phases to generate card events.
 * Scans for tackle and foul events, then rolls for card probability
 * based on event quality and player attributes.
 *
 * @returns Array of CardEvent objects and updated phases with card events injected.
 */
export function generateCardEvents(
  rng: RNG,
  phases: MatchPhase[],
  allPlayers: Map<string, Player>,
  fixtureId: string,
): { cards: CardEvent[]; updatedPhases: MatchPhase[] } {
  const cards: CardEvent[] = [];
  const updatedPhases: MatchPhase[] = [];
  /** Track players who already got a red card — no double-carding. */
  const redCardedPlayers = new Set<string>();
  /** Track players who already have a yellow — second yellow = red. */
  const yellowCardedPlayers = new Set<string>();

  for (const phase of phases) {
    const newEvents = [...phase.events];

    for (const event of phase.events) {
      // Only tackle and foul events can produce cards
      if (event.type !== "tackle" && event.type !== "foul") continue;
      if (redCardedPlayers.has(event.playerId)) continue;

      const player = allPlayers.get(event.playerId);
      if (!player) continue;

      // Compute card probability based on event quality
      let yellowProb: number;
      let redProb: number;

      if (event.quality <= 2) {
        yellowProb = BASE_YELLOW_PROBABILITY;
        redProb = BASE_RED_PROBABILITY;
      } else if (event.quality <= 4) {
        yellowProb = MODERATE_YELLOW_PROBABILITY;
        redProb = MODERATE_RED_PROBABILITY;
      } else {
        yellowProb = HIGH_QUALITY_YELLOW_PROBABILITY;
        redProb = 0;
      }

      // Temperament modifier: "temperamental" personality trait doubles probability
      const isTemperamental = player.personalityTraits?.includes("temperamental") ?? false;
      if (isTemperamental) {
        yellowProb *= TEMPERAMENT_MULTIPLIER;
        redProb *= TEMPERAMENT_MULTIPLIER;
      }

      // Defensive awareness modifier: low awareness = slightly higher card risk
      const defAwareness = player.attributes.defensiveAwareness ?? 10;
      if (defAwareness < 8) {
        const awarenessPenalty = 1 + (8 - defAwareness) * 0.05; // up to 1.35x for awareness=1
        yellowProb *= awarenessPenalty;
        redProb *= awarenessPenalty;
      }

      // Cap probabilities at reasonable levels
      yellowProb = Math.min(yellowProb, 0.85);
      redProb = Math.min(redProb, 0.15);

      // Roll for card
      const roll = rng.nextFloat(0, 1);

      if (roll < redProb) {
        // Straight red card
        const reason = rng.pickWeighted(RED_REASON_WEIGHTS);
        const card: CardEvent = {
          type: "red",
          playerId: event.playerId,
          fixtureId,
          minute: event.minute,
          reason,
        };
        cards.push(card);
        redCardedPlayers.add(event.playerId);

        // Inject card event into the phase
        const name = `${player.firstName} ${player.lastName}`;
        const template = rng.pick(CARD_COMMENTARY.red);
        newEvents.push({
          type: "card",
          playerId: event.playerId,
          minute: event.minute,
          quality: 1, // Cards are always negative quality
          attributesRevealed: ["composure"],
          description: template(name, event.minute, REASON_DESCRIPTIONS[reason]),
        });
      } else if (roll < redProb + yellowProb) {
        // Yellow card
        const reason = rng.pickWeighted(YELLOW_REASON_WEIGHTS);

        if (yellowCardedPlayers.has(event.playerId)) {
          // Second yellow = red card
          const card: CardEvent = {
            type: "red",
            playerId: event.playerId,
            fixtureId,
            minute: event.minute,
            reason,
          };
          cards.push(card);
          redCardedPlayers.add(event.playerId);

          const name = `${player.firstName} ${player.lastName}`;
          const template = rng.pick(CARD_COMMENTARY.red);
          newEvents.push({
            type: "card",
            playerId: event.playerId,
            minute: event.minute,
            quality: 1,
            attributesRevealed: ["composure"],
            description: `${event.minute}' — SECOND YELLOW! ${name} receives another caution for ${REASON_DESCRIPTIONS[reason]} and is sent off!`,
          });
        } else {
          // First yellow
          const card: CardEvent = {
            type: "yellow",
            playerId: event.playerId,
            fixtureId,
            minute: event.minute,
            reason,
          };
          cards.push(card);
          yellowCardedPlayers.add(event.playerId);

          const name = `${player.firstName} ${player.lastName}`;
          const template = rng.pick(CARD_COMMENTARY.yellow);
          newEvents.push({
            type: "card",
            playerId: event.playerId,
            minute: event.minute,
            quality: 3,
            attributesRevealed: ["composure"],
            description: template(name, event.minute, REASON_DESCRIPTIONS[reason]),
          });
        }
      }
    }

    updatedPhases.push({
      ...phase,
      events: newEvents,
    });
  }

  return { cards, updatedPhases };
}

// =============================================================================
// CARD ACCUMULATION & SUSPENSIONS
// =============================================================================

/**
 * Process card events from a match, updating disciplinary records and
 * triggering suspensions when thresholds are met.
 *
 * @returns Updated disciplinary records and any new suspension messages.
 */
export function processCardAccumulation(
  cards: CardEvent[],
  currentRecords: Record<string, DisciplinaryRecord>,
  season: number,
): {
  updatedRecords: Record<string, DisciplinaryRecord>;
  suspensions: Array<{ playerId: string; weeks: number; reason: string }>;
} {
  const updatedRecords = { ...currentRecords };
  const suspensions: Array<{ playerId: string; weeks: number; reason: string }> = [];

  for (const card of cards) {
    // Initialize record if needed
    if (!updatedRecords[card.playerId]) {
      updatedRecords[card.playerId] = {
        playerId: card.playerId,
        season,
        yellowCards: 0,
        redCards: 0,
        suspensionWeeksRemaining: 0,
        cardHistory: [],
      };
    }

    const record = { ...updatedRecords[card.playerId] };
    record.cardHistory = [...record.cardHistory, card];

    if (card.type === "yellow") {
      record.yellowCards += 1;

      // Check suspension thresholds
      if (record.yellowCards === 5) {
        record.suspensionWeeksRemaining += 1;
        suspensions.push({
          playerId: card.playerId,
          weeks: 1,
          reason: "5 yellow card accumulation",
        });
      } else if (record.yellowCards === 10) {
        record.suspensionWeeksRemaining += 2;
        suspensions.push({
          playerId: card.playerId,
          weeks: 2,
          reason: "10 yellow card accumulation",
        });
      }
    } else {
      // Red card
      record.redCards += 1;
      const suspensionLength = RED_CARD_SUSPENSION[card.reason] ?? 1;
      record.suspensionWeeksRemaining += suspensionLength;
      suspensions.push({
        playerId: card.playerId,
        weeks: suspensionLength,
        reason: `red card (${REASON_DESCRIPTIONS[card.reason]})`,
      });
    }

    updatedRecords[card.playerId] = record;
  }

  return { updatedRecords, suspensions };
}

// =============================================================================
// SUSPENSION DECREMENT
// =============================================================================

/**
 * Decrement suspension counters for all players at the start of each week.
 * Called during processWeeklyTick before fixture simulation.
 */
export function decrementSuspensions(
  records: Record<string, DisciplinaryRecord>,
): Record<string, DisciplinaryRecord> {
  const updated: Record<string, DisciplinaryRecord> = {};

  for (const [playerId, record] of Object.entries(records)) {
    if (record.suspensionWeeksRemaining > 0) {
      updated[playerId] = {
        ...record,
        suspensionWeeksRemaining: record.suspensionWeeksRemaining - 1,
      };
    } else {
      updated[playerId] = record;
    }
  }

  return updated;
}

// =============================================================================
// PLAYER AVAILABILITY
// =============================================================================

/**
 * Returns whether a player is available, suspended, or injured.
 */
export function getPlayerAvailability(
  player: Player,
  disciplinaryRecords: Record<string, DisciplinaryRecord>,
): "available" | "suspended" | "injured" {
  if (player.injured) return "injured";

  const record = disciplinaryRecords[player.id];
  if (record && record.suspensionWeeksRemaining > 0) return "suspended";

  return "available";
}

// =============================================================================
// SEASON-END RESET
// =============================================================================

/**
 * Clear all yellow card accumulations at the end of a season.
 * Red card suspensions carry over but yellow counts reset.
 */
export function clearSeasonCards(
  records: Record<string, DisciplinaryRecord>,
  newSeason: number,
): Record<string, DisciplinaryRecord> {
  const cleared: Record<string, DisciplinaryRecord> = {};

  for (const [playerId, record] of Object.entries(records)) {
    // Only keep records with active suspensions
    if (record.suspensionWeeksRemaining > 0) {
      cleared[playerId] = {
        ...record,
        season: newSeason,
        yellowCards: 0,
        redCards: 0,
        cardHistory: [], // Clear history, suspensions carry over
      };
    }
    // Records with no active suspension are dropped (fresh start)
  }

  return cleared;
}

// =============================================================================
// MATCH RATING INTEGRATION
// =============================================================================

/**
 * Apply card-based rating adjustments.
 *
 * - Yellow card: -0.3 penalty to match rating
 * - Red card: rating capped at 3.0
 *
 * @returns The adjusted rating value.
 */
export function applyCardRatingPenalty(
  baseRating: number,
  cards: CardEvent[],
  playerId: string,
): number {
  const playerCards = cards.filter((c) => c.playerId === playerId);
  if (playerCards.length === 0) return baseRating;

  let rating = baseRating;
  const hasRed = playerCards.some((c) => c.type === "red");
  const yellowCount = playerCards.filter((c) => c.type === "yellow").length;

  if (hasRed) {
    // Red card: cap rating at 3.0
    rating = Math.min(rating, 3.0);
  } else {
    // Yellow card: -0.3 per yellow
    rating -= yellowCount * 0.3;
  }

  return Math.max(1.0, Math.round(rating * 10) / 10);
}
