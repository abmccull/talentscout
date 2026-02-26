/**
 * Gossip system (F3) -- contact-driven intelligence with reliability and decay.
 *
 * Contacts generate gossip based on their type, trust level, and loyalty.
 * Gossip items have a limited lifespan (expiresWeek) and varying reliability.
 * The scout must evaluate gossip accuracy over time to build trust with
 * reliable contacts and identify unreliable ones.
 *
 * All functions are pure: no mutation, no side-effects, deterministic with RNG.
 */

import type {
  GameState,
  Contact,
  GossipItem,
  Player,
  Club,
  ContactInteraction,
  InboxMessage,
} from "@/engine/core/types";
import type { RNG } from "@/engine/rng";

// =============================================================================
// Constants
// =============================================================================

/** Number of weeks before gossip expires. */
const GOSSIP_LIFESPAN_WEEKS = 6;

/** Minimum trust level required for a contact to generate gossip. */
const MIN_TRUST_FOR_GOSSIP = 30;

/** Base probability of a contact generating gossip per week. */
const BASE_GOSSIP_CHANCE = 0.15;

/** Maximum gossip items a contact can have queued at once. */
const MAX_GOSSIP_QUEUE = 5;

// =============================================================================
// Gossip Content Templates
// =============================================================================

const TRANSFER_RUMOR_TEMPLATES = [
  "Word is that {player} is unhappy at {club} and looking for a move this window.",
  "I'm hearing that {club} are willing to listen to offers for {player}.",
  "There's talk of a bid coming in for {player} from a top-flight club.",
  "My sources say {player}'s agent has been shopping him around quietly.",
  "{club} are preparing to cash in on {player} before his value drops.",
];

const UNHAPPY_PLAYER_TEMPLATES = [
  "{player} has fallen out with the coaching staff at {club}. Training ground bust-up, apparently.",
  "I've heard {player} has submitted a transfer request behind closed doors.",
  "{player} has been left out of the squad for non-footballing reasons. Something's going on.",
  "There's unrest in the dressing room at {club} -- {player} is at the centre of it.",
];

const YOUTH_PROSPECT_TEMPLATES = [
  "Keep an eye on {player} at {club}. The academy coaches rate him very highly.",
  "There's a youngster at {club} called {player} who's been turning heads in training.",
  "{club}'s youth setup has produced a real talent in {player}. Worth watching.",
  "I've been told {player} is the best prospect at {club} in years. Still under the radar.",
];

const MANAGER_CHANGE_TEMPLATES = [
  "The board at {club} are losing patience. A change could be imminent.",
  "I'm hearing whispers that {club} have already approached a replacement manager.",
  "{club}'s results aren't good enough. The manager is on thin ice.",
  "Don't be surprised if {club} make a managerial change in the next few weeks.",
];

const INJURY_NEWS_TEMPLATES = [
  "{player} picked up a knock in training that {club} are trying to keep quiet.",
  "I've heard {player} is carrying a problem. He's been in and out of the physio room.",
  "{club} are worried about {player}'s fitness. More serious than they're letting on.",
  "Word from the treatment room is that {player}'s injury is worse than reported.",
];

type GossipType = GossipItem["type"];

const GOSSIP_TEMPLATES: Record<GossipType, string[]> = {
  transferRumor: TRANSFER_RUMOR_TEMPLATES,
  unhappyPlayer: UNHAPPY_PLAYER_TEMPLATES,
  youthProspect: YOUTH_PROSPECT_TEMPLATES,
  managerChange: MANAGER_CHANGE_TEMPLATES,
  injuryNews: INJURY_NEWS_TEMPLATES,
};

/**
 * Which gossip types each contact type tends to produce.
 */
