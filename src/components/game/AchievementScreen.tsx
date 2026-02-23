"use client";

import { useState } from "react";
import { Lock, Trophy } from "lucide-react";
import { GameLayout } from "./GameLayout";
import { useAchievementStore, TOTAL_ACHIEVEMENT_COUNT } from "@/stores/achievementStore";
import {
  ACHIEVEMENTS,
  type AchievementCategory,
  type AchievementDef,
} from "@/lib/achievements";

// =============================================================================
// CONSTANTS
// =============================================================================

type FilterTab = AchievementCategory | "all";

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "gettingStarted", label: "Getting Started" },
  { id: "careerMilestones", label: "Career" },
  { id: "scoutingExcellence", label: "Scouting" },
  { id: "specializationMastery", label: "Mastery" },
  { id: "worldExplorer", label: "World" },
  { id: "hidden", label: "Hidden" },
];

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  gettingStarted: "Getting Started",
  careerMilestones: "Career Milestones",
  scoutingExcellence: "Scouting Excellence",
  specializationMastery: "Specialization Mastery",
  worldExplorer: "World Explorer",
  hidden: "Hidden",
};

const CATEGORY_COLOR: Record<AchievementCategory, string> = {
  gettingStarted: "bg-blue-500/20 text-blue-400",
  careerMilestones: "bg-amber-500/20 text-amber-400",
  scoutingExcellence: "bg-emerald-500/20 text-emerald-400",
  specializationMastery: "bg-purple-500/20 text-purple-400",
  worldExplorer: "bg-cyan-500/20 text-cyan-400",
  hidden: "bg-zinc-500/20 text-zinc-400",
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface AchievementCardProps {
  achievement: AchievementDef;
  isUnlocked: boolean;
}

function AchievementCard({ achievement, isUnlocked }: AchievementCardProps) {
  const isHiddenAndLocked = achievement.hidden === true && !isUnlocked;

  return (
    <article
      aria-label={
        isHiddenAndLocked
          ? "Hidden Achievement"
          : `${achievement.name}${isUnlocked ? " — Unlocked" : " — Locked"}`
      }
      className={`relative flex flex-col gap-3 rounded-xl border p-4 transition ${
        isUnlocked
          ? "border-zinc-700 bg-zinc-800/60"
          : "border-zinc-800 bg-zinc-900/40 opacity-60"
      }`}
    >
      {/* Lock badge — top-right corner */}
      {!isUnlocked && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-3 text-zinc-600"
        >
          <Lock size={14} />
        </span>
      )}

      {/* Unlocked trophy indicator */}
      {isUnlocked && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-3 text-emerald-500"
        >
          <Trophy size={14} />
        </span>
      )}

      {/* Icon */}
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl ${
          isUnlocked
            ? "bg-emerald-500/20"
            : "bg-zinc-800"
        }`}
      >
        {isHiddenAndLocked ? "❓" : achievement.icon}
      </span>

      {/* Name */}
      <div>
        <p className="text-sm font-semibold text-white">
          {isHiddenAndLocked ? "???" : achievement.name}
        </p>

        {/* Description or hint */}
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
          {isHiddenAndLocked
            ? "Hidden Achievement"
            : isUnlocked
              ? achievement.description
              : achievement.hint}
        </p>
      </div>

      {/* Category badge */}
      <span
        className={`self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CATEGORY_COLOR[achievement.category]}`}
      >
        {isHiddenAndLocked ? "Hidden" : CATEGORY_LABEL[achievement.category]}
      </span>
    </article>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AchievementScreen() {
  const unlockedAchievements = useAchievementStore(
    (s) => s.unlockedAchievements,
  );
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const unlockedCount = unlockedAchievements.size;
  const progressPct = Math.round((unlockedCount / TOTAL_ACHIEVEMENT_COUNT) * 100);

  const filteredAchievements =
    activeTab === "all"
      ? ACHIEVEMENTS
      : ACHIEVEMENTS.filter((a) => a.category === activeTab);

  return (
    <GameLayout>
      <div className="p-6">
        {/* Page header */}
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <Trophy size={24} className="text-emerald-400" aria-hidden="true" />
            <h1 className="text-xl font-bold text-white">Achievements</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Track your milestones and hidden accomplishments.
          </p>
        </header>

        {/* Progress bar */}
        <section
          aria-label="Achievement progress"
          className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
        >
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-white">
              {unlockedCount} / {TOTAL_ACHIEVEMENT_COUNT} Unlocked
            </span>
            <span className="text-zinc-400">{progressPct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={unlockedCount}
            aria-valuemin={0}
            aria-valuemax={TOTAL_ACHIEVEMENT_COUNT}
            aria-label={`${unlockedCount} of ${TOTAL_ACHIEVEMENT_COUNT} achievements unlocked`}
            className="h-2 overflow-hidden rounded-full bg-zinc-800"
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
              aria-hidden="true"
            />
          </div>
        </section>

        {/* Category filter tabs */}
        <nav
          aria-label="Achievement category filter"
          className="mb-6 flex flex-wrap gap-2"
        >
          {FILTER_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-pressed={activeTab === id}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                activeTab === id
                  ? "bg-emerald-500 text-black"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Achievement grid */}
        <section aria-label="Achievement list">
          {filteredAchievements.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">
              No achievements in this category.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredAchievements.map((achievement) => (
                <AchievementCard
                  key={achievement.id}
                  achievement={achievement}
                  isUnlocked={unlockedAchievements.has(achievement.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </GameLayout>
  );
}
