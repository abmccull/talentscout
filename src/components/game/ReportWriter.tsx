"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileText, ArrowLeft, TrendingUp, TrendingDown, Minus, Lightbulb, Target, DollarSign, X } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { ConvictionLevel, AttributeReading, PlayerAttribute, SystemFitResult } from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import {
  generateReportContent,
  estimateReportQuality,
} from "@/engine/reports";
import { estimateReportPriceRange, getActiveEquipmentBonuses } from "@/engine/finance";
import type { QualityBreakdown } from "@/engine/reports";
import { starsToAbility } from "@/engine/scout/starRating";
import { StarRating, StarRatingRange } from "@/components/ui/StarRating";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { useAudio } from "@/lib/audio/useAudio";
import { ScreenBackground } from "@/components/ui/screen-background";
import { useTranslations } from "next-intl";
import { ARCHETYPE_LABELS, ARCHETYPE_DESCRIPTIONS } from "@/engine/players/personalityEffects";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { useTutorialStore } from "@/stores/tutorialStore";

const CONVICTION_KEYS: ConvictionLevel[] = ["note", "recommend", "strongRecommend", "tablePound"];

function confidenceColor(confidence: number): string {
  if (confidence >= 0.7) return "text-emerald-400";
  if (confidence >= 0.4) return "text-amber-400";
  return "text-red-400";
}

function qualityScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function qualityScoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function qualityScoreBorder(score: number): string {
  if (score >= 70) return "border-emerald-500/30";
  if (score >= 40) return "border-amber-500/30";
  return "border-red-500/30";
}

const BREAKDOWN_LABELS: Record<keyof QualityBreakdown, { label: string; max: number }> = {
  observationDepth: { label: "Observation depth", max: 25 },
  confidenceLevel: { label: "Evidence confidence", max: 20 },
  convictionFit: { label: "Conviction calibration", max: 15 },
  detail: { label: "Evidence-backed detail", max: 20 },
  scoutSkill: { label: "Scout technique", max: 20 },
};

function formatValue(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n}`;
}

function attrLabel(attr: string): string {
  return attr.replace(/([A-Z])/g, " $1").trim();
}

interface DescriptorOption {
  attributes: PlayerAttribute[];
  descriptor: string;
  estimatedValue: number;
  confidence: number;
}

const MAX_STRENGTHS = 3;
const MAX_WEAKNESSES = 2;

// ---------------------------------------------------------------------------
// Form display helpers (A1 — Form Visibility)
// ---------------------------------------------------------------------------

interface FormDisplay {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: "up" | "down" | "neutral";
}

const FORM_MAP: Record<number, FormDisplay> = {
  3:  { label: "Exceptional Form", color: "text-emerald-400", bgColor: "bg-emerald-500/15", borderColor: "border-emerald-500/40", icon: "up" },
  2:  { label: "Good Form",        color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30", icon: "up" },
  1:  { label: "Decent Form",      color: "text-emerald-300", bgColor: "bg-emerald-500/5",  borderColor: "border-emerald-500/20", icon: "up" },
  0:  { label: "Average Form",     color: "text-zinc-400",    bgColor: "bg-zinc-500/10",    borderColor: "border-zinc-500/20",    icon: "neutral" },
};
FORM_MAP[-1] = { label: "Below Average",  color: "text-red-300",  bgColor: "bg-red-500/5",  borderColor: "border-red-500/20",  icon: "down" };
FORM_MAP[-2] = { label: "Poor Form",      color: "text-red-400",  bgColor: "bg-red-500/10", borderColor: "border-red-500/30",  icon: "down" };
FORM_MAP[-3] = { label: "Terrible Form",  color: "text-red-400",  bgColor: "bg-red-500/15", borderColor: "border-red-500/40",  icon: "down" };

function getFormDisplay(form: number): FormDisplay {
  const clamped = Math.max(-3, Math.min(3, Math.round(form)));
  return FORM_MAP[clamped] ?? FORM_MAP[0];
}

function FormIndicator({ form }: { form: number }) {
  const display = getFormDisplay(form);
  const IconComponent =
    display.icon === "up" ? TrendingUp :
    display.icon === "down" ? TrendingDown :
    Minus;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${display.bgColor} ${display.borderColor}`}
    >
      <IconComponent size={14} className={display.color} aria-hidden="true" />
      <span className={`text-xs font-medium ${display.color}`}>
        {display.label}
      </span>
    </div>
  );
}

