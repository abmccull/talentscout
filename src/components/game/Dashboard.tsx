"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Eye,
  FileText,
  TrendingUp,
  Mail,
  DollarSign,
  AlertTriangle,
  Star,
  Shield,
  ChevronDown,
  ChevronRight,
  Bookmark,
  Compass,
  Trophy,
  BarChart3,
  GraduationCap,
  Target,
  ArrowRight,
  Users,
  Brain,
  BookOpen,
  Monitor,
  Plane,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { isBroke, getEquipmentItem, ALL_EQUIPMENT_SLOTS } from "@/engine/finance";
import type { EquipmentSlot } from "@/engine/finance";
import { getSeasonPhase } from "@/engine/core/seasonEvents";
import { SeasonTimeline } from "./SeasonTimeline";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatBalance(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}K`;
  return `${sign}£${abs}`;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n}`;
}

function getOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function threatBadgeVariant(
  quality: number,
): "default" | "warning" | "destructive" | "secondary" {
  if (quality >= 4) return "destructive";
  if (quality >= 3) return "warning";
  if (quality >= 2) return "default";
  return "secondary";
}

function threatLabel(quality: number): string {
  if (quality >= 4) return "High Threat";
  if (quality >= 3) return "Medium";
  if (quality >= 2) return "Low";
  return "Minimal";
}

// ─── Specialization widget helpers ────────────────────────────────────────────

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "critical": return "border-red-500/50 bg-red-500/10 text-red-400";
    case "high":     return "border-amber-500/50 bg-amber-500/10 text-amber-400";
    case "medium":   return "border-blue-500/50 bg-blue-500/10 text-blue-400";
    default:         return "border-zinc-600 bg-zinc-800 text-zinc-400";
  }
}

function performanceRatingColor(rating: number): string {
  if (rating >= 70) return "text-emerald-400";
  if (rating >= 40) return "text-amber-400";
  return "text-red-400";
}

function moraleEmoji(morale: number): string {
  if (morale >= 75) return "😊";
  if (morale >= 50) return "😐";
  if (morale >= 25) return "😕";
  return "😞";
}

