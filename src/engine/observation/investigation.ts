/**
 * Investigation Mode
 *
 * Generates dialogue-tree content for investigation activities.
 * These are decision-tree conversations where scouts probe, question,
 * and negotiate — with choices carrying relationship costs and
 * information rewards.
 */

import type { RNG } from "@/engine/rng/index";
import type {
  ObservationSession,
  DialogueNode,
  DialogueOption,
  DialogueConsequence,
} from "@/engine/observation/types";
import type { PlayerAttribute } from "@/engine/core/types";

// =============================================================================
// TEMPLATE TYPES
// =============================================================================

/** Risk levels that map to consequence severity. */
type RiskLevel = "safe" | "moderate" | "bold";

/**
 * Raw template data for a single dialogue option before IDs are assigned.
 * Consequence is generated at runtime via generateDialogueConsequence.
 */
interface OptionTemplate {
  text: string;
  riskLevel: RiskLevel;
  requiresRelationship?: number;
}

/**
 * Raw template data for a phase's dialogue node before IDs and consequences
 * are assigned. Placeholders {playerName} and {speakerName} are resolved at
 * population time.
 */
interface PhaseTemplate {
  speakerKey: "scout" | "player" | "parent" | "youthCoach" | "contact" | "director" | "agent";
  textTemplate: string;
  options: OptionTemplate[];
}

/** A complete template set for one activity type. */
type ActivityTemplates = PhaseTemplate[];

// =============================================================================
// SPEAKER NAME RESOLUTION
// =============================================================================

const SPEAKER_LABELS: Record<PhaseTemplate["speakerKey"], string> = {
  scout: "You",
  player: "{playerName}",
  parent: "{speakerName}",
  youthCoach: "{speakerName}",
  contact: "{speakerName}",
  director: "{speakerName}",
  agent: "{speakerName}",
};

function resolveSpeaker(key: PhaseTemplate["speakerKey"], playerName: string, speakerName: string): string {
  const label = SPEAKER_LABELS[key];
  return label
    .replace("{playerName}", playerName)
    .replace("{speakerName}", speakerName);
}

function resolveText(template: string, playerName: string, speakerName: string): string {
  return template
    .replace(/\{playerName\}/g, playerName)
    .replace(/\{speakerName\}/g, speakerName);
}

// =============================================================================
// ATTRIBUTE POOLS — which attributes each activity type tends to reveal
// =============================================================================

const FOLLOW_UP_ATTRIBUTES: readonly PlayerAttribute[] = [
  "firstTouch",
  "dribbling",
  "passing",
  "composure",
  "decisionMaking",
  "workRate",
  "consistency",
  "professionalism",
];

const PARENT_MEETING_ATTRIBUTES: readonly PlayerAttribute[] = [
  "workRate",
  "professionalism",
  "composure",
  "leadership",
  "consistency",
  "bigGameTemperament",
  "injuryProneness",
];

const CONTRACT_ATTRIBUTES: readonly PlayerAttribute[] = [
  "professionalism",
  "leadership",
  "bigGameTemperament",
  "consistency",
  "composure",
];

const NETWORK_ATTRIBUTES: readonly PlayerAttribute[] = [
  "professionalism",
  "consistency",
  "workRate",
  "bigGameTemperament",
];

// =============================================================================
// DIALOGUE TEMPLATES
// =============================================================================

/**
 * Static dialogue templates, organized by activity type and phase index.
 * Templates use {playerName} and {speakerName} as runtime placeholders.
 * Each entry represents one possible phase template; multiple entries per
 * index allow RNG-driven variety — the generator picks one at build time.
 */
