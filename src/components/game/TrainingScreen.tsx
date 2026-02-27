"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  CheckCircle,
  Lock,
  GraduationCap,
  Clock,
  DollarSign,
  ArrowUp,
} from "lucide-react";
import {
  COURSE_CATALOG,
  getAvailableCourses,
  getCourseEffects,
  hasRequiredCoursesForTier,
} from "@/engine/career/courses";
import type { Course, CourseEffect } from "@/engine/core/types";
import { ScreenBackground } from "@/components/ui/screen-background";

// Category labels and tab keys
const CATEGORY_TABS = [
  { key: "scouting", label: "Scouting" },
  { key: "specialization", label: "Specialization" },
  { key: "business", label: "Business" },
] as const;

type CategoryKey = (typeof CATEGORY_TABS)[number]["key"];

function formatCurrency(n: number): string {
  if (n >= 1_000) return `£${(n / 1_000).toFixed(1)}K`;
  return `£${n.toLocaleString()}`;
}

function effectLabel(effect: CourseEffect): string {
  switch (effect.type) {
    case "reputationBonus":
      return `+${effect.value} Reputation`;
    case "skillBonus":
      return `+${effect.value} ${effect.target?.replace(/([A-Z])/g, " $1").trim() ?? "skill"}`;
    case "attributeBonus":
      return `+${effect.value} ${effect.target?.replace(/([A-Z])/g, " $1").trim() ?? "attribute"}`;
    case "tierGate":
      return `Required for Tier ${effect.target}`;
    case "perkUnlock":
      return `Unlocks: ${effect.target ?? "perk"}`;
    default:
      return `+${effect.value}`;
  }
}

