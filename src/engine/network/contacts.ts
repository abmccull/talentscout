/**
 * Network system — contact generation, meetings, and hidden attribute intel.
 *
 * Contacts are the scout's primary source of information that cannot be
 * obtained through match observation alone (hidden attributes, contract status,
 * transfer availability, dressing-room chemistry).
 *
 * All functions are pure: given the same seed + state, outputs are identical.
 */

import type {
  Scout,
  Contact,
  ContactType,
  Player,
  HiddenAttribute,
  HiddenIntel,
  Specialization,
  YouthVenueType,
  UnsignedYouth,
} from "@/engine/core/types";
import { RNG } from "@/engine/rng";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface NegotiationResult {
  /** Whether the negotiation reached a satisfactory outcome. */
  success: boolean;
  /** Player value after negotiation adjustments (may be lower than playerValue on success). */
  adjustedValue: number;
  /** Change to contact.relationship resulting from this negotiation. */
  relationshipChange: number;
}

export interface ContactMeetingResult {
  /** Change to contact.relationship (positive or negative) */
  relationshipChange: number;
  /** Hidden attribute hints provided during the meeting */
  intel: HiddenIntel[];
  /** Player tips passed along by the contact */
  tips: PlayerTip[];
}

export type { HiddenIntel } from "@/engine/core/types";

export interface PlayerTip {
  playerId: string;
  tipType:
    | "unsettled"
    | "availableForLoan"
    | "contractRunningDown"
    | "hiddenGem"
    | "injuryProne";
  description: string;
}

// ---------------------------------------------------------------------------
// Name pools (realistic football-world names for contact generation)
// ---------------------------------------------------------------------------

const AGENT_FIRST_NAMES = [
  "Jonathan", "Marco", "Vincenzo", "Aleksandr", "Jorge", "Mino",
  "Pini", "Ibrahim", "Giuseppe", "Patrick", "Sébastien", "Raimundo",
];

const AGENT_LAST_NAMES = [
  "Williams", "Raiola", "De Luca", "Zahavi", "Mendes", "Vieira",
  "Costa", "Barnett", "Bosman", "Nicholson", "Dupont", "Silva",
];

const CLUB_STAFF_FIRST_NAMES = [
  "Dave", "Tony", "Carlos", "Hans", "Luigi", "Craig",
  "Mikael", "Roberto", "Anders", "Steven", "Thierry", "Eduardo",
];

const CLUB_STAFF_LAST_NAMES = [
  "Fletcher", "Harrison", "Romero", "Müller", "Rossi", "Henderson",
  "Svensson", "Martinez", "Andersen", "Campbell", "Petit", "Santos",
];

const JOURNALIST_FIRST_NAMES = [
  "Jack", "Sophie", "Dermot", "Federica", "Adam", "Reza",
  "Charlotte", "Nico", "Fabio", "Elena", "Sam", "Victor",
];

const JOURNALIST_LAST_NAMES = [
  "Prentice", "Lindqvist", "O'Brien", "Carrieri", "Moultrie", "Sharif",
  "Blackwood", "Santamaria", "Conti", "Voronova", "Atkins", "Leclerc",
];

const SCOUT_FIRST_NAMES = [
  "Bill", "Tom", "Gary", "Steve", "Phil", "Pete",
  "Gregor", "Jens", "Fernando", "Raúl", "Luca", "Emil",
];

const SCOUT_LAST_NAMES = [
  "Richardson", "Walsh", "O'Sullivan", "Wright", "Bracewell", "Cole",
  "Schreiber", "Holst", "Díaz", "Moreno", "Ferrara", "Novak",
];

// ---------------------------------------------------------------------------
// Hidden attribute hint templates
// ---------------------------------------------------------------------------

