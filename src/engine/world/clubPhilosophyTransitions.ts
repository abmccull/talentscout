import type {
  Club,
  GameState,
  ManagerProfile,
  ScoutingPhilosophy,
} from "@/engine/core/types";
import type { ClubSeasonHistory } from "@/engine/world/worldHistory";
import {
  getWorldConditionDefinition,
  type WorldConditionDefinition,
} from "./worldConditions";

export const CLUB_PHILOSOPHY_TRANSITION_STATE_VERSION = 1 as const;
export const CLUB_PHILOSOPHY_TRANSITION_HISTORY_LIMIT = 512;

export type ClubPhilosophyTransitionReasonCode =
  | "academyStrength"
  | "budgetPressure"
  | "crossBorderDemand"
  | "leadershipDataTurn"
  | "leadershipEyeTestTurn"
  | "leadershipResultsPressure"
  | "leadershipWideSearch"
  | "promotionReset"
  | "relegationReset"
  | "resourcePush"
  | "resultsPressure"
  | "worldContraction"
  | "worldDevelopment"
  | "worldExpansion"
  | "worldMediaScrutiny";

export interface ClubPhilosophyTransitionRecord {
  id: string;
  clubId: string;
  season: number;
  leagueId: string;
  countryId?: string;
  fromPhilosophy: ScoutingPhilosophy;
  toPhilosophy: ScoutingPhilosophy;
  managerId?: string;
  managerPreference?: ManagerProfile["preference"];
  reportInfluence?: number;
  standingSummary?: string;
  leagueMovement?: ClubSeasonHistory["leagueMovement"];
  worldConditionNames: string[];
  reasonCodes: ClubPhilosophyTransitionReasonCode[];
  reasons: string[];
}

export interface ClubPhilosophyTransitionState {
  version: typeof CLUB_PHILOSOPHY_TRANSITION_STATE_VERSION;
  /** Highest season opening this system has already processed. */
  activeSeason: number;
  history: ClubPhilosophyTransitionRecord[];
}

interface TransitionSignal {
  code: ClubPhilosophyTransitionReasonCode;
  weight: number;
  text: string;
}

interface ScoredTransitionCandidate {
  to: ScoutingPhilosophy;
  score: number;
  reasons: TransitionSignal[];
}

const PHILOSOPHY_ORDER: readonly ScoutingPhilosophy[] = [
  "academyFirst",
  "marketSmart",
  "globalRecruiter",
  "winNow",
] as const;

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function clampSeason(value: number): number {
  return Math.max(0, Math.floor(value));
}

function isPhilosophy(value: unknown): value is ScoutingPhilosophy {
  return PHILOSOPHY_ORDER.includes(value as ScoutingPhilosophy);
}

function isReasonCode(value: unknown): value is ClubPhilosophyTransitionReasonCode {
  return [
    "academyStrength",
    "budgetPressure",
    "crossBorderDemand",
    "leadershipDataTurn",
    "leadershipEyeTestTurn",
    "leadershipResultsPressure",
    "leadershipWideSearch",
    "promotionReset",
    "relegationReset",
    "resourcePush",
    "resultsPressure",
    "worldContraction",
    "worldDevelopment",
    "worldExpansion",
    "worldMediaScrutiny",
  ].includes(value as ClubPhilosophyTransitionReasonCode);
}

function compareRecords(
  left: ClubPhilosophyTransitionRecord,
  right: ClubPhilosophyTransitionRecord,
): number {
  return left.season - right.season
    || left.clubId.localeCompare(right.clubId)
    || left.id.localeCompare(right.id);
}

function defaultTransitionState(currentSeason: number): ClubPhilosophyTransitionState {
  return {
    version: CLUB_PHILOSOPHY_TRANSITION_STATE_VERSION,
    activeSeason: Math.max(0, currentSeason - 1),
    history: [],
  };
}

export function createClubPhilosophyTransitionState(
  partial: Partial<ClubPhilosophyTransitionState> = {},
  currentSeason = 1,
): ClubPhilosophyTransitionState {
  const deduped = new Map<string, ClubPhilosophyTransitionRecord>();
  for (const record of partial.history ?? []) {
    deduped.set(`${record.season}:${record.clubId}`, record);
  }
  const history = [...deduped.values()]
    .sort(compareRecords)
    .slice(-CLUB_PHILOSOPHY_TRANSITION_HISTORY_LIMIT);
  return {
    version: CLUB_PHILOSOPHY_TRANSITION_STATE_VERSION,
    activeSeason: Number.isInteger(partial.activeSeason)
      ? clampSeason(partial.activeSeason!)
      : Math.max(0, currentSeason - 1),
    history,
  };
}

