"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type {
  BoardMeetingApproach,
  BoardProfile,
  ManagerMeetingApproach,
  ManagerProfile,
  Scout,
} from "@/engine/core/types";
import {
  BOARD_MEETING_APPROACHES,
  MANAGER_MEETING_APPROACHES,
  type PoliticalMeetingEligibility,
} from "@/engine/career/politicalMeetings";
import { CheckCircle, Shield, UserCheck } from "lucide-react";

export interface PoliticalMeetingCardsProps {
  scout: Scout;
  managerProfile?: ManagerProfile;
  boardProfile?: BoardProfile;
  managerApproach: ManagerMeetingApproach;
  boardApproach: BoardMeetingApproach;
  managerEligibility: PoliticalMeetingEligibility | null;
  boardEligibility: PoliticalMeetingEligibility | null;
  onManagerApproachChange: (approach: ManagerMeetingApproach) => void;
  onBoardApproachChange: (approach: BoardMeetingApproach) => void;
  onMeetManager: () => void;
  onMeetBoard: () => void;
}

/** Shared presentation for the authoritative manager and board meeting engines. */
export function PoliticalMeetingCards({
  scout,
  managerProfile,
  boardProfile,
  managerApproach,
  boardApproach,
  managerEligibility,
  boardEligibility,
  onManagerApproachChange,
  onBoardApproachChange,
  onMeetManager,
  onMeetBoard,
}: PoliticalMeetingCardsProps) {
  return (
    <>
      {scout.careerTier >= 4 && scout.managerRelationship && (
        <Card data-testid="manager-political-meeting">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserCheck size={14} aria-hidden="true" />
              Manager Relationship
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium text-white">
              {scout.managerRelationship.managerName}
            </p>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Trust</span>
                <span className="font-semibold text-blue-300">
                  {Math.round(scout.managerRelationship.trust)}/100
                </span>
              </div>
              <Progress
                value={scout.managerRelationship.trust}
                max={100}
                indicatorClassName="bg-blue-500"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Influence</span>
                <span className="font-semibold text-purple-300">
                  {Math.round(scout.managerRelationship.influence)}/100
                </span>
              </div>
              <Progress
                value={scout.managerRelationship.influence}
                max={100}
                indicatorClassName="bg-purple-500"
              />
            </div>
            <div className="rounded-md border border-[#3f3f46] bg-zinc-950/40 px-3 py-2 text-xs">
              <span className="text-zinc-400">Preferred style</span>
              <p className="mt-0.5 font-medium text-zinc-200">
                {(managerProfile?.preference ?? scout.managerRelationship.scoutingPreference)
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (character) => character.toUpperCase())}
              </p>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-zinc-300">
                Meeting approach
              </legend>
              {MANAGER_MEETING_APPROACHES.map((approach) => (
                <label
                  key={approach.id}
                  className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors ${
                    managerApproach === approach.id
                      ? "border-blue-400/70 bg-blue-500/10"
                      : "border-[#3f3f46] hover:border-zinc-500"
                  }`}
                >
                  <input
                    type="radio"
                    name="manager-meeting-approach"
                    value={approach.id}
                    checked={managerApproach === approach.id}
                    onChange={() => onManagerApproachChange(approach.id)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-zinc-100">
                      {approach.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-400">
                      {approach.tradeoff}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 w-full disabled:border-zinc-600 disabled:bg-zinc-900 disabled:text-zinc-400 disabled:opacity-100"
              disabled={!managerEligibility?.eligible}
              onClick={onMeetManager}
            >
              Meet Manager · {managerEligibility?.fatigueCost ?? 4} fatigue
            </Button>
            {!managerEligibility?.eligible && managerEligibility?.reason && (
              <p className="text-xs text-amber-300" role="status">
                {managerEligibility.reason}
              </p>
            )}
            {scout.managerRelationship.lastMeetingOutcome && (
              <div
                className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2"
                aria-live="polite"
                data-testid="manager-meeting-outcome"
              >
                <p className="text-xs font-semibold text-blue-300">Last meeting</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                  {scout.managerRelationship.lastMeetingOutcome.summary}
                </p>
                {scout.managerRelationship.lastMeetingOutcome.memoryReason && (
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                    {scout.managerRelationship.lastMeetingOutcome.memoryReason}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {scout.careerTier >= 5 && (
        <Card data-testid="board-political-meeting">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield size={14} className="text-indigo-300" aria-hidden="true" />
              Board Relations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {boardProfile && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Board Satisfaction</span>
                  <span
                    className={`font-semibold ${
                      boardProfile.satisfactionLevel >= 70
                        ? "text-emerald-300"
                        : boardProfile.satisfactionLevel >= 40
                          ? "text-amber-300"
                          : "text-red-300"
                    }`}
                  >
                    {Math.round(boardProfile.satisfactionLevel)}/100
                  </span>
                </div>
                <Progress
                  value={boardProfile.satisfactionLevel}
                  max={100}
                  indicatorClassName={
                    boardProfile.satisfactionLevel >= 70
                      ? "bg-emerald-500"
                      : boardProfile.satisfactionLevel >= 40
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }
                />
              </div>
            )}

            {scout.boardDirectives.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Active Directives
                </p>
                <div className="space-y-1.5">
                  {scout.boardDirectives.map((directive) => (
                    <div
                      key={directive.id}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                        directive.completed
                          ? "border-emerald-500/20 bg-emerald-500/5"
                          : "border-[#3f3f46]"
                      }`}
                    >
                      <span className={directive.completed ? "text-emerald-300" : "text-zinc-300"}>
                        {directive.description}
                      </span>
                      {directive.completed ? (
                        <CheckCircle size={12} className="shrink-0 text-emerald-300" aria-hidden="true" />
                      ) : (
                        <span className="shrink-0 text-zinc-400">S{directive.deadline}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {boardProfile && (
              <div className="rounded-md border border-[#3f3f46] bg-zinc-950/40 px-3 py-2 text-xs">
                <span className="text-zinc-400">Board personality</span>
                <p className="mt-0.5 font-medium capitalize text-zinc-200">
                  {boardProfile.personality}
                </p>
              </div>
            )}
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-zinc-300">Board approach</legend>
              {BOARD_MEETING_APPROACHES.map((approach) => (
                <label
                  key={approach.id}
                  className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors ${
                    boardApproach === approach.id
                      ? "border-indigo-400/70 bg-indigo-500/10"
                      : "border-[#3f3f46] hover:border-zinc-500"
                  }`}
                >
                  <input
                    type="radio"
                    name="board-meeting-approach"
                    value={approach.id}
                    checked={boardApproach === approach.id}
                    onChange={() => onBoardApproachChange(approach.id)}
                    className="mt-0.5 accent-indigo-500"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-zinc-100">{approach.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-400">
                      {approach.tradeoff}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 w-full disabled:border-zinc-600 disabled:bg-zinc-900 disabled:text-zinc-400 disabled:opacity-100"
              disabled={!boardEligibility?.eligible}
              onClick={onMeetBoard}
            >
              <Shield size={14} className="mr-2" aria-hidden="true" />
              Meet Board · {boardEligibility?.fatigueCost ?? 8} fatigue
            </Button>
            {!boardEligibility?.eligible && boardEligibility?.reason && (
              <p className="text-xs text-amber-300" role="status">
                {boardEligibility.reason}
              </p>
            )}
            {boardProfile?.lastMeetingOutcome && (
              <p
                className="rounded-md border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-xs leading-relaxed text-zinc-300"
                aria-live="polite"
                data-testid="board-meeting-outcome"
              >
                {boardProfile.lastMeetingOutcome.summary}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
