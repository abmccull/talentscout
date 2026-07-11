"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Activity, League, Specialization } from "@/engine/core/types";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_CONFIG,
  SPECIALIZATION_THEMES,
  type ActivityCategory,
} from "@/engine/core/activityMetadata";
import { ActivityCard, ACTIVITY_DISPLAY } from "./ActivityCard";

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
}

const CATEGORY_HELP: Record<ActivityCategory, string> = {
  scouting: "Where you gather evidence and decide who deserves the next look.",
  networking: "Private intel, background context, and future access to better leads.",
  recovery: "Protect your judgment, travel cleanly, and improve your own craft.",
};

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
}: ActivityPanelProps) {
  const theme = SPECIALIZATION_THEMES[specialization];

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

  return (
    <Card className="border-[#2a2a2f] bg-[#111111]/95 shadow-2xl shadow-black/20">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl text-white">Opportunity Board</CardTitle>
              <Badge variant="secondary" className="border-white/10 bg-white/5 text-zinc-200">
                {activities.length} live options
              </Badge>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-zinc-300">
              Select an opportunity, then place it in the itinerary. Venue and tournament
              context stays here so planning decisions happen in one workspace.
            </p>
          </div>
          <div
            className={`inline-flex min-h-11 items-center gap-2 self-start rounded-full border px-4 py-2 text-sm font-medium ${theme.bgClass} ${theme.textClass} ${theme.borderClass}`}
          >
            {theme.label}
          </div>
        </div>

        {selectedActivity && (
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/70">
                  Ready To Place
                </p>
                <p className="mt-1 text-base font-semibold text-blue-50">
                  {ACTIVITY_DISPLAY[selectedActivity.type]?.label ?? "Selected activity"}
                </p>
                <p className="mt-1 text-sm text-blue-100/80">
                  Pick an open day in the itinerary below to lock this into the week.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectActivity?.(null)}
                className="min-h-11 rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 text-sm font-semibold text-blue-50 transition hover:bg-blue-500/20"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {sortedCategories.map((category) => {
          const config = ACTIVITY_CATEGORY_CONFIG[category];
          const sectionActivities = sortedGrouped[category];
          const sectionLabel = config.specLabel?.[specialization] ?? config.label;

          return (
            <section key={category} className="space-y-4 border-t border-white/6 pt-5 first:border-t-0 first:pt-0">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-200">
                      {sectionLabel}
                    </h3>
                    <Badge variant="outline" className="border-white/10 bg-white/5 text-xs text-zinc-300">
                      {sectionActivities.length}
                    </Badge>
                  </div>
                  <p className="text-sm text-zinc-400">{CATEGORY_HELP[category]}</p>
                </div>

                {category === "scouting" && availableMatchLeagues.length > 1 && (
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
                    Match League
                    <select
                      value={hasActiveLeagueFilter ? leagueFilter : "all"}
                      onChange={(e) => onLeagueFilterChange(e.target.value)}
                      className="min-h-11 rounded-xl border border-[#2a2a2f] bg-[#0d0d0f] px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-500/40"
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

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {sectionActivities.map((activity, index) => (
                  <ActivityCard
                    key={`${activity.instanceId ?? activity.type}-${activity.targetId ?? "none"}-${index}`}
                    activity={activity}
                    canScheduleAt={canScheduleAt}
                    onSchedule={onSchedule}
                    highlighted={
                      !!highlightTargetId &&
                      (activity.targetId === highlightTargetId ||
                        activity.targetPool?.some((target) => target.id === highlightTargetId) ===
                          true)
                    }
                    isSelected={selectedActivity === activity}
                    onSelect={onSelectActivity}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
