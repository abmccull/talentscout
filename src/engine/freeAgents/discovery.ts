/**
 * Free Agent Discovery — specialization-specific mechanics for how scouts
 * find and access free agents in the global pool.
 *
 * Each specialization discovers free agents through different channels:
 *  - First-team: match commentary, agent/SD contacts, freeAgentOutreach
 *  - Regional: territory knowledge bonus, network contacts, territory scan
 *  - Data: database queries, market inefficiency scans, global radar
 *  - Youth: minimal interaction — only sees high-familiarity countries
 *
 * On top of these, the regional familiarity system gates visibility globally.
 *
 * Pure functions: no side effects, no mutation.
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  FreeAgent,
  FreeAgentPool,
  FreeAgentDiscoverySource,
  Contact,
  Specialization,
  InboxMessage,
} from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Familiarity thresholds for visibility levels. */
export const VISIBILITY_THRESHOLDS = {
  none: 0,
  rumor: 1,
  basic: 20,
  standard: 40,
  good: 60,
  expert: 80,
} as const;

/** Discovery chance per week per specialization (base rate). */
const DISCOVERY_CHANCE: Record<Specialization, number> = {
  firstTeam: 0.15,
  regional: 0.20,
  data: 0.25,
  youth: 0.05,
};

/** First-team bonus when attending a match in the free agent's home country. */
const MATCH_ATTENDANCE_DISCOVERY_BONUS = 0.10;

/** Regional territory bonus for assigned territories. */
const TERRITORY_DISCOVERY_BONUS = 0.20;

/** Data scout familiarity penalty reduction (sees stats with less penalty). */
const DATA_SCOUT_PENALTY_REDUCTION = 0.50;

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

/**
 * Get the visibility level for a given country familiarity score.
 */
export function getFamiliarityVisibility(
  familiarity: number,
): "none" | "rumor" | "basic" | "standard" | "good" | "expert" {
  if (familiarity >= VISIBILITY_THRESHOLDS.expert) return "expert";
  if (familiarity >= VISIBILITY_THRESHOLDS.good) return "good";
  if (familiarity >= VISIBILITY_THRESHOLDS.standard) return "standard";
  if (familiarity >= VISIBILITY_THRESHOLDS.basic) return "basic";
  if (familiarity >= VISIBILITY_THRESHOLDS.rumor) return "rumor";
  return "none";
}

/**
 * Get the observation accuracy penalty for a given familiarity level.
 * Lower familiarity = higher penalty (wider confidence intervals).
 */
export function getFamiliarityAccuracyPenalty(
  familiarity: number,
  specialization: Specialization,
): number {
  const baseLevel = getFamiliarityVisibility(familiarity);
  let penalty: number;

  switch (baseLevel) {
    case "expert": penalty = 0; break;
    case "good": penalty = 0.10; break;
    case "standard": penalty = 0.25; break;
    case "basic": penalty = 0.50; break;
    default: penalty = 1.0; break;
  }

  // Data scouts have reduced penalty
  if (specialization === "data") {
    penalty *= (1 - DATA_SCOUT_PENALTY_REDUCTION);
  }

  return penalty;
}

export interface DiscoveryResult {
  /** Updated pool with discovered agents marked. */
  updatedPool: FreeAgentPool;
  /** Inbox messages for newly discovered free agents. */
  messages: InboxMessage[];
  /** Count of newly discovered free agents this tick. */
  newDiscoveries: number;
}

/**
 * Process weekly free agent discovery for the scout.
 *
 * Iterates through undiscovered free agents in the pool and rolls for
 * discovery based on specialization, familiarity, and active contacts.
 */
