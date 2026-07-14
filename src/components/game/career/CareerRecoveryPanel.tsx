"use client";

import { AlertTriangle, ArrowRight, CheckCircle, Clock3, RotateCcw } from "lucide-react";

import type { GameState } from "@/engine/core/types";
import {
  getCareerRecoveryPlanOptions,
  type CareerSetbackKind,
  type CareerRecoveryPlanId,
} from "@/engine/career/recovery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface CareerRecoveryPanelProps {
  state: GameState;
  onChoose: (planId: CareerRecoveryPlanId) => void;
}

function setbackLabel(kind: CareerSetbackKind): string {
  if (kind === "warning") return "Formal performance plan";
  if (kind === "bankruptcy") return "Bankruptcy recovery";
  return "Career comeback";
}

export function CareerRecoveryPanel({ state, onChoose }: CareerRecoveryPanelProps) {
  const episode = state.careerRecovery?.current;
  if (!episode) return null;
  const options = getCareerRecoveryPlanOptions(state, episode);
  const selectedOption = options.find((option) => option.id === episode.planId);
  const terminal = episode.status === "completed" || episode.status === "failed";

  if (terminal) {
    const succeeded = episode.status === "completed";
    return (
      <Card
        data-testid="career-recovery-panel"
        className={succeeded
          ? "border-emerald-400/25 bg-emerald-400/[0.06]"
          : "border-red-400/25 bg-red-400/[0.06]"}
        aria-labelledby="career-recovery-outcome-title"
      >
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            {succeeded
              ? <CheckCircle className="mt-0.5 shrink-0 text-emerald-300" size={20} aria-hidden="true" />
              : <AlertTriangle className="mt-0.5 shrink-0 text-red-300" size={20} aria-hidden="true" />}
            <div>
              <p id="career-recovery-outcome-title" className="font-semibold text-white">
                {succeeded ? "Recovery completed" : "Recovery plan missed"}
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-300">{episode.outcomeSummary}</p>
            </div>
          </div>
          <Badge variant="outline" className={succeeded ? "border-emerald-400/30 text-emerald-200" : "border-red-400/30 text-red-200"}>
            {selectedOption?.label ?? setbackLabel(episode.kind)}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      data-testid="career-recovery-panel"
      className="border-amber-400/30 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.11),transparent_44%),rgba(24,20,13,0.96)]"
      aria-labelledby="career-recovery-title"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">
              {setbackLabel(episode.kind)}
            </p>
            <CardTitle id="career-recovery-title" className="mt-1 flex items-center gap-2 text-base text-white">
              <RotateCcw size={17} className="text-amber-300" aria-hidden="true" />
              {episode.status === "awaitingChoice" ? "Choose what your setback means" : selectedOption?.label}
            </CardTitle>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
              {episode.status === "awaitingChoice"
                ? "Each route consumes different work, carries a different deadline, and changes the level of any return opportunity. Ignoring the choice defaults to the slower step-back route."
                : selectedOption?.description}
            </p>
          </div>
          <Badge variant="outline" className="border-amber-400/30 text-amber-200">
            Previous Tier {episode.previousTier}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {episode.status === "awaitingChoice" ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {options.map((option) => (
              <div key={option.id} className="flex flex-col rounded-xl border border-white/10 bg-black/25 p-4">
                <p className="font-semibold text-white">{option.label}</p>
                <p className="mt-1 text-sm leading-5 text-zinc-400">{option.description}</p>
                <p className="mt-3 text-xs font-semibold text-amber-200">Target: {option.targetLabel}</p>
                <ul className="mt-3 flex-1 space-y-1 text-xs leading-5 text-zinc-300">
                  {option.tradeoffs.map((tradeoff) => (
                    <li key={tradeoff} className="flex gap-2">
                      <span className="text-amber-300" aria-hidden="true">&bull;</span>
                      <span>{tradeoff}</span>
                    </li>
                  ))}
                </ul>
                {!option.available && (
                  <p className="mt-3 text-xs leading-5 text-red-300" role="status">{option.unavailableReason}</p>
                )}
                <Button
                  type="button"
                  className="mt-4 min-h-11 w-full"
                  variant={option.id === "proveTheWork" ? "default" : "outline"}
                  disabled={!option.available}
                  onClick={() => onChoose(option.id)}
                >
                  Choose this route
                  <ArrowRight size={15} className="ml-2" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-zinc-200">Recovery progress</span>
                <span className="font-semibold text-amber-200" aria-live="polite">
                  {episode.progress}/{episode.target}
                </span>
              </div>
              <Progress
                value={episode.progress}
                max={Math.max(1, episode.target)}
                indicatorClassName="bg-amber-400"
              />
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                {selectedOption?.targetLabel}. Repeated work on the same player or contact cannot inflate progress.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 px-4 py-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-white">
                <Clock3 size={15} className="text-amber-300" aria-hidden="true" />
                Deadline S{episode.deadlineSeason} W{episode.deadlineWeek}
              </p>
              {(state.finances?.bankruptcyRecoveryCooldown ?? 0) > 0 && (
                <p className="mt-1 text-xs text-zinc-400">
                  Financial clearance: {state.finances?.bankruptcyRecoveryCooldown} weeks remaining
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
