"use client";

import { ClubCrest } from "@/components/game/ClubCrest";
import { GameLayout } from "@/components/game/GameLayout";
import { ScoutAvatar } from "@/components/game/ScoutAvatar";
import CareerEraThread from "@/components/game/workspace/CareerEraThread";
import { YouthActiveCaseBoard } from "@/components/game/workspace/desk/YouthActiveCaseBoard";
import { ScreenBackground } from "@/components/ui/screen-background";
import type { GameState } from "@/engine/core/types";
import { isYouthFirstHour } from "@/lib/youthFirstHour";
import { DashboardCommandCenter } from "./DashboardCommandCenter";
import type { DashboardActionTarget } from "./dashboardPriorityModel";
import type { DashboardPriorityItem } from "./dashboardPriorityModel";
import type { DashboardWorkspaceModel } from "./dashboardWorkspaceModel";
import type {
  DashboardCareerEra,
  DashboardSetScreen,
  DashboardYouthActionModel,
  DashboardYouthDeskAction,
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
}: YouthDeskDashboardProps) {
  const club = scout.currentClubId ? gameState.clubs[scout.currentClubId] : undefined;
  const firstHour = isYouthFirstHour(gameState);

  return (
    <GameLayout>
      <section
        className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-7"
        data-tutorial-id="dashboard-overview"
      >
        <ScreenBackground src="/images/backgrounds/dashboard-office.png" opacity={0.95} />
        <div className="relative z-10 mx-auto max-w-[1480px]">
          <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-3" data-tutorial-id="dashboard-club-header">
              <ScoutAvatar avatarId={scout.avatarId ?? 1} size={48} />
              {club && <ClubCrest clubId={club.id} clubName={club.name} size={48} />}
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Youth recruitment room
                </p>
                <h1 className="truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Scouting Desk
                </h1>
                <p className="mt-1 text-sm text-zinc-300">
                  {club?.name ?? "Independent assignment"} · Week {currentWeek}, Season {currentSeason}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2" data-testid="desk-week-status">
              <span className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${phaseBadgeClassName}`}>
                {phaseLabel}
              </span>
              <span className="inline-flex min-h-9 items-center rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200">
                Week {currentWeek} of {seasonLength}
              </span>
              <span
                aria-label={`${Math.round(scout.fatigue)} percent fatigue`}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${
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

          {!firstHour && dashboardWorkspace && (
            <DashboardCommandCenter
              model={dashboardWorkspace}
              onAction={onDashboardAction}
              onOpenPlanner={() => setScreen("calendar")}
              onMarkReviewed={onMarkReviewed}
              onSnooze={onSnooze}
              onTogglePin={onTogglePin}
              onDismiss={onDismiss}
              onDismissInsight={onDismissInsight}
            />
          )}

          <section aria-labelledby="dashboard-active-case-title" className={firstHour ? "" : "mt-8"}>
            {!firstHour && (
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Scouting context
                </p>
                <h2 id="dashboard-active-case-title" className="mt-1 text-xl font-semibold text-white">
                  Active case
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">
                  Use this case board after the priority queue tells you where attention belongs.
                </p>
              </div>
            )}
            {firstHour && (
              <h2 id="dashboard-active-case-title" className="sr-only">
                Next move
              </h2>
            )}
            <YouthActiveCaseBoard
              model={activeCaseModel}
              eyebrow={youthDeskAction.eyebrow}
              ctaLabel={youthDeskAction.label}
              scheduledSlots={scheduledSlots}
              onPrimaryAction={onPrimaryAction}
              onSecondaryAction={
                firstHour || youthDeskAction.kind === "planner"
                  ? undefined
                  : () => setScreen("calendar")
              }
              secondaryLabel={
                firstHour || youthDeskAction.kind === "planner" ? undefined : "Review itinerary"
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
        </div>
      </section>
    </GameLayout>
  );
}
