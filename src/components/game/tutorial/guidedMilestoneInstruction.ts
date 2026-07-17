import type { GameScreen } from "@/stores/gameStore";
import type { GuidedMilestoneId } from "@/stores/tutorialStore";
import type { SessionState } from "@/engine/observation/types";

export interface GuidedMilestoneInstructionInput {
  milestoneId: GuidedMilestoneId;
  currentScreen: GameScreen;
  observationState?: SessionState | null;
}

export function getGuidedMilestoneInstruction(
  input: GuidedMilestoneInstructionInput,
): string {
  switch (input.milestoneId) {
    case "flaggedBreakthrough":
      return "Flag the standout moment, then classify it as Promising.";
    case "completedMatch":
      if (input.currentScreen === "observation" && input.observationState === "reflection") {
        return "Complete Reflection to lock the read and the remaining doubt.";
      }
      return "Advance through the remaining phases until Reflection is available.";
    case "wroteReport":
      return "Record the judgment you can defend and set the conviction behind it.";
    case "submittedReport":
      return "Submit the report from the conviction panel once the judgment is ready.";
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
      return "Choose a player and apply a focus lens.";
    case "viewedDashboard":
      return "Take a quick read of the dashboard, then move on.";
    default:
      return "Complete the highlighted action to continue.";
  }
}
