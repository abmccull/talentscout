import type {
  Club,
  ClubFinancialObligation,
  Player,
  PlayerMatchRating,
  TransferAddOn,
} from "@/engine/core/types";

const MIN_WEEKLY_WAGE_BUDGET = 800;
// Elite first-team squads can carry several million pounds of weekly payroll.
// The old £250k ceiling left every generated top-flight club permanently over
// budget and silently blocked otherwise valid transfers and youth placements.
const MAX_WEEKLY_WAGE_BUDGET = 10_000_000;
const MIN_SCOUTING_BUDGET = 25_000;
const MAX_SCOUTING_BUDGET = 15_000_000;

const CONTINGENT_RESERVE_RATE: Record<
  "appearanceBonus" | "performanceBonus" | "relegationClause",
  number
> = {
  appearanceBonus: 0.6,
  performanceBonus: 0.4,
  relegationClause: 0.15,
};

function roundToNearest(value: number, increment: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / increment) * increment;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function contractOwner(player: Player): string {
  return player.contractClubId ?? player.loanParentClubId ?? player.clubId;
}

interface ClubRosterEconomics {
  weeklyWageCommitment: number;
  squadSize: number;
}

const EMPTY_ROSTER_ECONOMICS: ClubRosterEconomics = {
  weeklyWageCommitment: 0,
  squadSize: 0,
};

function getClubRosterEconomics(
  clubId: string,
  players: Record<string, Player>,
): ClubRosterEconomics {
  let weeklyWageCommitment = 0;
  let squadSize = 0;
  for (const player of Object.values(players)) {
    if (!player || contractOwner(player) !== clubId) continue;
    weeklyWageCommitment += Math.max(0, Math.round(player.wage ?? 0));
    squadSize += 1;
  }
  return { weeklyWageCommitment, squadSize };
}

function buildClubRosterEconomicsIndex(
  players: Record<string, Player>,
): Map<string, ClubRosterEconomics> {
  const index = new Map<string, ClubRosterEconomics>();
  for (const player of Object.values(players)) {
    if (!player) continue;
    const clubId = contractOwner(player);
    if (!clubId) continue;
    const current = index.get(clubId) ?? EMPTY_ROSTER_ECONOMICS;
    index.set(clubId, {
      weeklyWageCommitment:
        current.weeklyWageCommitment + Math.max(0, Math.round(player.wage ?? 0)),
      squadSize: current.squadSize + 1,
    });
  }
  return index;
}

function activeObligationAmount(obligation: ClubFinancialObligation): number {
  if (typeof obligation.amount === "number" && Number.isFinite(obligation.amount)) {
    return Math.max(0, obligation.amount);
  }
  if (
    typeof obligation.weeklyAmount === "number"
    && Number.isFinite(obligation.weeklyAmount)
    && typeof obligation.remainingWeeks === "number"
    && Number.isFinite(obligation.remainingWeeks)
  ) {
    return Math.max(0, obligation.weeklyAmount * Math.max(0, obligation.remainingWeeks));
  }
  return 0;
}

