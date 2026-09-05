"use client";

import { ClubCrest } from "@/components/game/ClubCrest";
import { GameLayout } from "@/components/game/GameLayout";
import { ScoutAvatar } from "@/components/game/ScoutAvatar";
import CareerEraThread from "@/components/game/workspace/CareerEraThread";
import { YouthActiveCaseBoard } from "@/components/game/workspace/desk/YouthActiveCaseBoard";
import type { GameState } from "@/engine/core/types";
import { isYouthFirstHour } from "@/lib/youthFirstHour";
import { DashboardCommandCenter } from "./DashboardCommandCenter";
import type { DashboardActionTarget } from "./dashboardPriorityModel";
import type { DashboardPriorityItem } from "./dashboardPriorityModel";
import { getYouthDeskRepresentedObjectiveKey, type DashboardWorkspaceModel } from "./dashboardWorkspaceModel";
import type {
  DashboardCareerEra,
  DashboardSetScreen,
  DashboardYouthActionModel,
  DashboardYouthDeskAction,
  DashboardYouthDeskStakes,
} from "./types";

interface YouthDeskDashboardProps {
  gameState: GameState;
  scout: GameState["scout"];
  currentWeek: number;
  currentSeason: number;
  seasonLength: number;
  phaseBadgeClassName: string;
  phaseLabel: string;
  scheduledSlots: number;
  youthDeskAction: DashboardYouthDeskAction;
  activeCaseModel: DashboardYouthActionModel;
  currentCareerEra?: DashboardCareerEra;
  dashboardWorkspace: DashboardWorkspaceModel | null;
  onDashboardAction: (target: DashboardActionTarget) => void;
  onMarkReviewed: (item: DashboardPriorityItem) => void;
  onSnooze: (item: DashboardPriorityItem) => void;
  onTogglePin: (item: DashboardPriorityItem) => void;
  onDismiss: (item: DashboardPriorityItem) => void;
  onDismissInsight: (insightId: string, fingerprint?: string) => void;
  onPrimaryAction: () => void;
  setScreen: DashboardSetScreen;
  selectPlayer: (playerId: string) => void;
  stakes?: DashboardYouthDeskStakes;
}

export function YouthDeskDashboard({
  gameState,
  scout,
  currentWeek,
  currentSeason,
  seasonLength,
  phaseBadgeClassName,
  phaseLabel,
  scheduledSlots,
  youthDeskAction,
  activeCaseModel,
  currentCareerEra,
  dashboardWorkspace,
  onDashboardAction,
  onMarkReviewed,
  onSnooze,
  onTogglePin,
  onDismiss,
  onDismissInsight,
  onPrimaryAction,
  setScreen,
  selectPlayer,
  stakes,
}: YouthDeskDashboardProps) {
  const club = scout.currentClubId ? gameState.clubs[scout.currentClubId] : undefined;
  const firstHour = isYouthFirstHour(gameState);
  const representedObjectiveKey = getYouthDeskRepresentedObjectiveKey(
    youthDeskAction.kind, currentSeason, currentWeek,
  );

  return (
    <GameLayout>
      <section
        className="game-workspace relative min-h-screen overflow-hidden"
        data-tutorial-id="dashboard-overview"
      >
        <div className="relative z-10 mx-auto max-w-[1480px]">
          <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-3" data-tutorial-id="dashboard-club-header">
              <ScoutAvatar avatarId={scout.avatarId ?? 1} size={48} />
              {club && <ClubCrest clubId={club.id} clubName={club.name} size={48} />}
              <div className="min-w-0">
                <p className="dossier-eyebrow mb-1">
                  Youth recruitment room
                </p>
                <h1 className="dossier-title">
                  The scouting desk
                </h1>
                <p className="mt-1 text-sm text-zinc-300">
                  {club?.name ?? "Independent assignment"} · Week {currentWeek}, Season {currentSeason}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2" data-testid="desk-week-status">
              <span className={`inline-flex min-h-9 items-center rounded border-0 px-3 text-xs font-semibold ${phaseBadgeClassName}`}>
                {phaseLabel}
              </span>
              <span className="inline-flex min-h-9 items-center rounded bg-transparent px-3 text-xs font-semibold text-zinc-200">
                Week {currentWeek} of {seasonLength}
              </span>
              <span
                aria-label={`${Math.round(scout.fatigue)} percent fatigue`}
                className={`inline-flex min-h-9 items-center rounded border-0 px-3 text-xs font-semibold ${
                  scout.fatigue >= 70
                    ? "border-red-400/30 bg-red-400/10 text-red-200"
                    : scout.fatigue >= 40
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                      : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                }`}
              >
                {Math.round(scout.fatigue)}% fatigue
              </span>
            </div>
          </header>

          <section aria-labelledby="dashboard-active-case-title" className="mt-7 border-t border-[var(--border)] pt-5">
            <div className="mb-3">

              <h2 id="dashboard-active-case-title" className="dossier-eyebrow">
                Active case
              </h2>

            </div>
            <YouthActiveCaseBoard
              model={activeCaseModel}
              eyebrow={youthDeskAction.eyebrow}
              ctaLabel={youthDeskAction.label}
              scheduledSlots={scheduledSlots}
              onPrimaryAction={onPrimaryAction}
              onSecondaryAction={
                youthDeskAction.kind === "planner"
                  ? undefined
                  : () => setScreen("calendar")
              }
              secondaryLabel={
                youthDeskAction.kind === "planner" ? undefined : "Review itinerary"
              }
              asideContent={
                !firstHour && currentCareerEra ? (
                  <CareerEraThread
                    variant="desk"
                    era={currentCareerEra}
                    onOpenProspect={(playerId) => {
                      selectPlayer(playerId);
                      setScreen("playerProfile");
                    }}
                    onOpenWorld={() => setScreen("internationalView")}
                  />
                ) : undefined
              }
            />
          </section>

          {!firstHour && dashboardWorkspace && (
            <DashboardCommandCenter
              model={dashboardWorkspace}
              representedObjectiveKey={representedObjectiveKey}
              onAction={onDashboardAction}
              onOpenPlanner={() => setScreen("calendar")}
              onMarkReviewed={onMarkReviewed}
              onSnooze={onSnooze}
              onTogglePin={onTogglePin}
              onDismiss={onDismiss}
              onDismissInsight={onDismissInsight}
            />
          )}

          {stakes?.visible && (
            <section aria-labelledby="dashboard-stakes-title" className="mt-6" data-testid="youth-desk-stakes">
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Live with it
                </p>
                <h2 id="dashboard-stakes-title" className="mt-1 text-xl font-semibold text-white">
                  Your people, your files
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">
                  {stakes.reputationLine}
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="space-y-2">
                  {stakes.alumni.length === 0 ? (
                    <p className="rounded-md border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-400">
                      No alumni on the board yet. The first accepted placement becomes a name you live with.
                    </p>
                  ) : stakes.alumni.map((item) => (
                    <button
                      key={item.playerId}
                      type="button"
                      onClick={() => {
                        selectPlayer(item.playerId);
                        setScreen("playerProfile");
                      }}
                      className="flex min-h-11 w-full items-start justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-4 py-3 text-left transition hover:border-amber-400/30"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-white">{item.name}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-zinc-400">{item.lastLine}</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
                        {item.statusLabel}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="rounded-md border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">This file</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">{stakes.fileMoneyLabel}</p>
                </div>
              </div>
            </section>
          )}
        </div>
      </section>
    </GameLayout>
  );
}
