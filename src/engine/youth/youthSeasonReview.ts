import type { GameState } from "@/engine/core/types";
import { deriveYouthFileMoney } from "./youthDeskStakes";
import { listYouthCases } from "./youthCaseList";

export interface YouthSeasonCaseLine {
  playerId: string;
  name: string;
  line: string;
}

export interface YouthSeasonCaseReview {
  season: number;
  headline: string;
  caseLines: YouthSeasonCaseLine[];
  rivalLine: string;
  alumniLine: string;
  moneyLine: string;
}

function sanitizeAlumniDescription(text: string): string {
  if (/potential of|current ability/i.test(text)) {
    return "has been labelled a wonderkid.";
  }
  return text;
}

function playerName(state: Pick<GameState, "unsignedYouth" | "players">, playerId: string): string {
  const youth = Object.values(state.unsignedYouth ?? {}).find((entry) => entry.player.id === playerId);
  if (youth) return `${youth.player.firstName} ${youth.player.lastName}`;
  const player = state.players?.[playerId];
  if (player) return `${player.firstName} ${player.lastName}`;
  return "A prospect";
}

export function deriveYouthSeasonCaseReview(
  state: Pick<
    GameState,
    | "scout"
    | "openingCase"
    | "unsignedYouth"
    | "observations"
    | "reports"
    | "placementReports"
    | "alumniRecords"
    | "discoveryRecords"
    | "reflectionJournal"
    | "rivalActivities"
    | "currentWeek"
    | "currentSeason"
    | "players"
    | "finances"
  >,
  season: number,
): YouthSeasonCaseReview {
  const cases = listYouthCases(state);
  const namedThisSeason = new Set(
    Object.values(state.observations ?? {})
      .filter((observation) => observation.season === season && observation.scoutId === state.scout.id)
      .map((observation) => observation.playerId),
  );
  for (const report of Object.values(state.reports ?? {})) {
    if (report.submittedSeason === season && report.scoutId === state.scout.id) {
      namedThisSeason.add(report.playerId);
    }
  }
  // Placing a prospect removes them from unsignedYouth. The seasonal record
  // must retain successful work even when the working case list becomes empty.
  const alumniByPlayer = new Map((state.alumniRecords ?? []).map((record) => [record.playerId, record]));
  for (const record of alumniByPlayer.values()) {
    if (record.placedSeason === season) namedThisSeason.add(record.playerId);
  }
  const casesByPlayer = new Map(cases.map((item) => [item.playerId, item]));
  const caseLines = [...namedThisSeason]
    .map((playerId) => {
      const name = playerName(state, playerId);
      const alumni = alumniByPlayer.get(playerId);
      const openCase = casesByPlayer.get(playerId);
      const outcome = alumni?.placedSeason === season
        ? `Placed with an academy in Week ${alumni.placedWeek}.`
        : openCase && state.currentSeason === season
          ? `${openCase.openQuestion} ${openCase.rivalHeat !== "quiet" ? `(${openCase.rivalHeatLabel})` : ""}`.trim()
          : "Built a scouting record this season.";
      return { playerId, name, line: `${name}: ${outcome}` };
    })
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 6);

  const heatCounts = cases.reduce(
    (counts, item) => {
      counts[item.rivalHeat] += 1;
      return counts;
    },
    { quiet: 0, watching: 0, contested: 0, imminent: 0 },
  );
  const rivalLine = heatCounts.imminent > 0
    ? `${heatCounts.imminent} case${heatCounts.imminent === 1 ? "" : "s"} look close to a rival claim.`
    : heatCounts.contested > 0
      ? `${heatCounts.contested} case${heatCounts.contested === 1 ? "" : "s"} are contested.`
      : heatCounts.watching > 0
        ? `Rivals are watching ${heatCounts.watching} of your names.`
        : "No rival heat on your open cases.";

  const alumniThisSeason = (state.alumniRecords ?? []).flatMap((record) => {
    const hits = [
      ...record.milestones.filter((milestone) => milestone.season === season),
      ...record.careerUpdates.filter((update) => update.season === season),
    ];
    if (hits.length === 0) return [];
    const latest = [...hits].sort((left, right) => left.week - right.week).at(-1);
    if (!latest) return [];
    return [`${playerName(state, record.playerId)} — ${sanitizeAlumniDescription(latest.description)}`];
  });
  const alumniLine = alumniThisSeason.length > 0
    ? alumniThisSeason.slice(0, 4).join(" ")
    : "None of your alumni moved the story this season.";

  const money = deriveYouthFileMoney(state);
  const moneyLine = `Career totals: ${money.label}`;

  const headline = namedThisSeason.size > 0
    ? `Season ${season} lived on ${namedThisSeason.size} name${namedThisSeason.size === 1 ? "" : "s"}.`
    : `Season ${season} did not leave a named case.`;

  return {
    season,
    headline,
    caseLines,
    rivalLine,
    alumniLine,
    moneyLine,
  };
}

export function formatYouthSeasonReviewBody(review: YouthSeasonCaseReview): string {
  const names = review.caseLines.length > 0
    ? review.caseLines.map((line) => line.line).join("\n")
    : "No named cases this season.";
  return [
    review.headline,
    names,
    review.rivalLine,
    review.alumniLine,
    `This file: ${review.moneyLine}`,
  ].join("\n\n");
}
