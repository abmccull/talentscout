import type {
  GameState,
  NarrativeEvent,
  NarrativeEventType,
} from "@/engine/core/types";
import { addGameWeeks } from "@/engine/core/gameDate";
import type { RNG } from "@/engine/rng";
import {
  createDeterministicRunId,
  createNamedRNG,
} from "@/engine/run";
import type {
  ConsequenceEffect,
  DecisionOption,
  ScheduledConsequenceTemplate,
} from "@/engine/consequences/types";

export type ScoutingSpecialEventCategory =
  | "discovery"
  | "access"
  | "ethics"
  | "media"
  | "playerWelfare"
  | "marketShock"
  | "rivalConflict"
  | "careerPolitics";

type OutcomeMetric =
  | "reputation"
  | "fatigue"
  | "clubTrust"
  | "specializationReputation"
  | "contactTrust";

interface SpecialEventContext {
  playerId?: string;
  playerName: string;
  contactId?: string;
  contactName: string;
  clubId?: string;
  clubName: string;
  rivalId?: string;
  rivalName: string;
}

interface DelayedBranchDefinition {
  weeks: number;
  successChance: number;
  metric: OutcomeMetric;
  successDelta: number;
  failureDelta: number;
  outcomeLabel: string;
}

type SpecialEventActorKind = "contact" | "board" | "family" | "rival";

interface SpecialEventMemoryProfile {
  actor: SpecialEventActorKind;
  successValence: number;
  failureValence: number;
  successTags: readonly string[];
  failureTags: readonly string[];
  halfLifeWeeks?: number;
}

export interface ScoutingSpecialEventOptionDefinition {
  label: string;
  effect: string;
  knownTradeoffs: string[];
  delayed: DelayedBranchDefinition;
  /** Persistent actor memory created when the delayed branch resolves. */
  memory?: SpecialEventMemoryProfile;
  /** Creates a real promise whose terminal state resolves with the branch. */
  obligation?: {
    kind: string;
    terms: string;
    dueWeeks: number;
  };
}

export interface ScoutingSpecialEventDefinition {
  id: string;
  category: ScoutingSpecialEventCategory;
  type: NarrativeEventType;
  title: string;
  description: (context: SpecialEventContext) => string;
  deadlineWeeks: number;
  defaultChoiceIndex: number;
  baseWeight: number;
  traitWeights: Readonly<Record<string, number>>;
  requires?: "player" | "contact" | "club" | "rival";
  related: (context: SpecialEventContext) => string[];
  options: readonly ScoutingSpecialEventOptionDefinition[];
}

/**
 * Eight scouting-centred turning points. Their choices deliberately reuse the
 * existing narrative effect vocabulary so the immediate UI response and the
 * durable consequence ledger describe the same action.
 */