export function ReportWriter() {
  const {
    gameState,
    selectedPlayerId,
    setScreen,
    submitReport,
    getPlayerObservations,
    getClub,
  } = useGameStore();

  const { playSFX } = useAudio();
  const t = useTranslations("report");
  const tc = useTranslations("common");
  const [isDirty, setIsDirty] = useState(false);
  const [conviction, setConviction] = useState<ConvictionLevel>("note");
  const [summary, setSummary] = useState("");
  const [selectedStrengths, setSelectedStrengths] = useState<string[]>([]);
  const [selectedWeaknesses, setSelectedWeaknesses] = useState<string[]>([]);
  const draftApplied = useRef(false);

  // Derive data before any early return
  const resolvedPlayer = gameState && selectedPlayerId
    ? resolvePlayerEntity(gameState, selectedPlayerId)
    : null;
  const player = resolvedPlayer?.player;
  const canonicalPlayerId = resolvedPlayer?.playerId ?? selectedPlayerId ?? undefined;
  const club = player ? getClub(player.clubId) : undefined;
  const observations = useMemo(
    () => (canonicalPlayerId ? getPlayerObservations(canonicalPlayerId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canonicalPlayerId, gameState?.observations]
  );

  // System fit data for first-team scouts
  const systemFit: SystemFitResult | undefined = useMemo(() => {
    if (!gameState || !canonicalPlayerId) return undefined;
    if (gameState.scout.primarySpecialization !== "firstTeam") return undefined;
    const clubId = gameState.scout.currentClubId ?? "";
    const key = `${canonicalPlayerId}:${clubId}`;
    return gameState.systemFitCache[key] ?? undefined;
  }, [canonicalPlayerId, gameState]);

  const merged = useMemo<Map<string, AttributeReading>>(() => {
    const map = new Map<string, AttributeReading>();
    for (const obs of observations) {
      for (const reading of obs.attributeReadings) {
        const key = String(reading.attribute);
        const existing = map.get(key);
        if (!existing || reading.confidence > existing.confidence) {
          map.set(key, reading);
        }
      }
    }
    return map;
  }, [observations]);

  const assessmentsByDomain = useMemo(() => {
    const map = new Map<string, Array<[string, AttributeReading]>>();
    for (const [attr, reading] of merged.entries()) {
      const domain = ATTRIBUTE_DOMAINS[attr as keyof typeof ATTRIBUTE_DOMAINS] ?? "technical";
      if (!map.has(domain)) map.set(domain, []);
      map.get(domain)!.push([attr, reading]);
    }
    return map;
  }, [merged]);

  const contexts = useMemo(
    () => [...new Set(observations.map((o) => o.context))],
    [observations]
  );

  // Generate the engine draft
  const draft = useMemo(() => {
    if (!player || !gameState || observations.length === 0) return null;
    return generateReportContent(player, observations, gameState.scout);
  }, [player, gameState, observations]);

  // Compute average confidence and perceived CA from merged readings
  const { avgConfidence, perceivedCA } = useMemo(() => {
    const readings = Array.from(merged.values());
    if (readings.length === 0) return { avgConfidence: 0, perceivedCA: undefined };
    const avg = readings.reduce((s, r) => s + r.confidence, 0) / readings.length;
    const weightedAvg = readings.reduce((s, r) => s + r.perceivedValue, 0) / readings.length;
    return { avgConfidence: avg, perceivedCA: Math.round(weightedAvg * 10) };
  }, [merged]);

  // Live quality preview -- updates whenever relevant inputs change
  const qualityPreview = useMemo(
    () =>
      estimateReportQuality({
        observationCount: observations.length,
        avgConfidence,
        convictionLevel: conviction,
        strengthCount: selectedStrengths.length,
        weaknessCount: selectedWeaknesses.length,
        availableStrengthCount: draft?.suggestedStrengthClaims.length,
        availableWeaknessCount: draft?.suggestedWeaknessClaims.length,
        scoutSkills: gameState?.scout.skills ?? {},
        assessedAttributeCount: merged.size,
        position: player?.position,
        perceivedCA,
        age: player?.age,
        perceivedPA: draft?.perceivedPARange
          ? starsToAbility((draft.perceivedPARange[0] + draft.perceivedPARange[1]) / 2)
          : undefined,
      }),
    [
      observations.length,
      avgConfidence,
      conviction,
      selectedStrengths.length,
      selectedWeaknesses.length,
      draft?.suggestedStrengthClaims.length,
      draft?.suggestedWeaknessClaims.length,
      gameState?.scout.skills,
      merged.size,
      player?.position,
      perceivedCA,
      player?.age,
      draft?.perceivedPARange,
    ]
  );

  const strengthOptions = useMemo<DescriptorOption[]>(
    () => draft?.suggestedStrengthClaims ?? [],
    [draft],
  );

  const weaknessOptions = useMemo<DescriptorOption[]>(
    () => draft?.suggestedWeaknessClaims ?? [],
    [draft],
  );

  const strengthClaimsByDescriptor = useMemo(
    () => new Map(strengthOptions.map((option) => [option.descriptor, option])),
    [strengthOptions],
  );

  const weaknessClaimsByDescriptor = useMemo(
    () => new Map(weaknessOptions.map((option) => [option.descriptor, option])),
    [weaknessOptions],
  );

  const selectedStrengthAttributes = useMemo(
    () => new Set(
      selectedStrengths
        .flatMap((descriptor) => strengthClaimsByDescriptor.get(descriptor)?.attributes ?? []),
    ),
    [selectedStrengths, strengthClaimsByDescriptor],
  );

  const selectedWeaknessAttributes = useMemo(
    () => new Set(
      selectedWeaknesses
        .flatMap((descriptor) => weaknessClaimsByDescriptor.get(descriptor)?.attributes ?? []),
    ),
    [selectedWeaknesses, weaknessClaimsByDescriptor],
  );

  // Equipment report quality bonus for display
  const equipmentReportQualityBonus = useMemo(() => {
    if (!gameState?.finances?.equipment) return 0;
    const bonuses = getActiveEquipmentBonuses(gameState.finances.equipment.loadout);
    return bonuses.reportQuality;
  }, [gameState?.finances?.equipment]);

  // Live pricing estimate for independent scouts
  const isIndependent = gameState?.scout.careerPath === "independent";
  const priceEstimate = useMemo(() => {
    if (!isIndependent || !gameState?.finances) return null;
    return estimateReportPriceRange(
      conviction,
      qualityPreview.score,
      gameState.scout.reputation,
      gameState.finances.marketTemperature,
    );
  }, [isIndependent, conviction, qualityPreview.score, gameState?.scout.reputation, gameState?.finances]);

  // Pre-populate form state from draft (one-shot) and auto-generate summary
  useEffect(() => {
    if (!draft || draftApplied.current) return;
    draftApplied.current = true;
    const nextStrengths = draft.suggestedStrengthClaims
      .slice(0, MAX_STRENGTHS)
      .map((claim) => claim.descriptor);
    const selectedStrengthAttrs = new Set(
      nextStrengths
        .flatMap((descriptor) => strengthClaimsByDescriptor.get(descriptor)?.attributes ?? []),
    );
    const nextWeaknesses = draft.suggestedWeaknessClaims
      .filter((claim) => {
        return !claim.attributes.some((attribute) => selectedStrengthAttrs.has(attribute));
      })
      .slice(0, MAX_WEAKNESSES)
      .map((claim) => claim.descriptor);
    if (nextStrengths.length > 0) {
      setSelectedStrengths(nextStrengths);
    }
    if (nextWeaknesses.length > 0) {
      setSelectedWeaknesses(nextWeaknesses);
    }
    // Auto-generate summary
    const lines: string[] = [];
    lines.push(
      `Based on ${observations.length} observation${observations.length !== 1 ? "s" : ""}, ${player?.firstName} ${player?.lastName} presents as a ${draft.perceivedCAStars ? `${draft.perceivedCAStars}-star` : "developing"} ${player?.position}.`
    );
    if (nextStrengths.length > 0) {
      lines.push(`Key strengths include ${nextStrengths.slice(0, 2).map(s => {
        const attr = strengthClaimsByDescriptor.get(s)?.attributes[0];
        return attr ? attrLabel(attr).toLowerCase() : s.toLowerCase().split(" — ")[0];
      }).join(" and ")}.`);
    }
    if (nextWeaknesses.length > 0) {
      lines.push(`Areas of concern: ${nextWeaknesses.slice(0, 2).map(w => {
        const attr = weaknessClaimsByDescriptor.get(w)?.attributes[0];
        return attr ? attrLabel(attr).toLowerCase() : w.toLowerCase().split(" — ")[0];
      }).join(" and ")}.`);
    }
    const revealedTraits = player?.playerTraitsRevealed ?? [];
    if (revealedTraits.length > 0) {
      const traitStrs = revealedTraits.slice(0, 2).map(t => t.replace(/([A-Z])/g, " $1").trim().toLowerCase());
      lines.push(`Notable tendencies: ${traitStrs.join(", ")}.`);
    }
    if (player?.personalityProfile && !player.personalityProfile.hiddenUntilRevealed) {
      const archetypeLabel = ARCHETYPE_LABELS[player.personalityProfile.archetype];
      lines.push(`Character: ${archetypeLabel}.`);
      if (player.personalityProfile.dressingRoomImpact <= -2) {
        lines.push("Warning: potential dressing room disruption risk.");
      } else if (player.personalityProfile.dressingRoomImpact >= 2) {
        lines.push("Positive dressing room influence expected.");
      }
      if (player.personalityProfile.bigMatchModifier >= 2) {
        lines.push("Thrives in big-match scenarios.");
      } else if (player.personalityProfile.bigMatchModifier <= -1) {
        lines.push("May struggle in high-pressure fixtures.");
      }
    }
    if (draft.perceivedPARange) {
      lines.push(`Potential ceiling estimated at ${draft.perceivedPARange[0]}–${draft.perceivedPARange[1]} stars.`);
    }
    setSummary(lines.join(" "));
    playSFX("pen-scribble");
  }, [
    draft,
    player,
    observations.length,
    strengthClaimsByDescriptor,
    weaknessClaimsByDescriptor,
    playSFX,
  ]);

  // Warn the user if they try to close/reload the tab while the form is dirty
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  // Early return after all hooks — show a recoverable state instead of blank
  if (!gameState || !selectedPlayerId || !player) {
    return (
      <GameLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <AlertTriangle size={32} className="text-amber-400 mb-3" />
          <p className="text-sm text-zinc-400 mb-4">
            No player selected for the report. Please go back and select a player first.
          </p>
          <Button variant="outline" onClick={() => setScreen("dashboard")}>
            <ArrowLeft size={14} className="mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </GameLayout>
    );
  }

  const toggleStrength = (option: DescriptorOption) => {
    const isSelected = selectedStrengths.includes(option.descriptor);
    const canAdd = isSelected || selectedStrengths.length < MAX_STRENGTHS;
    if (!canAdd) return;

    setIsDirty(true);
    useTutorialStore.getState().completeMilestone("wroteReport");
    setSelectedStrengths((current) =>
      isSelected
        ? current.filter((descriptor) => descriptor !== option.descriptor)
        : [...current, option.descriptor]
    );
    if (!isSelected) {
      setSelectedWeaknesses((current) =>
        current.filter((descriptor) => {
          const weakness = weaknessClaimsByDescriptor.get(descriptor);
          return !weakness?.attributes.some((attribute) => option.attributes.includes(attribute));
        }),
      );
    }
    playSFX("page-turn");
  };

  const toggleWeakness = (option: DescriptorOption) => {
    const isSelected = selectedWeaknesses.includes(option.descriptor);
    const canAdd = isSelected || selectedWeaknesses.length < MAX_WEAKNESSES;
    if (!canAdd) return;

    setIsDirty(true);
    useTutorialStore.getState().completeMilestone("wroteReport");
    setSelectedWeaknesses((current) =>
      isSelected
        ? current.filter((descriptor) => descriptor !== option.descriptor)
        : [...current, option.descriptor]
    );
    if (!isSelected) {
      setSelectedStrengths((current) =>
        current.filter((descriptor) => {
          const strength = strengthClaimsByDescriptor.get(descriptor);
          return !strength?.attributes.some((attribute) => option.attributes.includes(attribute));
        }),
      );
    }
    playSFX("page-turn");
  };

  const handleBack = () => {
    if (isDirty && !window.confirm(t("unsavedWarning"))) {
      return;
    }
    setScreen("playerProfile");
  };

  const handleSubmit = () => {
    if (!summary.trim()) return;
    setIsDirty(false);
    playSFX("report-submit");
    submitReport(conviction, summary.trim(), selectedStrengths, selectedWeaknesses);
  };

  const isTablePound = conviction === "tablePound";
  const canSubmit = summary.trim().length > 0 && observations.length > 0;

  return (
    <GameLayout>
      <div className="relative min-h-full p-4 sm:p-6 lg:p-8">
        <ScreenBackground src="/images/backgrounds/reports-desk.png" opacity={0.82} />
        <div className="relative z-10 mx-auto max-w-6xl">
        <button
          onClick={handleBack}
          className="mb-4 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          aria-label="Back to player profile"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {t("backToProfile")}
        </button>

        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-white/10 bg-[#10151b]/95 p-5 shadow-xl shadow-black/20 sm:p-6">
          <PlayerAvatar
            playerId={player.id}
            nationality={player.nationality}
            size={64}
          />
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Scouting judgment</p>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t("title")}</h1>
            <p className="text-sm text-zinc-400 mt-1">
              {player.firstName} {player.lastName} — {player.position}, Age {player.age}
              {club ? ` — ${club.name}` : ""}
            </p>
          </div>
        </div>

        {observations.length === 0 && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle size={16} aria-hidden="true" />
              {t("noObservations")}
            </p>
          </div>
        )}

        <div className="space-y-6">
          <Card data-tutorial-id="report-conviction" className={`border ${qualityScoreBorder(qualityPreview.score)} bg-[#10151b]/98 shadow-2xl shadow-black/25 lg:sticky lg:top-4 lg:z-20`}>
            <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
              <div>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Your recommendation</p>
                    <h2 className="mt-1 text-xl font-bold text-white">State the call before the supporting detail</h2>
                  </div>
                  <Badge variant="outline" className={`${qualityScoreBorder(qualityPreview.score)} ${qualityScoreColor(qualityPreview.score)}`}>
                    Craft {qualityPreview.score}/100
                  </Badge>
                </div>
                <label htmlFor="report-summary" className="text-sm font-semibold text-zinc-200">
                  Final scouting judgment
                </label>
                <p id="report-summary-help" className="mt-1 text-xs leading-5 text-zinc-400">
                  Evidence can suggest language, but this is your professional opinion. Edit it until it says exactly what you are prepared to defend.
                </p>
                <textarea
                  id="report-summary"
                  value={summary}
                  onChange={(event) => {
                    setIsDirty(true);
                    setSummary(event.target.value);
                  }}
                  aria-describedby="report-summary-help"
                  rows={5}
                  placeholder="What should the receiving club do, and why?"
                  className="mt-3 min-h-32 w-full resize-y rounded-xl border border-white/10 bg-black/25 p-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/40"
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Conviction</p>
                    <p className="mt-1 text-sm text-zinc-300">How much reputation belongs behind this call?</p>
                  </div>
                  <span className={`text-xs font-semibold ${canSubmit ? "text-emerald-300" : "text-amber-300"}`}>
                    {canSubmit ? "Ready to file" : "Needs judgment"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Report conviction">
                  {CONVICTION_KEYS.map((key) => (
                    <button
                      key={`decision-${key}`}
                      type="button"
                      role="radio"
                      aria-checked={conviction === key}
                      onClick={() => {
                        setIsDirty(true);
                        setConviction(key);
                        useTutorialStore.getState().completeMilestone("wroteReport");
                        playSFX("page-turn");
                      }}
                      className={`min-h-12 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                        conviction === key
                          ? key === "tablePound"
                            ? "border-red-400/60 bg-red-400/10 text-red-200"
                            : "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                          : "border-white/10 bg-white/[0.025] text-zinc-300 hover:border-white/20"
                      }`}
                    >
                      {t(`convictions.${key}`)}
                    </button>
                  ))}
                </div>
                {isTablePound && (
                  <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-xs leading-5 text-red-200">
                    This stakes meaningful reputation on the outcome. Use it only when the evidence deserves that risk.
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2" data-tutorial-id="report-submit">
                  <Button className="min-h-11" variant="outline" onClick={handleBack}>
                    {tc("cancel")}
                  </Button>
                  <Button
                    className={`min-h-11 ${isTablePound ? "bg-red-600 hover:bg-red-700" : ""}`}
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                  >
                    <FileText size={14} className="mr-2" aria-hidden="true" />
                    {t("submitReport")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <details open className="group rounded-2xl border border-white/10 bg-[#11161c]/95 p-4 sm:p-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
              <div>
                <span className="text-sm font-semibold text-white">Evidence and claim builder</span>
                <span className="mt-1 block text-xs text-zinc-400">Review observations, ability ranges, form, attributes, strengths, weaknesses, and character.</span>
              </div>
              <span className="text-xs font-semibold text-emerald-300 group-open:hidden">Open evidence</span>
              <span className="hidden text-xs font-semibold text-emerald-300 group-open:inline">Hide evidence</span>
            </summary>
            <div className="mt-5 space-y-6">
          {/* Observation summary */}
          <Card data-tutorial-id="report-observation-summary">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("observationSummary")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <div>
                <p className="text-xs text-zinc-500">{t("sessions")}</p>
                <p className="text-xl font-bold text-emerald-400">{observations.length}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">{t("attributesRead")}</p>
                <p className="text-xl font-bold">{merged.size}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">{t("contexts")}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {contexts.map((ctx) => (
                    <Badge key={ctx} variant="secondary" className="text-[10px] capitalize">
                      {ctx.replace(/([A-Z])/g, " $1").trim()}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ability Overview */}
          {draft && (draft.perceivedCAStars != null || draft.estimatedValue > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Ability Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-6">
                  {draft.perceivedCAStars != null && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1.5">Current Ability</p>
                      <StarRating rating={draft.perceivedCAStars} size="lg" />
                    </div>
                  )}
                  {draft.perceivedPARange && (
                    <div>
                      <Tooltip content="Estimated potential ceiling based on observed raw attributes and age profile" side="top">
                        <p className="text-xs text-zinc-500 mb-1.5 cursor-help underline decoration-dotted underline-offset-2">
                          Potential Range
                        </p>
                      </Tooltip>
                      <StarRatingRange
                        low={draft.perceivedPARange[0]}
                        high={draft.perceivedPARange[1]}
                        size="lg"
                      />
                    </div>
                  )}
                  {draft.estimatedValue > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1.5">Est. Market Value</p>
                      <p className="text-lg font-bold text-emerald-400">
                        {formatValue(draft.estimatedValue)}
                      </p>
                      {draft.estimatedValueRange && (
                        <p className="mt-1 text-xs text-zinc-500">
                          Plausible range {formatValue(draft.estimatedValueRange[0])}–{formatValue(draft.estimatedValueRange[1])}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {player.position === "GK" && player.age <= 20 && (
                  <p className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200/80">
                    Youth Early Access keeps goalkeeper conclusions conservative: this report only claims observed general attributes and does not infer unobserved shot-stopping, handling, or command.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {draft && draft.comparisonSuggestions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Comparison Angles</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {draft.comparisonSuggestions.map((suggestion) => (
                    <li
                      key={suggestion}
                      className="flex items-start gap-2 text-sm leading-relaxed text-zinc-300"
                    >
                      <Lightbulb
                        size={14}
                        className="mt-0.5 shrink-0 text-amber-400"
                        aria-hidden="true"
                      />
                      <span>{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Current Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Current Form</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-3">
                <FormIndicator form={player.form} />
                <span className="text-xs text-zinc-500">
                  Recent performances are reflected in the valuation range.
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Form can affect player valuation. Hot-form players may cost more.
              </p>
            </CardContent>
          </Card>

          {/* Attribute assessments */}
          {merged.size > 0 && (
            <Card data-tutorial-id="report-attributes">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t("attributeAssessments")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.from(assessmentsByDomain.entries()).map(([domain, attrs]) => (
                    <div key={domain}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 capitalize">
                        {domain}
                      </p>
                      <div className="space-y-1.5">
                        {attrs.map(([attr, reading]) => (
                          <div key={attr} className="flex items-center gap-3">
                            <span className="w-32 shrink-0 text-xs capitalize text-zinc-400">
                              {attrLabel(attr)}
                            </span>
                            <div className="flex-1 relative h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                              <div
                                className="absolute left-0 top-0 h-full rounded-full bg-emerald-500"
                                style={{ width: `${(reading.perceivedValue / 20) * 100}%` }}
                              />
                            </div>
                            <span className="w-10 shrink-0 text-right text-xs font-mono font-bold text-white">
                              {reading.perceivedValue}/20
                            </span>
                            <Tooltip
                              content="Confidence based on number and quality of observations for this attribute"
                              side="top"
                            >
                              <span
                                className={`shrink-0 text-xs cursor-help ${confidenceColor(reading.confidence)}`}
                              >
                                {Math.round(reading.confidence * 100)}% certainty
                              </span>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Strengths */}
          <Card data-tutorial-id="report-strengths">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {t("strengths")} ({selectedStrengths.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200/80">
                Select up to {MAX_STRENGTHS} strengths from observed attributes. Removing a suggestion is allowed; adding one requires supporting evidence below.
              </div>
              {selectedStrengths.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedStrengths.map((s) => {
                    const claim = strengthClaimsByDescriptor.get(s);
                    return (
                      <div
                        key={s}
                        className="flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2"
                      >
                        <span className="text-xs text-emerald-300">{s}</span>
                        {claim && (
                          <Badge variant="secondary" className="shrink-0 text-[10px] bg-emerald-500/20 text-emerald-400">
                            {claim.attributes.map(attrLabel).join(" + ")}
                          </Badge>
                        )}
                        <button
                          onClick={() => {
                            const option = strengthOptions.find((candidate) => candidate.descriptor === s);
                            if (option) {
                              toggleStrength(option);
                              return;
                            }
                            setIsDirty(true);
                            setSelectedStrengths((current) => current.filter((descriptor) => descriptor !== s));
                          }}
                          className="rounded p-0.5 text-emerald-300/70 transition hover:bg-emerald-500/20 hover:text-white"
                          aria-label={`Remove strength ${s}`}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">
                  No standout strengths detected from observations.
                </p>
              )}
              {strengthOptions.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Evidence-backed options
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {strengthOptions.map((option) => {
                      const isSelected = selectedStrengths.includes(option.descriptor);
                      const blockedByWeakness = option.attributes.some((attribute) =>
                        selectedWeaknessAttributes.has(attribute)
                      ) && !isSelected;
                      const atLimit = selectedStrengths.length >= MAX_STRENGTHS && !isSelected;
                      return (
                        <button
                          key={option.descriptor}
                          onClick={() => toggleStrength(option)}
                          disabled={blockedByWeakness || atLimit}
                          className={`rounded-lg border px-3 py-3 text-left transition ${
                            isSelected
                              ? "border-emerald-500/60 bg-emerald-500/10"
                              : "border-[#27272a] bg-[#141414] hover:border-emerald-500/30"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-sm font-medium ${isSelected ? "text-emerald-300" : "text-white"}`}>
                              {option.descriptor}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {option.attributes.map(attrLabel).join(" + ")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {option.estimatedValue}/20 observed • {Math.round(option.confidence * 100)}% certainty
                          </p>
                          {blockedByWeakness && (
                            <p className="mt-1 text-[11px] text-amber-400">
                              Remove the weakness tag for this attribute first.
                            </p>
                          )}
                          {atLimit && !blockedByWeakness && (
                            <p className="mt-1 text-[11px] text-zinc-500">
                              Strength limit reached.
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weaknesses */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {t("weaknesses")} ({selectedWeaknesses.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200/80">
                Select up to {MAX_WEAKNESSES} weaknesses from observed attributes. Unsupported concerns should stay out of the report.
              </div>
              {selectedWeaknesses.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedWeaknesses.map((w) => {
                    const claim = weaknessClaimsByDescriptor.get(w);
                    return (
                      <div
                        key={w}
                        className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2"
                      >
                        <span className="text-xs text-red-300">{w}</span>
                        {claim && (
                          <Badge variant="secondary" className="shrink-0 text-[10px] bg-red-500/20 text-red-400">
                            {claim.attributes.map(attrLabel).join(" + ")}
                          </Badge>
                        )}
                        <button
                          onClick={() => {
                            const option = weaknessOptions.find((candidate) => candidate.descriptor === w);
                            if (option) {
                              toggleWeakness(option);
                              return;
                            }
                            setIsDirty(true);
                            setSelectedWeaknesses((current) => current.filter((descriptor) => descriptor !== w));
                          }}
                          className="rounded p-0.5 text-red-300/70 transition hover:bg-red-500/20 hover:text-white"
                          aria-label={`Remove weakness ${w}`}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">
                  No notable weaknesses detected from observations.
                </p>
              )}
              {weaknessOptions.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Evidence-backed options
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {weaknessOptions.map((option) => {
                      const isSelected = selectedWeaknesses.includes(option.descriptor);
                      const blockedByStrength = option.attributes.some((attribute) =>
                        selectedStrengthAttributes.has(attribute)
                      ) && !isSelected;
                      const atLimit = selectedWeaknesses.length >= MAX_WEAKNESSES && !isSelected;
                      return (
                        <button
                          key={option.descriptor}
                          onClick={() => toggleWeakness(option)}
                          disabled={blockedByStrength || atLimit}
                          className={`rounded-lg border px-3 py-3 text-left transition ${
                            isSelected
                              ? "border-red-500/60 bg-red-500/10"
                              : "border-[#27272a] bg-[#141414] hover:border-red-500/30"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-sm font-medium ${isSelected ? "text-red-300" : "text-white"}`}>
                              {option.descriptor}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {option.attributes.map(attrLabel).join(" + ")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {option.estimatedValue}/20 observed • {Math.round(option.confidence * 100)}% certainty
                          </p>
                          {blockedByStrength && (
                            <p className="mt-1 text-[11px] text-amber-400">
                              Remove the strength tag for this attribute first.
                            </p>
                          )}
                          {atLimit && !blockedByStrength && (
                            <p className="mt-1 text-[11px] text-zinc-500">
                              Weakness limit reached.
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Character Assessment (F9) */}
          {player.personalityProfile && !player.personalityProfile.hiddenUntilRevealed && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Character Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Personality Type:</span>
                    <Tooltip content={ARCHETYPE_DESCRIPTIONS[player.personalityProfile.archetype]} side="top">
                      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 cursor-help underline decoration-dotted underline-offset-2">
                        {ARCHETYPE_LABELS[player.personalityProfile.archetype]}
                      </span>
                    </Tooltip>
                  </div>
                  {player.personalityProfile.revealedTraits.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {player.personalityProfile.revealedTraits.map((trait) => (
                        <Badge key={trait} variant="secondary" className="text-[10px] capitalize">
                          {trait.replace(/([A-Z])/g, " $1").trim()}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="rounded-lg border border-[#27272a] bg-[#141414] p-3">
                    <p className="text-xs font-semibold text-zinc-400 mb-2">Character Risk Assessment</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-zinc-500">Dressing Room: </span>
                        <span className={player.personalityProfile.dressingRoomImpact >= 2 ? "text-emerald-400" : player.personalityProfile.dressingRoomImpact <= -1 ? "text-red-400" : "text-zinc-300"}>
                          {player.personalityProfile.dressingRoomImpact >= 2 ? "Low Risk" : player.personalityProfile.dressingRoomImpact <= -1 ? "High Risk" : "Moderate"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Form Stability: </span>
                        <span className={player.personalityProfile.formVolatility <= 0.3 ? "text-emerald-400" : player.personalityProfile.formVolatility >= 0.7 ? "text-red-400" : "text-amber-400"}>
                          {player.personalityProfile.formVolatility <= 0.3 ? "Stable" : player.personalityProfile.formVolatility >= 0.7 ? "Unpredictable" : "Variable"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Retention: </span>
                        <span className={player.personalityProfile.transferWillingness <= 0.3 ? "text-emerald-400" : player.personalityProfile.transferWillingness >= 0.7 ? "text-red-400" : "text-amber-400"}>
                          {player.personalityProfile.transferWillingness <= 0.3 ? "Likely to Stay" : player.personalityProfile.transferWillingness >= 0.7 ? "Flight Risk" : "Moderate"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Big Matches: </span>
                        <span className={player.personalityProfile.bigMatchModifier >= 1 ? "text-emerald-400" : player.personalityProfile.bigMatchModifier <= -1 ? "text-red-400" : "text-zinc-300"}>
                          {player.personalityProfile.bigMatchModifier >= 1 ? "Reliable" : player.personalityProfile.bigMatchModifier <= -1 ? "Concern" : "Average"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

            </div>
          </details>

          {/* Written summary */}
          <Card className="hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("scoutSummary")}</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.trim() ? (
                <div className="rounded-md border border-[#27272a] bg-[#141414] p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {summary}
                </div>
              ) : (
                <p className="text-xs text-zinc-600 italic">
                  Summary will be generated automatically from observations.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quality preview */}
          {observations.length > 0 && (
            <Card className="hidden">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp size={14} className="text-zinc-400" aria-hidden="true" />
                   Craft Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-6">
                  {/* Score circle */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${qualityScoreBorder(qualityPreview.score)}`}
                    >
                      <span className={`text-2xl font-bold ${qualityScoreColor(qualityPreview.score)}`}>
                        {qualityPreview.score}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500">/ 100</span>
                  </div>

                  {/* Breakdown bars */}
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {(Object.keys(BREAKDOWN_LABELS) as Array<keyof QualityBreakdown>).map((key) => {
                      const { label, max } = BREAKDOWN_LABELS[key];
                      const value = qualityPreview.breakdown[key];
                      const pct = (value / max) * 100;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 text-[11px] text-zinc-400 truncate">
                            {label}
                          </span>
                          <div className="flex-1 relative h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                            <div
                              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${qualityScoreBg(qualityPreview.score)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right text-[11px] font-mono text-zinc-400">
                            {value}/{max}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Improvement hints */}
                {qualityPreview.hints.length > 0 && (
                  <div className="mt-3 rounded-md border border-[#27272a] bg-[#141414] p-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 mb-1.5">
                      <Lightbulb size={12} aria-hidden="true" />
                      Tips to improve
                    </p>
                    <ul className="space-y-1">
                      {qualityPreview.hints.map((hint) => (
                        <li key={hint} className="text-[11px] text-zinc-400 leading-tight pl-3.5 relative">
                          <span className="absolute left-0 top-0 text-zinc-600" aria-hidden="true">
                            &bull;
                          </span>
                          {hint}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {equipmentReportQualityBonus > 0 && (
                  <p className="mt-2 text-[10px] text-emerald-500">
                    +{Math.round(equipmentReportQualityBonus * 100)}% from equipment
                  </p>
                )}

                <p className="mt-2 text-[10px] text-zinc-600 italic">
                  This grades report craft. Accuracy resolves later from the player&apos;s career.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Pricing Guidance (independent scouts only) */}
          {priceEstimate && (
            <Card className="border-emerald-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <DollarSign size={14} className="text-emerald-400" aria-hidden="true" />
                  Price Estimate
                  <Badge
                    variant="outline"
                    className={`ml-auto text-[10px] ${
                      priceEstimate.marketTemperature === "hot" || priceEstimate.marketTemperature === "deadline"
                        ? "text-orange-400 border-orange-500/40"
                        : priceEstimate.marketTemperature === "cold"
                        ? "text-blue-400 border-blue-500/40"
                        : "text-zinc-400 border-zinc-500/40"
                    }`}
                  >
                    {priceEstimate.marketTemperature === "deadline" ? "Deadline day" : `${priceEstimate.marketTemperature} market`}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-[#27272a] bg-[#141414] p-2.5 text-center">
                    <p className="text-[10px] text-zinc-500 mb-1">Non-Exclusive</p>
                    <p className="text-lg font-bold text-emerald-400">{formatValue(priceEstimate.nonExclusive)}</p>
                  </div>
                  <div className="rounded-md border border-amber-500/20 bg-amber-950/10 p-2.5 text-center">
                    <p className="text-[10px] text-amber-400/70 mb-1">Exclusive</p>
                    <p className="text-lg font-bold text-amber-400">{formatValue(priceEstimate.exclusive)}</p>
                  </div>
                </div>

                {/* Range bar */}
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>{formatValue(priceEstimate.low)}</span>
                    <span>{formatValue(priceEstimate.high)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#27272a]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-amber-500 transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.round(((priceEstimate.nonExclusive - priceEstimate.low) / Math.max(1, priceEstimate.high - priceEstimate.low)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                {qualityPreview.score < 40 && (
                  <p className="text-[10px] text-amber-400/80 italic">
                    Improve report craft to increase sale value
                  </p>
                )}
                <p className="text-[10px] text-zinc-600 italic">
                  Calibrated conviction &amp; stronger craft = higher sale price
                </p>
              </CardContent>
            </Card>
          )}

          {/* System Fit compact display (first-team scouts only) */}
          {systemFit && (
            <Card className="border-blue-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Target size={14} className="text-blue-400" aria-hidden="true" />
                  System Fit
                  <span
                    className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      systemFit.overallFit >= 70
                        ? "bg-emerald-500/15 text-emerald-400"
                        : systemFit.overallFit >= 40
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-red-500/15 text-red-400"
                    }`}
                  >
                    {systemFit.overallFit}%
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Compact dimension bars */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {(
                    [
                      ["Position", systemFit.positionFit],
                      ["Role", systemFit.roleFit],
                      ["Tactical", systemFit.tacticalFit],
                      ["Age", systemFit.ageFit],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="w-14 shrink-0 text-[10px] text-zinc-500">{label}</span>
                      <div className="flex-1 h-1 rounded-full bg-[#27272a] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-red-500"
                          }`}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                      <span className={`w-8 text-right text-[10px] font-mono font-semibold ${
                        value >= 70 ? "text-emerald-400" : value >= 40 ? "text-amber-400" : "text-red-400"
                      }`}>
                        {value}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Top strengths & weaknesses */}
                <div className="flex gap-4 text-[11px] leading-tight">
                  {systemFit.fitStrengths.length > 0 && (
                    <div className="flex-1 min-w-0">
                      {systemFit.fitStrengths.slice(0, 2).map((s, i) => (
                        <p key={i} className="text-emerald-400 truncate">+ {s}</p>
                      ))}
                    </div>
                  )}
                  {systemFit.fitWeaknesses.length > 0 && (
                    <div className="flex-1 min-w-0">
                      {systemFit.fitWeaknesses.slice(0, 2).map((w, i) => (
                        <p key={i} className="text-red-400 truncate">- {w}</p>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Conviction level */}
          <Card className="hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                <Tooltip content={t("convictionTooltip")} side="top">
                  <span>{t("convictionLevel")}</span>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                role="radiogroup"
                aria-label="Conviction level"
              >
                {CONVICTION_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      setIsDirty(true);
                      setConviction(key);
                      useTutorialStore.getState().completeMilestone("wroteReport");
                      playSFX("page-turn");
                    }}
                    role="radio"
                    aria-checked={conviction === key}
                    className={`rounded-lg border p-3 text-left transition ${
                      conviction === key
                        ? key === "tablePound"
                          ? "border-red-500 bg-red-500/10"
                          : key === "strongRecommend"
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-zinc-500 bg-zinc-500/10"
                        : "border-[#27272a] bg-[#141414] hover:border-zinc-600"
                    }`}
                  >
                    <p
                      className={`text-sm font-semibold mb-1 ${
                        key === "tablePound" && conviction === key
                          ? "text-red-400"
                          : key === "strongRecommend" && conviction === key
                          ? "text-emerald-400"
                          : "text-white"
                      }`}
                    >
                      {key === "tablePound" ? (
                        <Tooltip content={t("tablePoundTooltip")} side="top">
                          <span className="underline decoration-dotted underline-offset-2 cursor-help">{t(`convictions.${key}`)}</span>
                        </Tooltip>
                      ) : (
                        t(`convictions.${key}`)
                      )}
                    </p>
                    <p className="text-xs text-zinc-500 leading-tight">{t(`convictions.${key}Desc`)}</p>
                  </button>
                ))}
              </div>

              {isTablePound && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <AlertTriangle
                    size={16}
                    className="mt-0.5 shrink-0 text-red-400"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-semibold text-red-400">{t("reputationOnLine")}</p>
                    <p className="text-xs text-red-400/80 mt-0.5">
                      {t("tablePoundWarning")}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="hidden">
            <Button variant="ghost" onClick={handleBack}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={isTablePound ? "bg-red-600 hover:bg-red-700" : ""}
            >
              <FileText size={14} className="mr-2" />
              {t("submitReport")}
            </Button>
          </div>
        </div>
        </div>
      </div>
    </GameLayout>
  );
}