export function discoverFreeAgents(
  state: GameState,
  rng: RNG,
): DiscoveryResult {
  const pool = state.freeAgentPool;
  const scout = state.scout;
  const spec = scout.primarySpecialization;
  const messages: InboxMessage[] = [];
  let newDiscoveries = 0;

  const updatedAgents = pool.agents.map((agent) => {
    // Skip already discovered, non-available, or already known
    if (agent.discoveredByScout) return agent;
    if (agent.status !== "available") return agent;

    const player = state.players[agent.playerId];
    if (!player) return agent;

    // Get familiarity with agent's country
    const countryRep = scout.countryReputations?.[agent.country];
    const familiarity = countryRep?.familiarity ?? 0;

    // Check contact-based discovery (bypasses familiarity)
    const contactDiscovery = checkContactDiscovery(
      agent,
      Object.values(state.contacts),
      rng,
    );

    if (contactDiscovery) {
      newDiscoveries++;
      messages.push(generateDiscoveryMessage(
        player, agent, "contactTip", state, rng,
      ));
      return {
        ...agent,
        discoveredByScout: true,
        discoverySource: "contactTip" as FreeAgentDiscoverySource,
      };
    }

    // Must have at least "basic" familiarity for non-contact discovery
    if (familiarity < VISIBILITY_THRESHOLDS.basic) return agent;

    // Roll for specialization-based discovery
    let discoveryChance = DISCOVERY_CHANCE[spec];

    // Familiarity bonus
    discoveryChance *= (0.5 + familiarity / 200); // [0.5x at 0, 1.0x at 100]

    // Specialization-specific bonuses
    let source: FreeAgentDiscoverySource = "familiarity";

    switch (spec) {
      case "firstTeam":
        // Agent/SD contacts boost
        if (hasContactType(Object.values(state.contacts), "agent", agent.country) ||
            hasContactType(Object.values(state.contacts), "sportingDirector", agent.country)) {
          discoveryChance += 0.08;
        }
        break;

      case "regional":
        // Territory bonus
        if (isInAssignedTerritory(agent.country, state)) {
          discoveryChance += TERRITORY_DISCOVERY_BONUS;
          source = "territoryScan";
        }
        break;

      case "data":
        // Data scouts have higher base chance and can use queries
        discoveryChance += 0.05;
        source = "dataQuery";
        break;

      case "youth":
        // Minimal — youth scouts focus on unsigned youth
        discoveryChance *= 0.5;
        break;
    }

    if (rng.chance(discoveryChance)) {
      newDiscoveries++;
      messages.push(generateDiscoveryMessage(
        player, agent, source, state, rng,
      ));
      return {
        ...agent,
        discoveredByScout: true,
        discoverySource: source,
      };
    }

    return agent;
  });

  return {
    updatedPool: { ...pool, agents: updatedAgents },
    messages,
    newDiscoveries,
  };
}

/**
 * Process contact tips about expiring contracts — converts "contractRunningDown"
 * tip type into actual free agent pool discovery.
 *
 * Called when processing contact meeting results.
 */
export function processContactFreeAgentTip(
  pool: FreeAgentPool,
  playerId: string,
): FreeAgentPool {
  const agentIndex = pool.agents.findIndex((a) => a.playerId === playerId);
  if (agentIndex === -1) return pool;

  const agent = pool.agents[agentIndex];
  if (agent.discoveredByScout) return pool;

  const updatedAgents = [...pool.agents];
  updatedAgents[agentIndex] = {
    ...agent,
    discoveredByScout: true,
    discoverySource: "contactTip",
  };

  return { ...pool, agents: updatedAgents };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if a contact can reveal a free agent regardless of familiarity.
 * Agents and journalists in the player's country can do this.
 */
function checkContactDiscovery(
  agent: FreeAgent,
  contacts: Contact[],
  rng: RNG,
): boolean {
  const relevantContacts = contacts.filter((c) => {
    // Contact must be in the same country as the free agent
    if (c.country !== agent.country) return false;
    // Only agent and journalist contacts can reveal free agents
    if (c.type !== "agent" && c.type !== "journalist" && c.type !== "scout") return false;
    // Must have decent relationship
    if (c.relationship < 30) return false;
    return true;
  });

  if (relevantContacts.length === 0) return false;

  // Higher relationship = higher chance
  const bestRelationship = Math.max(...relevantContacts.map((c) => c.relationship));
  const chance = 0.02 + (bestRelationship / 100) * 0.08; // 2-10% per week
  return rng.chance(chance);
}

function hasContactType(
  contacts: Contact[],
  type: string,
  country: string,
): boolean {
  return contacts.some(
    (c) => c.type === type && c.country === country && c.relationship >= 20,
  );
}

function isInAssignedTerritory(
  country: string,
  state: GameState,
): boolean {
  // Check if any territory covers this country
  return Object.values(state.territories).some(
    (t) => t.country === country,
  );
}

function generateDiscoveryMessage(
  player: { firstName: string; lastName: string; age: number; position: string; currentAbility: number },
  agent: FreeAgent,
  source: FreeAgentDiscoverySource,
  state: GameState,
  rng: RNG,
): InboxMessage {
  const formerClub = state.clubs[agent.releasedFrom];
  const clubName = formerClub?.name ?? "an unknown club";

  const sourceDescriptions: Record<FreeAgentDiscoverySource, string> = {
    familiarity: `Your knowledge of football in ${agent.country} has brought ${player.firstName} ${player.lastName} to your attention.`,
    contactTip: `A contact has informed you that ${player.firstName} ${player.lastName} is available as a free agent.`,
    dataQuery: `Your database analysis has flagged ${player.firstName} ${player.lastName} as an available free agent.`,
    territoryScan: `Your territory network has identified ${player.firstName} ${player.lastName} as available.`,
  };

  return {
    id: makeMessageId("fa_discover", rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: "news",
    title: `Free Agent: ${player.firstName} ${player.lastName}`,
    body: `${sourceDescriptions[source]} The ${player.age}-year-old ${player.position} was released by ${clubName} and is looking for a new club.`,
    read: false,
    actionRequired: false,
    relatedId: agent.playerId,
    relatedEntityType: "player",
  };
}
