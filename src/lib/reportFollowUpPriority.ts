import type { GameState, ScoutReport, ScoutingCase } from "@/engine/core/types";

export function compareReportRecency(a: ScoutReport, b: ScoutReport): number {
  return b.submittedSeason - a.submittedSeason || b.submittedWeek - a.submittedWeek
    || (b.revision ?? 0) - (a.revision ?? 0) || a.id.localeCompare(b.id);
}

/** Select next actions, without deleting older cases or merging separate club obligations. */
export function selectReportFollowUpCases(state: GameState, cases: ScoutingCase[]): ScoutingCase[] {
  const distributed = new Set([
    ...(state.finances?.reportListings ?? []).map((listing) => listing.reportId),
    ...Object.values(state.reportDeliveries ?? {}).map((delivery) => delivery.reportId),
  ]);
  const rows = cases.flatMap((item) => {
    const id = item.activeReportId ?? item.reportIds.at(-1);
    const report = id ? state.reports[id] : undefined;
    return report ? [{ item, report, privateMonitoring: state.scout.careerPath === "independent"
      && report.recommendedAction === "monitor" && !distributed.has(report.id) }] : [];
  }).sort((a, b) => compareReportRecency(a.report, b.report));
  const seen = new Set<string>();
  return rows.filter(({ item, report, privateMonitoring }) => {
    if (!privateMonitoring) return true;
    const key = `${report.scoutId}:${item.playerId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(({ item }) => item);
}
