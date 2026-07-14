import type {
  GameState,
  InboxMessage,
  RunManifest,
} from "@/engine/core/types";
import { createNamedRNG } from "@/engine/run";
import { applyBalanceTransaction } from "@/engine/finance/expenses";
import { normalizeCountryKey } from "@/lib/country";
import { getScoutHomeCountry } from "./travel";

export const WORLD_CONDITION_STATE_VERSION = 1 as const;
export const WORLD_CONDITION_HISTORY_LIMIT = 24;

export type WorldConditionScope = "global" | "regional";

export interface WorldConditionModifiers {
  discoveryMultiplier: number;
  observationConfidenceMultiplier: number;
  opportunityMultiplier: number;
  developmentMultiplier: number;
  breakthroughMultiplier: number;
  recruitmentScoreAdjustment: number;
  travelCostMultiplier: number;
  travelDurationDelta: number;
  travelFatigueMultiplier: number;
  marketplaceValueMultiplier: number;
  rivalPressureMultiplier: number;
  /** Auditable one-off cash movement when the season opens. */
  seasonalFinanceAdjustment: number;
}

export interface WorldConditionDefinition {
  id: string;
  scope: WorldConditionScope;
  name: string;
  description: string;
  playerFacingEffects: readonly string[];
  tags: readonly string[];
  modifiers: Partial<WorldConditionModifiers>;
}

/**
 * A condition persists its resolved mechanics as well as its definition ID.
 * This keeps an existing save mechanically stable if authored copy changes in
 * a future content update.
 */
export interface WorldConditionInstance {
  id: string;
  definitionId: string;
  scope: WorldConditionScope;
  season: number;
  countryId?: string;
  modifiers: WorldConditionModifiers;
}

export interface WorldConditionSeasonRecord {
  season: number;
  conditions: WorldConditionInstance[];
  /** Authored connective tissue comparing this season with the previous one. */
  callback: string;
}

export interface WorldConditionState {
  version: typeof WORLD_CONDITION_STATE_VERSION;
  activeSeason: number;
  active: WorldConditionInstance[];
  history: WorldConditionSeasonRecord[];
}

const DEFAULT_MODIFIERS: WorldConditionModifiers = {
  discoveryMultiplier: 1,
  observationConfidenceMultiplier: 1,
  opportunityMultiplier: 1,
  developmentMultiplier: 1,
  breakthroughMultiplier: 1,
  recruitmentScoreAdjustment: 0,
  travelCostMultiplier: 1,
  travelDurationDelta: 0,
  travelFatigueMultiplier: 1,
  marketplaceValueMultiplier: 1,
  rivalPressureMultiplier: 1,
  seasonalFinanceAdjustment: 0,
};

