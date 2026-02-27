"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Swords, Star, User, Target, Eye, Clock, AlertTriangle } from "lucide-react";
import { getRivalThreatLevel, getSharedTargets } from "@/engine/rivals";
import type { RivalScout, RivalActivity, GameState, Scout } from "@/engine/core/types";
import { ScreenBackground } from "@/components/ui/screen-background";

const THREAT_STYLES = {
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  high: "bg-red-500/10 text-red-400 border-red-500/30",
};

const THREAT_LABELS = {
  low: "Low Threat",
  medium: "Medium Threat",
  high: "High Threat",
};

const PERSONALITY_LABELS: Record<string, string> = {
  aggressive: "Aggressive",
  methodical: "Methodical",
  connected: "Well-Connected",
  lucky: "Lucky",
};

const BUDGET_LABELS: Record<string, string> = {
  low: "Low Budget",
  medium: "Mid Budget",
  high: "Big Spender",
};

const ACTIVITY_LABELS: Record<string, string> = {
  spotted: "Spotted at match",
  targetAcquired: "Targeting player",
  reportSubmitted: "Report submitted",
  playerSigned: "Player signed",
};

const ACTIVITY_ICONS: Record<string, typeof Eye> = {
  spotted: Eye,
  targetAcquired: Target,
  reportSubmitted: Clock,
  playerSigned: AlertTriangle,
};

