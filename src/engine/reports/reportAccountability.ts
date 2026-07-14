import type { Observation, ScoutReport } from "@/engine/core/types";

function compareReportDate(left: ScoutReport, right: ScoutReport): number {
  return left.submittedSeason - right.submittedSeason
    || left.submittedWeek - right.submittedWeek
    || (left.revision ?? 1) - (right.revision ?? 1)
    || left.id.localeCompare(right.id);
}

type ReportDate = Pick<ScoutReport, "submittedSeason" | "submittedWeek">;

function compareReportCalendarDate(left: ReportDate, right: ReportDate): number {
  return left.submittedSeason - right.submittedSeason
    || left.submittedWeek - right.submittedWeek;
}

function reportDateIsInRange(
  report: ReportDate,
  startInclusive: ReportDate,
  endInclusive: ReportDate,
): boolean {
  return compareReportCalendarDate(report, startInclusive) >= 0
    && compareReportCalendarDate(report, endInclusive) <= 0;
}

function observationIsAfterReport(
  observation: Observation,
  report: ScoutReport,
): boolean {
  return observation.season > report.submittedSeason
    || (
      observation.season === report.submittedSeason
      && observation.week > report.submittedWeek
    );
}

/** Stable identity for one scout's judgment of one player against one brief. */
export function getReportCaseKey(report: ScoutReport): string {
  return report.caseId
    ?? `${report.scoutId}:${report.playerId}:${report.briefId ?? "general"}`;
}

/** Return the most recent immutable revision within the requested report case. */
export function getLatestReportInScope(
  reports: Iterable<ScoutReport>,
  scoutId: string,
  playerId: string,
  briefId?: string,
): ScoutReport | undefined {
  return [...reports]
    .filter((report) =>
      report.scoutId === scoutId
      && report.playerId === playerId
      && report.briefId === briefId
    )
    .sort((left, right) => compareReportDate(right, left))[0];
}

/**
 * Evidence not already consumed by the active revision. New reports persist
 * exact IDs. Legacy reports fall back to their submission date, conservatively
 * treating all evidence available at that point as consumed.
 */
export function getFreshReportObservationIds(
  observations: Iterable<Observation>,
  previousReport?: ScoutReport,
): string[] {
  const ordered = [...observations]
    .filter((observation) =>
      observation.scoutId === (previousReport?.scoutId ?? observation.scoutId)
      && observation.playerId === (previousReport?.playerId ?? observation.playerId)
    )
    .sort((left, right) =>
      left.season - right.season
      || left.week - right.week
      || left.id.localeCompare(right.id)
    );
  if (!previousReport) return [...new Set(ordered.map((observation) => observation.id))];

  if (previousReport.evidenceObservationIds !== undefined) {
    const consumed = new Set(previousReport.evidenceObservationIds);
    return [...new Set(
      ordered
        .filter((observation) => !consumed.has(observation.id))
        .map((observation) => observation.id),
    )];
  }

  return [...new Set(
    ordered
      .filter((observation) => observationIsAfterReport(observation, previousReport))
      .map((observation) => observation.id),
  )];
}

/** Attach auditable evidence provenance and immutable revision metadata. */
export function attachReportEvidence(
  report: ScoutReport,
  observations: Iterable<Observation>,
  previousReport?: ScoutReport,
): ScoutReport {
  const evidenceObservationIds = [...new Set([...observations].map((observation) => observation.id))]
    .sort();
  const revision = report.revision
    ?? (previousReport ? (previousReport.revision ?? 1) + 1 : 1);
  const needsRevisionId = Boolean(previousReport && report.revision === undefined);

  return {
    ...report,
    id: needsRevisionId ? `${report.id}_r${revision}` : report.id,
    caseId: report.caseId ?? previousReport?.caseId,
    supersedesReportId: report.supersedesReportId ?? previousReport?.id,
    revision,
    evidenceObservationIds,
  };
}

/**
 * Collapse raw report revisions into their latest case-level judgment. Volume,
 * awards, and reviews must reward distinct scouting cases rather than edits.
 */
export function selectLatestReportsByCase(
  reports: Iterable<ScoutReport>,
): ScoutReport[] {
  const latest = new Map<string, ScoutReport>();
  for (const report of reports) {
    const key = getReportCaseKey(report);
    const current = latest.get(key);
    if (!current || compareReportDate(report, current) > 0) latest.set(key, report);
  }
  return [...latest.values()];
}

/**
 * Return the active judgment for cases that were first opened inside a date
 * window. A later revision of an older case is deliberately excluded: it is
 * improved work on an existing judgment, not a newly submitted case.
 */
export function selectLatestReportsByCaseOpenedInRange(
  reports: Iterable<ScoutReport>,
  startInclusive: ReportDate,
  endInclusive: ReportDate,
): ScoutReport[] {
  const allReports = [...reports];
  const openingByCase = new Map<string, ScoutReport>();
  for (const report of allReports) {
    const key = getReportCaseKey(report);
    const current = openingByCase.get(key);
    if (!current || compareReportDate(report, current) < 0) {
      openingByCase.set(key, report);
    }
  }

  return selectLatestReportsByCase(allReports).filter((report) => {
    const opening = openingByCase.get(getReportCaseKey(report));
    return Boolean(
      opening && reportDateIsInRange(opening, startInclusive, endInclusive),
    );
  });
}

export interface ReportRevisionCase {
  caseKey: string;
  revisions: ScoutReport[];
  latestReport: ScoutReport;
  /** A prior season-end pass has already applied this case's accuracy reward. */
  wasPreviouslyValidated: boolean;
}

/** Group immutable artifacts without treating each edit as a new judgment. */
export function groupReportRevisionsByCase(
  reports: Iterable<ScoutReport>,
): ReportRevisionCase[] {
  const grouped = new Map<string, ScoutReport[]>();
  for (const report of reports) {
    const key = getReportCaseKey(report);
    const revisions = grouped.get(key) ?? [];
    revisions.push(report);
    grouped.set(key, revisions);
  }

  return [...grouped.entries()]
    .map(([caseKey, revisions]) => {
      const ordered = revisions.sort(compareReportDate);
      return {
        caseKey,
        revisions: ordered,
        latestReport: ordered[ordered.length - 1],
        wasPreviouslyValidated: ordered.some(
          (report) => report.postTransferRating !== undefined,
        ),
      };
    })
    .sort((left, right) => left.caseKey.localeCompare(right.caseKey));
}
