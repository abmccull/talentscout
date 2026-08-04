/**
 * Executable football-environment knowledge.
 *
 * These modifiers describe what a competition and development environment
 * makes easier or harder to interpret. They never change player truth and are
 * applied only after the scout has earned the corresponding cultural insight.
 */

import type {
  AttributeDomain,
  CulturalInsight,
  FootballCultureInsightEffects,
} from "@/engine/core/types";
import {
  resolveCountryCalendarEffects,
  type CountryCalendarEffects,
} from "@/engine/world/footballCultureCalendar";
import { getFootballCultureInsightDefinition } from "@/engine/world/footballCulturePlaybooks";
import { normalizeCountryKey } from "@/lib/country";

export const FOOTBALL_CULTURE_EFFECT_VERSION = 1 as const;
export type { FootballCultureInsightEffects } from "@/engine/core/types";

type InsightLike = Pick<CulturalInsight, "type" | "description" | "gameplayEffect"> &
  Partial<Pick<CulturalInsight, "id" | "effects">>;

export interface FootballCultureContextInput {
  season?: number;
  week?: number;
  weeksPerSeason?: number;
  rootSeed?: string;
  activeWorldConditionIds?: readonly string[];
  /** Persisted season context. Prefer this over regenerating live save history. */
  calendarEffects?: CountryCalendarEffects;
}

const ATTRIBUTE_DOMAINS: AttributeDomain[] = [
  "technical",
  "physical",
  "mental",
  "tactical",
  "hidden",
];

