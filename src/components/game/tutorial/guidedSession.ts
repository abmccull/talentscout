/**
 * Guided First Week — milestone definitions.
 *
 * Defines the 10 sequential milestones the player must complete during their
 * first week.  Each milestone carries mentor dialogue for both the club path
 * (Margaret Chen) and the freelance/independent path (Tommy Reyes), a target
 * selector that matches a `data-tutorial-id` attribute in the DOM, and
 * metadata used by GuidedChecklist to render and navigate.
 */

import type { GuidedMilestoneId } from "@/stores/tutorialStore";
import { useGameStore } from "@/stores/gameStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GuidedMilestoneDefinition {
  id: GuidedMilestoneId;
  /** data-tutorial-id values to spotlight, in priority order when a step evolves */
  target: string | readonly string[];
  /** Short title for the checklist */
  title: string;
  /** Mentor speech for the club path (Margaret Chen) */
  mentorText: string;
  /** Mentor speech for the freelance/independent path (Tommy Reyes) */
  mentorTextFreelance: string;
  /** Where to position the mentor card relative to the target element */
  position: "top" | "bottom" | "left" | "right";
  /**
   * True if the step completes automatically when the player performs the
   * indicated action — no "Next" button is shown.
   */
  interactive: boolean;
  /** The GameScreen value the player must be on when this milestone is active */
  screen: string;
}

// ---------------------------------------------------------------------------
// Milestone definitions
// ---------------------------------------------------------------------------

const DEFAULT_GUIDED_MILESTONES: GuidedMilestoneDefinition[] = [
  {
    id: "viewedDashboard",
    target: "dashboard-overview",
    title: "View your dashboard",
    mentorText:
      "Welcome to your club. I'm Margaret Chen, Director of Recruitment. " +
      "This is your hub — [[reputation]], [[fatigue]], and finances at a glance. " +
      "Let's get you started.",
    mentorTextFreelance:
      "Welcome to the scouting life. I'm Tommy Reyes — been doing this 20 years. " +
      "This dashboard shows everything you need: [[reputation]], [[fatigue]], and your [[savings]]. " +
      "Let me show you the ropes.",
    position: "right",
    interactive: false,
    screen: "dashboard",
  },
  {
    id: "openedCalendar",
    target: ["mobile-nav-calendar", "nav-calendar"],
    title: "Open the calendar",
    mentorText:
      "Open your calendar. Every week you'll plan what to do — attend matches, scout players, rest. " +
      "Go on, click Calendar.",
    mentorTextFreelance:
      "First thing every week: plan your schedule. " +
      "Open the calendar — that's where you'll decide what to do with your time.",
    position: "bottom",
    interactive: true,
    screen: "dashboard",
  },
  {
    id: "scheduledActivity",
    target: "calendar-activities",
    title: "Schedule an activity",
    mentorText:
      "Good. Now schedule a match to attend. " +
      "Pick one from the activity panel — the manager wants you watching players this week.",
    mentorTextFreelance:
      "Now pick a match to attend. " +
      "Drag an activity from the panel on the right into a day slot. " +
      "This is how you'll find talent to report on.",
    position: "left",
    interactive: true,
    screen: "calendar",
  },
  {
    id: "advancedWeek",
    target: "advance-week",
    title: "Advance the week",
    mentorText:
      "Activity scheduled. Now advance the week — click the button to play out your schedule and head to the match.",
    mentorTextFreelance:
      "You're set. Hit the advance button to play out the week. Time to see what you're made of.",
    position: "top",
    interactive: true,
    screen: "calendar",
  },
  {
    id: "attendedMatch",
    target: "match-scoreboard",
    title: "Attend a match",
    mentorText:
      "Here we are. The match is broken into [[match-phase]]s. " +
      "Watch the play, read the commentary — you're here to assess players, not enjoy the football.",
    mentorTextFreelance:
      "This is it — your first scouting assignment. " +
      "Each phase shows you what's happening on the pitch. Pay attention.",
    position: "bottom",
    interactive: false,
    screen: "match",
  },
  {
    id: "focusedPlayer",
    target: "match-focus-panel",
    title: "Focus on a player",
    mentorText:
      "Now focus on a player. " +
      "Click someone on the pitch or use the focus panel. " +
      "Focused players reveal more — choose your [[focus-lens]] wisely.",
    mentorTextFreelance:
      "Pick a player to focus on. You can track up to three. " +
      "Focused players give you better reads on their attributes.",
    position: "left",
    interactive: true,
    screen: "match",
  },
  {
    id: "completedMatch",
    target: "match-advance-btn",
    title: "Complete the match",
    mentorText:
      "Keep advancing through phases. " +
      "When the match ends, all your [[observation]]s are saved automatically.",
    mentorTextFreelance:
      "Work through each phase. When the final whistle goes, your [[observation]]s are locked in.",
    position: "top",
    interactive: true,
    screen: "match",
  },
  {
    id: "wroteReport",
    target: "report-conviction",
    title: "Finish the report write-up",
    mentorText:
      "Finish the report properly before you send it. " +
      "Set your [[conviction-level]] and make sure the write-up reflects what you actually saw — stronger conviction means higher stakes for your [[reputation]].",
    mentorTextFreelance:
      "This is where the write-up earns its keep. Set your [[conviction-level]] and make sure your notes back it up. " +
      "If you're confident, stake your reputation. If you're unsure, play it safe.",
    position: "right",
    interactive: true,
    screen: "reportWriter",
  },
  {
    id: "submittedReport",
    target: "report-submit",
    title: "Submit the report",
    mentorText:
      "Fill in your assessment and submit. " +
      "The manager will respond based on your [[report-quality]] and [[conviction-level]].",
    mentorTextFreelance:
      "Write your strengths and weaknesses, then submit. " +
      "Your report goes to whoever's listening — make it count.",
    position: "top",
    interactive: true,
    screen: "reportWriter",
  },
  {
    id: "checkedInbox",
    target: "report-marketplace-prompt",
    title: "List your first report",
    mentorText:
      "Put that report on the marketplace. " +
      "That's the loop now: Observe, Report, List. Advance more weeks and the bids will start to arrive.",
    mentorTextFreelance:
      "List the report instead of waiting on an empty inbox. " +
      "Advance more weeks after listing it and clubs will start bidding if the intel is worth paying for.",
    position: "bottom",
    interactive: true,
    screen: "reportHistory",
  },
];

