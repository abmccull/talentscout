import type { Scout, ScoutSkill } from "@/engine/core/types";

/**
 * Apply direct skill-XP awards with carry-over and multi-level support.
 * Calendar training, loan accountability, and other event rewards share this
 * path so the displayed XP and actual scout progression cannot diverge.
 */
export function applyScoutSkillXp(
  scout: Scout,
  gains: Partial<Record<ScoutSkill, number>>,
): Scout {
  const skills = { ...scout.skills };
  const skillXp = { ...scout.skillXp };

  for (const [skill, award] of Object.entries(gains) as [ScoutSkill, number][]) {
    if (!award || award <= 0 || skills[skill] >= 20) continue;
    let xp = (skillXp[skill] ?? 0) + award;
    while (skills[skill] < 20 && xp >= skills[skill] * 10) {
      xp -= skills[skill] * 10;
      skills[skill] += 1;
    }
    skillXp[skill] = skills[skill] >= 20 ? 0 : xp;
  }

  return { ...scout, skills, skillXp };
}
