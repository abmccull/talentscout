const ordinaryRecord = value => value !== null && typeof value === "object"
  && Object.getPrototypeOf(value) === Object.prototype;
const leagueClubCounts = [20, 24, 24, 24];
const receiptFields = ["kind", "leagueClubCounts", "weeksPerSeason", "maxCanonicalTicks"];
const completionFields = ["reachedSeason", "reachedWeek", "canonicalTicks", "calendarWeeksSpanned"];

// This checks completed evidence; the real worker separately admits its world.
// No coercion, mutation, I/O, runtime probes or global/modded-calendar clamp.
export function validateReleaseCalendarReceipt(run, seasonCount) {
  if (!Number.isSafeInteger(seasonCount) || seasonCount <= 0) {
    return ["calendar admission requires a positive safe integer season count"];
  }
  const maximum = seasonCount * 46;
  if (!Number.isSafeInteger(maximum)) {
    return ["calendar admission maximum must be a safe integer"];
  }
  if (!ordinaryRecord(run)) return ["calendar admission requires a completed run object"];
  const failures = [];
  const receipt = run.calendarAdmission;
  if (!Object.hasOwn(run, "calendarAdmission") || !ordinaryRecord(receipt)
    || receiptFields.some(field => !Object.hasOwn(receipt, field))
    || receipt.kind !== "fresh-builtin-england-v1"
    || !Array.isArray(receipt.leagueClubCounts) || receipt.leagueClubCounts.length !== 4
    || leagueClubCounts.some((count, index) => !Object.hasOwn(receipt.leagueClubCounts, index)
      || receipt.leagueClubCounts[index] !== count)
    || receipt.weeksPerSeason !== 46 || receipt.maxCanonicalTicks !== maximum) {
    failures.push("calendar admission receipt must match fresh built-in England and the requested seasons");
  }
  if (completionFields.some(field => !Object.hasOwn(run, field))
    || run.reachedSeason !== seasonCount + 1 || run.reachedWeek !== 1
    || run.canonicalTicks !== maximum || run.calendarWeeksSpanned !== maximum) {
    failures.push("calendar admission requires exact completed ticks, span, and final S(seasons+1) W1");
  }
  return failures;
}
