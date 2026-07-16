/**
 * Gossip system (F3) -- contact-driven intelligence with reliability and decay.
 *
 * Contacts generate gossip based on their type, trust level, and loyalty.
 * Gossip items have a canonical reveal/expiry date and varying reliability.
 * The scout must evaluate gossip accuracy over time to build trust with
 * reliable contacts and identify unreliable ones.
 *
 * All functions are pure: no mutation, no side-effects, deterministic with RNG.
 */

import type {
  ActionableGossipItem,
  GameState,
  Contact,
  GameDate,
  GossipAction,
  GossipClaimStatus,
  GossipItem,
  Player,
  Club,
  InboxMessage,
} from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import { addGameWeeks, isGameDateAtOrAfter } from "@/engine/core/gameDate";
import { isContactAccessSuspended } from "./contacts";

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
  clubStaff:            ["injuryNews", "unhappyPlayer", "transferRumor"],
  journalist:           ["transferRumor", "unhappyPlayer"],
  academyCoach:         ["youthProspect", "injuryNews"],
  sportingDirector:     ["transferRumor", "unhappyPlayer"],
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
  const now = currentGameDate(state);
  const trustLevel = contact.trustLevel ?? contact.relationship;
  if (trustLevel < MIN_TRUST_FOR_GOSSIP) return null;
  if (contact.dormant || isContactAccessSuspended(contact, now)) return null;

  // Queue full check
  const currentQueue = contact.gossipQueue ?? [];
  if (currentQueue.length >= MAX_GOSSIP_QUEUE) return null;

  // Higher trust = higher chance of gossip
  const trustBonus = (trustLevel - MIN_TRUST_FOR_GOSSIP) / 200; // 0 to 0.35
  const loyaltyBonus = ((contact.loyalty ?? 50) - 50) / 400; // -0.125 to 0.125
  const gossipChance = BASE_GOSSIP_CHANCE + trustBonus + loyaltyBonus;

  if (!rng.chance(gossipChance)) return null;

  // Reliability depends on contact's own reliability + loyalty
  const baseReliability = contact.reliability / 100;
  const loyaltyFactor = (contact.loyalty ?? 50) / 100;
  const reliability = clamp(
    baseReliability * 0.6 + loyaltyFactor * 0.4 + rng.nextFloat(-0.1, 0.1),
    0.1,
    0.95,
  );

  // Reliability now determines whether the source supplies a supported,
  // unsupported, or genuinely ambiguous claim before a subject is selected.
  const intendedStatus = rollGossipClaimStatus(rng, reliability);
  const pool = CONTACT_GOSSIP_POOLS[contact.type] ?? ["transferRumor"];
  const gossipType = rng.pick(pool);
  const { player, club, claimStatus } = pickGossipSubject(
    rng,
    gossipType,
    intendedStatus,
    contact,
    state,
  );
  if (gossipType !== "managerChange" && !player) return null;

  const templates = GOSSIP_TEMPLATES[gossipType];
  let content = rng.pick(templates);
  const playerName = player ? `${player.firstName} ${player.lastName}` : "a player";
  const clubName = club ? club.name : "a club";
  content = content.replace("{player}", playerName).replace("{club}", clubName);

  return {
    id: generateGossipId(rng),
    type: gossipType,
    playerId: player?.id,
    clubId: club?.id,
    reliability,
    claimStatus,
    revealedAt: now,
    expiresAt: addGameWeeks(state.fixtures, now, GOSSIP_LIFESPAN_WEEKS),
    content,
    dismissed: false,
  };
}

/**
 * Remove expired gossip from all contacts and return the updated contacts map.
 * Also reduces trust slightly for contacts who haven't been interacted with.
 */