const HIDDEN_INTEL_HINTS: Record<HiddenAttribute, { high: string[]; low: string[] }> = {
  injuryProneness: {
    high: [
      "Has a history of soft-tissue problems — clubs have spent heavily on physio staff to manage him",
      "Picked up three separate muscle injuries in the past two seasons — worth checking the medical",
      "Trainers say he needs careful management; can't always play two games in a week",
    ],
    low: [
      "Iron constitution — rarely misses training and has not had a serious injury in years",
      "Physios say he's one of the lowest-maintenance players at the club",
      "Tougher than he looks — gets through a hard pre-season without a scratch",
    ],
  },
  consistency: {
    high: [
      "Incredibly dependable — what you see in training is what you get on a Saturday",
      "Manager trusts him completely; if he's fit, he plays, and he never lets the team down",
      "One of those players who performs to 7/10 even on an off day — never drops below that",
    ],
    low: [
      "Hot and cold — on his best days he's excellent, but you can't always find him in the game",
      "His output varies hugely week to week; you never quite know which version you'll get",
      "When he's good, he's very good. When he's not, he can be a passenger",
    ],
  },
  bigGameTemperament: {
    high: [
      "Rises to the occasion in derbies and cup ties — a different player when the stakes are high",
      "Has a reputation for being at his best when the pressure is greatest",
      "Scored two in the last playoff final he played in; clearly doesn't freeze under pressure",
    ],
    low: [
      "Has a reputation for being unreliable in big matches — tends to go missing when it matters",
      "Struggled in the cup final and again against the title-chasers; the big stage may be too much",
      "Word in the dressing room is that his head goes on the big occasions",
    ],
  },
  professionalism: {
    high: [
      "Exemplary professional — first in, last out every day according to the coaching staff",
      "Gives everything in every session; the kind of player who makes others around him better",
      "When he moved clubs, his new teammates immediately noticed his work ethic",
    ],
    low: [
      "Turns up but doesn't always buy in — questions from the coaching staff about his attitude",
      "Talented, but the word is he can be difficult in the dressing room when things aren't going his way",
      "There were reported training-ground incidents at his last club — worth digging into",
    ],
  },
};

// ---------------------------------------------------------------------------
// Tip description templates
// ---------------------------------------------------------------------------

const TIP_DESCRIPTIONS: Record<PlayerTip["tipType"], string[]> = {
  unsettled: [
    "has been unsettled since the club changed manager and is open to a move",
    "fell out with the coaching staff over contract talks and is looking for a way out",
    "was left out of the squad for the last cup game — reading between the lines, a transfer seems likely",
  ],
  availableForLoan: [
    "is surplus to requirements and the club will consider loan offers",
    "is ready for first-team football but his club can't guarantee minutes — they're open to a loan",
    "has been told he can go on loan for experience; they want him back in 12 months a better player",
  ],
  contractRunningDown: [
    "has only six months left on his deal and hasn't signed the renewal — he'll be available on a free",
    "his contract runs out in the summer and talks broke down last month",
    "out of contract in June and hasn't been offered new terms — free transfer coming",
  ],
  hiddenGem: [
    "is playing in relative obscurity but the numbers tell a completely different story",
    "doesn't get the recognition he deserves — most scouts sleep on him because of the league he plays in",
    "been on my radar for two years and his development has exceeded all expectations; worth serious consideration",
  ],
  injuryProne: [
    "his career has been hampered by injuries — worth checking the medical carefully before committing",
    "has missed a combined three seasons of football through injury — clubs have to factor that in",
    "every club he's been at has had injury issues with him; there seems to be an underlying fragility",
  ],
};

// ---------------------------------------------------------------------------
// Contact generation helpers
// ---------------------------------------------------------------------------

type NamePool = { first: string[]; last: string[] };

const NAME_POOLS: Record<ContactType, NamePool> = {
  agent:                { first: AGENT_FIRST_NAMES,        last: AGENT_LAST_NAMES },
  clubStaff:            { first: CLUB_STAFF_FIRST_NAMES,   last: CLUB_STAFF_LAST_NAMES },
  journalist:           { first: JOURNALIST_FIRST_NAMES,   last: JOURNALIST_LAST_NAMES },
  scout:                { first: SCOUT_FIRST_NAMES,        last: SCOUT_LAST_NAMES },
  academyCoach:         { first: CLUB_STAFF_FIRST_NAMES,   last: CLUB_STAFF_LAST_NAMES },
  sportingDirector:     { first: AGENT_FIRST_NAMES,        last: AGENT_LAST_NAMES },
  grassrootsOrganizer:  { first: SCOUT_FIRST_NAMES,        last: SCOUT_LAST_NAMES },
  schoolCoach:          { first: CLUB_STAFF_FIRST_NAMES,   last: CLUB_STAFF_LAST_NAMES },
  youthAgent:           { first: AGENT_FIRST_NAMES,        last: AGENT_LAST_NAMES },
  academyDirector:      { first: CLUB_STAFF_FIRST_NAMES,   last: CLUB_STAFF_LAST_NAMES },
  localScout:           { first: SCOUT_FIRST_NAMES,        last: SCOUT_LAST_NAMES },
};