const CONTACT_GOSSIP_POOLS: Record<string, GossipType[]> = {
  agent:                ["transferRumor", "unhappyPlayer"],
  scout:                ["youthProspect", "transferRumor", "injuryNews"],
  clubStaff:            ["injuryNews", "unhappyPlayer", "managerChange"],
  journalist:           ["transferRumor", "managerChange", "unhappyPlayer"],
  academyCoach:         ["youthProspect", "injuryNews"],
  sportingDirector:     ["transferRumor", "managerChange", "unhappyPlayer"],
  grassrootsOrganizer:  ["youthProspect"],
  schoolCoach:          ["youthProspect"],
  youthAgent:           ["youthProspect", "transferRumor"],
  academyDirector:      ["youthProspect", "injuryNews"],
  localScout:           ["youthProspect", "transferRumor"],
};

// =============================================================================
// Gossip ID generation
// =============================================================================

function generateGossipId(rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 10; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `gossip_${id}`;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a gossip item for a contact based on their type and trust level.
 *
 * Returns null if the contact doesn't generate gossip this week (RNG roll
 * failed, trust too low, or gossip queue is full).
 */
export function generateGossip(
  rng: RNG,
  contact: Contact,
  state: GameState,
): GossipItem | null {
  const trustLevel = contact.trustLevel ?? contact.relationship;
  if (trustLevel < MIN_TRUST_FOR_GOSSIP) return null;

  // Queue full check
  const currentQueue = contact.gossipQueue ?? [];
  if (currentQueue.length >= MAX_GOSSIP_QUEUE) return null;

  // Higher trust = higher chance of gossip
  const trustBonus = (trustLevel - MIN_TRUST_FOR_GOSSIP) / 200; // 0 to 0.35
  const loyaltyBonus = ((contact.loyalty ?? 50) - 50) / 400; // -0.125 to 0.125
  const gossipChance = BASE_GOSSIP_CHANCE + trustBonus + loyaltyBonus;

  if (!rng.chance(gossipChance)) return null;

  // Pick gossip type based on contact type
  const pool = CONTACT_GOSSIP_POOLS[contact.type] ?? ["transferRumor"];
  const gossipType = rng.pick(pool);

  // Pick a relevant player and club for the gossip content
  const { player, club } = pickGossipSubject(rng, gossipType, contact, state);

  // Build content string
  const templates = GOSSIP_TEMPLATES[gossipType];
  let content = rng.pick(templates);
  const playerName = player ? `${player.firstName} ${player.lastName}` : "a player";
  const clubName = club ? club.name : "a club";
  content = content.replace("{player}", playerName).replace("{club}", clubName);

  // Reliability depends on contact's own reliability + loyalty
  const baseReliability = contact.reliability / 100;
  const loyaltyFactor = (contact.loyalty ?? 50) / 100;
  const reliability = clamp(
    baseReliability * 0.6 + loyaltyFactor * 0.4 + rng.nextFloat(-0.1, 0.1),
    0.1,
    0.95,
  );

  return {
    id: generateGossipId(rng),
    type: gossipType,
    playerId: player?.id,
    clubId: club?.id,
    reliability,
    revealedWeek: state.currentWeek,
    expiresWeek: state.currentWeek + GOSSIP_LIFESPAN_WEEKS,
    content,
  };
}

/**
 * Remove expired gossip from all contacts and return the updated contacts map.
 * Also reduces trust slightly for contacts who haven't been interacted with.
 */
export function processGossipDecay(
  contacts: Record<string, Contact>,
  currentWeek: number,
): Record<string, Contact> {
  const result: Record<string, Contact> = {};
  for (const [id, contact] of Object.entries(contacts)) {
    const queue = contact.gossipQueue ?? [];
    const filteredQueue = queue.filter((g) => g.expiresWeek > currentWeek);
    result[id] = {
      ...contact,
      gossipQueue: filteredQueue,
    };
  }
  return result;
}

/**
 * Evaluate if a gossip item turned out to be accurate.
 *
 * For transfer rumors: check if the player actually moved clubs.
 * For injury news: check if the player is currently injured.
 * For unhappy player: check if the player's morale is low.
 *
 * Returns a trust delta: positive if gossip was accurate, negative if not.
 */
