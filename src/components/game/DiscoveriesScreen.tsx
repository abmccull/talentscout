"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Star, TrendingUp } from "lucide-react";
import { getDiscoveryStats } from "@/engine/career/index";
import type { DiscoveryRecord, TransferRecord } from "@/engine/core/types";
import {
  OUTCOME_COLORS,
  OUTCOME_REASON_COLORS,
  OUTCOME_REASON_SHORT_LABELS,
} from "@/engine/firstTeam";
import { ScreenBackground } from "@/components/ui/screen-background";

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortOption = "recent" | "accuracy" | "wonderkids";

const SORT_LABELS: Record<SortOption, string> = {
  recent: "Most Recent",
  accuracy: "Highest Accuracy",
  wonderkids: "Wonderkids First",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
        (a, b) => (b.predictionAccuracy ?? -1) - (a.predictionAccuracy ?? -1),
      );
    case "wonderkids":
      return copy.sort((a, b) => {
        if (a.wasWonderkid && !b.wasWonderkid) return -1;
        if (!a.wasWonderkid && b.wasWonderkid) return 1;
        return b.discoveredSeason - a.discoveredSeason;
      });
  }
}

// ─── DiscoveryCard ─────────────────────────────────────────────────────────────

interface DiscoveryCardProps {
  record: DiscoveryRecord;
  playerName: string;
  currentCA: number | undefined;
  transferRecord?: TransferRecord;
}

function DiscoveryCard({ record, playerName, currentCA, transferRecord }: DiscoveryCardProps) {
  const latestSnapshot =
    record.careerSnapshots.length > 0
      ? record.careerSnapshots[record.careerSnapshots.length - 1]
      : null;

  const displayCA = currentCA ?? latestSnapshot?.currentAbility ?? record.initialCA;
  const caGain = displayCA - record.initialCA;

  return (
    <div className="rounded-lg border border-[#27272a] bg-[#141414] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white truncate">{playerName}</p>
            {record.wasWonderkid && (
              <Badge
                variant="warning"
                className="shrink-0 text-[10px] border-amber-500/50 bg-amber-500/10 text-amber-400"
              >
                <Star size={9} className="mr-1" aria-hidden="true" />
                Wonderkid
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            Discovered W{record.discoveredWeek} S{record.discoveredSeason}
          </p>
        </div>
        {record.predictionAccuracy !== undefined && (
          <div className="shrink-0 text-right">
            <p
              className={`text-lg font-bold ${accuracyColor(record.predictionAccuracy)}`}
            >
              {record.predictionAccuracy}%
            </p>
            <p className="text-[10px] text-zinc-500">accuracy</p>
          </div>
        )}
      </div>

      {/* CA comparison */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-[#27272a] px-2 py-1.5">
          <p className="text-[10px] text-zinc-500">Initial CA</p>
          <p className="text-sm font-bold text-white">{record.initialCA}</p>
        </div>
        <div className="rounded-md border border-[#27272a] px-2 py-1.5">
          <p className="text-[10px] text-zinc-500">Current CA</p>
          <p className="text-sm font-bold text-white">{displayCA}</p>
        </div>
        <div className="rounded-md border border-[#27272a] px-2 py-1.5">
          <p className="text-[10px] text-zinc-500">Growth</p>
          <p
            className={`text-sm font-bold ${caGain >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {caGain >= 0 ? "+" : ""}
            {caGain}
          </p>
        </div>
      </div>

      {/* Accuracy bar */}
      {record.predictionAccuracy !== undefined && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="text-zinc-500">Prediction Accuracy</span>
            <span className={accuracyColor(record.predictionAccuracy)}>
              {record.predictionAccuracy}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all ${accuracyBg(record.predictionAccuracy)}`}
              style={{ width: `${record.predictionAccuracy}%` }}
            />
          </div>
        </div>
      )}

      {/* Transfer outcome */}
      {transferRecord?.outcome && (
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">
            Transfer Outcome
          </p>
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${OUTCOME_COLORS[transferRecord.outcome]}`}
            >
              {transferRecord.outcome}
            </span>
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

      {/* Career snapshots */}
      {record.careerSnapshots.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">
            Career Timeline
          </p>
          <div className="flex flex-wrap gap-1">
            {record.careerSnapshots.map((snap) => (
              <div
                key={snap.season}
                className="rounded border border-[#27272a] px-1.5 py-1 text-[9px]"
              >
                <span className="text-zinc-500">S{snap.season} </span>
                <span className="font-semibold text-white">CA {snap.currentAbility}</span>
                <span className="text-zinc-600"> · {snap.position}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DiscoveriesScreen ────────────────────────────────────────────────────────

export function DiscoveriesScreen() {
  const { gameState, getPlayer } = useGameStore();
  const [sort, setSort] = useState<SortOption>("recent");

  const discoveries = gameState?.discoveryRecords ?? [];
  const stats = getDiscoveryStats(discoveries);
  const sorted = sortDiscoveries(discoveries, sort);

  // Build lookup of transfer records by player ID for outcome display
  const transferByPlayerId = new Map<string, TransferRecord>();
  for (const tr of (gameState?.transferRecords ?? [])) {
    transferByPlayerId.set(tr.playerId, tr);
  }

  if (!gameState) return null;

  return (
    <GameLayout>
      <div className="relative p-6">
        <ScreenBackground src="/images/backgrounds/discoveries-trophy.png" opacity={0.78} />
        <div className="relative z-10">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Discoveries</h1>
            <p className="text-sm text-zinc-400">
              Players discovered throughout your career
            </p>
          </div>

          {/* Sort selector */}
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
              <button
                key={option}
                onClick={() => setSort(option)}
                className={`rounded-md px-3 py-1.5 text-xs transition cursor-pointer ${
                  sort === option
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "text-zinc-400 border border-[#27272a] hover:text-white hover:bg-[#1a1a1a]"
                }`}
                aria-pressed={sort === option}
              >
                {SORT_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        {/* Stats summary */}
        <div className="mb-6 grid grid-cols-3 gap-4" data-tutorial-id="discoveries-trajectory">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Total Discoveries</p>
              <p className="text-2xl font-bold text-emerald-400">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Wonderkids Found</p>
              <p className="text-2xl font-bold text-amber-400">{stats.wonderkids}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Avg Accuracy</p>
              <p
                className={`text-2xl font-bold ${
                  stats.avgAccuracy > 0 ? accuracyColor(stats.avgAccuracy) : "text-zinc-500"
                }`}
              >
                {stats.avgAccuracy > 0 ? `${stats.avgAccuracy}%` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Discoveries list */}
        {sorted.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Trophy size={40} className="mb-4 text-zinc-700" aria-hidden="true" />
              <p className="text-sm text-zinc-500">No discoveries yet.</p>
              <p className="mt-1 text-xs text-zinc-600">
                Submit reports to track player careers.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-tutorial-id="discoveries-list">
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
                  currentCA={player?.currentAbility}
                  transferRecord={transferByPlayerId.get(record.playerId)}
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