const GLOBAL_WORLD_CONDITIONS: readonly WorldConditionDefinition[] = [
  {
    id: "broadcast-money-wave",
    scope: "global",
    name: "Broadcast Money Wave",
    description: "Fresh media money has widened recruitment budgets and increased demand for credible intelligence.",
    playerFacingEffects: [
      "Clubs act more readily on well-supported recommendations",
      "Independent report buyers are willing to pay more",
      "Scouting businesses receive a modest seasonal market dividend",
    ],
    tags: ["expansion", "finance", "recruitment"],
    modifiers: {
      opportunityMultiplier: 1.08,
      recruitmentScoreAdjustment: 4,
      marketplaceValueMultiplier: 1.12,
      seasonalFinanceAdjustment: 1_200,
    },
  },
  {
    id: "credit-squeeze",
    scope: "global",
    name: "Credit Squeeze",
    description: "Clubs and agencies are protecting cash after lenders tightened football credit.",
    playerFacingEffects: [
      "Clubs demand stronger evidence before committing",
      "Report buyers submit leaner offers",
      "Higher deposits and compliance costs hit the seasonal ledger",
    ],
    tags: ["contraction", "finance", "recruitment"],
    modifiers: {
      opportunityMultiplier: 0.94,
      recruitmentScoreAdjustment: -5,
      travelCostMultiplier: 1.08,
      marketplaceValueMultiplier: 0.88,
      seasonalFinanceAdjustment: -900,
    },
  },
  {
    id: "youth-development-grant",
    scope: "global",
    name: "Youth Development Grant",
    description: "A coordinated funding programme has put more coaching hours and showcase access into the youth game.",
    playerFacingEffects: [
      "Young players have a stronger development environment",
      "Breakthrough seasons are slightly more likely",
      "Grassroots discovery routes produce more credible leads",
    ],
    tags: ["development", "youth", "expansion"],
    modifiers: {
      discoveryMultiplier: 1.08,
      developmentMultiplier: 1.12,
      breakthroughMultiplier: 1.12,
      recruitmentScoreAdjustment: 2,
    },
  },
  {
    id: "fixture-congestion",
    scope: "global",
    name: "Fixture Congestion",
    description: "A compressed calendar has created more viewing windows but less recovery and training continuity.",
    playerFacingEffects: [
      "More short-notice scouting opportunities enter the diary",
      "Player development and breakthrough momentum are suppressed",
      "Travel is more tiring during the crowded calendar",
    ],
    tags: ["congestion", "development", "travel"],
    modifiers: {
      opportunityMultiplier: 1.12,
      developmentMultiplier: 0.9,
      breakthroughMultiplier: 0.85,
      travelFatigueMultiplier: 1.08,
    },
  },
  {
    id: "open-transfer-market",
    scope: "global",
    name: "Open Transfer Market",
    description: "Liberal registration rules have produced a fast, competitive market for mobile players.",
    playerFacingEffects: [
      "Clubs are more receptive to suitable recommendations",
      "Rivals move faster when credible targets emerge",
      "Market demand lifts report values",
    ],
    tags: ["competition", "recruitment", "expansion"],
    modifiers: {
      opportunityMultiplier: 1.12,
      recruitmentScoreAdjustment: 5,
      marketplaceValueMultiplier: 1.08,
      rivalPressureMultiplier: 1.15,
    },
  },
  {
    id: "data-rights-dispute",
    scope: "global",
    name: "Data Rights Dispute",
    description: "A licensing dispute has fragmented youth and lower-league data feeds across the football world.",
    playerFacingEffects: [
      "Remote evidence carries less contextual confidence",
      "Open-market leads are less plentiful",
      "Compliance and replacement data services create a seasonal cost",
    ],
    tags: ["data", "contraction", "finance"],
    modifiers: {
      observationConfidenceMultiplier: 0.86,
      opportunityMultiplier: 0.92,
      seasonalFinanceAdjustment: -500,
    },
  },
] as const;

