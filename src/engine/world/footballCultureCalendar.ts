import type { AttributeDomain } from "@/engine/core/types";
import { listFootballCultureCalendarWindows } from "@/engine/world/footballCulturePlaybooks";
import { normalizeCountryKey } from "@/lib/country";

export interface CountrySeasonCalendarWindow {
  id: string;
  label: string;
  countryId: string;
  season: number;
  baseStartWeek: number;
  baseEndWeek: number;
  startWeek: number;
  endWeek: number;
  weekShift: number;
  intensityModifier: number;
  activeWorldConditionIds: string[];
  generationKey: string;
  signalByDomain: Partial<Record<AttributeDomain, number>>;
  uncertaintyMultiplier: number;
  misleadingSignalRiskDelta: number;
  contextTags: string[];
  biasWarnings: string[];
  reasons: string[];
}

export interface CountrySeasonCalendar {
  countryId: string;
  season: number;
  weeksPerSeason: number;
  rootSeed?: string;
  activeWorldConditionIds: string[];
  generationKey: string;
  windows: CountrySeasonCalendarWindow[];
}

export interface CountryCalendarEffects {
  countryId?: string;
  season?: number;
  week?: number;
  activeWindowIds: string[];
  signalByDomain: Record<AttributeDomain, number>;
  uncertaintyMultiplier: number;
  misleadingSignalRiskDelta: number;
  contextTags: string[];
  biasWarnings: string[];
  reasons: string[];
}

export interface FootballCultureCalendarOptions {
  weeksPerSeason?: number;
  rootSeed?: string;
  activeWorldConditionIds?: readonly string[];
}

const ATTRIBUTE_DOMAINS: AttributeDomain[] = [
  "technical",
  "physical",
  "mental",
  "tactical",
  "hidden",
];

