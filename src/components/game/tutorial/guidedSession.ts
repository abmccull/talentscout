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

export const GUIDED_MILESTONES: GuidedMilestoneDefinition[] = [
  {
    id: "viewedDashboard",
    target: "dashboard-overview",
    title: "View your dashboard",
    mentorText:
      "Welcome to your club. I'm Margaret Chen, Director of Recruitment. " +
      "This is your hub — reputation, fatigue, and finances at a glance. " +
      "Let's get you started.",
    mentorTextFreelance:
      "Welcome to the scouting life. I'm Tommy Reyes — been doing this 20 years. " +
      "This dashboard shows everything you need: reputation, fatigue, and your savings. " +
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
    target: "calendar-advance-btn",
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
      "Here we are. The match is broken into phases. " +
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
      "Focused players reveal more — choose your lens wisely.",
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
      "When the match ends, all your observations are saved automatically.",
    mentorTextFreelance:
      "Work through each phase. When the final whistle goes, your observations are locked in.",
    position: "top",
    interactive: true,
    screen: "match",
  },
  {
    id: "wroteReport",
    target: "report-conviction",
    title: "Write a report",
    mentorText:
      "Time to write your report. " +
      "Choose your conviction level carefully — higher conviction means higher stakes for your reputation.",
    mentorTextFreelance:
      "Here's where your opinion matters. Pick a conviction level. " +
      "If you're confident, stake your reputation. If you're unsure, play it safe.",
    position: "right",
    interactive: false,
    screen: "reportWriter",
  },
  {
    id: "submittedReport",
    target: "report-submit",
    title: "Submit the report",
    mentorText:
      "Fill in your assessment and submit. " +
      "The manager will respond based on your report quality and conviction.",
    mentorTextFreelance:
      "Write your strengths and weaknesses, then submit. " +
      "Your report goes to whoever's listening — make it count.",
    position: "top",
    interactive: true,
    screen: "reportWriter",
  },
  {
    id: "checkedInbox",
    target: "nav-inbox",
    title: "Check your inbox",
    mentorText:
      "Check your inbox for the club's response. " +
      "That's the core loop: Observe, Report, Repeat. You've got this.",
    mentorTextFreelance:
      "Check your inbox. That's the scouting cycle: watch, report, get feedback. " +
      "Do it well and the offers start coming.",
    position: "bottom",
    interactive: true,
    screen: "dashboard",
  },
];

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
  return GUIDED_MILESTONES.find((m) => m.id === id);
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
  return GUIDED_MILESTONES.length;
}