function normalizeTransitionRecord(
  value: unknown,
): ClubPhilosophyTransitionRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ClubPhilosophyTransitionRecord>;
  if (
    typeof record.id !== "string"
    || typeof record.clubId !== "string"
    || !Number.isInteger(record.season)
    || typeof record.leagueId !== "string"
    || !isPhilosophy(record.fromPhilosophy)
    || !isPhilosophy(record.toPhilosophy)
    || record.fromPhilosophy === record.toPhilosophy
  ) {
    return null;
  }
  const worldConditionNames = Array.isArray(record.worldConditionNames)
    ? record.worldConditionNames.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    )
    : [];
  const reasonCodes = Array.isArray(record.reasonCodes)
    ? record.reasonCodes.filter(isReasonCode)
    : [];
  const reasons = Array.isArray(record.reasons)
    ? record.reasons.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    )
    : [];
  return {
    id: record.id,
    clubId: record.clubId,
    season: clampSeason(record.season!),
    leagueId: record.leagueId,
    ...(typeof record.countryId === "string" && record.countryId.trim().length > 0
      ? { countryId: record.countryId }
      : {}),
    fromPhilosophy: record.fromPhilosophy,
    toPhilosophy: record.toPhilosophy,
    ...(typeof record.managerId === "string" && record.managerId.trim().length > 0
      ? { managerId: record.managerId }
      : {}),
    ...(record.managerPreference ? { managerPreference: record.managerPreference } : {}),
    ...(typeof record.reportInfluence === "number" && Number.isFinite(record.reportInfluence)
      ? { reportInfluence: record.reportInfluence }
      : {}),
    ...(typeof record.standingSummary === "string" && record.standingSummary.trim().length > 0
      ? { standingSummary: record.standingSummary }
      : {}),
    ...(record.leagueMovement ? { leagueMovement: record.leagueMovement } : {}),
    worldConditionNames: [...new Set(worldConditionNames)].sort((left, right) =>
      left.localeCompare(right),
    ),
    reasonCodes: [...new Set(reasonCodes)].sort((left, right) => left.localeCompare(right)),
    reasons: [...new Set(reasons)],
  };
}

/** Pure, idempotent compatibility path for legacy saves and cloud reloads. */
export function migrateClubPhilosophyTransitionState(
  value: unknown,
  currentSeason: number,
): ClubPhilosophyTransitionState {
  if (!value || typeof value !== "object") {
    return defaultTransitionState(currentSeason);
  }
  const candidate = value as Partial<ClubPhilosophyTransitionState>;
  const history = Array.isArray(candidate.history)
    ? candidate.history.flatMap((entry) => {
      const normalized = normalizeTransitionRecord(entry);
      return normalized ? [normalized] : [];
    })
    : [];
  return createClubPhilosophyTransitionState(
    {
      activeSeason: Number.isInteger(candidate.activeSeason)
        ? clampSeason(candidate.activeSeason!)
        : Math.max(0, currentSeason - 1),
      history,
    },
    currentSeason,
  );
}

function standingSummary(history: ClubSeasonHistory | undefined): string | undefined {
  if (!history?.standing) return undefined;
  return `${history.standing.position}/${history.standing.tableSize}`;
}

function getCompletedSeasonClubHistory(
  state: Pick<GameState, "currentSeason" | "worldHistory">,
  clubId: string,
): ClubSeasonHistory | undefined {
  const targetSeason = Math.max(1, state.currentSeason - 1);
  const seasons = state.worldHistory?.seasons ?? [];
  const seasonRecord = seasons.find((season) => season.season === targetSeason)
    ?? seasons[seasons.length - 1];
  return seasonRecord?.clubs.find((club) => club.clubId === clubId);
}

function getClubCountry(
  state: Pick<GameState, "leagues">,
  club: Pick<Club, "leagueId">,
): string | undefined {
  return state.leagues[club.leagueId]?.country;
}