export const SCOUTING_SPECIAL_EVENT_DECK: readonly ScoutingSpecialEventDefinition[] = [
  {
    id: "career-board-vote",
    category: "careerPolitics",
    type: "careerCrossroads",
    title: "Board Vote: Put Your Name On It",
    description: ({ playerName, clubName }) =>
      `${clubName}'s recruitment committee is split over ${playerName}. ` +
      "The sporting director wants a recommendation with a name attached before the vote. " +
      "Owning the call brings influence and exposure; sharing it trades credit for protection.",
    deadlineWeeks: 2,
    defaultChoiceIndex: 2,
    baseWeight: 1,
    traitWeights: {
      "boom-bust-market": 1.35,
      "cautious-market": 1.45,
      "scout-wars": 1.2,
    },
    related: ({ playerId, clubId }) => [playerId, clubId].filter(Boolean) as string[],
    options: [
      {
        label: "Stake your reputation",
        effect: "crossroadsAllIn",
        knownTradeoffs: [
          "Maximum personal credit if the player succeeds",
          "A failed recommendation will be attached directly to your name",
        ],
        delayed: {
          weeks: 6,
          successChance: 0.55,
          metric: "reputation",
          successDelta: 12,
          failureDelta: -9,
          outcomeLabel: "personal recommendation verdict",
        },
        memory: {
          actor: "board",
          successValence: 72,
          failureValence: -74,
          successTags: ["boardMeeting", "meetingPositive", "accountability"],
          failureTags: ["boardMeeting", "meetingNegative", "accountability"],
          halfLifeWeeks: 76,
        },
      },
      {
        label: "Build a coalition",
        effect: "crossroadsCoalition",
        knownTradeoffs: [
          "A second opinion improves the decision quality",
          "Credit and political ownership will be shared",
        ],
        delayed: {
          weeks: 5,
          successChance: 0.74,
          metric: "clubTrust",
          successDelta: 7,
          failureDelta: -2,
          outcomeLabel: "coalition recommendation verdict",
        },
        memory: {
          actor: "board",
          successValence: 52,
          failureValence: -18,
          successTags: ["boardMeeting", "meetingPositive", "strategicVision"],
          failureTags: ["boardMeeting", "meetingNegative", "strategicVision"],
          halfLifeWeeks: 52,
        },
      },
      {
        label: "Walk away",
        effect: "crossroadsWalkAway",
        knownTradeoffs: [
          "Avoids exposure to the football outcome",
          "Decision-makers will remember the lack of conviction",
        ],
        delayed: {
          weeks: 2,
          successChance: 1,
          metric: "specializationReputation",
          successDelta: -1,
          failureDelta: -1,
          outcomeLabel: "abstention remembered",
        },
        memory: {
          actor: "board",
          successValence: -32,
          failureValence: -32,
          successTags: ["boardMeeting", "meetingNegative", "accountability"],
          failureTags: ["boardMeeting", "meetingNegative", "accountability"],
          halfLifeWeeks: 52,
        },
      },
    ],
  },
  {
    id: "discovery-last-empty-seat",
    category: "discovery",
    type: "exclusiveTip",
    title: "The Last Empty Seat",
    description: ({ playerName }) =>
      `A school coach insists ${playerName} is playing tonight in a match absent from every data feed. ` +
      "One rival has already asked for directions. Following the lead means abandoning your planned work on very thin evidence.",
    deadlineWeeks: 1,
    defaultChoiceIndex: 1,
    baseWeight: 1.15,
    traitWeights: {
      "golden-generation": 1.9,
      "thin-crop": 1.45,
      "scout-wars": 1.35,
    },
    requires: "player",
    related: ({ playerId, contactId }) => [playerId, contactId].filter(Boolean) as string[],
    options: [
      {
        label: "Drop everything and investigate",
        effect: "investigate",
        knownTradeoffs: [
          "First-mover chance on an untracked prospect",
          "Consumes the week and may be nothing more than local hype",
        ],
        delayed: {
          weeks: 4,
          successChance: 0.58,
          metric: "specializationReputation",
          successDelta: 9,
          failureDelta: -3,
          outcomeLabel: "unknown prospect develops",
        },
        memory: {
          actor: "contact",
          successValence: 66,
          failureValence: 22,
          successTags: ["reciprocity", "trustedUnderPressure"],
          failureTags: ["reciprocity"],
          halfLifeWeeks: 52,
        },
      },
      {
        label: "Keep the existing schedule",
        effect: "ignore",
        knownTradeoffs: [
          "Protects current assignments",
          "The discovery window will belong to somebody else",
        ],
        delayed: {
          weeks: 3,
          successChance: 1,
          metric: "clubTrust",
          successDelta: -2,
          failureDelta: -2,
          outcomeLabel: "missed lead surfaces",
        },
        memory: {
          actor: "contact",
          successValence: -28,
          failureValence: -28,
          successTags: ["promiseBroken"],
          failureTags: ["promiseBroken"],
          halfLifeWeeks: 38,
        },
      },
    ],
  },
  {
    id: "access-closed-training",
    category: "access",
    type: "exclusiveAccess",
    title: "Behind the Locked Gate",
    description: ({ contactName, playerName }) =>
      `${contactName} can get you into a closed session centred on ${playerName}, ` +
      "but only if your presence and everything you see remain confidential. Attending creates both privileged evidence and a debt of trust.",
    deadlineWeeks: 1,
    defaultChoiceIndex: 1,
    baseWeight: 1,
    traitWeights: {
      "trusted-circuit": 2.4,
      "scout-wars": 0.75,
    },
    requires: "contact",
    related: ({ contactId, playerId }) => [contactId, playerId].filter(Boolean) as string[],
    options: [
      {
        label: "Accept under strict confidence",
        effect: "accessAttend",
        knownTradeoffs: [
          "Reveals behaviour unavailable in match data",
          "Creates a confidentiality obligation that can later conflict with club demands",
        ],
        delayed: {
          weeks: 5,
          successChance: 0.7,
          metric: "contactTrust",
          successDelta: 11,
          failureDelta: -6,
          outcomeLabel: "exclusive access relationship matures",
        },
        memory: {
          actor: "contact",
          successValence: 62,
          failureValence: -24,
          successTags: ["exclusiveAccess", "reciprocity", "trustedUnderPressure"],
          failureTags: ["exclusiveAccess", "integrityConflict"],
          halfLifeWeeks: 76,
        },
        obligation: {
          kind: "confidentiality",
          terms: "Keep the closed training session and its evidence confidential until the access window is resolved.",
          dueWeeks: 20,
        },
      },
      {
        label: "Decline the condition",
        effect: "accessPass",
        knownTradeoffs: [
          "Preserves freedom to share future evidence",
          "The source may offer the access to a rival instead",
        ],
        delayed: {
          weeks: 3,
          successChance: 0.8,
          metric: "specializationReputation",
          successDelta: 2,
          failureDelta: -2,
          outcomeLabel: "access opportunity moves elsewhere",
        },
        memory: {
          actor: "contact",
          successValence: -8,
          failureValence: -20,
          successTags: ["integrityConflict"],
          failureTags: ["reciprocity"],
          halfLifeWeeks: 24,
        },
      },
    ],
  },
  {
    id: "ethics-agent-envelope",
    category: "ethics",
    type: "agentDoubleDealing",
    title: "The Agent's Envelope",
    description: ({ contactName }) =>
      `${contactName} has supplied altered medical and performance records to several clubs. ` +
      "You have enough evidence to expose the scheme, or enough leverage to obtain privileged client information. Either choice creates enemies.",
    deadlineWeeks: 2,
    defaultChoiceIndex: 1,
    baseWeight: 0.9,
    traitWeights: {
      "scout-wars": 1.55,
      "trusted-circuit": 1.25,
      "boom-bust-market": 1.2,
    },
    requires: "contact",
    related: ({ contactId }) => contactId ? [contactId] : [],
    options: [
      {
        label: "Expose the falsified records",
        effect: "doubleDealExpose",
        knownTradeoffs: [
          "Protects clubs and establishes an integrity record",
          "The agent network may retaliate or close ranks",
        ],
        delayed: {
          weeks: 6,
          successChance: 0.68,
          metric: "reputation",
          successDelta: 8,
          failureDelta: -3,
          outcomeLabel: "industry investigation concludes",
        },
        memory: {
          actor: "contact",
          successValence: -88,
          failureValence: -76,
          successTags: ["confronted", "exposedMisconduct", "integrityConflict"],
          failureTags: ["confronted", "integrityConflict"],
          halfLifeWeeks: 104,
        },
      },
      {
        label: "Use the evidence as leverage",
        effect: "doubleDealLeverage",
        knownTradeoffs: [
          "Can produce rare information and immediate advantage",
          "Discovery would make you complicit in the deception",
        ],
        delayed: {
          weeks: 5,
          successChance: 0.42,
          metric: "reputation",
          successDelta: 11,
          failureDelta: -12,
          outcomeLabel: "private leverage arrangement exposed or secured",
        },
        memory: {
          actor: "contact",
          successValence: 34,
          failureValence: -92,
          successTags: ["mutualComplicity", "exclusiveAccess"],
          failureTags: ["betrayal", "dishonest", "mutualComplicity"],
          halfLifeWeeks: 104,
        },
      },
    ],
  },
  {
    id: "media-wonderkid-leak",
    category: "media",
    type: "journalistExpose",
    title: "The Wonderkid Leak",
    description: ({ playerName, contactName }) =>
      `${contactName} has obtained fragments of your notes on ${playerName} and will publish tomorrow. ` +
      "Cooperating lets you shape the story but accelerates the hype; refusing protects the player while surrendering control of the narrative.",
    deadlineWeeks: 1,
    defaultChoiceIndex: 1,
    baseWeight: 0.95,
    traitWeights: {
      "golden-generation": 1.65,
      "scout-wars": 1.45,
      "trusted-circuit": 0.8,
    },
    requires: "contact",
    related: ({ playerId, contactId }) => [playerId, contactId].filter(Boolean) as string[],
    options: [
      {
        label: "Cooperate and control the framing",
        effect: "journalistCooperate",
        knownTradeoffs: [
          "Builds public authority and corrects inaccurate claims",
          "Adds pressure to a young player and advertises the target to rivals",
        ],
        delayed: {
          weeks: 4,
          successChance: 0.55,
          metric: "reputation",
          successDelta: 8,
          failureDelta: -6,
          outcomeLabel: "media profile changes the market",
        },
        memory: {
          actor: "contact",
          successValence: 58,
          failureValence: -30,
          successTags: ["reciprocity", "exclusiveAccess"],
          failureTags: ["informationLeak", "integrityConflict"],
          halfLifeWeeks: 52,
        },
      },
      {
        label: "Refuse and warn the family",
        effect: "journalistRefuse",
        knownTradeoffs: [
          "Prioritises player welfare and private trust",
          "The article will run without your context or correction",
        ],
        delayed: {
          weeks: 4,
          successChance: 0.82,
          metric: "specializationReputation",
          successDelta: 4,
          failureDelta: -1,
          outcomeLabel: "quiet handling earns private trust",
        },
        memory: {
          actor: "contact",
          successValence: -16,
          failureValence: -40,
          successTags: ["integrityConflict"],
          failureTags: ["confronted", "informationLeak"],
          halfLifeWeeks: 32,
        },
      },
    ],
  },
  {
    id: "welfare-family-fast-track",
    category: "playerWelfare",
    type: "youthProdigyDilemma",
    title: "The Family and the Fast Track",
    description: ({ playerName, clubName }) =>
      `${playerName}'s family wants your honest advice after ${clubName} offered an accelerated pathway. ` +
      "Your employer benefits from an immediate commitment, but another environment may be safer for the player's education and long-term development.",
    deadlineWeeks: 2,
    defaultChoiceIndex: 2,
    baseWeight: 1,
    traitWeights: {
      "golden-generation": 1.75,
      "trusted-circuit": 1.45,
      "scout-wars": 1.2,
    },
    requires: "player",
    related: ({ playerId, clubId }) => [playerId, clubId].filter(Boolean) as string[],
    options: [
      {
        label: "Recommend the best development fit",
        effect: "prodigyBestFit",
        knownTradeoffs: [
          "Prioritises the player and family over institutional interest",
          "May send the prospect outside your own organisation",
        ],
        delayed: {
          weeks: 8,
          successChance: 0.72,
          metric: "reputation",
          successDelta: 8,
          failureDelta: -2,
          outcomeLabel: "family evaluates your independent advice",
        },
        memory: {
          actor: "family",
          successValence: 82,
          failureValence: 24,
          successTags: ["playerWelfare", "trustedUnderPressure", "independentAdvice"],
          failureTags: ["playerWelfare", "goodFaithAdvice"],
          halfLifeWeeks: 152,
        },
      },
      {
        label: "Back your club's fast track",
        effect: "prodigyOwnClub",
        knownTradeoffs: [
          "Strengthens your position with the club if the pathway works",
          "You own the welfare risk if the player is overwhelmed",
        ],
        delayed: {
          weeks: 8,
          successChance: 0.58,
          metric: "clubTrust",
          successDelta: 9,
          failureDelta: -8,
          outcomeLabel: "accelerated pathway verdict",
        },
        memory: {
          actor: "family",
          successValence: 54,
          failureValence: -86,
          successTags: ["playerWelfare", "promiseKept", "fastTrack"],
          failureTags: ["playerWelfare", "promiseBroken", "fastTrack"],
          halfLifeWeeks: 152,
        },
      },
      {
        label: "Present the evidence and stay neutral",
        effect: "prodigyNeutral",
        knownTradeoffs: [
          "Preserves every relationship and lets the family decide",
          "Forfeits the influence expected from an expert opinion",
        ],
        delayed: {
          weeks: 6,
          successChance: 0.85,
          metric: "specializationReputation",
          successDelta: 2,
          failureDelta: -1,
          outcomeLabel: "neutral advice remembered",
        },
        memory: {
          actor: "family",
          successValence: 12,
          failureValence: -8,
          successTags: ["playerWelfare", "neutralAdvice"],
          failureTags: ["playerWelfare", "neutralAdvice"],
          halfLifeWeeks: 76,
        },
      },
    ],
  },
  {
    id: "market-window-collapse",
    category: "marketShock",
    type: "scoutingDeptRestructure",
    title: "The Window Collapses",
    description: ({ clubName }) =>
      `${clubName}'s recruitment budget has been cut with days left in the window. ` +
      "Leadership wants either a rapid data-led shortlist built from incomplete evidence or a public defence of the slower live-scouting plan.",
    deadlineWeeks: 1,
    defaultChoiceIndex: 1,
    baseWeight: 0.9,
    traitWeights: {
      "boom-bust-market": 3,
      "cautious-market": 0.35,
      "scout-wars": 1.2,
    },
    related: ({ clubId }) => clubId ? [clubId] : [],
    options: [
      {
        label: "Build the emergency shortlist",
        effect: "restructureAccept",
        knownTradeoffs: [
          "Keeps the club active in the market and demonstrates adaptability",
          "Thin evidence raises the chance of an expensive false positive",
        ],
        delayed: {
          weeks: 5,
          successChance: 0.64,
          metric: "clubTrust",
          successDelta: 10,
          failureDelta: -5,
          outcomeLabel: "emergency shortlist audited",
        },
        memory: {
          actor: "board",
          successValence: 68,
          failureValence: -58,
          successTags: ["boardMeeting", "meetingPositive", "costDiscipline"],
          failureTags: ["boardMeeting", "meetingNegative", "costDiscipline"],
          halfLifeWeeks: 64,
        },
      },
      {
        label: "Defend the live-scouting threshold",
        effect: "restructureResist",
        knownTradeoffs: [
          "Protects evidence standards and long-term process credibility",
          "The club may miss the window and blame your inflexibility",
        ],
        delayed: {
          weeks: 4,
          successChance: 0.48,
          metric: "specializationReputation",
          successDelta: 7,
          failureDelta: -6,
          outcomeLabel: "recruitment process dispute resolves",
        },
        memory: {
          actor: "board",
          successValence: 48,
          failureValence: -52,
          successTags: ["boardMeeting", "meetingPositive", "strategicVision"],
          failureTags: ["boardMeeting", "meetingNegative", "strategicVision"],
          halfLifeWeeks: 64,
        },
      },
    ],
  },
  {
    id: "rival-credit-war",
    category: "rivalConflict",
    type: "rivalPoach",
    title: "The Credit War",
    description: ({ playerName, rivalName }) =>
      `${rivalName} is presenting ${playerName} as their discovery after receiving information traceable to your network. ` +
      "Publishing your dated report can reclaim the credit, but doing so reveals methods and sources while the player is still available.",
    deadlineWeeks: 1,
    defaultChoiceIndex: 1,
    baseWeight: 1,
    traitWeights: {
      "scout-wars": 3.2,
      "trusted-circuit": 0.3,
      "thin-crop": 1.4,
    },
    requires: "player",
    related: ({ playerId, rivalId }) => [playerId, rivalId].filter(Boolean) as string[],
    options: [
      {
        label: "Publish the dated evidence now",
        effect: "rushReport",
        knownTradeoffs: [
          "Can establish ownership of the discovery before the market moves",
          "Exposes your process and may burn the source who gave you access",
        ],
        delayed: {
          weeks: 4,
          successChance: 0.52,
          metric: "reputation",
          successDelta: 11,
          failureDelta: -8,
          outcomeLabel: "discovery credit dispute settles",
        },
        memory: {
          actor: "rival",
          successValence: -76,
          failureValence: -38,
          successTags: ["rivalry", "publicChallenge", "creditDispute"],
          failureTags: ["rivalry", "publicChallenge"],
          halfLifeWeeks: 104,
        },
      },
      {
        label: "Stay quiet and protect the source",
        effect: "ignore",
        knownTradeoffs: [
          "Preserves methods and long-term access",
          "The rival may permanently own the public discovery story",
        ],
        delayed: {
          weeks: 5,
          successChance: 0.78,
          metric: "specializationReputation",
          successDelta: 3,
          failureDelta: -4,
          outcomeLabel: "private network judges your restraint",
        },
        memory: {
          actor: "rival",
          successValence: 14,
          failureValence: -12,
          successTags: ["rivalry", "professionalRestraint"],
          failureTags: ["rivalry", "creditDispute"],
          halfLifeWeeks: 76,
        },
      },
    ],
  },
];

