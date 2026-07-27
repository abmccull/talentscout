import type { CareerPath, GameState, InboxMessage } from "@/engine/core/types";
import type { GameDate } from "@/engine/consequences/types";
import { elapsedGameWeeks } from "@/engine/consequences/decisionLedger";
import { createNamedRNG } from "@/engine/run";
import type { StoryCandidateV2, StoryCandidateKind } from "./storyDirectorV2";

export const CAREER_ERA_DIRECTOR_VERSION = 1 as const;
export const CAREER_ERA_HISTORY_LIMIT = 12;
export const CAREER_ERA_PROCESSED_WEEK_LIMIT = 128;
export const CAREER_ERA_IDENTITY_GAP_WEEKS = 3;

export type CareerEraTheme =
  | "proveJudgment"
  | "territoryBuild"
  | "relationshipDebt"
  | "rivalPressure"
  | "careerLeverage"
  | "recovery"
  | "leadershipQuality"
  | "agencyRunway";

export interface CareerEraDefinition {
  theme: CareerEraTheme;
  title: string;
  premise: string;
  deskPrompt: string;
  boostedCategoryTokens: readonly string[];
  boostedKinds: readonly StoryCandidateKind[];
  suppressedCategoryTokens: readonly string[];
}

export interface CareerEra {
  id: string;
  theme: CareerEraTheme;
  title: string;
  premise: string;
  deskPrompt: string;
  startedAt: GameDate;
  endsAt: GameDate;
  primaryCountryId?: string;
  primaryProspectId?: string;
  reinforcementCount: number;
  lastReinforcedAt?: GameDate;
}

export interface CareerEraHistoryRecord {
  id: string;
  theme: CareerEraTheme;
  title: string;
  startedAt: GameDate;
  endedAt: GameDate;
  reinforcementCount: number;
}

export interface CareerEraDirectorState {
  version: typeof CAREER_ERA_DIRECTOR_VERSION;
  current?: CareerEra;
  history: CareerEraHistoryRecord[];
  processedWeekKeys: string[];
}

export interface CareerEraContext {
  rootSeed: string;
  now: GameDate;
  seasonLength: number;
  careerPath: CareerPath;
  careerTier: number;
  employeeCount: number;
  financialBalance: number;
  activeRecovery: boolean;
  activeObligationCount: number;
  offeredDecisionCount: number;
  rivalPressure: number;
  knownCountryCount: number;
  reportCount: number;
  primaryCountryId?: string;
  primaryProspectId?: string;
}

export interface PreparedCareerEraWeek {
  state: CareerEraDirectorState;
  candidate?: StoryCandidateV2;
  message?: InboxMessage;
}

