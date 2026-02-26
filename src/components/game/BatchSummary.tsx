"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronUp,
  Calendar,
  TrendingUp,
  AlertTriangle,
  Users,
  FileText,
  Zap,
} from "lucide-react";
import { useState } from "react";
import type { BatchAdvanceResult } from "@/engine/core/types";

interface BatchSummaryProps {
  result: BatchAdvanceResult;
  onDismiss: () => void;
}

export function BatchSummary({ result, onDismiss }: BatchSummaryProps) {
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  const fatigueChange = result.endingFatigue - result.startingFatigue;
  const fatigueColor =
    result.endingFatigue >= 75
      ? "text-red-400"
      : result.endingFatigue >= 50
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-amber-400" />
            <CardTitle className="text-sm">
              Batch Advance Summary — {result.weeksAdvanced} Week
              {result.weeksAdvanced !== 1 ? "s" : ""}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Season transition warning */}
          {result.seasonTransitionOccurred && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle size={14} className="shrink-0" />
              A season transition occurred during batch advance. Check your inbox
              for performance reviews and job offers.
            </div>
          )}

          {/* Key stats grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between rounded-md border border-[#27272a] px-3 py-2">
              <span className="text-zinc-500">Fatigue</span>
              <span className={`font-semibold ${fatigueColor}`}>
                {Math.round(result.startingFatigue)} → {Math.round(result.endingFatigue)}
                <span className="ml-1 text-[10px]">
                  ({fatigueChange >= 0 ? "+" : ""}
                  {Math.round(fatigueChange)})
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[#27272a] px-3 py-2">
              <span className="text-zinc-500">Messages</span>
              <span className="font-semibold text-white">
                {result.totalNewMessages}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[#27272a] px-3 py-2">
              <span className="text-zinc-500">Observations</span>
              <span className="font-semibold text-blue-400">
                {result.totalObservationsGenerated}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[#27272a] px-3 py-2">
              <span className="text-zinc-500">Discoveries</span>
              <span className="font-semibold text-emerald-400">
                {result.totalPlayersDiscovered}
              </span>
            </div>
          </div>

          {/* Fatigue bar */}
          <div className="rounded-md border border-[#27272a] px-3 py-2">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-zinc-500">Final Fatigue</span>
              <span className={`font-semibold ${fatigueColor}`}>
                {Math.round(result.endingFatigue)}%
              </span>
            </div>
            <Progress
              value={result.endingFatigue}
              max={100}
              indicatorClassName={
                result.endingFatigue >= 75
                  ? "bg-red-500"
                  : result.endingFatigue >= 50
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }
            />
          </div>

          {/* XP gains */}
          {Object.keys(result.totalSkillXp).length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                Skill XP Gained
              </p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(result.totalSkillXp)
                  .filter(([, xp]) => xp > 0)
                  .map(([skill, xp]) => (
                    <Badge
                      key={skill}
                      variant="secondary"
                      className="text-[10px]"
                    >
                      {formatSkillName(skill)} +{xp}
                    </Badge>
                  ))}
              </div>
            </div>
          )}

          {Object.keys(result.totalAttributeXp).length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                Attribute XP Gained
              </p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(result.totalAttributeXp)
                  .filter(([, xp]) => xp > 0)
                  .map(([attr, xp]) => (
                    <Badge
                      key={attr}
                      variant="secondary"
                      className="text-[10px]"
                    >
                      {formatSkillName(attr)} +{xp}
                    </Badge>
                  ))}
              </div>
            </div>
          )}

          {/* Weekly breakdown — collapsible */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Weekly Breakdown
            </p>
            <div className="space-y-1">
              {result.weekSummaries.map((ws, index) => (
                <div
                  key={index}
                  className="rounded-md border border-[#27272a] overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedWeek(expandedWeek === index ? null : index)
                    }
                    className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-zinc-800/50 transition"
                  >
                    <div className="flex items-center gap-2">
                      <Calendar size={12} className="text-zinc-500" />
                      <span className="text-zinc-300">
                        Week {ws.week} — S{ws.season}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {ws.keyEvents.length > 0 && (
                        <span className="text-amber-400 text-[10px]">
                          {ws.keyEvents.length} event
                          {ws.keyEvents.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {ws.matchesAttended > 0 && (
                        <span className="flex items-center gap-0.5 text-blue-400">
                          <Users size={10} />
                          {ws.matchesAttended}
                        </span>
                      )}
                      {ws.reportsWritten > 0 && (
                        <span className="flex items-center gap-0.5 text-emerald-400">
                          <FileText size={10} />
                          {ws.reportsWritten}
                        </span>
                      )}
                      {expandedWeek === index ? (
                        <ChevronUp size={12} className="text-zinc-500" />
                      ) : (
                        <ChevronDown size={12} className="text-zinc-500" />
                      )}
                    </div>
                  </button>
                  {expandedWeek === index && (
                    <div className="border-t border-[#27272a] px-3 py-2 space-y-1">
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div>
                          <span className="text-zinc-500">Fatigue: </span>
                          <span
                            className={
                              ws.fatigueChange >= 0
                                ? "text-red-400"
                                : "text-emerald-400"
                            }
                          >
                            {ws.fatigueChange >= 0 ? "+" : ""}
                            {ws.fatigueChange}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Matches: </span>
                          <span className="text-white">
                            {ws.matchesAttended}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Meetings: </span>
                          <span className="text-white">{ws.meetingsHeld}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Reports: </span>
                          <span className="text-white">
                            {ws.reportsWritten}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Messages: </span>
                          <span className="text-white">{ws.newMessages}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Obs: </span>
                          <span className="text-blue-400">
                            {ws.observationsGenerated}
                          </span>
                        </div>
                      </div>
                      {ws.keyEvents.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {ws.keyEvents.map((event, ei) => (
                            <div
                              key={ei}
                              className="flex items-center gap-1 text-[10px] text-amber-400"
                            >
                              <TrendingUp size={10} className="shrink-0" />
                              {event}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Button className="w-full" onClick={onDismiss}>
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Convert camelCase skill/attribute names to readable form.
 */
function formatSkillName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
