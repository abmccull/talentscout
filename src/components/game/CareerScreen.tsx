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
} from "lucide-react";
import type {
  JobOffer,
  PerformanceReview,
  ScoutSkill,
  ScoutAttribute,
  Specialization,
} from "@/engine/core/types";
import { MASTERY_PERKS, checkMasteryPerkUnlocks } from "@/engine/specializations/masteryPerks";
import { TOOL_DEFINITIONS, getToolDefinition } from "@/engine/tools/index";
import { purchaseEquipmentUpgrade } from "@/engine/finance";

// ─── Labels ──────────────────────────────────────────────────────────────────

const SKILL_LABELS: Record<ScoutSkill, string> = {
  technicalEye: "Technical Eye",
  physicalAssessment: "Physical Assessment",
  psychologicalRead: "Psychological Read",
  tacticalUnderstanding: "Tactical Understanding",
  dataLiteracy: "Data Literacy",
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
    purchaseEquipment,
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

  // Equipment upgrade availability
  const canUpgradeEquipment =
    finances !== null &&
    finances.equipmentLevel < 5 &&
    purchaseEquipmentUpgrade(finances, 0, 0) !== null;

  if (!gameState || !scout) return null;

  return (
    <GameLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Career</h1>
          <p className="text-sm text-zinc-400">Season {currentSeason}</p>
        </div>

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

            {/* Career stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Career Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(
                  [
                    ["Reports Submitted", scout.reportsSubmitted],
                    ["Successful Finds", scout.successfulFinds],
                    ["Discovery Credits", scout.discoveryCredits.length],
                  ] as [string, number][]
                ).map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">{label}</span>
                    <span className="text-white font-semibold">{val}</span>
                  </div>
                ))}
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

                {/* Equipment upgrade button */}
                {finances && (
                  <div className="mt-4 rounded-md border border-[#27272a] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-white">
                          Equipment Level {finances.equipmentLevel}/5
                        </p>
                        <div className="mt-1 flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              size={10}
                              aria-hidden="true"
                              className={
                                i < finances.equipmentLevel
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-zinc-700"
                              }
                            />
                          ))}
                        </div>
                      </div>
                      {finances.equipmentLevel < 5 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[10px] h-7 px-2"
                          onClick={() => purchaseEquipment()}
                          disabled={!canUpgradeEquipment}
                          aria-label={
                            canUpgradeEquipment
                              ? `Upgrade equipment to level ${finances.equipmentLevel + 1}`
                              : "Cannot afford equipment upgrade"
                          }
                        >
                          {canUpgradeEquipment ? "Upgrade" : "Cannot Afford"}
                        </Button>
                      ) : (
                        <Badge variant="success" className="text-[10px]">
                          Max Level
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      Better equipment improves observation accuracy.
                    </p>
                  </div>
                )}
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
      </div>
    </GameLayout>
  );
}
