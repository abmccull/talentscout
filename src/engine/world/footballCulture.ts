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
} from "@/engine/core/types";
import { normalizeCountryKey } from "@/lib/country";

export const FOOTBALL_CULTURE_EFFECT_VERSION = 1 as const;

export interface FootballCultureInsightEffects {
  version: typeof FOOTBALL_CULTURE_EFFECT_VERSION;
  /** Additive signal adjustment by evidence domain. Bounded to [-0.2, 0.2]. */
  signalByDomain: Partial<Record<AttributeDomain, number>>;
  /** Multiplies observation variance. Below one means the context is easier to read. */
  uncertaintyMultiplier: number;
  /** Context tags used by the situation planner and future authored events. */
  contextTags: string[];
  /** Player-facing cautions about a likely interpretation trap. */
  biasWarnings: string[];
}

type InsightLike = Pick<CulturalInsight, "type" | "description" | "gameplayEffect"> &
  Partial<Pick<CulturalInsight, "id" | "effects">>;

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

/**
 * Small country-level adjustments represent football structures, not innate
 * national traits. The base insight remains useful for every generated market.
 */
const COUNTRY_EFFECT_ADJUSTMENTS: Partial<Record<
  string,
  Partial<Record<CulturalInsight["type"], Partial<FootballCultureInsightEffects>>>
>> = {
  england: {
    playingStyle: {
      signalByDomain: { physical: 0.07, tactical: 0.04 },
      contextTags: ["direct-lower-leagues", "playing-style"],
    },
  },
  spain: {
    playingStyle: {
      signalByDomain: { technical: 0.09, tactical: 0.09 },
      contextTags: ["positional-play", "playing-style"],
    },
  },
  brazil: {
    developmentCulture: {
      signalByDomain: { technical: 0.09, tactical: -0.04 },
      uncertaintyMultiplier: 1.02,
      contextTags: ["mixed-formal-informal-pathways", "development-pathway"],
    },
  },
  germany: {
    playingStyle: {
      signalByDomain: { mental: 0.06, tactical: 0.09 },
      contextTags: ["pressing-structure", "playing-style"],
    },
  },
  france: {
    developmentCulture: {
      signalByDomain: { physical: 0.06, tactical: 0.06, hidden: 0.03 },
      contextTags: ["academy-network", "development-pathway"],
    },
  },
  argentina: {
    mentalityPattern: {
      signalByDomain: { mental: 0.09, hidden: 0.06 },
      contextTags: ["high-pressure-competition", "pressure-norms"],
    },
  },
  nigeria: {
    developmentCulture: {
      signalByDomain: { physical: 0.07, technical: 0.04, tactical: -0.03 },
      uncertaintyMultiplier: 1.03,
      contextTags: ["uneven-pathways", "development-pathway"],
    },
  },
  italy: {
    playingStyle: {
      signalByDomain: { tactical: 0.11, mental: 0.04 },
      contextTags: ["tactical-schooling", "playing-style"],
    },
  },
  portugal: {
    developmentCulture: {
      signalByDomain: { technical: 0.08, tactical: 0.05 },
      contextTags: ["export-academies", "development-pathway"],
    },
  },
  japan: {
    developmentCulture: {
      signalByDomain: { technical: 0.06, mental: 0.05, tactical: 0.06 },
      contextTags: ["school-club-pathway", "development-pathway"],
    },
  },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function canonicalCountry(countryId: string): string {
  return normalizeCountryKey(countryId)
    ?? countryId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mergeEffects(
  base: FootballCultureInsightEffects,
  adjustment?: Partial<FootballCultureInsightEffects>,
): FootballCultureInsightEffects {
  const adjustedSignals = adjustment?.signalByDomain ?? {};
  const signalByDomain = Object.fromEntries(
    (["technical", "physical", "mental", "tactical", "hidden"] as AttributeDomain[])
      .flatMap((domain) => {
        const value = adjustedSignals[domain] ?? base.signalByDomain[domain];
        return value === undefined
          ? []
          : [[domain, Math.round(clamp(value, -0.2, 0.2) * 1000) / 1000] as const];
      }),
  ) as Partial<Record<AttributeDomain, number>>;

  return {
    version: FOOTBALL_CULTURE_EFFECT_VERSION,
    signalByDomain,
    uncertaintyMultiplier: Math.round(clamp(
      adjustment?.uncertaintyMultiplier ?? base.uncertaintyMultiplier,
      0.8,
      1.2,
    ) * 1000) / 1000,
    contextTags: [...new Set(adjustment?.contextTags ?? base.contextTags)],
    biasWarnings: [...new Set(adjustment?.biasWarnings ?? base.biasWarnings)],
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
  return mergeEffects(
    BASE_EFFECTS[insight.type],
    COUNTRY_EFFECT_ADJUSTMENTS[country]?.[insight.type],
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
}

/** Combine only knowledge the scout has actually unlocked. */
export function combineFootballCultureEffects(
  countryId: string | undefined,
  insights: readonly CulturalInsight[] | undefined,
): CombinedFootballCultureEffects {
  const signalByDomain: Record<AttributeDomain, number> = {
    technical: 0,
    physical: 0,
    mental: 0,
    tactical: 0,
    hidden: 0,
  };
  let uncertaintyMultiplier = 1;
  const contextTags = new Set<string>();
  const biasWarnings = new Set<string>();
  const insightIds: string[] = [];

  if (!countryId || !insights?.length) {
    return { insightIds, signalByDomain, uncertaintyMultiplier, contextTags: [], biasWarnings: [] };
  }

  for (const rawInsight of insights) {
    const insight = hydrateCulturalInsight(countryId, rawInsight);
    const effects = insight.effects!;
    insightIds.push(insight.id!);
    for (const domain of Object.keys(signalByDomain) as AttributeDomain[]) {
      signalByDomain[domain] += effects.signalByDomain[domain] ?? 0;
    }
    uncertaintyMultiplier *= effects.uncertaintyMultiplier;
    effects.contextTags.forEach((tag) => contextTags.add(tag));
    effects.biasWarnings.forEach((warning) => biasWarnings.add(warning));
  }

  for (const domain of Object.keys(signalByDomain) as AttributeDomain[]) {
    signalByDomain[domain] = Math.round(clamp(signalByDomain[domain], -0.18, 0.18) * 1000) / 1000;
  }

  return {
    insightIds: [...new Set(insightIds)],
    signalByDomain,
    uncertaintyMultiplier: Math.round(clamp(uncertaintyMultiplier, 0.82, 1.18) * 1000) / 1000,
    contextTags: [...contextTags],
    biasWarnings: [...biasWarnings],
  };
}