const SPECIAL_EVENTS_BY_ID = new Map(
  SCOUTING_SPECIAL_EVENT_DECK.map((definition) => [definition.id, definition]),
);

export interface SpecialEventSelectionHistory {
  recentSpecialEventIds?: readonly string[];
  specialEventCounts?: Readonly<Record<string, number>>;
}

function playerName(state: GameState, id: string | undefined): string | undefined {
  if (!id) return undefined;
  const player = state.players[id]
    ?? state.retiredPlayers[id]
    ?? Object.values(state.unsignedYouth).find((candidate) => candidate.player.id === id)?.player;
  return player ? `${player.firstName} ${player.lastName}` : undefined;
}

function contactForDefinition(
  state: GameState,
  definition: ScoutingSpecialEventDefinition,
) {
  const contacts = Object.values(state.contacts).sort((left, right) =>
    right.relationship - left.relationship || left.id.localeCompare(right.id),
  );
  const preferredTypes = definition.id === "ethics-agent-envelope"
    ? new Set(["agent", "youthAgent"])
    : definition.id === "media-wonderkid-leak"
      ? new Set(["journalist"])
      : definition.id === "discovery-last-empty-seat"
        ? new Set(["schoolCoach", "grassrootsOrganizer", "academyCoach"])
        : undefined;
  if (!preferredTypes) return contacts[0];
  const preferred = contacts.find((contact) => preferredTypes.has(contact.type));
  // Agent and journalist stories must fail closed when the named profession
  // does not exist. Discovery tips can still come from another local source.
  if (definition.requires === "contact") return preferred;
  return preferred ?? contacts[0];
}

