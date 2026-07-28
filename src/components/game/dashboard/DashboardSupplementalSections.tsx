"use client";

import { AlertTriangle, ArrowRight, BarChart3, Brain, ClipboardList, Compass, Eye, Shield, Star, Target, TrendingUp, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeagueStandingsWidget } from "@/components/game/LeagueStandingsWidget";
import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";
import type { GameState, RivalScout } from "@/engine/core/types";
import type {
  DashboardDataAnalyst,
  DashboardDirective,
  DashboardLoan,
  DashboardPrediction,
  DashboardRecentTransfer,
  DashboardSetScreen,
} from "./types";
import { moraleEmoji, priorityBadgeClass, threatBadgeVariant, threatLabel } from "./helpers";

interface DashboardSupplementalSectionsProps {
  gameState: GameState;
  scout: GameState["scout"];
  specialization: GameState["scout"]["primarySpecialization"];
  activeDirectives: DashboardDirective[];
  recentTransfers: DashboardRecentTransfer[];
  allPredictions: DashboardPrediction[];
  resolvedPredictions: DashboardPrediction[];
  correctPredictions: DashboardPrediction[];
  predictionAccuracy: number;
  currentStreak: number;
  oracleBadge: boolean;
  unresolvedPredictions: DashboardPrediction[];
  dataAnalysts: DashboardDataAnalyst[];
  hasRivals: boolean;
  rivalScouts: RivalScout[];
  relevantActiveLoans: DashboardLoan[];
  setScreen: DashboardSetScreen;
  selectPlayer: (playerId: string) => void;
  submitLoanMonitoringReport: (dealId: string) => void;
}