const ERA_DEFINITIONS: Record<CareerEraTheme, CareerEraDefinition> = {
  proveJudgment: {
    theme: "proveJudgment",
    title: "A judgment worth defending",
    premise: "Your next reports will define whether decision-makers trust your eye or merely tolerate your paperwork.",
    deskPrompt: "Find the case where stronger evidence could turn an opinion into a career-defining recommendation.",
    boostedCategoryTokens: ["report", "recommend", "discovery", "prospect", "vindication"],
    boostedKinds: ["callback"],
    suppressedCategoryTokens: ["finance", "operating"],
  },
  territoryBuild: {
    theme: "territoryBuild",
    title: "Earn the territory",
    premise: "A region is opening, but access and interpretation must be earned before competitors establish the story first.",
    deskPrompt: "Choose whether to deepen one local network or chase broader coverage before the window closes.",
    boostedCategoryTokens: ["access", "regional", "territory", "travel", "world-pulse"],
    boostedKinds: ["worldArc", "worldPulse"],
    suppressedCategoryTokens: ["job", "finance"],
  },
  relationshipDebt: {
    theme: "relationshipDebt",
    title: "Promises are becoming leverage",
    premise: "People remember who received access, credit and protection. Existing obligations are starting to collide.",
    deskPrompt: "Decide which promise deserves scarce attention before someone else defines your priorities for you.",
    boostedCategoryTokens: ["relationship", "media", "ethics", "welfare", "gossip", "callback"],
    boostedKinds: ["relationshipConflict", "callback"],
    suppressedCategoryTokens: ["market-shock"],
  },
  rivalPressure: {
    theme: "rivalPressure",
    title: "Someone else is working the same lead",
    premise: "A rival network is closing distance, turning information control and timing into part of the scouting judgment.",
    deskPrompt: "Protect the lead, accelerate the evidence or accept that another scout may act first.",
    boostedCategoryTokens: ["rival", "poach", "counterplay", "market", "discovery"],
    boostedKinds: ["rivalOpportunity", "rivalCampaign"],
    suppressedCategoryTokens: ["training"],
  },
  careerLeverage: {
    theme: "careerLeverage",
    title: "Authority has a price",
    premise: "Your growing standing creates openings, but every step upward comes with a mandate and political cost.",
    deskPrompt: "Build leverage for the role you want without neglecting the work that made your reputation.",
    boostedCategoryTokens: ["career", "politic", "board", "performance", "job", "leadership"],
    boostedKinds: ["special", "callback"],
    suppressedCategoryTokens: ["world-pulse"],
  },
  recovery: {
    theme: "recovery",
    title: "The comeback must be earned",
    premise: "A setback has changed how the football world reads your work. New evidence matters more than old status.",
    deskPrompt: "Choose the piece of work that proves what has changed since the failure.",
    boostedCategoryTokens: ["recovery", "failure", "vindication", "career", "report"],
    boostedKinds: ["callback", "special"],
    suppressedCategoryTokens: ["prestige"],
  },
  leadershipQuality: {
    theme: "leadershipQuality",
    title: "Your name is on other people's work",
    premise: "Delegation creates scale, but staff judgment and missed context now carry your reputation.",
    deskPrompt: "Decide where your own attention is indispensable and where the team must be trusted.",
    boostedCategoryTokens: ["staff", "delegat", "leadership", "quality", "career"],
    boostedKinds: ["callback", "relationshipConflict"],
    suppressedCategoryTokens: ["standalone"],
  },
  agencyRunway: {
    theme: "agencyRunway",
    title: "Independence needs a business model",
    premise: "Cash runway, client concentration and reputation exposure are pulling the practice in different directions.",
    deskPrompt: "Choose between dependable work now and the speculative case that could transform the practice.",
    boostedCategoryTokens: ["finance", "agency", "client", "market", "contract", "operating"],
    boostedKinds: ["special", "callback"],
    suppressedCategoryTokens: ["world-pulse"],
  },
};

const THEMES = Object.keys(ERA_DEFINITIONS) as CareerEraTheme[];

function validDate(value: unknown): value is GameDate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<GameDate>;
  return Number.isFinite(candidate.week)
    && Number.isFinite(candidate.season)
    && candidate.week! >= 1
    && candidate.season! >= 1;
}

function cloneDate(date: GameDate): GameDate {
  return { week: Math.floor(date.week), season: Math.floor(date.season) };
}

function advanceDate(date: GameDate, weeks: number, seasonLength: number): GameDate {
  const safeLength = Math.max(1, Math.floor(seasonLength));
  const absolute = date.season * safeLength + (date.week - 1) + Math.max(0, Math.floor(weeks));
  return {
    season: Math.floor(absolute / safeLength),
    week: (absolute % safeLength) + 1,
  };
}

function compareDate(left: GameDate, right: GameDate, seasonLength: number): number {
  const safeLength = Math.max(1, Math.floor(seasonLength));
  const leftValue = left.season * safeLength + left.week;
  const rightValue = right.season * safeLength + right.week;
  return leftValue - rightValue;
}

function safeTheme(value: unknown): CareerEraTheme | undefined {
  return typeof value === "string" && THEMES.includes(value as CareerEraTheme)
    ? value as CareerEraTheme
    : undefined;
}

function safeEra(value: unknown): CareerEra | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<CareerEra>;
  const theme = safeTheme(candidate.theme);
  if (
    !theme
    || typeof candidate.id !== "string"
    || !candidate.id.trim()
    || !validDate(candidate.startedAt)
    || !validDate(candidate.endsAt)
  ) return undefined;
  const definition = ERA_DEFINITIONS[theme];
  return {
    id: candidate.id,
    theme,
    title: typeof candidate.title === "string" && candidate.title.trim()
      ? candidate.title
      : definition.title,
    premise: typeof candidate.premise === "string" && candidate.premise.trim()
      ? candidate.premise
      : definition.premise,
    deskPrompt: typeof candidate.deskPrompt === "string" && candidate.deskPrompt.trim()
      ? candidate.deskPrompt
      : definition.deskPrompt,
    startedAt: cloneDate(candidate.startedAt),
    endsAt: cloneDate(candidate.endsAt),
    ...(typeof candidate.primaryCountryId === "string" && candidate.primaryCountryId.trim()
      ? { primaryCountryId: candidate.primaryCountryId }
      : {}),
    ...(typeof candidate.primaryProspectId === "string" && candidate.primaryProspectId.trim()
      ? { primaryProspectId: candidate.primaryProspectId }
      : {}),
    reinforcementCount: Number.isFinite(candidate.reinforcementCount)
      ? Math.max(0, Math.floor(candidate.reinforcementCount!))
      : 0,
    ...(validDate(candidate.lastReinforcedAt)
      ? { lastReinforcedAt: cloneDate(candidate.lastReinforcedAt) }
      : {}),
  };
}

