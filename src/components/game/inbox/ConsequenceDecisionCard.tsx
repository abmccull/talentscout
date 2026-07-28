"use client";

import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DecisionRecord } from "@/engine/consequences";

import { buildConsequenceDecisionCardModel } from "./consequenceDecisionCardModel";

interface ConsequenceDecisionCardProps {
  decision: DecisionRecord;
  currentWeek: number;
  currentSeason: number;
  seasonLength: number;
  onChoice: (optionId: string) => void;
}

export function ConsequenceDecisionCard({
  decision,
  currentWeek,
  currentSeason,
  seasonLength,
  onChoice,
}: ConsequenceDecisionCardProps) {
  const model = buildConsequenceDecisionCardModel({
    decision,
    currentWeek,
    currentSeason,
    seasonLength,
  });

  return (
    <article className="rounded-lg border border-amber-500/35 bg-amber-500/[0.06] p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
            {model.decisionKindLabel}
          </p>
          <h3 className="mt-1 font-semibold text-white">{model.title}</h3>
        </div>
        <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-300">
          {model.weeksRemaining === 0 ? "Due now" : `${model.weeksRemaining}w remaining`}
        </Badge>
      </div>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-zinc-300">{model.premise}</p>
      {model.quietInterventionReason && (
        <div
          className="mb-4 rounded-md border border-amber-400/25 bg-zinc-950/40 p-3"
          aria-label="Scouting case context"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 text-amber-300" aria-hidden="true" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                Why this surfaced now
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                {model.quietInterventionReason}
              </p>
            </div>
          </div>
        </div>
      )}
      <div
        className="grid gap-2 md:grid-cols-2 xl:grid-cols-3"
        role="list"
        aria-label={`Choices for ${model.title}`}
      >
        {decision.options.map((option) => (
          <div
            key={option.id}
            role="listitem"
            className="flex flex-col rounded-md border border-zinc-700 bg-zinc-950/70 p-3"
          >
            <p className="text-sm font-medium text-white">{option.label}</p>
            {option.knownTradeoffs.length > 0 && (
              <ul className="my-2 flex-1 space-y-1 text-xs leading-relaxed text-zinc-400">
                {option.knownTradeoffs.map((tradeoff) => (
                  <li key={tradeoff} className="flex gap-1.5">
                    <span aria-hidden="true" className="text-amber-500">•</span>
                    <span>{tradeoff}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button
              size="sm"
              variant="outline"
              className="mt-2 min-h-10 w-full border-amber-500/35 text-xs hover:border-amber-400"
              onClick={() => onChoice(option.id)}
            >
              Choose: {option.label}
            </Button>
          </div>
        ))}
      </div>
    </article>
  );
}
