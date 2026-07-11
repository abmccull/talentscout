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
  DEFAULT_GUIDED_MILESTONES[0],
  DEFAULT_GUIDED_MILESTONES[1],
  {
    id: "scheduledActivity",
    target: "calendar-activities",
    title: "Schedule a school match",
    mentorText:
      "Start with a school match. That is your cleanest first look at live youth talent this week. " +
      "Schedule it from the activity panel so we can get you into a proper observation session.",
    mentorTextFreelance:
      "Book yourself a school match. It's the simplest live route into your first real youth read. " +
      "Drop it onto the calendar and we'll work from there.",
    position: "left",
    interactive: true,
    screen: "calendar",
  },
  {
    id: "advancedWeek",
    target: "advance-week",
    title: "Advance to the school match",
    mentorText:
      "Good. Advance the week and let the days play out. When the school match comes up, launch the live session so you're assessing real moments rather than guessing from a summary.",
    mentorTextFreelance:
      "Advance the week. When your school match day arrives, open the live session and scout it properly.",
    position: "top",
    interactive: true,
    screen: "calendar",
  },
  {
    id: "attendedMatch",
    target: "observation-begin-session",
    title: "Begin the school match session",
    mentorText:
      "This is your live school match observation. Hit begin and work through it phase by phase. Your reads come from what actually happens here, not from first-team match summaries.",
    mentorTextFreelance:
      "This is the real job now. Start the school match session and build your notes from what you actually see.",
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
    id: "completedMatch",
    target: "observation-session-controls",
    title: "Complete the observation session",
    mentorText:
      "Keep moving through the phases, then finish the reflection. A session only counts when you've seen it through and logged the result properly.",
    mentorTextFreelance:
      "Don't bail early. Work through the phases, finish the reflection, and close the session cleanly so the week gets the full value.",
    position: "top",
    interactive: true,
    screen: "observation",
  },
  {
    id: "wroteReport",
    target: "report-conviction",
    title: "Write up what you learned",
    mentorText:
      "Now turn that youth observation into a clear write-up. Keep the conviction level honest and tie every claim back to something you actually saw.",
    mentorTextFreelance:
      "Write the report while the session is still fresh. Good youth notes are specific, restrained, and usable later.",
    position: "right",
    interactive: true,
    screen: "reportWriter",
  },
  {
    id: "submittedReport",
    target: "report-submit",
    title: "Submit the scouting write-up",
    mentorText:
      "Submit the report once the summary reflects the school match properly. Clean reporting is how you turn raw observation into reputation.",
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