function getActiveConditionDefinitions(
  state: Pick<GameState, "currentSeason" | "worldConditionState">,
  countryId?: string,
): WorldConditionDefinition[] {
  if (state.worldConditionState?.activeSeason !== state.currentSeason) return [];
  return state.worldConditionState.active
    .filter((instance) =>
      instance.scope === "global" || (countryId !== undefined && instance.countryId === countryId)
    )
    .flatMap((instance) => {
      const definition = getWorldConditionDefinition(instance.definitionId);
      return definition ? [definition] : [];
    });
}

function addSignal(
  candidates: Record<ScoutingPhilosophy, TransitionSignal[]>,
  to: ScoutingPhilosophy,
  current: ScoutingPhilosophy,
  signal: TransitionSignal | null,
): void {
  if (!signal || to === current || signal.weight <= 0) return;
  candidates[to].push(signal);
}

function transitionPenalty(
  from: ScoutingPhilosophy,
  to: ScoutingPhilosophy,
): number {
  if (
    (from === "winNow" && to === "academyFirst")
    || (from === "academyFirst" && to === "winNow")
  ) {
    return 2;
  }
  if (
    (from === "academyFirst" && to === "globalRecruiter")
    || (from === "globalRecruiter" && to === "academyFirst")
  ) {
    return 1;
  }
  return 0;
}

