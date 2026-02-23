/**
 * Tutorial step and sequence definitions.
 *
 * Each step references a `targetSelector` — the value of a `data-tutorial-id`
 * attribute on a DOM element in the game UI.  The TutorialOverlay component
 * queries `document.querySelector('[data-tutorial-id="<value>"]')` to find
 * the element and spotlight it.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TutorialStep {
  /** Unique identifier for this step within its sequence. */
  id: string;

  /** The GameScreen on which this step is shown. */
  screen: string;

  /**
   * The value of the `data-tutorial-id` attribute on the target DOM element.
   * The overlay will spotlight whichever element carries this attribute.
   */
  targetSelector: string;

  /** Short heading shown in the popup card. */
  title: string;

  /** Explanatory body text shown beneath the title. */
  description: string;

  /**
   * Which side of the target element the popup card should appear on.
   * The overlay will adjust if the card would overflow the viewport.
   */
  position: "top" | "bottom" | "left" | "right";

  /**
   * Optional: a condition label used by the game engine to auto-advance
   * to this step (e.g. "playerFocused", "activityScheduled").
   * Currently informational — auto-advance is not yet wired to the engine.
   */
  nextStep?: string;
}

export interface TutorialSequence {
  /** Matches the TutorialSequenceId type in tutorialStore.ts. */
  id: string;

  /** Human-readable name (used for debugging / admin tooling). */
  name: string;

  steps: TutorialStep[];
}

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

const firstWeek: TutorialSequence = {
  id: "firstWeek",
  name: "Your First Week",
  steps: [
    {
      id: "fw-1",
      screen: "dashboard",
      targetSelector: "dashboard-overview",
      title: "Your Hub",
      description:
        "This is your hub — reputation, fatigue, and upcoming matches are all visible here. Check in each week to stay on top of your career.",
      position: "right",
    },
    {
      id: "fw-2",
      screen: "dashboard",
      targetSelector: "dashboard-reputation",
      title: "Reputation",
      description:
        "Your reputation score grows as you submit accurate reports. Clubs offer better roles to scouts with higher reputations.",
      position: "bottom",
    },
    {
      id: "fw-3",
      screen: "dashboard",
      targetSelector: "dashboard-fatigue",
      title: "Fatigue",
      description:
        "Fatigue accumulates as you schedule activities. High fatigue reduces observation accuracy — balance work with rest days.",
      position: "bottom",
    },
    {
      id: "fw-4",
      screen: "calendar",
      targetSelector: "calendar-grid",
      title: "Plan Your Week",
      description:
        "Plan your week by scheduling activities into day slots. Each activity costs one or more days — you have seven slots per week.",
      position: "top",
    },
    {
      id: "fw-5",
      screen: "calendar",
      targetSelector: "calendar-activities",
      title: "Schedule Activities",
      description:
        "Try scheduling 'Attend Match' on Saturday. Watching live matches is your primary source of player observations.",
      position: "left",
      nextStep: "activityScheduled",
    },
    {
      id: "fw-6",
      screen: "match",
      targetSelector: "match-phases",
      title: "Match Phases",
      description:
        "Watch phases unfold — pick a player to focus on during each phase. Your scouting lens determines what you observe.",
      position: "bottom",
    },
    {
      id: "fw-7",
      screen: "match",
      targetSelector: "match-focus-lens",
      title: "Focus Lens",
      description:
        "Choose a lens to sharpen your observation. Technical, Physical, and Psychological lenses reveal different attributes.",
      position: "left",
      nextStep: "playerFocused",
    },
    {
      id: "fw-8",
      screen: "playerDatabase",
      targetSelector: "player-database-list",
      title: "Player Database",
      description:
        "Players you've observed appear here. Confidence levels update as you gather more observations across multiple matches.",
      position: "right",
    },
  ],
};

const firstReport: TutorialSequence = {
  id: "firstReport",
  name: "Writing Your First Report",
  steps: [
    {
      id: "fr-1",
      screen: "reportWriter",
      targetSelector: "report-conviction",
      title: "Conviction Levels",
      description:
        "Choose how strongly you back this player. Higher conviction stakes your reputation — be accurate or pay the price.",
      position: "right",
    },
    {
      id: "fr-2",
      screen: "reportWriter",
      targetSelector: "report-attributes",
      title: "Attribute Confidence",
      description:
        "Each attribute shows your confidence level based on observations. Low-confidence attributes carry more risk in your report.",
      position: "bottom",
    },
    {
      id: "fr-3",
      screen: "reportWriter",
      targetSelector: "report-strengths",
      title: "Strengths and Weaknesses",
      description:
        "Highlight what stands out. Your written assessment carries weight — clubs read between the lines.",
      position: "top",
    },
    {
      id: "fr-4",
      screen: "reportWriter",
      targetSelector: "report-submit",
      title: "Submit and Live with It",
      description:
        "Once submitted, a report is permanent. If the player performs well, your reputation grows. If not, it takes a hit.",
      position: "top",
      nextStep: "reportSubmitted",
    },
  ],
};