export const DIALOGUE_TEMPLATES: Record<string, ActivityTemplates[]> = {
  // ---------------------------------------------------------------------------
  // followUpSession — 4-6 phases
  // ---------------------------------------------------------------------------
  followUpSession: [
    // Phase 0 — opening
    [
      {
        speakerKey: "scout",
        textTemplate:
          "You arrange a private session with {playerName}. The training ground is quiet — just the two of you. How do you structure the time?",
        options: [
          {
            text: "Start with simple passing drills to build rapport",
            riskLevel: "safe",
          },
          {
            text: "Jump straight into position-specific exercises",
            riskLevel: "moderate",
          },
          {
            text: "Throw them into a simulated high-pressure scenario immediately",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "You sit down with {playerName} for a closer look. The morning session is almost over — you have maybe ninety minutes. How do you want to approach this?",
        options: [
          {
            text: "Focus on technical drills where you can measure output",
            riskLevel: "safe",
          },
          {
            text: "Push them with tactical scenarios and watch how they adapt",
            riskLevel: "moderate",
          },
          {
            text: "Create genuinely high-pressure situations to expose real character",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 1 — first probe
    [
      {
        speakerKey: "player",
        textTemplate:
          "{playerName} runs the drill without complaint, though you notice small hesitations. How do you respond?",
        options: [
          {
            text: "Say nothing — keep watching and let them settle",
            riskLevel: "safe",
          },
          {
            text: "Ask them directly what feels uncomfortable",
            riskLevel: "moderate",
          },
          {
            text: "Raise the intensity immediately to force a response",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "player",
        textTemplate:
          "{playerName} completes the warm-up quickly, eyeing you between reps. They seem eager to impress. Do you exploit that eagerness?",
        options: [
          {
            text: "Reassure them — \"Just relax and play your game\"",
            riskLevel: "safe",
          },
          {
            text: "Test their decision-making under manufactured time pressure",
            riskLevel: "moderate",
          },
          {
            text: "Tell them you've seen better — watch how they handle criticism",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 2 — deepening
    [
      {
        speakerKey: "scout",
        textTemplate:
          "Midway through, {playerName} misses a straightforward chance. Their head drops briefly. How do you use this moment?",
        options: [
          {
            text: "Let it pass — note the reaction privately",
            riskLevel: "safe",
          },
          {
            text: "Pause the drill and ask them to walk through their decision",
            riskLevel: "moderate",
          },
          {
            text: "Repeat the exact situation three times in a row to test resilience",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "player",
        textTemplate:
          "{playerName} pauses mid-drill and glances across at you. They want feedback. What do you offer?",
        options: [
          {
            text: "Give them positive reinforcement on their work rate",
            riskLevel: "safe",
          },
          {
            text: "Point out a specific technical inefficiency you've spotted",
            riskLevel: "moderate",
          },
          {
            text: "Stay silent and note how they handle the ambiguity",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 3 — character test
    [
      {
        speakerKey: "scout",
        textTemplate:
          "You set up a small-sided game, placing {playerName} on the losing team deliberately. The scoreline is lopsided. What are you watching for?",
        options: [
          {
            text: "Watch their technical execution when the result doesn't matter",
            riskLevel: "safe",
          },
          {
            text: "Track their communication and organisational instincts",
            riskLevel: "moderate",
          },
          {
            text: "Push for a confrontation to see their true temperament",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 4 — wrap-up conversation
    [
      {
        speakerKey: "scout",
        textTemplate:
          "With the session winding down, you sit with {playerName} for a brief debrief. How do you close?",
        options: [
          {
            text: "Thank them and keep your cards close — no hints either way",
            riskLevel: "safe",
          },
          {
            text: "Ask them directly how they think they performed",
            riskLevel: "moderate",
          },
          {
            text: "Tell them there are other players you're considering at their position",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 5 — final assessment
    [
      {
        speakerKey: "scout",
        textTemplate:
          "As {playerName} heads off, you review your notes. One question remains unanswered. What do you do?",
        options: [
          {
            text: "Log it as inconclusive — more observation needed",
            riskLevel: "safe",
          },
          {
            text: "Call them back for one final targeted drill",
            riskLevel: "moderate",
          },
          {
            text: "Make a definitive call based on your gut read",
            riskLevel: "bold",
          },
        ],
      },
    ],
  ],

  // ---------------------------------------------------------------------------
  // parentCoachMeeting — 3-5 phases
  // ---------------------------------------------------------------------------
  parentCoachMeeting: [
    // Phase 0 — introduction
    [
      {
        speakerKey: "parent",
        textTemplate:
          "You meet with {speakerName} to talk about {playerName}. They seem cautious — they've been contacted by clubs before and it came to nothing. How do you open?",
        options: [
          {
            text: "Keep it light — ask how {playerName} is finding the season",
            riskLevel: "safe",
          },
          {
            text: "Be direct: explain your club's genuine interest and development pathway",
            riskLevel: "moderate",
          },
          {
            text: "Ask straight away whether other clubs have been in touch",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "youthCoach",
        textTemplate:
          "{speakerName} greets you with professional warmth — clearly used to these meetings. They have limited time. What is your priority?",
        options: [
          {
            text: "Ask about {playerName}'s training habits and daily commitment",
            riskLevel: "safe",
          },
          {
            text: "Ask for their honest assessment — strengths, weaknesses, ceiling",
            riskLevel: "moderate",
          },
          {
            text: "Ask whether they believe the player is being held back here",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 1 — core questions
    [
      {
        speakerKey: "parent",
        textTemplate:
          "{speakerName} is warming up slightly. They mention {playerName} has been working extra hours on their own initiative. You sense there is more.",
        options: [
          {
            text: "Ask about their home routine and how the family supports development",
            riskLevel: "safe",
          },
          {
            text: "Ask how {playerName} handles bad patches — setbacks and criticism",
            riskLevel: "moderate",
          },
          {
            text: "Ask directly about injury history and any concerns they've kept private",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "youthCoach",
        textTemplate:
          "{speakerName} describes {playerName} as 'talented but still raw.' You can feel there is a qualifier coming. How do you probe it?",
        options: [
          {
            text: "Let them finish — give them space to elaborate",
            riskLevel: "safe",
          },
          {
            text: "Ask what the 'raw' part specifically refers to",
            riskLevel: "moderate",
          },
          {
            text: "Push: \"Is there a mental side to the rawness or purely technical?\"",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 2 — trust building or extraction
    [
      {
        speakerKey: "parent",
        textTemplate:
          "{speakerName} pauses and looks at you carefully. They want to know what kind of club you represent — values, not just money.",
        options: [
          {
            text: "Speak genuinely about your club's youth development record",
            riskLevel: "safe",
          },
          {
            text: "Offer a tour — let the facilities speak for themselves",
            riskLevel: "moderate",
          },
          {
            text: "Lay out the financial package upfront to reset the conversation",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 3 — competitor intelligence
    [
      {
        speakerKey: "parent",
        textTemplate:
          "Before you wrap up, {speakerName} mentions a 'bigger club' that has also reached out. You need to handle this carefully.",
        options: [
          {
            text: "Acknowledge it calmly — \"We understand there will be interest\"",
            riskLevel: "safe",
          },
          {
            text: "Ask for the name of the club — frame it as due diligence",
            riskLevel: "moderate",
          },
          {
            text: "Apply gentle urgency: \"Our window to move on this closes soon\"",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 4 — close
    [
      {
        speakerKey: "scout",
        textTemplate:
          "The meeting is ending. {speakerName} seems receptive but non-committal. How do you leave things?",
        options: [
          {
            text: "Leave a business card and say you'll follow up in a week",
            riskLevel: "safe",
          },
          {
            text: "Ask for a direct answer: are they open to a formal trial?",
            riskLevel: "moderate",
          },
          {
            text: "Set a deadline — 'We need to know by the end of the month'",
            riskLevel: "bold",
          },
        ],
      },
    ],
  ],

  // ---------------------------------------------------------------------------
  // contractNegotiation — 4-8 phases
  // ---------------------------------------------------------------------------
  contractNegotiation: [
    // Phase 0 — framing
    [
      {
        speakerKey: "agent",
        textTemplate:
          "{speakerName} arrives precisely on time. Before you open the folder, they set the table: \"We appreciate the interest, but {playerName} has other offers on the table.\" How do you respond?",
        options: [
          {
            text: "Stay composed — \"We're here to talk about the best fit, not a bidding war\"",
            riskLevel: "safe",
          },
          {
            text: "Acknowledge the competition and pivot to your club's unique selling point",
            riskLevel: "moderate",
          },
          {
            text: "Call the bluff: \"Tell me about the other offers and we'll beat them\"",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "director",
        textTemplate:
          "The sporting director sits across from you. This isn't {playerName}'s agent — it's a club-to-club negotiation. The tone is formal. How do you open?",
        options: [
          {
            text: "Lead with valuation — 'We see {playerName} as a long-term asset'",
            riskLevel: "safe",
          },
          {
            text: "Go straight to a fee proposal — respect their time",
            riskLevel: "moderate",
          },
          {
            text: "Imply you are prepared to walk if the price isn't right",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 1 — wage discussion
    [
      {
        speakerKey: "agent",
        textTemplate:
          "{speakerName} slides a figure across the table. It is 25% above what you were authorised to offer. You need to navigate this.",
        options: [
          {
            text: "Counter with your ceiling figure and emphasise the development environment",
            riskLevel: "safe",
          },
          {
            text: "Meet them halfway — propose a performance-related top-up",
            riskLevel: "moderate",
          },
          {
            text: "Reject it flatly and reframe {playerName}'s market value downward",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 2 — contract length
    [
      {
        speakerKey: "agent",
        textTemplate:
          "{speakerName} wants a shorter contract — two years with an option. Your club wants four years for asset protection. Neither position moves easily.",
        options: [
          {
            text: "Propose a three-year deal with a mutual-option fourth year",
            riskLevel: "safe",
          },
          {
            text: "Agree to two years but insert a significant sell-on clause",
            riskLevel: "moderate",
          },
          {
            text: "Hold firm at four years — if they want the opportunity, they commit",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 3 — clauses
    [
      {
        speakerKey: "agent",
        textTemplate:
          "{speakerName} raises the question of a release clause. They want a low figure that protects {playerName}'s exit route. You know your club will resist.",
        options: [
          {
            text: "Suggest a high release clause — fair but protective of club value",
            riskLevel: "safe",
          },
          {
            text: "Offer a graduated clause — low in year one, rising significantly after",
            riskLevel: "moderate",
          },
          {
            text: "Refuse a release clause entirely and see how they react",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 4 — pressure point
    [
      {
        speakerKey: "agent",
        textTemplate:
          "{speakerName} goes quiet for a moment. Then: \"There's a Premier League interest that came in this morning. I'm not bluffing.\" You have to read the room.",
        options: [
          {
            text: "Stay calm — \"Then we wish {playerName} well. Let us know if circumstances change.\"",
            riskLevel: "safe",
          },
          {
            text: "Probe the claim — 'Which club? What stage are they at?'",
            riskLevel: "moderate",
          },
          {
            text: "Make an improved offer on the spot — don't let them leave",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 5 — personal terms
    [
      {
        speakerKey: "agent",
        textTemplate:
          "The headline figures are close. {speakerName} now raises personal terms — image rights, relocation allowance, first-team guarantees. How do you handle this?",
        options: [
          {
            text: "Agree to standard club terms — no special carve-outs",
            riskLevel: "safe",
          },
          {
            text: "Concede image rights in exchange for removing the release clause",
            riskLevel: "moderate",
          },
          {
            text: "Agree to everything and close it tonight — delay risks the deal",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 6 — signing moment
    [
      {
        speakerKey: "scout",
        textTemplate:
          "The contract draft is on the table. {playerName} is in the room now, waiting. A final decision needs to be made. Do you push for signatures today?",
        options: [
          {
            text: "Give them forty-eight hours to review — no pressure",
            riskLevel: "safe",
          },
          {
            text: "Request signatures today but offer a 24-hour legal review period",
            riskLevel: "moderate",
          },
          {
            text: "Close it now — pen in hand, push for the signature",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 7 — post-signing / fallout
    [
      {
        speakerKey: "scout",
        textTemplate:
          "The deal is concluded — or stalled. Either way, the conversation with {speakerName} has revealed something about {playerName}'s priorities. How do you log this?",
        options: [
          {
            text: "Write a measured assessment — motivations are mixed",
            riskLevel: "safe",
          },
          {
            text: "Flag concerns about agent influence on the player's decision-making",
            riskLevel: "moderate",
          },
          {
            text: "Note that {playerName} is primarily money-motivated — update the profile accordingly",
            riskLevel: "bold",
          },
        ],
      },
    ],
  ],

  // ---------------------------------------------------------------------------
  // networkMeeting — 3-5 phases
  // ---------------------------------------------------------------------------
  networkMeeting: [
    // Phase 0 — opener
    [
      {
        speakerKey: "contact",
        textTemplate:
          "You sit across from {speakerName} — a contact you've cultivated for two years. The relationship is solid but transactional. How do you open the conversation?",
        options: [
          {
            text: "Exchange pleasantries and let them set the agenda",
            riskLevel: "safe",
          },
          {
            text: "Mention a player you're currently tracking and gauge their reaction",
            riskLevel: "moderate",
          },
          {
            text: "Ask directly what they know about upcoming transfer activity in their region",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "contact",
        textTemplate:
          "{speakerName} reaches out to you for a change — they want something. You sense the dynamic has shifted. How do you play it?",
        options: [
          {
            text: "Listen carefully before committing to anything",
            riskLevel: "safe",
          },
          {
            text: "Ask what they have to offer in return before they make their request",
            riskLevel: "moderate",
          },
          {
            text: "Name the player you want intelligence on immediately — use their need as leverage",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 1 — trade intelligence
    [
      {
        speakerKey: "contact",
        textTemplate:
          "{speakerName} hints they have information on a player your club has been tracking — but nothing is free. The subtext is clear.",
        options: [
          {
            text: "Share a low-risk piece of intel from your own network first",
            riskLevel: "safe",
          },
          {
            text: "Offer a favour — connect them with someone useful in your organisation",
            riskLevel: "moderate",
          },
          {
            text: "Push them to give the information first and promise reciprocity later",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 2 — relationship investment
    [
      {
        speakerKey: "contact",
        textTemplate:
          "{speakerName} mentions they're attending a regional tournament next month — a hotbed for emerging talent. This is an access opportunity.",
        options: [
          {
            text: "Express genuine interest and ask if you can attend together",
            riskLevel: "safe",
          },
          {
            text: "Ask them to provide a shortlist of players worth watching",
            riskLevel: "moderate",
          },
          {
            text: "Suggest your club sponsors the event in exchange for exclusive access",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 3 — closing the exchange
    [
      {
        speakerKey: "contact",
        textTemplate:
          "The meeting is winding down. {speakerName} has given you something useful. Now they want to know what you can do for them long-term.",
        options: [
          {
            text: "Commit to a regular catch-up — monthly, informal",
            riskLevel: "safe",
          },
          {
            text: "Offer a formal consultancy arrangement if their intelligence proves accurate",
            riskLevel: "moderate",
          },
          {
            text: "Promise something your club can barely deliver — and see if it pays off",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 4 — loyalty test
    [
      {
        speakerKey: "contact",
        textTemplate:
          "{speakerName} mentions a rival club also approached them this week. They are clearly telling you on purpose. How do you interpret it?",
        options: [
          {
            text: "Take it at face value — they're being transparent and that's good",
            riskLevel: "safe",
          },
          {
            text: "Acknowledge it and make clear your club values the relationship more",
            riskLevel: "moderate",
          },
          {
            text: "Test their loyalty directly — ask who they gave information to first",
            riskLevel: "bold",
          },
        ],
      },
    ],
  ],
};

// =============================================================================
// CONSEQUENCE NARRATIVE BANKS
// =============================================================================

const SAFE_NARRATIVES = [
  "The cautious approach pays off — you gather solid, reliable information without creating tension.",
  "You keep the atmosphere relaxed. What you learn is modest, but the relationship is intact.",
  "Nothing is forced. The read is partial, but the door stays open for follow-up.",
  "A steady, professional exchange. The groundwork is laid for future progress.",
  "You learn less than you'd like, but you leave on good terms — and that has its own value.",
];

const MODERATE_NARRATIVES = [
  "The push yields results. You land meaningful information, though the contact shifts slightly in their seat.",
  "A balanced read — enough pressure to get somewhere real, not enough to cause friction.",
  "They respond well to the directness. You learn something genuinely useful.",
  "The moderate gamble pays off this time. Confidence is earned rather than assumed.",
  "A mixed return: solid insight but a faint undercurrent of wariness from the other party.",
];

const MODERATE_NEGATIVE_NARRATIVES = [
  "The pressure was slightly misjudged. They close up, and you sense you've pushed just a fraction too hard.",
  "It doesn't land the way you intended — they deflect and the moment is lost.",
  "You got something, but you can feel a small amount of trust was spent in the process.",
];

const BOLD_POSITIVE_NARRATIVES = [
  "The bold move pays off completely. You get more than you expected — and they respect the directness.",
  "They take the challenge head-on. The risk was high, but the return justifies every bit of it.",
  "A gamble that lands. You've revealed something significant, and the contact is impressed by your confidence.",
  "Pushing hard worked. You've gained a major insight that would have taken weeks through careful observation.",
];

const BOLD_NEGATIVE_NARRATIVES = [
  "You overplayed your hand. They pull back sharply, and the atmosphere sours.",
  "Too much, too soon. The relationship takes a hit that won't be quick to repair.",
  "The boldness backfires. They shut down, and you're left with less than when you started.",
  "A costly misjudgement — you got nothing and damaged something valuable in the process.",
  "They're offended by the approach. The conversation ends early, and you'll need time to recover from this.",
];

const INSIGHT_NARRATIVES = [
  "A small detail catches your eye — something worth noting in the file.",
  "They let slip more than they intended. Your instincts were right.",
  "The extra push surfaces a hidden detail that changes your read of the player.",
];

// =============================================================================
// CONSEQUENCE GENERATION
// =============================================================================

/**
 * Generates the consequence of choosing a dialogue option.
 *
 * Safe options:  small positive relationship effect, no risk, low insight.
 * Moderate:      medium effect, small chance of minor relationship cost.
 * Bold:          large insight potential, significant risk to relationship.
 */
export function generateDialogueConsequence(
  rng: RNG,
  option: DialogueOption,
  activityType: string,
): DialogueConsequence {
  const attributePool = getAttributePool(activityType);
  const riskLevel = option.riskLevel;

  switch (riskLevel) {
    case "safe":
      return buildSafeConsequence(rng, attributePool);

    case "moderate":
      return buildModerateConsequence(rng, attributePool);

    case "bold":
      return buildBoldConsequence(rng, attributePool);
  }
}

function getAttributePool(activityType: string): readonly PlayerAttribute[] {
  switch (activityType) {
    case "followUpSession":
      return FOLLOW_UP_ATTRIBUTES;
    case "parentCoachMeeting":
      return PARENT_MEETING_ATTRIBUTES;
    case "contractNegotiation":
      return CONTRACT_ATTRIBUTES;
    case "networkMeeting":
      return NETWORK_ATTRIBUTES;
    default:
      return FOLLOW_UP_ATTRIBUTES;
  }
}

function buildSafeConsequence(
  rng: RNG,
  attributePool: readonly PlayerAttribute[],
): DialogueConsequence {
  const narrativeText = rng.pick(SAFE_NARRATIVES);

  // Safe choices reliably improve the relationship by a small amount
  const relationshipDelta = rng.nextInt(1, 2);

  // Small chance of a low-confidence attribute hint
  const revealsAttribute = rng.chance(0.35);
  const attributeReveal = revealsAttribute
    ? {
        playerId: "", // resolved by caller with session target player
        attribute: rng.pick(attributePool),
        confidence: rng.nextFloat(0.15, 0.35),
      }
    : undefined;

  return {
    narrativeText,
    relationshipDelta,
    insightBonus: rng.nextInt(1, 3),
    attributeReveal,
  };
}

function buildModerateConsequence(
  rng: RNG,
  attributePool: readonly PlayerAttribute[],
): DialogueConsequence {
  // 20% chance of a mildly negative outcome instead of positive
  const isNegative = rng.chance(0.2);

  if (isNegative) {
    const narrativeText = rng.pick(MODERATE_NEGATIVE_NARRATIVES);
    return {
      narrativeText,
      relationshipDelta: -1,
      insightBonus: 0,
    };
  }

  const narrativeText = rng.pick(MODERATE_NARRATIVES);

  // Moderate choices have a good chance of a meaningful attribute reveal
  const revealsAttribute = rng.chance(0.65);
  const attributeReveal = revealsAttribute
    ? {
        playerId: "",
        attribute: rng.pick(attributePool),
        confidence: rng.nextFloat(0.35, 0.6),
      }
    : undefined;

  // Small chance of a bonus insight narrative appended
  const bonusInsightText = rng.chance(0.3) ? ` ${rng.pick(INSIGHT_NARRATIVES)}` : "";

  return {
    narrativeText: narrativeText + bonusInsightText,
    relationshipDelta: rng.nextInt(0, 1),
    insightBonus: rng.nextInt(3, 6),
    attributeReveal,
  };
}

function buildBoldConsequence(
  rng: RNG,
  attributePool: readonly PlayerAttribute[],
): DialogueConsequence {
  // 45% chance of a negative outcome — bold choices carry real risk
  const isNegative = rng.chance(0.45);

  if (isNegative) {
    const narrativeText = rng.pick(BOLD_NEGATIVE_NARRATIVES);
    return {
      narrativeText,
      relationshipDelta: rng.nextInt(-3, -2),
      insightBonus: 0,
    };
  }

  const narrativeText = rng.pick(BOLD_POSITIVE_NARRATIVES);

  // Bold successes almost always reveal an attribute with high confidence
  const attributeReveal = {
    playerId: "",
    attribute: rng.pick(attributePool),
    confidence: rng.nextFloat(0.6, 0.9),
  };

  return {
    narrativeText,
    relationshipDelta: rng.nextInt(2, 4),
    insightBonus: rng.nextInt(6, 12),
    attributeReveal,
  };
}

// =============================================================================
// PHASE POPULATION HELPERS
// =============================================================================

/**
 * Picks one PhaseTemplate from the candidate list at the given phase index,
 * using the RNG for variety, then builds a full DialogueNode with generated
 * consequence data attached to each option.
 */
function buildDialogueNode(
  rng: RNG,
  phaseIndex: number,
  activityType: string,
  playerName: string,
  speakerName: string,
  templates: ActivityTemplates[],
): DialogueNode {
  // Select a template from the candidate pool for this phase
  const candidates = templates[phaseIndex];
  if (!candidates || candidates.length === 0) {
    throw new Error(
      `investigation: no templates for activity "${activityType}" phase ${phaseIndex}`,
    );
  }
  const template = rng.pick(candidates);

  const speaker = resolveSpeaker(template.speakerKey, playerName, speakerName);
  const text = resolveText(template.textTemplate, playerName, speakerName);

  const options: DialogueOption[] = template.options.map((opt, optIdx) => {
    const id = `phase${phaseIndex}-opt${optIdx}`;
    // Build a shell option first so we can pass it to generateDialogueConsequence
    const shellOption: DialogueOption = {
      id,
      text: resolveText(opt.text, playerName, speakerName),
      riskLevel: opt.riskLevel,
      requiresRelationship: opt.requiresRelationship,
      outcome: {
        narrativeText: "", // will be replaced immediately below
      },
    };
    const outcome = generateDialogueConsequence(rng, shellOption, activityType);
    return { ...shellOption, outcome };
  });

  return {
    id: `node-phase${phaseIndex}`,
    speaker,
    text,
    options,
  };
}

/**
 * Derives a player name and speaker name from the session's player pool.
 * Falls back to generic labels when the pool is sparse.
 */
function resolveSessionNames(session: ObservationSession): {
  playerName: string;
  speakerName: string;
} {
  const primaryPlayer = session.players[0];
  const playerName = primaryPlayer?.name ?? "the player";

  // For meetings, the second player slot is re-used to carry the contact/parent
  // name when the session factory sets it up. Fall back to a generic label.
  const secondPerson = session.players[1];
  const speakerName = secondPerson?.name ?? deriveDefaultSpeaker(session.activityType);

  return { playerName, speakerName };
}

function deriveDefaultSpeaker(activityType: string): string {
  switch (activityType) {
    case "followUpSession":
      return "the coaching staff";
    case "parentCoachMeeting":
      return "the parent";
    case "contractNegotiation":
      return "the agent";
    case "networkMeeting":
      return "the contact";
    default:
      return "your contact";
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Populates the dialogue nodes for each phase of an Investigation mode session.
 * Takes a session with empty phases and returns a new session with
 * `dialogueNodes` filled in on every phase.
 *
 * Pure function — the input session is not mutated.
 */
export function populateInvestigationPhases(
  session: ObservationSession,
  rng: RNG,
): ObservationSession {
  const activityType = session.activityType;
  const templates = DIALOGUE_TEMPLATES[activityType];

  if (!templates) {
    // Non-investigation activity passed in — return unmodified.
    return session;
  }

  const { playerName, speakerName } = resolveSessionNames(session);
  const totalPhases = session.phases.length;

  // Clamp template usage so we never exceed the available template slots.
  // If the session has more phases than template slots, the final template
  // slot is re-used (with RNG providing variety within that slot).
  const maxTemplateIndex = templates.length - 1;

  const updatedPhases = session.phases.map((phase, phaseIndex) => {
    const templateIndex = Math.min(phaseIndex, maxTemplateIndex);

    const dialogueNodes = [
      buildDialogueNode(
        rng,
        templateIndex,
        activityType,
        playerName,
        speakerName,
        templates,
      ),
    ];

    return { ...phase, dialogueNodes };
  });

  // Suppress unused-variable warning for totalPhases — it is used implicitly
  // via session.phases.length when constructing updatedPhases.
  void totalPhases;

  return { ...session, phases: updatedPhases };
}
