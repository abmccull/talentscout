import type {
  Club,
  FreeAgentPool,
  GameState,
  LoanDeal,
  LoanOutcome,
  Player,
  PlayerMovementEvent,
  PlayerMovementType,
  TransferAddOn,
} from "@/engine/core/types";
import {
  gameWeeksBetweenWithSeasonLength,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "@/engine/core/gameDate";
import {
  assessClubAffordability,
  buildLoanWageContributionObligation,
  buildTransferAddOnObligations,
  getTransferContingentReserve,
  normalizeClubEconomicsMap,
} from "@/engine/finance/clubEconomics";

export interface LifecycleWorldState {
  players: Record<string, Player>;
  clubs: Record<string, Club>;
  activeLoans: LoanDeal[];
  loanHistory: LoanDeal[];
  retiredPlayers: Record<string, Player>;
  retiredPlayerIds: string[];
  playerMovementHistory: PlayerMovementEvent[];
  freeAgentPool: FreeAgentPool;
}

interface BaseIntent {
  playerId: string;
  reason?: string;
}

export type PlayerMovementIntent =
  | (BaseIntent & {
      type: "youthSigning";
      toClubId: string;
      contractLength?: number;
      wage?: number;
    })
  | (BaseIntent & {
      type: "permanentTransfer";
      fromClubId: string;
      toClubId: string;
      fee: number;
      contractLength?: number;
      wage?: number;
      signingBonus?: number;
      addOns?: TransferAddOn[];
    })
  | (BaseIntent & { type: "loanStart"; deal: LoanDeal })
  | (BaseIntent & {
      type: "loanEnd";
      dealId: string;
      resolution: "return" | "recall" | "buyOption";
      outcome?: LoanOutcome;
    })
  | (BaseIntent & { type: "release"; fromClubId: string })
  | (BaseIntent & {
      type: "freeAgentSigning";
      toClubId: string;
      wage: number;
      contractLength: number;
      signingBonus?: number;
    })
  | (BaseIntent & {
      type: "contractRenewal";
      clubId: string;
      contractLength: number;
      wage?: number;
    })
  | (BaseIntent & { type: "retirement" | "footballExit" });

export interface RejectedPlayerMovement {
  intent: PlayerMovementIntent;
  reason: string;
}

export interface LifecycleResolution {
  state: LifecycleWorldState;
  applied: PlayerMovementEvent[];
  rejected: RejectedPlayerMovement[];
}

const PRIORITY: Record<PlayerMovementIntent["type"], number> = {
  retirement: 100,
  footballExit: 100,
  loanEnd: 90,
  permanentTransfer: 80,
  release: 70,
  contractRenewal: 65,
  freeAgentSigning: 60,
  youthSigning: 50,
  loanStart: 40,
};

function cloneState(state: LifecycleWorldState): LifecycleWorldState {
  return {
    players: { ...state.players },
    clubs: { ...state.clubs },
    activeLoans: [...state.activeLoans],
    loanHistory: [...state.loanHistory],
    retiredPlayers: { ...state.retiredPlayers },
    retiredPlayerIds: [...state.retiredPlayerIds],
    playerMovementHistory: [...state.playerMovementHistory],
    freeAgentPool: {
      ...state.freeAgentPool,
      agents: [...state.freeAgentPool.agents],
    },
  };
}

function contractOwner(player: Player): string {
  return player.contractClubId ?? player.loanParentClubId ?? player.clubId;
}

function weeklyPlayerObligationCommitment(
  club: Club | undefined,
  playerId: string,
  obligationType?: "loanWageContribution",
): number {
  if (!club) return 0;
  return (club.financialObligations ?? []).reduce((sum, obligation) => {
    if (obligation.status !== "active" || obligation.playerId !== playerId) return sum;
    if (obligationType && obligation.type !== obligationType) return sum;
    return sum + Math.max(0, obligation.weeklyAmount ?? 0);
  }, 0);
}

function markPlayerObligations(
  club: Club | undefined,
  playerId: string,
  status: "expired" | "settled" = "expired",
  obligationType?: "loanWageContribution",
): Club | undefined {
  if (!club) return club;
  const updated = (club.financialObligations ?? []).map((obligation) => {
    if (obligation.playerId !== playerId || obligation.status !== "active") return obligation;
    if (obligationType && obligation.type !== obligationType) return obligation;
    return {
      ...obligation,
      amount: 0,
      weeklyAmount: obligation.weeklyAmount,
      remainingWeeks: 0,
      status,
    };
  });
  return { ...club, financialObligations: updated };
}

function settleTransferSellOnClauses(
  clubs: Record<string, Club>,
  sellerClubId: string,
  playerId: string,
  transferFee: number,
): {
  clubs: Record<string, Club>;
  sellerNetProceeds: number;
  settlements: NonNullable<PlayerMovementEvent["financialSettlements"]>;
} {
  const seller = clubs[sellerClubId];
  if (!seller || transferFee <= 0) {
    return { clubs, sellerNetProceeds: Math.max(0, transferFee), settlements: [] };
  }

  let remainingProceeds = transferFee;
  const settlements: NonNullable<PlayerMovementEvent["financialSettlements"]> = [];
  const obligations = (seller.financialObligations ?? []).map((obligation) => {
    if (
      obligation.status !== "active"
      || obligation.type !== "sellOnClause"
      || obligation.playerId !== playerId
    ) return obligation;

    const percentage = Math.max(0, Math.min(50, obligation.percentage ?? 0));
    const hasExternalCreditor = Boolean(
      obligation.creditorClubId
      && obligation.creditorClubId !== sellerClubId
      && clubs[obligation.creditorClubId],
    );
    const amount = hasExternalCreditor
      ? Math.min(
          remainingProceeds,
          Math.round(transferFee * percentage / 100),
        )
      : 0;
    remainingProceeds -= amount;
    if (amount > 0 && obligation.creditorClubId && clubs[obligation.creditorClubId]) {
      clubs[obligation.creditorClubId] = {
        ...clubs[obligation.creditorClubId],
        budget: clubs[obligation.creditorClubId].budget + amount,
      };
    }
    settlements.push({
      type: obligation.type,
      amount,
      creditorClubId: obligation.creditorClubId,
      obligationId: obligation.id,
    });
    return {
      ...obligation,
      amount: 0,
      remainingWeeks: 0,
      status: "settled" as const,
    };
  });
  clubs[sellerClubId] = { ...seller, financialObligations: obligations };
  return { clubs, sellerNetProceeds: remainingProceeds, settlements };
}

function withoutPlayer(ids: string[] | undefined, playerId: string): string[] {
  return (ids ?? []).filter((id) => id !== playerId);
}

function buildClubMembershipIndex(
  clubs: Record<string, Club>,
): Map<string, Set<string>> {
  const memberships = new Map<string, Set<string>>();
  for (const [clubId, club] of Object.entries(clubs)) {
    for (const playerId of [
      ...club.playerIds,
      ...(club.academyPlayerIds ?? []),
      ...(club.loanedOutPlayerIds ?? []),
      ...(club.loanedInPlayerIds ?? []),
    ]) {
      const existing = memberships.get(playerId);
      if (existing) existing.add(clubId);
      else memberships.set(playerId, new Set([clubId]));
    }
  }
  return memberships;
}

function cleanClubMembership(
  clubs: Record<string, Club>,
  playerId: string,
  memberships: ReadonlyMap<string, ReadonlySet<string>>,
): Record<string, Club> {
  // `clubs` is already a transaction-local clone. Replace only the club
  // objects known to contain this player instead of cloning and scanning all
  // 360 clubs for every weekly movement intent.
  for (const clubId of memberships.get(playerId) ?? []) {
    const club = clubs[clubId];
    if (!club) continue;
    const playerIds = withoutPlayer(club.playerIds, playerId);
    const academyPlayerIds = withoutPlayer(club.academyPlayerIds, playerId);
    const loanedOutPlayerIds = withoutPlayer(club.loanedOutPlayerIds, playerId);
    const loanedInPlayerIds = withoutPlayer(club.loanedInPlayerIds, playerId);
    if (
      playerIds.length !== club.playerIds.length ||
      academyPlayerIds.length !== (club.academyPlayerIds ?? []).length ||
      loanedOutPlayerIds.length !== (club.loanedOutPlayerIds ?? []).length ||
      loanedInPlayerIds.length !== (club.loanedInPlayerIds ?? []).length
    ) {
      clubs[clubId] = {
        ...club,
        playerIds,
        academyPlayerIds,
        loanedOutPlayerIds,
        loanedInPlayerIds,
      };
    }
  }
  return clubs;
}

function registerAtClub(
  clubs: Record<string, Club>,
  player: Player,
  clubId: string,
): Record<string, Club> {
  const club = clubs[clubId];
  if (!club) return clubs;
  clubs[clubId] = player.age < 18
    ? {
        ...club,
        academyPlayerIds: [...new Set([...(club.academyPlayerIds ?? []), player.id])],
      }
    : {
        ...club,
        playerIds: [...new Set([...club.playerIds, player.id])],
      };
  return clubs;
}

function defaultContractLength(player: Player): number {
  if (player.age >= 33) return 1;
  if (player.age >= 29) return 2;
  return 3;
}

function defaultWage(player: Player): number {
  return Math.max(100, player.wage, Math.round(player.currentAbility * 60));
}

function loanDurationWeeks(
  deal: LoanDeal,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): number {
  return Math.max(
    1,
    gameWeeksBetweenWithSeasonLength(
      { week: deal.startWeek, season: deal.startSeason },
      { week: deal.endWeek, season: deal.endSeason },
      seasonLength,
    ),
  );
}

function clearLoanFields(player: Player): Player {
  return {
    ...player,
    onLoan: undefined,
    loanParentClubId: undefined,
    loanEndWeek: undefined,
    loanEndSeason: undefined,
  };
}

function eventFor(
  type: PlayerMovementType,
  intent: PlayerMovementIntent,
  week: number,
  season: number,
  historyLength: number,
  details: Partial<PlayerMovementEvent> = {},
): PlayerMovementEvent {
  return {
    id: `move_${season}_${week}_${historyLength}_${intent.playerId}_${type}`,
    playerId: intent.playerId,
    type,
    week,
    season,
    reason: intent.reason,
    ...details,
  };
}

function reject(
  rejected: RejectedPlayerMovement[],
  intent: PlayerMovementIntent,
  reason: string,
): false {
  rejected.push({ intent, reason });
  return false;
}

/** Build the canonical lifecycle slice from a GameState. */
export function getLifecycleWorld(state: GameState): LifecycleWorldState {
  return {
    players: state.players,
    clubs: state.clubs,
    activeLoans: state.activeLoans ?? [],
    loanHistory: state.loanHistory ?? [],
    retiredPlayers: state.retiredPlayers ?? {},
    retiredPlayerIds: state.retiredPlayerIds ?? [],
    playerMovementHistory: state.playerMovementHistory ?? [],
    freeAgentPool: state.freeAgentPool,
  };
}

/** Merge an authoritative lifecycle slice back into a GameState. */
export function withLifecycleWorld(
  state: GameState,
  lifecycle: LifecycleWorldState,
): GameState {
  return {
    ...state,
    players: lifecycle.players,
    clubs: lifecycle.clubs,
    activeLoans: lifecycle.activeLoans,
    loanHistory: lifecycle.loanHistory,
    retiredPlayers: lifecycle.retiredPlayers,
    retiredPlayerIds: lifecycle.retiredPlayerIds,
    playerMovementHistory: lifecycle.playerMovementHistory,
    freeAgentPool: lifecycle.freeAgentPool,
  };
}

/**
 * Apply lifecycle changes atomically. Each player can resolve at most one
 * intent per call; higher-priority terminal transitions win deterministic
 * conflicts (for example retirement over renewal).
 */
export function resolvePlayerMovements(
  input: LifecycleWorldState,
  intents: PlayerMovementIntent[],
  currentWeek: number,
  currentSeason: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): LifecycleResolution {
  let state = cloneState(input);
  state.clubs = normalizeClubEconomicsMap(state.clubs, state.players, {
    currentWeek,
    currentSeason,
  });
  const applied: PlayerMovementEvent[] = [];
  const rejected: RejectedPlayerMovement[] = [];
  const reserved = new Set<string>();
  const clubMemberships = buildClubMembershipIndex(state.clubs);
  const ordered = intents
    .map((intent, index) => ({ intent, index }))
    .sort((a, b) => PRIORITY[b.intent.type] - PRIORITY[a.intent.type] || a.index - b.index);

  for (const { intent } of ordered) {
    if (reserved.has(intent.playerId)) {
      reject(rejected, intent, "another lifecycle transition already resolved this tick");
      continue;
    }

    const player = state.players[intent.playerId];
    if (!player) {
      reject(rejected, intent, "player is not active in the world");
      continue;
    }

    let movement: PlayerMovementEvent | null = null;

    if (intent.type === "retirement" || intent.type === "footballExit") {
      const owner = contractOwner(player) || undefined;
      const activeLoan = state.activeLoans.find(
        (deal) => deal.playerId === player.id && deal.status === "active",
      );
      state.clubs = cleanClubMembership(state.clubs, player.id, clubMemberships);
      if (activeLoan) {
        state.activeLoans = state.activeLoans.filter((deal) => deal.id !== activeLoan.id);
        state.loanHistory.push({
          ...activeLoan,
          status: "terminated",
          outcome: "terminated",
        });
        state.clubs[activeLoan.loanClubId] = markPlayerObligations(
          state.clubs[activeLoan.loanClubId],
          player.id,
          "expired",
          "loanWageContribution",
        ) ?? state.clubs[activeLoan.loanClubId];
      }
      state.retiredPlayers[player.id] = player;
      delete state.players[player.id];
      state.retiredPlayerIds = [...new Set([...state.retiredPlayerIds, player.id])];
      const poolAgent = state.freeAgentPool.agents.find((agent) => agent.playerId === player.id);
      const shouldCountPoolRetirement =
        poolAgent !== undefined && poolAgent.status !== "retired" && poolAgent.status !== "droppedOut";
      state.freeAgentPool = {
        ...state.freeAgentPool,
        agents: state.freeAgentPool.agents.filter((agent) => agent.playerId !== player.id),
        totalRetiredThisSeason:
          state.freeAgentPool.totalRetiredThisSeason + (shouldCountPoolRetirement ? 1 : 0),
      };
      movement = eventFor(intent.type, intent, currentWeek, currentSeason,
        state.playerMovementHistory.length + applied.length, {
          fromClubId: player.clubId || undefined,
          contractClubId: owner,
          loanDealId: activeLoan?.id,
        });
    } else if (intent.type === "contractRenewal") {
      const owner = contractOwner(player);
      if (!owner || owner !== intent.clubId) {
        reject(rejected, intent, "contract renewal must be issued by the owning club");
        continue;
      }
      const renewedWage = Math.max(100, intent.wage ?? defaultWage(player));
      const affordability = assessClubAffordability({
        club: state.clubs[owner],
        players: state.players,
        weeklyWageCommitment: renewedWage,
        releasedWeeklyCommitment: Math.max(0, player.wage),
      });
      if (!affordability.affordable) {
        reject(rejected, intent, "club cannot absorb the renewed weekly wage");
        continue;
      }
      state.clubs[owner] = affordability.club;
      state.players[player.id] = {
        ...player,
        contractClubId: owner,
        contractExpiry: currentSeason + Math.max(1, intent.contractLength),
        wage: renewedWage,
      };
      movement = eventFor("contractRenewal", intent, currentWeek, currentSeason,
        state.playerMovementHistory.length + applied.length, {
          fromClubId: owner,
          toClubId: owner,
          contractClubId: owner,
        });
    } else if (intent.type === "release") {
      const owner = contractOwner(player);
      if (!owner || owner !== intent.fromClubId) {
        reject(rejected, intent, "only the owning club can release the player");
        continue;
      }
      const activeLoan = state.activeLoans.find(
        (deal) => deal.playerId === player.id && deal.status === "active",
      );
      if (activeLoan) {
        state.activeLoans = state.activeLoans.filter((deal) => deal.id !== activeLoan.id);
        state.loanHistory.push({
          ...activeLoan,
          status: "terminated",
          outcome: "terminated",
        });
        state.clubs[activeLoan.loanClubId] = markPlayerObligations(
          state.clubs[activeLoan.loanClubId],
          player.id,
          "expired",
          "loanWageContribution",
        ) ?? state.clubs[activeLoan.loanClubId];
      }
      state.clubs = cleanClubMembership(state.clubs, player.id, clubMemberships);
      state.players[player.id] = {
        ...clearLoanFields(player),
        clubId: "",
        contractClubId: undefined,
        contractExpiry: 0,
        wage: 0,
      };
      movement = eventFor("release", intent, currentWeek, currentSeason,
        state.playerMovementHistory.length + applied.length, {
          fromClubId: owner,
          loanDealId: activeLoan?.id,
        });
    } else if (intent.type === "freeAgentSigning" || intent.type === "youthSigning") {
      const owner = contractOwner(player);
      const target = state.clubs[intent.toClubId];
      if (owner || player.onLoan || !target) {
        reject(rejected, intent, "signing requires an unattached player and valid destination");
        continue;
      }
      const signingBonus = intent.type === "freeAgentSigning" ? (intent.signingBonus ?? 0) : 0;
      const signedWage = Math.max(100, intent.wage ?? defaultWage(player));
      const affordability = assessClubAffordability({
        club: target,
        players: state.players,
        upfrontCost: signingBonus,
        weeklyWageCommitment: signedWage,
      });
      if (!affordability.affordable) {
        const pressure = affordability.remainingBudgetAfterReserve < 0
          ? `cash shortfall ${Math.abs(affordability.remainingBudgetAfterReserve)}`
          : `weekly wage shortfall ${Math.abs(affordability.remainingWeeklyHeadroom)}`;
        reject(rejected, intent, `destination cannot afford the signing package (${pressure})`);
        continue;
      }
      state.clubs = cleanClubMembership(state.clubs, player.id, clubMemberships);
      state.clubs[intent.toClubId] = {
        ...affordability.club,
        budget: affordability.club.budget - signingBonus,
      };
      const contractLength = Math.max(
        1,
        intent.contractLength ?? defaultContractLength(player),
      );
      const signedPlayer: Player = {
        ...clearLoanFields(player),
        clubId: intent.toClubId,
        contractClubId: intent.toClubId,
        contractExpiry: currentSeason + contractLength,
        wage: signedWage,
      };
      state.players[player.id] = signedPlayer;
      state.clubs = registerAtClub(state.clubs, signedPlayer, intent.toClubId);
      const poolAgent = state.freeAgentPool.agents.find((agent) => agent.playerId === player.id);
      state.freeAgentPool = {
        ...state.freeAgentPool,
        agents: state.freeAgentPool.agents.filter((agent) => agent.playerId !== player.id),
        totalSignedThisSeason:
          state.freeAgentPool.totalSignedThisSeason +
          (poolAgent && poolAgent.status !== "signed" ? 1 : 0),
      };
      movement = eventFor(intent.type, intent, currentWeek, currentSeason,
        state.playerMovementHistory.length + applied.length, {
          toClubId: intent.toClubId,
          contractClubId: intent.toClubId,
          fee: signingBonus || undefined,
        });
    } else if (intent.type === "permanentTransfer") {
      const owner = contractOwner(player);
      const fromClub = state.clubs[intent.fromClubId];
      const toClub = state.clubs[intent.toClubId];
      if (player.onLoan || !owner || owner !== intent.fromClubId || !fromClub || !toClub) {
        reject(rejected, intent, "permanent transfer requires the owning club and a non-loaned player");
        continue;
      }
      const signingBonus = Math.max(0, intent.signingBonus ?? 0);
      const transferWage = Math.max(100, intent.wage ?? defaultWage(player));
      const addOnObligations = buildTransferAddOnObligations({
        playerId: player.id,
        creditorClubId: intent.fromClubId,
        addOns: intent.addOns ?? [],
        currentWeek,
        currentSeason,
      });
      const addOnWeeklyCommitment = addOnObligations.reduce(
        (sum, obligation) => sum + Math.max(0, obligation.weeklyAmount ?? 0),
        0,
      );
      const affordability = assessClubAffordability({
        club: toClub,
        players: state.players,
        upfrontCost: intent.fee + signingBonus,
        weeklyWageCommitment: transferWage,
        weeklyObligationCommitment: addOnWeeklyCommitment,
        contingentReserve: getTransferContingentReserve(addOnObligations),
      });
      const totalCost = intent.fee + signingBonus;
      if (
        intent.fromClubId === intent.toClubId ||
        intent.fee < 0 ||
        !affordability.affordable
      ) {
        reject(rejected, intent, "invalid destination or unaffordable transfer package");
        continue;
      }
      const sellOnSettlement = settleTransferSellOnClauses(
        state.clubs,
        intent.fromClubId,
        player.id,
        intent.fee,
      );
      state.clubs = cleanClubMembership(
        sellOnSettlement.clubs,
        player.id,
        clubMemberships,
      );
      state.clubs[intent.fromClubId] = {
        ...state.clubs[intent.fromClubId],
        budget: state.clubs[intent.fromClubId].budget + sellOnSettlement.sellerNetProceeds,
      };
      state.clubs[intent.toClubId] = {
        ...state.clubs[intent.toClubId],
        budget: state.clubs[intent.toClubId].budget - totalCost,
        financialObligations: [
          ...(state.clubs[intent.toClubId].financialObligations ?? []),
          ...addOnObligations,
        ],
      };
      const transferred: Player = {
        ...clearLoanFields(player),
        clubId: intent.toClubId,
        contractClubId: intent.toClubId,
        contractExpiry:
          currentSeason + Math.max(1, intent.contractLength ?? defaultContractLength(player)),
        wage: transferWage,
        morale: Math.min(10, player.morale + 2),
      };
      state.players[player.id] = transferred;
      state.clubs = registerAtClub(state.clubs, transferred, intent.toClubId);
      movement = eventFor("permanentTransfer", intent, currentWeek, currentSeason,
        state.playerMovementHistory.length + applied.length, {
          fromClubId: intent.fromClubId,
          toClubId: intent.toClubId,
          contractClubId: intent.toClubId,
          fee: intent.fee,
          financialSettlements: sellOnSettlement.settlements,
        });
    } else if (intent.type === "loanStart") {
      const owner = contractOwner(player);
      const deal = intent.deal;
      const parent = state.clubs[deal.parentClubId];
      const loanClub = state.clubs[deal.loanClubId];
      if (
        player.onLoan ||
        player.age < 16 ||
        !owner ||
        owner !== deal.parentClubId ||
        player.clubId !== deal.parentClubId ||
        !parent ||
        !loanClub ||
        state.activeLoans.some((active) => active.playerId === player.id && active.status === "active")
      ) {
        reject(rejected, intent, "loan requires an eligible player registered with the owning club");
        continue;
      }
      const wageContribution = Math.max(0, Math.min(100, deal.wageContribution));
      const weeklyContribution = Math.round(player.wage * wageContribution / 100);
      const loanWeeks = loanDurationWeeks(deal, seasonLength);
      const affordability = assessClubAffordability({
        club: loanClub,
        players: state.players,
        upfrontCost: deal.loanFee,
        weeklyObligationCommitment: weeklyContribution,
      });
      if (!affordability.affordable) {
        reject(rejected, intent, "loan club cannot afford the fee and weekly wage contribution");
        continue;
      }
      state.clubs = cleanClubMembership(state.clubs, player.id, clubMemberships);
      state.clubs[deal.parentClubId] = {
        ...state.clubs[deal.parentClubId],
        budget: state.clubs[deal.parentClubId].budget + deal.loanFee,
        loanedOutPlayerIds: [
          ...new Set([...(state.clubs[deal.parentClubId].loanedOutPlayerIds ?? []), player.id]),
        ],
      };
      state.clubs[deal.loanClubId] = {
        ...affordability.club,
        budget: affordability.club.budget - deal.loanFee,
        playerIds: [...new Set([...state.clubs[deal.loanClubId].playerIds, player.id])],
        loanedInPlayerIds: [
          ...new Set([...(state.clubs[deal.loanClubId].loanedInPlayerIds ?? []), player.id]),
        ],
        financialObligations: [
          ...(affordability.club.financialObligations ?? []),
          buildLoanWageContributionObligation({
            playerId: player.id,
            creditorClubId: deal.parentClubId,
            weeklyAmount: weeklyContribution,
            remainingWeeks: loanWeeks,
            currentWeek,
            currentSeason,
          }),
        ],
      };
      state.players[player.id] = {
        ...player,
        clubId: deal.loanClubId,
        contractClubId: deal.parentClubId,
        onLoan: true,
        loanParentClubId: deal.parentClubId,
        loanEndWeek: deal.endWeek,
        loanEndSeason: deal.endSeason,
      };
      state.activeLoans.push({
        ...deal,
        status: "active",
        startCurrentAbility: deal.startCurrentAbility ?? player.currentAbility,
      });
      movement = eventFor("loanStart", intent, currentWeek, currentSeason,
        state.playerMovementHistory.length + applied.length, {
          fromClubId: deal.parentClubId,
          toClubId: deal.loanClubId,
          contractClubId: deal.parentClubId,
          fee: deal.loanFee,
          loanDealId: deal.id,
        });
    } else if (intent.type === "loanEnd") {
      const deal = state.activeLoans.find(
        (active) => active.id === intent.dealId && active.playerId === player.id,
      );
      if (!deal || !player.onLoan) {
        reject(rejected, intent, "loan is not active");
        continue;
      }
      const parent = state.clubs[deal.parentClubId];
      const loanClub = state.clubs[deal.loanClubId];
      if (!parent || !loanClub) {
        reject(rejected, intent, "loan clubs no longer exist");
        continue;
      }
      const releasedLoanContribution = weeklyPlayerObligationCommitment(
        loanClub,
        player.id,
        "loanWageContribution",
      );
      if (intent.resolution === "buyOption") {
        const fee = deal.buyOptionFee ?? 0;
        const buyingWage = defaultWage(player);
        const affordability = assessClubAffordability({
          club: loanClub,
          players: state.players,
          upfrontCost: fee,
          weeklyWageCommitment: buyingWage,
          releasedWeeklyCommitment: releasedLoanContribution,
        });
        if (!deal.buyOptionFee || !affordability.affordable) {
          reject(rejected, intent, "buy option is unavailable or unaffordable");
          continue;
        }
      }
      state.clubs = cleanClubMembership(state.clubs, player.id, clubMemberships);
      state.activeLoans = state.activeLoans.filter((active) => active.id !== deal.id);
      state.clubs[deal.loanClubId] = markPlayerObligations(
        state.clubs[deal.loanClubId],
        player.id,
        "expired",
        "loanWageContribution",
      ) ?? state.clubs[deal.loanClubId];

      if (intent.resolution === "buyOption") {
        const fee = deal.buyOptionFee ?? 0;
        const boughtWage = defaultWage(player);
        state.clubs[deal.parentClubId] = {
          ...state.clubs[deal.parentClubId],
          budget: state.clubs[deal.parentClubId].budget + fee,
        };
        state.clubs[deal.loanClubId] = {
          ...state.clubs[deal.loanClubId],
          budget: state.clubs[deal.loanClubId].budget - fee,
        };
        const boughtPlayer: Player = {
          ...clearLoanFields(player),
          clubId: deal.loanClubId,
          contractClubId: deal.loanClubId,
          contractExpiry: currentSeason + defaultContractLength(player),
          wage: boughtWage,
        };
        state.players[player.id] = boughtPlayer;
        state.clubs = registerAtClub(state.clubs, boughtPlayer, deal.loanClubId);
        state.loanHistory.push({
          ...deal,
          status: "completed",
          outcome: "buy-option-exercised",
        });
        movement = eventFor("loanBuyOption", intent, currentWeek, currentSeason,
          state.playerMovementHistory.length + applied.length, {
            fromClubId: deal.parentClubId,
            toClubId: deal.loanClubId,
            contractClubId: deal.loanClubId,
            fee,
            loanDealId: deal.id,
          });
      } else {
        const returnedPlayer: Player = {
          ...clearLoanFields(player),
          clubId: deal.parentClubId,
          contractClubId: deal.parentClubId,
        };
        state.players[player.id] = returnedPlayer;
        state.clubs = registerAtClub(state.clubs, returnedPlayer, deal.parentClubId);
        const recalled = intent.resolution === "recall";
        state.loanHistory.push({
          ...deal,
          status: recalled ? "recalled" : "completed",
          outcome: recalled ? "recalled-early" : (intent.outcome ?? "neutral"),
        });
        movement = eventFor(recalled ? "loanRecall" : "loanReturn", intent,
          currentWeek, currentSeason, state.playerMovementHistory.length + applied.length, {
            fromClubId: deal.loanClubId,
            toClubId: deal.parentClubId,
            contractClubId: deal.parentClubId,
            loanDealId: deal.id,
          });
      }
    }

    if (movement) {
      reserved.add(intent.playerId);
      applied.push(movement);
    }
  }

  // A higher-priority transition can invalidate a free-agent signing selected
  // earlier in the weekly tick (for example a last-minute renewal or transfer).
  // The pool is a derived availability index, so never retain an entry once
  // the authoritative player record owns a contract or registration.
  state.freeAgentPool = {
    ...state.freeAgentPool,
    agents: state.freeAgentPool.agents.filter((agent) => {
      const player = state.players[agent.playerId];
      return Boolean(player && !contractOwner(player) && !player.onLoan);
    }),
  };

  state.playerMovementHistory.push(...applied);
  return { state, applied, rejected };
}
