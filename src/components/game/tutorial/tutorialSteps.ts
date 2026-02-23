/**
 * Tutorial step and sequence definitions.
 *
 * Each step references a `targetSelector` — the value of a `data-tutorial-id`
 * attribute on a DOM element in the game UI.  The TutorialOverlay component
 * queries `document.querySelector('[data-tutorial-id="<value>"]')` to find
 * the element and spotlight it.
 *
 * Onboarding sequences are composed from 3 layers:
 * 1. Common intro (2 steps) — same for all players
 * 2. Career fork (2 steps) — club vs freelance
 * 3. Specialization mission (4 steps) — unique per spec
 */

import type { Specialization } from "@/engine/core/types";

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
   * past this step (e.g. "activityScheduled", "youthActivityScheduled").
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
// Shared step fragments — onboarding composition
// ---------------------------------------------------------------------------

const commonIntro: TutorialStep[] = [
  {
    id: "onb-hub",
    screen: "dashboard",
    targetSelector: "dashboard-overview",
    title: "Welcome to Your Hub",
    description:
      "Reputation, fatigue, and upcoming matches. Check in each week before planning.",
    position: "right",
  },
  {
    id: "onb-calendar",
    screen: "dashboard",
    targetSelector: "nav-calendar",
    title: "Plan Your Week",
    description:
      "Open Calendar to schedule activities. Each costs day slots \u2014 balance scouting with rest.",
    position: "bottom",
  },
];

const clubFork: TutorialStep[] = [
  {
    id: "onb-club-salary",
    screen: "dashboard",
    targetSelector: "dashboard-club-header",
    title: "Your Employer",
    description:
      "Employed with a weekly salary. Your manager issues directives \u2014 priorities you should fulfil to build trust.",
    position: "bottom",
  },
  {
    id: "onb-club-inbox",
    screen: "dashboard",
    targetSelector: "nav-inbox",
    title: "Check Your Inbox",
    description:
      "Manager directives and club messages arrive here. Fulfilling directives builds club trust and job security.",
    position: "bottom",
  },
];

const freelanceFork: TutorialStep[] = [
  {
    id: "onb-free-finances",
    screen: "dashboard",
    targetSelector: "dashboard-finances",
    title: "Your Finances",
    description:
      "\u00A35,000 in savings, no salary. Earn by selling reports on the marketplace or placing youth at clubs.",
    position: "bottom",
  },
  {
    id: "onb-free-marketplace",
    screen: "dashboard",
    targetSelector: "nav-finances",
    title: "The Marketplace",
    description:
      "Open Finances to list reports for sale. Pricing, conviction level, and exclusivity determine what clubs pay.",
    position: "bottom",
  },
];

// ---------------------------------------------------------------------------
// Specialization missions
// ---------------------------------------------------------------------------

const youthMission: TutorialStep[] = [
  {
    id: "youth-1",
    screen: "calendar",
    targetSelector: "calendar-activities",
    title: "Find Unsigned Youth",
    description:
      "Schedule a \u2018School Match\u2019 or \u2018Grassroots Tournament\u2019. These are exclusive to Youth Scouts \u2014 discover raw talent others miss.",
    position: "left",
    nextStep: "youthActivityScheduled",
  },
  {
    id: "youth-2",
    screen: "dashboard",
    targetSelector: "nav-youthScouting",
    title: "Youth Pipeline",
    description:
      "Your Youth Scouting hub shows unsigned youth you\u2019ve discovered. Track buzz, age, and sub-region.",
    position: "bottom",
  },
  {
    id: "youth-3",
    screen: "youthScouting",
    targetSelector: "youth-pipeline-list",
    title: "Place Your Discoveries",
    description:
      "When confident in a prospect, write a Placement Report to recommend them to an academy. Successful placements earn fees.",
    position: "right",
  },
  {
    id: "youth-4",
    screen: "youthScouting",
    targetSelector: "youth-legacy-score",
    title: "The Long Game",
    description:
      "Your Legacy Score grows as placed youth make debuts, score goals, and earn international caps. This is what separates you.",
    position: "bottom",
  },
];