const careerProgression: TutorialSequence = {
  id: "careerProgression",
  name: "Career Progression",
  steps: [
    {
      id: "cp-1",
      screen: "career",
      targetSelector: "career-tier-benefits",
      title: "New Tier Benefits",
      description:
        "You've reached a new career tier. Each tier unlocks access to higher-profile leagues, more club contacts, and greater weekly budgets.",
      position: "bottom",
    },
    {
      id: "cp-2",
      screen: "career",
      targetSelector: "career-perk-tree",
      title: "Perk Tree",
      description:
        "Spend earned perk points to specialise your scout. Perks compound over time — choose a path that suits your playstyle.",
      position: "right",
    },
    {
      id: "cp-3",
      screen: "calendar",
      targetSelector: "calendar-activities",
      title: "New Activities Unlocked",
      description:
        "Your new tier has unlocked additional scouting activities. Check the activity panel to see what's now available to you.",
      position: "left",
    },
  ],
};

const firstMatch: TutorialSequence = {
  id: "firstMatch",
  name: "Your First Match",
  steps: [
    {
      id: "fm-1",
      screen: "match",
      targetSelector: "match-scoreboard",
      title: "Scoreboard",
      description:
        "This is the match scoreboard. Track the score and current minute as the match unfolds.",
      position: "bottom",
    },
    {
      id: "fm-2",
      screen: "match",
      targetSelector: "match-phase-desc",
      title: "Phase Description",
      description:
        "Each match is broken into 12\u201318 phases. Read the tactical context \u2014 it tells you what kind of play is happening.",
      position: "bottom",
    },
    {
      id: "fm-3",
      screen: "match",
      targetSelector: "match-pitch",
      title: "Pitch View",
      description:
        "Players are shown on the pitch. Larger dots indicate players involved in the current phase.",
      position: "right",
    },
    {
      id: "fm-4",
      screen: "match",
      targetSelector: "match-commentary",
      title: "Commentary",
      description:
        "Events appear here as the phase unfolds. Quality dots next to each event show how well the player performed.",
      position: "top",
    },
    {
      id: "fm-5",
      screen: "match",
      targetSelector: "match-focus-panel",
      title: "Focus a Player",
      description:
        "Click a player on the pitch or use 'Add Focus' to track up to 3 players. Focused players reveal more attributes with better accuracy.",
      position: "left",
    },
    {
      id: "fm-6",
      screen: "match",
      targetSelector: "match-focus-lens",
      title: "Choose a Lens",
      description:
        "Choose a lens to focus your observation: Technical, Physical, Mental, Tactical, or General. The lens determines which attributes are deepened.",
      position: "left",
    },
    {
      id: "fm-7",
      screen: "match",
      targetSelector: "match-involved-players",
      title: "Involved Players",
      description:
        "These are the players involved in the current phase. Focused players appear in green \u2014 they get bonus accuracy on their readings.",
      position: "left",
    },
    {
      id: "fm-8",
      screen: "match",
      targetSelector: "match-advance-btn",
      title: "Advance the Match",
      description:
        "Click 'Next Phase' when you\u2019re ready to move on. At the end of the match, all your observations are saved automatically.",
      position: "top",
    },
  ],
};

const firstReportWriting: TutorialSequence = {
  id: "firstReportWriting",
  name: "Writing Your First Report",
  steps: [
    {
      id: "frw-1",
      screen: "reportWriter",
      targetSelector: "report-observation-summary",
      title: "Select a Player",
      description:
        "This shows how many times you\u2019ve observed this player and from which contexts. More sessions mean higher confidence.",
      position: "bottom",
    },
    {
      id: "frw-2",
      screen: "reportWriter",
      targetSelector: "report-attributes",
      title: "Confidence Display",
      description:
        "These bars show your confidence in each attribute reading. Green means reliable data, amber is moderate, red is uncertain.",
      position: "bottom",
    },
    {
      id: "frw-3",
      screen: "reportWriter",
      targetSelector: "report-conviction",
      title: "Conviction Level",
      description:
        "Choose your conviction. Higher conviction means bigger reputation stakes \u2014 a Table Pound is your career on the line.",
      position: "right",
    },
    {
      id: "frw-4",
      screen: "reportWriter",
      targetSelector: "report-strengths",
      title: "Strengths & Weaknesses",
      description:
        "Highlight what stood out from your observations. Clubs read these to understand your assessment beyond raw numbers.",
      position: "top",
    },
    {
      id: "frw-5",
      screen: "reportWriter",
      targetSelector: "report-submit",
      title: "Submit Your Report",
      description:
        "Your report goes to the club. Their response depends on report quality, your reputation, and conviction level.",
      position: "top",
      nextStep: "reportSubmitted",
    },
  ],
};

// ---------------------------------------------------------------------------
// Exported collection
// ---------------------------------------------------------------------------

export const TUTORIAL_SEQUENCES: TutorialSequence[] = [
  firstWeek,
  firstReport,
  careerProgression,
  firstMatch,
  firstReportWriting,
];

/** Look up a sequence by its id. Returns undefined if not found. */
export function getSequenceById(id: string): TutorialSequence | undefined {
  return TUTORIAL_SEQUENCES.find((s) => s.id === id);
}
