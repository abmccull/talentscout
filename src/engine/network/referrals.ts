/**
 * Referral system (F3) -- high-trust contacts introduce new contacts.
 *
 * When a contact has high trust and loyalty, they may offer to introduce
 * the scout to someone in their professional network. Referred contacts
 * start with higher base trust since they come with a personal vouching.
 *
 * All functions are pure: no mutation, no side-effects, deterministic with RNG.
 */

import type {
  GameState,
  Contact,
  ContactType,
  ContactInteraction,
  InboxMessage,
} from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import { generateContactForType } from "./contacts";

// =============================================================================
// Constants
// =============================================================================

/** Minimum trust level required for a contact to offer referrals. */
const MIN_TRUST_FOR_REFERRAL = 60;

/** Base probability of a referral opportunity per week. */
const BASE_REFERRAL_CHANCE = 0.08;

/** Trust bonus for referred contacts (they come vouched-for). */
const REFERRAL_TRUST_BONUS = 20;

/** Relationship starting value for referred contacts. */
const REFERRAL_BASE_RELATIONSHIP = 35;

/** Maximum number of contacts in a referral network. */
const MAX_REFERRAL_NETWORK = 4;

// =============================================================================
// Referral network types and mappings
// =============================================================================

/**
 * Which contact types can a given contact type introduce?
 */
const REFERRAL_TYPE_MAP: Record<string, ContactType[]> = {
  agent:                ["scout", "journalist", "sportingDirector", "youthAgent"],
  scout:                ["agent", "clubStaff", "localScout", "academyCoach"],
  clubStaff:            ["academyCoach", "sportingDirector", "scout"],
  journalist:           ["agent", "journalist", "clubStaff"],
  academyCoach:         ["schoolCoach", "grassrootsOrganizer", "academyDirector"],
  sportingDirector:     ["agent", "clubStaff", "scout"],
  grassrootsOrganizer:  ["schoolCoach", "localScout", "academyCoach"],
  schoolCoach:          ["grassrootsOrganizer", "academyCoach", "localScout"],
  youthAgent:           ["agent", "academyCoach", "schoolCoach"],
  academyDirector:      ["academyCoach", "sportingDirector", "scout"],
  localScout:           ["scout", "grassrootsOrganizer", "schoolCoach"],
};

// =============================================================================
// Referral opportunity descriptions
// =============================================================================

