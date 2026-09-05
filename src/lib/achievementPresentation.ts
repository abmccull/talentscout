import type { AchievementDef } from "./achievements";

const DISCOVERY_MILESTONE_NAMES: Record<string, string> = {
  "wonderkid-found": "A Judgment Rewarded",
  "discoveries-5": "A Growing Track Record",
  "discoveries-15": "An Established Eye",
  "generational-talent": "Career Maker",
};

/** Celebrate earned milestones without presenting hidden potential as scout knowledge. */
export function achievementPresentation(achievement: AchievementDef) {
  const name = DISCOVERY_MILESTONE_NAMES[achievement.id];
  return name ? {
    name,
    description: achievement.description,
    hint: achievement.hint,
    showProgress: true,
  } : {
    name: achievement.name, description: achievement.description,
    hint: achievement.hint, showProgress: true,
  };
}