export function evaluateGossipAccuracy(
  gossipItem: GossipItem,
  state: GameState,
): number {
  if (!gossipItem.playerId) return 0;

  const player = state.players[gossipItem.playerId];
  if (!player) return 0;

  switch (gossipItem.type) {
    case "transferRumor": {
      // If the player's club changed since the gossip, it was accurate
      const club = gossipItem.clubId ? state.clubs[gossipItem.clubId] : null;
      if (club && player.clubId !== gossipItem.clubId) return 3; // confirmed transfer
      return -1; // didn't happen (yet)
    }
    case "injuryNews": {
      if (player.injured) return 3;
      return -1;
    }
    case "unhappyPlayer": {
      if (player.morale <= 4) return 3;
      return -1;
    }
    case "youthProspect": {
      // Youth prospect gossip is always considered neutral-positive
      return 1;
    }
    case "managerChange": {
      // Can't easily verify manager changes, treat as neutral
      return 0;
    }
    default:
      return 0;
  }
}

/**
 * Process weekly gossip generation for all contacts.
 * Returns updated contacts with new gossip items and inbox messages.
 */
export function processWeeklyGossip(
  state: GameState,
  rng: RNG,
): { updatedContacts: Record<string, Contact>; gossipMessages: InboxMessage[] } {
  const updatedContacts: Record<string, Contact> = {};
  const gossipMessages: InboxMessage[] = [];

  // First, decay expired gossip
  const decayed = processGossipDecay(state.contacts, state.currentWeek);

  for (const [id, contact] of Object.entries(decayed)) {
    const gossipItem = generateGossip(rng, contact, state);

    if (gossipItem) {
      const newQueue = [...(contact.gossipQueue ?? []), gossipItem];
      updatedContacts[id] = {
        ...contact,
        gossipQueue: newQueue,
      };

      // Create an inbox message for the gossip
      gossipMessages.push({
        id: generateGossipMessageId(rng),
        week: state.currentWeek,
        season: state.currentSeason,
        type: "news",
        title: `Gossip from ${contact.name}`,
        body: gossipItem.content,
        read: false,
        actionRequired: false,
        relatedId: gossipItem.playerId,
        relatedEntityType: gossipItem.playerId ? "player" : undefined,
      });
    } else {
      updatedContacts[id] = contact;
    }
  }

  return { updatedContacts, gossipMessages };
}

// =============================================================================
// Internal helpers
// =============================================================================

function pickGossipSubject(
  rng: RNG,
  gossipType: GossipType,
  contact: Contact,
  state: GameState,
): { player: Player | null; club: Club | null } {
  const players = Object.values(state.players);
  const clubs = Object.values(state.clubs);

  if (players.length === 0 || clubs.length === 0) {
    return { player: null, club: null };
  }

  // Prefer players the contact knows about
  const knownPlayers = contact.knownPlayerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => !!p);

  const candidatePlayers = knownPlayers.length > 0 ? knownPlayers : players;

  switch (gossipType) {
    case "transferRumor":
    case "unhappyPlayer": {
      const player = rng.pick(candidatePlayers);
      const club = state.clubs[player.clubId] ?? rng.pick(clubs);
      return { player, club };
    }
    case "youthProspect": {
      // Prefer younger players
      const youngPlayers = candidatePlayers.filter((p) => p.age <= 21);
      const pool = youngPlayers.length > 0 ? youngPlayers : candidatePlayers;
      const player = rng.pick(pool);
      const club = state.clubs[player.clubId] ?? rng.pick(clubs);
      return { player, club };
    }
    case "managerChange": {
      const club = rng.pick(clubs);
      return { player: null, club };
    }
    case "injuryNews": {
      const player = rng.pick(candidatePlayers);
      const club = state.clubs[player.clubId] ?? rng.pick(clubs);
      return { player, club };
    }
    default:
      return { player: rng.pick(players), club: rng.pick(clubs) };
  }
}

function generateGossipMessageId(rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `msg_gossip_${id}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
