import type {
  AlumniRecord,
  AlumniStatus,
  GameState,
  Player,
  UnsignedYouth,
} from "@/engine/core/types";

export interface YouthDeskAlumniItem {
  playerId: string;
  name: string;
  statusLabel: string;
  lastLine: string;
}

export interface YouthFileMoney {
  listed: number;
  paid: number;
  stillOut: number;
  label: string;
}

export interface YouthDeskStakes {
  alumni: YouthDeskAlumniItem[];
  fileMoney: YouthFileMoney;
  reputationLine: string;
}

const STATUS_LABEL: Record<AlumniStatus, string> = {
  academy: "Academy",
  firstTeam: "First team",
  loaned: "On loan",
  released: "Released",
  retired: "Retired",
  transferred: "Moved on",
};

function playerName(
  playerId: string,
  unsignedYouth: Record<string, UnsignedYouth>,
  players: Record<string, Player> | undefined,
): string {
  const youth = Object.values(unsignedYouth).find((entry) => entry.player.id === playerId);
  if (youth) return `${youth.player.firstName} ${youth.player.lastName}`;
  const player = players?.[playerId];
  if (player) return `${player.firstName} ${player.lastName}`;
  return "A former prospect";
}

function sanitizeAlumniLine(text: string): string {
  if (/potential of|current ability/i.test(text)) {
    return "Has been labelled a wonderkid.";
  }
  return text;
}

function latestAlumniLine(record: AlumniRecord): string {
  const update = [...record.careerUpdates].sort(
    (left, right) => right.season - left.season || right.week - left.week,
  )[0];
  if (update?.description) return sanitizeAlumniLine(update.description);
  const milestone = [...record.milestones].sort(
    (left, right) => right.season - left.season || right.week - left.week,
  )[0];
  if (milestone?.description) return sanitizeAlumniLine(milestone.description);
  return `Placed S${record.placedSeason} W${record.placedWeek}`;
}

export function listYouthDeskAlumni(
  state: Pick<GameState, "alumniRecords" | "unsignedYouth" | "players">,
  limit = 4,
): YouthDeskAlumniItem[] {
  return [...(state.alumniRecords ?? [])]
    .sort((left, right) =>
      right.placedSeason - left.placedSeason || right.placedWeek - left.placedWeek,
    )
    .slice(0, limit)
    .map((record) => ({
      playerId: record.playerId,
      name: playerName(record.playerId, state.unsignedYouth ?? {}, state.players),
      statusLabel: STATUS_LABEL[record.currentStatus] ?? record.currentStatus,
      lastLine: latestAlumniLine(record),
    }));
}

export function deriveYouthFileMoney(
  state: Pick<GameState, "finances" | "placementReports" | "scout">,
): YouthFileMoney {
  const listings = state.finances?.reportListings ?? [];
  const fees = state.finances?.placementFeeRecords ?? [];
  const listed = listings
    .filter((listing) => listing.status === "active")
    .reduce((sum, listing) => sum + listing.price, 0);
  // Settlement totals include negotiated prices, nonexclusive buyers and
  // completed listings that are no longer active. Asking prices are not cash.
  const paid = (state.finances?.reportSalesRevenue ?? 0)
    + (state.finances?.placementFeeRevenue
      ?? fees.reduce((sum, record) => sum + record.earnedFee, 0));
  const stillOut = Object.values(state.placementReports ?? {})
    .filter((report) =>
      report.scoutId === state.scout.id
      && (!report.clubResponse || report.clubResponse === "pending" || report.clubResponse === "trial"),
    ).length;
  const parts = [
    `Listed ${formatPounds(listed)}`,
    `Paid ${formatPounds(paid)}`,
    stillOut > 0 ? `${stillOut} still out` : "Nothing still out",
  ];
  return {
    listed,
    paid,
    stillOut,
    label: parts.join(" · "),
  };
}

function formatPounds(amount: number): string {
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}k`;
  return `£${Math.round(amount)}`;
}

export function deriveYouthReputationLine(
  state: Pick<GameState, "alumniRecords" | "scout" | "placementReports">,
): string {
  const debuts = (state.alumniRecords ?? []).filter((record) =>
    record.milestones.some((milestone) => milestone.type === "firstTeamDebut")
    || record.careerUpdates.some((update) => update.type === "debut"),
  ).length;
  const placed = Object.values(state.placementReports ?? {}).filter(
    (report) => report.scoutId === state.scout.id && report.clubResponse === "accepted",
  ).length;
  if (debuts > 0) {
    return `${debuts} of your names have debuted. Clubs still weigh that record.`;
  }
  if (placed > 0) {
    return `${placed} placement${placed === 1 ? "" : "s"} carry your name. The debut is still ahead.`;
  }
  return `Reputation ${Math.round(state.scout.reputation)}/100 — still built from the files you stand behind.`;
}

export function buildYouthDeskStakes(
  state: Pick<
    GameState,
    | "alumniRecords"
    | "unsignedYouth"
    | "players"
    | "finances"
    | "placementReports"
    | "scout"
  >,
): YouthDeskStakes {
  return {
    alumni: listYouthDeskAlumni(state),
    fileMoney: deriveYouthFileMoney(state),
    reputationLine: deriveYouthReputationLine(state),
  };
}

export function shouldShowYouthDeskStakes(stakes: YouthDeskStakes): boolean {
  return stakes.alumni.length > 0
    || stakes.fileMoney.listed > 0
    || stakes.fileMoney.paid > 0
    || stakes.fileMoney.stillOut > 0;
}
