import type {
  GameState,
  NarrativeEvent,
  NarrativeEventType,
} from "@/engine/core/types";
import { addGameWeeks } from "@/engine/core/gameDate";
import type { RNG } from "@/engine/rng";
import { selectLatestReportsByCase } from "@/engine/reports/reportAccountability";
import {
  createDeterministicRunId,
  createNamedRNG,
} from "@/engine/run";
import type {
  ConsequenceEffect,
  DecisionOption,
  Obligation,
  ObligationStatus,
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
  agentId?: string;
  agentName: string;
  journalistId?: string;
  journalistName: string;
  employeeId?: string;
  employeeName: string;
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

type SpecialEventActorKind =
  | "contact"
  | "agent"
  | "journalist"
  | "employee"
  | "board"
  | "family"
  | "rival";

type RelationshipMetric = "relationship" | "trust" | "morale" | "aggressiveness";

interface SpecialEventImmediateRelationship {
  actor: SpecialEventActorKind;
  valence: number;
  tags: readonly string[];
  halfLifeWeeks?: number;
  metric?: RelationshipMetric;
  metricDelta?: number;
}

interface SpecialEventObligationStake {
  key: string;
  actor: SpecialEventActorKind;
  kind: string;
  terms: string;
  dueWeeks: number;
}

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
  /** Immediate, actor-specific reactions. Multiple parties may remember one choice differently. */
  immediateRelationships?: readonly SpecialEventImmediateRelationship[];
  /** Resolves obligations created when the conflicting requests were offered. */
  obligationResolutions?: Readonly<Record<string, Exclude<ObligationStatus, "active">>>;
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
  requires?: "player" | "contact" | "club" | "rival" | "employee";
  /** All named recurring actors must exist before the story can be selected. */
  requiresAll?: readonly SpecialEventActorKind[];
  related: (context: SpecialEventContext) => string[];
  /** Simultaneous requests materialized as real, mutually visible promises before selection. */
  obligationStakes?: readonly SpecialEventObligationStake[];
  options: readonly ScoutingSpecialEventOptionDefinition[];
}