function buildContext(
  state: GameState,
  definition: ScoutingSpecialEventDefinition,
): SpecialEventContext {
  const recentReport = Object.values(state.reports).sort((left, right) =>
    right.submittedSeason - left.submittedSeason
    || right.submittedWeek - left.submittedWeek
    || left.id.localeCompare(right.id),
  )[0];
  const playerId = recentReport?.playerId
    ?? state.watchlist.at(0)
    ?? Object.keys(state.players).sort()[0]
    ?? Object.values(state.unsignedYouth)
      .map((candidate) => candidate.player.id)
      .sort()[0];
  const contact = contactForDefinition(state, definition);
  const clubId = state.scout.currentClubId ?? Object.keys(state.clubs).sort()[0];
  const club = clubId ? state.clubs[clubId] : undefined;
  const rival = Object.values(state.rivalScouts).sort((left, right) =>
    left.id.localeCompare(right.id),
  )[0];
  return {
    playerId,
    playerName: playerName(state, playerId) ?? "an overlooked prospect",
    contactId: contact?.id,
    contactName: contact?.name ?? "a well-placed intermediary",
    clubId,
    clubName: club?.name ?? "a recruitment client",
    rivalId: rival?.id,
    rivalName: rival?.name ?? "a competing scout",
  };
}