const firstTeamMission: TutorialStep[] = [
  {
    id: "ft-1",
    screen: "dashboard",
    targetSelector: "dashboard-directives",
    title: "Manager Directives",
    description:
      "Your manager needs specific positions filled. Each shows position, age range, and budget. Find matching players.",
    position: "right",
  },
  {
    id: "ft-2",
    screen: "calendar",
    targetSelector: "calendar-activities",
    title: "Attend a Match",
    description:
      "Schedule \u2018Attend Match\u2019 for live talent. You can also use \u2018Reserve Match\u2019 or \u2018Opposition Analysis\u2019 for deeper intel.",
    position: "left",
    nextStep: "activityScheduled",
  },
  {
    id: "ft-3",
    screen: "dashboard",
    targetSelector: "nav-reportHistory",
    title: "Report with Conviction",
    description:
      "After observing, write a report. Conviction determines club response strength. A \u2018Table Pound\u2019 stakes your career.",
    position: "bottom",
  },
  {
    id: "ft-4",
    screen: "dashboard",
    targetSelector: "nav-inbox",
    title: "Club Responses",
    description:
      "Check inbox after submitting reports. Club responds: interested, trial, signed, or passed. Signings boost reputation + bonuses.",
    position: "bottom",
  },
];

const regionalMission: TutorialStep[] = [
  {
    id: "reg-1",
    screen: "dashboard",
    targetSelector: "nav-internationalView",
    title: "Your Territory",
    description:
      "Open International View to see your territory. Sub-regions have familiarity scores \u2014 higher familiarity = better accuracy.",
    position: "bottom",
  },
  {
    id: "reg-2",
    screen: "calendar",
    targetSelector: "calendar-activities",
    title: "Build Local Knowledge",
    description:
      "Schedule matches in your region. Every activity increases sub-region familiarity. You gain accuracy bonuses others don\u2019t.",
    position: "left",
    nextStep: "activityScheduled",
  },
  {
    id: "reg-3",
    screen: "dashboard",
    targetSelector: "nav-network",
    title: "Your Regional Network",
    description:
      "Your contacts have deeper roots in your territory. High-relationship local contacts share exclusive intel.",
    position: "bottom",
  },
  {
    id: "reg-4",
    screen: "dashboard",
    targetSelector: "nav-finances",
    title: "Retainer Contracts",
    description:
      "Clubs hire Regional Experts on retainer for territory coverage. Build regional reputation to attract better offers.",
    position: "bottom",
  },
];

const dataMission: TutorialStep[] = [
  {
    id: "data-1",
    screen: "calendar",
    targetSelector: "calendar-activities",
    title: "Run a Database Query",
    description:
      "Schedule \u2018Database Query\u2019 to mine statistical data. Exclusive to Data Scouts. Surfaces anomalies others can\u2019t see.",
    position: "left",
    nextStep: "dataActivityScheduled",
  },
  {
    id: "data-2",
    screen: "dashboard",
    targetSelector: "dashboard-predictions",
    title: "Prediction Market",
    description:
      "Make predictions about player performance. Correct predictions earn bounties and grow your accuracy rating.",
    position: "right",
  },
  {
    id: "data-3",
    screen: "dashboard",
    targetSelector: "dashboard-data-analysts",
    title: "Build Your Team",
    description:
      "Hire data analysts to generate passive reports. Assign each to a league for continuous monitoring.",
    position: "right",
  },
  {
    id: "data-4",
    screen: "calendar",
    targetSelector: "calendar-activities",
    title: "The Data Loop",
    description:
      "Query \u2192 Flag \u2192 Observe \u2192 Validate. Schedule \u2018Attend Match\u2019 for a flagged player to confirm your statistical read with your own eyes.",
    position: "left",
  },
];

// ---------------------------------------------------------------------------
// Aha moment sequences (1 step each)
// ---------------------------------------------------------------------------

const ahaMomentYouth: TutorialSequence = {
  id: "ahaMoment:youth",
  name: "Youth Placed!",
  steps: [
    {
      id: "aha-youth",
      screen: "inbox",
      targetSelector: "inbox-latest",
      title: "Youth Placed!",
      description:
        "A club accepted your placement. You earned a fee and started tracking their career. If they make a debut, you earn Legacy Score. This is your superpower.",
      position: "right",
    },
  ],
};

const ahaMomentFirstTeam: TutorialSequence = {
  id: "ahaMoment:firstTeam",
  name: "Club Signed Your Recommendation!",
  steps: [
    {
      id: "aha-firstTeam",
      screen: "inbox",
      targetSelector: "inbox-latest",
      title: "Club Signed Your Recommendation!",
      description:
        "The club acted on your report. Reputation jumped, bonus earned. This is First Team scouting \u2014 shaping your club\u2019s squad.",
      position: "right",
    },
  ],
};

