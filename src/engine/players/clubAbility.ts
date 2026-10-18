/** The authored ability range for a club's generated senior squad. */
export function getClubAbilityRange(reputation: number): readonly [number, number] {
  const repFraction = (reputation - 10) / 90;
  return [
    Math.round(15 + repFraction * 110),
    Math.round(40 + repFraction * 160),
  ];
}

/**
 * Stable sporting benchmark before individual generation jitter or development.
 * Vacancies must not lower the standard used to evaluate a renewal.
 */
export function getClubAbilityMidpoint(reputation: number): number {
  const [minimum, maximum] = getClubAbilityRange(reputation);
  return (minimum + maximum) / 2;
}