const REFERRAL_DESCRIPTIONS: Record<string, string[]> = {
  agent: [
    "I know a good agent who could help you get inside info on transfer targets.",
    "There's a respected agent in my network. Want me to put you in touch?",
  ],
  scout: [
    "I work with a scout who covers a different region. Could be useful for you.",
    "There's a fellow scout who has excellent contacts. I can introduce you.",
  ],
  clubStaff: [
    "I know someone on the inside at a club. They might share some useful intel.",
    "A friend of mine works in a club's football department. Interested?",
  ],
  journalist: [
    "I know a journalist who always has the inside track on transfers.",
    "There's a reporter I trust who hears things before they go public.",
  ],
  academyCoach: [
    "I can put you in touch with an academy coach who spots talent early.",
    "There's a youth coach I know who is always finding diamonds in the rough.",
  ],
  sportingDirector: [
    "I'm friendly with a sporting director. They could share what players they're looking at.",
    "A sporting director in my network might be willing to talk to you.",
  ],
  grassrootsOrganizer: [
    "I know someone deep in grassroots football. Real talent spotter.",
    "There's a grassroots organizer who runs tournaments where you'll find hidden talent.",
  ],
  schoolCoach: [
    "I know a school coach who regularly produces talented players.",
    "There's a teacher who doubles as a football coach -- always worth knowing.",
  ],
  youthAgent: [
    "I know a youth agent who represents some of the best prospects in the region.",
    "There's an agent specializing in young players. Could be a useful contact.",
  ],
  academyDirector: [
    "I can introduce you to an academy director. They control the pipeline.",
    "There's an academy director who might share insights on their prospects.",
  ],
  localScout: [
    "I know a local scout who covers an area nobody else watches.",
    "There's a part-time scout in my network with an incredible eye for talent.",
  ],
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if a contact has a referral opportunity to offer.
 *
 * Returns a referral description and the type of contact they'd introduce,
 * or null if no referral is available.
 */
export function generateReferralOpportunity(
  rng: RNG,
  contact: Contact,
  state: GameState,
): { referredType: ContactType; description: string } | null {
  const trustLevel = contact.trustLevel ?? contact.relationship;
  if (trustLevel < MIN_TRUST_FOR_REFERRAL) return null;

  // Check if the contact's referral network is full
  const referralNetwork = contact.referralNetwork ?? [];
  if (referralNetwork.length >= MAX_REFERRAL_NETWORK) return null;

  // Higher trust and loyalty increase referral chance
  const trustBonus = (trustLevel - MIN_TRUST_FOR_REFERRAL) / 300; // 0 to ~0.13
  const loyaltyBonus = ((contact.loyalty ?? 50) - 50) / 500; // -0.1 to 0.1
  const referralChance = BASE_REFERRAL_CHANCE + trustBonus + loyaltyBonus;

  if (!rng.chance(referralChance)) return null;

  // Don't create too many contacts total
  const totalContacts = Object.keys(state.contacts).length;
  if (totalContacts >= 20) return null;

  // Pick the type of contact to introduce
  const possibleTypes = REFERRAL_TYPE_MAP[contact.type] ?? ["scout"];
  const referredType = rng.pick(possibleTypes);

  // Pick description
  const descriptions = REFERRAL_DESCRIPTIONS[referredType] ?? [
    "I know someone who might be useful to you. Want me to introduce you?",
  ];
  const description = rng.pick(descriptions);

  return { referredType, description };
}

/**
 * Process a referral: create a new contact from a referral and update
 * the referring contact's referral network.
 *
 * The new contact starts with elevated trust and relationship (vouched for).
 * The referring contact gets a small trust boost for the successful introduction.
 */
export function processReferral(
  rng: RNG,
  state: GameState,
  referringContactId: string,
  referredType: ContactType,
): {
  newContact: Contact;
  updatedReferringContact: Contact;
  interaction: ContactInteraction;
} | null {
  const referringContact = state.contacts[referringContactId];
  if (!referringContact) return null;

  // Determine organization and region from referral context
  const organization = pickReferralOrganization(referredType, rng);
  const region = referringContact.country ?? referringContact.region;

  // Create the new contact with elevated base stats
  const newContact = generateContactForType(rng, referredType, organization, region);
  const enhancedContact: Contact = {
    ...newContact,
    relationship: REFERRAL_BASE_RELATIONSHIP,
    trustLevel: REFERRAL_TRUST_BONUS,
    loyalty: 40 + rng.nextInt(0, 30), // 40-70 starting loyalty
    lastInteractionWeek: state.currentWeek,
    interactionHistory: [],
    gossipQueue: [],
    referralNetwork: [],
    betrayalRisk: 0,
  };

  // Update referring contact's referral network
  const interaction: ContactInteraction = {
    week: state.currentWeek,
    type: "referral",
    trustDelta: 3,
  };

  const updatedReferringContact: Contact = {
    ...referringContact,
    referralNetwork: [...(referringContact.referralNetwork ?? []), enhancedContact.id],
    trustLevel: clamp((referringContact.trustLevel ?? referringContact.relationship) + 3, 0, 100),
    interactionHistory: [...(referringContact.interactionHistory ?? []), interaction],
    lastInteractionWeek: state.currentWeek,
  };

  return { newContact: enhancedContact, updatedReferringContact, interaction };
}

/**
 * Process weekly referral opportunities for all eligible contacts.
 * Returns updated contacts and any new referral messages.
 */
export function processWeeklyReferrals(
  state: GameState,
  rng: RNG,
): { updatedContacts: Record<string, Contact>; newContacts: Contact[]; referralMessages: InboxMessage[] } {
  const updatedContacts: Record<string, Contact> = { ...state.contacts };
  const newContacts: Contact[] = [];
  const referralMessages: InboxMessage[] = [];

  for (const [id, contact] of Object.entries(state.contacts)) {
    const opportunity = generateReferralOpportunity(rng, contact, state);
    if (!opportunity) continue;

    const result = processReferral(rng, state, id, opportunity.referredType);
    if (!result) continue;

    updatedContacts[id] = result.updatedReferringContact;
    updatedContacts[result.newContact.id] = result.newContact;
    newContacts.push(result.newContact);

    referralMessages.push({
      id: generateReferralMessageId(rng),
      week: state.currentWeek,
      season: state.currentSeason,
      type: "news",
      title: `Referral from ${contact.name}`,
      body: `${opportunity.description} ${result.newContact.name} has been added to your network.`,
      read: false,
      actionRequired: false,
      relatedId: result.newContact.id,
      relatedEntityType: "contact",
    });

    // Only process one referral per week to avoid flooding
    break;
  }

  return { updatedContacts, newContacts, referralMessages };
}

// =============================================================================
// Internal helpers
// =============================================================================

const REFERRAL_ORGANIZATIONS: Record<string, string[]> = {
  agent:                ["Independent", "Sport Management Group", "Elite Athletes"],
  scout:                ["Independent network", "Former professional", "Scout consortium"],
  clubStaff:            ["Club technical staff", "Football operations dept", "Academy support"],
  journalist:           ["Sports Press International", "Football Weekly", "Regional Times"],
  academyCoach:         ["Club academy", "Development centre", "Youth programme"],
  sportingDirector:     ["Club operations", "Transfer committee", "Football board"],
  grassrootsOrganizer:  ["Local FA", "Community trust", "Regional football association"],
  schoolCoach:          ["Secondary school", "Sports college", "Football academy prep"],
  youthAgent:           ["Youth Sports Management", "Junior Talent Group", "Next Gen Agency"],
  academyDirector:      ["Academy leadership", "Youth development HQ", "Foundation programme"],
  localScout:           ["Volunteer network", "Regional talent ID", "Community scouting"],
};

function pickReferralOrganization(type: ContactType, rng: RNG): string {
  const orgs = REFERRAL_ORGANIZATIONS[type] ?? ["Independent"];
  return rng.pick(orgs);
}

function generateReferralMessageId(rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `msg_referral_${id}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
