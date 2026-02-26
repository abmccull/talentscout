"use client";

import { useGameStore } from "@/stores/gameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { MAX_ASSISTANT_SCOUTS } from "@/engine/finance";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(1)}K`;
  return `${sign}£${abs.toLocaleString()}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssistantScoutsTab() {
  const gameState = useGameStore((s) => s.gameState);
  const hireAssistantScoutAction = useGameStore((s) => s.hireAssistantScoutAction);
  const fireAssistantScoutAction = useGameStore((s) => s.fireAssistantScoutAction);
  const unassignAssistantScoutAction = useGameStore((s) => s.unassignAssistantScoutAction);

  if (!gameState) return null;

  const assistantScouts = gameState.assistantScouts ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Assistant Scouts</CardTitle>
            <span className="text-xs text-zinc-500">{assistantScouts.length}/{MAX_ASSISTANT_SCOUTS}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {assistantScouts.length === 0 && (
            <p className="text-xs text-zinc-500">No assistant scouts hired. Hire one to delegate scouting tasks.</p>
          )}
          {assistantScouts.map((asst) => (
            <div key={asst.id} className="rounded-lg border border-zinc-700 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{asst.name}</p>
                  <p className="text-xs text-zinc-400">Skill {Math.round((asst.skill + Number.EPSILON) * 10) / 10}/10 — {formatCurrency(asst.salary)}/wk</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] ${(asst.morale ?? 70) < 30 ? "border-red-600 text-red-400" : (asst.morale ?? 70) < 50 ? "border-amber-600 text-amber-400" : "border-emerald-600 text-emerald-400"}`}>
                    Morale: {asst.morale ?? 70}%
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] ${asst.fatigue > 60 ? "border-red-600 text-red-400" : asst.fatigue > 30 ? "border-amber-600 text-amber-400" : "border-emerald-600 text-emerald-400"}`}>
                    Fatigue: {asst.fatigue}%
                  </Badge>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="text-[10px] h-6 px-2"
                    onClick={() => fireAssistantScoutAction(asst.id)}
                  >
                    Fire
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500">Assignment:</span>
                {asst.assignedPlayerId ? (
                  <span className="text-sky-400">
                    Observing {gameState.players[asst.assignedPlayerId]?.firstName ?? "Unknown"} {gameState.players[asst.assignedPlayerId]?.lastName ?? ""}
                  </span>
                ) : asst.assignedRegion ? (
                  <span className="text-sky-400">Scouting {asst.assignedRegion}</span>
                ) : (
                  <span className="text-zinc-500">Unassigned (resting)</span>
                )}
              </div>
              <div className="flex gap-2">
                {(asst.assignedPlayerId || asst.assignedRegion) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[10px] h-6"
                    onClick={() => unassignAssistantScoutAction(asst.id)}
                  >
                    Unassign
                  </Button>
                )}
              </div>
              {asst.lowMorale && (
                <p className="text-[10px] text-red-400">⚠ Low morale — may quit if not addressed</p>
              )}
              <p className="text-[10px] text-zinc-600">Reports completed: {asst.reportsCompleted}</p>
            </div>
          ))}
          {assistantScouts.length < MAX_ASSISTANT_SCOUTS && (
            <Button
              size="sm"
              className="w-full"
              onClick={() => hireAssistantScoutAction()}
            >
              <Users size={14} className="mr-1" />
              Hire Assistant Scout
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