function QualityStars({ quality }: { quality: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`Quality: ${quality} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={12}
          className={i < quality ? "text-amber-400 fill-amber-400" : "text-zinc-700"}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/** Progress bar component for scouting progress (0-5 scale). */
function ScoutingProgressBar({ progress, max = 5 }: { progress: number; max?: number }) {
  const pct = Math.min(100, (progress / max) * 100);
  const color =
    pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-zinc-500 tabular-nums w-8 text-right">
        {progress}/{max}
      </span>
    </div>
  );
}

interface RivalCardProps {
  rival: RivalScout;
  getClubName: (clubId: string) => string;
  getPlayerName: (playerId: string) => string;
  gameState: GameState;
  scout: Scout;
  onNavigateToPlayer: () => void;
  recentActivities: RivalActivity[];
}

function RivalCard({
  rival,
  getClubName,
  getPlayerName,
  gameState,
  scout,
  onNavigateToPlayer,
  recentActivities,
}: RivalCardProps) {
  const threat = getRivalThreatLevel(rival, scout);
  const sharedTargetIds = getSharedTargets(rival, gameState);
  const currentTargetName = rival.currentTarget
    ? getPlayerName(rival.currentTarget)
    : null;
  const currentTargetProgress = rival.currentTarget
    ? (rival.scoutingProgress?.[rival.currentTarget] ?? 0)
    : 0;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-sm font-medium text-white">{rival.name}</h3>
            <p className="text-xs text-zinc-500">
              {getClubName(rival.clubId)} &middot;{" "}
              <span className="capitalize">{rival.specialization}</span>
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${THREAT_STYLES[threat]}`}
          >
            {THREAT_LABELS[threat]}
          </span>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <QualityStars quality={rival.quality} />
          <span className="text-xs text-zinc-500">Rep: {rival.reputation}</span>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="text-[10px]">
            {PERSONALITY_LABELS[rival.personality] ?? rival.personality}
          </Badge>
          {rival.budgetTier && (
            <Badge variant="secondary" className="text-[10px]">
              {BUDGET_LABELS[rival.budgetTier] ?? rival.budgetTier}
            </Badge>
          )}
        </div>

        {/* Active target with progress bar */}
        {currentTargetName && (
          <div className="border-t border-zinc-800 pt-2 mt-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Target size={10} className="text-amber-400" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                Active Target
              </p>
            </div>
            <button
              onClick={onNavigateToPlayer}
              className="text-xs text-zinc-300 hover:text-emerald-400 transition cursor-pointer mb-1"
            >
              {currentTargetName}
            </button>
            <ScoutingProgressBar progress={currentTargetProgress} />
            {rival.reportDeadline !== undefined && (
              <p className="text-[10px] text-zinc-600 mt-0.5">
                Report due: week {rival.reportDeadline}
              </p>
            )}
          </div>
        )}

        {/* Scouting progress on other targets */}
        {rival.scoutingProgress && Object.keys(rival.scoutingProgress).length > 0 && (
          <div className="border-t border-zinc-800 pt-2 mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">
              Scouting Progress
            </p>
            <div className="space-y-1">
              {Object.entries(rival.scoutingProgress)
                .filter(([pid]) => pid !== rival.currentTarget && state_hasProgress(rival.scoutingProgress[pid]))
                .slice(0, 4)
                .map(([pid, prog]) => (
                  <div key={pid} className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 truncate flex-1">
                      {getPlayerName(pid)}
                    </span>
                    <ScoutingProgressBar progress={prog} />
                  </div>
                ))}
            </div>
          </div>
        )}

        {sharedTargetIds.length > 0 && (
          <div className="border-t border-zinc-800 pt-2 mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">
              Shared Targets ({sharedTargetIds.length})
            </p>
            <div className="space-y-1">
              {sharedTargetIds.slice(0, 5).map((pid) => (
                <button
                  key={pid}
                  onClick={onNavigateToPlayer}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 transition cursor-pointer"
                >
                  <User size={10} aria-hidden="true" />
                  {getPlayerName(pid)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent activity feed */}
        {recentActivities.length > 0 && (
          <div className="border-t border-zinc-800 pt-2 mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">
              Recent Activity
            </p>
            <div className="space-y-1">
              {recentActivities.slice(0, 3).map((act, i) => {
                const Icon = ACTIVITY_ICONS[act.type] ?? Eye;
                return (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <Icon size={10} aria-hidden="true" />
                    <span>{ACTIVITY_LABELS[act.type] ?? act.type}</span>
                    {act.playerId && (
                      <span className="text-zinc-400 truncate">
                        - {getPlayerName(act.playerId)}
                      </span>
                    )}
                    <span className="text-zinc-600 ml-auto">W{act.week}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Helper: returns true if progress value exists and is > 0. */
function state_hasProgress(prog: number | undefined): boolean {
  return prog !== undefined && prog > 0;
}

export function RivalsScreen() {
  const { gameState, setScreen } = useGameStore();

  if (!gameState) return null;

  const { scout, rivalScouts, clubs, players, rivalActivities } = gameState;
  const rivalList = Object.values(rivalScouts ?? {});
  const activities = rivalActivities ?? [];

  const getClubName = (clubId: string) => clubs[clubId]?.name ?? "Unknown Club";
  const getPlayerName = (playerId: string) => {
    const p = players[playerId];
    return p ? `${p.firstName} ${p.lastName}` : "Unknown Player";
  };

  /** Get recent activities for a specific rival (last 5). */
  const getRecentActivities = (rivalId: string) =>
    activities
      .filter((a) => a.rivalId === rivalId)
      .slice(-5)
      .reverse();

  if (rivalList.length === 0) {
    return (
      <GameLayout>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-white mb-2">Rival Scouts</h1>
          <p className="text-sm text-zinc-400">
            No rival scouts active yet. Rivals appear as you advance in your career.
          </p>
        </div>
      </GameLayout>
    );
  }

  const nemesis = rivalList.find((r) => r.isNemesis);
  const nonNemesisRivals = rivalList.filter((r) => !r.isNemesis);

  // Count total signed players by rivals
  const signedByRivals = activities.filter((a) => a.type === "playerSigned").length;
  const activeTargets = rivalList.filter((r) => r.currentTarget).length;

  return (
    <GameLayout>
      <div className="relative p-6 space-y-6">
        <ScreenBackground src="/images/backgrounds/rivals-binoculars.png" opacity={0.80} />
        <div className="relative z-10">
        <div>
          <h1 className="text-2xl font-bold text-white">Rival Scouts</h1>
          <p className="text-sm text-zinc-400">
            Scouts competing for the same talent in your territory
          </p>
        </div>

        {/* Summary stats */}
        <div className="flex gap-4" data-tutorial-id="rivals-intel">
          <div className="flex items-center gap-2 rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2">
            <Target size={14} className="text-amber-400" />
            <span className="text-xs text-zinc-400">
              {activeTargets} actively scouting
            </span>
          </div>
          {signedByRivals > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2">
              <AlertTriangle size={14} className="text-red-400" />
              <span className="text-xs text-zinc-400">
                {signedByRivals} player{signedByRivals !== 1 ? "s" : ""} lost to rivals
              </span>
            </div>
          )}
        </div>

        {/* Nemesis banner */}
        {nemesis && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Swords size={16} className="text-red-400" aria-hidden="true" />
              <span className="text-sm font-semibold text-red-400">Your Nemesis</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-white">{nemesis.name}</span>
                <span className="text-xs text-zinc-400 ml-2">
                  {getClubName(nemesis.clubId)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <QualityStars quality={nemesis.quality} />
                <span className="text-xs text-zinc-500">Rep: {nemesis.reputation}</span>
              </div>
            </div>
            {nemesis.currentTarget && (
              <p className="text-xs text-amber-400 mt-1">
                Currently scouting: {getPlayerName(nemesis.currentTarget)}
              </p>
            )}
            {(() => {
              const shared = getSharedTargets(nemesis, gameState);
              return shared.length > 0 ? (
                <p className="text-xs text-zinc-500 mt-1">
                  {shared.length} shared target{shared.length !== 1 ? "s" : ""}
                </p>
              ) : null;
            })()}
          </div>
        )}

        {/* Rival cards grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-tutorial-id="rivals-list">
          {nemesis && (
            <RivalCard
              key={nemesis.id}
              rival={nemesis}
              getClubName={getClubName}
              getPlayerName={getPlayerName}
              gameState={gameState}
              scout={scout}
              onNavigateToPlayer={() => setScreen("playerProfile")}
              recentActivities={getRecentActivities(nemesis.id)}
            />
          )}
          {nonNemesisRivals.map((rival) => (
            <RivalCard
              key={rival.id}
              rival={rival}
              getClubName={getClubName}
              getPlayerName={getPlayerName}
              gameState={gameState}
              scout={scout}
              onNavigateToPlayer={() => setScreen("playerProfile")}
              recentActivities={getRecentActivities(rival.id)}
            />
          ))}
        </div>
        </div>
      </div>
    </GameLayout>
  );
}
