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
  /** data-tutorial-id of the element to spotlight */
  target: string;
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
    target: "nav-calendar",
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
      "A school match started early. Nobody from an academy has arrived, but I was told one name might be worth writing down. " +
      "Start watching. One action can open a case, but it cannot finish one.",
    position: "top",
    interactive: true,
    screen: "observation",
  },
  {
    id: "focusedPlayer",
    target: "observation-focus-panel",
    title: "Focus on a youth prospect",
    mentorText:
      "Pick a prospect and commit focus. That is how you turn a busy school match into a usable read. Use the lens that matches what you're trying to learn.",
    mentorTextFreelance:
      "Lock onto one prospect first. Focus is how you trade broad exposure for a deeper, cleaner read.",
    position: "left",
    interactive: true,
    screen: "observation",
  },
  {
    id: "flaggedBreakthrough",
    target: "observation-evidence-feed",
    title: "Write the moment down",
    mentorText:
      "There it is—the action that changes the question. Flag the moment as promising. " +
      "You have not proved the player is special; you have earned a reason to build the case.",
    mentorTextFreelance:
      "That is why we came. Flag the breakthrough while it is fresh. " +
      "Remember: you found a signal, not an answer. The next context decides whether you were early or merely impressed.",
    position: "left",
    interactive: true,
    screen: "observation",
  },
  {
    id: "completedMatch",
    target: "observation-session-controls",
    title: "Complete the observation session",
    mentorText:
      "Now test the first impression against the rest of the match. Finish the reflection and preserve the uncertainty, not just the highlight.",
    mentorTextFreelance:
      "Watch what happens after the standout moment. Finish the reflection and decide what you actually believe.",
    position: "top",
    interactive: true,
    screen: "observation",
  },
  {
    id: "wroteReport",
    target: "report-conviction",
    title: "Write up what you learned",
    mentorText:
      "You were first to write the name down. Now turn the moment and the contradiction into a professional opinion. Keep conviction proportional to the evidence.",
    mentorTextFreelance:
      "The name is in your notebook. Write the report while the evidence is fresh, and let the uncertainty stay visible.",
    position: "right",
    interactive: true,
    screen: "reportWriter",
  },
  {
    id: "submittedReport",
    target: "report-submit",
    title: "Submit the scouting write-up",
    mentorText:
      "Submit once the summary reflects the school match properly. This opens an accountable case whose delivery and outcome can shape your reputation.",
    mentorTextFreelance:
      "Send it when the notes are tight. A disciplined youth report is worth more than hype.",
    position: "top",
    interactive: true,
    screen: "reportWriter",
  },
  {
    id: "checkedInbox",
    target: "report-marketplace-prompt",
    title: "List your first report",
    mentorText:
      "List the youth report on the marketplace. That closes the real loop: observe the school match, write it up, then put the intel where buyers can act on it. Bids come after you advance more weeks.",
    mentorTextFreelance:
      "Don't go looking for feedback in an empty inbox. List the report, advance a few weeks, and let the market tell you whether the read has value.",
    position: "bottom",
    interactive: true,
    screen: "reportHistory",
  },
  {
    id: "openedCalendar",
    target: "nav-calendar",
    title: "Plan the second look",
    mentorText:
      "The first report preserves what you saw; it does not end the case. Open the Planner and choose the next context before the trail cools.",
    mentorTextFreelance:
      "You have a name and a first opinion. Now open the Planner. The second context is where a lucky highlight starts becoming a real scouting case.",
    position: "bottom",
    interactive: true,
    screen: "reportHistory",
  },
  {
    id: "scheduledActivity",
    target: "calendar-activities",
    title: "Spend the week with intent",
    mentorText:
      "Schedule the work that best tests your open question. Another live context adds more than repeating the same easy observation.",
    mentorTextFreelance:
      "Time is your scarce resource. Schedule a follow-up, contact conversation, or contrasting venue that can prove your first read wrong.",
    position: "left",
    interactive: true,
    screen: "calendar",
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

function getActiveGuidedMilestones(): GuidedMilestoneDefinition[] {
  return isYouthGuidedSession() ? YOUTH_GUIDED_MILESTONES : DEFAULT_GUIDED_MILESTONES;
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
 * Return the total number of guided milestones (always 10).
 */
export function getTotalCount(): number {
  return getActiveGuidedMilestones().length;
}
