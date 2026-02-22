"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  Trophy,
  Globe,
  Sparkles,
  ArrowRightLeft,
  Users,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { AlumniMilestoneType, AlumniRecord } from "@/engine/core/types";

// ─── Milestone config ─────────────────────────────────────────────────────────

const MILESTONE_ICONS: Record<AlumniMilestoneType, React.ElementType> = {
  firstTeamDebut: Star,
  firstGoal: Trophy,
  internationalCallUp: Globe,
  wonderkidStatus: Sparkles,
  transfer: ArrowRightLeft,
};

const MILESTONE_COLORS: Record<AlumniMilestoneType, string> = {
  firstTeamDebut: "text-emerald-400",
  firstGoal: "text-amber-400",
  internationalCallUp: "text-blue-400",
  wonderkidStatus: "text-purple-400",
  transfer: "text-zinc-400",
};

const MILESTONE_LABELS: Record<AlumniMilestoneType, string> = {
  firstTeamDebut: "First Team Debut",
  firstGoal: "First Goal",
  internationalCallUp: "International Call-Up",
  wonderkidStatus: "Wonderkid Status",
  transfer: "Transfer",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

interface LegacyStatProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}

function LegacyStat({ label, value, icon: Icon, color }: LegacyStatProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#27272a] bg-[#141414] p-4">
      <div>
        <p className="text-xs text-zinc-500">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </div>
      <Icon size={20} className={color} aria-hidden="true" />
    </div>
  );
}

interface AlumniCardProps {
  record: AlumniRecord;
  playerName: string;
  placedClubName: string;
  currentClubName: string;
}

function AlumniCard({
  record,
  playerName,
  placedClubName,
  currentClubName,
}: AlumniCardProps) {
  const [expanded, setExpanded] = useState(false);
  const milestoneCount = record.milestones.length;

  return (
    <div className="rounded-lg border border-[#27272a] bg-[#141414]">
      {/* Card header — always visible */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} alumni record for ${playerName}`}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-white">{playerName}</p>
            {milestoneCount > 0 && (
              <Badge
                variant="secondary"
                className="shrink-0 text-[10px]"
              >
                {milestoneCount} milestone{milestoneCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-zinc-500">
            <span>Placed at</span>
            <span className="text-zinc-300">{placedClubName}</span>
            {currentClubName !== placedClubName && (
              <>
                <ArrowRightLeft
                  size={10}
                  className="text-zinc-600"
                  aria-hidden="true"
                />
                <span className="text-zinc-300">{currentClubName}</span>
              </>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Placed S{record.placedSeason} W{record.placedWeek}
          </p>
        </div>
        {expanded ? (
          <ChevronDown
            size={16}
            className="shrink-0 text-zinc-500"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            size={16}
            className="shrink-0 text-zinc-500"
            aria-hidden="true"
          />
        )}
      </button>

      {/* Milestone timeline — visible when expanded */}
      {expanded && (
        <div className="border-t border-[#27272a] px-4 pb-4 pt-3">
          {record.milestones.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No milestones yet. Check back as their career develops.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Career Milestones
              </p>
              {record.milestones.map((milestone, idx) => {
                const Icon = MILESTONE_ICONS[milestone.type];
                const color = MILESTONE_COLORS[milestone.type];
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2"
                  >
                    <Icon
                      size={14}
                      className={`mt-0.5 shrink-0 ${color}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-xs font-semibold ${color}`}>
                          {MILESTONE_LABELS[milestone.type]}
                        </p>
                        <span className="text-[10px] text-zinc-600">
                          S{milestone.season} W{milestone.week}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {milestone.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function AlumniDashboard() {
  const { gameState } = useGameStore();

  if (!gameState) return null;

  const { alumniRecords, legacyScore, players, clubs } = gameState;

  const getPlayerName = (playerId: string): string => {
    const p = players[playerId];
    return p ? `${p.firstName} ${p.lastName}` : "Unknown Player";
  };

  const getClubName = (clubId: string): string => {
    return clubs[clubId]?.name ?? "Unknown Club";
  };

  return (
    <GameLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Alumni Dashboard</h1>
          <p className="text-sm text-zinc-400">
            Track the careers of youth you have placed at clubs
          </p>
        </div>

        {/* Legacy Score Card */}
        <div className="mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp
                  size={16}
                  className="text-emerald-400"
                  aria-hidden="true"
                />
                Legacy Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Total score — prominent */}
              <div className="mb-4 flex items-center gap-3">
                <p className="text-4xl font-bold text-emerald-400">
                  {legacyScore.totalScore}
                </p>
                <p className="text-sm text-zinc-500">total legacy points</p>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <LegacyStat
                  label="Youth Found"
                  value={legacyScore.youthFound}
                  icon={Users}
                  color="text-blue-400"
                />
                <LegacyStat
                  label="First Team Breakthroughs"
                  value={legacyScore.firstTeamBreakthroughs}
                  icon={Star}
                  color="text-amber-400"
                />
                <LegacyStat
                  label="International Caps from Finds"
                  value={legacyScore.internationalCapsFromFinds}
                  icon={Globe}
                  color="text-purple-400"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alumni List */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Alumni</h2>
            {alumniRecords.length > 0 && (
              <Badge variant="secondary">
                {alumniRecords.length} placed
              </Badge>
            )}
          </div>

          {alumniRecords.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Trophy
                  size={40}
                  className="mb-4 text-zinc-700"
                  aria-hidden="true"
                />
                <p className="text-sm text-zinc-500">No youth placed yet.</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Discover unsigned youth and recommend them to clubs to build
                  your legacy.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {alumniRecords.map((record) => (
                <AlumniCard
                  key={record.id}
                  record={record}
                  playerName={getPlayerName(record.playerId)}
                  placedClubName={getClubName(record.placedClubId)}
                  currentClubName={getClubName(record.currentClubId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </GameLayout>
  );
}
