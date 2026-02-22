"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Briefcase,
  TrendingUp,
  Star,
  AlertTriangle,
  CheckCircle,
  Users,
  UserCheck,
  Wrench,
  Lock,
  Target,
  Brain,
  ArrowRight,
  TrendingDown,
  Minus,
} from "lucide-react";
import type {
  JobOffer,
  PerformanceReview,
  ScoutSkill,
  ScoutAttribute,
  Specialization,
} from "@/engine/core/types";
import { MASTERY_PERKS, checkMasteryPerkUnlocks } from "@/engine/specializations/masteryPerks";
import { TOOL_DEFINITIONS, getToolDefinition, getActiveToolBonuses } from "@/engine/tools/index";
import { EquipmentPanel } from "./EquipmentPanel";
import { canChooseIndependentPath } from "@/engine/career/pathChoice";
import { LIFESTYLE_TIERS } from "@/engine/finance/lifestyle";
import type { CareerPath, LifestyleLevel } from "@/engine/core/types";

// ─── Labels ──────────────────────────────────────────────────────────────────

const SKILL_LABELS: Record<ScoutSkill, string> = {
  technicalEye: "Technical Eye",
  physicalAssessment: "Physical Assessment",
  psychologicalRead: "Psychological Read",
  tacticalUnderstanding: "Tactical Understanding",
  dataLiteracy: "Data Literacy",
  playerJudgment: "Player Judgment",
  potentialAssessment: "Potential Assessment",
};

const ATTRIBUTE_LABELS: Record<ScoutAttribute, string> = {
  networking: "Networking",
  persuasion: "Persuasion",
  endurance: "Endurance",
  adaptability: "Adaptability",
  memory: "Memory",
  intuition: "Intuition",
};

const TIER_LABELS: Record<number, string> = {
  1: "Freelance Scout",
  2: "Part-Time Regional Scout",
  3: "Full-Time Club Scout",
  4: "Head of Scouting",
  5: "Director of Football",
};

