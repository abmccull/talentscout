"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Activity, Specialization, League } from "@/engine/core/types";
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
  /** Resolve club IDs to display names for match descriptions */
  resolveClubName: (id: string) => string;
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
}: ActivityPanelProps) {
  const theme = SPECIALIZATION_THEMES[specialization];

  // Enrich match activities with resolved club names
  const enrichedActivities = useMemo(() => {
    return activities.map((a) => {
      if (a.type !== "attendMatch" || !a.description) return a;
      // Engine returns "Attend match: clubId vs clubId" — replace IDs with names
      const match = a.description.match(/^Attend match: (.+?) vs (.+)$/);
      if (!match) return a;
      const homeName = resolveClubName(match[1]) || match[1];
      const awayName = resolveClubName(match[2]) || match[2];
      return { ...a, description: `${homeName} vs ${awayName}` };
    });
  }, [activities, resolveClubName]);

  // Group activities by category
  const grouped = useMemo(() => {
    const groups: Record<ActivityCategory, Activity[]> = {
      matches: [],
      specialist: [],
      scouting: [],
      office: [],
      networking: [],
      recovery: [],
    };

    for (const activity of enrichedActivities) {
      const category = ACTIVITY_CATEGORIES[activity.type] ?? "scouting";
      // Apply league filter only to match activities
      if (category === "matches" && activity.type === "attendMatch" && leagueFilter !== "all") {
        const fixtureLeagueId = activity.targetId ? fixtureLeagueById[activity.targetId] : undefined;
        if (!fixtureLeagueId || fixtureLeagueId !== leagueFilter) {
          continue;
        }
      }
      groups[category].push(activity);
    }

    return groups;
  }, [enrichedActivities, fixtureLeagueById, leagueFilter]);

  // Sorted category keys (skip empty ones; hide specialist for regional if empty)
  const sortedCategories = useMemo(() => {
    return (Object.keys(ACTIVITY_CATEGORY_CONFIG) as ActivityCategory[])
      .sort(
        (a, b) => ACTIVITY_CATEGORY_CONFIG[a].order - ACTIVITY_CATEGORY_CONFIG[b].order,
      )
      .filter((cat) => grouped[cat].length > 0);
  }, [grouped]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Available Activities</CardTitle>
          {/* Specialization identity tag */}
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${theme.bgClass} ${theme.textClass} ${theme.borderClass}`}
          >
            {theme.label}
          </div>
        </div>
        <p className={`text-[11px] italic ${theme.textClass} opacity-75`}>
          {theme.tagline}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {sortedCategories.map((category) => {
          const config = ACTIVITY_CATEGORY_CONFIG[category];
          const sectionActivities = grouped[category];
          const sectionLabel =
            config.specLabel?.[specialization] ?? config.label;

          // Use accent color for the specialist section
          const isSpecialist = category === "specialist";
          const headerClass = isSpecialist
            ? `text-[10px] font-semibold uppercase tracking-wider ${theme.textClass}`
            : "text-[10px] font-semibold uppercase tracking-wider text-zinc-500";

          return (
            <div key={category}>
              <div className="mb-2 flex items-center justify-between">
                <span className={headerClass}>{sectionLabel}</span>
                {/* League filter in matches section only */}
                {category === "matches" && allLeagues.length > 0 && (
                  <select
                    value={leagueFilter}
                    onChange={(e) => onLeagueFilterChange(e.target.value)}
                    className="rounded-md border border-[#27272a] bg-[#141414] px-2 py-1 text-xs text-zinc-300"
                  >
                    <option value="all">All Leagues</option>
                    {allLeagues.map((league) => (
                      <option key={league.id} value={league.id}>
                        {league.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {sectionActivities.map((activity, idx) => (
                    <ActivityCard
                      key={`${activity.instanceId ?? activity.type}-${activity.targetId ?? "none"}-${idx}`}
                      activity={activity}
                      canScheduleAt={canScheduleAt}
                      onSchedule={onSchedule}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