function safeHistory(value: unknown): CareerEraHistoryRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Partial<CareerEraHistoryRecord>;
    const theme = safeTheme(candidate.theme);
    if (
      !theme
      || typeof candidate.id !== "string"
      || !candidate.id.trim()
      || !validDate(candidate.startedAt)
      || !validDate(candidate.endedAt)
    ) return [];
    return [{
      id: candidate.id,
      theme,
      title: typeof candidate.title === "string" && candidate.title.trim()
        ? candidate.title
        : ERA_DEFINITIONS[theme].title,
      startedAt: cloneDate(candidate.startedAt),
      endedAt: cloneDate(candidate.endedAt),
      reinforcementCount: Number.isFinite(candidate.reinforcementCount)
        ? Math.max(0, Math.floor(candidate.reinforcementCount!))
        : 0,
    }];
  }).slice(-CAREER_ERA_HISTORY_LIMIT);
}

export function createCareerEraDirectorState(
  partial: Partial<CareerEraDirectorState> = {},
): CareerEraDirectorState {
  return {
    version: CAREER_ERA_DIRECTOR_VERSION,
    current: safeEra(partial.current),
    history: safeHistory(partial.history),
    processedWeekKeys: Array.isArray(partial.processedWeekKeys)
      ? [...new Set(partial.processedWeekKeys.filter((key): key is string =>
          typeof key === "string" && key.trim().length > 0,
        ))].slice(-CAREER_ERA_PROCESSED_WEEK_LIMIT)
      : [],
  };
}

export function migrateCareerEraDirectorState(raw: unknown): CareerEraDirectorState {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? createCareerEraDirectorState(raw as Partial<CareerEraDirectorState>)
    : createCareerEraDirectorState();
}

export function deriveCareerEraContext(
  state: GameState,
  seasonLength: number,
): CareerEraContext {
  const activeObligationCount = Object.values(state.consequenceState.obligations)
    .filter((obligation) => obligation.status === "active")
    .length;
  const offeredDecisionCount = Object.values(state.consequenceState.decisions)
    .filter((decision) => decision.status === "offered")
    .length;
  const pressure = state.rivalOrganizationState.currentPressure;
  const rivalPressure = Math.max(
    pressure.discoveryChanceMultiplier,
    pressure.poachChanceMultiplier,
    pressure.signingChanceMultiplier,
  );
  const caseStatusPriority = { open: 4, reported: 3, delivered: 2, placed: 1, closed: 0 } as const;
  const primaryProspectId = Object.values(state.scoutingCases)
    .filter((caseRecord) => caseRecord.status !== "closed")
    .sort((left, right) =>
      caseStatusPriority[right.status] - caseStatusPriority[left.status]
      || right.lastUpdatedSeason - left.lastUpdatedSeason
      || right.lastUpdatedWeek - left.lastUpdatedWeek
      || left.id.localeCompare(right.id),
    )[0]?.playerId;
  const primaryCountryId = Object.values(state.regionalKnowledge)
    .sort((left, right) =>
      right.knowledgeLevel - left.knowledgeLevel
      || left.countryId.localeCompare(right.countryId),
    )[0]?.countryId ?? state.scout.homeCountry;
  return {
    rootSeed: state.runManifest.rootSeed,
    now: { week: state.currentWeek, season: state.currentSeason },
    seasonLength: Math.max(1, Math.floor(seasonLength)),
    careerPath: state.scout.careerPath,
    careerTier: state.scout.careerTier,
    employeeCount: state.finances?.employees.length ?? 0,
    financialBalance: state.finances?.balance ?? 0,
    activeRecovery: Boolean(state.careerRecovery?.current),
    activeObligationCount,
    offeredDecisionCount,
    rivalPressure,
    // Regional knowledge initializes every generated country at zero. Count
    // only markets where the scout has earned enough context to act, otherwise
    // a broad world setup falsely reads as an established territorial network.
    knownCountryCount: Object.values(state.regionalKnowledge)
      .filter((knowledge) => knowledge.knowledgeLevel >= 10)
      .length,
    reportCount: Object.keys(state.reports).length,
    primaryCountryId,
    primaryProspectId,
  };
}