function scoreClubTransition(
  state: Pick<
    GameState,
    "seed" | "currentSeason" | "leagues" | "worldConditionState" | "managerProfiles" | "worldHistory"
  >,
  club: Club,
): ClubPhilosophyTransitionRecord | null {
  const manager = state.managerProfiles[club.id];
  const previousSeason = getCompletedSeasonClubHistory(state, club.id);
  const countryId = getClubCountry(state, club);
  const conditionDefinitions = getActiveConditionDefinitions(state, countryId);
  const activeNames = [...new Set(conditionDefinitions.map((definition) => definition.name))]
    .sort((left, right) => left.localeCompare(right));
  const activeTags = new Set(conditionDefinitions.flatMap((definition) => definition.tags));
  const candidates: Record<ScoutingPhilosophy, TransitionSignal[]> = {
    academyFirst: [],
    marketSmart: [],
    globalRecruiter: [],
    winNow: [],
  };

  const standing = previousSeason?.standing;
  const standingRatio = standing ? standing.position / Math.max(1, standing.tableSize) : undefined;
  const topQuarter = standingRatio !== undefined && standingRatio <= 0.25;
  const bottomQuarter = standingRatio !== undefined && standingRatio >= 0.75;
  const relegated = previousSeason?.leagueMovement === "relegated";
  const promoted = previousSeason?.leagueMovement === "promoted";

  if (relegated) {
    addSignal(candidates, "marketSmart", club.scoutingPhilosophy, {
      code: "relegationReset",
      weight: 5,
      text: `${club.name} were relegated, making disciplined recruitment and resale logic harder to ignore.`,
    });
    addSignal(candidates, "academyFirst", club.scoutingPhilosophy, {
      code: "relegationReset",
      weight: club.youthAcademyRating >= 15 ? 3 : 1,
      text: `Relegation increases the appeal of rebuilding around the club's own pathway players.`,
    });
  } else if (promoted) {
    addSignal(candidates, "marketSmart", club.scoutingPhilosophy, {
      code: "promotionReset",
      weight: 3,
      text: `${club.name} were promoted and now need a more selective, evidence-led squad build.`,
    });
  }

  if (bottomQuarter) {
    addSignal(candidates, "marketSmart", club.scoutingPhilosophy, {
      code: "resultsPressure",
      weight: 3,
      text: `A ${standingSummary(previousSeason)} finish increased pressure to stop wasting budget on the wrong bets.`,
    });
  }
  if (topQuarter) {
    addSignal(candidates, "winNow", club.scoutingPhilosophy, {
      code: "resourcePush",
      weight: club.reputation >= 72 ? 3 : 2,
      text: `${club.name}'s ${standingSummary(previousSeason)} finish raises expectations for immediate-impact recruitment.`,
    });
  }

  if (club.youthAcademyRating >= 16) {
    addSignal(candidates, "academyFirst", club.scoutingPhilosophy, {
      code: "academyStrength",
      weight: 3,
      text: `An academy rating of ${club.youthAcademyRating} makes long-pathway recruitment a credible identity, not a slogan.`,
    });
    addSignal(candidates, "globalRecruiter", club.scoutingPhilosophy, {
      code: "crossBorderDemand",
      weight: club.reputation >= 70 ? 2 : 1,
      text: `A strong academy base gives the club cover to widen its search without abandoning development.`,
    });
  }

  if (club.budget <= 3_500_000 || club.reputation <= 58) {
    addSignal(candidates, "marketSmart", club.scoutingPhilosophy, {
      code: "budgetPressure",
      weight: 2,
      text: `Budget and status constraints make value discipline more sustainable than chasing prestige deals.`,
    });
  }
  if (club.budget >= 8_500_000 && club.reputation >= 75) {
    addSignal(candidates, "winNow", club.scoutingPhilosophy, {
      code: "resourcePush",
      weight: 2,
      text: `${club.name} have the resources and status to behave more aggressively in the market.`,
    });
  }
  if (club.budget >= 6_000_000 && club.reputation >= 72) {
    addSignal(candidates, "globalRecruiter", club.scoutingPhilosophy, {
      code: "crossBorderDemand",
      weight: 1,
      text: `The club's scale can support wider international coverage without stretching every deal.`,
    });
  }

  switch (manager?.preference) {
    case "dataFirst":
      addSignal(candidates, "marketSmart", club.scoutingPhilosophy, {
        code: "leadershipDataTurn",
        weight: 3,
        text: `${manager.managerName} pushes for cleaner pricing, stronger proof, and more data-led decisions.`,
      });
      break;
    case "resultsBased":
      addSignal(candidates, "winNow", club.scoutingPhilosophy, {
        code: "leadershipResultsPressure",
        weight: 3,
        text: `${manager.managerName} is judged on immediate results and pulls the club toward ready-now recruitment.`,
      });
      break;
    case "balanced":
      addSignal(candidates, "globalRecruiter", club.scoutingPhilosophy, {
        code: "leadershipWideSearch",
        weight: 2,
        text: `${manager.managerName} is comfortable blending network intelligence and broad-market scanning.`,
      });
      break;
    case "eyeTest":
      addSignal(candidates, "academyFirst", club.scoutingPhilosophy, {
        code: "leadershipEyeTestTurn",
        weight: 2,
        text: `${manager.managerName} trusts live, contextual evidence and is more open to development-led recruitment.`,
      });
      break;
    default:
      break;
  }

  if (manager?.reportInfluence !== undefined && manager.reportInfluence >= 0.72) {
    if (manager.preference === "dataFirst") {
      addSignal(candidates, "marketSmart", club.scoutingPhilosophy, {
        code: "leadershipDataTurn",
        weight: 1,
        text: `The manager gives scouting evidence real weight, so report-led value decisions can stick.`,
      });
    } else if (manager.preference === "balanced") {
      addSignal(candidates, "globalRecruiter", club.scoutingPhilosophy, {
        code: "leadershipWideSearch",
        weight: 1,
        text: `Scouting reports carry influence, making broader search lanes easier to defend internally.`,
      });
    } else if (manager.preference === "eyeTest") {
      addSignal(candidates, "academyFirst", club.scoutingPhilosophy, {
        code: "leadershipEyeTestTurn",
        weight: 1,
        text: `Leadership is willing to trust contextual live reads over short-term market noise.`,
      });
    }
  }

  if (activeTags.has("finance") || activeTags.has("contraction")) {
    addSignal(candidates, "marketSmart", club.scoutingPhilosophy, {
      code: "worldContraction",
      weight: 2,
      text: `The current football economy rewards caution, pricing discipline, and lower-risk acquisition paths.`,
    });
  }
  if (activeTags.has("development") || activeTags.has("youth") || activeTags.has("welfare")) {
    addSignal(candidates, "academyFirst", club.scoutingPhilosophy, {
      code: "worldDevelopment",
      weight: 2,
      text: `This season's development climate makes patient pathway bets easier to justify.`,
    });
  }
  if (activeTags.has("discovery") || activeTags.has("competition") || activeTags.has("travel")) {
    addSignal(candidates, "globalRecruiter", club.scoutingPhilosophy, {
      code: "crossBorderDemand",
      weight: club.reputation >= 68 ? 2 : 1,
      text: `The current scouting map is throwing up more cross-border leads than a narrow domestic model can exploit.`,
    });
  }
  if (activeTags.has("media")) {
    addSignal(candidates, "winNow", club.scoutingPhilosophy, {
      code: "worldMediaScrutiny",
      weight: topQuarter ? 2 : 1,
      text: `Media pressure raises the cost of patience and amplifies the demand for visible short-term returns.`,
    });
  }
  if (activeTags.has("expansion") && club.reputation >= 74) {
    addSignal(candidates, "winNow", club.scoutingPhilosophy, {
      code: "worldExpansion",
      weight: 1,
      text: `An expanding market increases the temptation to convert status into immediate squad upgrades.`,
    });
  }

  const scored = PHILOSOPHY_ORDER
    .filter((philosophy) => philosophy !== club.scoutingPhilosophy)
    .map<ScoredTransitionCandidate>((to) => {
      const reasons = [...candidates[to]].sort((left, right) =>
        right.weight - left.weight
        || left.code.localeCompare(right.code)
        || left.text.localeCompare(right.text)
      );
      const rawScore = reasons.reduce((total, signal) => total + signal.weight, 0);
      return {
        to,
        score: rawScore - transitionPenalty(club.scoutingPhilosophy, to),
        reasons,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) =>
      right.score - left.score
      || right.reasons.length - left.reasons.length
      || stableHash(`${state.seed}:${club.id}:${state.currentSeason}:${left.to}`)
        - stableHash(`${state.seed}:${club.id}:${state.currentSeason}:${right.to}`)
    );

  const best = scored[0];
  if (!best || best.score < 7) return null;

  return {
    id: `club-philosophy:s${state.currentSeason}:${club.id}`,
    clubId: club.id,
    season: state.currentSeason,
    leagueId: club.leagueId,
    ...(countryId ? { countryId } : {}),
    fromPhilosophy: club.scoutingPhilosophy,
    toPhilosophy: best.to,
    ...(manager?.managerId ? { managerId: manager.managerId } : {}),
    ...(manager?.preference ? { managerPreference: manager.preference } : {}),
    ...(typeof manager?.reportInfluence === "number"
      ? { reportInfluence: manager.reportInfluence }
      : {}),
    ...(standing ? { standingSummary: standingSummary(previousSeason) } : {}),
    ...(previousSeason?.leagueMovement ? { leagueMovement: previousSeason.leagueMovement } : {}),
    worldConditionNames: activeNames,
    reasonCodes: [...new Set(best.reasons.map((reason) => reason.code))]
      .sort((left, right) => left.localeCompare(right)),
    reasons: best.reasons.slice(0, 3).map((reason) => reason.text),
  };
}

/**
 * Resolve club recruitment-philosophy changes exactly once per season start.
 * The pass is deterministic, uses only player-visible signals, and writes a
 * bounded reason history for future UI timelines and audit trails.
 */
export function applyClubPhilosophySeasonStart(
  state: GameState,
): GameState {
  const transitionState = migrateClubPhilosophyTransitionState(
    state.clubPhilosophyTransitionState,
    state.currentSeason,
  );
  if (transitionState.activeSeason >= state.currentSeason) {
    return state.clubPhilosophyTransitionState === transitionState
      ? state
      : { ...state, clubPhilosophyTransitionState: transitionState };
  }

  const processedClubIds = new Set(
    transitionState.history
      .filter((record) => record.season === state.currentSeason)
      .map((record) => record.clubId),
  );
  let changed = false;
  const clubs = { ...state.clubs };
  const additions: ClubPhilosophyTransitionRecord[] = [];

  for (const clubId of Object.keys(state.clubs).sort((left, right) => left.localeCompare(right))) {
    if (processedClubIds.has(clubId)) continue;
    const club = clubs[clubId];
    if (!club) continue;
    const transition = scoreClubTransition(state, club);
    if (!transition) continue;
    additions.push(transition);
    clubs[clubId] = {
      ...club,
      scoutingPhilosophy: transition.toPhilosophy,
    };
    changed = true;
  }

  const nextTransitionState = createClubPhilosophyTransitionState(
    {
      activeSeason: state.currentSeason,
      history: [...transitionState.history, ...additions],
    },
    state.currentSeason,
  );

  if (!changed && state.clubPhilosophyTransitionState === nextTransitionState) {
    return state;
  }
  return {
    ...state,
    clubs: changed ? clubs : state.clubs,
    clubPhilosophyTransitionState: nextTransitionState,
  };
}
