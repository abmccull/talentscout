import { estimatePlayerWeeklyWage } from "../players/wages";

/** Compatibility name for the shared, bounded world-generation wage curve. */
export const calculatePlayerWeeklyWage = estimatePlayerWeeklyWage;

/** Existing pay and destination stature anchor ordinary contract negotiations. */
export function getContractWageBaseline(
  player: { currentAbility: number; wage: number },
  clubReputation: number,
): number {
  return Math.max(100, player.wage, estimatePlayerWeeklyWage(player.currentAbility, clubReputation));
}