export function processGossipDecay(
  contacts: Record<string, Contact>,
  currentDate: GameDate,
): Record<string, Contact> {
  const result: Record<string, Contact> = {};
  for (const [id, contact] of Object.entries(contacts)) {
    const queue = contact.gossipQueue ?? [];
    const filteredQueue = queue.filter(
      (g) => !isGameDateAtOrAfter(currentDate, g.expiresAt),
    );
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
): number {
  if (gossipItem.claimStatus === "accurate") return 3;
  if (gossipItem.claimStatus === "inaccurate") return -2;
  return 0;
}

/**
 * Process weekly gossip generation for all contacts.
 * Returns updated contacts with new gossip items and inbox messages.
 *
 * Before removing expired gossip, evaluates accuracy of each expiring item
 * and applies trust deltas to the source contact. This rewards contacts who
 * provided accurate gossip and penalises unreliable sources.
 */
export function processWeeklyGossip(
  state: GameState,
  rng: RNG,
): { updatedContacts: Record<string, Contact>; gossipMessages: InboxMessage[] } {
  const updatedContacts: Record<string, Contact> = {};
  const gossipMessages: InboxMessage[] = [];
  const currentDate = currentGameDate(state);

  // Phase 1: Evaluate accuracy of expiring gossip items and accumulate trust deltas.
  // A gossip item expires when the current canonical date reaches expiresAt.
  const trustDeltaByContact: Record<string, number> = {};
  for (const [id, contact] of Object.entries(state.contacts)) {
    const queue = contact.gossipQueue ?? [];
    for (const item of queue) {
      if (isGameDateAtOrAfter(currentDate, item.expiresAt)) {
        const delta = evaluateGossipAccuracy(item);
        trustDeltaByContact[id] = (trustDeltaByContact[id] ?? 0) + delta;
      }
    }
  }

  // Phase 2: Apply trust deltas from accuracy evaluation, then decay expired gossip.
  const contactsWithTrust: Record<string, Contact> = {};
  for (const [id, contact] of Object.entries(state.contacts)) {
    const delta = trustDeltaByContact[id] ?? 0;
    if (delta !== 0) {
      const currentTrust = contact.trustLevel ?? contact.relationship;
      contactsWithTrust[id] = {
        ...contact,
        trustLevel: clamp(currentTrust + delta, 0, 100),
      };
    } else {
      contactsWithTrust[id] = contact;
    }
  }
  const decayed = processGossipDecay(contactsWithTrust, currentDate);

  // Phase 3: Generate new gossip for each contact.
  for (const [id, contact] of Object.entries(decayed)) {
    const gossipItem = generateGossip(rng, contact, state);

    if (gossipItem) {
      const newQueue = [...(contact.gossipQueue ?? []), gossipItem];
      updatedContacts[id] = {
        ...contact,
        gossipQueue: newQueue,
      };

      // The contact queue is canonical; the inbox links to that exact item.
      gossipMessages.push({
        id: generateGossipMessageId(rng),
        week: state.currentWeek,
        season: state.currentSeason,
        type: "gossip",
        title: `Gossip from ${contact.name}`,
        body: gossipItem.content,
        read: false,
        actionRequired: false,
        relatedId: gossipItem.id,
        relatedEntityType: "gossip",
      });
    } else {
      updatedContacts[id] = contact;
    }
  }

  return { updatedContacts, gossipMessages };
}

/** Derive inbox/store action views without creating a second persisted ledger. */
export function getActionableGossipItems(
  contacts: Record<string, Contact>,
): ActionableGossipItem[] {
  return Object.entries(contacts).flatMap(([contactId, contact]) =>
    (contact.gossipQueue ?? []).map((item) => ({ ...item, contactId })),
  );
}

export interface ApplyGossipActionResult {
  updatedContacts: Record<string, Contact>;
  item: ActionableGossipItem;
}

/** Apply a player choice to the canonical item in its source contact queue. */
export function applyGossipAction(
  contacts: Record<string, Contact>,
  gossipId: string,
  action: GossipAction,
): ApplyGossipActionResult | null {
  for (const [contactId, contact] of Object.entries(contacts)) {
    const itemIndex = (contact.gossipQueue ?? []).findIndex((item) => item.id === gossipId);
    if (itemIndex < 0) continue;

    const gossipQueue = [...(contact.gossipQueue ?? [])];
    const item: GossipItem = {
      ...gossipQueue[itemIndex],
      actionTaken: action,
      dismissed: action === "dismiss",
    };
    gossipQueue[itemIndex] = item;
    return {
      updatedContacts: {
        ...contacts,
        [contactId]: { ...contact, gossipQueue },
      },
      item: { ...item, contactId },
    };
  }
  return null;
}

// =============================================================================
// Internal helpers
// =============================================================================

function pickGossipSubject(
  rng: RNG,
  gossipType: GossipType,
  intendedStatus: GossipClaimStatus,
  contact: Contact,
  state: GameState,
): { player: Player | null; club: Club | null; claimStatus: GossipClaimStatus } {
  const players = Object.values(state.players);
  const clubs = Object.values(state.clubs);

  if (players.length === 0 || clubs.length === 0) {
    return { player: null, club: null, claimStatus: "ambiguous" };
  }

  // Prefer players the contact knows about
  const knownPlayers = contact.knownPlayerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => !!p);

  const knownContractedPlayers = knownPlayers.filter((player) => !!state.clubs[player.clubId]);
  const contractedPlayers = players.filter((player) => !!state.clubs[player.clubId]);
  const candidatePlayers = knownContractedPlayers.length > 0
    ? knownContractedPlayers
    : contractedPlayers;
  if (candidatePlayers.length === 0) {
    return { player: null, club: null, claimStatus: "ambiguous" };
  }

  switch (gossipType) {
    case "transferRumor": {
      const selection = pickPlayerForClaim(
        rng,
        candidatePlayers,
        (player) => player.morale <= 4
          || (player.contractExpiry > 0 && player.contractExpiry <= state.currentSeason + 1),
        intendedStatus,
      );
      const player = selection.player;
      const club = state.clubs[player.clubId] ?? rng.pick(clubs);
      return { player, club, claimStatus: selection.claimStatus };
    }
    case "unhappyPlayer": {
      const selection = pickPlayerForClaim(
        rng,
        candidatePlayers,
        (player) => player.morale <= 4,
        intendedStatus,
      );
      const player = selection.player;
      const club = state.clubs[player.clubId] ?? rng.pick(clubs);
      return { player, club, claimStatus: selection.claimStatus };
    }
    case "youthProspect": {
      const youngPlayers = candidatePlayers.filter((p) => p.age <= 21);
      const pool = youngPlayers.length > 0 ? youngPlayers : candidatePlayers;
      const selection = pickPlayerForClaim(
        rng,
        pool,
        (player) => player.age <= 21
          && (player.potentialAbility >= 120
            || player.potentialAbility - player.currentAbility >= 25),
        intendedStatus,
      );
      const player = selection.player;
      const club = state.clubs[player.clubId] ?? rng.pick(clubs);
      return { player, club, claimStatus: selection.claimStatus };
    }
    case "managerChange": {
      const club = rng.pick(clubs);
      return { player: null, club, claimStatus: "ambiguous" };
    }
    case "injuryNews": {
      const selection = pickPlayerForClaim(
        rng,
        candidatePlayers,
        (player) => player.injured === true,
        intendedStatus,
      );
      const player = selection.player;
      const club = state.clubs[player.clubId] ?? rng.pick(clubs);
      return { player, club, claimStatus: selection.claimStatus };
    }
    default:
      return { player: rng.pick(candidatePlayers), club: rng.pick(clubs), claimStatus: "ambiguous" };
  }
}