const SPEC_LABELS: Record<string, string> = {
  youth: "Youth Scout",
  firstTeam: "First Team Scout",
  regional: "Regional Expert",
  data: "Data Scout",
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatSalary(salary: number): string {
  if (salary >= 1000) return `£${(salary / 1000).toFixed(1)}K/wk`;
  return `£${salary}/wk`;
}

function formatSavings(savings: number): string {
  if (savings >= 1_000_000) return `£${(savings / 1_000_000).toFixed(2)}M`;
  if (savings >= 1_000) return `£${(savings / 1_000).toFixed(0)}K`;
  return `£${savings}`;
}

function formatBalance(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}K`;
  return `${sign}£${abs}`;
}

// ─── Outcome helpers ─────────────────────────────────────────────────────────

function outcomeColor(outcome: PerformanceReview["outcome"]): string {
  switch (outcome) {
    case "promoted": return "text-emerald-400";
    case "retained": return "text-blue-400";
    case "warning":  return "text-amber-400";
    case "fired":    return "text-red-400";
  }
}

function outcomeIcon(outcome: PerformanceReview["outcome"]) {
  switch (outcome) {
    case "promoted":
      return <TrendingUp size={14} className="text-emerald-400" aria-hidden="true" />;
    case "retained":
      return <CheckCircle size={14} className="text-blue-400" aria-hidden="true" />;
    case "warning":
      return <AlertTriangle size={14} className="text-amber-400" aria-hidden="true" />;
    case "fired":
      return <AlertTriangle size={14} className="text-red-400" aria-hidden="true" />;
  }
}

// ─── JobOfferCard ─────────────────────────────────────────────────────────────

interface JobOfferCardProps {
  offer: JobOffer;
  clubName: string;
  onAccept: () => void;
  onDecline: () => void;
}

function JobOfferCard({ offer, clubName, onAccept, onDecline }: JobOfferCardProps) {
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="font-semibold text-white">{clubName}</p>
          <p className="text-sm text-zinc-400">{offer.role}</p>
        </div>
        <Badge variant="secondary">Tier {offer.tier}</Badge>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-zinc-500">Salary: </span>
          <span className="text-emerald-400 font-semibold">{formatSalary(offer.salary)}</span>
        </div>
        <div>
          <span className="text-zinc-500">Contract: </span>
          <span className="text-white">
            {offer.contractLength} season{offer.contractLength !== 1 ? "s" : ""}
          </span>
        </div>
        {offer.territory && (
          <div className="col-span-2">
            <span className="text-zinc-500">Territory: </span>
            <span className="text-white">{offer.territory}</span>
          </div>
        )}
        <div className="col-span-2">
          <span className="text-zinc-500">Expires: </span>
          <span className="text-amber-400">Week {offer.expiresWeek}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={onAccept}>
          Accept
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={onDecline}>
          Decline
        </Button>
      </div>
    </div>
  );
}

// ─── CareerScreen ─────────────────────────────────────────────────────────────

export function CareerScreen() {
  const {
    gameState,
    acceptJob,
    declineJob,
    getClub,
    setScreen,
    unlockSecondarySpecialization,
    meetManager,
  } = useGameStore();

  const { scout, currentSeason, jobOffers, performanceReviews } = gameState ?? {
    scout: undefined,
    currentSeason: undefined,
    jobOffers: [] as JobOffer[],
    performanceReviews: [] as PerformanceReview[],
  };

  const currentClub = scout?.currentClubId ? getClub(scout.currentClubId) : undefined;
  const skillEntries = scout
    ? (Object.entries(scout.skills) as [ScoutSkill, number][])
    : [];
  const attrEntries = scout
    ? (Object.entries(scout.attributes) as [ScoutAttribute, number][])
    : [];

  // Phase 1: mastery perks, NPC scouts, unreviewed reports
  const unlockedMasteryPerks = scout ? checkMasteryPerkUnlocks(scout) : [];
  const unlockedMasteryPerkIds = new Set(unlockedMasteryPerks.map((p) => p.id));
  const npcScoutCount = scout
    ? Object.values(gameState?.npcScouts ?? {}).length
    : 0;
  const unreviewedNPCReportCount = scout
    ? Object.values(gameState?.npcReports ?? {}).filter((r) => !r.reviewed).length
    : 0;

  // Phase 2: tools and finances — call hooks/derived values before early return
  const unlockedTools = gameState?.unlockedTools ?? [];
  const finances = gameState?.finances ?? null;

  // Career path choice eligibility — derive before early return
  const showPathChoice =
    (scout?.careerTier ?? 0) >= 2 &&
    scout?.careerPath === "club" &&
    finances !== null &&
    scout !== undefined &&
    canChooseIndependentPath(scout, finances);

  // Specialization career details — derive before early return
  const specialization = scout?.primarySpecialization;
  const transferRecords = gameState?.transferRecords ?? [];
  const predictions = gameState?.predictions ?? [];

  // firstTeam: hit rate
  const completedTransfers = transferRecords.filter(
    (r) => r.outcome === "hit" || r.outcome === "decent" || r.outcome === "flop",
  );
  const hitCount = transferRecords.filter((r) => r.outcome === "hit").length;
  const hitRate = completedTransfers.length > 0
    ? Math.round((hitCount / completedTransfers.length) * 100)
    : null;

  // data: prediction oracle status
  const resolvedPredictions = predictions.filter((p) => p.resolved);
  const correctPredictions = resolvedPredictions.filter((p) => p.wasCorrect === true);
  const predictionAccuracy = resolvedPredictions.length > 0
    ? Math.round((correctPredictions.length / resolvedPredictions.length) * 100)
    : null;
  const oracleStreak = (() => {
    let streak = 0;
    const sorted = [...resolvedPredictions].sort(
      (a, b) => b.madeInSeason - a.madeInSeason || b.madeInWeek - a.madeInWeek,
    );
    for (const p of sorted) {
      if (p.wasCorrect === true) streak++;
      else break;
    }
    return streak;
  })();
  const isOracle = predictionAccuracy !== null && predictionAccuracy >= 70 && resolvedPredictions.length >= 10;

  if (!gameState || !scout) return null;

  return (
    <GameLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Career</h1>
          <p className="text-sm text-zinc-400">Season {currentSeason}</p>
        </div>

        {/* ── Career path choice (tier 2+, club default, eligible) ──────── */}
        {showPathChoice && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-amber-400">Career Path Choice Available</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                You have earned enough reputation to choose your career direction. This choice shapes
                how you earn and grow going forward.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => useGameStore.getState().chooseCareerPath("club" as CareerPath)}
                className="cursor-pointer rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-left transition hover:border-blue-500/60 hover:bg-blue-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <p className="mb-1 text-sm font-semibold text-blue-300">Club Scout</p>
                <p className="text-xs text-zinc-400">
                  Stable salary, performance bonuses, work within a club&apos;s scouting department
                </p>
              </button>
              <button
                type="button"
                onClick={() => useGameStore.getState().chooseCareerPath("independent" as CareerPath)}
                className="cursor-pointer rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-left transition hover:border-emerald-500/60 hover:bg-emerald-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
              >
                <p className="mb-1 text-sm font-semibold text-emerald-300">Independent Scout</p>
                <p className="text-xs text-zinc-400">
                  Sell reports on the marketplace, build retainer contracts, grow your own agency
                </p>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Scout profile */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Scout Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-lg font-bold">
                    {scout.firstName} {scout.lastName}
                  </p>
                  <p className="text-sm text-zinc-400">Age {scout.age}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-zinc-500">Tier: </span>
                    <span className="text-white font-medium">{scout.careerTier}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Role: </span>
                    <span className="text-white font-medium">
                      {TIER_LABELS[scout.careerTier]}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Club: </span>
                    <span className="text-white font-medium">
                      {currentClub?.shortName ?? "Freelance"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Spec: </span>
                    <span className="text-white font-medium">
                      {SPEC_LABELS[scout.primarySpecialization] ??
                        scout.primarySpecialization}
                    </span>
                  </div>
                </div>

                {/* Reputation */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Reputation</span>
                    <span className="text-emerald-400 font-semibold">
                      {Math.round(scout.reputation)}/100
                    </span>
                  </div>
                  <Progress
                    value={scout.reputation}
                    max={100}
                    indicatorClassName="bg-emerald-500"
                  />
                </div>

                {/* Club trust */}
                {currentClub && (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Club Trust</span>
                      <span className="text-blue-400 font-semibold">
                        {Math.round(scout.clubTrust)}/100
                      </span>
                    </div>
                    <Progress
                      value={scout.clubTrust}
                      max={100}
                      indicatorClassName="bg-blue-500"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Financial */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Finances</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Weekly Salary</span>
                  <span className="text-emerald-400 font-semibold text-sm">
                    {scout.salary > 0 ? formatSalary(scout.salary) : "Freelance"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Savings</span>
                  <span className="text-white font-semibold text-sm">
                    {formatSavings(scout.savings)}
                  </span>
                </div>
                {/* Phase 2: finances balance */}
                {finances && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Balance</span>
                    <span
                      className={`font-semibold text-sm ${
                        finances.balance >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatBalance(finances.balance)}
                    </span>
                  </div>
                )}
                {scout.contractEndSeason && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Contract Ends</span>
                    <span className="text-amber-400 text-sm">
                      Season {scout.contractEndSeason}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lifestyle selector */}
            {finances && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Lifestyle</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {(Object.entries(LIFESTYLE_TIERS) as [string, (typeof LIFESTYLE_TIERS)[LifestyleLevel]][]).map(
                    ([levelStr, tier]) => {
                      const level = Number(levelStr) as LifestyleLevel;
                      const isActive = finances.lifestyle.level === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => useGameStore.getState().changeLifestyle(level)}
                          aria-pressed={isActive}
                          className={`flex w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 ${
                            isActive
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                              : "border-[#27272a] text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                          }`}
                        >
                          <span className="font-medium">{tier.name}</span>
                          <span
                            className={isActive ? "text-emerald-400" : "text-zinc-500"}
                          >
                            £{tier.config.monthlyCost.toLocaleString()}/mo
                          </span>
                        </button>
                      );
                    },
                  )}
                </CardContent>
              </Card>
            )}

            {/* Career stats */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Career Statistics</CardTitle>
                  <button
                    type="button"
                    className="text-blue-400 hover:text-blue-300 text-sm cursor-pointer"
                    onClick={() => setScreen("analytics")}
                  >
                    View Analytics
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Reports Submitted</span>
                  <span className="text-white font-semibold">{scout.reportsSubmitted}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Successful Finds</span>
                  <span className="text-white font-semibold">{scout.successfulFinds}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Discovery Credits</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">{scout.discoveryCredits.length}</span>
                    <button
                      type="button"
                      className="text-blue-400 hover:text-blue-300 text-sm cursor-pointer"
                      onClick={() => setScreen("discoveries")}
                    >
                      View Discoveries
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Center column ────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Skills */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Observation Skills</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {skillEntries.map(([skill, value]) => {
                  const xp = scout.skillXp?.[skill] ?? 0;
                  const threshold = value * 10;
                  const xpPct =
                    value >= 20 ? 100 : Math.round((xp / threshold) * 100);
                  return (
                    <div key={skill}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-zinc-400">
                          {SKILL_LABELS[skill] ?? skill}
                        </span>
                        <span className="font-mono font-bold text-white">
                          {value}/20
                        </span>
                      </div>
                      <Progress
                        value={value}
                        max={20}
                        indicatorClassName={
                          value >= 15
                            ? "bg-emerald-500"
                            : value >= 10
                              ? "bg-amber-500"
                              : "bg-zinc-500"
                        }
                      />
                      {value < 20 && (
                        <div className="mt-0.5 flex items-center gap-1">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-zinc-600 transition-all"
                              style={{ width: `${xpPct}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-zinc-600">
                            {xp}/{threshold} XP
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Personality attributes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Personality Attributes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {attrEntries.map(([attr, value]) => {
                  const xp = scout.attributeXp?.[attr] ?? 0;
                  const threshold = value * 10;
                  const xpPct =
                    value >= 20 ? 100 : Math.round((xp / threshold) * 100);
                  return (
                    <div key={attr}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-zinc-400">
                          {ATTRIBUTE_LABELS[attr] ?? attr}
                        </span>
                        <span className="font-mono font-bold text-white">
                          {value}/20
                        </span>
                      </div>
                      <Progress
                        value={value}
                        max={20}
                        indicatorClassName="bg-purple-500"
                      />
                      {value < 20 && (
                        <div className="mt-0.5 flex items-center gap-1">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-purple-900 transition-all"
                              style={{ width: `${xpPct}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-zinc-600">
                            {xp}/{threshold} XP
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* ── T8.5: Tools panel ──────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Wrench size={14} className="text-zinc-400" aria-hidden="true" />
                  Scout Tools
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {unlockedTools.length}/{TOOL_DEFINITIONS.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Active bonus summary */}
                {unlockedTools.length > 0 && (() => {
                  const bonuses = getActiveToolBonuses(unlockedTools);
                  const parts: string[] = [];
                  if (bonuses.accuracyBonus) parts.push(`+${Math.round(bonuses.accuracyBonus * 100)}% accuracy`);
                  if (bonuses.confidenceBonus) parts.push(`+${Math.round(bonuses.confidenceBonus * 100)}% confidence`);
                  if (bonuses.fatigueReduction) parts.push(`-${bonuses.fatigueReduction} fatigue/report`);
                  if (bonuses.travelFatigueReduction) parts.push(`-${Math.round(bonuses.travelFatigueReduction * 100)}% travel fatigue`);
                  if (bonuses.relationshipGainBonus) parts.push(`+${Math.round(bonuses.relationshipGainBonus * 100)}% relationship gains`);
                  if (parts.length === 0) return null;
                  return (
                    <div className="mb-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                      <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Active Bonuses</p>
                      <p className="text-xs text-emerald-300">{parts.join(" | ")}</p>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-1 gap-2">
                  {TOOL_DEFINITIONS.map((tool) => {
                    const isUnlocked = unlockedTools.includes(tool.id);
                    const def = getToolDefinition(tool.id);
                    const req = tool.requirements;

                    return (
                      <div
                        key={tool.id}
                        className={`rounded-md border p-3 transition ${
                          isUnlocked
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-[#27272a] bg-[#0f0f0f] opacity-70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {isUnlocked ? (
                                <Badge
                                  variant="success"
                                  className="text-[9px] border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shrink-0"
                                >
                                  Unlocked
                                </Badge>
                              ) : (
                                <Lock
                                  size={10}
                                  className="shrink-0 text-zinc-600"
                                  aria-hidden="true"
                                />
                              )}
                              <span
                                className={`text-xs font-semibold truncate ${
                                  isUnlocked ? "text-white" : "text-zinc-500"
                                }`}
                              >
                                {def?.name ?? tool.id}
                              </span>
                            </div>
                            {isUnlocked && def && (
                              <p className="text-[10px] text-emerald-400 leading-relaxed">
                                {def.bonus}
                              </p>
                            )}
                            {!isUnlocked && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {req.minTier !== undefined && (
                                  <span className="text-[9px] text-zinc-600">
                                    Tier {req.minTier}+
                                  </span>
                                )}
                                {req.minReputation !== undefined && (
                                  <span className="text-[9px] text-zinc-600">
                                    Rep {req.minReputation}+
                                  </span>
                                )}
                                {req.minSkillLevel !== undefined && (
                                  <span className="text-[9px] text-zinc-600">
                                    {req.minSkillLevel.skill} {req.minSkillLevel.level}+
                                  </span>
                                )}
                                {req.minReportsSubmitted !== undefined && (
                                  <span className="text-[9px] text-zinc-600">
                                    {req.minReportsSubmitted} reports
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Equipment loadout */}
                <div className="mt-4">
                  <EquipmentPanel />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right column ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Specialization */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star size={14} className="text-amber-400" aria-hidden="true" />
                  Specialization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {SPEC_LABELS[scout.primarySpecialization]}
                  </span>
                  <Badge variant="warning">Level {scout.specializationLevel}</Badge>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Specialization Mastery</span>
                    <span className="text-amber-400">{scout.specializationLevel}/20</span>
                  </div>
                  <Progress
                    value={scout.specializationLevel}
                    max={20}
                    indicatorClassName="bg-amber-500"
                  />
                </div>
                {scout.unlockedPerks.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-semibold">
                      Unlocked Perks
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {scout.unlockedPerks.map((perk) => (
                        <Badge
                          key={perk}
                          variant="secondary"
                          className="text-[10px] capitalize"
                        >
                          {perk.replace(/([A-Z])/g, " $1").trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Secondary specialization — tier 3+ */}
            {scout.careerTier >= 3 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Star size={14} className="text-blue-400" aria-hidden="true" />
                    Secondary Specialization
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {scout.secondarySpecialization ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {SPEC_LABELS[scout.secondarySpecialization] ??
                          scout.secondarySpecialization}
                      </Badge>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Badge
                        variant="outline"
                        className="border-blue-500/50 text-blue-400 text-[10px]"
                      >
                        Secondary Spec Available
                      </Badge>
                      <div className="grid grid-cols-2 gap-1">
                        {(Object.keys(SPEC_LABELS) as Specialization[])
                          .filter((s) => s !== scout.primarySpecialization)
                          .map((spec) => (
                            <Button
                              key={spec}
                              size="sm"
                              variant="outline"
                              className="text-[10px] h-7 px-2"
                              onClick={() => unlockSecondarySpecialization(spec)}
                            >
                              {SPEC_LABELS[spec]}
                            </Button>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Mastery perks — tier 3+ */}
            {scout.careerTier >= 3 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Mastery Perks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {MASTERY_PERKS.map((perk) => {
                      const isUnlocked = unlockedMasteryPerkIds.has(perk.id);
                      return (
                        <Badge
                          key={perk.id}
                          variant={isUnlocked ? "success" : "secondary"}
                          className={`text-[10px] ${
                            isUnlocked
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                              : "border-zinc-700 bg-zinc-800 text-zinc-500"
                          }`}
                          title={`${perk.requiredSkill} ≥ ${perk.requiredLevel}`}
                        >
                          {perk.name}
                        </Badge>
                      );
                    })}
                  </div>
                  {unlockedMasteryPerks.length === 0 && (
                    <p className="mt-2 text-xs text-zinc-600">
                      Reach skill level 15+ to unlock mastery perks.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* NPC scout summary — tier 4+ */}
            {scout.careerTier >= 4 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users size={14} aria-hidden="true" />
                    Scouting Network
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between rounded-md border border-[#27272a] px-2 py-1.5">
                      <span className="text-zinc-500">Scouts</span>
                      <span className="font-semibold text-white">{npcScoutCount}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-[#27272a] px-2 py-1.5">
                      <span className="text-zinc-500">Pending</span>
                      <span
                        className={`font-semibold ${
                          unreviewedNPCReportCount > 0
                            ? "text-amber-400"
                            : "text-white"
                        }`}
                      >
                        {unreviewedNPCReportCount}
                      </span>
                    </div>
                  </div>
                  {unreviewedNPCReportCount > 0 && (
                    <p className="text-xs text-amber-400">
                      {unreviewedNPCReportCount} report
                      {unreviewedNPCReportCount !== 1 ? "s" : ""} awaiting review
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setScreen("npcManagement")}
                  >
                    Manage Scouts
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Manager relationship — tier 4+ */}
            {scout.careerTier >= 4 && scout.managerRelationship && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <UserCheck size={14} aria-hidden="true" />
                    Manager Relationship
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm font-medium">
                    {scout.managerRelationship.managerName}
                  </p>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Trust</span>
                      <span className="text-blue-400 font-semibold">
                        {Math.round(scout.managerRelationship.trust)}/100
                      </span>
                    </div>
                    <Progress
                      value={scout.managerRelationship.trust}
                      max={100}
                      indicatorClassName="bg-blue-500"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Influence</span>
                      <span className="text-purple-400 font-semibold">
                        {Math.round(scout.managerRelationship.influence)}/100
                      </span>
                    </div>
                    <Progress
                      value={scout.managerRelationship.influence}
                      max={100}
                      indicatorClassName="bg-purple-500"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => meetManager()}
                  >
                    Meet Manager
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Job offers */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Briefcase size={14} aria-hidden="true" />
                  Job Offers
                  {jobOffers.length > 0 && (
                    <Badge className="ml-auto text-[10px]">{jobOffers.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {jobOffers.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No active offers. Build your reputation to attract clubs.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {jobOffers.map((offer) => {
                      const club = getClub(offer.clubId);
                      return (
                        <JobOfferCard
                          key={offer.id}
                          offer={offer}
                          clubName={club?.name ?? offer.clubId}
                          onAccept={() => acceptJob(offer.id)}
                          onDecline={() => declineJob(offer.id)}
                        />
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance reviews */}
            {performanceReviews.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Performance History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[...performanceReviews].reverse().map((review, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-[#27272a] p-3"
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-zinc-500">
                            Season {review.season}
                          </span>
                          <div className="flex items-center gap-1">
                            {outcomeIcon(review.outcome)}
                            <span
                              className={`text-xs font-semibold capitalize ${outcomeColor(review.outcome)}`}
                            >
                              {review.outcome}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-xs text-zinc-400">
                          <span>Reports: {review.reportsSubmitted}</span>
                          <span>Avg Quality: {review.averageQuality}</span>
                          <span>Recs: {review.successfulRecommendations}</span>
                          <span>
                            Rep:{" "}
                            {review.reputationChange > 0 ? "+" : ""}
                            {review.reputationChange}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* ── First-Team: Transfer Career Section ──────────────────────────── */}
        {specialization === "firstTeam" && transferRecords.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              <Target size={13} className="text-blue-400" aria-hidden="true" />
              Transfer Career
            </h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Hit rate summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Scout Hit Rate</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-bold text-white">{hitCount}</p>
                    <p className="mb-1 text-sm text-zinc-500">
                      hits / {completedTransfers.length} rated
                    </p>
                  </div>
                  {hitRate !== null && (
                    <>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#27272a]">
                        <div
                          className={`h-full rounded-full transition-all ${
                            hitRate >= 60 ? "bg-emerald-500" : hitRate >= 40 ? "bg-amber-500" : "bg-red-500"
                          }`}
                          style={{ width: `${hitRate}%` }}
                        />
                      </div>
                      <p className={`text-sm font-semibold ${hitRate >= 60 ? "text-emerald-400" : hitRate >= 40 ? "text-amber-400" : "text-red-400"}`}>
                        {hitRate}% hit rate
                      </p>
                    </>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-1.5">
                      <p className="font-bold text-emerald-400">{hitCount}</p>
                      <p className="text-zinc-500">Hits</p>
                    </div>
                    <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-1.5">
                      <p className="font-bold text-amber-400">{transferRecords.filter((r) => r.outcome === "decent").length}</p>
                      <p className="text-zinc-500">Decent</p>
                    </div>
                    <div className="rounded-md border border-red-500/20 bg-red-500/5 p-1.5">
                      <p className="font-bold text-red-400">{transferRecords.filter((r) => r.outcome === "flop").length}</p>
                      <p className="text-zinc-500">Flops</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Transfer record list */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Transfer Records ({transferRecords.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {[...transferRecords]
                        .sort((a, b) => b.season - a.season || b.week - a.week)
                        .map((record) => {
                          const player = gameState.players[record.playerId];
                          const fromClub = gameState.clubs[record.fromClubId];
                          const toClub = gameState.clubs[record.toClubId];
                          const latestPerf = record.seasonPerformance.length > 0
                            ? record.seasonPerformance[record.seasonPerformance.length - 1]
                            : null;
                          return (
                            <div key={record.id} className="rounded-md border border-[#27272a] p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {player ? `${player.firstName} ${player.lastName}` : "Unknown Player"}
                                  </p>
                                  <p className="text-xs text-zinc-500">
                                    {fromClub?.shortName ?? "?"} → {toClub?.shortName ?? "?"} · S{record.season}
                                    {record.isLoan && <span className="ml-1 text-zinc-600">(Loan)</span>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {latestPerf && (
                                    <span className={`text-xs font-semibold ${
                                      latestPerf.rating >= 70 ? "text-emerald-400" : latestPerf.rating >= 40 ? "text-amber-400" : "text-red-400"
                                    }`}>
                                      {latestPerf.rating}/100
                                    </span>
                                  )}
                                  {record.outcome && (
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] ${
                                        record.outcome === "hit"
                                          ? "border-emerald-500/50 text-emerald-400"
                                          : record.outcome === "decent"
                                          ? "border-amber-500/50 text-amber-400"
                                          : record.outcome === "flop"
                                          ? "border-red-500/50 text-red-400"
                                          : "border-zinc-600 text-zinc-500"
                                      }`}
                                    >
                                      {record.outcome}
                                    </Badge>
                                  )}
                                </div>
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
        )}

        {/* ── Data Scout: Oracle Career Section ────────────────────────────── */}
        {specialization === "data" && predictions.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              <Brain size={13} className="text-violet-400" aria-hidden="true" />
              Prediction Career
            </h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Oracle status summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    Oracle Status
                    {isOracle && (
                      <Badge
                        variant="outline"
                        className="ml-auto border-violet-500/50 bg-violet-500/10 text-violet-400 text-[10px]"
                      >
                        Oracle
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-bold text-white">
                      {predictionAccuracy !== null ? `${predictionAccuracy}%` : "—"}
                    </p>
                    <p className="mb-1 text-sm text-zinc-500">accuracy</p>
                  </div>
                  {predictionAccuracy !== null && (
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#27272a]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          predictionAccuracy >= 70 ? "bg-emerald-500" : predictionAccuracy >= 50 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${predictionAccuracy}%` }}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-md border border-[#27272a] p-1.5">
                      <p className="font-bold text-white">{predictions.length}</p>
                      <p className="text-zinc-500">Total</p>
                    </div>
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-1.5">
                      <p className="font-bold text-emerald-400">{correctPredictions.length}</p>
                      <p className="text-zinc-500">Correct</p>
                    </div>
                    <div className="rounded-md border border-[#27272a] p-1.5">
                      <p className="font-bold text-amber-400">{oracleStreak}</p>
                      <p className="text-zinc-500">Streak</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent predictions list */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Predictions ({predictions.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {[...predictions]
                        .sort((a, b) => b.madeInSeason - a.madeInSeason || b.madeInWeek - a.madeInWeek)
                        .map((pred) => {
                          const player = gameState.players[pred.playerId];
                          return (
                            <div key={pred.id} className="rounded-md border border-[#27272a] p-3">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-white truncate">
                                      {player ? `${player.firstName} ${player.lastName}` : "Unknown"}
                                    </span>
                                    <Badge variant="outline" className="shrink-0 text-[9px] capitalize">
                                      {pred.type}
                                    </Badge>
                                  </div>
                                  <p className="mt-0.5 text-[10px] text-zinc-400 line-clamp-2">{pred.statement}</p>
                                </div>
                                <div className="shrink-0 ml-2">
                                  {pred.resolved ? (
                                    pred.wasCorrect === true ? (
                                      <CheckCircle size={16} className="text-emerald-400" aria-label="Correct" />
                                    ) : (
                                      <AlertTriangle size={16} className="text-red-400" aria-label="Incorrect" />
                                    )
                                  ) : (
                                    <div className="h-4 w-4 rounded-full border border-zinc-600" aria-label="Pending" />
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-[9px] text-zinc-600">
                                <span>S{pred.madeInSeason} W{pred.madeInWeek}</span>
                                <span>Resolves S{pred.resolveBySeason}</span>
                                <span>{Math.round(pred.confidence * 100)}% confidence</span>
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
        )}
      </div>
    </GameLayout>
  );
}