const REGIONAL_WORLD_CONDITIONS: readonly WorldConditionDefinition[] = [
  {
    id: "academy-investment-wave",
    scope: "regional",
    name: "Academy Investment Wave",
    description: "Local clubs are pooling coaching, facilities, and education support around a stronger youth pathway.",
    playerFacingEffects: [
      "Players based here develop in a stronger seasonal environment",
      "Grassroots and academy leads are easier to uncover",
      "Clubs show more patience with development recommendations",
    ],
    tags: ["development", "youth", "expansion"],
    modifiers: {
      discoveryMultiplier: 1.12,
      developmentMultiplier: 1.18,
      breakthroughMultiplier: 1.12,
      recruitmentScoreAdjustment: 4,
    },
  },
  {
    id: "transport-disruption",
    scope: "regional",
    name: "Transport Disruption",
    description: "Route closures and a packed event calendar have made in-person coverage slower and more expensive.",
    playerFacingEffects: [
      "Travel costs and fatigue increase",
      "Trips require an additional planning day",
      "Fewer opportunities remain practical without local presence",
    ],
    tags: ["travel", "contraction"],
    modifiers: {
      opportunityMultiplier: 0.88,
      travelCostMultiplier: 1.35,
      travelDurationDelta: 1,
      travelFatigueMultiplier: 1.2,
    },
  },
  {
    id: "showcase-circuit",
    scope: "regional",
    name: "Showcase Circuit",
    description: "A new circuit of school, academy, and invitational events is concentrating prospects and scouts in one place.",
    playerFacingEffects: [
      "Discovery and assignment opportunities rise sharply",
      "Live observation is easier to contextualise",
      "Rivals also converge on the same emerging players",
    ],
    tags: ["discovery", "competition", "expansion"],
    modifiers: {
      discoveryMultiplier: 1.35,
      observationConfidenceMultiplier: 1.08,
      opportunityMultiplier: 1.35,
      rivalPressureMultiplier: 1.15,
    },
  },
  {
    id: "agent-exclusivity-wave",
    scope: "regional",
    name: "Agent Exclusivity Wave",
    description: "A small group of agencies has tied up access to many of the region's most discussed prospects.",
    playerFacingEffects: [
      "Unmediated leads become scarcer",
      "Rival pressure rises around represented players",
      "Clubs become wary of recommendations without relationship context",
    ],
    tags: ["relationships", "competition", "contraction"],
    modifiers: {
      discoveryMultiplier: 0.9,
      opportunityMultiplier: 0.85,
      recruitmentScoreAdjustment: -2,
      rivalPressureMultiplier: 1.2,
    },
  },
  {
    id: "registration-easing",
    scope: "regional",
    name: "Registration Easing",
    description: "New registration and work-permit rules have made players from this market easier for clubs to pursue.",
    playerFacingEffects: [
      "Suitable recommendations meet fewer institutional barriers",
      "More clubs commission work in the region",
      "Report values rise with the broader buyer pool",
    ],
    tags: ["recruitment", "expansion", "finance"],
    modifiers: {
      opportunityMultiplier: 1.12,
      recruitmentScoreAdjustment: 6,
      marketplaceValueMultiplier: 1.05,
    },
  },
  {
    id: "local-football-recession",
    scope: "regional",
    name: "Local Football Recession",
    description: "Sponsor withdrawals have reduced recruitment activity even as local travel and venue access become cheaper.",
    playerFacingEffects: [
      "Clubs in the region are harder to persuade",
      "Local report demand and values fall",
      "Travel and venue access are less expensive",
    ],
    tags: ["contraction", "finance", "recruitment"],
    modifiers: {
      opportunityMultiplier: 0.9,
      recruitmentScoreAdjustment: -5,
      travelCostMultiplier: 0.92,
      marketplaceValueMultiplier: 0.85,
    },
  },
  {
    id: "underdog-talent-surge",
    scope: "regional",
    name: "Underdog Talent Surge",
    description: "A cluster of unfashionable clubs and community programmes is producing an unusually competitive cohort.",
    playerFacingEffects: [
      "Speculative discovery is more productive",
      "Players based here receive a modest development lift",
      "The market has not yet fully priced the region's momentum",
    ],
    tags: ["discovery", "development", "youth"],
    modifiers: {
      discoveryMultiplier: 1.2,
      opportunityMultiplier: 1.12,
      developmentMultiplier: 1.08,
    },
  },
] as const;

export const WORLD_CONDITION_DECK: readonly WorldConditionDefinition[] = [
  ...GLOBAL_WORLD_CONDITIONS,
  ...REGIONAL_WORLD_CONDITIONS,
];

