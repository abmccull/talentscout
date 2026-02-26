/**
 * Contract Expiry Processing — season-end engine that decides which players
 * are renewed, released (→ free agent pool), or retired.
 *
 * Pure function: no side effects, no mutation.
 * All randomness flows through the RNG instance.
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  Player,
  Club,
  FreeAgent,
  InboxMessage,
} from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Base renewal probabilities by CA tier. */
const RENEWAL_CHANCE_HIGH = 0.70;    // CA > 70
const RENEWAL_CHANCE_MID = 0.50;     // CA 50-70
const RENEWAL_CHANCE_LOW = 0.30;     // CA < 50

/** If age > this AND CA < 50, player may retire instead of entering pool. */
const RETIREMENT_AGE_THRESHOLD = 34;
const RETIREMENT_CA_THRESHOLD = 50;
const RETIREMENT_CHANCE = 0.60;

/** Club reputation tiers — top clubs renew more aggressively. */
const HIGH_REP_RENEWAL_BOOST = 0.15;   // rep > 75
const LOW_REP_RENEWAL_PENALTY = -0.10; // rep < 30

/** Pool duration tiers by CA (max weeks before dropout). */
const POOL_DURATION_ELITE = 4;      // CA 75+
const POOL_DURATION_QUALITY = 8;    // CA 60-74
const POOL_DURATION_DEPTH = 16;     // CA 45-59
const POOL_DURATION_JOURNEYMAN = 20; // CA < 45

// =============================================================================
// ID GENERATION
// =============================================================================

function makeMessageId(prefix: string, rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `${prefix}_${id}`;
}

// =============================================================================
// PUBLIC API
// =============================================================================

export interface ContractExpiryResult {
  /** Players who were released and should be added to the free agent pool. */
  releasedPlayers: FreeAgent[];
  /** Player IDs whose contracts were renewed (club extended them). */
  renewedPlayerIds: string[];
  /** Player IDs who retired from the game. */
  retiredPlayerIds: string[];
  /** Updated players map with renewed contract expiry dates. */
  updatedPlayers: Record<string, Player>;
  /** Inbox messages about notable releases/retirements. */
  messages: InboxMessage[];
}

/**
 * Process all expiring contracts at the end of a season.
 *
 * For each player whose contractExpiry <= currentSeason:
 *   1. Roll for renewal (based on CA, club rep, form)
 *   2. If not renewed and old + low CA: roll for retirement
 *   3. Otherwise: release to free agent pool
 */
export function processContractExpiries(
  state: GameState,
  rng: RNG,
): ContractExpiryResult {
  const releasedPlayers: FreeAgent[] = [];
  const renewedPlayerIds: string[] = [];
  const retiredPlayerIds: string[] = [];
  const updatedPlayers: Record<string, Player> = {};
  const messages: InboxMessage[] = [];

  for (const [playerId, player] of Object.entries(state.players)) {
    // Skip players without a club (already unsigned/youth)
    if (!player.clubId) continue;
    // Skip players whose contract hasn't expired
    if (player.contractExpiry > state.currentSeason) continue;

    const club = state.clubs[player.clubId];
    if (!club) continue;

    // Determine renewal probability
    let renewalChance = getRenewalChance(player.currentAbility);
    renewalChance += getClubReputationModifier(club.reputation);

    // Form bonus: good form increases renewal chance
    if (player.form > 0) renewalChance += 0.05 * player.form;

    // Clamp to [0.05, 0.95]
    renewalChance = Math.min(0.95, Math.max(0.05, renewalChance));

    if (rng.chance(renewalChance)) {
      // Club renews: extend contract by 1-3 seasons
      const extension = rng.nextInt(1, 3);
      updatedPlayers[playerId] = {
        ...player,
        contractExpiry: state.currentSeason + extension,
      };
      renewedPlayerIds.push(playerId);
      continue;
    }

    // Not renewed — check for retirement
    if (
      player.age > RETIREMENT_AGE_THRESHOLD &&
      player.currentAbility < RETIREMENT_CA_THRESHOLD &&
      rng.chance(RETIREMENT_CHANCE)
    ) {
      retiredPlayerIds.push(playerId);

      // Notable retirement message (CA > 60 or high-rep club)
      if (player.currentAbility > 60 || club.reputation > 60) {
        messages.push({
          id: makeMessageId("fa_retire", rng),
          week: state.currentWeek,
          season: state.currentSeason,
          type: "event",
          title: `${player.firstName} ${player.lastName} Retires`,
          body: `${player.firstName} ${player.lastName} (${player.age}) has retired from professional football after leaving ${club.name}.`,
          read: false,
          actionRequired: false,
        });
      }
      continue;
    }

    // Release to free agent pool
    const freeAgent = createFreeAgentFromPlayer(player, club, state.currentSeason);
    releasedPlayers.push(freeAgent);

    // Remove club association
    updatedPlayers[playerId] = {
      ...player,
      clubId: "",
      contractExpiry: 0,
    };

    // Notable release message (CA > 65)
    if (player.currentAbility > 65) {
      messages.push({
        id: makeMessageId("fa_release", rng),
        week: state.currentWeek,
        season: state.currentSeason,
        type: "event",
        title: `${player.firstName} ${player.lastName} Released`,
        body: `${player.firstName} ${player.lastName} (${player.age}, ${player.position}) has been released by ${club.name} and is available as a free agent.`,
        read: false,
        actionRequired: false,
      });
    }
  }

  return {
    releasedPlayers,
    renewedPlayerIds,
    retiredPlayerIds,
    updatedPlayers,
    messages,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getRenewalChance(ca: number): number {
  if (ca > 70) return RENEWAL_CHANCE_HIGH;
  if (ca >= 50) return RENEWAL_CHANCE_MID;
  return RENEWAL_CHANCE_LOW;
}

function getClubReputationModifier(reputation: number): number {
  if (reputation > 75) return HIGH_REP_RENEWAL_BOOST;
  if (reputation < 30) return LOW_REP_RENEWAL_PENALTY;
  return 0;
}

function getMaxWeeksInPool(ca: number): number {
  if (ca >= 75) return POOL_DURATION_ELITE;
  if (ca >= 60) return POOL_DURATION_QUALITY;
  if (ca >= 45) return POOL_DURATION_DEPTH;
  return POOL_DURATION_JOURNEYMAN;
}

function createFreeAgentFromPlayer(
  player: Player,
  club: Club,
  currentSeason: number,
): FreeAgent {
  // Wage expectation based on CA and age
  const baseWage = Math.round(player.currentAbility * 80);
  // Older players accept lower wages
  const ageFactor = player.age > 30 ? 0.8 : player.age > 28 ? 0.9 : 1.0;
  const wageExpectation = Math.round(baseWage * ageFactor);

  // Signing bonus: 2-4 weeks wages
  const signingBonusExpectation = Math.round(wageExpectation * 3);

  return {
    playerId: player.id,
    country: player.nationality,
    releasedFrom: club.id,
    releasedSeason: currentSeason,
    weeksInPool: 0,
    maxWeeksInPool: getMaxWeeksInPool(player.currentAbility),
    wageExpectation,
    signingBonusExpectation,
    discoverySource: null,
    discoveredByScout: false,
    npcInterest: [],
    status: "available",
  };
}
