import type { GameScreen } from "@/stores/gameStore";
import type { GuidedMilestoneId } from "@/stores/tutorialStore";
import type { SessionState } from "@/engine/observation/types";
import type { ObservationHalftimeApproach } from "@/engine/core/types";

export interface GuidedMilestoneInstructionInput {
  milestoneId: GuidedMilestoneId;
  currentScreen: GameScreen;
  observationState?: SessionState | null;
  observationPhaseIndex?: number | null;
  observationIsHalfTime?: boolean;
  observationHalftimeApproach?: ObservationHalftimeApproach | null;
  isYouthDiscoveryHook?: boolean;
}

export function getGuidedMilestoneInstruction(
  input: GuidedMilestoneInstructionInput,
): string {
  switch (input.milestoneId) {
    case "flaggedBreakthrough":
      return "Flag a moment from your lead, then choose the reaction the evidence deserves.";
    case "completedMatch":
      if (input.currentScreen === "observation" && input.observationState === "reflection") {
        return "Select Complete Reflection to lock the read and the remaining doubt.";
      }
      if (input.currentScreen === "observation" && input.observationIsHalfTime) {
        return input.observationHalftimeApproach
          ? "Focus resets at halftime. Reapply a lens to the player you want to watch, then select Next phase."
          : "Choose how to watch the second half: confirm, challenge, or broaden. Focus resets at halftime, so reapply a lens before the next phase.";
      }
      return "Select Next phase until Reflection is available.";
    case "resolvedOpeningDiscovery":
      return "Choose who hears the name: keep it private, call a club, or ask your source to verify.";
    case "wroteReport":
      return input.isYouthDiscoveryHook
        ? "Complete the five assessment decisions: evidence, what it suggests, what is untested, the next test, and confidence."
        : "Record the judgment you can defend and set the conviction behind it.";
    case "submittedReport":
      return input.isYouthDiscoveryHook
        ? "Select File initial assessment once the five decisions are ready."
        : "Submit the report from the conviction panel once the judgment is ready.";
    case "checkedInbox":
      return "List the report from Reports so the market can answer back.";
    case "openedCalendar":
      return "Open Calendar to plan the next context.";
    case "scheduledActivity":
      return "Schedule one activity that tests the open question.";
    case "advancedWeek":
      return "Advance the week to let the plan play out.";
    case "attendedMatch":
      return "Start the live session and begin watching.";
    case "focusedPlayer":
      return input.isYouthDiscoveryHook
        ? "Choose your prospect in Players in view, then choose a lens under Your attention."
        : "Choose a player and apply a focus lens.";
    case "viewedDashboard":
      return "Take a quick read of the dashboard, then move on.";
    default:
      return "Complete the highlighted action to continue.";
  }
}
