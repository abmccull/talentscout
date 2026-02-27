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
  Shield,
  Activity,
  Calendar,
  UserCheck,
  Target,
} from "lucide-react";
import type {
  AlumniMilestoneType,
  AlumniCareerUpdateType,
  AlumniRecord,
  AlumniSeasonStats,
  AlumniStatus,
} from "@/engine/core/types";
import { calculatePlacementSuccessRate } from "@/engine/youth/alumni";

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

// ─── Career update config ─────────────────────────────────────────────────────

const UPDATE_ICONS: Record<AlumniCareerUpdateType, React.ElementType> = {
  debut: Star,
  firstGoal: Trophy,
  teamOfWeek: Target,
  loanMove: ArrowRightLeft,
  transfer: ArrowRightLeft,
  released: Users,
  internationalCall: Globe,
  injury: Activity,
  captaincy: Shield,
};

const UPDATE_COLORS: Record<AlumniCareerUpdateType, string> = {
  debut: "text-emerald-400",
  firstGoal: "text-amber-400",
  teamOfWeek: "text-cyan-400",
  loanMove: "text-orange-400",
  transfer: "text-zinc-400",
  released: "text-red-400",
  internationalCall: "text-blue-400",
  injury: "text-red-500",
  captaincy: "text-yellow-400",
};

const STATUS_LABELS: Record<AlumniStatus, string> = {
  academy: "Academy",
  firstTeam: "First Team",
  loaned: "On Loan",
  released: "Released",
  retired: "Retired",
  transferred: "Transferred",
};

const STATUS_COLORS: Record<AlumniStatus, string> = {
  academy: "bg-blue-900/50 text-blue-300 border-blue-700/50",
  firstTeam: "bg-emerald-900/50 text-emerald-300 border-emerald-700/50",
  loaned: "bg-orange-900/50 text-orange-300 border-orange-700/50",
  released: "bg-red-900/50 text-red-300 border-red-700/50",
  retired: "bg-zinc-800/50 text-zinc-400 border-zinc-600/50",
  transferred: "bg-purple-900/50 text-purple-300 border-purple-700/50",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

interface LegacyStatProps {
  label: string;
  value: number | string;
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

function SeasonStatsTable({ stats }: { stats: AlumniSeasonStats[] }) {
  if (stats.length === 0) return null;

  // Sort newest season first
  const sorted = [...stats].sort((a, b) => b.season - a.season);

  return (
    <div className="mt-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Season-by-Season Stats
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#27272a] text-zinc-500">
              <th className="pb-1 pr-3 text-left font-medium">Season</th>
              <th className="pb-1 px-2 text-right font-medium">Apps</th>
              <th className="pb-1 px-2 text-right font-medium">Goals</th>
              <th className="pb-1 px-2 text-right font-medium">Assists</th>
              <th className="pb-1 pl-2 text-right font-medium">Avg Rating</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.season} className="border-b border-[#27272a]/50">
                <td className="py-1 pr-3 text-zinc-300">S{s.season}</td>
                <td className="py-1 px-2 text-right text-zinc-400">{s.appearances}</td>
                <td className="py-1 px-2 text-right text-zinc-400">{s.goals}</td>
                <td className="py-1 px-2 text-right text-zinc-400">{s.assists}</td>
                <td className="py-1 pl-2 text-right text-zinc-300 font-medium">
                  {s.avgRating.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const [activeTab, setActiveTab] = useState<"milestones" | "timeline" | "stats">("milestones");
  const milestoneCount = record.milestones.length;
  const status = record.currentStatus ?? "academy";

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
            {/* Status badge */}
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[status]}`}
            >
              {STATUS_LABELS[status]}
            </span>
            {/* Contact graduated badge */}
            {record.becameContact && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-700/50 bg-amber-900/50 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                <UserCheck size={10} aria-hidden="true" />
                Contact
              </span>
            )}
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

      {/* Expanded content — tabs */}
      {expanded && (
        <div className="border-t border-[#27272a] px-4 pb-4 pt-3">
          {/* Tab navigation */}
          <div className="mb-3 flex gap-1">
            {(["milestones", "timeline", "stats"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                }`}
              >
                {tab === "milestones" ? "Milestones" : tab === "timeline" ? "Career Timeline" : "Season Stats"}
              </button>
            ))}
          </div>

          {/* Milestones tab */}
          {activeTab === "milestones" && (
            <>
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
            </>
          )}

          {/* Career Timeline tab (F12) */}
          {activeTab === "timeline" && (
            <>
              {(record.careerUpdates ?? []).length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No career updates yet. Updates appear as their career develops.
                </p>
              ) : (
                <div className="relative space-y-0">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Career Timeline
                  </p>
                  {/* Vertical timeline line */}
                  <div className="relative ml-2">
                    <div className="absolute left-[5px] top-0 bottom-0 w-px bg-[#27272a]" />
                    {[...(record.careerUpdates ?? [])].reverse().map((update, idx) => {
                      const Icon = UPDATE_ICONS[update.type];
                      const color = UPDATE_COLORS[update.type];
                      return (
                        <div key={idx} className="relative flex items-start gap-3 pb-3 pl-5">
                          <div
                            className={`absolute left-0 top-0.5 flex h-[11px] w-[11px] items-center justify-center rounded-full border border-[#27272a] bg-[#141414]`}
                          >
                            <div className={`h-[5px] w-[5px] rounded-full ${color.replace("text-", "bg-")}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Icon size={12} className={`shrink-0 ${color}`} aria-hidden="true" />
                              <span className="text-[10px] text-zinc-600">
                                S{update.season} W{update.week}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-zinc-400">
                              {update.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Season Stats tab (F12) */}
          {activeTab === "stats" && (
            <>
              {(record.seasonStats ?? []).length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No season data yet. Stats are generated at the end of each season.
                </p>
              ) : (
                <SeasonStatsTable stats={record.seasonStats ?? []} />
              )}
            </>
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

  const successRate = calculatePlacementSuccessRate(alumniRecords);
  const contactGraduates = alumniRecords.filter((r) => r.becameContact).length;

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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                <LegacyStat
                  label="Placement Success Rate"
                  value={`${successRate}%`}
                  icon={Target}
                  color="text-cyan-400"
                />
              </div>

              {/* Contact graduates summary */}
              {contactGraduates > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-700/30 bg-amber-900/20 px-3 py-2">
                  <UserCheck size={14} className="text-amber-400" aria-hidden="true" />
                  <p className="text-xs text-amber-300">
                    {contactGraduates} alumni {contactGraduates === 1 ? "has" : "have"} graduated to your contact network
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alumni List */}
        <div data-tutorial-id="alumni-list">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Alumni</h2>
            <div className="flex items-center gap-2">
              {contactGraduates > 0 && (
                <Badge variant="outline" className="border-amber-700/50 text-amber-400">
                  {contactGraduates} contacts
                </Badge>
              )}
              {alumniRecords.length > 0 && (
                <Badge variant="secondary">
                  {alumniRecords.length} placed
                </Badge>
              )}
            </div>
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
