import { ALL_ATTRIBUTES, ALL_POSITIONS } from "@/engine/core/types";
import type { FinancialRecord, GameState, Player } from "@/engine/core/types";
import { getSeasonBirthYear } from "@/engine/core/seasonDate";

export const GAME_SYSTEMS_CHECKPOINTS = [1, 5, 10, 20, 30] as const;

export function summarizeNumbers(values: readonly number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (fraction: number) => sorted.length
    ? sorted[Math.floor((sorted.length - 1) * fraction)] : null;
  return {
    count: values.length, finiteCount: sorted.length, invalidCount: values.length - sorted.length,
    min: percentile(0), p10: percentile(0.1), median: percentile(0.5), p90: percentile(0.9), max: percentile(1),
    mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
  };
}

function counts(values: readonly string[]): Record<string, number> {
  const result = Object.create(null) as Record<string, number>;
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

type Transaction = FinancialRecord["transactions"][number];

function cashFlow(transactions: readonly Transaction[]) {
  const finite = transactions.filter((entry) => Number.isFinite(entry.amount));
  const inflows = finite.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0);
  const outflows = finite.reduce((sum, entry) => sum + Math.max(0, -entry.amount), 0);
  return { count: transactions.length, invalidAmounts: transactions.length - finite.length,
    inflows, outflows, net: inflows - outflows };
}

function cashFlowByCategory(transactions: readonly Transaction[]) {
  return Object.fromEntries(Object.keys(counts(transactions.map((entry) => entry.category ?? "unclassified")))
    .map((category) => [category, cashFlow(transactions.filter((entry) => (entry.category ?? "unclassified") === category))]));
}

function marketplaceReceipts(transactions: readonly Transaction[], listings: FinancialRecord["reportListings"]) {
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  const receipts = transactions.filter((entry) => entry.amount > 0 && entry.kind !== "openingBalance"
    && entry.referenceId?.startsWith("marketplace:"));
  const reports = new Set<string>();
  const buyers = new Set<string>();
  const pairs = new Set<string>();
  let unlinkedListingReceipts = 0;
  for (const receipt of receipts) {
    const match = /^marketplace:(.+):buyer:(.+)$/.exec(receipt.referenceId!);
    const reportId = match ? listingById.get(match[1])?.reportId : undefined;
    const buyerId = receipt.counterpartyId ?? match?.[2];
    if (reportId) reports.add(reportId);
    else unlinkedListingReceipts += 1;
    if (buyerId) buyers.add(buyerId);
    if (reportId && buyerId) pairs.add(JSON.stringify([reportId, buyerId]));
  }
  const uniqueReceipts = new Set(receipts.map((entry) => entry.referenceId)).size;
  return {
    receiptCount: receipts.length, uniqueReceipts, duplicateReceiptCount: receipts.length - uniqueReceipts,
    cashReceived: cashFlow(receipts).inflows, uniqueLinkedReportVersions: reports.size,
    uniqueBuyerClubs: buyers.size, uniqueLinkedReportBuyerPairs: pairs.size, unlinkedListingReceipts,
  };
}

function population(players: readonly Player[], state: GameState) {
  const numeric = (select: (player: Player) => number) => summarizeNumbers(players.map(select));
  const ratingBand = (value: number) => !Number.isFinite(value) ? "invalid"
    : value < 1 || value > 200 ? "out-of-range"
      : `${Math.floor((value - 1) / 20) * 20 + 1}-${Math.floor((value - 1) / 20) * 20 + 20}`;
  return {
    count: players.length,
    age: numeric((player) => player.age),
    currentAbility: numeric((player) => player.currentAbility),
    potentialAbility: numeric((player) => player.potentialAbility),
    remainingCapacity: numeric((player) => player.potentialAbility - player.currentAbility),
    abovePotentialCount: players.filter((player) => player.currentAbility > player.potentialAbility).length,
    // Above-PA legacy players are reported rather than invalidated or snapped down.
    byAge: counts(players.map((player) => String(player.age))),
    byAbilityBand: counts(players.map((player) => ratingBand(player.currentAbility))),
    byPotentialBand: counts(players.map((player) => ratingBand(player.potentialAbility))),
    byPosition: counts(players.map((player) => player.position)),
    byNationality: counts(players.map((player) => player.nationality || "(missing)")),
    byLeague: counts(players.map((player) => player.clubId
      ? state.clubs[player.clubId]?.leagueId ?? "(missing-club)" : "(unattached)")),
    byDevelopmentProfile: counts(players.map((player) => player.developmentProfile)),
    attributes: Object.fromEntries(ALL_ATTRIBUTES.map((attribute) => [
      attribute, numeric((player) => player.attributes[attribute]),
    ])),
    marketValue: numeric((player) => player.marketValue),
    weeklyWage: numeric((player) => player.wage),
    injuredCount: players.filter((player) => player.injured).length,
  };
}