export function TrainingScreen() {
  const { gameState, enrollInCourse } = useGameStore();
  const [activeTab, setActiveTab] = useState<CategoryKey>("scouting");

  if (!gameState?.finances) {
    return (
      <GameLayout>
        <div className="p-6 text-zinc-400">No financial data available.</div>
      </GameLayout>
    );
  }

  const { finances, scout } = gameState;
  const completedCourses = finances.completedCourses ?? [];
  const activeEnrollment = finances.activeEnrollment;
  const availableCourses = getAvailableCourses(scout, completedCourses);
  const availableIds = new Set(availableCourses.map((c) => c.id));

  // Active course info
  const activeCourse = activeEnrollment
    ? COURSE_CATALOG.find((c) => c.id === activeEnrollment.courseId)
    : null;

  // Calculate progress for active course
  const effectiveWeek =
    (gameState.currentSeason - 1) * 52 + gameState.currentWeek;
  const enrollmentStartWeek = activeEnrollment
    ? (activeEnrollment.startSeason - 1) * 52 + activeEnrollment.startWeek
    : 0;
  const weeksElapsed = activeEnrollment
    ? Math.max(0, effectiveWeek - enrollmentStartWeek)
    : 0;
  const totalWeeks = activeCourse?.durationWeeks ?? 1;
  const progressPct = Math.min(100, Math.round((weeksElapsed / totalWeeks) * 100));

  // Completed course effects
  const completedEffects = getCourseEffects(completedCourses);

  // Filter catalog by active tab
  const catalogCourses = COURSE_CATALOG.filter((c) => c.category === activeTab);

  const canEnroll = (course: Course): boolean => {
    if (activeEnrollment) return false;
    if (completedCourses.includes(course.id)) return false;
    if (!availableIds.has(course.id)) return false;
    if (finances.balance < course.cost) return false;
    return true;
  };

  const getLockedReason = (course: Course): string | null => {
    if (completedCourses.includes(course.id)) return null; // completed, not locked
    if (activeEnrollment) return "Already enrolled in a course";
    if (course.minTier > scout.careerTier) return `Requires Tier ${course.minTier}`;
    const unmetPrereqs = course.prerequisites.filter(
      (p) => !completedCourses.includes(p),
    );
    if (unmetPrereqs.length > 0) {
      const names = unmetPrereqs
        .map((id) => COURSE_CATALOG.find((c) => c.id === id)?.name ?? id)
        .join(", ");
      return `Prerequisite: ${names}`;
    }
    if (finances.balance < course.cost) return "Insufficient funds";
    return null;
  };

  return (
    <GameLayout>
      <div className="relative p-6 space-y-6">
        <ScreenBackground src="/images/backgrounds/training-classroom.png" opacity={0.82} />
        <div className="relative z-10">
        <div>
          <h1 className="text-2xl font-bold text-white">Training & Courses</h1>
          <p className="text-sm text-zinc-400">
            Enroll in courses to earn qualifications and unlock career progression
          </p>
        </div>

        {/* Active Course */}
        {activeCourse && activeEnrollment && (
          <Card className="border-emerald-500/30 bg-emerald-500/5" data-tutorial-id="training-progress">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpen size={14} className="text-emerald-400" />
                Active Course
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">
                  {activeCourse.name}
                </span>
                <span className="text-xs text-zinc-400">
                  {weeksElapsed}/{totalWeeks} weeks
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800 mb-2">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {activeCourse.effects.map((e, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400"
                  >
                    {effectLabel(e)}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Completed Courses */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CheckCircle size={14} className="text-emerald-400" />
                Completed ({completedCourses.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {completedCourses.length === 0 ? (
                <p className="text-xs text-zinc-600">No courses completed yet.</p>
              ) : (
                completedCourses.map((id) => {
                  const course = COURSE_CATALOG.find((c) => c.id === id);
                  if (!course) return null;
                  return (
                    <div
                      key={id}
                      className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle
                          size={12}
                          className="text-emerald-400 shrink-0"
                        />
                        <span className="text-zinc-300 font-medium">
                          {course.name}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {course.effects.map((e, i) => (
                          <span
                            key={i}
                            className="text-[10px] text-emerald-500/70"
                          >
                            {effectLabel(e)}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Tier readiness */}
              {[4, 5].map((tier) => {
                const ready = hasRequiredCoursesForTier(
                  completedCourses,
                  tier as 1 | 2 | 3 | 4 | 5,
                );
                return (
                  <div
                    key={tier}
                    className={`flex items-center justify-between rounded px-2 py-1 text-[11px] ${
                      ready
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    <span>Tier {tier} Qualification</span>
                    <span>{ready ? "Ready" : "Not met"}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Course Catalog */}
          <div className="lg:col-span-2" data-tutorial-id="training-courses">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <GraduationCap size={14} className="text-amber-400" />
                  Course Catalog
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Category tabs */}
                <div className="flex gap-1 mb-4">
                  {CATEGORY_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                        activeTab === tab.key
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Course cards */}
                <div className="space-y-3">
                  {catalogCourses.map((course) => {
                    const isCompleted = completedCourses.includes(course.id);
                    const isActive =
                      activeEnrollment?.courseId === course.id;
                    const lockedReason = getLockedReason(course);
                    const isLocked = !isCompleted && !isActive && lockedReason !== null;
                    const enrollable = canEnroll(course);
                    const hasTierGate = course.effects.some(
                      (e) => e.type === "tierGate",
                    );

                    return (
                      <div
                        key={course.id}
                        className={`rounded-lg border px-4 py-3 ${
                          isCompleted
                            ? "border-emerald-500/20 bg-emerald-500/5"
                            : isActive
                              ? "border-emerald-500/30 bg-emerald-500/10"
                              : isLocked
                                ? "border-zinc-800 bg-zinc-900/50 opacity-60"
                                : "border-zinc-700 bg-zinc-900"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {isCompleted ? (
                              <CheckCircle
                                size={14}
                                className="text-emerald-400 shrink-0 mt-0.5"
                              />
                            ) : isLocked ? (
                              <Lock
                                size={14}
                                className="text-zinc-600 shrink-0 mt-0.5"
                              />
                            ) : (
                              <BookOpen
                                size={14}
                                className="text-amber-400 shrink-0 mt-0.5"
                              />
                            )}
                            <span
                              className={`text-sm font-medium ${isLocked ? "text-zinc-500" : "text-white"}`}
                            >
                              {course.name}
                            </span>
                          </div>
                          {hasTierGate && !isCompleted && (
                            <Badge variant="warning" className="text-[10px] shrink-0">
                              <ArrowUp size={10} className="mr-0.5" />
                              Tier Gate
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-zinc-500 mb-2 ml-6">
                          {course.description}
                        </p>

                        <div className="ml-6 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 mb-2">
                          <span className="flex items-center gap-1">
                            <DollarSign size={10} />
                            {formatCurrency(course.cost)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {course.durationWeeks} weeks
                          </span>
                          <span>Tier {course.minTier}+</span>
                        </div>

                        {/* Effects */}
                        <div className="ml-6 flex flex-wrap gap-1.5 mb-2">
                          {course.effects.map((e, i) => (
                            <span
                              key={i}
                              className={`rounded-full px-2 py-0.5 text-[10px] ${
                                e.type === "tierGate"
                                  ? "bg-amber-500/10 text-amber-400"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              {effectLabel(e)}
                            </span>
                          ))}
                        </div>

                        {/* Prerequisites */}
                        {course.prerequisites.length > 0 && (
                          <div className="ml-6 mb-2 text-[10px]">
                            <span className="text-zinc-600">Prerequisites: </span>
                            {course.prerequisites.map((pid, i) => {
                              const met = completedCourses.includes(pid);
                              const pName =
                                COURSE_CATALOG.find((c) => c.id === pid)?.name ??
                                pid;
                              return (
                                <span key={pid}>
                                  {i > 0 && ", "}
                                  <span
                                    className={
                                      met ? "text-emerald-400" : "text-red-400"
                                    }
                                  >
                                    {pName} {met ? "\u2713" : "\u2717"}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="ml-6">
                          {isCompleted ? (
                            <span className="text-[11px] text-emerald-400 font-medium">
                              Completed
                            </span>
                          ) : isActive ? (
                            <span className="text-[11px] text-emerald-400 font-medium">
                              In Progress — {weeksElapsed}/{totalWeeks} weeks
                            </span>
                          ) : isLocked ? (
                            <span className="text-[11px] text-zinc-600">
                              {lockedReason}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              disabled={!enrollable}
                              onClick={() => enrollInCourse(course.id)}
                              className="h-7 text-xs"
                            >
                              Enroll — {formatCurrency(course.cost)}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      </div>
    </GameLayout>
  );
}
