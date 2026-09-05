import type { AchievementDef } from "./achievements";

const DISCOVERY_MILESTONE_NAMES: Record<string, string> = {
  "wonderkid-found": "A Name to Follow",
  "discoveries-5": "A Growing Notebook",
  "discoveries-15": "A Broader Record",
  "generational-talent": "An Unexpected Lead",
};

/** Celebrate earned milestones without presenting hidden potential as scout knowledge. */
export function achievementPresentation(achievement: AchievementDef) {
  const name = DISCOVERY_MILESTONE_NAMES[achievement.id];
  return name ? {
    name,
    description: "A discovery milestone is recorded. Keep testing your assessments as these careers unfold.",
    hint: "Keep scouting young players and revisiting your early judgments.",
    showProgress: false,
  } : {
    name: achievement.name, description: achievement.description,
    hint: achievement.hint, showProgress: true,
  };
}
