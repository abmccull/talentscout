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
import {
  getAchievementRarity,
  RARITY_CONFIG,
  type AchievementProgress,
  type AchievementRarity,
} from "@/engine/core/achievementEngine";

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
  { id: "matchAnalysis", label: "Match & Network" },
  { id: "financial", label: "Financial" },
  { id: "hidden", label: "Hidden" },
];

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  gettingStarted: "Getting Started",
  careerMilestones: "Career Milestones",
  scoutingExcellence: "Scouting Excellence",
  specializationMastery: "Specialization Mastery",
  worldExplorer: "World Explorer",
  matchAnalysis: "Match & Network",
  financial: "Financial",
  hidden: "Hidden",
};

const CATEGORY_COLOR: Record<AchievementCategory, string> = {
  gettingStarted: "bg-blue-500/20 text-blue-400",
  careerMilestones: "bg-amber-500/20 text-amber-400",
  scoutingExcellence: "bg-emerald-500/20 text-emerald-400",
  specializationMastery: "bg-purple-500/20 text-purple-400",
  worldExplorer: "bg-cyan-500/20 text-cyan-400",
  matchAnalysis: "bg-rose-500/20 text-rose-400",
  financial: "bg-yellow-500/20 text-yellow-400",
  hidden: "bg-zinc-500/20 text-zinc-400",
};

const RARITY_BORDER: Record<AchievementRarity, string> = {
  common: "border-zinc-700",
  uncommon: "border-green-800",
  rare: "border-blue-800",
  epic: "border-purple-800",
  legendary: "border-amber-700",
};

const RARITY_GLOW: Record<AchievementRarity, string> = {
  common: "",
  uncommon: "",
  rare: "",
  epic: "shadow-purple-500/10",
  legendary: "shadow-amber-500/20 shadow-lg",
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface AchievementCardProps {
  achievement: AchievementDef;
  isUnlocked: boolean;
  progress?: AchievementProgress;
}

function AchievementCard({ achievement, isUnlocked, progress }: AchievementCardProps) {
  const isHiddenAndLocked = achievement.hidden === true && !isUnlocked;
  const rarity = getAchievementRarity(achievement.id);
  const rarityConfig = RARITY_CONFIG[rarity];

  return (
    <article
      aria-label={
        isHiddenAndLocked
          ? "Hidden Achievement"
          : `${achievement.name}${isUnlocked ? " — Unlocked" : " — Locked"}`
      }
      className={`relative flex flex-col gap-3 rounded-xl border p-4 transition ${
        isUnlocked
          ? `${RARITY_BORDER[rarity]} bg-zinc-800/60 ${RARITY_GLOW[rarity]}`
          : "border-zinc-800 bg-zinc-900/40 opacity-60"
      }`}
    >
      {/* Lock / Trophy badge — top-right corner */}
      {!isUnlocked && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-3 text-zinc-600"
        >
          <Lock size={14} />
        </span>
      )}
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
        {isHiddenAndLocked ? "?" : achievement.icon}
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

      {/* Progress bar (only for locked achievements with trackable progress) */}
      {!isUnlocked && progress && progress.percentage < 100 && (
        <div className="mt-auto">
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="text-zinc-500">
              {progress.current} / {progress.target}
            </span>
            <span className="text-zinc-500">{progress.percentage}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progress.current}
            aria-valuemin={0}
            aria-valuemax={progress.target}
            className="h-1 overflow-hidden rounded-full bg-zinc-800"
          >
            <div
              className="h-full rounded-full bg-zinc-600 transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      {/* Category + Rarity badges */}
      <div className="mt-auto flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CATEGORY_COLOR[achievement.category]}`}
        >
          {isHiddenAndLocked ? "Hidden" : CATEGORY_LABEL[achievement.category]}
        </span>
        {!isHiddenAndLocked && (
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide ${rarityConfig.colorClass}`}
          >
            {rarityConfig.label}
          </span>
        )}
      </div>
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
  const progressCache = useAchievementStore((s) => s.progressCache);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const unlockedCount = unlockedAchievements.size;
  const progressPct = Math.round((unlockedCount / TOTAL_ACHIEVEMENT_COUNT) * 100);

  const filteredAchievements =
    activeTab === "all"
      ? ACHIEVEMENTS
      : ACHIEVEMENTS.filter((a) => a.category === activeTab);

  // Sort: unlocked first, then by progress percentage descending
  const sortedAchievements = [...filteredAchievements].sort((a, b) => {
    const aUnlocked = unlockedAchievements.has(a.id) ? 1 : 0;
    const bUnlocked = unlockedAchievements.has(b.id) ? 1 : 0;
    if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
    // Among locked, sort by progress descending
    const aProgress = progressCache[a.id]?.percentage ?? 0;
    const bProgress = progressCache[b.id]?.percentage ?? 0;
    return bProgress - aProgress;
  });

  // Count unlocked per category for tab badges
  const categoryUnlockedCounts: Partial<Record<AchievementCategory, number>> = {};
  const categoryCounts: Partial<Record<AchievementCategory, number>> = {};
  for (const a of ACHIEVEMENTS) {
    categoryCounts[a.category] = (categoryCounts[a.category] ?? 0) + 1;
    if (unlockedAchievements.has(a.id)) {
      categoryUnlockedCounts[a.category] = (categoryUnlockedCounts[a.category] ?? 0) + 1;
    }
  }

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
          {FILTER_TABS.map(({ id, label }) => {
            const catCount = id === "all" ? TOTAL_ACHIEVEMENT_COUNT : (categoryCounts[id as AchievementCategory] ?? 0);
            const catUnlocked = id === "all" ? unlockedCount : (categoryUnlockedCounts[id as AchievementCategory] ?? 0);
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                aria-pressed={activeTab === id}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === id
                    ? "bg-emerald-500 text-black"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                }`}
              >
                {label}
                <span className={`text-[10px] ${activeTab === id ? "text-black/60" : "text-zinc-500"}`}>
                  {catUnlocked}/{catCount}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Achievement grid */}
        <section aria-label="Achievement list">
          {sortedAchievements.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">
              No achievements in this category.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedAchievements.map((achievement) => (
                <AchievementCard
                  key={achievement.id}
                  achievement={achievement}
                  isUnlocked={unlockedAchievements.has(achievement.id)}
                  progress={progressCache[achievement.id]}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </GameLayout>
  );
}
