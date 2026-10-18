"use client";

import { resolvePlayerDisplayName, resolvePlayerEntity } from "@/lib/playerResolution";

import { useState } from "react";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { PlayerAgeTimeline, selectPlayerAgeTimeline } from "./PlayerAgeTimeline";
import { PlayerAvatar } from "./PlayerAvatar";
import type { DiscoveryRecord, ScoutReport, TransferRecord } from "@/engine/core/types";
import {
  OUTCOME_COLORS,
  OUTCOME_REASON_COLORS,
  OUTCOME_REASON_SHORT_LABELS,
} from "@/engine/firstTeam";

type SortOption = "recent" | "accuracy" | "outcomes";

const SORT_LABELS: Record<SortOption, string> = {
  recent: "Most Recent",
  accuracy: "Validated Accuracy",
  outcomes: "Best Career Outcome",
};

const CAREER_OUTCOME_LABELS: Record<
  NonNullable<DiscoveryRecord["careerOutcome"]>,
  string
> = {
  starPlayer: "Established star",
  squadPlayer: "First-team player",
  released: "Released",
  retired: "Retired",
};

function accuracyColor(accuracy: number): string {
  if (accuracy >= 70) return "text-emerald-400";
  if (accuracy >= 40) return "text-amber-400";
  return "text-red-400";
}

