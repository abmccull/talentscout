"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Compass,
  MoveRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardActionTarget, DashboardPriorityItem } from "./dashboardPriorityModel";
import type { DashboardWorkspaceModel } from "./dashboardWorkspaceModel";
import { DashboardOpportunityCard } from "./DashboardOpportunityCard";
import { DashboardPriorityCard } from "./DashboardPriorityCard";
import { WorkspaceDisclosure } from "../workspace/WorkspaceDisclosure";

const DashboardIntelligencePanel = dynamic(
  () => import("./DashboardIntelligencePanel"),
  { ssr: false },
);

interface DashboardCommandCenterProps {
  model: DashboardWorkspaceModel;
  onAction: (target: DashboardActionTarget) => void;
  onOpenPlanner: () => void;
  onMarkReviewed?: (item: DashboardPriorityItem) => void;
  onSnooze?: (item: DashboardPriorityItem) => void;
  onTogglePin?: (item: DashboardPriorityItem) => void;
  onDismiss?: (item: DashboardPriorityItem) => void;
  onDismissInsight?: (insightId: string, fingerprint?: string) => void;
}

interface CommandSummary {
  title: string;
  explanation: string;
  consequence?: string;
  actionLabel?: string;
  actionTarget?: DashboardActionTarget;
}

