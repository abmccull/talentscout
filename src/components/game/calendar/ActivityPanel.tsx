"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Activity, League, Specialization } from "@/engine/core/types";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_CONFIG,
  SPECIALIZATION_THEMES,
  type ActivityCategory,
} from "@/engine/core/activityMetadata";
import { ActivityCard } from "./ActivityCard";

interface ActivityPanelProps {
  activities: Activity[];
  specialization: Specialization;
  canScheduleAt: (activity: Activity, dayIndex: number) => boolean;
  onSchedule: (activity: Activity, dayIndex: number) => void;
  leagueFilter: string;
  allLeagues: League[];
  fixtureLeagueById: Record<string, string>;
  onLeagueFilterChange: (leagueId: string) => void;
  resolveClubName: (id: string) => string;
  highlightTargetId?: string;
  selectedActivity?: Activity | null;
  onSelectActivity?: (activity: Activity | null) => void;
  openDayCount: number;
}

const CATEGORY_HELP: Record<ActivityCategory, string> = {
  scouting: "Where you gather evidence and decide who deserves the next look.",
  networking: "Private intel, background context, and future access to better leads.",
  recovery: "Protect your judgment, travel cleanly, and improve your own craft.",
};

function activityPlanningKey(activity: Activity): string {
  return activity.instanceId ?? [
    activity.type,
    activity.targetId ?? "none",
    activity.destinationClubId ?? "none",
    activity.slots,
    activity.description,
    activity.targetPool?.map((target) => target.id).join(",") ?? "none",
  ].join(":");
}

