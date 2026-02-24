"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Swords, Star, User } from "lucide-react";
import { getRivalThreatLevel, getSharedTargets } from "@/engine/rivals";
import type { RivalScout, GameState, Scout } from "@/engine/core/types";

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

interface RivalCardProps {
  rival: RivalScout;
  getClubName: (clubId: string) => string;
  getPlayerName: (playerId: string) => string;
  gameState: GameState;
  scout: Scout;
  onNavigateToPlayer: () => void;
}

function RivalCard({
  rival,
  getClubName,
  getPlayerName,
  gameState,
  scout,
  onNavigateToPlayer,
}: RivalCardProps) {
  const threat = getRivalThreatLevel(rival, scout);
  const sharedTargetIds = getSharedTargets(rival, gameState);

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
        </div>

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
      </CardContent>
    </Card>
  );
}

export function RivalsScreen() {
  const { gameState, setScreen } = useGameStore();

  if (!gameState) return null;

  const { scout, rivalScouts, clubs, players } = gameState;
  const rivalList = Object.values(rivalScouts ?? {});

  const getClubName = (clubId: string) => clubs[clubId]?.name ?? "Unknown Club";
  const getPlayerName = (playerId: string) => {
    const p = players[playerId];
    return p ? `${p.firstName} ${p.lastName}` : "Unknown Player";
  };

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

  return (
    <GameLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Rival Scouts</h1>
          <p className="text-sm text-zinc-400">
            Scouts competing for the same talent in your territory
          </p>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {nemesis && (
            <RivalCard
              key={nemesis.id}
              rival={nemesis}
              getClubName={getClubName}
              getPlayerName={getPlayerName}
              gameState={gameState}
              scout={scout}
              onNavigateToPlayer={() => setScreen("playerProfile")}
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
            />
          ))}
        </div>
      </div>
    </GameLayout>
  );
}