function themeWeights(context: CareerEraContext): Array<{ item: CareerEraTheme; weight: number }> {
  const lowRunway = context.financialBalance < Math.max(4_000, context.employeeCount * 2_000);
  const weights: Array<{ item: CareerEraTheme; weight: number }> = [
    { item: "proveJudgment", weight: 2 + Math.min(2, context.reportCount / 12) },
    { item: "territoryBuild", weight: context.knownCountryCount <= 2 ? 3 : 1.25 },
    {
      item: "relationshipDebt",
      weight: context.activeObligationCount > 0 || context.offeredDecisionCount > 0
        ? 2.5 + Math.min(3, context.activeObligationCount * 0.5)
        : 0.75,
    },
    { item: "rivalPressure", weight: context.rivalPressure > 1.05 ? 3.5 : 0.75 },
    { item: "careerLeverage", weight: context.careerTier >= 3 ? 2 : 0.75 },
    { item: "recovery", weight: context.activeRecovery ? 12 : 0 },
    { item: "leadershipQuality", weight: context.careerTier >= 4 ? 3 : 0 },
    {
      item: "agencyRunway",
      weight: context.careerPath === "independent" && (context.employeeCount > 0 || lowRunway)
        ? 3.5
        : context.careerPath === "independent" ? 1.25 : 0,
    },
  ];
  return weights.filter((entry) => entry.weight > 0);
}

function startEra(
  context: CareerEraContext,
  previous?: CareerEra,
): CareerEra {
  const rng = createNamedRNG(
    context.rootSeed,
    "career-era-director",
    context.now.season,
    context.now.week,
    previous?.id ?? "opening",
  );
  let weighted = themeWeights(context);
  if (previous && weighted.length > 1) {
    weighted = weighted.map((entry) => ({
      ...entry,
      weight: entry.item === previous.theme ? entry.weight * 0.2 : entry.weight,
    }));
  }
  const theme = context.activeRecovery
    ? "recovery"
    : rng.pickWeighted(weighted);
  const definition = ERA_DEFINITIONS[theme];
  const durationWeeks = rng.nextInt(4, 12);
  return {
    id: `career-era-${context.now.season}-${context.now.week}-${theme}`,
    theme,
    title: definition.title,
    premise: definition.premise,
    deskPrompt: definition.deskPrompt,
    startedAt: cloneDate(context.now),
    endsAt: advanceDate(context.now, durationWeeks, context.seasonLength),
    ...(context.primaryCountryId ? { primaryCountryId: context.primaryCountryId } : {}),
    ...(context.primaryProspectId ? { primaryProspectId: context.primaryProspectId } : {}),
    reinforcementCount: 0,
  };
}

export function directCareerEra(
  partial: Partial<CareerEraDirectorState> | undefined,
  context: CareerEraContext,
): CareerEraDirectorState {
  const state = createCareerEraDirectorState(partial);
  const weekKey = `${context.now.season}:${context.now.week}`;
  if (state.processedWeekKeys.includes(weekKey)) return state;

  let current = state.current;
  let history = state.history;
  if (!current || compareDate(context.now, current.endsAt, context.seasonLength) > 0) {
    if (current) {
      history = [...history, {
        id: current.id,
        theme: current.theme,
        title: current.title,
        startedAt: cloneDate(current.startedAt),
        endedAt: cloneDate(current.endsAt),
        reinforcementCount: current.reinforcementCount,
      }].slice(-CAREER_ERA_HISTORY_LIMIT);
    }
    current = startEra(context, current);
  }

  return {
    version: CAREER_ERA_DIRECTOR_VERSION,
    current,
    history,
    processedWeekKeys: [...state.processedWeekKeys, weekKey]
      .slice(-CAREER_ERA_PROCESSED_WEEK_LIMIT),
  };
}