function isEligible(
  definition: ScoutingSpecialEventDefinition,
  context: SpecialEventContext,
): boolean {
  if (!definition.requires) return true;
  if (definition.requires === "player") return Boolean(context.playerId);
  if (definition.requires === "contact") return Boolean(context.contactId);
  if (definition.requires === "club") return Boolean(context.clubId);
  return Boolean(context.rivalId);
}

/** Exposed for tuning tests and a future event-director diagnostics panel. */
export function getSpecialEventSelectionWeights(
  state: GameState,
  history: SpecialEventSelectionHistory,
): Record<string, number> {
  const recent = [...(history.recentSpecialEventIds ?? [])].slice(-4);
  const counts = history.specialEventCounts ?? {};
  return Object.fromEntries(SCOUTING_SPECIAL_EVENT_DECK.map((definition) => {
    const context = buildContext(state, definition);
    if (!isEligible(definition, context) || recent.includes(definition.id)) {
      return [definition.id, 0];
    }
    const traitMultiplier = state.runManifest.worldTraitIds.reduce(
      (product, traitId) => product * (definition.traitWeights[traitId] ?? 1),
      1,
    );
    const count = counts[definition.id] ?? 0;
    const noveltyMultiplier = 1 / Math.sqrt(1 + count * 0.8);
    return [definition.id, definition.baseWeight * traitMultiplier * noveltyMultiplier];
  }));
}

