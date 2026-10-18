/** Shared fictional-market wage scale for player generation and club planning. */
export function estimatePlayerWeeklyWage(currentAbility: number, clubReputation: number): number {
  const ability = Math.max(0, Math.min(200, currentAbility));
  const reputation = Math.max(0, Math.min(100, clubReputation));
  const weekly = Math.pow(ability / 100, 2.2) * 50_000 * (reputation / 80);
  return Math.round(weekly / 500) * 500;
}

/** Fictional academy registration scale; senior terms are negotiated separately. */
export function estimateAcademyWeeklyWage(currentAbility: number, clubReputation: number): number {
  const registrationWage = estimatePlayerWeeklyWage(currentAbility, clubReputation) * 0.05;
  return Math.round(Math.max(100, Math.min(2_000, registrationWage)) / 50) * 50;
}

/** Contract discussions share the generation scale and respect the existing deal. */
export function estimateContractWageBaseline(
  currentAbility: number,
  clubReputation: number,
  currentWage: number = 0,
): number {
  return Math.max(500, currentWage, estimatePlayerWeeklyWage(currentAbility, clubReputation));
}
