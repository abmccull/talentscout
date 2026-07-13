"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DiscoveryRecord, ScoutReport, TransferRecord } from "@/engine/core/types";
import {
  OUTCOME_COLORS,
  OUTCOME_REASON_COLORS,
  OUTCOME_REASON_SHORT_LABELS,
} from "@/engine/firstTeam";
import { ScreenBackground } from "@/components/ui/screen-background";

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
}

function DiscoveryCard({
  record,
  playerName,
  report,
  transferRecord,
  clubNames,
}: DiscoveryCardProps) {
  const validatedAccuracy = report?.postTransferRating;
  const careerOutcomeLabel = record.careerOutcome
    ? CAREER_OUTCOME_LABELS[record.careerOutcome]
    : null;

  return (
    <div className="space-y-3 rounded-lg border border-[#27272a] bg-[#141414] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-white">{playerName}</p>
            {careerOutcomeLabel && (
              <Badge
                variant="secondary"
                className="shrink-0 border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300"
              >
                {careerOutcomeLabel}
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            Discovered W{record.discoveredWeek} S{record.discoveredSeason}
          </p>
        </div>
        {validatedAccuracy !== undefined && (
          <div className="shrink-0 text-right">
            <p className={`text-lg font-bold ${accuracyColor(validatedAccuracy)}`}>
              {validatedAccuracy}%
            </p>
            <p className="text-[10px] text-zinc-500">validated</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-[#27272a] px-2 py-1.5">
          <p className="text-[10px] text-zinc-500">Original Read</p>
          <p className="text-sm font-bold text-white">
            {formatStarRead(report?.perceivedCAStars)}
          </p>
        </div>
        <div className="rounded-md border border-[#27272a] px-2 py-1.5">
          <p className="text-[10px] text-zinc-500">Upside Read</p>
          <p className="text-sm font-bold text-white">
            {formatUpsideRead(report?.perceivedPARange)}
          </p>
        </div>
        <div className="rounded-md border border-[#27272a] px-2 py-1.5">
          <p className="text-[10px] text-zinc-500">Tracked</p>
          <p className="text-sm font-bold text-white">
            {record.careerSnapshots.length} season
            {record.careerSnapshots.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {validatedAccuracy !== undefined ? (
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="text-zinc-500">Career-validated report accuracy</span>
            <span className={accuracyColor(validatedAccuracy)}>
              {validatedAccuracy}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all ${accuracyBg(validatedAccuracy)}`}
              style={{ width: `${validatedAccuracy}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          Accuracy is pending enough real career evidence.
        </p>
      )}

      {record.placementClubId && (
        <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs">
          <span className="text-zinc-500">Placed with </span>
          <span className="font-medium text-blue-300">
            {clubNames[record.placementClubId] ?? "an academy"}
          </span>
          {record.placementSeason && (
            <span className="text-zinc-500">
              {` · W${record.placementWeek ?? "?"} S${record.placementSeason}`}
            </span>
          )}
        </div>
      )}

      {transferRecord && (transferRecord.outcome || transferRecord.outcomeReason) && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Transfer Outcome
          </p>
          <div className="flex items-center gap-1.5">
            {transferRecord.outcome ? (
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${OUTCOME_COLORS[transferRecord.outcome]}`}
              >
                {transferRecord.outcome}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md border border-zinc-500/20 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">
                Unresolved
              </span>
            )}
            {transferRecord.outcomeReason && (
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${OUTCOME_REASON_COLORS[transferRecord.outcomeReason]}`}
              >
                {OUTCOME_REASON_SHORT_LABELS[transferRecord.outcomeReason]}
              </span>
            )}
          </div>
        </div>
      )}

      {record.careerSnapshots.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Career Timeline
          </p>
          <div className="flex flex-wrap gap-1">
            {record.careerSnapshots.map((snapshot) => (
              <div
                key={snapshot.season}
                className="rounded border border-[#27272a] px-1.5 py-1 text-[9px]"
              >
                <span className="text-zinc-500">S{snapshot.season} </span>
                <span className="font-semibold text-white">Age {snapshot.age}</span>
                <span className="text-zinc-600"> · {snapshot.position}</span>
                <span className="text-zinc-600">
                  {` · ${clubNames[snapshot.clubId] ?? "Unattached"}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report && (
        <p className="text-[10px] text-zinc-600">
          Original report craft: {report.qualityScore}/100
        </p>
      )}
    </div>
  );
}

export function DiscoveriesScreen() {
  const { gameState, getPlayer } = useGameStore();
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
      <div className="relative p-6">
        <ScreenBackground src="/images/backgrounds/discoveries-trophy.png" opacity={0.78} />
        <div className="relative z-10">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Career Tracker</h1>
              <p className="text-sm text-zinc-400">
                Track your original calls against the careers that followed
              </p>
            </div>

            <div className="flex flex-wrap gap-1" aria-label="Sort tracked careers">
              {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setSort(option)}
                  className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs transition ${
                    sort === option
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-[#27272a] text-zinc-400 hover:bg-[#1a1a1a] hover:text-white"
                  }`}
                  aria-pressed={sort === option}
                >
                  {SORT_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div
            className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3"
            data-tutorial-id="discoveries-trajectory"
          >
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-zinc-500">Tracked Careers</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {discoveries.length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-zinc-500">Validated Calls</p>
                <p className="text-2xl font-bold text-amber-400">
                  {validatedScores.length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-zinc-500">Avg Validated Accuracy</p>
                <p
                  className={`text-2xl font-bold ${
                    avgValidatedAccuracy !== null
                      ? accuracyColor(avgValidatedAccuracy)
                      : "text-zinc-500"
                  }`}
                >
                  {avgValidatedAccuracy !== null ? `${avgValidatedAccuracy}%` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {sorted.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Trophy size={40} className="mb-4 text-zinc-700" aria-hidden="true" />
                <p className="text-sm text-zinc-500">No tracked careers yet.</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Submit reports to preserve your original calls and follow what happens next.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
              data-tutorial-id="discoveries-list"
            >
              {sorted.map((record) => {
                const player = getPlayer(record.playerId);
                const playerName = player
                  ? `${player.firstName} ${player.lastName}`
                  : "Unknown Player";
                return (
                  <DiscoveryCard
                    key={record.playerId}
                    record={record}
                    playerName={playerName}
                    report={firstReportByPlayerId.get(record.playerId)}
                    transferRecord={transferByPlayerId.get(record.playerId)}
                    clubNames={clubNames}
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