function weightedDefinition(
  rng: RNG,
  weights: Record<string, number>,
): ScoutingSpecialEventDefinition | undefined {
  const candidates = SCOUTING_SPECIAL_EVENT_DECK
    .map((definition) => ({ definition, weight: weights[definition.id] ?? 0 }))
    .filter((candidate) => candidate.weight > 0);
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (total <= 0) return undefined;
  let threshold = rng.next() * total;
  for (const candidate of candidates) {
    threshold -= candidate.weight;
    if (threshold <= 0) return candidate.definition;
  }
  return candidates.at(-1)?.definition;
}

/** Materialize one catalog definition without consuming random state. */
export function createScoutingSpecialEvent(
  state: GameState,
  definitionId: string,
  history: SpecialEventSelectionHistory,
): NarrativeEvent | null {
  const definition = getScoutingSpecialEventDefinition(definitionId);
  if (!definition) return null;
  const context = buildContext(state, definition);
  if (!isEligible(definition, context)) return null;
  const occurrence = history.specialEventCounts?.[definition.id] ?? 0;
  return {
    id: createDeterministicRunId(
      "evt_special",
      state.runManifest.rootSeed,
      definition.id,
      state.currentSeason,
      state.currentWeek,
      occurrence,
    ),
    type: definition.type,
    specialEventId: definition.id,
    week: state.currentWeek,
    season: state.currentSeason,
    title: definition.title,
    description: definition.description(context),
    relatedIds: definition.related(context),
    acknowledged: false,
    choices: definition.options.map(({ label, effect, knownTradeoffs }) => ({
      label,
      effect,
      knownTradeoffs: [...knownTradeoffs],
    })),
    decisionDeadlineWeeks: definition.deadlineWeeks,
    defaultChoiceIndex: definition.defaultChoiceIndex,
  };
}

