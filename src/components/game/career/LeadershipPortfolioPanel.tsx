"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle, Clock3, ExternalLink, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NPCDelegation, NPCScout, Player } from "@/engine/core/types";
import type {
  LeadershipPortfolioState,
  LeadershipResponsibility,
  LeadershipResponsibilityChoice,
} from "@/engine/career/leadership";

interface LeadershipPortfolioPanelProps {
  portfolio?: LeadershipPortfolioState;
  players: Record<string, Player>;
  npcScouts: Record<string, NPCScout>;
  npcDelegations: Record<string, NPCDelegation>;
  onChoice: (
    responsibilityId: string,
    choice: LeadershipResponsibilityChoice,
    npcScoutId?: string,
  ) => void;
  onOpenPlayer: (playerId: string) => void;
  onOpenNpcManagement: () => void;
}

const ACTIVE_STATUSES = new Set<LeadershipResponsibility["status"]>([
  "open",
  "owned",
  "delegated",
  "deferred",
]);

function playerName(players: Record<string, Player>, playerId: string): string {
  const player = players[playerId];
  return player ? `${player.firstName} ${player.lastName}` : "Unknown prospect";
}

function statusVariant(
  status: LeadershipResponsibility["status"],
): "success" | "warning" | "destructive" | "outline" | "secondary" {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "rejected") return "destructive";
  if (status === "open" || status === "deferred") return "warning";
  if (status === "delegated") return "secondary";
  return "outline";
}