/**
 * Scouting-centred turning points. Their choices deliberately reuse the
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
  {
    id: "relationships-family-media-embargo",
    category: "media",
    type: "journalistExpose",
    title: "Two Promises, One Story",
    description: ({ playerName, journalistName }) =>
      `${playerName}'s family has asked you to keep the prospect out of the spotlight. ` +
      `${journalistName}, a potentially valuable long-term source, needs an answer before publication. ` +
      "Either relationship can open doors later, and both will remember whose request mattered.",
    deadlineWeeks: 1,
    defaultChoiceIndex: 2,
    baseWeight: 1.05,
    traitWeights: {
      "golden-generation": 1.7,
      "trusted-circuit": 1.6,
      "scout-wars": 1.2,
    },
    requires: "player",
    requiresAll: ["family", "journalist"],
    related: ({ playerId, journalistId }) =>
      [playerId, journalistId].filter(Boolean) as string[],
    obligationStakes: [
      {
        key: "family-privacy",
        actor: "family",
        kind: "familyPrivacy",
        terms: "Keep the prospect's identity and family circumstances out of public coverage.",
        dueWeeks: 1,
      },
      {
        key: "journalist-answer",
        actor: "journalist",
        kind: "mediaAccess",
        terms: "Give a clear, timely answer before the journalist's publication deadline.",
        dueWeeks: 1,
      },
    ],
    options: [
      {
        label: "Protect the family and refuse",
        effect: "journalistRefuse",
        knownTradeoffs: [
          "Keeps a vulnerable prospect out of the public market",
          "Breaks your commitment to a journalist who may stop bringing exclusive leads",
        ],
        delayed: {
          weeks: 5,
          successChance: 0.78,
          metric: "specializationReputation",
          successDelta: 5,
          failureDelta: -2,
          outcomeLabel: "the private handling is judged by the football network",
        },
        immediateRelationships: [
          {
            actor: "family",
            valence: 72,
            tags: ["familyPrivacy", "protectedFamily", "trustedUnderPressure"],
            halfLifeWeeks: 156,
          },
          {
            actor: "journalist",
            valence: -48,
            tags: ["mediaAccess", "promiseBroken", "sourceRelationship"],
            halfLifeWeeks: 78,
            metric: "trust",
            metricDelta: -7,
          },
        ],
        obligationResolutions: {
          "family-privacy": "fulfilled",
          "journalist-answer": "breached",
        },
      },
      {
        label: "Help shape the article",
        effect: "journalistCooperate",
        knownTradeoffs: [
          "Preserves a valuable media relationship and lets you correct the story",
          "Breaks the family's privacy request and accelerates attention on the prospect",
        ],
        delayed: {
          weeks: 5,
          successChance: 0.6,
          metric: "reputation",
          successDelta: 8,
          failureDelta: -7,
          outcomeLabel: "the player's public profile settles",
        },
        immediateRelationships: [
          {
            actor: "family",
            valence: -84,
            tags: ["familyPrivacy", "exposedFamily", "promiseBroken"],
            halfLifeWeeks: 208,
          },
          {
            actor: "journalist",
            valence: 66,
            tags: ["mediaAccess", "reciprocity", "exclusiveAccess"],
            halfLifeWeeks: 104,
            metric: "trust",
            metricDelta: 8,
          },
        ],
        obligationResolutions: {
          "family-privacy": "breached",
          "journalist-answer": "fulfilled",
        },
      },
      {
        label: "Negotiate a seven-day embargo",
        effect: "journalistDelay",
        knownTradeoffs: [
          "Can respect the family while preserving a future exclusive",
          "Costs influence now and succeeds only if both parties accept the boundary",
        ],
        delayed: {
          weeks: 4,
          successChance: 0.72,
          metric: "clubTrust",
          successDelta: 3,
          failureDelta: -3,
          outcomeLabel: "the negotiated embargo holds or unravels",
        },
        immediateRelationships: [
          {
            actor: "family",
            valence: 34,
            tags: ["familyPrivacy", "negotiatedBoundary", "goodFaithAdvice"],
            halfLifeWeeks: 104,
          },
          {
            actor: "journalist",
            valence: 28,
            tags: ["mediaAccess", "negotiatedBoundary", "reciprocity"],
            halfLifeWeeks: 78,
            metric: "trust",
            metricDelta: 3,
          },
        ],
        obligationResolutions: {
          "family-privacy": "fulfilled",
          "journalist-answer": "fulfilled",
        },
      },
    ],
  },
  {
    id: "relationships-employee-agent-credit",
    category: "careerPolitics",
    type: "agentDoubleDealing",
    title: "Who Owns The Discovery?",
    description: ({ playerName, employeeName, agentName }) =>
      `${employeeName} found ${playerName} through weeks of work, but ${agentName} claims the introduction ` +
      "made the opportunity possible. Your employee expects public credit; the agent expects discretion and attribution.",
    deadlineWeeks: 2,
    defaultChoiceIndex: 2,
    baseWeight: 0.95,
    traitWeights: {
      "trusted-circuit": 1.45,
      "scout-wars": 1.35,
      "boom-bust-market": 1.15,
    },
    requires: "employee",
    requiresAll: ["employee", "agent"],
    related: ({ playerId, employeeId, agentId }) =>
      [playerId, employeeId, agentId].filter(Boolean) as string[],
    obligationStakes: [
      {
        key: "employee-credit",
        actor: "employee",
        kind: "employeeCredit",
        terms: "Recognize the employee's work and protect their ownership of the discovery.",
        dueWeeks: 2,
      },
      {
        key: "agent-attribution",
        actor: "agent",
        kind: "sourceAttribution",
        terms: "Respect the agent's claim that their introduction remains part of the opportunity.",
        dueWeeks: 2,
      },
    ],
    options: [
      {
        label: "Give your employee full credit",
        effect: "employeeCredit",
        knownTradeoffs: [
          "Builds staff loyalty and makes delegated work feel consequential",
          "The agent may withhold client access and negotiation information",
        ],
        delayed: {
          weeks: 6,
          successChance: 0.7,
          metric: "specializationReputation",
          successDelta: 6,
          failureDelta: -2,
          outcomeLabel: "the discovery-credit dispute travels through the industry",
        },
        immediateRelationships: [
          {
            actor: "employee",
            valence: 78,
            tags: ["employeeCredit", "creditedWork", "leadership"],
            halfLifeWeeks: 156,
            metric: "morale",
            metricDelta: 10,
          },
          {
            actor: "agent",
            valence: -58,
            tags: ["sourceAttribution", "creditDispute", "promiseBroken"],
            halfLifeWeeks: 104,
            metric: "trust",
            metricDelta: -8,
          },
        ],
        obligationResolutions: {
          "employee-credit": "fulfilled",
          "agent-attribution": "breached",
        },
      },
      {
        label: "Recognize the agent's introduction",
        effect: "agentCredit",
        knownTradeoffs: [
          "Protects a source who can bring future clients and private market context",
          "Your employee may stop taking initiative or become vulnerable to poaching",
        ],
        delayed: {
          weeks: 5,
          successChance: 0.66,
          metric: "clubTrust",
          successDelta: 5,
          failureDelta: -3,
          outcomeLabel: "the agent network decides whether to reciprocate",
        },
        immediateRelationships: [
          {
            actor: "employee",
            valence: -72,
            tags: ["employeeCredit", "creditDenied", "leadership"],
            halfLifeWeeks: 156,
            metric: "morale",
            metricDelta: -12,
          },
          {
            actor: "agent",
            valence: 62,
            tags: ["sourceAttribution", "reciprocity", "promiseKept"],
            halfLifeWeeks: 104,
            metric: "trust",
            metricDelta: 8,
          },
        ],
        obligationResolutions: {
          "employee-credit": "breached",
          "agent-attribution": "fulfilled",
        },
      },
      {
        label: "Document shared credit",
        effect: "sharedCredit",
        knownTradeoffs: [
          "Creates a transparent record that recognizes both contributions",
          "Neither party receives exclusive ownership and both may see it as political compromise",
        ],
        delayed: {
          weeks: 5,
          successChance: 0.82,
          metric: "reputation",
          successDelta: 3,
          failureDelta: -2,
          outcomeLabel: "the shared-attribution agreement is tested",
        },
        immediateRelationships: [
          {
            actor: "employee",
            valence: 30,
            tags: ["employeeCredit", "sharedCredit", "leadership"],
            halfLifeWeeks: 104,
            metric: "morale",
            metricDelta: 4,
          },
          {
            actor: "agent",
            valence: 24,
            tags: ["sourceAttribution", "sharedCredit", "negotiatedBoundary"],
            halfLifeWeeks: 78,
            metric: "trust",
            metricDelta: 3,
          },
        ],
        obligationResolutions: {
          "employee-credit": "fulfilled",
          "agent-attribution": "fulfilled",
        },
      },
    ],
  },
  {
    id: "relationships-rival-agent-ceasefire",
    category: "rivalConflict",
    type: "rivalPoach",
    title: "The Ceasefire Has A Price",
    description: ({ playerName, rivalName, agentName }) =>
      `${rivalName} will stop contesting two of your regional leads if you step away from ${playerName}. ` +
      `${agentName} brought you the player in confidence and expects you to act. A quiet deal with one closes trust with the other.`,
    deadlineWeeks: 1,
    defaultChoiceIndex: 2,
    baseWeight: 1,
    traitWeights: {
      "scout-wars": 2.3,
      "trusted-circuit": 1.25,
      "thin-crop": 1.35,
    },
    requires: "rival",
    requiresAll: ["rival", "agent"],
    related: ({ playerId, rivalId, agentId }) =>
      [playerId, rivalId, agentId].filter(Boolean) as string[],
    obligationStakes: [
      {
        key: "rival-ceasefire",
        actor: "rival",
        kind: "rivalNonCompete",
        terms: "Honor the proposed ceasefire and step away from the named prospect.",
        dueWeeks: 1,
      },
      {
        key: "agent-exclusive",
        actor: "agent",
        kind: "agentExclusivity",
        terms: "Act on the agent's confidential introduction before the market moves.",
        dueWeeks: 1,
      },
    ],
    options: [
      {
        label: "Accept the rival's ceasefire",
        effect: "rivalCeasefire",
        knownTradeoffs: [
          "Reduces immediate competitive pressure across several regional leads",
          "Breaks faith with the agent and abandons the named prospect",
        ],
        delayed: {
          weeks: 6,
          successChance: 0.62,
          metric: "specializationReputation",
          successDelta: 4,
          failureDelta: -5,
          outcomeLabel: "the rival tests the ceasefire",
        },
        immediateRelationships: [
          {
            actor: "rival",
            valence: 48,
            tags: ["rivalry", "ceasefire", "promiseKept"],
            halfLifeWeeks: 104,
            metric: "aggressiveness",
            metricDelta: -15,
          },
          {
            actor: "agent",
            valence: -78,
            tags: ["agentExclusivity", "promiseBroken", "abandonedLead"],
            halfLifeWeeks: 156,
            metric: "trust",
            metricDelta: -10,
          },
        ],
        obligationResolutions: {
          "rival-ceasefire": "fulfilled",
          "agent-exclusive": "breached",
        },
      },
      {
        label: "Back the agent and contest the player",
        effect: "agentContest",
        knownTradeoffs: [
          "Protects confidential access and keeps the prospect in play",
          "Turns one rival into a more aggressive long-term opponent",
        ],
        delayed: {
          weeks: 6,
          successChance: 0.56,
          metric: "reputation",
          successDelta: 9,
          failureDelta: -6,
          outcomeLabel: "the contested recruitment race resolves",
        },
        immediateRelationships: [
          {
            actor: "rival",
            valence: -72,
            tags: ["rivalry", "ceasefireRejected", "directCompetition"],
            halfLifeWeeks: 156,
            metric: "aggressiveness",
            metricDelta: 15,
          },
          {
            actor: "agent",
            valence: 70,
            tags: ["agentExclusivity", "trustedUnderPressure", "promiseKept"],
            halfLifeWeeks: 156,
            metric: "trust",
            metricDelta: 9,
          },
        ],
        obligationResolutions: {
          "rival-ceasefire": "breached",
          "agent-exclusive": "fulfilled",
        },
      },
      {
        label: "Trade a different lead for a narrow boundary",
        effect: "boundaryTrade",
        knownTradeoffs: [
          "Attempts to preserve the agent relationship without opening a wider scout war",
          "Reveals part of your pipeline and gives away a separate opportunity",
        ],
        delayed: {
          weeks: 5,
          successChance: 0.7,
          metric: "clubTrust",
          successDelta: 3,
          failureDelta: -4,
          outcomeLabel: "the negotiated competitive boundary holds or collapses",
        },
        immediateRelationships: [
          {
            actor: "rival",
            valence: 18,
            tags: ["rivalry", "negotiatedBoundary", "reciprocity"],
            halfLifeWeeks: 78,
            metric: "aggressiveness",
            metricDelta: -4,
          },
          {
            actor: "agent",
            valence: 20,
            tags: ["agentExclusivity", "negotiatedBoundary", "goodFaithAdvice"],
            halfLifeWeeks: 78,
            metric: "trust",
            metricDelta: 2,
          },
        ],
        obligationResolutions: {
          "rival-ceasefire": "fulfilled",
          "agent-exclusive": "fulfilled",
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
  occurrence: number,
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
  const preferred = contacts.filter((contact) => preferredTypes.has(contact.type));
  // Agent and journalist stories must fail closed when the named profession
  // does not exist. Discovery tips can still come from another local source.
  if (definition.requires === "contact") {
    return preferred.length > 0 ? preferred[occurrence % preferred.length] : undefined;
  }
  return preferred.length > 0
    ? preferred[occurrence % preferred.length]
    : contacts[occurrence % Math.max(1, contacts.length)];
}

function buildContext(
  state: GameState,
  definition: ScoutingSpecialEventDefinition,
  occurrence = 0,
): SpecialEventContext {
  const recentReport = selectLatestReportsByCase(Object.values(state.reports)).sort((left, right) =>
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
  const contact = contactForDefinition(state, definition, occurrence);
  const agents = Object.values(state.contacts)
    .filter((candidate) => candidate.type === "agent" || candidate.type === "youthAgent")
    .sort((left, right) => right.relationship - left.relationship || left.id.localeCompare(right.id));
  const journalists = Object.values(state.contacts)
    .filter((candidate) => candidate.type === "journalist")
    .sort((left, right) => right.relationship - left.relationship || left.id.localeCompare(right.id));
  const employees = [...(state.finances?.employees ?? [])]
    .sort((left, right) => right.morale - left.morale || left.id.localeCompare(right.id));
  const agent = agents[occurrence % Math.max(1, agents.length)];
  const journalist = journalists[occurrence % Math.max(1, journalists.length)];
  const employee = employees[occurrence % Math.max(1, employees.length)];
  const clubId = state.scout.currentClubId ?? Object.keys(state.clubs).sort()[0];
  const club = clubId ? state.clubs[clubId] : undefined;
  const rivals = Object.values(state.rivalScouts).sort((left, right) =>
    Number(right.isNemesis) - Number(left.isNemesis)
    || right.winsAgainstPlayer - left.winsAgainstPlayer
    || left.id.localeCompare(right.id),
  );
  const rival = rivals[occurrence % Math.max(1, rivals.length)];
  return {
    playerId,
    playerName: playerName(state, playerId) ?? "an overlooked prospect",
    contactId: contact?.id,
    contactName: contact?.name ?? "a well-placed intermediary",
    agentId: agent?.id,
    agentName: agent?.name ?? "a well-connected agent",
    journalistId: journalist?.id,
    journalistName: journalist?.name ?? "a trusted football journalist",
    employeeId: employee?.id,
    employeeName: employee?.name ?? "a member of your staff",
    clubId,
    clubName: club?.name ?? "a recruitment client",
    rivalId: rival?.id,
    rivalName: rival?.name ?? "a competing scout",
  };
}

function actorAvailable(
  actor: SpecialEventActorKind,
  context: SpecialEventContext,
): boolean {
  if (actor === "family") return Boolean(context.playerId);
  if (actor === "contact") return Boolean(context.contactId);
  if (actor === "agent") return Boolean(context.agentId);
  if (actor === "journalist") return Boolean(context.journalistId);
  if (actor === "employee") return Boolean(context.employeeId);
  if (actor === "board") return Boolean(context.clubId);
  return Boolean(context.rivalId);
}

function isEligible(
  definition: ScoutingSpecialEventDefinition,
  context: SpecialEventContext,
): boolean {
  const primaryEligible = !definition.requires
    || definition.requires === "player" && Boolean(context.playerId)
    || definition.requires === "contact" && Boolean(context.contactId)
    || definition.requires === "club" && Boolean(context.clubId)
    || definition.requires === "rival" && Boolean(context.rivalId)
    || definition.requires === "employee" && Boolean(context.employeeId);
  return primaryEligible
    && (definition.requiresAll ?? []).every((actor) => actorAvailable(actor, context));
}

/** Exposed for tuning tests and a future event-director diagnostics panel. */
export function getSpecialEventSelectionWeights(
  state: GameState,
  history: SpecialEventSelectionHistory,
): Record<string, number> {
  const recent = [...(history.recentSpecialEventIds ?? [])].slice(-4);
  const counts = history.specialEventCounts ?? {};
  return Object.fromEntries(SCOUTING_SPECIAL_EVENT_DECK.map((definition) => {
    const context = buildContext(state, definition, counts[definition.id] ?? 0);
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
  const occurrence = history.specialEventCounts?.[definition.id] ?? 0;
  const context = buildContext(state, definition, occurrence);
  if (!isEligible(definition, context)) return null;
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
  state: GameState,
): string {
  if (metric === "reputation") return "scout:reputation";
  if (metric === "fatigue") return "scout:fatigue";
  if (metric === "clubTrust") return "scout:clubTrust";
  if (metric === "specializationReputation") return "scout:specializationReputation";
  const contactId = event.relatedIds.find((id) => Boolean(state.contacts[id]));
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
  if (actor === "contact" || actor === "agent" || actor === "journalist") {
    const id = event.relatedIds.find((relatedId) => {
      const contact = state.contacts[relatedId];
      if (!contact) return false;
      if (actor === "agent") return contact.type === "agent" || contact.type === "youthAgent";
      if (actor === "journalist") return contact.type === "journalist";
      return true;
    });
    return id ? { kind: "contact", id } : undefined;
  }
  if (actor === "employee") {
    const employeeIds = new Set((state.finances?.employees ?? []).map((employee) => employee.id));
    const id = event.relatedIds.find((relatedId) => employeeIds.has(relatedId));
    return id ? { kind: "employee", id } : undefined;
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

function relationshipMetricKey(
  stakeholder: { kind: string; id: string },
  metric: RelationshipMetric,
): string | undefined {
  if (stakeholder.kind === "contact" && (metric === "relationship" || metric === "trust")) {
    return `contact:${stakeholder.id}:${metric}`;
  }
  if (stakeholder.kind === "employee" && metric === "morale") {
    return `employee:${stakeholder.id}:morale`;
  }
  if (stakeholder.kind === "rival" && metric === "aggressiveness") {
    return `rival:${stakeholder.id}:aggressiveness`;
  }
  return undefined;
}

function immediateRelationshipEffects(input: {
  state: GameState;
  event: NarrativeEvent;
  decisionId: string;
  effect: string;
  baseId: string;
  relationships: readonly SpecialEventImmediateRelationship[];
}): ConsequenceEffect[] {
  return input.relationships.flatMap((relationship, index) => {
    const stakeholder = relatedActor(input.state, input.event, relationship.actor);
    if (!stakeholder) return [];
    const relationshipId = `${input.baseId}:relationship:${relationship.actor}:${index}`;
    const effects: ConsequenceEffect[] = [{
      id: `effect:${relationshipId}:memory`,
      type: "addMemory",
      memory: {
        id: `memory:${relationshipId}:${stakeholder.kind}:${stakeholder.id}`,
        stakeholder,
        subject: { kind: "scout", id: input.state.scout.id },
        tags: [
          "specialEvent",
          "relationshipConflict",
          input.event.specialEventId ?? input.event.type,
          input.effect,
          ...relationship.tags,
        ],
        valence: relationship.valence,
        intensity: Math.round(clamp(48 + Math.abs(relationship.valence) * 0.42, 42, 94)),
        salience: Math.round(clamp(56 + Math.abs(relationship.valence) * 0.4, 50, 96)),
        visibility: "stakeholders",
        createdAt: { week: input.event.week, season: input.event.season },
        sourceDecisionId: input.decisionId,
        halfLifeWeeks: relationship.halfLifeWeeks ?? 78,
        metadata: {
          narrativeEventId: input.event.id,
          effect: input.effect,
          actor: relationship.actor,
        },
      },
    }];
    const metricKey = relationship.metric
      ? relationshipMetricKey(stakeholder, relationship.metric)
      : undefined;
    if (metricKey && relationship.metricDelta) {
      effects.push({
        id: `effect:${relationshipId}:metric`,
        type: "adjustMetric",
        metricKey,
        delta: relationship.metricDelta,
        min: 0,
        max: 100,
      });
    }
    return effects;
  });
}

function obligationStakeId(
  decisionId: string,
  stake: SpecialEventObligationStake,
  stakeholder: { kind: string; id: string },
): string {
  return `obligation:${decisionId}:${stake.key}:${stakeholder.kind}:${stakeholder.id}`;
}

/**
 * Materialize the simultaneous requests attached to a relationship conflict.
 * They exist while the choice is open, so timing out is an accountable action
 * rather than a way to avoid either stakeholder.
 */
export function buildSpecialEventOfferObligations(
  state: GameState,
  event: NarrativeEvent,
  decisionId: string,
): Record<string, Obligation> {
  const definition = getScoutingSpecialEventDefinition(event.specialEventId);
  if (!definition?.obligationStakes?.length) return {};
  return Object.fromEntries(definition.obligationStakes.flatMap((stake) => {
    const creditor = relatedActor(state, event, stake.actor);
    if (!creditor) return [];
    const id = obligationStakeId(decisionId, stake, creditor);
    return [[id, {
      id,
      debtor: { kind: "scout", id: state.scout.id },
      creditor,
      kind: stake.kind,
      terms: stake.terms,
      status: "active" as const,
      createdAt: { week: event.week, season: event.season },
      dueAt: addGameWeeks(
        state.fixtures,
        { week: event.week, season: event.season },
        stake.dueWeeks,
      ),
      sourceDecisionId: decisionId,
      metadata: {
        narrativeEventId: event.id,
        specialEventId: event.specialEventId ?? "",
        stakeKey: stake.key,
        conflict: true,
      },
    } satisfies Obligation]];
  }));
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
      metricKey: metricKey(option.delayed.metric, event, state),
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
  }, ...immediateRelationshipEffects({
    state,
    event,
    decisionId,
    effect,
    baseId,
    relationships: option.immediateRelationships ?? [],
  })];
  const offeredObligations = buildSpecialEventOfferObligations(state, event, decisionId);
  for (const [stakeKey, status] of Object.entries(option.obligationResolutions ?? {})) {
    const obligation = Object.values(offeredObligations).find(
      (candidate) => candidate.metadata?.stakeKey === stakeKey,
    );
    if (!obligation) continue;
    immediateEffects.push({
      id: `effect:${baseId}:resolve-obligation:${stakeKey}`,
      type: "transitionObligation",
      obligationId: obligation.id,
      status,
      note: `Resolved by ${event.title}: ${option.label}`,
    });
  }
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