const DEFINITION_BY_ID = new Map(
  WORLD_CONDITION_DECK.map((definition) => [definition.id, definition]),
);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function canonicalCountry(value: string): string {
  return normalizeCountryKey(value)
    ?? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function uniqueCountries(countries: readonly string[]): string[] {
  return [...new Set(countries.map(canonicalCountry).filter(Boolean))].sort();
}

function resolvedModifiers(
  partial: Partial<WorldConditionModifiers>,
): WorldConditionModifiers {
  const resolved = { ...DEFAULT_MODIFIERS };
  for (const key of Object.keys(DEFAULT_MODIFIERS) as Array<keyof WorldConditionModifiers>) {
    const value = partial[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      resolved[key] = value;
    }
  }
  return resolved;
}

function createInstance(
  definition: WorldConditionDefinition,
  season: number,
  countryId?: string,
): WorldConditionInstance {
  const scopeSuffix = countryId ? `:${countryId}` : ":global";
  return {
    id: `${definition.id}:s${season}${scopeSuffix}`,
    definitionId: definition.id,
    scope: definition.scope,
    season,
    ...(countryId ? { countryId } : {}),
    modifiers: resolvedModifiers(definition.modifiers),
  };
}

function conditionTags(instances: readonly WorldConditionInstance[]): Set<string> {
  return new Set(instances.flatMap((instance) =>
    DEFINITION_BY_ID.get(instance.definitionId)?.tags ?? []
  ));
}

const OPENING_CALLBACKS = [
  "The scouting year opens with a different balance of access, pressure, and opportunity.",
  "Recruitment departments have redrawn their assumptions before the first serious reports arrive.",
  "The new season has changed where the football world's attention, money, and patience are flowing.",
] as const;

function buildSeasonCallback(
  manifest: Pick<RunManifest, "rootSeed">,
  season: number,
  previous: readonly WorldConditionInstance[],
  current: readonly WorldConditionInstance[],
): string {
  const rng = createNamedRNG(manifest.rootSeed, "world-condition-callback", season);
  if (previous.length === 0) return rng.pick(OPENING_CALLBACKS);

  const before = conditionTags(previous);
  const after = conditionTags(current);
  const variants: string[] = [];
  if (before.has("contraction") && after.has("expansion")) {
    variants.push(
      "Last season's closed doors are opening, but the contacts who survived the squeeze now control the best early access.",
      "Money and opportunity are returning after a restrictive year; clubs remember which scouts kept working when the market was quiet.",
    );
  }
  if (before.has("expansion") && after.has("contraction")) {
    variants.push(
      "The easy momentum of last season has gone. Clubs now expect sharper evidence before they spend or share access.",
      "A buoyant year has given way to restraint, turning last season's broad shortlists into this season's hard choices.",
    );
  }
  if (before.has("development") && after.has("congestion")) {
    variants.push(
      "Last season's development optimism now meets a crowded calendar; following players across changing roles will matter more than headline form.",
    );
  }
  if (before.has("travel") && !after.has("travel")) {
    variants.push(
      "Routes have stabilised after last season's disruption, rewarding scouts who maintained relationships while visits were difficult.",
    );
  }
  if (before.has("competition") && after.has("competition")) {
    variants.push(
      "Competitive pressure has not disappeared; it has shifted markets, forcing rivals to choose which regions they can truly cover.",
    );
  }
  if (variants.length === 0) {
    variants.push(
      "Last season's assumptions no longer travel cleanly into this one; old evidence remains useful, but its context has changed.",
      "The football world has moved on from last season's pattern. Scouts who recognise the change early will own the first credible opinions.",
      "A new mix of access, budgets, and local momentum has changed which leads deserve immediate attention.",
    );
  }
  return rng.pick(variants);
}

/** Generate one deterministic season from the immutable run seed and season. */
export function generateWorldConditionSeason(
  manifest: Pick<RunManifest, "rootSeed" | "worldTraitIds">,
  season: number,
  countries: readonly string[],
  previous: readonly WorldConditionInstance[] = [],
): WorldConditionSeasonRecord {
  const safeSeason = Math.max(1, Math.floor(season));
  const countryPool = uniqueCountries(countries);
  const globalRng = createNamedRNG(
    manifest.rootSeed,
    "world-condition-global",
    safeSeason,
    [...manifest.worldTraitIds].sort().join("+"),
  );
  const globalDefinition = globalRng.pick(GLOBAL_WORLD_CONDITIONS);
  const conditions: WorldConditionInstance[] = [
    createInstance(globalDefinition, safeSeason),
  ];

  if (countryPool.length > 0) {
    const regionRng = createNamedRNG(
      manifest.rootSeed,
      "world-condition-regions",
      safeSeason,
      countryPool.join("+"),
    );
    const maximum = Math.min(3, countryPool.length);
    const regionalCount = maximum === 1 ? 1 : regionRng.nextInt(1, maximum);
    const selectedCountries = regionRng.shuffle(countryPool).slice(0, regionalCount);
    const selectedDefinitions = regionRng.shuffle([...REGIONAL_WORLD_CONDITIONS]);
    selectedCountries.forEach((countryId, index) => {
      conditions.push(createInstance(
        selectedDefinitions[index % selectedDefinitions.length],
        safeSeason,
        countryId,
      ));
    });
  }

  return {
    season: safeSeason,
    conditions,
    callback: buildSeasonCallback(manifest, safeSeason, previous, conditions),
  };
}

export function createWorldConditionState(
  manifest: Pick<RunManifest, "rootSeed" | "worldTraitIds">,
  countries: readonly string[],
  season: number,
): WorldConditionState {
  const record = generateWorldConditionSeason(manifest, season, countries);
  return {
    version: WORLD_CONDITION_STATE_VERSION,
    activeSeason: record.season,
    active: record.conditions,
    history: [record],
  };
}

function isValidInstance(value: unknown): value is WorldConditionInstance {
  if (!value || typeof value !== "object") return false;
  const instance = value as Partial<WorldConditionInstance>;
  return typeof instance.id === "string"
    && typeof instance.definitionId === "string"
    && (instance.scope === "global" || instance.scope === "regional")
    && Number.isInteger(instance.season)
    && instance.season! >= 1
    && !!instance.modifiers
    && typeof instance.modifiers === "object";
}

function normalizeInstance(
  instance: WorldConditionInstance,
  eligibleCountries?: ReadonlySet<string>,
): WorldConditionInstance | null {
  const definition = DEFINITION_BY_ID.get(instance.definitionId);
  if (!definition || definition.scope !== instance.scope) return null;
  const countryId = instance.scope === "regional" && instance.countryId
    ? canonicalCountry(instance.countryId)
    : undefined;
  if (instance.scope === "regional" && !countryId) return null;
  if (
    instance.scope === "regional"
    && eligibleCountries
    && !eligibleCountries.has(countryId!)
  ) {
    return null;
  }
  return {
    id: instance.id,
    definitionId: instance.definitionId,
    scope: instance.scope,
    season: Math.max(1, Math.floor(instance.season)),
    ...(countryId ? { countryId } : {}),
    modifiers: resolvedModifiers(instance.modifiers),
  };
}

/** Pure, idempotent compatibility path for direct, local, and cloud loads. */
export function migrateWorldConditionState(
  value: unknown,
  manifest: Pick<RunManifest, "rootSeed" | "worldTraitIds">,
  countries: readonly string[],
  currentSeason: number,
): WorldConditionState {
  if (!value || typeof value !== "object") {
    return createWorldConditionState(manifest, countries, currentSeason);
  }

  const candidate = value as Partial<WorldConditionState>;
  // A non-empty country list is the canonical generated world surface. Active
  // regional conditions outside it are legacy ghost destinations and must not
  // remain mechanically active or appear in the player-facing season panel.
  // Historical records remain intact because they describe completed seasons.
  const eligibleCountries = uniqueCountries(countries);
  const activeCountrySet = eligibleCountries.length > 0
    ? new Set(eligibleCountries)
    : undefined;
  const history = Array.isArray(candidate.history)
    ? candidate.history.flatMap((record) => {
      if (!record || typeof record !== "object") return [];
      const raw = record as Partial<WorldConditionSeasonRecord>;
      if (!Number.isInteger(raw.season) || raw.season! < 1) return [];
      const conditions: WorldConditionInstance[] = [];
      const occupiedScopes = new Set<string>();
      if (Array.isArray(raw.conditions)) {
        for (const instance of raw.conditions.filter(isValidInstance)) {
          const normalized = normalizeInstance(
            instance,
            raw.season === currentSeason ? activeCountrySet : undefined,
          );
          if (!normalized) continue;
          const scopeKey = normalized.scope === "global"
            ? "global"
            : `regional:${normalized.countryId}`;
          // A generated season has one global card and at most one regional
          // card per country. Deduplicating that invariant prevents malformed
          // or legacy records from multiplying mechanics and UI cards.
          if (occupiedScopes.has(scopeKey)) continue;
          occupiedScopes.add(scopeKey);
          conditions.push({ ...normalized, season: raw.season! });
        }
      }
      if (conditions.length === 0) return [];
      return [{
        season: raw.season!,
        conditions,
        callback: typeof raw.callback === "string" && raw.callback.trim().length > 0
          ? raw.callback
          : buildSeasonCallback(manifest, raw.season!, [], conditions),
      }];
    })
    : [];
  const bySeason = new Map<number, WorldConditionSeasonRecord>();
  for (const record of history.sort((left, right) => left.season - right.season)) {
    bySeason.set(record.season, record);
  }

  let activeRecord = bySeason.get(currentSeason);
  if (!activeRecord) {
    const previous = [...bySeason.values()]
      .filter((record) => record.season < currentSeason)
      .sort((left, right) => right.season - left.season)[0];
    activeRecord = generateWorldConditionSeason(
      manifest,
      currentSeason,
      countries,
      previous?.conditions ?? [],
    );
    bySeason.set(currentSeason, activeRecord);
  }

  return {
    version: WORLD_CONDITION_STATE_VERSION,
    activeSeason: currentSeason,
    active: activeRecord.conditions,
    history: [...bySeason.values()]
      .sort((left, right) => left.season - right.season)
      .slice(-WORLD_CONDITION_HISTORY_LIMIT),
  };
}

export function advanceWorldConditionSeason(
  state: WorldConditionState | undefined,
  manifest: Pick<RunManifest, "rootSeed" | "worldTraitIds">,
  countries: readonly string[],
  nextSeason: number,
): WorldConditionState {
  const migrated = migrateWorldConditionState(
    state,
    manifest,
    countries,
    Math.max(1, nextSeason - 1),
  );
  const existing = migrated.history.find((record) => record.season === nextSeason);
  const record = existing ?? generateWorldConditionSeason(
    manifest,
    nextSeason,
    countries,
    migrated.active,
  );
  const history = [
    ...migrated.history.filter((entry) => entry.season !== nextSeason),
    record,
  ].sort((left, right) => left.season - right.season)
    .slice(-WORLD_CONDITION_HISTORY_LIMIT);
  return {
    version: WORLD_CONDITION_STATE_VERSION,
    activeSeason: nextSeason,
    active: record.conditions,
    history,
  };
}

function combineModifiers(
  instances: readonly WorldConditionInstance[],
): WorldConditionModifiers {
  const result = { ...DEFAULT_MODIFIERS };
  for (const instance of instances) {
    const modifiers = instance.modifiers;
    result.discoveryMultiplier *= modifiers.discoveryMultiplier;
    result.observationConfidenceMultiplier *= modifiers.observationConfidenceMultiplier;
    result.opportunityMultiplier *= modifiers.opportunityMultiplier;
    result.developmentMultiplier *= modifiers.developmentMultiplier;
    result.breakthroughMultiplier *= modifiers.breakthroughMultiplier;
    result.recruitmentScoreAdjustment += modifiers.recruitmentScoreAdjustment;
    result.travelCostMultiplier *= modifiers.travelCostMultiplier;
    result.travelDurationDelta += modifiers.travelDurationDelta;
    result.travelFatigueMultiplier *= modifiers.travelFatigueMultiplier;
    result.marketplaceValueMultiplier *= modifiers.marketplaceValueMultiplier;
    result.rivalPressureMultiplier *= modifiers.rivalPressureMultiplier;
    result.seasonalFinanceAdjustment += modifiers.seasonalFinanceAdjustment;
  }
  return {
    discoveryMultiplier: clamp(result.discoveryMultiplier, 0.6, 1.65),
    observationConfidenceMultiplier: clamp(result.observationConfidenceMultiplier, 0.7, 1.3),
    opportunityMultiplier: clamp(result.opportunityMultiplier, 0.6, 1.75),
    developmentMultiplier: clamp(result.developmentMultiplier, 0.7, 1.4),
    breakthroughMultiplier: clamp(result.breakthroughMultiplier, 0.6, 1.5),
    recruitmentScoreAdjustment: clamp(result.recruitmentScoreAdjustment, -12, 12),
    travelCostMultiplier: clamp(result.travelCostMultiplier, 0.65, 1.6),
    travelDurationDelta: Math.round(clamp(result.travelDurationDelta, -1, 2)),
    travelFatigueMultiplier: clamp(result.travelFatigueMultiplier, 0.7, 1.5),
    marketplaceValueMultiplier: clamp(result.marketplaceValueMultiplier, 0.7, 1.4),
    rivalPressureMultiplier: clamp(result.rivalPressureMultiplier, 0.7, 1.5),
    seasonalFinanceAdjustment: Math.round(clamp(result.seasonalFinanceAdjustment, -2_500, 2_500)),
  };
}

/** Global conditions plus a matching regional condition, when a country is supplied. */
export function getWorldConditionModifiers(
  state: Pick<GameState, "worldConditionState">,
  country?: string,
): WorldConditionModifiers {
  const countryId = country ? canonicalCountry(country) : undefined;
  const active = state.worldConditionState?.active ?? [];
  return combineModifiers(active.filter((instance) =>
    instance.scope === "global"
    || (countryId !== undefined && instance.countryId === countryId)
  ));
}

export function getWorldConditionDefinition(
  definitionId: string,
): WorldConditionDefinition | undefined {
  return DEFINITION_BY_ID.get(definitionId);
}

export function getActiveWorldConditionNames(
  state: Pick<GameState, "worldConditionState">,
  country?: string,
): string[] {
  const countryId = country ? canonicalCountry(country) : undefined;
  return (state.worldConditionState?.active ?? [])
    .filter((instance) =>
      instance.scope === "global"
      || (countryId !== undefined && instance.countryId === countryId)
    )
    .flatMap((instance) => {
      const definition = getWorldConditionDefinition(instance.definitionId);
      return definition ? [definition.name] : [];
    });
}

export function getWorldConditionContentDefinitionIds(): string[] {
  return WORLD_CONDITION_DECK.map((definition) =>
    `world-condition:${definition.id}`
  ).sort();
}

export function formatWorldConditionCountry(countryId?: string): string {
  if (!countryId) return "Global";
  return countryId
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function buildWorldConditionSeasonMessage(
  state: Pick<GameState, "currentSeason" | "worldConditionState">,
): InboxMessage | null {
  const conditionState = state.worldConditionState;
  if (!conditionState || conditionState.activeSeason !== state.currentSeason) return null;
  const record = conditionState.history.find((entry) => entry.season === state.currentSeason);
  if (!record) return null;
  const lines = record.conditions.map((instance) => {
    const definition = getWorldConditionDefinition(instance.definitionId);
    const scope = instance.scope === "global"
      ? "Global"
      : formatWorldConditionCountry(instance.countryId);
    return `${scope} — ${definition?.name ?? instance.definitionId}: ${definition?.description ?? "The football environment has changed."}`;
  });
  return {
    id: `world-conditions-s${state.currentSeason}`,
    week: 1,
    season: state.currentSeason,
    type: "news",
    title: `Season ${state.currentSeason}: The World Has Shifted`,
    body: [
      record.callback,
      "",
      ...lines,
      "",
      "Open Career > Overview to inspect every active effect and the condition archive.",
    ].join("\n"),
    read: false,
    actionRequired: false,
  };
}

/**
 * Apply one season opening atomically: deterministic conditions, a bounded
 * announcement, and an idempotent ledger movement where the market warrants it.
 */
export function applyWorldConditionSeasonStart(state: GameState): GameState {
  const conditionState = state.worldConditionState?.activeSeason === state.currentSeason
    ? migrateWorldConditionState(
      state.worldConditionState,
      state.runManifest,
      state.countries,
      state.currentSeason,
    )
    : advanceWorldConditionSeason(
      state.worldConditionState,
      state.runManifest,
      state.countries,
      state.currentSeason,
    );
  let next: GameState = { ...state, worldConditionState: conditionState };
  const message = buildWorldConditionSeasonMessage(next);
  if (message && !next.inbox.some((entry) => entry.id === message.id)) {
    next = { ...next, inbox: [...next.inbox, message] };
  }

  if (!next.finances) return next;
  const homeCountry = getScoutHomeCountry(next.scout);
  const adjustment = getWorldConditionModifiers(next, homeCountry)
    .seasonalFinanceAdjustment;
  const referenceId = `world-condition-finance:s${next.currentSeason}`;
  if (
    adjustment === 0
    || next.finances.transactions.some((transaction) =>
      transaction.referenceId === referenceId
    )
  ) {
    return next;
  }
  const finances = applyBalanceTransaction(
    next.finances,
    adjustment,
    1,
    next.currentSeason,
    adjustment > 0
      ? "Seasonal football-market dividend"
      : "Seasonal football-market adjustment",
    referenceId,
  );
  return { ...next, finances };
}