const REGIONS = [
  "England", "Spain", "Germany", "France", "Italy", "Portugal",
  "Netherlands", "Brazil", "Argentina", "Belgium", "Scandinavia", "Eastern Europe",
  "USA", "Mexico", "Canada",
  "Nigeria", "Ghana", "Ivory Coast", "Egypt", "South Africa", "Senegal", "Cameroon",
  "Japan", "South Korea", "Saudi Arabia", "China",
  "Australia", "New Zealand",
];

const ORGANIZATIONS: Record<ContactType, string[]> = {
  agent: [
    "Independent", "Base Soccer", "Stellar Group", "CAA Sport", "Unique Sports Group",
    "Triple S Sports", "Wasserman Football", "S2N Group",
  ],
  clubStaff: [
    "Academy staff", "First-team coaching staff", "Reserve team coach",
    "Club physiotherapy department", "Technical department",
  ],
  journalist: [
    "The Athletic", "Sky Sports", "L'Equipe", "Kicker", "Gazzetta",
    "Guardian Sport", "Marca", "BBC Sport", "ESPN", "Independent",
  ],
  scout: [
    "Independent network", "Former academy scout", "Partner agency",
    "Ex-professional", "Retired coach",
  ],
  academyCoach: [
    "Youth academy", "U18 coaching staff", "U21 development team",
    "Academy technical director", "Youth development programme",
  ],
  sportingDirector: [
    "Club front office", "Football operations", "Transfer committee",
    "Technical board", "Senior management",
  ],
  grassrootsOrganizer: [
    "Local football association", "Community football trust",
    "Grassroots development programme", "Regional FA",
  ],
  schoolCoach: [
    "Secondary school PE department", "College football programme",
    "School sports partnership", "Local education authority",
  ],
  youthAgent: [
    "Independent youth representation", "Junior talent agency",
    "Youth football management", "Next generation sports",
  ],
  academyDirector: [
    "Academy administration", "Youth development board",
    "Academy leadership group", "Foundation phase management",
  ],
  localScout: [
    "Volunteer scouting network", "Regional talent identification",
    "Local club scouting department", "Community scout programme",
  ],
};

function generateContactName(type: ContactType, rng: RNG): string {
  const pool = NAME_POOLS[type];
  return `${rng.pick(pool.first)} ${rng.pick(pool.last)}`;
}