export interface GameSystemsViolation {
  code: string;
  entityId: string;
  detail: string;
}

/** Pure snapshot of real game records; distributions deliberately have no balance gates. */
export function collectGameSystemsHealth(state: GameState, completedSeasons: number) {
  const active = Object.values(state.players);
  const unsigned = Object.values(state.unsignedYouth ?? {}).filter((youth) => !youth.placed && !youth.retired);
  const retired = Object.values(state.retiredPlayers ?? {});
  const retiredIds = new Set(state.retiredPlayerIds ?? []);
  const violations: GameSystemsViolation[] = [];
  const violationsByCode: Record<string, number> = {};
  let violationCount = 0;
  const fail = (code: string, entityId: string, detail: string) => {
    violationCount += 1;
    violationsByCode[code] = (violationsByCode[code] ?? 0) + 1;
    if (violations.length < 100) violations.push({ code, entityId, detail });
  };
  const validDate = Number.isInteger(state.currentSeason) && state.currentSeason > 0;
  if (!validDate) fail("season", "world", String(state.currentSeason));
  const identityOwners = new Map<string, string>();
  const inspectPlayer = (player: Player, owner: string, living: boolean) => {
    if (identityOwners.has(player.id)) fail("duplicate-player-identity", player.id, `${identityOwners.get(player.id)};${owner}`);
    identityOwners.set(player.id, owner);
    if (!Number.isInteger(player.age) || player.age < 0) fail("age", player.id, String(player.age));
    else if (living && validDate && player.dateOfBirth?.year !== getSeasonBirthYear(player.age, state.currentSeason)) {
      fail("birthday-year", player.id, `age=${player.age};birthYear=${player.dateOfBirth?.year};season=${state.currentSeason}`);
    }
    for (const [name, value] of [["ability", player.currentAbility], ["potential", player.potentialAbility]] as const) {
      if (!Number.isFinite(value) || value < 1 || value > 200) fail(name, player.id, String(value));
    }
    for (const attribute of ALL_ATTRIBUTES) {
      const value = player.attributes[attribute];
      if (!Number.isFinite(value) || value < 1 || value > 20) fail("attribute", player.id, `${attribute}=${value}`);
    }
    if (!ALL_POSITIONS.includes(player.position)) fail("position", player.id, String(player.position));
    if (!player.nationality?.trim()) fail("nationality", player.id, "missing nationality");
    if (living) {
      if (retiredIds.has(player.id)) fail("retired-active", player.id, owner);
      const contractClubId = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
      if (!Number.isInteger(player.contractExpiry) || player.contractExpiry < 0) fail("contract-date", player.id, String(player.contractExpiry));
      if (contractClubId && !state.clubs[contractClubId]) fail("contract-club", player.id, contractClubId);
      if (contractClubId && validDate && player.contractExpiry < state.currentSeason) {
        fail("expired-owned-contract", player.id, `${player.contractExpiry}<${state.currentSeason}`);
      }
      if (player.clubId && !state.clubs[player.clubId]) fail("registration-club", player.id, player.clubId);
    }
  };
  for (const [id, player] of Object.entries(state.players)) {
    if (id !== player.id) fail("player-key", id, player.id);
    inspectPlayer(player, "active", true);
  }
  for (const youth of unsigned) inspectPlayer(youth.player, `unsigned:${youth.id}`, true);
  for (const player of retired) inspectPlayer(player, "retired-archive", false);
  for (const id of retiredIds) {
    if (!state.retiredPlayers?.[id]) fail("retirement-archive", id, "missing retained archive");
  }

  const memberships = new Map<string, string>();
  const clubs = Object.values(state.clubs);
  for (const club of clubs) {
    if (!state.leagues[club.leagueId]) fail("club-league", club.id, club.leagueId);
    for (const id of [...club.playerIds, ...(club.academyPlayerIds ?? [])]) {
      if (memberships.has(id)) fail("duplicate-roster", id, `${memberships.get(id)};${club.id}`);
      memberships.set(id, club.id);
      if (!state.players[id]) fail("roster-player", club.id, id);
      else if (state.players[id].clubId !== club.id) fail("roster-registration", id, club.id);
    }
  }
  for (const player of active) {
    if (player.clubId && !memberships.has(player.id)) fail("missing-roster-membership", player.id, player.clubId);
  }
  const loanPlayers = new Set<string>();
  for (const loan of state.activeLoans ?? []) {
    if (loanPlayers.has(loan.playerId)) fail("duplicate-loan", loan.playerId, loan.id);
    loanPlayers.add(loan.playerId);
    if (!state.players[loan.playerId] || !state.clubs[loan.parentClubId] || !state.clubs[loan.loanClubId]) {
      fail("loan-reference", loan.id, loan.playerId);
    }
  }
  const movements = state.playerMovementHistory ?? [];
  const retirementDates = new Map<string, { season: number; week: number }>();
  for (const movement of movements) {
    if (movement.type !== "retirement" && movement.type !== "footballExit") continue;
    if (!Number.isInteger(movement.season) || movement.season < 1
      || !Number.isInteger(movement.week) || movement.week < 1) continue;
    const previous = retirementDates.get(movement.playerId);
    if (!previous || movement.season > previous.season
      || (movement.season === previous.season && movement.week > previous.week)) {
      retirementDates.set(movement.playerId, { season: movement.season, week: movement.week });
    }
  }
  for (const [fixtureId, ratings] of Object.entries(state.matchRatings ?? {})) {
    const fixture = state.fixtures[fixtureId];
    if (!fixture || fixture.season !== state.currentSeason
      || !Number.isInteger(fixture.week) || fixture.week < 1) continue;
    for (const rating of Object.values(ratings)) {
      const retirement = retirementDates.get(rating.playerId);
      // Retirement can happen after appearances earlier in the same season.
      // Weekly dates cannot establish order within a week; absent retained
      // movement evidence also cannot establish a violation.
      const playedAfterRetirement = retirement && (fixture.season > retirement.season
        || (fixture.season === retirement.season && fixture.week > retirement.week));
      if ((rating.minutesPlayed ?? 0) > 0 && retiredIds.has(rating.playerId) && playedAfterRetirement) {
        fail("retired-participation", rating.playerId, fixtureId);
      }
    }
  }

  const completedSeason = state.currentSeason - 1;
  const seasonMovements = movements.filter((movement) => movement.season === completedSeason);
  const transfers = state.transferRecords ?? [];
  const transactions = state.finances?.transactions ?? [];
  const seasonTransactions = transactions.filter((entry) => entry.season === completedSeason && entry.kind !== "openingBalance");
  const throughSnapshot = transactions.filter((entry) => entry.season < state.currentSeason
    || (entry.season === state.currentSeason && entry.week <= state.currentWeek));
  const retainedCashMovements = transactions.filter((entry) => entry.kind !== "openingBalance");
  const currentSeasonTransactions = throughSnapshot.filter((entry) => entry.season === state.currentSeason && entry.kind !== "openingBalance");
  const ledger = cashFlow(throughSnapshot);
  const ledgerBalance = state.finances && ledger.invalidAmounts === 0 ? ledger.net : null;
  const listings = state.finances?.reportListings ?? [];
  const placementReports = Object.values(state.placementReports ?? {})
    .filter((report) => state.scout?.id && report.scoutId === state.scout.id);
  const ownPlacementIds = new Set(placementReports.map((report) => report.id));
  const alumni = state.alumniRecords ?? [];
  const linkedAlumni = alumni.filter((record) =>
    (record.placementReportId && ownPlacementIds.has(record.placementReportId))
    || (record.originatingReportId && state.scout?.id
      && state.reports?.[record.originatingReportId]?.scoutId === state.scout.id));
  const placedDiscoveries = (state.discoveryRecords ?? []).filter((record) => record.placementClubId);
  const placementFees = state.finances?.placementFeeRecords ?? [];
  const decisionReviews = Object.values(state.recommendationReviews ?? {})
    .filter((review) => review.origin === "decision" && review.status === "complete");
  const payroll = new Map<string, number>();
  for (const player of active) {
    const owner = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
    if (owner) payroll.set(owner, (payroll.get(owner) ?? 0) + Math.max(0, player.wage));
  }
  const clubDepth = clubs.map((club) => {
    const registered = [...new Set([...club.playerIds, ...(club.academyPlayerIds ?? []), ...(club.loanedInPlayerIds ?? [])])]
      .map((id) => state.players[id]).filter((player): player is Player => !!player && player.clubId === club.id);
    const available = registered.filter((player) => !player.injured
      && (state.disciplinaryRecords?.[player.id]?.suspensionWeeksRemaining ?? 0) <= 0);
    return { clubId: club.id, leagueId: club.leagueId, reputation: club.reputation,
      seniorCount: club.playerIds.length, academyCount: club.academyPlayerIds?.length ?? 0,
      registeredCount: registered.length, availableCount: available.length,
      availableKeepers: available.filter((player) => player.position === "GK").length,
      budget: club.budget, weeklyWageBudget: club.weeklyWageBudget ?? null, weeklyPayroll: payroll.get(club.id) ?? 0 };
  });
  return {
    schemaVersion: 1 as const,
    completedSeasons,
    gameDate: { season: state.currentSeason, week: state.currentWeek },
    persistence: "mocked canonical soak; this snapshot does not prove provider save durability",
    populations: {
      activeWorld: population(active, state),
      availableUnsignedYouth: population(unsigned.map((youth) => youth.player), state),
      retainedRetiredArchive: population(retired, state),
    },
    rosters: {
      clubs: clubs.length,
      seniorSizes: summarizeNumbers(clubs.map((club) => club.playerIds.length)),
      academySizes: summarizeNumbers(clubs.map((club) => club.academyPlayerIds?.length ?? 0)),
      clubsWithFewerThanElevenSeniors: clubs.filter((club) => club.playerIds.length < 11).length,
      registeredSizes: summarizeNumbers(clubDepth.map((club) => club.registeredCount)),
      availableSizes: summarizeNumbers(clubDepth.map((club) => club.availableCount)),
      clubsWithFewerThanElevenRegistered: clubDepth.filter((club) => club.registeredCount < 11).length,
      clubsWithFewerThanElevenAvailable: clubDepth.filter((club) => club.availableCount < 11).length,
      clubsWithoutAvailableKeeper: clubDepth.filter((club) => club.availableKeepers === 0).length,
      clubDepth,
      freeAgents: state.freeAgentPool?.agents.length ?? 0,
      activeLoans: state.activeLoans?.length ?? 0,
    },
    movements: {
      provenance: "retained authoritative movement ledger; archive counts are not lifetime retirement totals",
      retainedByType: counts(movements.map((movement) => movement.type)),
      completedSeasonByType: counts(seasonMovements.map((movement) => movement.type)),
      completedSeasonFees: summarizeNumbers(seasonMovements.flatMap((movement) => movement.fee === undefined ? [] : [movement.fee])),
    },
    scoutingCareer: {
      retainedReports: Object.keys(state.reports ?? {}).length,
      filedPasses: Object.values(state.reports ?? {}).filter((report) => report.recommendedAction === "pass").length,
      completedDecisionReviews: decisionReviews.length,
      decisionOutcomes: counts(decisionReviews.map((review) => review.decisionOutcome ?? "unresolved")),
      passedThenProgressed: decisionReviews.filter((review) => review.decisionKind === "pass" && review.decisionOutcome === "progressed").length,
      retainedObservations: Object.keys(state.observations ?? {}).length,
      careerTier: state.scout?.careerTier ?? null,
      reputation: state.scout?.reputation ?? null,
      transferAccountabilityRecords: transfers.length,
      transferRecordProvenance: "state.transferRecords uses the first-team accountability schema; report links alone do not prove causation and this is not a youth-placement count",
      // Compatibility alias for existing artifacts; use the explicitly named metric above.
      recommendationTransfers: transfers.length,
      outcomes: counts(transfers.map((transfer) => transfer.outcome ?? "pending")),
      outcomeEvidence: counts(transfers.map((transfer) => transfer.outcomeEvidenceLevel ?? "unclassified")),
      accountableTransfers: transfers.filter((transfer) => transfer.accountabilityApplied).length,
      recordedTransferFees: summarizeNumbers(transfers.map((transfer) => transfer.fee)),
      youthPlacements: {
        provenance: "Own placement pitches, career alumni and discovery metadata are separate records; world youthSigning movements are not attributed to the scout",
        retainedOwnPlacementReports: placementReports.length,
        ownReportsSubmittedCompletedSeason: placementReports.filter((report) => report.season === completedSeason).length,
        ownReportResponses: counts(placementReports.map((report) => report.clubResponse ?? "unclassified")),
        ownReportPlacementTypes: counts(placementReports.map((report) => report.placementType ?? "unclassified")),
        acceptedOwnYouthCount: new Set(placementReports.filter((report) => report.clubResponse === "accepted")
          .map((report) => report.unsignedYouthId)).size,
        retainedAlumni: alumni.length,
        alumniPlacedCompletedSeason: alumni.filter((record) => record.placedSeason === completedSeason).length,
        alumniByCurrentStatus: counts(alumni.map((record) => record.currentStatus ?? "unclassified")),
        alumniWithOwnAuthoredReportLink: linkedAlumni.length,
        alumniWithoutOwnAuthoredReportLink: alumni.length - linkedAlumni.length,
        discoveredPlayersWithPlacement: placedDiscoveries.length,
        discoveryPlacementOutcomes: counts(placedDiscoveries.map((record) => record.careerOutcome ?? "unresolved")),
      },
    },
    finance: {
      careerBalance: state.finances?.balance ?? null,
      clubBudgets: summarizeNumbers(clubs.map((club) => club.budget)),
      clubWeeklyWageBudgets: summarizeNumbers(clubs.flatMap((club) => club.weeklyWageBudget === undefined ? [] : [club.weeklyWageBudget])),
      retainedTransactions: transactions.length,
      cashFlowProvenance: "Positive cash flows include financing; they are not earned revenue. All sums describe retained transactions, not inferred lifetime totals",
      completedSeasonIncome: seasonTransactions.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0),
      completedSeasonExpenses: seasonTransactions.reduce((sum, entry) => sum + Math.max(0, -entry.amount), 0),
      completedSeasonTransactionCategories: counts(seasonTransactions.map((entry) => entry.category ?? "unclassified")),
      retainedCashFlowByCategory: cashFlowByCategory(retainedCashMovements),
      completedSeasonCashFlowByCategory: cashFlowByCategory(seasonTransactions),
      currentSeasonThroughSnapshotCashFlow: cashFlow(currentSeasonTransactions),
      currentSeasonThroughSnapshotCashFlowByCategory: cashFlowByCategory(currentSeasonTransactions),
      cashReconciliation: {
        provenance: "Retained ledger through the snapshot date, including opening principal; a difference is reported without inventing missing history",
        openingPrincipal: cashFlow(throughSnapshot.filter((entry) => entry.kind === "openingBalance")).net,
        priorSeasonsNetCash: cashFlow(throughSnapshot.filter((entry) => entry.season < state.currentSeason && entry.kind !== "openingBalance")).net,
        currentSeasonNetCash: cashFlow(currentSeasonTransactions).net,
        ledgerBalanceThroughSnapshot: ledgerBalance,
        balanceDifference: ledgerBalance !== null && Number.isFinite(state.finances?.balance)
          ? state.finances!.balance - ledgerBalance : null,
        transactionsOutsideSnapshotDate: transactions.length - throughSnapshot.length,
        invalidAmounts: ledger.invalidAmounts,
      },
      marketplaceSales: {
        provenance: "Positive marketplace payment receipts; linked report counts require a retained listing. Accepted bid records are distinct from receipts and driver attempts",
        retained: marketplaceReceipts(transactions, listings),
        completedSeason: marketplaceReceipts(seasonTransactions, listings),
        retainedAcceptedBidRecords: listings.reduce((sum, listing) => sum + listing.bids.filter((bid) => bid.status === "accepted").length, 0),
        retainedAcceptedExclusiveUpgradeBidRecords: listings.reduce((sum, listing) => sum
          + listing.bids.filter((bid) => bid.status === "accepted" && bid.isExclusiveUpgrade).length, 0),
      },
      placementFees: {
        provenance: "Retained PlacementFeeRecord amounts; these are separate from transfer fees and are not automatically attributed to youth placements",
        retainedRecords: placementFees.length,
        retainedEarnedFees: summarizeNumbers(placementFees.map((fee) => fee.earnedFee)),
        retainedEarnedFeeTotal: placementFees.reduce((sum, fee) => sum + fee.earnedFee, 0),
        completedSeasonEarnedFeeTotal: placementFees.filter((fee) => fee.season === completedSeason)
          .reduce((sum, fee) => sum + fee.earnedFee, 0),
      },
    },
    invariants: { violationCount, violationsByCode, samples: violations, samplesTruncated: violationCount > violations.length },
  };
}

export type GameSystemsHealthSnapshot = ReturnType<typeof collectGameSystemsHealth>;