const BASE_EFFECTS: Record<CulturalInsight["type"], FootballCultureInsightEffects> = {
  playingStyle: {
    version: FOOTBALL_CULTURE_EFFECT_VERSION,
    signalByDomain: { technical: 0.04, tactical: 0.08 },
    uncertaintyMultiplier: 0.97,
    contextTags: ["playing-style"],
    biasWarnings: ["Do not treat one familiar tactical pattern as proof of role portability."],
  },
  developmentCulture: {
    version: FOOTBALL_CULTURE_EFFECT_VERSION,
    signalByDomain: { technical: 0.04, tactical: 0.04, hidden: 0.03 },
    uncertaintyMultiplier: 0.95,
    contextTags: ["development-pathway"],
    biasWarnings: ["Development pathways vary inside the same football market."],
  },
  mentalityPattern: {
    version: FOOTBALL_CULTURE_EFFECT_VERSION,
    signalByDomain: { mental: 0.08, hidden: 0.05 },
    uncertaintyMultiplier: 0.98,
    contextTags: ["pressure-norms"],
    biasWarnings: ["A competition's behavioural norms are context, not a player's personality."],
  },
  physicalTrait: {
    version: FOOTBALL_CULTURE_EFFECT_VERSION,
    signalByDomain: { physical: 0.08 },
    uncertaintyMultiplier: 0.97,
    contextTags: ["physical-development"],
    biasWarnings: ["Maturation and training history matter more than a national average."],
  },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function canonicalCountry(countryId: string): string {
  return normalizeCountryKey(countryId)
    ?? countryId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mergeEffects(
  base: FootballCultureInsightEffects,
  adjustment?: Partial<Omit<FootballCultureInsightEffects, "version">>,
): FootballCultureInsightEffects {
  const signalByDomain = Object.fromEntries(
    ATTRIBUTE_DOMAINS.flatMap((domain) => {
      const baseValue = base.signalByDomain[domain] ?? 0;
      const adjustmentValue = adjustment?.signalByDomain?.[domain];
      const value = adjustmentValue ?? baseValue;
      if (value === undefined) return [];
      return [[domain, round(clamp(value, -0.2, 0.2))] as const];
    }),
  ) as Partial<Record<AttributeDomain, number>>;

  return {
    version: FOOTBALL_CULTURE_EFFECT_VERSION,
    signalByDomain,
    uncertaintyMultiplier: round(clamp(
      adjustment?.uncertaintyMultiplier ?? base.uncertaintyMultiplier,
      0.8,
      1.2,
    )),
    contextTags: [...new Set([
      ...base.contextTags,
      ...(adjustment?.contextTags ?? []),
    ])],
    biasWarnings: [...new Set([
      ...base.biasWarnings,
      ...(adjustment?.biasWarnings ?? []),
    ])],
  };
}

/** Resolve executable effects for both current and legacy persisted insights. */
export function resolveCulturalInsightEffects(
  countryId: string,
  insight: InsightLike,
): FootballCultureInsightEffects {
  if (insight.effects?.version === FOOTBALL_CULTURE_EFFECT_VERSION) {
    return mergeEffects(insight.effects, insight.effects);
  }

  const country = canonicalCountry(countryId);
  const authored = getFootballCultureInsightDefinition(country, insight.type);
  return mergeEffects(
    BASE_EFFECTS[insight.type],
    authored.effectAdjustment,
  );
}

/** Add stable identity and executable effects when an insight is newly earned. */
export function hydrateCulturalInsight(
  countryId: string,
  insight: CulturalInsight,
): CulturalInsight {
  const country = canonicalCountry(countryId);
  return {
    ...insight,
    id: insight.id ?? `culture:${country}:${insight.type}:v${FOOTBALL_CULTURE_EFFECT_VERSION}`,
    effects: resolveCulturalInsightEffects(country, insight),
  };
}

export interface CombinedFootballCultureEffects {
  insightIds: string[];
  signalByDomain: Record<AttributeDomain, number>;
  uncertaintyMultiplier: number;
  contextTags: string[];
  biasWarnings: string[];
  misleadingSignalRiskDelta: number;
  activeWindowIds: string[];
  reasons: string[];
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

export function resolveFootballCultureContext(
  countryId: string | undefined,
  insights: readonly CulturalInsight[] | undefined,
  input: FootballCultureContextInput = {},
): CombinedFootballCultureEffects {
  const signalByDomain = emptySignal();
  let uncertaintyMultiplier = 1;
  const contextTags = new Set<string>();
  const biasWarnings = new Set<string>();
  const insightIds: string[] = [];
  const reasons: string[] = [];

  if (countryId && insights?.length) {
    for (const rawInsight of insights) {
      const insight = hydrateCulturalInsight(countryId, rawInsight);
      const effects = insight.effects!;
      insightIds.push(insight.id!);
      for (const domain of ATTRIBUTE_DOMAINS) {
        signalByDomain[domain] += effects.signalByDomain[domain] ?? 0;
      }
      uncertaintyMultiplier *= effects.uncertaintyMultiplier;
      effects.contextTags.forEach((tag) => contextTags.add(tag));
      effects.biasWarnings.forEach((warning) => biasWarnings.add(warning));
    }
  }

  const calendar = input.calendarEffects ?? resolveCountryCalendarEffects(
    countryId,
    input.season,
    input.week,
    {
      weeksPerSeason: input.weeksPerSeason,
      rootSeed: input.rootSeed,
      activeWorldConditionIds: input.activeWorldConditionIds,
    },
  );

  for (const domain of ATTRIBUTE_DOMAINS) {
    signalByDomain[domain] += calendar.signalByDomain[domain] ?? 0;
    signalByDomain[domain] = round(clamp(signalByDomain[domain], -0.18, 0.18));
  }
  uncertaintyMultiplier = round(clamp(
    uncertaintyMultiplier * calendar.uncertaintyMultiplier,
    0.82,
    1.18,
  ));
  calendar.contextTags.forEach((tag) => contextTags.add(tag));
  calendar.biasWarnings.forEach((warning) => biasWarnings.add(warning));
  reasons.push(...calendar.reasons);

  return {
    insightIds: [...new Set(insightIds)],
    signalByDomain,
    uncertaintyMultiplier,
    contextTags: [...contextTags],
    biasWarnings: [...biasWarnings],
    misleadingSignalRiskDelta: calendar.misleadingSignalRiskDelta,
    activeWindowIds: calendar.activeWindowIds,
    reasons: [...new Set(reasons)],
  };
}

/** Combine only knowledge the scout has actually unlocked. */
export function combineFootballCultureEffects(
  countryId: string | undefined,
  insights: readonly CulturalInsight[] | undefined,
): CombinedFootballCultureEffects {
  return resolveFootballCultureContext(countryId, insights);
}
