"use client";

import { useState } from "react";
import { Lock, Trophy, Flag, Briefcase, Eye, BookOpen, Globe, Users, Wallet, type LucideIcon } from "lucide-react";
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
} from "@/engine/core/achievementEngine";
import { achievementPresentation } from "@/lib/achievementPresentation";
import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";
import { isAchievementAvailableForBuild } from "@/stores/gameScreenScope";

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
  {
    id: "matchAnalysis",
    label: IS_YOUTH_EARLY_ACCESS ? "Observation & Network" : "Match & Network",
  },
  { id: "financial", label: "Financial" },
  { id: "hidden", label: "Hidden" },
];

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  gettingStarted: "Getting Started",
  careerMilestones: "Career Milestones",
  scoutingExcellence: "Scouting Excellence",
  specializationMastery: "Specialization Mastery",
  worldExplorer: "World Explorer",
  matchAnalysis: IS_YOUTH_EARLY_ACCESS
    ? "Observation & Network"
    : "Match & Network",
  financial: "Financial",
  hidden: "Hidden",
};

const CATEGORY_ICON: Record<AchievementCategory, LucideIcon> = {
  gettingStarted: Flag,
  careerMilestones: Briefcase,
  scoutingExcellence: Eye,
  specializationMastery: BookOpen,
  worldExplorer: Globe,
  matchAnalysis: Users,
  financial: Wallet,
  hidden: Lock,
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
  const presentation = achievementPresentation(achievement);
  const isHiddenAndLocked = achievement.hidden === true && !isUnlocked;
  const rarity = getAchievementRarity(achievement.id);
  const rarityConfig = RARITY_CONFIG[rarity];
  const CategoryIcon = isHiddenAndLocked ? Lock : CATEGORY_ICON[achievement.category];

  return (
    <article
      aria-label={
        isHiddenAndLocked
          ? "Hidden Achievement"
          : `${presentation.name}${isUnlocked ? " — Unlocked" : " — Locked"}`
      }
      className={`relative flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--surface)] p-5 ${isUnlocked ? "border-l-2 border-l-[var(--accent)]" : ""}`}
    >
      {/* Lock / Trophy badge — top-right corner */}
      {!isUnlocked && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-3 text-zinc-400"
        >
          <Lock size={14} />
        </span>
      )}
      {isUnlocked && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-3 text-[var(--accent)]"
        >
          <Trophy size={14} />
        </span>
      )}

      {/* Icon */}
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 items-center justify-center ${isUnlocked ? "text-[var(--accent)]" : "text-zinc-400"}`}
      >
        <CategoryIcon size={22} strokeWidth={1.5} />
      </span>

      {/* Name */}
      <div>
        <p className="text-sm font-semibold text-white">
          {isHiddenAndLocked ? "A story still to unfold" : presentation.name}
        </p>

        {/* Description or hint */}
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
          {isHiddenAndLocked
            ? "Hidden Achievement"
            : isUnlocked
              ? presentation.description
              : presentation.hint}
        </p>
      </div>

      {/* Progress bar (only for locked achievements with trackable progress) */}
      {!isUnlocked && presentation.showProgress && progress && progress.percentage < 100 && (
        <div className="mt-auto">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-[var(--muted-foreground)]">
              {progress.current} / {progress.target}
            </span>
            <span className="text-[var(--muted-foreground)]">{progress.percentage}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`${presentation.name} progress`}
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
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="text-xs text-zinc-400"
        >
          {isHiddenAndLocked ? "Hidden" : CATEGORY_LABEL[achievement.category]}
        </span>
        {!isHiddenAndLocked && (
          <span
            className="text-xs text-zinc-400"
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

  const availableAchievements = ACHIEVEMENTS.filter((achievement) =>
    isAchievementAvailableForBuild(achievement.id),
  );
  const unlockedCount = availableAchievements.filter((achievement) =>
    unlockedAchievements.has(achievement.id),
  ).length;
  const progressPct = Math.round((unlockedCount / TOTAL_ACHIEVEMENT_COUNT) * 100);

  const filteredAchievements =
    activeTab === "all"
      ? availableAchievements
      : availableAchievements.filter((a) => a.category === activeTab);

  // Sort: unlocked first, then by progress percentage descending
  const sortedAchievements = [...filteredAchievements].sort((a, b) => {
    const aUnlocked = unlockedAchievements.has(a.id) ? 1 : 0;
    const bUnlocked = unlockedAchievements.has(b.id) ? 1 : 0;
    if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
    // Among locked, sort by progress descending
    const aProgress = achievementPresentation(a).showProgress ? progressCache[a.id]?.percentage ?? 0 : 0;
    const bProgress = achievementPresentation(b).showProgress ? progressCache[b.id]?.percentage ?? 0 : 0;
    return bProgress - aProgress;
  });

  // Count unlocked per category for tab badges
  const categoryUnlockedCounts: Partial<Record<AchievementCategory, number>> = {};
  const categoryCounts: Partial<Record<AchievementCategory, number>> = {};
  for (const a of availableAchievements) {
    categoryCounts[a.category] = (categoryCounts[a.category] ?? 0) + 1;
    if (unlockedAchievements.has(a.id)) {
      categoryUnlockedCounts[a.category] = (categoryUnlockedCounts[a.category] ?? 0) + 1;
    }
  }

  return (
    <GameLayout>
      <div className="relative min-h-full p-4 sm:p-6">

        <div className="relative z-10">
        {/* Page header */}
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <Trophy size={24} className="text-[var(--accent)]" aria-hidden="true" />
            <h1 className="font-editorial text-3xl text-white">Achievements</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            A collection of the moments that shaped your scouting career.
          </p>
        </header>

        {/* Progress bar */}
        <section
          aria-label="Achievement progress"
          className="dossier-section mb-6 p-4"
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
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
              aria-hidden="true"
            />
          </div>
        </section>

        <label className="mb-5 block text-sm text-zinc-300 sm:hidden">
          Category
          <select value={activeTab} onChange={(event) => setActiveTab(event.target.value as FilterTab)} className="mt-2 min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-white">
            {FILTER_TABS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>

        {/* Category filter tabs */}
        <nav
          aria-label="Achievement category filter"
          className="mb-6 hidden flex-wrap gap-2 sm:flex"
        >
          {FILTER_TABS.map(({ id, label }) => {
            const catCount = id === "all" ? TOTAL_ACHIEVEMENT_COUNT : (categoryCounts[id as AchievementCategory] ?? 0);
            const catUnlocked = id === "all" ? unlockedCount : (categoryUnlockedCounts[id as AchievementCategory] ?? 0);
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                aria-pressed={activeTab === id}
                className={`flex min-h-10 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition ${
                  activeTab === id
                    ? "bg-[var(--accent)] text-[#15120c]"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                }`}
              >
                {label}
                <span className={`text-xs ${activeTab === id ? "text-black/60" : "text-[var(--muted-foreground)]"}`}>
                  {catUnlocked}/{catCount}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Achievement grid */}
        <section aria-label="Achievement list" data-tutorial-id="achievements-grid">
          {sortedAchievements.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">
              No achievements in this category.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
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
      </div>
    </GameLayout>
  );
}
