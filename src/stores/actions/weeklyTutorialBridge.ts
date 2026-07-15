import { useTutorialStore } from "@/stores/tutorialStore";
import type { WeeklyTutorialCommand } from "./weeklyWorkerTypes";

/** Replay worker-produced presentation commands through the browser UI store. */
export function applyWeeklyTutorialCommands(
  commands: readonly WeeklyTutorialCommand[],
): void {
  for (const command of commands) {
    const tutorial = useTutorialStore.getState();
    switch (command.type) {
      case "completeMilestone":
        tutorial.completeMilestone(command.id);
        break;
      case "startSequence":
        tutorial.startSequence(command.id);
        break;
      case "queueSequence":
        tutorial.queueSequence(command.id);
        break;
      case "showHint":
        tutorial.showHint(command.hint);
        break;
      case "recordFeatureDiscovery":
        tutorial.recordFeatureDiscovery(command.feature);
        break;
    }
  }
}
