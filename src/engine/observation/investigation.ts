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
import {
  CONTENT_SCHEMA_VERSION,
  defineContentPack,
  hasNonBlankString,
  type ContentValidationIssue,
} from "@/engine/content/contracts";
import { resolveCareerPathText } from "@/engine/utils/textResolution";

// =============================================================================
// TEMPLATE TYPES
// =============================================================================

/** Risk levels that map to consequence severity. */
type RiskLevel = "safe" | "moderate" | "bold";

export type InvestigationConsequenceNarrativeCategory =
  | "safe"
  | "moderate"
  | "moderate-negative"
  | "bold-positive"
  | "bold-negative"
  | "insight";

export interface InvestigationConsequenceNarrative {
  /** Stable authored identifier retained in run content fingerprints. */
  id: string;
  category: InvestigationConsequenceNarrativeCategory;
  text: string;
}

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
      {
        speakerKey: "scout",
        textTemplate:
          "The assistant coach gives you the pitch for an hour. {playerName} is already warming up — they know you're here. How do you set the tone?",
        options: [
          {
            text: "Join the warm-up yourself — break the ice informally",
            riskLevel: "safe",
          },
          {
            text: "Set up a structured drill and observe from the sideline",
            riskLevel: "moderate",
          },
          {
            text: "Tell them you're here for one reason — show me what you've got",
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
      {
        speakerKey: "parent",
        textTemplate:
          "{speakerName} meets you at a café near the training ground. They brought photos of {playerName} at various tournaments — clearly proud. How do you steer the conversation?",
        options: [
          {
            text: "Show genuine interest in the journey — let them tell the story",
            riskLevel: "safe",
          },
          {
            text: "Acknowledge the achievement, then pivot to specific questions about mentality",
            riskLevel: "moderate",
          },
          {
            text: "Cut to it: \"What do you think is holding {playerName} back right now?\"",
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

  // ---------------------------------------------------------------------------
  // agentShowcase — 3-5 phases
  // ---------------------------------------------------------------------------
  agentShowcase: [
    // Phase 0 — agent pitch
    [
      {
        speakerKey: "agent",
        textTemplate:
          "The agent leans forward confidently. \"Thanks for taking the meeting. I've got a player I think is exactly what you're looking for — {playerName}. Let me walk you through what makes them special.\"",
        options: [
          {
            text: "Listen attentively and take notes on every claim",
            riskLevel: "safe",
          },
          {
            text: "Interrupt early with pointed questions about weaknesses",
            riskLevel: "moderate",
          },
          {
            text: "Challenge the pitch immediately — \"I've heard that before. Prove it.\"",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "agent",
        textTemplate:
          "{speakerName} slides a highlights package across the table. \"I represent {playerName}. Before we get into numbers, let me tell you why three other clubs are already interested.\"",
        options: [
          {
            text: "Express polite interest and ask for their full assessment",
            riskLevel: "safe",
          },
          {
            text: "Steer the conversation toward concrete stats and injury history",
            riskLevel: "moderate",
          },
          {
            text: "Call the bluff — \"Name the clubs or I'm not buying it\"",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 1 — player discussion
    [
      {
        speakerKey: "scout",
        textTemplate:
          "The agent has made their case. Now you need to dig beneath the surface. {playerName}'s profile looks promising on paper, but agents always spin. How do you verify the claims?",
        options: [
          {
            text: "Ask about the player's daily routine and training habits",
            riskLevel: "safe",
          },
          {
            text: "Push for details on why the player is available — what's the real story?",
            riskLevel: "moderate",
          },
          {
            text: "Demand to speak with the player directly, bypassing the agent's script",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "agent",
        textTemplate:
          "\"Look, I'll be honest with you,\" {speakerName} says, leaning back. \"{playerName} had a rough patch last season, but that's behind them. Every top player has a dip — it's about trajectory.\"",
        options: [
          {
            text: "Acknowledge the honesty and ask what changed",
            riskLevel: "safe",
          },
          {
            text: "Press harder — what exactly caused the rough patch?",
            riskLevel: "moderate",
          },
          {
            text: "\"A rough patch or a pattern? I need medical and disciplinary records.\"",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 2 — terms and availability
    [
      {
        speakerKey: "agent",
        textTemplate:
          "\"Let's talk availability,\" the agent says. \"There's a window here, but it won't stay open forever. {playerName} has options, and I owe it to my client to explore all of them.\"",
        options: [
          {
            text: "Express genuine interest and ask what timeline they're working with",
            riskLevel: "safe",
          },
          {
            text: "Push back on the urgency — \"Good players are always available for the right club\"",
            riskLevel: "moderate",
          },
          {
            text: "\"Drop the pressure tactics. Either we're a fit or we're not.\"",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "The conversation turns to practical matters. The agent wants to know your club's budget range and development pathway for {playerName}. How much do you reveal?",
        options: [
          {
            text: "Share a general overview of the club's development programme",
            riskLevel: "safe",
          },
          {
            text: "Give specifics only if they match details about competing offers",
            riskLevel: "moderate",
          },
          {
            text: "Keep your cards close — \"We'll make an offer if we like what we see\"",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 3 — close
    [
      {
        speakerKey: "agent",
        textTemplate:
          "{speakerName} stands to wrap up. \"I think there's real potential here. What are your next steps? I need to give {playerName} an update.\"",
        options: [
          {
            text: "Thank them for their time and commit to following up within the week",
            riskLevel: "safe",
          },
          {
            text: "Ask for one more piece of information before committing to anything",
            riskLevel: "moderate",
          },
          {
            text: "\"I'll be in touch if — and only if — what I've heard today checks out\"",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "The meeting is winding down. You've gathered useful intelligence, but the agent is pushing for commitment. How do you leave things?",
        options: [
          {
            text: "Express enthusiasm and schedule a follow-up meeting",
            riskLevel: "safe",
          },
          {
            text: "Stay neutral — you need to verify claims before showing your hand",
            riskLevel: "moderate",
          },
          {
            text: "Set a hard deadline — \"You'll hear from me in 48 hours. No earlier.\"",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 4 — wrap-up assessment
    [
      {
        speakerKey: "scout",
        textTemplate:
          "Walking back to your car after the showcase meeting, you review your notes on {playerName}. The agent was polished, but how much of the pitch was substance? Time to form your initial assessment.",
        options: [
          {
            text: "The agent seemed credible — log this as a genuine prospect",
            riskLevel: "safe",
          },
          {
            text: "Flag some inconsistencies to investigate further before committing",
            riskLevel: "moderate",
          },
          {
            text: "The pitch was too slick — trust your gut that something's off",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "You sit in your car making notes. {playerName}'s profile has potential, but the agent's eagerness to close quickly is raising questions. What's your read?",
        options: [
          {
            text: "The urgency is normal — agents always push. Focus on the player's qualities",
            riskLevel: "safe",
          },
          {
            text: "Cross-reference the agent's claims with your own database before deciding",
            riskLevel: "moderate",
          },
          {
            text: "Something doesn't add up — put this one on hold and dig deeper independently",
            riskLevel: "bold",
          },
        ],
      },
    ],
  ],

  // ---------------------------------------------------------------------------
  // freeAgentOutreach — 4-6 phases
  // ---------------------------------------------------------------------------
  freeAgentOutreach: [
    // Phase 0 — introduction
    [
      {
        speakerKey: "scout",
        textTemplate:
          "You've arranged to meet {playerName} directly — no agent, no intermediary. They're a free agent, and this is your chance to assess them face-to-face. How do you open?",
        options: [
          {
            text: "Keep it casual — buy them a coffee and get them talking about themselves",
            riskLevel: "safe",
          },
          {
            text: "Be upfront about your club's interest and what you need to see from them",
            riskLevel: "moderate",
          },
          {
            text: "Test their hunger immediately — \"Why should my club take a chance on you?\"",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "player",
        textTemplate:
          "{playerName} arrives early, dressed professionally. They shake your hand firmly. \"Thanks for meeting me. I know free agents don't always get this kind of attention.\"",
        options: [
          {
            text: "Put them at ease — \"We're always looking for quality, regardless of contract status\"",
            riskLevel: "safe",
          },
          {
            text: "Acknowledge the situation honestly — ask why they're unattached",
            riskLevel: "moderate",
          },
          {
            text: "\"Let's skip the pleasantries. Walk me through what went wrong at your last club\"",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 1 — player assessment
    [
      {
        speakerKey: "player",
        textTemplate:
          "\"I've been keeping fit on my own,\" {playerName} says. \"Training every day, watching film. I know people question free agents, but I'm sharper than I was six months ago.\"",
        options: [
          {
            text: "Ask about their training regime and what they've been focusing on",
            riskLevel: "safe",
          },
          {
            text: "Challenge the claim — ask for specific examples of how they've improved",
            riskLevel: "moderate",
          },
          {
            text: "\"Prove it. We have facilities — show me tomorrow morning\"",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "Watching {playerName} talk about their abilities, you notice subtle cues. Their body language shifts when certain topics come up. How do you read the room?",
        options: [
          {
            text: "Let them continue talking — people reveal the most when they feel comfortable",
            riskLevel: "safe",
          },
          {
            text: "Ask directly about the topic that made them uncomfortable",
            riskLevel: "moderate",
          },
          {
            text: "Call it out — \"You tensed up there. What aren't you telling me?\"",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 2 — career discussion
    [
      {
        speakerKey: "player",
        textTemplate:
          "{playerName} opens up about their career journey. \"I made some mistakes, I won't lie. But I've learned from them. I just need someone to believe in what I can still do.\"",
        options: [
          {
            text: "Show empathy and ask what they learned from those experiences",
            riskLevel: "safe",
          },
          {
            text: "Probe deeper — what specific mistakes, and how have they changed?",
            riskLevel: "moderate",
          },
          {
            text: "\"Belief isn't enough. What guarantee can you give me this time is different?\"",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "The conversation shifts to {playerName}'s last club. There are clearly unresolved feelings there. How do you navigate this sensitive territory?",
        options: [
          {
            text: "Tread carefully — focus on the future rather than the past",
            riskLevel: "safe",
          },
          {
            text: "Ask neutral questions about what they'd do differently",
            riskLevel: "moderate",
          },
          {
            text: "Push into the discomfort — the truth usually lives where people don't want to go",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 3 — terms discussion
    [
      {
        speakerKey: "player",
        textTemplate:
          "\"Look, I'm not going to pretend I have a dozen offers,\" {playerName} says candidly. \"But I do have options. What I really want is the right situation — somewhere I can contribute and grow.\"",
        options: [
          {
            text: "Appreciate the honesty and outline your club's culture and expectations",
            riskLevel: "safe",
          },
          {
            text: "Test their flexibility — what are they willing to compromise on?",
            riskLevel: "moderate",
          },
          {
            text: "\"What are your non-negotiables? Let's see if this is even worth pursuing.\"",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "{playerName} asks about your club's plan for them. They want to know if there's a genuine pathway or if they'd just be a depth signing. How transparent are you?",
        options: [
          {
            text: "Paint an honest picture of the competition for places",
            riskLevel: "safe",
          },
          {
            text: "Be strategic — share enough to maintain their interest without overpromising",
            riskLevel: "moderate",
          },
          {
            text: "\"Earn your spot. Nobody gets guarantees — that's how we operate\"",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 4 — close
    [
      {
        speakerKey: "player",
        textTemplate:
          "{playerName} stands up and extends their hand. \"I appreciate you taking the time. Whatever you decide, I respect the process.\" Their eyes search your face for a signal.",
        options: [
          {
            text: "Give them a warm send-off and promise to be in touch soon",
            riskLevel: "safe",
          },
          {
            text: "Stay professional but give a measured hint of your impression",
            riskLevel: "moderate",
          },
          {
            text: "\"I'll know within 24 hours. If you don't hear from me, you have your answer.\"",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "The meeting is over. {playerName} heads out, and you're left with your notes and your instincts. First impressions matter in this business.",
        options: [
          {
            text: "Log detailed notes while the meeting is fresh — stay objective",
            riskLevel: "safe",
          },
          {
            text: "Compare what they said against what your sources have told you",
            riskLevel: "moderate",
          },
          {
            text: "Trust your gut — you've seen enough players to know when something's real",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 5 — post-meeting follow-up
    [
      {
        speakerKey: "scout",
        textTemplate:
          "Back at your desk, you review the {playerName} file alongside your meeting notes. The free agent market is unpredictable — windows close fast. What's your recommendation?",
        options: [
          {
            text: "Flag as a viable option and recommend further evaluation",
            riskLevel: "safe",
          },
          {
            text: "Recommend a trial period to verify their claims under real conditions",
            riskLevel: "moderate",
          },
          {
            text: "Make a decisive call now — either push to sign or close the file",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "You draft your assessment of {playerName}. Free agents are always a calculated risk — low transfer cost but unknown variables. How do you frame your report?",
        options: [
          {
            text: "Present a balanced view highlighting both potential and risk factors",
            riskLevel: "safe",
          },
          {
            text: "Lead with the specific gaps this player could fill in your squad",
            riskLevel: "moderate",
          },
          {
            text: "Write a bold recommendation — commit to a clear position and defend it",
            riskLevel: "bold",
          },
        ],
      },
    ],
  ],

  // ---------------------------------------------------------------------------
  // loanMonitoring — 3-5 phases
  // ---------------------------------------------------------------------------
  loanMonitoring: [
    // Phase 0 — arrival at host club
    [
      {
        speakerKey: "scout",
        textTemplate:
          "You arrive at the host club's training facility to check on {playerName}. The loan manager meets you at the gate. How do you set the tone?",
        options: [
          {
            text: "Keep it casual — ask about the player's settling-in before getting into specifics",
            riskLevel: "safe",
          },
          {
            text: "Request the latest training data and match reports upfront",
            riskLevel: "moderate",
          },
          {
            text: "Ask directly whether the player is meeting expectations or falling short",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "The host club has set aside time for you to review {playerName}'s loan spell. {speakerName} walks you through the corridors toward the pitch. How do you open the conversation?",
        options: [
          {
            text: "Compliment the facilities and ease into questions about the player",
            riskLevel: "safe",
          },
          {
            text: "Ask for a summary of playing time and role in the first team",
            riskLevel: "moderate",
          },
          {
            text: "Challenge them on why the player's minutes have been inconsistent",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 1 — watching the player train or play
    [
      {
        speakerKey: "contact",
        textTemplate:
          "{speakerName} gestures toward the training pitch where {playerName} is working through a session. What catches your eye first?",
        options: [
          {
            text: "Watch body language and energy levels — are they engaged or going through the motions?",
            riskLevel: "safe",
          },
          {
            text: "Focus on the specific technical skills this loan was meant to develop",
            riskLevel: "moderate",
          },
          {
            text: "Observe how the coaching staff interact with the player — are they invested or indifferent?",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "You settle into a quiet spot to watch {playerName} in action. The session is competitive and the pace is high. Where do you direct your attention?",
        options: [
          {
            text: "Take a broad view — assess fitness, sharpness, and overall integration",
            riskLevel: "safe",
          },
          {
            text: "Zero in on decision-making under pressure — the area flagged before the loan",
            riskLevel: "moderate",
          },
          {
            text: "Watch for leadership moments — does the player organize and demand from teammates?",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 2 — coaching staff meeting
    [
      {
        speakerKey: "contact",
        textTemplate:
          "{speakerName} sits down with you in the office. 'So, what would you like to know about {playerName}?' they ask. How do you steer the conversation?",
        options: [
          {
            text: "Ask about the player's attitude and professionalism day-to-day",
            riskLevel: "safe",
          },
          {
            text: "Request specifics on tactical role and how it's developed the player",
            riskLevel: "moderate",
          },
          {
            text: "Ask bluntly whether they'd want to sign the player permanently",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "contact",
        textTemplate:
          "'Between us,' {speakerName} says, leaning back, '{playerName} has had an interesting time here.' They pause. What do you ask next?",
        options: [
          {
            text: "Nod and let them continue — don't interrupt a candid moment",
            riskLevel: "safe",
          },
          {
            text: "Ask what 'interesting' means — good or bad?",
            riskLevel: "moderate",
          },
          {
            text: "Push hard — what aren't you telling me?",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 3 — player conversation
    [
      {
        speakerKey: "player",
        textTemplate:
          "You sit down with {playerName} after training. They seem open to talking but slightly guarded. How do you draw them out?",
        options: [
          {
            text: "Ask about life off the pitch — settling in, city, teammates",
            riskLevel: "safe",
          },
          {
            text: "Ask what they feel they've improved most since arriving",
            riskLevel: "moderate",
          },
          {
            text: "Be direct — do you feel this loan is making you better?",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "player",
        textTemplate:
          "{playerName} meets you in the canteen. They're relaxed and curious about why you're visiting. How do you frame the conversation?",
        options: [
          {
            text: "Reassure them — this is routine, just checking in on how things are going",
            riskLevel: "safe",
          },
          {
            text: "Ask them to self-assess honestly — where are the gaps?",
            riskLevel: "moderate",
          },
          {
            text: "Tell them the parent club has concerns and you need honest answers",
            riskLevel: "bold",
          },
        ],
      },
    ],
    // Phase 4 — assessment wrap-up
    [
      {
        speakerKey: "scout",
        textTemplate:
          "You've seen enough. Time to compile your assessment of {playerName}'s loan spell. How do you frame your report?",
        options: [
          {
            text: "Balanced summary — cover positives and areas for growth in equal measure",
            riskLevel: "safe",
          },
          {
            text: "Lead with the development metrics — hard data on what's changed",
            riskLevel: "moderate",
          },
          {
            text: "Write a bold recommendation — extend, recall, or make permanent",
            riskLevel: "bold",
          },
        ],
      },
      {
        speakerKey: "scout",
        textTemplate:
          "Driving home, you turn over everything you've learned about {playerName}. The picture is complex but clear enough to act on. How do you present your findings?",
        options: [
          {
            text: "Stick to the facts — let the data speak for itself",
            riskLevel: "safe",
          },
          {
            text: "Compare against the original loan objectives point by point",
            riskLevel: "moderate",
          },
          {
            text: "Make a definitive call — this loan has succeeded or failed",
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

const SAFE_NARRATIVE_TEXTS = [
  "The cautious approach pays off — you gather solid, reliable information without creating tension.",
  "You keep the atmosphere relaxed. What you learn is modest, but the relationship is intact.",
  "Nothing is forced. The read is partial, but the door stays open for follow-up.",
  "A steady, professional exchange. The groundwork is laid for future progress.",
  "You learn less than you'd like, but you leave on good terms — and that has its own value.",
];

const MODERATE_NARRATIVE_TEXTS = [
  "The push yields results. You land meaningful information, though the contact shifts slightly in their seat.",
  "A balanced read — enough pressure to get somewhere real, not enough to cause friction.",
  "They respond well to the directness. You learn something genuinely useful.",
  "The moderate gamble pays off this time. Confidence is earned rather than assumed.",
  "A mixed return: solid insight but a faint undercurrent of wariness from the other party.",
];

const MODERATE_NEGATIVE_NARRATIVE_TEXTS = [
  "The pressure was slightly misjudged. They close up, and you sense you've pushed just a fraction too hard.",
  "It doesn't land the way you intended — they deflect and the moment is lost.",
  "You got something, but you can feel a small amount of trust was spent in the process.",
];

const BOLD_POSITIVE_NARRATIVE_TEXTS = [
  "The bold move pays off completely. You get more than you expected — and they respect the directness.",
  "They take the challenge head-on. The risk was high, but the return justifies every bit of it.",
  "A gamble that lands. You've revealed something significant, and the contact is impressed by your confidence.",
  "Pushing hard worked. You've gained a major insight that would have taken weeks through careful observation.",
];

const BOLD_NEGATIVE_NARRATIVE_TEXTS = [
  "You overplayed your hand. They pull back sharply, and the atmosphere sours.",
  "Too much, too soon. The relationship takes a hit that won't be quick to repair.",
  "The boldness backfires. They shut down, and you're left with less than when you started.",
  "A costly misjudgement — you got nothing and damaged something valuable in the process.",
  "They're offended by the approach. The conversation ends early, and you'll need time to recover from this.",
];

const INSIGHT_NARRATIVE_TEXTS = [
  "A small detail catches your eye — something worth noting in the file.",
  "They let slip more than they intended. Your instincts were right.",
  "The extra push surfaces a hidden detail that changes your read of the player.",
];

const CONSEQUENCE_NARRATIVE_IDS: Readonly<
  Record<InvestigationConsequenceNarrativeCategory, readonly string[]>
> = {
  safe: [
    "safe-reliable-information",
    "safe-relationship-intact",
    "safe-follow-up-door",
    "safe-steady-groundwork",
    "safe-good-terms",
  ],
  moderate: [
    "moderate-pressure-yields",
    "moderate-balanced-read",
    "moderate-directness-rewarded",
    "moderate-gamble-pays",
    "moderate-mixed-return",
  ],
  "moderate-negative": [
    "moderate-negative-misjudged-pressure",
    "moderate-negative-moment-lost",
    "moderate-negative-trust-spent",
  ],
  "bold-positive": [
    "bold-positive-directness-respected",
    "bold-positive-risk-justified",
    "bold-positive-significant-reveal",
    "bold-positive-major-insight",
  ],
  "bold-negative": [
    "bold-negative-overplayed-hand",
    "bold-negative-too-soon",
    "bold-negative-shut-down",
    "bold-negative-costly-misjudgement",
    "bold-negative-offended",
  ],
  insight: [
    "insight-file-detail",
    "insight-unintended-admission",
    "insight-hidden-detail",
  ],
};

const CONSEQUENCE_NARRATIVE_CATEGORIES = new Set<InvestigationConsequenceNarrativeCategory>([
  "safe",
  "moderate",
  "moderate-negative",
  "bold-positive",
  "bold-negative",
  "insight",
]);

function defineNarrativeEntries(
  category: InvestigationConsequenceNarrativeCategory,
  texts: readonly string[],
): InvestigationConsequenceNarrative[] {
  const ids = CONSEQUENCE_NARRATIVE_IDS[category];
  if (ids.length !== texts.length) {
    throw new Error(
      `investigation consequence narrative IDs do not match ${category} text count`,
    );
  }
  return texts.map((text, index) => ({
    id: ids[index],
    category,
    text,
  }));
}

const INVESTIGATION_CONSEQUENCE_NARRATIVE_DEFINITIONS: readonly InvestigationConsequenceNarrative[] = [
  ...defineNarrativeEntries("safe", SAFE_NARRATIVE_TEXTS),
  ...defineNarrativeEntries("moderate", MODERATE_NARRATIVE_TEXTS),
  ...defineNarrativeEntries(
    "moderate-negative",
    MODERATE_NEGATIVE_NARRATIVE_TEXTS,
  ),
  ...defineNarrativeEntries("bold-positive", BOLD_POSITIVE_NARRATIVE_TEXTS),
  ...defineNarrativeEntries("bold-negative", BOLD_NEGATIVE_NARRATIVE_TEXTS),
  ...defineNarrativeEntries("insight", INSIGHT_NARRATIVE_TEXTS),
];

function validateInvestigationConsequenceNarrative(
  narrative: InvestigationConsequenceNarrative,
): readonly Omit<ContentValidationIssue, "packId" | "definitionId">[] {
  const issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">> = [];
  if (!CONSEQUENCE_NARRATIVE_CATEGORIES.has(narrative.category)) {
    issues.push({ path: "category", message: "must be a supported consequence category" });
  }
  if (!hasNonBlankString(narrative.text)) {
    issues.push({ path: "text", message: "must be a non-empty string" });
  }
  return issues;
}

/**
 * Consequence prose accompanies real trust and insight effects. Keep it in
 * the run ledger so authored changes cannot silently rewrite a career.
 */
export const INVESTIGATION_CONSEQUENCE_NARRATIVE_CONTENT_PACK = defineContentPack({
  manifest: {
    id: "talentscout.investigation-consequence-narratives",
    kind: "investigation-consequence-narrative",
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentVersion: "investigation-consequence-narratives.1",
  },
  entries: INVESTIGATION_CONSEQUENCE_NARRATIVE_DEFINITIONS,
  getDefinitionId: (narrative) => narrative.id,
  validateDefinition: validateInvestigationConsequenceNarrative,
});

export const INVESTIGATION_CONSEQUENCE_NARRATIVES =
  INVESTIGATION_CONSEQUENCE_NARRATIVE_CONTENT_PACK.entries;

const narrativesByCategory = new Map<
  InvestigationConsequenceNarrativeCategory,
  readonly InvestigationConsequenceNarrative[]
>();

for (const category of CONSEQUENCE_NARRATIVE_CATEGORIES) {
  const narratives = INVESTIGATION_CONSEQUENCE_NARRATIVES.filter(
    (narrative) => narrative.category === category,
  );
  if (narratives.length === 0) {
    throw new Error(
      `investigation consequence narrative pack has no ${category} entries`,
    );
  }
  narrativesByCategory.set(category, narratives);
}

function pickConsequenceNarrative(
  rng: RNG,
  category: InvestigationConsequenceNarrativeCategory,
): string {
  const narratives = narrativesByCategory.get(category);
  if (!narratives) {
    throw new Error(`Unknown investigation consequence category: ${category}`);
  }
  return rng.pick(narratives).text;
}

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
  _activityType: string,
): DialogueConsequence {
  const riskLevel = option.riskLevel;

  switch (riskLevel) {
    case "safe":
      return buildSafeConsequence(rng);

    case "moderate":
      return buildModerateConsequence(rng);

    case "bold":
      return buildBoldConsequence(rng);
  }
}

function buildSafeConsequence(rng: RNG): DialogueConsequence {
  const narrativeText = pickConsequenceNarrative(rng, "safe");

  // Safe choices reliably improve the relationship by a small amount
  const relationshipDelta = rng.nextInt(1, 2);

  return {
    narrativeText,
    relationshipDelta,
    insightBonus: rng.nextInt(1, 3),
  };
}

function buildModerateConsequence(rng: RNG): DialogueConsequence {
  // 20% chance of a mildly negative outcome instead of positive
  const isNegative = rng.chance(0.2);

  if (isNegative) {
    const narrativeText = pickConsequenceNarrative(rng, "moderate-negative");
    return {
      narrativeText,
      relationshipDelta: -1,
      insightBonus: 0,
    };
  }

  const narrativeText = pickConsequenceNarrative(rng, "moderate");

  // Small chance of a bonus insight narrative appended
  const bonusInsightText = rng.chance(0.3)
    ? ` ${pickConsequenceNarrative(rng, "insight")}`
    : "";

  return {
    narrativeText: narrativeText + bonusInsightText,
    relationshipDelta: rng.nextInt(0, 1),
    insightBonus: rng.nextInt(3, 6),
  };
}

function buildBoldConsequence(rng: RNG): DialogueConsequence {
  // 45% chance of a negative outcome — bold choices carry real risk
  const isNegative = rng.chance(0.45);

  if (isNegative) {
    const narrativeText = pickConsequenceNarrative(rng, "bold-negative");
    return {
      narrativeText,
      relationshipDelta: rng.nextInt(-3, -2),
      insightBonus: 0,
    };
  }

  const narrativeText = pickConsequenceNarrative(rng, "bold-positive");

  return {
    narrativeText,
    relationshipDelta: rng.nextInt(2, 4),
    insightBonus: rng.nextInt(6, 12),
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
    case "agentShowcase":
      return "the agent";
    case "freeAgentOutreach":
      return "the player";
    case "loanMonitoring":
      return "the loan manager";
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

    // Apply career-path text substitution to all dialogue text
    const resolvedNodes = dialogueNodes.map((node) => ({
      ...node,
      text: resolveCareerPathText(node.text, session.careerPath),
      options: node.options.map((opt) => ({
        ...opt,
        text: resolveCareerPathText(opt.text, session.careerPath),
        outcome: {
          ...opt.outcome,
          ...(session.sourceContactId
            ? {}
            : { relationshipDelta: undefined }),
          narrativeText: resolveCareerPathText(opt.outcome.narrativeText, session.careerPath),
        },
      })),
    }));

    return { ...phase, dialogueNodes: resolvedNodes };
  });

  // Suppress unused-variable warning for totalPhases — it is used implicitly
  // via session.phases.length when constructing updatedPhases.
  void totalPhases;

  return { ...session, phases: updatedPhases };
}