const ahaMomentRegional: TutorialSequence = {
  id: "ahaMoment:regional",
  name: "Regional Knowledge Paid Off",
  steps: [
    {
      id: "aha-regional",
      screen: "matchSummary",
      targetSelector: "match-summary-accuracy",
      title: "Regional Knowledge Paid Off",
      description:
        "Your familiarity gave you an accuracy bonus. Others see wider confidence ranges. Deep local knowledge is your edge.",
      position: "right",
    },
  ],
};

const ahaMomentData: TutorialSequence = {
  id: "ahaMoment:data",
  name: "Anomaly Validated!",
  steps: [
    {
      id: "aha-data",
      screen: "inbox",
      targetSelector: "inbox-latest",
      title: "Anomaly Validated!",
      description:
        "Your statistical flag was correct. Live observation confirms the data. Prediction bounty earned. Flag, observe, validate, profit.",
      position: "right",
    },
  ],
};

// ---------------------------------------------------------------------------
// Onboarding sequence composer
// ---------------------------------------------------------------------------

const MISSIONS: Record<Specialization, TutorialStep[]> = {
  youth: youthMission,
  firstTeam: firstTeamMission,
  regional: regionalMission,
  data: dataMission,
};

const SPEC_LABELS: Record<Specialization, string> = {
  youth: "Youth Scout",
  firstTeam: "First Team Scout",
  regional: "Regional Expert",
  data: "Data Scout",
};

function buildOnboardingSequence(
  spec: Specialization,
  career: "club" | "freelance",
): TutorialSequence {
  const fork = career === "club" ? clubFork : freelanceFork;
  return {
    id: `onboarding:${spec}:${career}`,
    name: `${SPEC_LABELS[spec]} Onboarding (${career})`,
    steps: [...commonIntro, ...fork, ...MISSIONS[spec]],
  };
}

// Generate all 8 onboarding sequences.
const SPECS: Specialization[] = ["youth", "firstTeam", "regional", "data"];
const CAREERS = ["club", "freelance"] as const;

const onboardingSequences: TutorialSequence[] = SPECS.flatMap((spec) =>
  CAREERS.map((career) => buildOnboardingSequence(spec, career)),
);

// ---------------------------------------------------------------------------
// Legacy sequences (unchanged)
// ---------------------------------------------------------------------------

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
        "Choose how strongly you back this player. Higher conviction stakes your reputation \u2014 be accurate or pay the price.",
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
        "Highlight what stands out. Your written assessment carries weight \u2014 clubs read between the lines.",
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
        "You\u2019ve reached a new career tier. Each tier unlocks access to higher-profile leagues, more club contacts, and greater weekly budgets.",
      position: "bottom",
    },
    {
      id: "cp-2",
      screen: "career",
      targetSelector: "career-perk-tree",
      title: "Perk Tree",
      description:
        "Spend earned perk points to specialise your scout. Perks compound over time \u2014 choose a path that suits your playstyle.",
      position: "right",
    },
    {
      id: "cp-3",
      screen: "calendar",
      targetSelector: "calendar-activities",
      title: "New Activities Unlocked",
      description:
        "Your new tier has unlocked additional scouting activities. Check the activity panel to see what\u2019s now available to you.",
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
        "Click a player on the pitch or use \u2018Add Focus\u2019 to track up to 3 players. Focused players reveal more attributes with better accuracy.",
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
        "Click \u2018Next Phase\u2019 when you\u2019re ready to move on. At the end of the match, all your observations are saved automatically.",
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
  ...onboardingSequences,
  firstReport,
  careerProgression,
  firstMatch,
  firstReportWriting,
  ahaMomentYouth,
  ahaMomentFirstTeam,
  ahaMomentRegional,
  ahaMomentData,
];

/** Map for O(1) lookup by id. */
const sequenceMap = new Map<string, TutorialSequence>(
  TUTORIAL_SEQUENCES.map((s) => [s.id, s]),
);

/** Look up a sequence by its id. Returns undefined if not found. */
export function getSequenceById(id: string): TutorialSequence | undefined {
  return sequenceMap.get(id);
}