function canonicalCountry(countryId?: string): string | undefined {
  const normalized = normalizeCountryKey(countryId);
  if (normalized) return normalized;
  const compact = countryId?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact || undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function emptySignal(): Record<AttributeDomain, number> {
  return {
    technical: 0,
    physical: 0,
    mental: 0,
    tactical: 0,
    hidden: 0,
  };
}

function normalizeWeek(week: number, weeksPerSeason: number): number {
  const base = Math.max(1, Math.floor(week));
  if (base <= weeksPerSeason) return base;
  return ((base - 1) % weeksPerSeason) + 1;
}

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function sortWorldConditionIds(ids?: readonly string[]): string[] {
  return [...new Set((ids ?? []).filter((id): id is string => !!id))]
    .sort((left, right) => left.localeCompare(right));
}

function buildGenerationKey(
  countryId: string,
  season: number,
  rootSeed: string | undefined,
  activeWorldConditionIds: readonly string[],
): string {
  return [
    countryId,
    season,
    rootSeed ?? "",
    activeWorldConditionIds.join("|"),
  ].join(":");
}

function resolveCalendarOptions(
  value: number | FootballCultureCalendarOptions | undefined,
): Required<FootballCultureCalendarOptions> {
  if (typeof value === "number") {
    return {
      weeksPerSeason: value,
      rootSeed: "",
      activeWorldConditionIds: [],
    };
  }
  return {
    weeksPerSeason: value?.weeksPerSeason ?? 38,
    rootSeed: value?.rootSeed ?? "",
    activeWorldConditionIds: sortWorldConditionIds(value?.activeWorldConditionIds),
  };
}

function resolveBoundedShift(
  generationKey: string,
  windowId: string,
  maximumShift: number,
): number {
  const limit = Math.max(0, Math.floor(maximumShift));
  if (limit === 0) return 0;
  const bucketCount = (limit * 2) + 1;
  return (hashSeed(`${generationKey}:${windowId}:shift`) % bucketCount) - limit;
}

function resolveIntensityModifier(
  generationKey: string,
  windowId: string,
  intensityVariance: number,
): number {
  const variance = clamp(intensityVariance, 0, 0.08);
  if (variance === 0) return 1;
  const ratio = hashSeed(`${generationKey}:${windowId}:intensity`) / 0xffffffff;
  return round(1 + ((ratio * 2) - 1) * variance);
}

function isActiveWindow(
  startWeek: number,
  endWeek: number,
  week: number,
): boolean {
  return startWeek <= endWeek
    ? week >= startWeek && week <= endWeek
    : week >= startWeek || week <= endWeek;
}

function resolveEffectsFromCalendar(
  calendar: CountrySeasonCalendar,
  week: number,
): CountryCalendarEffects {
  const currentWeek = normalizeWeek(week, calendar.weeksPerSeason);
  const signalByDomain = emptySignal();
  let uncertaintyMultiplier = 1;
  let misleadingSignalRiskDelta = 0;
  const activeWindowIds: string[] = [];
  const contextTags = new Set<string>();
  const biasWarnings = new Set<string>();
  const reasons = new Set<string>();

  for (const entry of calendar.windows) {
    if (!isActiveWindow(entry.startWeek, entry.endWeek, currentWeek)) continue;
    activeWindowIds.push(entry.id);
    for (const domain of ATTRIBUTE_DOMAINS) {
      signalByDomain[domain] += entry.signalByDomain[domain] ?? 0;
    }
    uncertaintyMultiplier *= entry.uncertaintyMultiplier;
    misleadingSignalRiskDelta += entry.misleadingSignalRiskDelta;
    entry.contextTags.forEach((tag) => contextTags.add(tag));
    entry.biasWarnings.forEach((warning) => biasWarnings.add(warning));
    entry.reasons.forEach((reason) => reasons.add(reason));
  }

  for (const domain of ATTRIBUTE_DOMAINS) {
    signalByDomain[domain] = round(clamp(signalByDomain[domain], -0.18, 0.18));
  }

  return {
    countryId: calendar.countryId,
    season: calendar.season,
    week: currentWeek,
    activeWindowIds,
    signalByDomain,
    uncertaintyMultiplier: round(clamp(uncertaintyMultiplier, 0.82, 1.18)),
    misleadingSignalRiskDelta: round(clamp(misleadingSignalRiskDelta, -0.08, 0.08)),
    contextTags: [...contextTags],
    biasWarnings: [...biasWarnings],
    reasons: [...reasons],
  };
}

export function createCountrySeasonCalendar(
  countryId: string,
  season: number,
  options: number | FootballCultureCalendarOptions = 38,
): CountrySeasonCalendar {
  const normalizedCountry = canonicalCountry(countryId) ?? countryId;
  const resolvedOptions = resolveCalendarOptions(options);
  const generationKey = buildGenerationKey(
    normalizedCountry,
    season,
    resolvedOptions.rootSeed,
    resolvedOptions.activeWorldConditionIds,
  );
  const windows = listFootballCultureCalendarWindows(normalizedCountry).map((entry) => {
    const weekShift = resolveBoundedShift(
      generationKey,
      entry.id,
      entry.maxWeekShift ?? 0,
    );
    const intensityModifier = resolveIntensityModifier(
      generationKey,
      entry.id,
      entry.intensityVariance ?? 0,
    );
    const signalByDomain = Object.fromEntries(
      ATTRIBUTE_DOMAINS.flatMap((domain) => {
        const baseValue = entry.signalByDomain?.[domain];
        if (baseValue === undefined) return [];
        return [[domain, round(clamp(baseValue * intensityModifier, -0.18, 0.18))] as const];
      }),
    ) as Partial<Record<AttributeDomain, number>>;

    return {
      id: `calendar:${normalizedCountry}:${entry.id}:s${season}`,
      label: entry.label,
      countryId: normalizedCountry,
      season,
      baseStartWeek: entry.startWeek,
      baseEndWeek: entry.endWeek,
      startWeek: normalizeWeek(entry.startWeek + weekShift, resolvedOptions.weeksPerSeason),
      endWeek: normalizeWeek(entry.endWeek + weekShift, resolvedOptions.weeksPerSeason),
      weekShift,
      intensityModifier,
      activeWorldConditionIds: [...resolvedOptions.activeWorldConditionIds],
      generationKey,
      signalByDomain,
      uncertaintyMultiplier: round(clamp(
        (entry.uncertaintyMultiplier ?? 1) / intensityModifier,
        0.85,
        1.2,
      )),
      misleadingSignalRiskDelta: round(clamp(
        (entry.misleadingSignalRiskDelta ?? 0) * intensityModifier,
        -0.08,
        0.08,
      )),
      contextTags: [...new Set(entry.contextTags ?? [])],
      biasWarnings: [...new Set(entry.biasWarnings ?? [])],
      reasons: [...new Set(entry.reasons ?? [])],
    };
  });

  return {
    countryId: normalizedCountry,
    season,
    weeksPerSeason: resolvedOptions.weeksPerSeason,
    rootSeed: resolvedOptions.rootSeed || undefined,
    activeWorldConditionIds: [...resolvedOptions.activeWorldConditionIds],
    generationKey,
    windows,
  };
}

export function resolveCountryCalendarEffects(
  countryId: string | undefined,
  season: number | undefined,
  week: number | undefined,
  options: number | FootballCultureCalendarOptions = 38,
): CountryCalendarEffects {
  if (!countryId || season === undefined || week === undefined) {
    return {
      activeWindowIds: [],
      signalByDomain: emptySignal(),
      uncertaintyMultiplier: 1,
      misleadingSignalRiskDelta: 0,
      contextTags: [],
      biasWarnings: [],
      reasons: [],
    };
  }

  const resolvedOptions = resolveCalendarOptions(options);
  const calendar = createCountrySeasonCalendar(countryId, season, resolvedOptions);
  return resolveEffectsFromCalendar(calendar, week);
}

export function resolvePersistedCountryCalendarEffects(
  calendar: CountrySeasonCalendar | undefined,
  week: number | undefined,
): CountryCalendarEffects {
  if (!calendar || week === undefined) {
    return {
      activeWindowIds: [],
      signalByDomain: emptySignal(),
      uncertaintyMultiplier: 1,
      misleadingSignalRiskDelta: 0,
      contextTags: [],
      biasWarnings: [],
      reasons: [],
    };
  }

  return resolveEffectsFromCalendar(calendar, week);
}
