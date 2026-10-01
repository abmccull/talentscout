import type { Weather } from "@/engine/core/types";
import type { RNG } from "@/engine/rng";

export function scoringWeatherModifier(weather: Weather): number {
  return { clear: 1, cloudy: 0.98, rain: 0.92, heavyRain: 0.85, snow: 0.80, windy: 0.90 }[weather];
}

/** Common scoring calibration for detailed and background competitions.
 * Strength is the team's contribution across eleven places, not its roster size.
 */
export function calculateFixtureExpectedGoals(homeStrength: number, awayStrength: number,
  homeTacticalModifier = 1, awayTacticalModifier = 1, weather: Weather = "clear",
): { home: number; away: number } {
  const home = Math.max(0, Number.isFinite(homeStrength) ? homeStrength : 0);
  const away = Math.max(0, Number.isFinite(awayStrength) ? awayStrength : 0);
  const total = home + away;
  if (total === 0) return { home: 0, away: 0 };
  const conditions = scoringWeatherModifier(weather);
  return {
    home: home > 0 ? Math.max(0, (home / total * 2.6 * homeTacticalModifier + 0.3) * conditions) : 0,
    away: away > 0 ? Math.max(0, away / total * 2.6 * awayTacticalModifier * conditions) : 0,
  };
}

/** Discrete goal counts without the upward bias of rounding/clipping a Gaussian.
 * The generous tail guard bounds work even with a malformed RNG implementation.
 */
export function sampleFixtureGoals(expected: number, rng: RNG): number {
  if (!Number.isFinite(expected) || expected <= 0) return 0;
  const limit = Math.exp(-Math.min(expected, 6));
  let product = 1, draws = 0;
  do { draws++; product *= Math.max(rng.next(), 1e-9); } while (product > limit && draws <= 12);
  return draws - 1;
}