function triggerNumbers(trigger: string | undefined): number[] {
  return (trigger?.match(/\d+/g) ?? [])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function normalizeObligation(
  clubId: string,
  obligation: ClubFinancialObligation,
  index: number,
  currentWeek: number,
  currentSeason: number,
): ClubFinancialObligation {
  const normalizedWeeklyAmount = Number.isFinite(obligation.weeklyAmount)
    ? Math.max(0, Math.round(obligation.weeklyAmount ?? 0))
    : undefined;
  const normalizedAmount = Number.isFinite(obligation.amount)
    ? Math.max(0, Math.round(obligation.amount ?? 0))
    : undefined;
  const normalizedRemainingWeeks = Number.isFinite(obligation.remainingWeeks)
    ? Math.max(0, Math.round(obligation.remainingWeeks ?? 0))
    : undefined;
  const normalizedStatus = obligation.status === "settled" || obligation.status === "expired"
    ? obligation.status
    : "active";

  return {
    ...obligation,
    id: obligation.id || `${clubId}_obligation_${index}`,
    playerId: obligation.playerId,
    type: obligation.type,
    amount: normalizedAmount,
    percentage: Number.isFinite(obligation.percentage)
      ? Math.max(0, obligation.percentage ?? 0)
      : undefined,
    weeklyAmount: normalizedWeeklyAmount,
    remainingWeeks: normalizedRemainingWeeks,
    createdWeek: Number.isFinite(obligation.createdWeek) ? obligation.createdWeek : currentWeek,
    createdSeason: Number.isFinite(obligation.createdSeason)
      ? obligation.createdSeason
      : currentSeason,
    status: normalizedStatus,
  };
}

export function getClubWeeklyWageCommitment(
  club: Club,
  players: Record<string, Player>,
): number {
  return getClubRosterEconomics(club.id, players).weeklyWageCommitment;
}

export function getClubWeeklyObligationCommitment(club: Club): number {
  return (club.financialObligations ?? []).reduce((sum, obligation) => {
    if (obligation.status !== "active") return sum;
    if (!Number.isFinite(obligation.weeklyAmount) || (obligation.weeklyAmount ?? 0) <= 0) {
      return sum;
    }
    return sum + Math.max(0, Math.round(obligation.weeklyAmount ?? 0));
  }, 0);
}

export function getClubWeeklyCommitmentTotal(
  club: Club,
  players: Record<string, Player>,
): number {
  return getClubWeeklyWageCommitment(club, players) + getClubWeeklyObligationCommitment(club);
}

export function deriveClubWeeklyWageBudget(
  club: Club,
  players: Record<string, Player>,
): number {
  const roster = getClubRosterEconomics(club.id, players);
  return deriveClubWeeklyWageBudgetFromRoster(club, roster);
}

function deriveClubWeeklyWageBudgetFromRoster(
  club: Club,
  roster: ClubRosterEconomics,
): number {
  const committedWages = roster.weeklyWageCommitment;
  const structuralAllowance =
    club.reputation * 140
    + club.youthAcademyRating * 50
    + roster.squadSize * 110
    + Math.min(25_000, Math.max(0, club.budget) * 0.00025);

  return clamp(
    roundToNearest(
      Math.max(committedWages * 1.1, structuralAllowance),
      50,
    ),
    MIN_WEEKLY_WAGE_BUDGET,
    MAX_WEEKLY_WAGE_BUDGET,
  );
}

export function deriveClubScoutingBudget(
  club: Club,
  players: Record<string, Player>,
): number {
  return deriveClubScoutingBudgetFromRoster(
    club,
    getClubRosterEconomics(club.id, players),
  );
}

function deriveClubScoutingBudgetFromRoster(
  club: Club,
  roster: ClubRosterEconomics,
): number {
  const derived =
    club.reputation * 4_000
    + club.youthAcademyRating * 6_000
    + roster.squadSize * 1_500
    + Math.max(0, club.budget) * 0.015;

  return clamp(
    roundToNearest(derived, 1_000),
    MIN_SCOUTING_BUDGET,
    MAX_SCOUTING_BUDGET,
  );
}

export function normalizeClubEconomics(
  club: Club,
  players: Record<string, Player>,
  options: {
    currentWeek?: number;
    currentSeason?: number;
  } = {},
): Club {
  return normalizeClubEconomicsFromRoster(
    club,
    getClubRosterEconomics(club.id, players),
    options,
  );
}

function normalizeClubEconomicsFromRoster(
  club: Club,
  roster: ClubRosterEconomics,
  options: {
    currentWeek?: number;
    currentSeason?: number;
  } = {},
): Club {
  const currentWeek = options.currentWeek ?? 1;
  const currentSeason = options.currentSeason ?? 1;
  const weeklyWageBudget = Number.isFinite(club.weeklyWageBudget)
    && (club.weeklyWageBudget ?? 0) > 0
    ? Math.round(club.weeklyWageBudget ?? 0)
    : deriveClubWeeklyWageBudgetFromRoster(club, roster);
  const scoutingBudget = Number.isFinite(club.scoutingBudget)
    && (club.scoutingBudget ?? 0) > 0
    ? Math.round(club.scoutingBudget ?? 0)
    : deriveClubScoutingBudgetFromRoster(club, roster);
  const financialObligations = (club.financialObligations ?? []).map((obligation, index) =>
    normalizeObligation(club.id, obligation, index, currentWeek, currentSeason),
  );

  return {
    ...club,
    weeklyWageBudget,
    scoutingBudget,
    financialObligations,
  };
}

export function normalizeClubEconomicsMap(
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  options: {
    currentWeek?: number;
    currentSeason?: number;
  } = {},
): Record<string, Club> {
  const normalized: Record<string, Club> = {};
  const rosterEconomics = buildClubRosterEconomicsIndex(players);
  for (const [clubId, club] of Object.entries(clubs)) {
    normalized[clubId] = normalizeClubEconomicsFromRoster(
      club,
      rosterEconomics.get(clubId) ?? EMPTY_ROSTER_ECONOMICS,
      options,
    );
  }
  return normalized;
}

export interface ClubAffordabilityTerms {
  upfrontCost?: number;
  weeklyWageCommitment?: number;
  weeklyObligationCommitment?: number;
  releasedWeeklyCommitment?: number;
  /** Risk-weighted cash buffer for conditional transfer clauses. */
  contingentReserve?: number;
}

export interface ClubAffordabilityRequest extends ClubAffordabilityTerms {
  club: Club;
  players: Record<string, Player>;
}

export interface ClubAffordabilityContextEntry {
  club: Club;
  currentWeeklyCommitment: number;
}

export type ClubAffordabilityContext = Record<string, ClubAffordabilityContextEntry>;

export interface ClubAffordabilityResult {
  club: Club;
  affordable: boolean;
  upfrontCost: number;
  weeklyCommitmentDelta: number;
  currentWeeklyCommitment: number;
  projectedWeeklyCommitment: number;
  remainingBudget: number;
  contingentReserve: number;
  remainingBudgetAfterReserve: number;
  remainingWeeklyHeadroom: number;
}

function assessNormalizedClubAffordability(
  club: Club,
  currentWeeklyCommitment: number,
  terms: ClubAffordabilityTerms,
): ClubAffordabilityResult {
  const upfrontCost = Math.max(0, Math.round(terms.upfrontCost ?? 0));
  const weeklyCommitmentDelta = Math.round(terms.weeklyWageCommitment ?? 0)
    + Math.round(terms.weeklyObligationCommitment ?? 0)
    - Math.round(terms.releasedWeeklyCommitment ?? 0);
  const projectedWeeklyCommitment = Math.max(
    0,
    currentWeeklyCommitment + weeklyCommitmentDelta,
  );
  const remainingBudget = club.budget - upfrontCost;
  const contingentReserve = Math.max(0, Math.round(terms.contingentReserve ?? 0));
  const remainingBudgetAfterReserve = remainingBudget - contingentReserve;
  const remainingWeeklyHeadroom = (club.weeklyWageBudget ?? 0) - projectedWeeklyCommitment;

  return {
    club,
    affordable: remainingBudgetAfterReserve >= 0 && remainingWeeklyHeadroom >= 0,
    upfrontCost,
    weeklyCommitmentDelta,
    currentWeeklyCommitment,
    projectedWeeklyCommitment,
    remainingBudget,
    contingentReserve,
    remainingBudgetAfterReserve,
    remainingWeeklyHeadroom,
  };
}

/**
 * Build a reusable affordability view for market systems that evaluate many
 * clubs in one tick. This avoids rescanning and cloning the full player world
 * for every candidate club.
 */
export function buildClubAffordabilityContext(
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  options: {
    currentWeek?: number;
    currentSeason?: number;
  } = {},
): ClubAffordabilityContext {
  const rosterEconomics = buildClubRosterEconomicsIndex(players);
  const context: ClubAffordabilityContext = {};
  for (const [clubId, club] of Object.entries(clubs)) {
    const roster = rosterEconomics.get(clubId) ?? EMPTY_ROSTER_ECONOMICS;
    const normalizedClub = normalizeClubEconomicsFromRoster(club, roster, options);
    context[clubId] = {
      club: normalizedClub,
      currentWeeklyCommitment:
        roster.weeklyWageCommitment + getClubWeeklyObligationCommitment(normalizedClub),
    };
  }
  return context;
}

export function assessClubAffordabilityFromContext(
  entry: ClubAffordabilityContextEntry,
  terms: ClubAffordabilityTerms,
): ClubAffordabilityResult {
  return assessNormalizedClubAffordability(
    entry.club,
    entry.currentWeeklyCommitment,
    terms,
  );
}

export function assessClubAffordability(
  request: ClubAffordabilityRequest,
): ClubAffordabilityResult {
  const normalizedClub = normalizeClubEconomics(request.club, request.players);
  const currentWeeklyCommitment = getClubWeeklyCommitmentTotal(normalizedClub, request.players);
  return assessNormalizedClubAffordability(
    normalizedClub,
    currentWeeklyCommitment,
    request,
  );
}

export function buildLoanWageContributionObligation(input: {
  playerId: string;
  creditorClubId: string;
  weeklyAmount: number;
  remainingWeeks: number;
  currentWeek: number;
  currentSeason: number;
}): ClubFinancialObligation {
  const weeklyAmount = Math.max(0, Math.round(input.weeklyAmount));
  const remainingWeeks = Math.max(1, Math.round(input.remainingWeeks));

  return {
    id: `obligation_loan_${input.playerId}_${input.currentSeason}_${input.currentWeek}_${input.creditorClubId}`,
    type: "loanWageContribution",
    playerId: input.playerId,
    creditorClubId: input.creditorClubId,
    amount: weeklyAmount * remainingWeeks,
    weeklyAmount,
    remainingWeeks,
    createdWeek: input.currentWeek,
    createdSeason: input.currentSeason,
    status: "active",
    trigger: "Weekly loan wage contribution",
  };
}

export function buildTransferAddOnObligations(input: {
  playerId: string;
  creditorClubId: string;
  addOns: TransferAddOn[];
  currentWeek: number;
  currentSeason: number;
}): ClubFinancialObligation[] {
  return input.addOns.map((addOn, index) => {
    const amount = addOn.type === "sellOnClause" ? undefined : Math.max(0, Math.round(addOn.value));
    const thresholds = triggerNumbers(addOn.trigger);

    return {
      id: `obligation_addon_${input.playerId}_${addOn.type}_${input.currentSeason}_${input.currentWeek}_${index}`,
      type: addOn.type,
      playerId: input.playerId,
      creditorClubId: input.creditorClubId,
      amount,
      percentage: addOn.type === "sellOnClause"
        ? clamp(addOn.value, 0, 50)
        : undefined,
      appearanceThreshold: addOn.type === "appearanceBonus"
        ? thresholds[0] ?? 25
        : undefined,
      goalThreshold: addOn.type === "performanceBonus"
        ? thresholds[0] ?? 10
        : undefined,
      assistThreshold: addOn.type === "performanceBonus"
        ? thresholds[1] ?? thresholds[0] ?? 10
        : undefined,
      appearancesRecorded: addOn.type === "appearanceBonus" ? 0 : undefined,
      goalsRecorded: addOn.type === "performanceBonus" ? 0 : undefined,
      assistsRecorded: addOn.type === "performanceBonus" ? 0 : undefined,
      createdWeek: input.currentWeek,
      createdSeason: input.currentSeason,
      status: "active",
      trigger: addOn.trigger,
    };
  });
}

/** Risk-weighted reserve used during negotiation affordability checks. */
export function getTransferContingentReserve(
  obligations: ClubFinancialObligation[],
): number {
  return obligations.reduce((total, obligation) => {
    if (
      obligation.type !== "appearanceBonus"
      && obligation.type !== "performanceBonus"
      && obligation.type !== "relegationClause"
    ) return total;
    return total + Math.round(
      Math.max(0, obligation.amount ?? 0)
      * CONTINGENT_RESERVE_RATE[obligation.type],
    );
  }, 0);
}

function obligationCreatedOnOrAfter(
  obligation: ClubFinancialObligation,
  currentWeek: number,
  currentSeason: number,
): boolean {
  return obligation.createdSeason > currentSeason
    || (obligation.createdSeason === currentSeason && obligation.createdWeek >= currentWeek);
}

export interface WeeklyObligationSettlementResult {
  clubs: Record<string, Club>;
  processedObligationIds: string[];
  settledObligationIds: string[];
}

export function settleWeeklyClubObligations(
  clubs: Record<string, Club>,
  currentWeek: number,
  currentSeason: number,
): WeeklyObligationSettlementResult {
  const nextClubs: Record<string, Club> = {};
  for (const [clubId, club] of Object.entries(clubs)) {
    nextClubs[clubId] = {
      ...club,
      financialObligations: [...(club.financialObligations ?? [])],
    };
  }

  const processedObligationIds: string[] = [];
  const settledObligationIds: string[] = [];

  for (const clubId of Object.keys(nextClubs)) {
    const club = nextClubs[clubId];
    let budget = club.budget;
    const nextObligations: ClubFinancialObligation[] = [];

    for (const obligation of club.financialObligations ?? []) {
      if (
        obligation.status !== "active"
        || !Number.isFinite(obligation.weeklyAmount)
        || (obligation.weeklyAmount ?? 0) <= 0
        || obligationCreatedOnOrAfter(obligation, currentWeek, currentSeason)
        || (
          obligation.lastProcessedWeek === currentWeek
          && obligation.lastProcessedSeason === currentSeason
        )
      ) {
        nextObligations.push(obligation);
        continue;
      }

      const outstandingAmount = activeObligationAmount(obligation);
      if (outstandingAmount <= 0) {
        nextObligations.push({
          ...obligation,
          amount: 0,
          status: "settled",
          remainingWeeks: 0,
          lastProcessedWeek: currentWeek,
          lastProcessedSeason: currentSeason,
        });
        settledObligationIds.push(obligation.id);
        continue;
      }

      const due = Math.min(Math.max(0, obligation.weeklyAmount ?? 0), outstandingAmount);
      const payment = Math.min(due, Math.max(0, budget));
      processedObligationIds.push(obligation.id);

      if (payment > 0) {
        budget -= payment;
        const creditorClubId = obligation.creditorClubId;
        if (creditorClubId && nextClubs[creditorClubId]) {
          nextClubs[creditorClubId] = {
            ...nextClubs[creditorClubId],
            budget: nextClubs[creditorClubId].budget + payment,
            financialObligations: [...(nextClubs[creditorClubId].financialObligations ?? [])],
          };
        }
      }

      const remainingAmount = Math.max(0, outstandingAmount - payment);
      if (remainingAmount <= 0) {
        nextObligations.push({
          ...obligation,
          amount: 0,
          remainingWeeks: 0,
          status: "settled",
          lastProcessedWeek: currentWeek,
          lastProcessedSeason: currentSeason,
        });
        settledObligationIds.push(obligation.id);
        continue;
      }

      nextObligations.push({
        ...obligation,
        amount: remainingAmount,
        remainingWeeks: obligation.remainingWeeks === undefined
          ? undefined
          : Math.max(1, obligation.remainingWeeks - (payment > 0 ? 1 : 0)),
        lastProcessedWeek: currentWeek,
        lastProcessedSeason: currentSeason,
      });
    }

    nextClubs[clubId] = {
      ...club,
      budget,
      financialObligations: nextObligations,
    };
  }

  return {
    clubs: nextClubs,
    processedObligationIds,
    settledObligationIds,
  };
}

export interface ClubObligationFixture {
  homeClubId: string;
  awayClubId: string;
  playerRatings?: Record<string, PlayerMatchRating>;
}

/**
 * Advance appearance/performance clauses from this week's canonical match
 * ratings and settle the face value only when the authored trigger is met.
 */
export function settleTriggeredClubObligations(
  clubs: Record<string, Club>,
  fixtures: ClubObligationFixture[],
  currentWeek: number,
  currentSeason: number,
): WeeklyObligationSettlementResult {
  const nextClubs = Object.fromEntries(
    Object.entries(clubs).map(([clubId, club]) => [
      clubId,
      { ...club, financialObligations: [...(club.financialObligations ?? [])] },
    ]),
  );
  const processedObligationIds: string[] = [];
  const settledObligationIds: string[] = [];

  for (const clubId of Object.keys(nextClubs)) {
    const club = nextClubs[clubId];
    let budget = club.budget;
    const relevantFixtures = fixtures.filter((fixture) =>
      fixture.homeClubId === clubId || fixture.awayClubId === clubId
    );
    const obligations = (club.financialObligations ?? []).map((obligation) => {
      if (
        obligation.status !== "active"
        || obligation.triggeredSeason !== undefined
        || (
          obligation.type !== "appearanceBonus"
          && obligation.type !== "performanceBonus"
        )
        || (
          obligation.lastTriggerEvaluationWeek === currentWeek
          && obligation.lastTriggerEvaluationSeason === currentSeason
        )
      ) return obligation;

      let appearances = obligation.appearancesRecorded ?? 0;
      let goals = obligation.goalsRecorded ?? 0;
      let assists = obligation.assistsRecorded ?? 0;
      for (const fixture of relevantFixtures) {
        const rating = fixture.playerRatings?.[obligation.playerId];
        if (!rating) continue;
        appearances += 1;
        goals += Math.max(0, rating.stats.goals ?? 0);
        assists += Math.max(0, rating.stats.assists ?? 0);
      }

      const triggered = obligation.type === "appearanceBonus"
        ? appearances >= Math.max(1, obligation.appearanceThreshold ?? 25)
        : goals >= Math.max(1, obligation.goalThreshold ?? 10)
          || assists >= Math.max(1, obligation.assistThreshold ?? 10);
      const progress = {
        appearancesRecorded: appearances,
        goalsRecorded: goals,
        assistsRecorded: assists,
        lastTriggerEvaluationWeek: currentWeek,
        lastTriggerEvaluationSeason: currentSeason,
      };
      if (!triggered) return { ...obligation, ...progress };

      const due = Math.max(0, Math.round(obligation.amount ?? 0));
      const payment = Math.min(due, Math.max(0, budget));
      budget -= payment;
      if (
        payment > 0
        && obligation.creditorClubId
        && obligation.creditorClubId !== clubId
        && nextClubs[obligation.creditorClubId]
      ) {
        nextClubs[obligation.creditorClubId] = {
          ...nextClubs[obligation.creditorClubId],
          budget: nextClubs[obligation.creditorClubId].budget + payment,
        };
      }
      processedObligationIds.push(obligation.id);
      const remaining = due - payment;
      if (remaining <= 0) {
        settledObligationIds.push(obligation.id);
        return {
          ...obligation,
          ...progress,
          amount: 0,
          status: "settled" as const,
          triggeredWeek: currentWeek,
          triggeredSeason: currentSeason,
        };
      }
      return {
        ...obligation,
        ...progress,
        amount: remaining,
        weeklyAmount: Math.max(1, Math.ceil(remaining / 12)),
        remainingWeeks: 12,
        triggeredWeek: currentWeek,
        triggeredSeason: currentSeason,
      };
    });
    nextClubs[clubId] = { ...club, budget, financialObligations: obligations };
  }

  return { clubs: nextClubs, processedObligationIds, settledObligationIds };
}

/** Trigger relegation-contingent clauses once, converting unpaid balances to installments. */
export function settleRelegationClubObligations(
  clubs: Record<string, Club>,
  relegatedClubIds: ReadonlySet<string>,
  currentWeek: number,
  currentSeason: number,
): WeeklyObligationSettlementResult {
  const nextClubs = Object.fromEntries(
    Object.entries(clubs).map(([clubId, club]) => [
      clubId,
      { ...club, financialObligations: [...(club.financialObligations ?? [])] },
    ]),
  );
  const processedObligationIds: string[] = [];
  const settledObligationIds: string[] = [];

  for (const clubId of relegatedClubIds) {
    const club = nextClubs[clubId];
    if (!club) continue;
    let budget = club.budget;
    const obligations = (club.financialObligations ?? []).map((obligation) => {
      if (
        obligation.type !== "relegationClause"
        || obligation.status !== "active"
        || obligation.triggeredSeason !== undefined
      ) return obligation;

      const due = Math.max(0, Math.round(obligation.amount ?? 0));
      const payment = Math.min(due, Math.max(0, budget));
      budget -= payment;
      if (
        payment > 0
        && obligation.creditorClubId
        && obligation.creditorClubId !== clubId
        && nextClubs[obligation.creditorClubId]
      ) {
        nextClubs[obligation.creditorClubId] = {
          ...nextClubs[obligation.creditorClubId],
          budget: nextClubs[obligation.creditorClubId].budget + payment,
        };
      }
      processedObligationIds.push(obligation.id);
      const remaining = due - payment;
      if (remaining <= 0) {
        settledObligationIds.push(obligation.id);
        return {
          ...obligation,
          amount: 0,
          status: "settled" as const,
          triggeredWeek: currentWeek,
          triggeredSeason: currentSeason,
        };
      }
      return {
        ...obligation,
        amount: remaining,
        weeklyAmount: Math.max(1, Math.ceil(remaining / 12)),
        remainingWeeks: 12,
        triggeredWeek: currentWeek,
        triggeredSeason: currentSeason,
      };
    });
    nextClubs[clubId] = { ...club, budget, financialObligations: obligations };
  }

  return { clubs: nextClubs, processedObligationIds, settledObligationIds };
}