const YOUTH_GUIDED_MILESTONES: GuidedMilestoneDefinition[] = [
  {
    id: "attendedMatch",
    target: "observation-begin-session",
    title: "Take the first look",
    mentorText:
      "A school match started early and no academy scout is here yet. One player produced a moment worth a second look. " +
      "Begin the session. You are not here to confirm a star—you are here to notice evidence before everyone else.",
    mentorTextFreelance:
      "A school match started early. Nobody from an academy has arrived. " +
      "Start watching. One action can open a case, but it cannot finish one.",
    position: "top",
    interactive: true,
    screen: "observation",
  },
  {
    id: "focusedPlayer",
    target: ["observation-focus-lens", "observation-focus-panel"],
    title: "Focus on a youth prospect",
    mentorText:
      "Select Focus on your prospect, then choose a lens. That is how you turn a busy school match into a usable read.",
    mentorTextFreelance:
      "Select Focus on one prospect, then pick a lens. Focus trades a broad look for a cleaner read.",
    position: "left",
    interactive: true,
    screen: "observation",
  },
  {
    id: "flaggedBreakthrough",
    target: [
      "observation-promising-reaction",
      "observation-flag-moment",
      "observation-advance-to-standout",
    ],
    title: "Record the standout moment",
    mentorText:
      "There it is—the action that changes the question. Select Flag moment, then mark it Promising. " +
      "You have not proved the player is special; you have earned a reason to keep watching.",
    mentorTextFreelance:
      "That is why we came. Select Flag moment, then mark it Promising while it is fresh. " +
      "You found a signal, not an answer. The next context decides whether you were early or merely impressed.",
    position: "left",
    interactive: true,
    screen: "observation",
  },
  {
    id: "completedMatch",
    target: [
      "observation-session-controls",
      "observation-complete-reflection",
      "observation-halftime-approach",
    ],
    title: "Complete the observation session",
    mentorText:
      "Now test the first impression against the rest of the match. Choose a half-time approach, then select Complete Reflection so the doubt stays visible with the highlight.",
    mentorTextFreelance:
      "Choose how you will watch the second half. Then select Complete Reflection and keep the uncertainty on the record.",
    position: "top",
    interactive: true,
    screen: "observation",
  },
  {
    id: "resolvedOpeningDiscovery",
    target: "opening-discovery-choices",
    title: "Decide who hears the name",
    mentorText:
      "You have a lead, not a finished judgment. Choose one of the three next moves: keep the name private, call a club, or ask your source to verify.",
    mentorTextFreelance:
      "The watch is done. Pick who hears the name next. Each choice is a real career move, not a tutorial skip.",
    position: "left",
    interactive: true,
    screen: "openingDiscovery",
  },
  {
    id: "wroteReport",
    target: "report-conviction",
    title: "Write the first assessment",
    mentorText:
      "This is the same report writer you will use later. Complete the five decisions: the saved evidence, what it suggests, what remains untested, the next test, and your confidence.",
    mentorTextFreelance:
      "File a first assessment, not a hunch. Work the five decisions on this page — evidence, claim, unknown, next test, confidence.",
    position: "right",
    interactive: true,
    screen: "reportWriter",
  },
  {
    id: "submittedReport",
    target: "report-submit",
    title: "File the first assessment",
    mentorText:
      "When the five decisions are complete, select File initial assessment. That opens an accountable case.",
    mentorTextFreelance:
      "Select File initial assessment once the five decisions are ready. A tight first read beats hype.",
    position: "top",
    interactive: true,
    screen: "reportWriter",
  },
  {
    id: "advancedWeek",
    target: "advance-week",
    title: "Let the world answer back",
    mentorText:
      "Advance the week. Your plan will meet form, rival attention, club deadlines, and chance. The consequences will not wait for perfect certainty.",
    mentorTextFreelance:
      "Run the week. From here, the case lives in the world: contacts remember, rivals move, clubs react, and your original judgment stays on the record.",
    position: "top",
    interactive: true,
    screen: "calendar",
  },
];

