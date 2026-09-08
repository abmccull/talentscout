/** Shared market baseline; the original world-generation curve and rounding. */
export function calculatePlayerWeeklyWage(currentAbility: number, clubReputation: number): number {
  const abilityFactor = Math.pow(currentAbility / 100, 2.2);
  return Math.round(abilityFactor * 50_000 * (clubReputation / 80) / 500) * 500;
}

/** Existing pay remains an anchor; a small-club player does not inherit a global CA floor. */
export function getContractWageBaseline(
  player: { currentAbility: number; wage: number },
  clubReputation: number,
): number {
  return Math.max(100, player.wage, calculatePlayerWeeklyWage(player.currentAbility, clubReputation));
}