export function LeadershipPortfolioPanel({
  portfolio,
  players,
  npcScouts,
  npcDelegations,
  onChoice,
  onOpenPlayer,
  onOpenNpcManagement,
}: LeadershipPortfolioPanelProps) {
  const [selectedNpcByResponsibility, setSelectedNpcByResponsibility] = useState<Record<string, string>>({});

  if (!portfolio) {
    return (
      <Card className="border-fuchsia-400/20 bg-fuchsia-400/[0.05]">
        <CardContent className="p-5">
          <p className="font-semibold text-white">Leadership portfolio initializing</p>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Your first three recruitment responsibilities arrive at the next weekly review.
          </p>
        </CardContent>
      </Card>
    );
  }

  const responsibilities = Object.values(portfolio.responsibilities);
  const active = responsibilities
    .filter((responsibility) => ACTIVE_STATUSES.has(responsibility.status))
    .sort((left, right) =>
      left.dueSeason - right.dueSeason
      || left.dueWeek - right.dueWeek
      || left.id.localeCompare(right.id),
    );
  const recentOutcomes = responsibilities
    .filter((responsibility) => !ACTIVE_STATUSES.has(responsibility.status))
    .sort((left, right) =>
      (right.resolvedSeason ?? right.createdSeason) - (left.resolvedSeason ?? left.createdSeason)
      || (right.resolvedWeek ?? right.createdWeek) - (left.resolvedWeek ?? left.createdWeek),
    )
    .slice(0, 3);
  const activeDelegations = Object.values(npcDelegations).filter((delegation) => !delegation.completed);
  const busyScoutIds = new Set(activeDelegations.map((delegation) => delegation.npcScoutId));
  const availableScouts = Object.values(npcScouts)
    .filter((scout) => scout.territoryId && scout.fatigue <= 80 && !busyScoutIds.has(scout.id))
    .sort((left, right) => right.quality - left.quality || left.id.localeCompare(right.id));
  const attentionRemaining = Math.max(0, portfolio.attentionCapacity - portfolio.attentionUsed);
  const successful = portfolio.trackRecord.ownedSuccesses + portfolio.trackRecord.delegatedSuccesses;
  const failed = portfolio.trackRecord.ownedFailures
    + portfolio.trackRecord.delegatedFailures
    + portfolio.trackRecord.rejected
    + portfolio.trackRecord.expired;

  return (
    <Card
      className="border-fuchsia-400/20 bg-[#11161c]/95"
      data-testid="leadership-portfolio"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users size={17} className="text-fuchsia-300" aria-hidden="true" />
              Weekly recruitment portfolio
            </CardTitle>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Owning work costs two attention. A delegated brief costs one. Deferral preserves attention once, but raises the stakes.
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">
              Personal {portfolio.trackRecord.ownedSuccesses} delivered / {portfolio.trackRecord.ownedFailures} missed · Delegated {portfolio.trackRecord.delegatedSuccesses} delivered / {portfolio.trackRecord.delegatedFailures} missed · {portfolio.trackRecord.deferrals} deferrals
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={attentionRemaining > 0 ? "warning" : "destructive"}>
              {attentionRemaining}/{portfolio.attentionCapacity} attention left
            </Badge>
            <Badge variant="outline">{successful} delivered · {failed} missed</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-3">
          {active.map((responsibility) => {
            const assignedScout = responsibility.assignedNpcScoutId
              ? npcScouts[responsibility.assignedNpcScoutId]
              : undefined;
            const selectedNpcId = selectedNpcByResponsibility[responsibility.id]
              ?? availableScouts[0]?.id
              ?? "";
            return (
              <article
                key={responsibility.id}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant={responsibility.priority === "critical" ? "destructive" : "warning"}>
                    {responsibility.priority}
                  </Badge>
                  <span className="text-[11px] text-zinc-500">
                    Due S{responsibility.dueSeason} W{responsibility.dueWeek}
                  </span>
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-fuchsia-300">
                  {responsibility.title}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenPlayer(responsibility.playerId)}
                  className="mt-1 min-h-11 text-left text-base font-semibold text-white underline-offset-4 hover:text-emerald-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                >
                  {playerName(players, responsibility.playerId)}
                </button>
                <p className="mt-2 text-xs leading-5 text-zinc-400">{responsibility.description}</p>

                {responsibility.status === "open" && (
                  <div className="mt-4 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={attentionRemaining < 2}
                        onClick={() => onChoice(responsibility.id, "own")}
                      >
                        Own · 2
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={attentionRemaining < 1 || !selectedNpcId}
                        onClick={() => onChoice(responsibility.id, "delegate", selectedNpcId)}
                      >
                        Delegate · 1
                      </Button>
                    </div>
                    <label className="block text-[11px] text-zinc-500">
                      Assigned scout
                      <select
                        value={selectedNpcId}
                        disabled={availableScouts.length === 0}
                        onChange={(event) => setSelectedNpcByResponsibility((current) => ({
                          ...current,
                          [responsibility.id]: event.target.value,
                        }))}
                        className="mt-1 min-h-11 w-full rounded-md border border-white/10 bg-[#0b1015] px-2 text-xs text-white"
                      >
                        {availableScouts.length === 0 && <option value="">No scout available</option>}
                        {availableScouts.map((scout) => (
                          <option key={scout.id} value={scout.id}>
                            {scout.firstName} {scout.lastName} · Q{scout.quality} · Fatigue {scout.fatigue}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onChoice(responsibility.id, "defer")}
                      >
                        Defer {responsibility.deferrals > 0 ? "again" : "once"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-300 hover:text-red-200"
                        onClick={() => onChoice(responsibility.id, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {responsibility.status === "owned" && (
                  <div className="mt-4 rounded-lg border border-sky-400/20 bg-sky-400/[0.06] p-3 text-xs leading-5 text-sky-100">
                    <p className="flex items-center gap-2 font-semibold"><Clock3 size={13} aria-hidden="true" /> You own the call</p>
                    <p className="mt-1 text-sky-100/80">File a 60+ craft report before the deadline. The result will be attributed to you.</p>
                  </div>
                )}

                {responsibility.status === "delegated" && (
                  <div className="mt-4 rounded-lg border border-violet-400/20 bg-violet-400/[0.06] p-3 text-xs leading-5 text-violet-100">
                    <p className="font-semibold">Delegated to {assignedScout ? `${assignedScout.firstName} ${assignedScout.lastName}` : "your department"}</p>
                    <p className="mt-1 text-violet-100/80">Their actual report quality determines the outcome and remains in the track record.</p>
                  </div>
                )}

                {responsibility.status === "deferred" && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-100">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    This responsibility reopens next week. A second deferral fails it.
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {active.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-400">
            This week&apos;s portfolio is complete. Three new responsibilities arrive after advancement.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="flex flex-wrap gap-2">
            {recentOutcomes.map((responsibility) => (
              <span
                key={responsibility.id}
                className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400"
                title={responsibility.outcomeReason}
              >
                {responsibility.status === "succeeded"
                  ? <CheckCircle size={12} className="text-emerald-400" aria-hidden="true" />
                  : <AlertTriangle size={12} className="text-red-400" aria-hidden="true" />}
                {playerName(players, responsibility.playerId)}
                <Badge variant={statusVariant(responsibility.status)} className="text-[9px]">
                  {responsibility.status}
                </Badge>
              </span>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={onOpenNpcManagement}>
            Manage scouting team
            <ExternalLink size={14} className="ml-2" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