/** Select and materialize one deterministic, trait-sensitive special event. */
export function selectScoutingSpecialEvent(
  rng: RNG,
  state: GameState,
  history: SpecialEventSelectionHistory,
): NarrativeEvent | null {
  const weights = getSpecialEventSelectionWeights(state, history);
  const definition = weightedDefinition(rng, weights);
  return definition
    ? createScoutingSpecialEvent(state, definition.id, history)
    : null;
}

export function getScoutingSpecialEventDefinition(
  id: string | undefined,
): ScoutingSpecialEventDefinition | undefined {
  return id ? SPECIAL_EVENTS_BY_ID.get(id) : undefined;
}

function metricKey(
  metric: OutcomeMetric,
  event: NarrativeEvent,
): string {
  if (metric === "reputation") return "scout:reputation";
  if (metric === "fatigue") return "scout:fatigue";
  if (metric === "clubTrust") return "scout:clubTrust";
  if (metric === "specializationReputation") return "scout:specializationReputation";
  const contactId = event.relatedIds[0];
  return contactId ? `contact:${contactId}:trust` : "scout:clubTrust";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function relatedActor(
  state: GameState,
  event: NarrativeEvent,
  actor: SpecialEventActorKind,
): { kind: string; id: string } | undefined {
  if (actor === "contact") {
    const id = event.relatedIds.find((relatedId) => Boolean(state.contacts[relatedId]));
    return id ? { kind: "contact", id } : undefined;
  }
  if (actor === "board") {
    const id = event.relatedIds.find((relatedId) => Boolean(state.clubs[relatedId]))
      ?? state.scout.currentClubId;
    return id ? { kind: "board", id } : undefined;
  }
  if (actor === "rival") {
    const id = event.relatedIds.find((relatedId) => Boolean(state.rivalScouts[relatedId]));
    return id ? { kind: "rival", id } : undefined;
  }
  const id = event.relatedIds.find((relatedId) =>
    Boolean(state.players[relatedId])
    || Boolean(state.retiredPlayers[relatedId])
    || Object.values(state.unsignedYouth).some((candidate) => candidate.player.id === relatedId),
  );
  return id ? { kind: "family", id } : undefined;
}

function memoryEffect(input: {
  state: GameState;
  event: NarrativeEvent;
  decisionId: string;
  effect: string;
  branch: "success" | "failure";
  dueAt: { week: number; season: number };
  profile: SpecialEventMemoryProfile;
  baseId: string;
}): ConsequenceEffect | undefined {
  const stakeholder = relatedActor(input.state, input.event, input.profile.actor);
  if (!stakeholder) return undefined;
  const valence = input.branch === "success"
    ? input.profile.successValence
    : input.profile.failureValence;
  const tags = input.branch === "success"
    ? input.profile.successTags
    : input.profile.failureTags;
  return {
    id: `effect:${input.baseId}:memory`,
    type: "addMemory",
    memory: {
      id: `memory:${input.baseId}:${stakeholder.kind}:${stakeholder.id}`,
      stakeholder,
      subject: { kind: "scout", id: input.state.scout.id },
      tags: ["specialEvent", input.event.specialEventId ?? input.event.type, input.effect, ...tags],
      valence,
      intensity: Math.round(clamp(42 + Math.abs(valence) * 0.48, 38, 92)),
      salience: Math.round(clamp(48 + Math.abs(valence) * 0.5, 44, 96)),
      visibility: "stakeholders",
      createdAt: input.dueAt,
      sourceDecisionId: input.decisionId,
      halfLifeWeeks: input.profile.halfLifeWeeks ?? 52,
      metadata: {
        narrativeEventId: input.event.id,
        branch: input.branch,
        effect: input.effect,
      },
    },
  };
}

export interface SpecialEventDecisionOptionPayload {
  knownTradeoffs: string[];
  immediateEffects: ConsequenceEffect[];
  scheduledConsequences: ScheduledConsequenceTemplate[];
}

/**
 * Convert a deck option into persisted ledger effects. The hidden branch is
 * rolled from a named stream and stored on the decision before the UI opens.
 */
export function buildSpecialEventDecisionOption(
  state: GameState,
  event: NarrativeEvent,
  decisionId: string,
  effect: string,
): SpecialEventDecisionOptionPayload | undefined {
  const definition = getScoutingSpecialEventDefinition(event.specialEventId);
  const option = definition?.options.find((candidate) => candidate.effect === effect);
  if (!definition || !option) return undefined;

  const dueAt = addGameWeeks(
    state.fixtures,
    { week: event.week, season: event.season },
    option.delayed.weeks,
  );
  const outcomeRoll = createNamedRNG(
    state.runManifest.rootSeed,
    "special-event-outcome",
    event.id,
    effect,
  ).next();
  const succeeded = outcomeRoll < option.delayed.successChance;
  const delta = succeeded
    ? option.delayed.successDelta
    : option.delayed.failureDelta;
  const branch = succeeded ? "success" : "failure";
  const baseId = `${decisionId}:${definition.id}:${effect}`;
  const stakeholder = option.memory
    ? relatedActor(state, event, option.memory.actor)
    : undefined;
  const existingObligation = option.obligation && stakeholder
    ? Object.values(state.consequenceState.obligations).find((obligation) =>
        obligation.status === "active"
        && obligation.kind === option.obligation?.kind
        && obligation.debtor.kind === "scout"
        && obligation.debtor.id === state.scout.id
        && obligation.creditor.kind === stakeholder.kind
        && obligation.creditor.id === stakeholder.id
      )
    : undefined;
  const obligationId = option.obligation && stakeholder
    ? `obligation:${baseId}:${stakeholder.kind}:${stakeholder.id}`
    : undefined;
  const obligationDueAt = option.obligation
    ? addGameWeeks(
        state.fixtures,
        { week: event.week, season: event.season },
        option.obligation.dueWeeks,
      )
    : undefined;
  const actorMemoryEffect = option.memory
    ? memoryEffect({
        state,
        event,
        decisionId,
        effect,
        branch,
        dueAt,
        profile: option.memory,
        baseId,
      })
    : undefined;
  const delayedEffects: ConsequenceEffect[] = [
    {
      id: `effect:${baseId}:metric`,
      type: "adjustMetric",
      metricKey: metricKey(option.delayed.metric, event),
      delta,
      min: 0,
      max: 100,
    },
    {
      id: `effect:${baseId}:outcome-fact`,
      type: "recordFact",
      fact: {
        id: `fact:${baseId}:outcome`,
        kind: "ScoutingSpecialEventOutcome",
        subject: { kind: "narrativeEvent", id: event.id },
        value: {
          specialEventId: definition.id,
          category: definition.category,
          effect,
          branch,
          delta,
          outcomeLabel: option.delayed.outcomeLabel,
        },
        observedAt: dueAt,
        visibility: "stakeholders",
        sourceDecisionId: decisionId,
      },
    },
    ...(actorMemoryEffect ? [actorMemoryEffect] : []),
  ];

  const immediateEffects: ConsequenceEffect[] = [{
    id: `effect:${baseId}:commitment-fact`,
    type: "recordFact",
    fact: {
      id: `fact:${baseId}:committed`,
      kind: "ScoutingSpecialEventChoice",
      subject: { kind: "narrativeEvent", id: event.id },
      value: {
        specialEventId: definition.id,
        category: definition.category,
        effect,
      },
      observedAt: { week: event.week, season: event.season },
      visibility: "stakeholders",
      sourceDecisionId: decisionId,
    },
  }];
  if (
    option.obligation
    && stakeholder
    && obligationId
    && obligationDueAt
    && !existingObligation
  ) {
    immediateEffects.push({
      id: `effect:${baseId}:create-obligation`,
      type: "createObligation",
      obligation: {
        id: obligationId,
        debtor: { kind: "scout", id: state.scout.id },
        creditor: stakeholder,
        kind: option.obligation.kind,
        terms: option.obligation.terms,
        status: "active",
        createdAt: { week: event.week, season: event.season },
        dueAt: obligationDueAt,
        sourceDecisionId: decisionId,
        metadata: {
          narrativeEventId: event.id,
          specialEventId: definition.id,
        },
      },
    });
  }

  return {
    knownTradeoffs: [...option.knownTradeoffs],
    immediateEffects,
    scheduledConsequences: [{
      id: `special-outcome-${definition.id}-${effect}`,
      dueAt,
      probability: 1,
      outcomeRoll,
      tags: ["special-event", definition.category, definition.id, effect, branch],
      effects: delayedEffects,
    }],
  };
}

/** Convenience type check used by tests and future tooling. */
export function isSpecialEventDecisionOption(
  value: SpecialEventDecisionOptionPayload | undefined,
): value is Pick<DecisionOption, "knownTradeoffs" | "immediateEffects" | "scheduledConsequences"> {
  return value !== undefined;
}