function rollGossipClaimStatus(
  rng: RNG,
  reliability: number,
): GossipClaimStatus {
  const boundedReliability = clamp(reliability, 0, 1);
  const roll = rng.next();
  if (roll < boundedReliability) return "accurate";
  const ambiguityCeiling = boundedReliability + (1 - boundedReliability) * 0.35;
  return roll < ambiguityCeiling ? "ambiguous" : "inaccurate";
}

function pickPlayerForClaim(
  rng: RNG,
  candidates: Player[],
  supportsClaim: (player: Player) => boolean,
  intendedStatus: GossipClaimStatus,
): { player: Player; claimStatus: GossipClaimStatus } {
  if (intendedStatus === "ambiguous") {
    return { player: rng.pick(candidates), claimStatus: "ambiguous" };
  }

  const eligible = candidates.filter((player) =>
    intendedStatus === "accurate" ? supportsClaim(player) : !supportsClaim(player),
  );
  if (eligible.length === 0) {
    return { player: rng.pick(candidates), claimStatus: "ambiguous" };
  }
  return { player: rng.pick(eligible), claimStatus: intendedStatus };
}

function currentGameDate(state: Pick<GameState, "currentSeason" | "currentWeek">): GameDate {
  return { season: state.currentSeason, week: state.currentWeek };
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