const ACTION_SCREEN_LABELS: Record<DashboardActionTarget["screen"], string> = {
  inbox: "Inbox",
  calendar: "Planner",
  reportWriter: "Report Writer",
  reportHistory: "Reports",
  playerProfile: "the player dossier",
  rivals: "Rivals",
  career: "Career",
  network: "Network",
  alumniDashboard: "Alumni",
  performance: "Performance",
  agency: "Agency",
  internationalView: "International",
  npcManagement: "Staff",
  youthScouting: "Youth Scouting",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function readString(value: unknown, key: string): string | undefined {
  const record = asRecord(value);
  const candidate = record?.[key];
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : undefined;
}

function readTarget(value: unknown, key: string): DashboardActionTarget | undefined {
  const record = asRecord(value);
  if (!record || !(key in record)) {
    return undefined;
  }
  return record[key] as DashboardActionTarget;
}

function toCommandSummary(value: unknown): CommandSummary | null {
  const title = readString(value, "title");
  const explanation = readString(value, "explanation");

  if (!title || !explanation) {
    return null;
  }

  return {
    title,
    explanation,
    consequence: readString(value, "consequence"),
    actionLabel: readString(value, "actionLabel"),
    actionTarget: readTarget(value, "actionTarget"),
  };
}

function getSectionItems(
  sectionItems: ReadonlyArray<DashboardPriorityItem>,
  visibleItems: ReadonlyArray<DashboardPriorityItem>,
  maxItems: number,
): DashboardPriorityItem[] {
  const sectionIds = new Set(sectionItems.slice(0, maxItems).map((item) => item.id));
  return visibleItems.filter((item) => sectionIds.has(item.id)).slice(0, maxItems);
}

export function DashboardCommandCenter({
  model,
  onAction,
  onOpenPlanner,
  onMarkReviewed,
  onSnooze,
  onTogglePin,
  onDismiss,
  onDismissInsight,
}: DashboardCommandCenterProps) {
  const [showIntelligence, setShowIntelligence] = useState(false);
  const visibleItems = model.visibleItems.slice(0, 5);
  const rankMap = new Map<string, number>(
    visibleItems.map((item: DashboardPriorityItem, index: number) => [item.id, index + 1]),
  );
  const topItem = visibleItems[0];
  const topItemId = topItem?.id;
  const attentionItems = getSectionItems(model.attention, visibleItems, 3);
  const opportunityItems = getSectionItems(model.opportunitiesAtRisk, visibleItems, 2);
  const featuredIsOpportunity = !!topItemId && opportunityItems.some((item) => item.id === topItemId);
  const featuredIsAttention = !!topItemId && attentionItems.some((item) => item.id === topItemId);
  const remainingAttentionItems = attentionItems
    .filter((item) => item.id !== topItemId)
    .slice(0, featuredIsAttention ? 2 : 3);
  const remainingOpportunityItems = opportunityItems
    .filter((item) => item.id !== topItemId)
    .slice(0, featuredIsOpportunity ? 1 : 2);
  const nextAction = toCommandSummary(model.nextAction) ?? toCommandSummary(topItem);

  return (
    <section
      aria-labelledby="dashboard-command-center-title"
      className="space-y-6"
      data-testid="dashboard-command-center"
    >
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Dashboard command center
        </p>
        <h2 id="dashboard-command-center-title" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          What matters now
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-zinc-300">
          The queue is capped to five ranked signals so attention, opportunity cost, and the next move are visible without recreating another screen.
        </p>
      </div>

      <div className="hidden gap-3 xl:grid xl:grid-cols-2">
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-200">
            What requires my attention?
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {attentionItems[0]?.title ?? "No urgent obligation is waiting."}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-200">
            What opportunity might I lose?
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {opportunityItems[0]?.title ?? "No major opportunity is slipping away."}
          </p>
        </div>
      </div>

      <div
        className="grid gap-2 rounded-2xl border border-white/10 bg-[#11161c]/95 p-3 xl:hidden"
        data-testid="dashboard-mobile-brief"
      >
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-200">
            Do next
          </p>
          <p className="mt-1 text-base font-semibold leading-6 text-white">
            {nextAction?.title ?? "Choose where the next week creates information."}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-300">
            {nextAction?.explanation ?? "The active queue is clear enough to plan the next observation."}
          </p>
          <Button
            type="button"
            className="mt-3 min-h-11 w-full bg-emerald-700 text-white hover:bg-emerald-600"
            onClick={() => {
              if (nextAction?.actionTarget) {
                onAction(nextAction.actionTarget);
                return;
              }
              onOpenPlanner();
            }}
          >
            {nextAction?.actionLabel ?? "Open planner"}
            <MoveRight size={15} className="ml-2" aria-hidden="true" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-200">Attention</p>
            <p className="mt-1 line-clamp-2 text-xs leading-4 text-zinc-200">
              {attentionItems[0]?.title ?? "Queue clear"}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.04] px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-200">At risk</p>
            <p className="mt-1 line-clamp-2 text-xs leading-4 text-zinc-200">
              {opportunityItems[0]?.title ?? "Nothing urgent"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
        <div className="space-y-4">
          {topItem && (
            <WorkspaceDisclosure
              tone="subtle"
              title="Open full priority brief"
              description="Review the evidence, consequence, and available handling actions."
              summary={<span>Rank 1</span>}
              responsiveOpenAt="xl"
              className="xl:overflow-visible xl:border-0 xl:bg-transparent xl:[&>summary]:hidden"
              contentClassName="!border-t-0 !p-0 xl:!block"
            >
              {featuredIsOpportunity ? (
                <DashboardOpportunityCard
                  item={topItem}
                  featured
                  orderIndex={1}
                  onAction={onAction}
                  onMarkReviewed={onMarkReviewed}
                  onSnooze={onSnooze}
                  onTogglePin={onTogglePin}
                  onDismiss={onDismiss}
                />
              ) : (
                <DashboardPriorityCard
                  item={topItem}
                  featured
                  orderIndex={1}
                  onAction={onAction}
                  onMarkReviewed={onMarkReviewed}
                  onSnooze={onSnooze}
                  onTogglePin={onTogglePin}
                  onDismiss={onDismiss}
                />
              )}
            </WorkspaceDisclosure>
          )}

          {(remainingAttentionItems.length > 0 || remainingOpportunityItems.length > 0) && (
          <div className="hidden gap-4 xl:grid xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
            {remainingAttentionItems.length > 0 && (
            <section aria-labelledby="dashboard-attention-title" className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-[#11161c]/95 p-5 shadow-2xl shadow-black/20">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                  What requires my attention?
                </p>
                <h3 id="dashboard-attention-title" className="mt-2 text-lg font-semibold text-white">
                  Requires your attention
                </h3>
                <p className="mt-2 text-xs leading-6 text-zinc-400 sm:text-sm">
                  Resolve the items that can block progress, create immediate fallout, or expire before the week can absorb them.
                </p>
              </div>

              <ol className="space-y-4">
                  {remainingAttentionItems.map((item) => {
                    const rank = rankMap.get(item.id) ?? 0;
                    return (
                      <li key={item.id} value={rank > 0 ? rank : undefined} className="list-none">
                        <DashboardPriorityCard
                          item={item}
                          orderIndex={rank > 0 ? rank : 1}
                          onAction={onAction}
                          onMarkReviewed={onMarkReviewed}
                          onSnooze={onSnooze}
                          onTogglePin={onTogglePin}
                          onDismiss={onDismiss}
                        />
                      </li>
                    );
                  })}
              </ol>
            </section>
            )}

            {remainingOpportunityItems.length > 0 && (
            <section aria-labelledby="dashboard-opportunities-title" className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-[#11161c]/95 p-5 shadow-2xl shadow-black/20">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  What opportunity might I lose?
                </p>
                <h3 id="dashboard-opportunities-title" className="mt-2 text-lg font-semibold text-white">
                  Opportunities at risk
                </h3>
                <p className="mt-2 text-xs leading-6 text-zinc-400 sm:text-sm">
                  These are time-sensitive chances where delay reduces leverage, access, evidence quality, or first-mover advantage.
                </p>
              </div>

              <ol className="space-y-4">
                  {remainingOpportunityItems.map((item) => {
                    const rank = rankMap.get(item.id) ?? 0;
                    return (
                      <li key={item.id} value={rank > 0 ? rank : undefined} className="list-none">
                        <DashboardOpportunityCard
                          item={item}
                          orderIndex={rank > 0 ? rank : 1}
                          onAction={onAction}
                          onMarkReviewed={onMarkReviewed}
                          onSnooze={onSnooze}
                          onTogglePin={onTogglePin}
                          onDismiss={onDismiss}
                        />
                      </li>
                    );
                  })}
              </ol>
            </section>
            )}
          </div>
          )}
        </div>

        <aside className="space-y-4">
          <Card
            data-testid="dashboard-next-action"
            className="hidden rounded-2xl border-emerald-300/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.16),transparent_38%),linear-gradient(135deg,rgba(14,24,22,0.98),rgba(10,14,17,0.98))] shadow-2xl shadow-black/20 xl:block"
          >
            <CardHeader className="p-5 pb-3 sm:p-6 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-white">
                <Compass size={18} className="text-emerald-200" aria-hidden="true" />
                What should I do next?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0">
              {nextAction ? (
                <>
                  <div>
                    <p className="text-lg font-semibold tracking-tight text-white">
                      {nextAction.actionLabel ?? "Open planner"}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-zinc-200 sm:text-sm">
                      {nextAction.actionTarget
                        ? `Continue in ${ACTION_SCREEN_LABELS[nextAction.actionTarget.screen]} to handle “${nextAction.title}” at its authoritative source.`
                        : nextAction.explanation}
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="min-h-11 w-full bg-emerald-700 text-white hover:bg-emerald-600"
                    onClick={() => {
                      if (nextAction.actionTarget) {
                        onAction(nextAction.actionTarget);
                        return;
                      }
                      onOpenPlanner();
                    }}
                  >
                    {nextAction.actionLabel ?? "Open planner"}
                    <MoveRight size={15} className="ml-2" aria-hidden="true" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4">
                    <p className="text-sm font-semibold text-white">
                      No immediate intervention is recommended.
                    </p>
                    <p className="mt-2 text-xs leading-6 text-zinc-300 sm:text-sm">
                      The active queue is clear enough that you can use the planner to choose where the next week should create information.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full border-emerald-300/25 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15"
                    onClick={onOpenPlanner}
                  >
                    Open planner
                    <ArrowRight size={15} className="ml-2" aria-hidden="true" />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card
            data-testid="dashboard-week-summary"
            className="rounded-2xl border-white/10 bg-[#11161c]/95 shadow-2xl shadow-black/20"
          >
            <CardHeader className="p-5 pb-3 sm:p-6 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-white">
                <CalendarDays size={18} className="text-sky-200" aria-hidden="true" />
                This week
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0">
              <div className="rounded-xl border border-sky-300/15 bg-sky-300/[0.06] p-4">
                <p className="text-sm font-semibold leading-6 text-white">
                  {model.weekSummary.headline}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100">
                  <ClipboardList size={14} aria-hidden="true" />
                  Planned work
                </p>
                <ul className="mt-2 space-y-2 text-xs leading-6 text-zinc-200 sm:text-sm">
                  <li>
                    {model.weekSummary.plannedObservationCount === 0
                      ? "No observation work is scheduled yet."
                      : `${model.weekSummary.plannedObservationCount} observation ${model.weekSummary.plannedObservationCount === 1 ? "block is" : "blocks are"} scheduled.`}
                  </li>
                  <li>
                    {model.weekSummary.plannedReportCount === 0
                      ? "No report work is scheduled yet."
                      : `${model.weekSummary.plannedReportCount} report ${model.weekSummary.plannedReportCount === 1 ? "session is" : "sessions are"} scheduled.`}
                  </li>
                  <li>{model.weekSummary.travelSummary}</li>
                </ul>
              </div>

              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full justify-between border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
                onClick={onOpenPlanner}
              >
                {model.weekSummary.actionLabel}
                <ArrowRight size={15} aria-hidden="true" />
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      {(model.careerThread || model.insights.length > 0 || model.recentlyResolved.length > 0) && (
        showIntelligence ? (
          <DashboardIntelligencePanel
            model={model}
            onAction={onAction}
            onDismissInsight={onDismissInsight}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full border-white/10 bg-white/[0.04]"
            onClick={() => setShowIntelligence(true)}
          >
            Open career intelligence
          </Button>
        )
      )}
    </section>
  );
}