function generateContact(
  rng: RNG,
  type: ContactType,
  relationship: number,
  country?: string,
): Contact {
  const id = `contact_${type}_${rng.nextInt(100000, 999999)}`;
  const name = generateContactName(type, rng);
  const organization = rng.pick(ORGANIZATIONS[type]);
  const region = country ?? rng.pick(REGIONS);

  // Reliability: 0–100 (scouts and club staff tend to be more reliable than journalists)
  const reliabilityBase: Record<ContactType, [number, number]> = {
    agent:                [40, 75],
    clubStaff:            [55, 90],
    journalist:           [25, 65],
    scout:                [50, 85],
    academyCoach:         [60, 92],
    sportingDirector:     [50, 80],
    grassrootsOrganizer:  [45, 78],
    schoolCoach:          [50, 82],
    youthAgent:           [35, 70],
    academyDirector:      [60, 90],
    localScout:           [45, 80],
  };
  const [relMin, relMax] = reliabilityBase[type];
  const reliability = rng.nextInt(relMin, relMax);

  return {
    id,
    name,
    type,
    organization,
    relationship,
    reliability,
    knownPlayerIds: [],
    region,
    country,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate starting contacts for a brand-new scout.
 *
 * Starting contacts are shaped by specialization:
 * - Youth scouts start with 1 club-staff contact (academy) + 1 agent + 1 academyCoach
 * - First-team scouts start with 1 agent + 1 journalist + 1 sportingDirector
 * - Regional experts start with 2 regional scouts + 1 agent
 *   (tier 3+: chance of 1 academyCoach or sportingDirector)
 * - Data scouts start with 2 journalists + 1 agent
 *   (tier 3+: chance of 1 academyCoach or sportingDirector)
 */
export function generateStartingContacts(
  rng: RNG,
  scout: Scout,
): Contact[] {
  const contacts: Contact[] = [];

  const spec = scout.primarySpecialization;
  const tier = scout.careerTier;

  const startingRelationship = 30; // Neutral-positive starting point

  switch (spec) {
    case "youth":
      // 1 club-staff member (from an academy) + 1 agent + 1 academy coach
      contacts.push(generateContact(rng, "clubStaff",    startingRelationship));
      contacts.push(generateContact(rng, "agent",        startingRelationship));
      contacts.push(generateContact(rng, "academyCoach", startingRelationship));
      // Youth specialists also get 2 home-country grassroots contacts
      contacts.push(generateContact(rng, "grassrootsOrganizer", startingRelationship));
      contacts.push(generateContact(rng, "schoolCoach",         startingRelationship));
      break;

    case "firstTeam":
      // 1 agent + 1 journalist + 1 sporting director
      contacts.push(generateContact(rng, "agent",            startingRelationship));
      contacts.push(generateContact(rng, "journalist",       startingRelationship));
      contacts.push(generateContact(rng, "sportingDirector", startingRelationship));
      break;

    case "regional":
      // 2 regional scouts + 1 agent
      contacts.push(generateContact(rng, "scout", startingRelationship + 5));
      contacts.push(generateContact(rng, "scout", startingRelationship));
      contacts.push(generateContact(rng, "agent", startingRelationship));
      break;

    case "data":
      // Data scouts have journalist contacts who share statistical stories
      contacts.push(generateContact(rng, "journalist", startingRelationship));
      contacts.push(generateContact(rng, "journalist", startingRelationship));
      break;
  }

  // Tier 3+ scouts (regional and data specializations) have a chance of an
  // additional academyCoach or sportingDirector depending on their network breadth.
  if (tier >= 3 && (spec === "regional" || spec === "data")) {
    if (rng.chance(0.5)) {
      const bonusType = rng.chance(0.5) ? "academyCoach" : "sportingDirector";
      contacts.push(generateContact(rng, bonusType, startingRelationship));
    }
  }

  return contacts;
}

/**
 * Process a meeting with a contact.
 *
 * The meeting outcome depends on:
 * - Current relationship level (higher = more forthcoming)
 * - Contact type (agents and club staff provide different intel)
 * - Scout's networking attribute (affects relationship change)
 * - RNG (non-deterministic encounters add texture to gameplay)
 *
 * Returns a ContactMeetingResult describing what happened.
 */
export function meetContact(
  rng: RNG,
  scout: Scout,
  contact: Contact,
): ContactMeetingResult {
  // Networking attribute (1–20) provides a flat relationship bonus
  const networkingAttr = scout.attributes.networking;
  const networkingBonus = Math.round((networkingAttr - 10) * 0.5); // -2.5 to +5

  // Base relationship change: positive but modest (0–8 per meeting)
  const baseChange = rng.nextInt(2, 8);
  const relationshipChange = clamp(baseChange + networkingBonus, -3, 15);

  // Intel: only if relationship is high enough (≥ 40)
  const intel: HiddenIntel[] = [];
  if (contact.relationship >= 40 && rng.chance(0.5)) {
    // Contact volunteers a piece of intel on a random known player
    if (contact.knownPlayerIds.length > 0) {
      const playerId = rng.pick(contact.knownPlayerIds);
      const attribute = pickHiddenAttributeByContactType(contact.type, rng);
      const isHigh = rng.chance(0.5);
      const hints = HIDDEN_INTEL_HINTS[attribute][isHigh ? "high" : "low"];
      intel.push({
        playerId,
        attribute,
        hint: rng.pick(hints),
        reliability: contact.reliability / 100,
      });
    }
  }

  // Tips: random player tips at relationship ≥ 25
  const tips: PlayerTip[] = [];
  if (contact.relationship >= 25 && rng.chance(0.4)) {
    const tipType = pickTipTypeByContactType(contact.type, rng);
    if (contact.knownPlayerIds.length > 0) {
      const playerId = rng.pick(contact.knownPlayerIds);
      const descriptions = TIP_DESCRIPTIONS[tipType];
      const description = `${rng.pick(descriptions)}.`;
      tips.push({ playerId, tipType, description });
    }
  }

  return { relationshipChange, intel, tips };
}

/**
 * Query a specific contact for hidden attribute intel on a known player.
 *
 * Returns null if the contact doesn't know the player or the relationship
 * isn't strong enough to share.
 */
export function getHiddenAttributeIntel(
  rng: RNG,
  contact: Contact,
  playerId: string,
  player: Player,
  /** Additive bonus to intel reliability from equipment (0–1 scale). */
  intelReliabilityBonus?: number,
): HiddenIntel | null {
  if (!contact.knownPlayerIds.includes(playerId)) return null;
  if (contact.relationship < 35) return null;

  // Probability of getting useful intel scales with relationship
  const intelChance = Math.min(0.9, contact.relationship / 100 + 0.2);
  if (!rng.chance(intelChance)) return null;

  const attribute = pickHiddenAttributeByContactType(contact.type, rng);

  // Determine if the attribute value is high or low for this player
  // We access player.attributes which has the true (hidden) values
  const trueValue = player.attributes[attribute];
  const isHigh = trueValue >= 12; // Above 12 = noteworthy in either direction

  const hints = HIDDEN_INTEL_HINTS[attribute][isHigh ? "high" : "low"];

  // Reliability varies: contact's base reliability ± some noise + equipment bonus
  const reliabilityNoise = rng.nextFloat(-0.1, 0.1);
  const reliability = clamp(contact.reliability / 100 + reliabilityNoise + (intelReliabilityBonus ?? 0), 0, 1);

  return {
    playerId,
    attribute,
    hint: rng.pick(hints),
    reliability,
  };
}

/**
 * Assess whether a specific interaction with an agent contact will be reliable.
 *
 * Agents with low reliability are more likely to mislead the scout with
 * inaccurate valuations, false availability claims, or inflated player assessments.
 *
 * Formula: misleadChance = 0.3 * (1 - contact.reliability / 100)
 * A perfectly reliable contact (reliability=100) has a 0% mislead chance.
 * A completely unreliable contact (reliability=0) has a 30% mislead chance.
 */
export function assessAgentReliability(
  contact: Contact,
  rng: RNG,
): { isReliable: boolean; misleadChance: number } {
  const normalizedReliability = contact.reliability / 100; // 0–1
  const misleadChance = 0.3 * (1 - normalizedReliability);
  const isReliable = !rng.chance(misleadChance);
  return { isReliable, misleadChance };
}

/**
 * Simulate a negotiation with a contact about a player transfer.
 *
 * Success is determined by the scout's persuasion attribute and the current
 * relationship level with the contact. A successful negotiation achieves a
 * better deal (adjustedValue below playerValue). A failed negotiation slightly
 * damages the relationship.
 *
 * Success threshold: (persuasion / 20) * 0.6 + (relationship / 100) * 0.4 ≥ 0.5
 * On success: adjustedValue = playerValue * discount (0.85–0.98)
 * On failure: relationshipChange = -2
 */
export function processNegotiation(
  rng: RNG,
  scout: Scout,
  contact: Contact,
  playerValue: number,
): NegotiationResult {
  const persuasion = scout.attributes.persuasion; // 1–20
  const relationship = contact.relationship;      // 0–100

  // Weighted success score: persuasion (60%) + relationship (40%)
  const successScore = (persuasion / 20) * 0.6 + (relationship / 100) * 0.4;

  // Add some randomness (±0.1) so outcomes aren't fully deterministic
  const roll = successScore + rng.nextFloat(-0.1, 0.1);
  const success = roll >= 0.5;

  if (!success) {
    return {
      success: false,
      adjustedValue: playerValue,
      relationshipChange: -2,
    };
  }

  // Successful negotiation: discount scales with how well the roll exceeded threshold.
  // Excess above 0.5 in range [0, 0.5] maps to discount in [0.02, 0.15].
  const excess = clamp(roll - 0.5, 0, 0.5);
  const discountFraction = 0.02 + excess * 0.26; // 0.02–0.15
  const adjustedValue = Math.round(playerValue * (1 - discountFraction));

  // Positive relationship bump on success (1–4), higher for stronger outcomes
  const relationshipChange = Math.round(1 + excess * 6);

  return { success: true, adjustedValue, relationshipChange };
}

/**
 * Generate a contact of any ContactType for a specific organization and region.
 *
 * A generic factory useful for programmatic contact creation (e.g. job offers,
 * transfer window introductions) that isn't tied to a particular scout's
 * starting setup.
 */
export function generateContactForType(
  rng: RNG,
  type: ContactType,
  organization: string,
  region?: string,
): Contact {
  const id = `contact_${type}_${rng.nextInt(100000, 999999)}`;
  const name = generateContactName(type, rng);

  const reliabilityBase: Record<ContactType, [number, number]> = {
    agent:                [40, 75],
    clubStaff:            [55, 90],
    journalist:           [25, 65],
    scout:                [50, 85],
    academyCoach:         [60, 92],
    sportingDirector:     [50, 80],
    grassrootsOrganizer:  [45, 78],
    schoolCoach:          [50, 82],
    youthAgent:           [35, 70],
    academyDirector:      [60, 90],
    localScout:           [45, 80],
  };
  const [relMin, relMax] = reliabilityBase[type];
  const reliability = rng.nextInt(relMin, relMax);

  return {
    id,
    name,
    type,
    organization,
    relationship: 20, // Cold-start: lower than the organic scout-facing default
    reliability,
    knownPlayerIds: [],
    region: region ?? rng.pick(REGIONS),
  };
}

// ---------------------------------------------------------------------------
// Youth scouting contact functions
// ---------------------------------------------------------------------------

/**
 * When a contact has relationship >= 60, they may introduce a new contact.
 * Returns null if the introduction roll fails.
 */
export function processContactIntroduction(
  rng: RNG,
  scout: Scout,
  contact: Contact,
): Contact | null {
  if (contact.relationship < 60) return null;
  if (!rng.chance(0.15)) return null; // 15% chance per eligible meeting

  // Pick a related contact type
  const youthContactTypes: ContactType[] = [
    "grassrootsOrganizer",
    "schoolCoach",
    "youthAgent",
    "academyDirector",
    "localScout",
  ];
  const introType = rng.pick(youthContactTypes);

  // The introduced contact is from the same country/region as the existing contact
  const country = contact.country ?? contact.region;

  return generateContact(rng, introType, 20, country); // warm start at 20 relationship
}

/**
 * Chance to meet a new contact at a youth venue event.
 * Rate scales with scout's networking attribute.
 */
export function processVenueContactAcquisition(
  rng: RNG,
  scout: Scout,
  venueType: YouthVenueType,
  country: string,
): Contact | null {
  const networkingBonus = (scout.attributes.networking - 10) * 0.02;
  const baseChance =
    venueType === "youthFestival"        ? 0.30
    : venueType === "grassrootsTournament" ? 0.20
    : venueType === "academyTrialDay"      ? 0.25
    : 0.10;

  if (!rng.chance(baseChance + networkingBonus)) return null;

  // Map venue to likely contact type
  const typeMap: Record<string, ContactType[]> = {
    schoolMatch:          ["schoolCoach"],
    grassrootsTournament: ["grassrootsOrganizer", "localScout"],
    streetFootball:       ["localScout"],
    academyTrialDay:      ["academyDirector"],
    youthFestival:        ["grassrootsOrganizer", "youthAgent", "localScout"],
    followUpSession:      ["schoolCoach"],
    parentCoachMeeting:   ["youthAgent"],
  };
  const candidates = typeMap[venueType] ?? ["localScout"];
  const contactType = rng.pick(candidates);

  return generateContact(rng, contactType, 15, country);
}

/**
 * Contacts lose 2-3 relationship per week after 8 weeks of no interaction.
 */
export function processRelationshipDecay(
  contacts: Record<string, Contact>,
  currentWeek: number,
): Record<string, Contact> {
  const result: Record<string, Contact> = {};
  for (const [id, contact] of Object.entries(contacts)) {
    const weeksSinceInteraction = currentWeek - (contact.lastInteractionWeek ?? 0);
    if (weeksSinceInteraction > 8 && contact.relationship > 5) {
      const decay = Math.min(3, contact.relationship - 5);
      result[id] = { ...contact, relationship: contact.relationship - decay };
    } else {
      result[id] = contact;
    }
  }
  return result;
}

/**
 * High-relationship contacts (70+) may share exclusive tips about unsigned youth.
 * Returns a tip with a youth ID and description, or null.
 */
export function processExclusiveTip(
  rng: RNG,
  contact: Contact,
  unsignedYouth: Record<string, UnsignedYouth>,
): { youthId: string; description: string } | null {
  if (contact.relationship < 70) return null;
  if (!rng.chance(0.15)) return null;

  // Pick a youth from the contact's country/region
  const contactLocation = (contact.country ?? contact.region ?? "").toLowerCase();
  const countryYouth = Object.values(unsignedYouth).filter(
    (y) =>
      y.country.toLowerCase() === contactLocation &&
      !y.placed &&
      !y.retired,
  );
  if (countryYouth.length === 0) return null;

  const youth = rng.pick(countryYouth);
  const descriptions = [
    `I've heard about a promising ${youth.player.position} in the area. Worth watching.`,
    `There's a kid playing locally who has something special. Name's ${youth.player.lastName}.`,
    `One of my contacts mentioned a talented youngster called ${youth.player.firstName}. Might be worth a look.`,
    `Keep an eye out for ${youth.player.lastName} — raw but exciting talent.`,
  ];

  return { youthId: youth.id, description: rng.pick(descriptions) };
}

/**
 * Occasionally a contact requests a favor that can boost relationship.
 * Returns a favor description and relationship bonus, or null.
 */
export function generateContactFavor(
  rng: RNG,
  contact: Contact,
): { description: string; relationshipBonus: number } | null {
  if (!rng.chance(0.08)) return null;

  const favors = [
    {
      description: `${contact.name} asks you to attend a local youth match and share your assessment.`,
      bonus: 10,
    },
    {
      description: `${contact.name} wants your opinion on a young player their organization is considering.`,
      bonus: 8,
    },
    {
      description: `${contact.name} requests a reference for a coaching position.`,
      bonus: 12,
    },
    {
      description: `${contact.name} asks if you can recommend any players for an upcoming tournament.`,
      bonus: 10,
    },
  ];

  const favor = rng.pick(favors);
  return { description: favor.description, relationshipBonus: favor.bonus };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Different contact types specialise in different kinds of hidden attributes.
 */
function pickHiddenAttributeByContactType(
  type: ContactType,
  rng: RNG,
): HiddenAttribute {
  const pools: Record<ContactType, HiddenAttribute[]> = {
    agent:                ["consistency", "bigGameTemperament"],
    clubStaff:            ["professionalism", "injuryProneness", "consistency"],
    journalist:           ["bigGameTemperament", "consistency"],
    scout:                ["professionalism", "consistency", "bigGameTemperament", "injuryProneness"],
    academyCoach:         ["professionalism", "consistency", "injuryProneness"],
    sportingDirector:     ["bigGameTemperament", "professionalism", "consistency"],
    grassrootsOrganizer:  ["consistency", "professionalism"],
    schoolCoach:          ["professionalism", "consistency", "injuryProneness"],
    youthAgent:           ["bigGameTemperament", "consistency"],
    academyDirector:      ["professionalism", "consistency", "injuryProneness"],
    localScout:           ["consistency", "bigGameTemperament", "professionalism"],
  };
  return rng.pick(pools[type]);
}

/**
 * Different contact types tend to know about different kinds of tips.
 */
function pickTipTypeByContactType(
  type: ContactType,
  rng: RNG,
): PlayerTip["tipType"] {
  const pools: Record<ContactType, PlayerTip["tipType"][]> = {
    agent:                ["unsettled", "availableForLoan", "contractRunningDown"],
    clubStaff:            ["hiddenGem", "injuryProne", "availableForLoan"],
    journalist:           ["unsettled", "contractRunningDown", "hiddenGem"],
    scout:                ["hiddenGem", "availableForLoan", "contractRunningDown", "injuryProne"],
    academyCoach:         ["hiddenGem", "injuryProne", "availableForLoan"],
    sportingDirector:     ["unsettled", "contractRunningDown", "availableForLoan"],
    grassrootsOrganizer:  ["hiddenGem", "availableForLoan"],
    schoolCoach:          ["hiddenGem", "injuryProne"],
    youthAgent:           ["unsettled", "availableForLoan", "contractRunningDown"],
    academyDirector:      ["hiddenGem", "injuryProne", "availableForLoan"],
    localScout:           ["hiddenGem", "availableForLoan", "injuryProne"],
  };
  return rng.pick(pools[type]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