// ─── component ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const {
    gameState,
    setScreen,
    getUpcomingFixtures,
    getLeagueStandings,
    advanceWeek,
    startMatch,
    startReport,
    markMessageRead,
    selectPlayer,
  } = useGameStore();
  const [expandedRivals, setExpandedRivals] = useState<Set<string>>(new Set());
  const [expandedExpenses, setExpandedExpenses] = useState(false);

  const toggleRival = (rivalId: string) => {
    setExpandedRivals((prev) => {
      const next = new Set(prev);
      if (next.has(rivalId)) next.delete(rivalId);
      else next.add(rivalId);
      return next;
    });
  };

  if (!gameState) return null;

  const { scout, currentWeek, currentSeason } = gameState;
  const upcoming = getUpcomingFixtures(currentWeek, 8);
  const thisWeekFixtures = upcoming.filter((f) => f.week === currentWeek);
  const recentReports = Object.values(gameState.reports)
    .sort((a, b) => b.submittedWeek - a.submittedWeek)
    .slice(0, 5);
  const unreadMessages = gameState.inbox.filter((m) => !m.read);
  const observedPlayerCount = new Set(
    Object.values(gameState.observations).map((o) => o.playerId),
  ).size;

  // Phase 1 widgets
  const unreviewedNPCReports = Object.values(gameState.npcReports).filter(
    (r) => !r.reviewed,
  );
  const hasMultipleCountries = gameState.countries.length > 1;
  const { travelBooking } = scout;

  // Phase 2: finances
  const { finances } = gameState;
  const broke = finances ? isBroke(finances) : false;
  const totalExpenses = finances
    ? Object.values(finances.expenses).reduce((s, v) => s + v, 0)
    : 0;

  // Phase 2: rival scouts
  const rivalScouts = Object.values(gameState.rivalScouts);
  const hasRivals = rivalScouts.length > 0;

  // Specialization-specific data
  const specialization = scout.primarySpecialization;

  // firstTeam: active (unfulfilled) directives
  const activeDirectives = specialization === "firstTeam"
    ? gameState.managerDirectives.filter((d) => !d.fulfilled).slice(0, 4)
    : [];

  // firstTeam: recent transfer records (max 3)
  const recentTransfers = specialization === "firstTeam"
    ? [...gameState.transferRecords]
        .sort((a, b) => b.season - a.season || b.week - a.week)
        .slice(0, 3)
    : [];

  // data: prediction accuracy summary
  const allPredictions = specialization === "data" ? gameState.predictions : [];
  const resolvedPredictions = allPredictions.filter((p) => p.resolved);
  const correctPredictions = resolvedPredictions.filter((p) => p.wasCorrect === true);
  const predictionAccuracy = resolvedPredictions.length > 0
    ? Math.round((correctPredictions.length / resolvedPredictions.length) * 100)
    : 0;
  const currentStreak = (() => {
    if (specialization !== "data") return 0;
    let streak = 0;
    const sorted = [...resolvedPredictions].sort((a, b) => b.madeInSeason - a.madeInSeason || b.madeInWeek - a.madeInWeek);
    for (const p of sorted) {
      if (p.wasCorrect === true) streak++;
      else break;
    }
    return streak;
  })();
  const oracleBadge = predictionAccuracy >= 70 && resolvedPredictions.length >= 10;
  const unresolvedPredictions = allPredictions.filter((p) => !p.resolved).slice(0, 3);

  // data: analysts
  const dataAnalysts = specialization === "data" ? gameState.dataAnalysts : [];

  // Observed player IDs for shared-target detection
  const myTargetIds = new Set(
    Object.values(gameState.observations).map((o) => o.playerId),
  );

  // Issue 9: season phase badge
  const seasonPhase = getSeasonPhase(currentWeek);
  const phaseLabel: Record<typeof seasonPhase, string> = {
    preseason: "Preseason",
    earlyseason: "Early Season",
    midseason: "Midseason",
    lateseason: "Late Season",
    endseason: "End of Season",
  };
  const phaseClass: Record<typeof seasonPhase, string> = {
    preseason: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    earlyseason: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    midseason: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    lateseason: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    endseason: "bg-red-500/15 text-red-400 border-red-500/30",
  };

  return (
    <GameLayout>
      <div className="p-6" data-tutorial-id="dashboard-overview">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <div className="flex items-center gap-2">
              <Tooltip content="The current simulation week. Each week, you schedule activities and advance." side="bottom">
                <p className="text-sm text-zinc-400">
                  Week {currentWeek} — Season {currentSeason}
                </p>
              </Tooltip>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${phaseClass[seasonPhase]}`}
              >
                {phaseLabel[seasonPhase]}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setScreen("calendar")}>
              <Calendar size={16} className="mr-2" aria-hidden="true" />
              Planner
            </Button>
            <Button onClick={() => advanceWeek()}>Advance Week</Button>
          </div>
        </div>

        {/* Season Timeline */}
        {gameState.seasonEvents.length > 0 && (
          <SeasonTimeline
            seasonEvents={gameState.seasonEvents}
            currentWeek={currentWeek}
          />
        )}

        {/* Quick Stats */}
        <div className="mb-6 grid grid-cols-4 gap-4">
          <Card data-tutorial-id="dashboard-reputation">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Tooltip content="Your standing in the scouting world. Higher reputation unlocks better job offers and contact access." side="bottom">
                    <p className="text-xs text-zinc-500">Reputation</p>
                  </Tooltip>
                  <p className="text-2xl font-bold text-emerald-400">
                    {Math.round(scout.reputation)}
                  </p>
                </div>
                <TrendingUp className="text-emerald-500" size={20} aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Reports Filed</p>
                  <p className="text-2xl font-bold">{scout.reportsSubmitted}</p>
                </div>
                <FileText className="text-zinc-500" size={20} aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Players Scouted</p>
                  <p className="text-2xl font-bold">{observedPlayerCount}</p>
                </div>
                <Eye className="text-zinc-500" size={20} aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card data-tutorial-id="dashboard-fatigue">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Tooltip content="Physical and mental exhaustion. High fatigue reduces observation accuracy and increases injury risk." side="bottom">
                    <p className="text-xs text-zinc-500">Fatigue</p>
                  </Tooltip>
                  <p className="text-2xl font-bold">
                    {Math.round(scout.fatigue)}%
                  </p>
                </div>
                <div
                  aria-hidden="true"
                  className={`h-3 w-3 rounded-full ${
                    scout.fatigue > 70
                      ? "bg-red-500"
                      : scout.fatigue > 40
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── T8.2: Financial summary card ─────────────────────────────────── */}
        {finances && (
          <div className="mb-6">
            <Card
              className={
                broke
                  ? "border-red-500/40 bg-red-500/5"
                  : "border-[#27272a]"
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <DollarSign size={14} className="text-emerald-400" aria-hidden="true" />
                  Finances
                  {broke && (
                    <Badge variant="destructive" className="ml-auto text-[10px]">
                      <AlertTriangle size={10} className="mr-1" aria-hidden="true" />
                      Broke
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  {/* Balance */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Balance</p>
                    <p
                      className={`text-lg font-bold ${
                        finances.balance >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatBalance(finances.balance)}
                    </p>
                  </div>

                  {/* Monthly income */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Monthly Income</p>
                    <p className="text-lg font-bold text-white">
                      {formatMoney(finances.monthlyIncome)}
                    </p>
                  </div>

                  {/* Monthly expenses — expandable */}
                  <div>
                    <button
                      onClick={() => setExpandedExpenses((prev) => !prev)}
                      className="flex items-center gap-1 text-xs text-zinc-500 mb-1 hover:text-zinc-300 transition"
                    >
                      Monthly Expenses
                      {expandedExpenses ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    </button>
                    <p className="text-lg font-bold text-red-400">
                      {formatMoney(totalExpenses)}
                    </p>
                    {expandedExpenses && (
                      <div className="mt-2 space-y-1">
                        {Object.entries(finances.expenses)
                          .filter(([, val]) => val > 0)
                          .map(([category, amount]) => (
                            <div
                              key={category}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="text-zinc-500 capitalize">
                                {category.replace(/([A-Z])/g, " $1").trim()}
                              </span>
                              <span className="text-red-400">{formatMoney(amount)}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Equipment loadout */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Equipment</p>
                    <div className="flex items-center gap-1">
                      {ALL_EQUIPMENT_SLOTS.map((slot) => {
                        const itemId = finances.equipment?.loadout[slot];
                        const item = itemId ? getEquipmentItem(itemId) : null;
                        const tier = item?.tier ?? 1;
                        const isSpecialist = !!item?.specialization;
                        const SlotIcon = (
                          { notebook: BookOpen, video: Monitor, travel: Plane, network: Users, analysis: BarChart3 } as Record<EquipmentSlot, React.ElementType>
                        )[slot];
                        const tierColor = isSpecialist
                          ? "text-purple-400 ring-1 ring-purple-500/50"
                          : tier === 4
                            ? "text-emerald-400"
                            : tier === 3
                              ? "text-amber-400"
                              : tier === 2
                                ? "text-blue-400"
                                : "text-zinc-600";
                        return (
                          <div
                            key={slot}
                            className={`rounded p-0.5 ${tierColor}`}
                            title={item?.name ?? slot}
                          >
                            <SlotIcon size={14} aria-hidden="true" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {broke && (
                  <p className="mt-3 text-xs text-red-400">
                    Your balance is critically low. Reduce expenses or seek new contracts.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Phase 1 alert widgets */}
        {(unreviewedNPCReports.length > 0 || hasMultipleCountries) && (
          <div className="mb-6 flex flex-wrap gap-4">
            {/* NPC report queue */}
            {unreviewedNPCReports.length > 0 && (
              <Card className="flex-1 min-w-[220px]">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-zinc-500">NPC Reports</p>
                      <p className="text-sm font-semibold text-amber-400">
                        {unreviewedNPCReports.length} pending review
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setScreen("npcManagement")}
                    >
                      Review
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* International status */}
            {hasMultipleCountries && (
              <Card className="flex-1 min-w-[220px]">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-zinc-500">International</p>
                      {travelBooking?.isAbroad ? (
                        <p className="text-sm font-semibold text-blue-400">
                          In {travelBooking.destinationCountry} — returns wk{" "}
                          {travelBooking.returnWeek}
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-white">
                          At home base
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setScreen("internationalView")}
                    >
                      View
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* This Week's Fixtures */}
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>This Week&apos;s Fixtures</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{thisWeekFixtures.length} matches</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setScreen("fixtureBrowser")} className="text-xs text-zinc-400 hover:text-white">
                    Browse All
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {thisWeekFixtures.length === 0 ? (
                <p className="text-sm text-zinc-500">No fixtures this week.</p>
              ) : (
                <div className="space-y-2">
                  {thisWeekFixtures.slice(0, 6).map((fixture) => {
                    const homeClub = gameState.clubs[fixture.homeClubId];
                    const awayClub = gameState.clubs[fixture.awayClubId];
                    const league = gameState.leagues[fixture.leagueId];
                    // Get standings positions
                    const standings = league ? getLeagueStandings(league.id) : [];
                    const homePos = standings.findIndex((s) => s.clubId === fixture.homeClubId) + 1;
                    const awayPos = standings.findIndex((s) => s.clubId === fixture.awayClubId) + 1;
                    const weather = fixture.weather;
                    return (
                      <div
                        key={fixture.id}
                        className="flex items-center justify-between rounded-md border border-[var(--border)] p-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {homeClub?.name || "?"}
                              {homePos > 0 && <span className="text-zinc-500 text-xs"> ({getOrdinal(homePos)})</span>}
                              {" vs "}
                              {awayClub?.name || "?"}
                              {awayPos > 0 && <span className="text-zinc-500 text-xs"> ({getOrdinal(awayPos)})</span>}
                            </span>
                            {weather && (
                              <span className="text-[10px] text-zinc-500 capitalize">{weather.replace(/([A-Z])/g, " $1").trim()}</span>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              {league?.shortName}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => startMatch(fixture.id)}
                        >
                          <Eye size={14} className="mr-1" aria-hidden="true" />
                          Scout
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {thisWeekFixtures.length > 6 && (
                <p className="mt-2 text-xs text-zinc-500">
                  +{thisWeekFixtures.length - 6} more fixtures
                </p>
              )}
            </CardContent>
          </Card>

          {/* Inbox & Recent Activity */}
          <div className="space-y-6">
            {/* Inbox */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Mail size={16} aria-hidden="true" />
                    Inbox
                  </span>
                  {unreadMessages.length > 0 && (
                    <Badge>{unreadMessages.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {unreadMessages.length === 0 ? (
                  <p className="text-sm text-zinc-500">All caught up.</p>
                ) : (
                  <div className="space-y-2">
                    {unreadMessages.slice(0, 4).map((msg) => (
                      <button
                        key={msg.id}
                        onClick={() => {
                          markMessageRead(msg.id);
                          setScreen("inbox");
                        }}
                        className="w-full cursor-pointer rounded-md border border-[var(--border)] p-2 text-left hover:border-zinc-600 transition"
                      >
                        <p className="text-sm font-medium">{msg.title}</p>
                        <p className="text-xs text-zinc-500 line-clamp-1">
                          {msg.body}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => setScreen("inbox")}
                >
                  View All
                </Button>
              </CardContent>
            </Card>

            {/* Recent Reports */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Reports</CardTitle>
              </CardHeader>
              <CardContent>
                {recentReports.length === 0 ? (
                  <p className="text-sm text-zinc-500">No reports filed yet.</p>
                ) : (
                  <div className="space-y-2">
                    {recentReports.map((report) => {
                      const player = gameState.players[report.playerId];
                      return (
                        <button
                          key={report.id}
                          onClick={() => {
                            selectPlayer(report.playerId);
                            setScreen("playerProfile");
                          }}
                          className="w-full cursor-pointer rounded-md border border-[var(--border)] p-2 text-left hover:border-zinc-600 transition"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">
                              {player?.firstName} {player?.lastName}
                            </p>
                            <Badge
                              variant={
                                report.conviction === "tablePound"
                                  ? "default"
                                  : report.conviction === "strongRecommend"
                                    ? "success"
                                    : "secondary"
                              }
                              className="text-[10px]"
                            >
                              {report.conviction === "tablePound"
                                ? "TABLE POUND"
                                : report.conviction === "strongRecommend"
                                  ? "Strong Rec"
                                  : report.conviction === "recommend"
                                    ? "Recommend"
                                    : "Note"}
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-500">
                            Quality: {report.qualityScore}/100 — Week{" "}
                            {report.submittedWeek}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Watchlist widget */}
            {gameState.watchlist.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Bookmark size={14} className="text-amber-400" aria-hidden="true" />
                    Watchlist
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {gameState.watchlist.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {gameState.watchlist.slice(0, 5).map((pid) => {
                      const p = gameState.players[pid];
                      if (!p) return null;
                      return (
                        <button
                          key={pid}
                          onClick={() => {
                            selectPlayer(pid);
                            setScreen("playerProfile");
                          }}
                          className="flex w-full items-center justify-between rounded-md border border-[var(--border)] p-2 text-left hover:border-zinc-600 transition"
                        >
                          <span className="text-sm font-medium text-white truncate">
                            {p.firstName} {p.lastName}
                          </span>
                          <Badge variant="outline" className="text-[10px] shrink-0 ml-2">
                            {p.position}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                  {gameState.watchlist.length > 5 && (
                    <p className="mt-1 text-xs text-zinc-500">
                      +{gameState.watchlist.length - 5} more
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => setScreen("playerDatabase")}
                  >
                    View All
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Youth Scouting */}
            {Object.keys(gameState.unsignedYouth).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <GraduationCap size={16} className="text-emerald-400" aria-hidden="true" />
                    Youth Scouting
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-zinc-500">Unsigned Youth</p>
                      <p className="text-lg font-medium">{Object.keys(gameState.unsignedYouth).length}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Discovered</p>
                      <p className="text-lg font-medium">
                        {Object.values(gameState.unsignedYouth).filter((y) =>
                          y.discoveredBy.includes(gameState.scout.id ?? ""),
                        ).length}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Placed</p>
                      <p className="text-lg font-medium">
                        {Object.values(gameState.unsignedYouth).filter((y) => y.placed).length}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Legacy Score</p>
                      <p className="text-lg font-medium text-emerald-400">{gameState.legacyScore.totalScore}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setScreen("youthScouting")}
                  >
                    View Youth Hub
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* ── First-Team Scout Widgets ─────────────────────────────────────── */}
        {specialization === "firstTeam" && (activeDirectives.length > 0 || recentTransfers.length > 0) && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Active Directives */}
            {activeDirectives.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Target size={14} className="text-blue-400" aria-hidden="true" />
                    Active Directives
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {gameState.managerDirectives.filter((d) => !d.fulfilled).length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeDirectives.map((directive) => (
                    <div
                      key={directive.id}
                      className="rounded-md border border-[#27272a] p-3"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] capitalize shrink-0 ${priorityBadgeClass(directive.priority)}`}
                          >
                            {directive.priority}
                          </Badge>
                          <span className="text-sm font-semibold text-white">{directive.position}</span>
                        </div>
                        <span className="shrink-0 text-[10px] text-zinc-500">
                          {directive.submittedReportIds.length} report{directive.submittedReportIds.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-400">
                        <span>Age {directive.ageRange[0]}–{directive.ageRange[1]}</span>
                        <span className="text-zinc-600">·</span>
                        <span>{directive.minCAStars}★ min</span>
                        <span className="text-zinc-600">·</span>
                        <span className="text-emerald-400">
                          {directive.budgetAllocation >= 1_000_000
                            ? `£${(directive.budgetAllocation / 1_000_000).toFixed(1)}M`
                            : `£${(directive.budgetAllocation / 1_000).toFixed(0)}K`}
                        </span>
                      </div>
                    </div>
                  ))}
                  {gameState.managerDirectives.filter((d) => !d.fulfilled).length > 4 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-zinc-400 hover:text-white"
                      onClick={() => setScreen("career")}
                    >
                      View All
                      <ArrowRight size={12} className="ml-1" aria-hidden="true" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Transfer Tracker */}
            {recentTransfers.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <TrendingUp size={14} className="text-emerald-400" aria-hidden="true" />
                    Transfer Tracker
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recentTransfers.map((record) => {
                    const player = gameState.players[record.playerId];
                    const fromClub = gameState.clubs[record.fromClubId];
                    const toClub = gameState.clubs[record.toClubId];
                    const latestPerf = record.seasonPerformance.length > 0
                      ? record.seasonPerformance[record.seasonPerformance.length - 1]
                      : null;
                    return (
                      <div key={record.id} className="rounded-md border border-[#27272a] p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-white">
                            {player ? `${player.firstName} ${player.lastName}` : "Unknown Player"}
                          </p>
                          {record.outcome && (
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-[10px] ${
                                record.outcome === "hit"
                                  ? "border-emerald-500/50 text-emerald-400"
                                  : record.outcome === "decent"
                                  ? "border-amber-500/50 text-amber-400"
                                  : record.outcome === "flop"
                                  ? "border-red-500/50 text-red-400"
                                  : "border-zinc-600 text-zinc-500"
                              }`}
                            >
                              {record.outcome}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500">
                          {fromClub?.shortName ?? "?"} → {toClub?.shortName ?? "?"}
                        </p>
                        {latestPerf && (
                          <p className={`mt-1 text-xs font-semibold ${performanceRatingColor(latestPerf.rating)}`}>
                            S{latestPerf.season}: {latestPerf.rating}/100
                          </p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Data Scout Widgets ────────────────────────────────────────────── */}
        {specialization === "data" && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Prediction Tracker */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Brain size={14} className="text-violet-400" aria-hidden="true" />
                  Prediction Tracker
                  {oracleBadge && (
                    <Badge
                      variant="outline"
                      className="ml-auto border-violet-500/50 bg-violet-500/10 text-violet-400 text-[10px]"
                    >
                      Oracle
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border border-[#27272a] p-2 text-center">
                    <p className="text-lg font-bold text-white">{allPredictions.length}</p>
                    <p className="text-[10px] text-zinc-500">Total</p>
                  </div>
                  <div className="rounded-md border border-[#27272a] p-2 text-center">
                    <p className="text-lg font-bold text-emerald-400">{correctPredictions.length}</p>
                    <p className="text-[10px] text-zinc-500">Correct</p>
                  </div>
                  <div className="rounded-md border border-[#27272a] p-2 text-center">
                    <p className={`text-lg font-bold ${predictionAccuracy >= 70 ? "text-emerald-400" : predictionAccuracy >= 50 ? "text-amber-400" : "text-red-400"}`}>
                      {resolvedPredictions.length > 0 ? `${predictionAccuracy}%` : "—"}
                    </p>
                    <p className="text-[10px] text-zinc-500">Accuracy</p>
                  </div>
                </div>
                {currentStreak > 0 && (
                  <p className="text-xs text-amber-400 font-medium">
                    {currentStreak} correct in a row
                  </p>
                )}

                {/* Recent unresolved predictions */}
                {unresolvedPredictions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Pending</p>
                    {unresolvedPredictions.map((pred) => {
                      const player = gameState.players[pred.playerId];
                      return (
                        <div key={pred.id} className="rounded-md border border-[#27272a] p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-white truncate">
                              {player ? `${player.firstName} ${player.lastName}` : "Unknown"}
                            </span>
                            <Badge variant="outline" className="shrink-0 text-[9px] capitalize">
                              {pred.type}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-[10px] text-zinc-500 line-clamp-1">{pred.statement}</p>
                          <p className="text-[9px] text-zinc-600">Resolves S{pred.resolveBySeason}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-zinc-400 hover:text-white"
                  onClick={() => setScreen("career")}
                >
                  View All
                  <ArrowRight size={12} className="ml-1" aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>

            {/* Analytics Team */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users size={14} className="text-blue-400" aria-hidden="true" />
                  Analytics Team
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {dataAnalysts.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dataAnalysts.length === 0 ? (
                  <p className="text-xs text-zinc-500">No analysts hired. Recruit analysts to generate passive reports.</p>
                ) : (
                  dataAnalysts.map((analyst) => {
                    const assignedLeague = analyst.assignedLeagueId
                      ? gameState.leagues[analyst.assignedLeagueId]
                      : undefined;
                    return (
                      <div key={analyst.id} className="rounded-md border border-[#27272a] p-3">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-sm font-medium text-white">{analyst.name}</span>
                          <span
                            className="text-base"
                            role="img"
                            aria-label={`Morale: ${analyst.morale}/100`}
                          >
                            {moraleEmoji(analyst.morale)}
                          </span>
                        </div>
                        <div className="mb-1 flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500">Skill {analyst.skill}/20</span>
                          <span className="text-zinc-500 capitalize">{analyst.focus}</span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-[#27272a]">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all"
                            style={{ width: `${(analyst.skill / 20) * 100}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          {assignedLeague ? assignedLeague.name : "Unassigned"}
                        </p>
                      </div>
                    );
                  })
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-zinc-400 hover:text-white"
                  onClick={() => setScreen("career")}
                >
                  Manage
                  <ArrowRight size={12} className="ml-1" aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Issue 13: Quick Links */}
        <div className="mt-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Links</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setScreen("discoveries")}
                  className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#141414] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white"
                >
                  <Compass size={15} className="text-emerald-400" aria-hidden="true" />
                  Discoveries
                </button>
                <button
                  onClick={() => setScreen("leaderboard")}
                  className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#141414] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white"
                >
                  <Trophy size={15} className="text-amber-400" aria-hidden="true" />
                  Leaderboard
                </button>
                <button
                  onClick={() => setScreen("analytics")}
                  className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#141414] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white"
                >
                  <BarChart3 size={15} className="text-blue-400" aria-hidden="true" />
                  Analytics
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── T8.6: Rival scouts section ───────────────────────────────────── */}
        {hasRivals && (
          <div className="mt-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Shield size={14} className="text-red-400" aria-hidden="true" />
                  Rival Scouts Activity
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {rivalScouts.length} rival{rivalScouts.length !== 1 ? "s" : ""}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {rivalScouts.map((rival) => {
                    const rivalClub = gameState.clubs[rival.clubId];
                    const sharedTargets = rival.targetPlayerIds.filter((id) =>
                      myTargetIds.has(id),
                    );
                    const isExpanded = expandedRivals.has(rival.id);
                    // Check which shared targets have observations but no report yet
                    const reportedIds = new Set(
                      Object.values(gameState.reports).map((r) => r.playerId),
                    );
                    return (
                      <div
                        key={rival.id}
                        className="rounded-lg border border-[#27272a] bg-[#141414] p-3"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {rival.name}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {rivalClub?.shortName ?? "Unknown Club"}
                            </p>
                          </div>
                          <Badge
                            variant={threatBadgeVariant(rival.quality)}
                            className="shrink-0 text-[10px]"
                          >
                            {threatLabel(rival.quality)}
                          </Badge>
                        </div>

                        {/* Quality stars */}
                        <div className="mb-2 flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              size={10}
                              aria-hidden="true"
                              className={
                                i < rival.quality
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-zinc-700"
                              }
                            />
                          ))}
                        </div>

                        {/* Shared targets warning */}
                        {sharedTargets.length > 0 && (
                          <p className="text-[10px] text-amber-400 flex items-center gap-1">
                            <AlertTriangle size={9} aria-hidden="true" />
                            {sharedTargets.length} shared target
                            {sharedTargets.length !== 1 ? "s" : ""}
                          </p>
                        )}

                        {/* Expandable targets */}
                        {rival.targetPlayerIds.length > 0 && (
                          <button
                            onClick={() => toggleRival(rival.id)}
                            className="mt-2 flex w-full items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition"
                          >
                            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                            View Targets ({rival.targetPlayerIds.length})
                          </button>
                        )}
                        {isExpanded && (
                          <div className="mt-2 space-y-1">
                            {rival.targetPlayerIds.map((pid) => {
                              const p = gameState.players[pid];
                              const name = p ? `${p.firstName} ${p.lastName}` : pid;
                              const isShared = myTargetIds.has(pid);
                              const hasObs = Object.values(gameState.observations).some(
                                (o) => o.playerId === pid,
                              );
                              const hasReport = reportedIds.has(pid);
                              return (
                                <div
                                  key={pid}
                                  className={`flex items-center justify-between rounded px-2 py-1 text-[10px] ${
                                    isShared ? "bg-amber-500/10 border border-amber-500/20" : "bg-[#0c0c0c]"
                                  }`}
                                >
                                  <button
                                    onClick={() => {
                                      selectPlayer(pid);
                                      setScreen("playerProfile");
                                    }}
                                    className="text-left hover:text-emerald-400 transition truncate"
                                  >
                                    <span className={isShared ? "text-amber-400" : "text-zinc-300"}>
                                      {name}
                                    </span>
                                    {isShared && (
                                      <span className="ml-1 text-amber-500">SHARED</span>
                                    )}
                                  </button>
                                  {isShared && hasObs && !hasReport && (
                                    <button
                                      onClick={() => startReport(pid)}
                                      className="shrink-0 ml-1 rounded px-1.5 py-0.5 text-[9px] font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition"
                                    >
                                      File Report
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </GameLayout>
  );
}
