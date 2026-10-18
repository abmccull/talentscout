/** Season ordinals use the original 2024 opening; old saves may store the year. */
export const FIRST_SEASON_YEAR = 2024;

export function getSeasonStartYear(season: number): number {
  if (!Number.isInteger(season) || season < 1) {
    throw new RangeError(`Invalid season: ${season}`);
  }
  return season >= 1900 ? season : FIRST_SEASON_YEAR + season - 1;
}

/** Ages advance together at rollover, rather than on individual birthdays. */
export function getSeasonBirthYear(age: number, season: number): number {
  if (!Number.isInteger(age) || age < 0) {
    throw new RangeError(`Invalid player age: ${age}`);
  }
  return getSeasonStartYear(season) - age;
}

/** UTC avoids different fixture dates on machines in different time zones. */
export function getSeasonWeekDate(week: number, season: number): string {
  if (!Number.isInteger(week) || week < 1) {
    throw new RangeError(`Invalid game week: ${week}`);
  }
  return new Date(Date.UTC(getSeasonStartYear(season), 7, 10 + (week - 1) * 7))
    .toISOString().slice(0, 10);
}