export function ActivityPanel({
  activities,
  specialization,
  canScheduleAt,
  onSchedule,
  leagueFilter,
  allLeagues,
  fixtureLeagueById,
  onLeagueFilterChange,
  resolveClubName,
  highlightTargetId,
  selectedActivity,
  onSelectActivity,
  openDayCount,
}: ActivityPanelProps) {
  const theme = SPECIALIZATION_THEMES[specialization];
  const [activeCategory, setActiveCategory] = useState<ActivityCategory>("scouting");

  const enrichedActivities = useMemo(() => {
    return activities.map((activity) => {
      if (activity.type !== "attendMatch" || !activity.description) return activity;

      const match = activity.description.match(/^Attend match: (.+?) vs (.+)$/);
      if (!match) return activity;

      const homeName = resolveClubName(match[1]) || match[1];
      const awayName = resolveClubName(match[2]) || match[2];
      return { ...activity, description: `${homeName} vs ${awayName}` };
    });
  }, [activities, resolveClubName]);

  const availableMatchLeagues = useMemo(() => {
    const leagueIds = new Set<string>();

    for (const activity of enrichedActivities) {
      if (activity.type !== "attendMatch") continue;
      const leagueId = activity.targetId ? fixtureLeagueById[activity.targetId] : undefined;
      if (leagueId) leagueIds.add(leagueId);
    }

    return allLeagues.filter((league) => leagueIds.has(league.id));
  }, [allLeagues, enrichedActivities, fixtureLeagueById]);

  const hasActiveLeagueFilter =
    leagueFilter !== "all" &&
    availableMatchLeagues.some((league) => league.id === leagueFilter);

  const grouped = useMemo(() => {
    const groups: Record<ActivityCategory, Activity[]> = {
      scouting: [],
      networking: [],
      recovery: [],
    };

    for (const activity of enrichedActivities) {
      const category = ACTIVITY_CATEGORIES[activity.type] ?? "scouting";

      if (activity.type === "attendMatch" && hasActiveLeagueFilter) {
        const fixtureLeagueId = activity.targetId
          ? fixtureLeagueById[activity.targetId]
          : undefined;

        if (!fixtureLeagueId || fixtureLeagueId !== leagueFilter) {
          continue;
        }
      }

      groups[category].push(activity);
    }

    return groups;
  }, [enrichedActivities, fixtureLeagueById, hasActiveLeagueFilter, leagueFilter]);

  const sortedGrouped = useMemo(() => {
    if (!highlightTargetId) return grouped;

    const result = { ...grouped };

    const matchesHighlight = (activity: Activity) =>
      activity.targetId === highlightTargetId ||
      activity.targetPool?.some((target) => target.id === highlightTargetId) === true;

    for (const category of Object.keys(result) as ActivityCategory[]) {
      result[category] = [...result[category]].sort((a, b) => {
        const aMatch = matchesHighlight(a) ? 0 : 1;
        const bMatch = matchesHighlight(b) ? 0 : 1;
        return aMatch - bMatch;
      });
    }

    return result;
  }, [grouped, highlightTargetId]);

  const sortedCategories = useMemo(() => {
    return (Object.keys(ACTIVITY_CATEGORY_CONFIG) as ActivityCategory[])
      .sort(
        (a, b) => ACTIVITY_CATEGORY_CONFIG[a].order - ACTIVITY_CATEGORY_CONFIG[b].order,
      )
      .filter((category) => sortedGrouped[category].length > 0);
  }, [sortedGrouped]);

  useEffect(() => {
    if (sortedCategories.includes(activeCategory)) return;
    setActiveCategory(sortedCategories[0] ?? "scouting");
  }, [activeCategory, sortedCategories]);

  useEffect(() => {
    if (!selectedActivity) return;
    setActiveCategory(ACTIVITY_CATEGORIES[selectedActivity.type] ?? "scouting");
  }, [selectedActivity]);

  const selectedActivityKey = selectedActivity
    ? activityPlanningKey(selectedActivity)
    : null;
  const activeActivities = sortedGrouped[activeCategory] ?? [];
  const activeConfig = ACTIVITY_CATEGORY_CONFIG[activeCategory];
  const activeLabel = activeConfig.specLabel?.[specialization] ?? activeConfig.label;

  return (
    <Card className="border-[#2a2a2f] bg-[#111111]/95 shadow-2xl shadow-black/20">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg text-white">Opportunity Board</CardTitle>
              <Badge variant="secondary" className="border-white/10 bg-white/5 text-zinc-200">
                {activities.length} live
              </Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Compare the cost, choose one opportunity, then commit it to the sticky itinerary.
            </p>
          </div>
          <div
            className={`inline-flex min-h-9 items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-medium ${theme.bgClass} ${theme.textClass} ${theme.borderClass}`}
          >
            {theme.label}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Opportunity categories"
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
        >
          {sortedCategories.map((category) => {
            const config = ACTIVITY_CATEGORY_CONFIG[category];
            const label = config.specLabel?.[specialization] ?? config.label;
            const selected = category === activeCategory;
            return (
              <button
                key={category}
                id={`opportunity-tab-${category}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="opportunity-category-panel"
                onClick={() => setActiveCategory(category)}
                className={`min-h-11 shrink-0 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                  selected
                    ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
                    : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5"
                }`}
              >
                {label} <span className="ml-1 text-xs opacity-70">{sortedGrouped[category].length}</span>
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="pt-1">
        <section
          id="opportunity-category-panel"
          role="tabpanel"
          aria-labelledby={`opportunity-tab-${activeCategory}`}
        >
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-200">
                {activeLabel}
              </h3>
              <p className="mt-1 text-sm text-zinc-400">{CATEGORY_HELP[activeCategory]}</p>
            </div>

            {activeCategory === "scouting" && availableMatchLeagues.length > 1 && (
              <label className="flex min-w-48 flex-col gap-1 text-xs font-medium text-zinc-400">
                Match League
                <select
                  value={hasActiveLeagueFilter ? leagueFilter : "all"}
                  onChange={(event) => onLeagueFilterChange(event.target.value)}
                  className="min-h-11 rounded-lg border border-[#2a2a2f] bg-[#0d0d0f] px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-500/40"
                >
                  <option value="all">All Leagues</option>
                  {availableMatchLeagues.map((league) => (
                    <option key={league.id} value={league.id}>
                      {league.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="space-y-2">
            {activeActivities.map((activity) => {
              const key = activityPlanningKey(activity);
              return (
                <ActivityCard
                  key={key}
                  activity={activity}
                  canScheduleAt={canScheduleAt}
                  onSchedule={onSchedule}
                  highlighted={
                    !!highlightTargetId &&
                    (activity.targetId === highlightTargetId ||
                      activity.targetPool?.some((target) => target.id === highlightTargetId) === true)
                  }
                  isSelected={selectedActivityKey === key}
                  onSelect={onSelectActivity}
                  openDayCount={openDayCount}
                />
              );
            })}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
