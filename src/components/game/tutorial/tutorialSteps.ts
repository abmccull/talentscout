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

// ---------------------------------------------------------------------------
// Exported collection
// ---------------------------------------------------------------------------

export const TUTORIAL_SEQUENCES: TutorialSequence[] = [
  firstWeek,
  firstReport,
  careerProgression,
];

/** Look up a sequence by its id. Returns undefined if not found. */
export function getSequenceById(id: string): TutorialSequence | undefined {
  return TUTORIAL_SEQUENCES.find((s) => s.id === id);
}