function candidateText(candidate: StoryCandidateV2): string {
  return [candidate.category, candidate.semanticSignature, candidate.templateId]
    .join(" ")
    .toLowerCase();
}

function includesAny(value: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => value.includes(token.toLowerCase()));
}

export function applyCareerEraDirection(
  candidates: readonly StoryCandidateV2[],
  era: CareerEra | undefined,
): StoryCandidateV2[] {
  if (!era) return candidates.map((candidate) => ({ ...candidate }));
  const definition = ERA_DEFINITIONS[era.theme];
  return candidates.map((candidate) => {
    const text = candidateText(candidate);
    const aligned = definition.boostedKinds.includes(candidate.kind)
      || includesAny(text, definition.boostedCategoryTokens);
    const suppressed = !candidate.critical
      && !candidate.continuation
      && includesAny(text, definition.suppressedCategoryTokens);
    const eraMultiplier = aligned ? 1.65 : suppressed ? 0.82 : 1;
    return {
      ...candidate,
      relevanceMultipliers: [
        ...(candidate.relevanceMultipliers ?? []),
        eraMultiplier,
      ],
    };
  });
}

export function careerEraIdentityGapWeeks(
  era: CareerEra,
  now: GameDate,
  seasonLength: number,
): number {
  return Math.max(
    0,
    elapsedGameWeeks(now, era.lastReinforcedAt ?? era.startedAt, seasonLength),
  );
}

export function prepareCareerEraWeek(input: {
  state: GameState;
  directorState?: Partial<CareerEraDirectorState>;
  seasonLength: number;
  blockedByActivity: boolean;
}): PreparedCareerEraWeek {
  const context = deriveCareerEraContext(input.state, input.seasonLength);
  const state = directCareerEra(input.directorState, context);
  const era = state.current;
  if (
    !era
    || input.blockedByActivity
    || careerEraIdentityGapWeeks(era, context.now, context.seasonLength)
      < CAREER_ERA_IDENTITY_GAP_WEEKS
  ) return { state };

  const candidateId = `career-era-beat-${era.id}-${context.now.season}-${context.now.week}`;
  return {
    state,
    candidate: {
      id: candidateId,
      templateId: `career-era:${era.theme}`,
      kind: "worldPulse",
      category: `career-era:${era.theme}`,
      semanticSignature: `career-era:${era.id}`,
      baseWeight: 1,
      cast: [],
      topics: [
        ...(era.primaryCountryId
          ? [{ kind: "country" as const, id: era.primaryCountryId }]
          : []),
        ...(era.primaryProspectId
          ? [{ kind: "player" as const, id: era.primaryProspectId }]
          : []),
      ],
      continuation: true,
      requiresChoice: false,
    },
    message: {
      id: candidateId,
      week: context.now.week,
      season: context.now.season,
      type: "news",
      title: era.title,
      body: `${era.premise} ${era.deskPrompt}`,
      read: false,
      actionRequired: false,
      relatedId: era.primaryProspectId ?? era.id,
      relatedEntityType: era.primaryProspectId ? "player" : "narrative",
    },
  };
}

export function applyDirectedCareerEraBeat(input: {
  gameState: GameState;
  prepared: PreparedCareerEraWeek;
  acceptedCandidateIds: ReadonlySet<string>;
}): GameState {
  const candidate = input.prepared.candidate;
  const accepted = candidate && input.acceptedCandidateIds.has(candidate.id);
  const alreadyApplied = Boolean(
    input.prepared.message
    && input.gameState.inbox.some((message) => message.id === input.prepared.message!.id),
  );
  const shouldApply = Boolean(accepted && !alreadyApplied);
  const current = input.prepared.state.current;
  const careerEraDirectorState: CareerEraDirectorState = shouldApply && current
    ? {
        ...input.prepared.state,
        current: {
          ...current,
          reinforcementCount: current.reinforcementCount + 1,
          lastReinforcedAt: {
            week: input.gameState.currentWeek,
            season: input.gameState.currentSeason,
          },
        },
      }
    : input.gameState.careerEraDirectorState ?? input.prepared.state;
  return {
    ...input.gameState,
    careerEraDirectorState,
    inbox: shouldApply && input.prepared.message
      ? [...input.gameState.inbox, input.prepared.message]
      : input.gameState.inbox,
  };
}

export function getCareerEraDefinition(theme: CareerEraTheme): CareerEraDefinition {
  return ERA_DEFINITIONS[theme];
}