export function DashboardSupplementalSections({
  gameState,
  scout,
  specialization,
  activeDirectives,
  recentTransfers,
  allPredictions,
  resolvedPredictions,
  correctPredictions,
  predictionAccuracy,
  currentStreak,
  oracleBadge,
  unresolvedPredictions,
  dataAnalysts,
  hasRivals,
  rivalScouts,
  relevantActiveLoans,
  setScreen,
  selectPlayer,
  submitLoanMonitoringReport,
}: DashboardSupplementalSectionsProps) {
  return (
    <>
      {specialization === "firstTeam" && gameState.boardProfile && scout.careerTier >= 5 && (
        <div className="mt-6">
          <Card data-tutorial-id="dashboard-board-satisfaction">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield size={14} className="text-amber-400" aria-hidden="true" />
                Board Satisfaction
                <Badge
                  variant="outline"
                  className={`ml-auto text-[10px] capitalize ${
                    gameState.boardProfile.satisfactionLevel >= 80
                      ? "border-emerald-500/50 text-emerald-400"
                      : gameState.boardProfile.satisfactionLevel >= 50
                        ? "border-amber-500/50 text-amber-400"
                        : gameState.boardProfile.satisfactionLevel >= 25
                          ? "border-orange-500/50 text-orange-400"
                          : "border-red-500/50 text-red-400"
                  }`}
                >
                  {gameState.boardProfile.personality}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                  <span>Satisfaction</span>
                  <span>{Math.round(gameState.boardProfile.satisfactionLevel)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      gameState.boardProfile.satisfactionLevel >= 80
                        ? "bg-emerald-500"
                        : gameState.boardProfile.satisfactionLevel >= 50
                          ? "bg-amber-500"
                          : gameState.boardProfile.satisfactionLevel >= 25
                            ? "bg-orange-500"
                            : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, gameState.boardProfile.satisfactionLevel))}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                  <span>Patience</span>
                  <span>{Math.round(gameState.boardProfile.patience)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      gameState.boardProfile.patience >= 60
                        ? "bg-blue-500"
                        : gameState.boardProfile.patience >= 30
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, gameState.boardProfile.patience))}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Budget Multiplier</span>
                <span className={
                  gameState.boardProfile.budgetMultiplier >= 1.2
                    ? "text-emerald-400 font-semibold"
                    : gameState.boardProfile.budgetMultiplier >= 0.9
                      ? "text-zinc-300"
                      : "text-red-400 font-semibold"
                }>
                  {gameState.boardProfile.budgetMultiplier.toFixed(2)}x
                </span>
              </div>
              {gameState.boardProfile.ultimatumIssued && (
                <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2">
                  <AlertTriangle size={14} className="shrink-0 text-red-400" aria-hidden="true" />
                  <span className="text-xs text-red-400">
                    Ultimatum active{gameState.boardProfile.ultimatumDeadline
                      ? ` — deadline: week ${gameState.boardProfile.ultimatumDeadline}`
                      : ""}
                  </span>
                </div>
              )}
              {gameState.boardProfile.satisfactionLevel < 20 && !gameState.boardProfile.ultimatumIssued && (
                <div className="flex items-center gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 p-2">
                  <AlertTriangle size={14} className="shrink-0 text-orange-400" aria-hidden="true" />
                  <span className="text-xs text-orange-400">
                    Board satisfaction dangerously low. Risk of termination.
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setScreen("career")}
              >
                <Users size={12} className="mr-1" aria-hidden="true" />
                Open Board Relations
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {specialization === "firstTeam" && (activeDirectives.length > 0 || recentTransfers.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {activeDirectives.length > 0 && (
            <Card data-tutorial-id="dashboard-directives">
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
                  <div key={directive.id} className="rounded-md border border-[#27272a] p-3">
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-[10px] capitalize ${priorityBadgeClass(directive.priority)}`}
                        >
                          {directive.priority}
                        </Badge>
                        <span className="text-sm font-semibold text-white">{directive.position}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-zinc-400">
                        {directive.submittedReportIds.length} report{directive.submittedReportIds.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <span>Age {directive.ageRange[0]}–{directive.ageRange[1]}</span>
                      <span className="text-zinc-400" aria-hidden="true">·</span>
                      <span>{directive.minCAStars}★ min</span>
                      <span className="text-zinc-400" aria-hidden="true">·</span>
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
                  return (
                    <div key={record.id} className="rounded-md border border-[#27272a] p-3">
                      <div className="mb-1 flex items-start justify-between gap-2">
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
                                    : "border-zinc-600 text-zinc-400"
                            }`}
                          >
                            {record.outcome}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400">
                        {fromClub?.shortName ?? "?"} → {toClub?.shortName ?? "?"}
                        {record.fee > 0 && <span className="ml-1">· £{record.fee.toLocaleString()}</span>}
                      </p>
                      {record.appearances != null && (
                        <p className="mt-1 text-xs text-zinc-400">
                          {record.appearances} appearances · S{record.transferSeason}
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

      {specialization === "data" && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card data-tutorial-id="dashboard-predictions">
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
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-[#27272a] p-2 text-center">
                  <p className="text-lg font-bold text-white">{allPredictions.length}</p>
                  <p className="text-[10px] text-zinc-400">Total</p>
                </div>
                <div className="rounded-md border border-[#27272a] p-2 text-center">
                  <p className="text-lg font-bold text-emerald-400">{correctPredictions.length}</p>
                  <p className="text-[10px] text-zinc-400">Correct</p>
                </div>
                <div className="rounded-md border border-[#27272a] p-2 text-center">
                  <p className={`text-lg font-bold ${predictionAccuracy >= 70 ? "text-emerald-400" : predictionAccuracy >= 50 ? "text-amber-400" : "text-red-400"}`}>
                    {resolvedPredictions.length > 0 ? `${predictionAccuracy}%` : "—"}
                  </p>
                  <p className="text-[10px] text-zinc-400">Accuracy</p>
                </div>
              </div>
              {currentStreak > 0 && (
                <p className="text-xs font-medium text-amber-400">
                  {currentStreak} correct in a row
                </p>
              )}

              {unresolvedPredictions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Pending</p>
                  {unresolvedPredictions.map((pred) => {
                    const player = gameState.players[pred.playerId];
                    return (
                      <div key={pred.id} className="rounded-md border border-[#27272a] p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-white">
                            {player ? `${player.firstName} ${player.lastName}` : "Unknown"}
                          </span>
                          <Badge variant="outline" className="shrink-0 text-[9px] capitalize">
                            {pred.type}
                          </Badge>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-zinc-400">{pred.statement}</p>
                        <p className="text-[9px] text-zinc-300">Resolves S{pred.resolveBySeason}</p>
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

          <Card data-tutorial-id="dashboard-data-analysts">
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
                <p className="text-xs text-zinc-400">No analysts hired. Recruit analysts to generate passive reports.</p>
              ) : (
                dataAnalysts.map((analyst) => {
                  const assignedLeague = analyst.assignedLeagueId
                    ? gameState.leagues[analyst.assignedLeagueId]
                    : undefined;
                  return (
                    <div key={analyst.id} className="rounded-md border border-[#27272a] p-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
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
                        <span className="text-zinc-400">Skill {analyst.skill}/20</span>
                        <span className="capitalize text-zinc-400">{analyst.focus}</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-[#27272a]">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${(analyst.skill / 20) * 100}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-zinc-400">
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
              {!IS_YOUTH_EARLY_ACCESS && (
                <>
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
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {!IS_YOUTH_EARLY_ACCESS && hasRivals && (
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
                  const rivalLeague = rivalClub ? gameState.leagues[rivalClub.leagueId] : undefined;
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
                          <p className="text-xs text-zinc-400">
                            {rivalClub?.shortName ?? "Unknown Club"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge
                            variant={threatBadgeVariant(rival.quality)}
                            className="shrink-0 text-[10px]"
                          >
                            {threatLabel(rival.quality)}
                          </Badge>
                          <Badge variant="outline" className="shrink-0 border-zinc-700 text-[9px] text-zinc-400">
                            {rival.specialization === "firstTeam" ? "First Team"
                              : rival.specialization === "youth" ? "Youth"
                                : rival.specialization === "regional" ? "Regional"
                                  : "Data"}
                          </Badge>
                        </div>
                      </div>

                      <div className="mb-2 flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={10}
                            aria-hidden="true"
                            className={
                              i < rival.quality
                                ? "fill-amber-400 text-amber-400"
                                : "text-zinc-700"
                            }
                          />
                        ))}
                      </div>

                      {rivalLeague && (
                        <p className="text-[10px] text-zinc-400">
                          Active in {rivalLeague.name}
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

      {!IS_YOUTH_EARLY_ACCESS && (
        <div className="mt-6">
          <LeagueStandingsWidget />
        </div>
      )}

      {relevantActiveLoans.length > 0 && (
        <div className="mt-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Eye size={14} className="text-sky-400" />
                Active Loans
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {relevantActiveLoans.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {relevantActiveLoans.slice(0, 8).map((deal) => {
                const loanPlayer = gameState.players[deal.playerId];
                const parentClub = gameState.clubs[deal.parentClubId];
                const loanClub = gameState.clubs[deal.loanClubId];
                const perf = deal.performanceRecord;
                const monitoredThisWeek = (deal.monitoringWeeks ?? []).includes(
                  `${gameState.currentSeason}:${gameState.currentWeek}`,
                );
                if (!loanPlayer) return null;
                return (
                  <div
                    key={deal.id}
                    className="flex cursor-pointer items-center justify-between rounded-md border border-[#27272a] bg-[#141414] px-3 py-2 text-xs hover:border-sky-500/30"
                    onClick={() => {
                      selectPlayer(deal.playerId);
                      setScreen("playerProfile");
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-200">
                        {loanPlayer.firstName} {loanPlayer.lastName}
                        <span className="ml-1 text-zinc-400">({loanPlayer.age})</span>
                      </p>
                      <p className="truncate text-[10px] text-zinc-400">
                        {parentClub?.name ?? "?"} → {loanClub?.name ?? "?"}
                        {" · "}Ends S{deal.endSeason} W{deal.endWeek}
                      </p>
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-2">
                      {perf && (
                        <>
                          <span className="text-zinc-400">{perf.appearances} apps</span>
                          {perf.avgRating > 0 && (
                            <span className={perf.avgRating >= 7 ? "text-emerald-400" : perf.avgRating >= 6 ? "text-amber-400" : "text-red-400"}>
                              {perf.avgRating.toFixed(1)}
                            </span>
                          )}
                          {perf.developmentDelta !== 0 && (
                            <span className={perf.developmentDelta > 0 ? "text-emerald-400" : "text-red-400"}>
                              {perf.developmentDelta > 0 ? "+" : ""}{perf.developmentDelta} CA
                            </span>
                          )}
                        </>
                      )}
                      {(deal.scoutId === gameState.scout.id ||
                        deal.parentClubId === gameState.scout.currentClubId ||
                        deal.loanClubId === gameState.scout.currentClubId) && (
                        <button
                          className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 transition hover:border-sky-500/40 hover:text-sky-400"
                          disabled={monitoredThisWeek}
                          title={monitoredThisWeek ? "Monitoring report already filed this week" : "Submit monitoring report"}
                          onClick={(e) => {
                            e.stopPropagation();
                            submitLoanMonitoringReport(deal.id);
                          }}
                        >
                          <ClipboardList size={10} className="mr-0.5 inline" />
                          {monitoredThisWeek ? "Monitored" : "Monitor"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
