"use client";

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
} from "lucide-react";
import { isBroke } from "@/engine/finance";
import { SeasonTimeline } from "./SeasonTimeline";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatBalance(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}K`;
  return `${sign}£${abs}`;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n}`;
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

// ─── component ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const {
    gameState,
    setScreen,
    getUpcomingFixtures,
    advanceWeek,
    startMatch,
    markMessageRead,
    selectPlayer,
  } = useGameStore();

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

  // Observed player IDs for shared-target detection
  const myTargetIds = new Set(
    Object.values(gameState.observations).map((o) => o.playerId),
  );

  return (
    <GameLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-zinc-400">
              Week {currentWeek} — Season {currentSeason}
            </p>
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
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Reputation</p>
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
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Fatigue</p>
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

                  {/* Monthly expenses */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Monthly Expenses</p>
                    <p className="text-lg font-bold text-red-400">
                      {formatMoney(totalExpenses)}
                    </p>
                  </div>

                  {/* Equipment level */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Equipment</p>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={14}
                          aria-hidden="true"
                          className={
                            i < finances.equipmentLevel
                              ? "text-amber-400 fill-amber-400"
                              : "text-zinc-700"
                          }
                        />
                      ))}
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
                <Badge variant="secondary">{thisWeekFixtures.length} matches</Badge>
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
                    return (
                      <div
                        key={fixture.id}
                        className="flex items-center justify-between rounded-md border border-[var(--border)] p-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {homeClub?.shortName || "?"} vs{" "}
                              {awayClub?.shortName || "?"}
                            </span>
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
          </div>
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