function isYouthGuidedSession(): boolean {
  return useGameStore.getState().gameState?.scout.primarySpecialization === "youth";
}

export function getYouthGuidedMilestones(): readonly GuidedMilestoneDefinition[] {
  return YOUTH_GUIDED_MILESTONES;
}

function getActiveGuidedMilestones(): GuidedMilestoneDefinition[] {
  return isYouthGuidedSession() ? [...YOUTH_GUIDED_MILESTONES] : DEFAULT_GUIDED_MILESTONES;
}

export const GUIDED_MILESTONES = new Proxy([] as GuidedMilestoneDefinition[], {
  get(_target, prop) {
    const milestones = getActiveGuidedMilestones();
    const value = Reflect.get(milestones, prop);
    return typeof value === "function" ? value.bind(milestones) : value;
  },
  ownKeys() {
    return Reflect.ownKeys(getActiveGuidedMilestones());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(getActiveGuidedMilestones(), prop) ?? {
      configurable: true,
      enumerable: true,
      writable: false,
      value: undefined,
    };
  },
}) as GuidedMilestoneDefinition[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up a single milestone definition by ID.
 * Returns undefined if the ID is not found (should not happen in practice,
 * but guards against mismatches during development).
 */
export function getGuidedMilestone(
  id: GuidedMilestoneId,
): GuidedMilestoneDefinition | undefined {
  return getActiveGuidedMilestones().find((m) => m.id === id);
}

/**
 * Count how many milestones have been marked complete in the given record.
 */
export function getCompletedCount(
  milestones: Record<GuidedMilestoneId, boolean>,
): number {
  return Object.values(milestones).filter(Boolean).length;
}

/**
 * Return the total number of guided milestones for the active path.
 */
export function getTotalCount(): number {
  return getActiveGuidedMilestones().length;
}