function accuracyBg(accuracy: number): string {
  if (accuracy >= 70) return "bg-emerald-500";
  if (accuracy >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function sortDiscoveries(
  records: DiscoveryRecord[],
  sort: SortOption,
  accuracyByPlayerId: Map<string, number>,
): DiscoveryRecord[] {
  const copy = [...records];
  switch (sort) {
    case "recent":
      return copy.sort(
        (a, b) =>
          b.discoveredSeason - a.discoveredSeason ||
          b.discoveredWeek - a.discoveredWeek,
      );
    case "accuracy":
      return copy.sort(
        (a, b) =>
          (accuracyByPlayerId.get(b.playerId) ?? -1) -
          (accuracyByPlayerId.get(a.playerId) ?? -1),
      );
    case "outcomes": {
      const outcomeRank: Record<string, number> = {
        starPlayer: 4,
        squadPlayer: 3,
        retired: 2,
        released: 1,
      };
      return copy.sort((a, b) => {
        const rankDelta =
          (outcomeRank[b.careerOutcome ?? ""] ?? 0) -
          (outcomeRank[a.careerOutcome ?? ""] ?? 0);
        if (rankDelta !== 0) return rankDelta;
        return b.discoveredSeason - a.discoveredSeason;
      });
    }
  }
}

function formatStarRead(value: number | undefined): string {
  return value === undefined ? "Pending" : `${value.toFixed(1)}★`;
}

function formatUpsideRead(range: [number, number] | undefined): string {
  if (!range) return "Pending";
  return `${range[0].toFixed(1)}–${range[1].toFixed(1)}★`;
}

interface DiscoveryCardProps {
  record: DiscoveryRecord;
  playerName: string;
  report?: ScoutReport;
  transferRecord?: TransferRecord;
  clubNames: Record<string, string>;
  portraitAge?: number;
  onInspect?: () => void;
}

function DiscoveryCard({
  record,
  playerName,
  report,
  transferRecord,
  clubNames,
  portraitAge,
  onInspect,
}: DiscoveryCardProps) {
  const validatedAccuracy = report?.postTransferRating;
  const careerOutcomeLabel = record.careerOutcome
    ? CAREER_OUTCOME_LABELS[record.careerOutcome]
    : null;

  return (
    <article className="dossier-section py-6 sm:py-8">
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:justify-between">
        <div className="flex w-full min-w-0 items-start gap-4 sm:w-auto sm:flex-1">
          <PlayerAvatar playerId={record.playerId} atAge={portraitAge} size={88} alt={playerName} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-[var(--muted-foreground)]">First recorded · Season {record.discoveredSeason}, Week {record.discoveredWeek}</p>
            <h2 className="mt-1 font-editorial text-2xl text-[var(--foreground)] sm:text-3xl">{playerName}</h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {careerOutcomeLabel ?? "The career is still unfolding."}
            </p>
          </div>
        </div>
        {onInspect && (
          <Button variant="outline" onClick={onInspect} className="shrink-0 gap-2">
            Open player file <ArrowRight size={16} aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="mt-6 grid gap-x-8 gap-y-5 lg:grid-cols-[1fr_1fr]">
        <section aria-label={`Original judgment of ${playerName}`}>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--primary)]">Your original call</p>
          {report ? (
            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div><dt className="text-[var(--muted-foreground)]">Ability estimate</dt><dd className="mt-1 font-semibold text-[var(--foreground)]">{formatStarRead(report.perceivedCAStars)}</dd></div>
              <div><dt className="text-[var(--muted-foreground)]">Upside estimate</dt><dd className="mt-1 font-semibold text-[var(--foreground)]">{formatUpsideRead(report.perceivedPARange)}</dd></div>
            </dl>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">No original report is retained with this record.</p>
          )}
          {report && <p className="mt-3 text-xs text-[var(--muted-foreground)]">Original report craft: {report.qualityScore}/100</p>}
        </section>

        <section aria-label={`Career evidence for ${playerName}`}>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--primary)]">What followed</p>
          {validatedAccuracy !== undefined ? (
            <div className="mt-3">
              <p className="text-sm text-[var(--muted-foreground)]">Career-validated report accuracy <strong className={accuracyColor(validatedAccuracy)}>{validatedAccuracy}%</strong></p>
              <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-[var(--secondary)]" role="progressbar" aria-label="Career-validated report accuracy" aria-valuemin={0} aria-valuemax={100} aria-valuenow={validatedAccuracy}>
                <div className={`h-full ${accuracyBg(validatedAccuracy)}`} style={{ width: `${validatedAccuracy}%` }} />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">The record is not yet sufficient to validate the original call.</p>
          )}
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">{record.careerSnapshots.length} recorded season{record.careerSnapshots.length === 1 ? "" : "s"}</p>
          {record.placementClubId && (
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              Placed with <strong className="text-[var(--foreground)]">{clubNames[record.placementClubId] ?? "an academy"}</strong>
              {record.placementSeason && ` · Season ${record.placementSeason}, Week ${record.placementWeek ?? "?"}`}
            </p>
          )}
          {transferRecord && (transferRecord.outcome || transferRecord.outcomeReason) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--muted-foreground)]">Transfer outcome</span>
              <span className={transferRecord.outcome ? OUTCOME_COLORS[transferRecord.outcome] : "text-[var(--muted-foreground)]"}>{transferRecord.outcome ?? "Unresolved"}</span>
              {transferRecord.outcomeReason && <span className={OUTCOME_REASON_COLORS[transferRecord.outcomeReason]}>{OUTCOME_REASON_SHORT_LABELS[transferRecord.outcomeReason]}</span>}
            </div>
          )}
        </section>
      </div>

      <PlayerAgeTimeline playerId={record.playerId} compact className="mt-6 max-w-md border-t border-[var(--border)] pt-5" />
      {record.careerSnapshots.length > 0 && (
        <details className="mt-5 border-t border-[var(--border)] pt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--muted-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]">Season-by-season record</summary>
          <ol className="divide-y divide-[var(--border)]">
            {record.careerSnapshots.map((snapshot) => (
              <li key={snapshot.season} className="flex flex-wrap gap-x-5 gap-y-1 py-3 text-sm">
                <span className="font-semibold text-[var(--foreground)]">Season {snapshot.season}</span>
                <span className="text-[var(--muted-foreground)]">Age {snapshot.age} · {snapshot.position} · {clubNames[snapshot.clubId] ?? "Unattached"}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

export function DiscoveriesScreen() {
  const { gameState, setScreen, selectPlayer } = useGameStore();
  const [sort, setSort] = useState<SortOption>("recent");

  if (!gameState) return null;

  const discoveries = gameState.discoveryRecords ?? [];
  const firstReportByPlayerId = new Map<string, ScoutReport>();
  for (const report of Object.values(gameState.reports ?? {})) {
    const existing = firstReportByPlayerId.get(report.playerId);
    if (
      !existing ||
      report.submittedSeason < existing.submittedSeason ||
      (report.submittedSeason === existing.submittedSeason &&
        report.submittedWeek < existing.submittedWeek)
    ) {
      firstReportByPlayerId.set(report.playerId, report);
    }
  }

  const accuracyByPlayerId = new Map<string, number>();
  for (const record of discoveries) {
    const accuracy = firstReportByPlayerId.get(record.playerId)?.postTransferRating;
    if (accuracy !== undefined) accuracyByPlayerId.set(record.playerId, accuracy);
  }

  const sorted = sortDiscoveries(discoveries, sort, accuracyByPlayerId);
  const validatedScores = [...accuracyByPlayerId.values()];
  const avgValidatedAccuracy =
    validatedScores.length > 0
      ? Math.round(
          validatedScores.reduce((sum, score) => sum + score, 0) /
            validatedScores.length,
        )
      : null;
  const clubNames = Object.fromEntries(
    Object.values(gameState.clubs).map((club) => [club.id, club.name]),
  );

  const transferByPlayerId = new Map<string, TransferRecord>();
  for (const transferRecord of gameState.transferRecords ?? []) {
    transferByPlayerId.set(transferRecord.playerId, transferRecord);
  }

  return (
    <GameLayout>
      <div className="relative min-h-full px-4 py-6 sm:px-8 sm:py-8">

        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[var(--primary)]">Your calls, over time</p>
              <h1 className="font-editorial text-3xl text-[var(--foreground)] sm:text-4xl">Career Tracker</h1>
              <p className="text-sm text-zinc-400">
                Track your original calls against the careers that followed
              </p>
            </div>

            {discoveries.length > 0 && (
            <div className="flex flex-wrap gap-1 lg:pr-24" aria-label="Sort tracked careers">
              {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setSort(option)}
                  className={`min-h-11 cursor-pointer rounded border px-3 py-2 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
                    sort === option
                      ? "border-[var(--border)] bg-[var(--secondary)] text-[var(--primary)]"
                      : "border-[#27272a] text-zinc-400 hover:bg-[#1a1a1a] hover:text-white"
                  }`}
                  aria-pressed={sort === option}
                >
                  {SORT_LABELS[option]}
                </button>
              ))}
            </div>
            )}
          </div>

          {discoveries.length > 0 && (
            <dl className="mb-2 flex flex-wrap gap-x-8 gap-y-3 border-y border-[var(--border)] py-4 text-sm" data-tutorial-id="discoveries-trajectory">
              <div className="flex gap-2"><dt className="text-[var(--muted-foreground)]">Tracked careers</dt><dd className="font-semibold text-[var(--foreground)]">{discoveries.length}</dd></div>
              <div className="flex gap-2"><dt className="text-[var(--muted-foreground)]">Validated calls</dt><dd className="font-semibold text-[var(--foreground)]">{validatedScores.length}</dd></div>
              {avgValidatedAccuracy !== null && <div className="flex gap-2"><dt className="text-[var(--muted-foreground)]">Average validated accuracy</dt><dd className={`font-semibold ${accuracyColor(avgValidatedAccuracy)}`}>{avgValidatedAccuracy}%</dd></div>}
            </dl>
          )}

          {sorted.length === 0 ? (
            <section className="dossier-section max-w-3xl px-5 py-8 sm:px-8 sm:py-10" data-tutorial-id="discoveries-trajectory" aria-labelledby="first-career-call">
              <Compass size={24} className="mb-5 text-[var(--accent)]" aria-hidden="true" />
              <h2 id="first-career-call" className="font-editorial text-2xl text-white">Put your first judgment on record.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300">
                No tracked careers yet. Submit a report on a player you have watched. Your original call will stay here as their career unfolds.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={() => setScreen("youthScouting")}>Review prospects</Button>
                <Button variant="outline" onClick={() => setScreen("career")}>Back to Career</Button>
              </div>
            </section>
          ) : (
            <div
              className="divide-y divide-[var(--border)]"
              data-tutorial-id="discoveries-list"
            >
              {sorted.map((record) => {
                const playerName = resolvePlayerDisplayName(gameState, record.playerId);
                return (
                  <DiscoveryCard
                    key={record.playerId}
                    record={record}
                    playerName={playerName}
                    report={firstReportByPlayerId.get(record.playerId)}
                    transferRecord={transferByPlayerId.get(record.playerId)}
                    clubNames={clubNames}
                    portraitAge={selectPlayerAgeTimeline(gameState, record.playerId)?.frames.at(-1)?.age}
                    onInspect={resolvePlayerEntity(gameState, record.playerId) ? () => {
                      selectPlayer(record.playerId);
                      setScreen("playerProfile");
                    } : undefined}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </GameLayout>
  );
}
