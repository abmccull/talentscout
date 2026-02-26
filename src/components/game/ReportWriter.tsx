"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileText, ArrowLeft, X, Sparkles, TrendingUp, TrendingDown, Minus, Lightbulb } from "lucide-react";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { Tooltip } from "@/components/ui/tooltip";
import type { ConvictionLevel, AttributeReading, PlayerAttribute } from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import {
  generateReportContent,
  estimateReportQuality,
  STRENGTH_DESCRIPTORS,
  WEAKNESS_DESCRIPTORS,
} from "@/engine/reports";
import type { QualityBreakdown } from "@/engine/reports";
import { StarRating, StarRatingRange } from "@/components/ui/StarRating";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { useAudio } from "@/lib/audio/useAudio";
import { ScreenBackground } from "@/components/ui/screen-background";
import { useTranslations } from "next-intl";
import { ARCHETYPE_LABELS, ARCHETYPE_DESCRIPTIONS } from "@/engine/players/personalityEffects";

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
  confidenceLevel: { label: "Confidence level", max: 20 },
  convictionFit: { label: "Conviction fit", max: 15 },
  detail: { label: "Detail", max: 20 },
  scoutSkill: { label: "Scout skill", max: 20 },
};

function formatValue(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n}`;
}

function attrLabel(attr: string): string {
  return attr.replace(/([A-Z])/g, " $1").trim();
}

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
  const [customStrength, setCustomStrength] = useState("");
  const [customWeakness, setCustomWeakness] = useState("");
  const [comparison, setComparison] = useState("");
  const draftApplied = useRef(false);

  // Derive data before any early return
  const player = gameState && selectedPlayerId
    ? gameState.players[selectedPlayerId] ?? gameState.unsignedYouth[selectedPlayerId]?.player
    : undefined;
  const club = player ? getClub(player.clubId) : undefined;
  const observations = useMemo(
    () => (selectedPlayerId ? getPlayerObservations(selectedPlayerId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPlayerId, gameState?.observations]
  );

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
        scoutSkills: gameState?.scout.skills ?? {},
        assessedAttributeCount: merged.size,
        position: player?.position,
        perceivedCA,
      }),
    [
      observations.length,
      avgConfidence,
      conviction,
      selectedStrengths.length,
      selectedWeaknesses.length,
      gameState?.scout.skills,
      merged.size,
      player?.position,
      perceivedCA,
    ]
  );

  // Build reverse-lookup maps: descriptor string → attribute name
  const strengthToAttribute = useMemo(() => {
    const map = new Map<string, PlayerAttribute>();
    for (const [attr, desc] of Object.entries(STRENGTH_DESCRIPTORS)) {
      if (desc) map.set(desc, attr as PlayerAttribute);
    }
    return map;
  }, []);

  const weaknessToAttribute = useMemo(() => {
    const map = new Map<string, PlayerAttribute>();
    for (const [attr, desc] of Object.entries(WEAKNESS_DESCRIPTORS)) {
      if (desc) map.set(desc, attr as PlayerAttribute);
    }
    return map;
  }, []);

  // Pre-populate form state from draft (one-shot)
  useEffect(() => {
    if (!draft || draftApplied.current) return;
    draftApplied.current = true;
    if (draft.suggestedStrengths.length > 0) {
      setSelectedStrengths(draft.suggestedStrengths);
    }
    if (draft.suggestedWeaknesses.length > 0) {
      setSelectedWeaknesses(draft.suggestedWeaknesses);
    }
    if (draft.comparisonSuggestions.length > 0) {
      setComparison(draft.comparisonSuggestions[0]);
    }
  }, [draft]);

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

  // Early return after all hooks
  if (!gameState || !selectedPlayerId || !player) return null;

  const handleBack = () => {
    if (isDirty && !window.confirm(t("unsavedWarning"))) {
      return;
    }
    setScreen("playerProfile");
  };

  const toggleStrength = (s: string) => {
    setIsDirty(true);
    setSelectedStrengths((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const toggleWeakness = (w: string) => {
    setIsDirty(true);
    setSelectedWeaknesses((prev) =>
      prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]
    );
  };

  const handleGenerateDraft = () => {
    if (!draft) return;
    const lines: string[] = [];
    const roleStr = player.naturalRole
      ? ` ${player.naturalRole.replace(/([A-Z])/g, " $1").trim().toLowerCase()}`
      : "";
    lines.push(
      `Based on ${observations.length} observation${observations.length !== 1 ? "s" : ""}, ${player.firstName} ${player.lastName} presents as a ${draft.perceivedCAStars ? `${draft.perceivedCAStars}-star` : "developing"}${roleStr} ${player.position}.`
    );
    if (selectedStrengths.length > 0) {
      lines.push(`Key strengths include ${selectedStrengths.slice(0, 2).map(s => {
        const attr = strengthToAttribute.get(s);
        return attr ? attrLabel(attr).toLowerCase() : s.toLowerCase().split(" — ")[0];
      }).join(" and ")}.`);
    }
    if (selectedWeaknesses.length > 0) {
      lines.push(`Areas of concern: ${selectedWeaknesses.slice(0, 2).map(w => {
        const attr = weaknessToAttribute.get(w);
        return attr ? attrLabel(attr).toLowerCase() : w.toLowerCase().split(" — ")[0];
      }).join(" and ")}.`);
    }
    // Behavioral traits add flavour
    const revealedTraits = player.playerTraitsRevealed ?? [];
    if (revealedTraits.length > 0) {
      const traitStrs = revealedTraits.slice(0, 2).map(t => t.replace(/([A-Z])/g, " $1").trim().toLowerCase());
      lines.push(`Notable tendencies: ${traitStrs.join(", ")}.`);
    }
    // Personality character assessment
    if (player.personalityProfile && !player.personalityProfile.hiddenUntilRevealed) {
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
    setIsDirty(true);
    playSFX("pen-scribble");
  };

  const handleSubmit = () => {
    if (!summary.trim()) return;
    const fullSummary = comparison.trim()
      ? `${summary.trim()}\n\nPlayer comparison: ${comparison.trim()}`
      : summary.trim();
    setIsDirty(false);
    playSFX("report-submit");
    submitReport(conviction, fullSummary, selectedStrengths, selectedWeaknesses);
  };

  const isTablePound = conviction === "tablePound";
  const canSubmit = summary.trim().length > 0 && observations.length > 0;

  // Determine which suggestions come from the engine vs custom
  const engineStrengths = draft?.suggestedStrengths ?? [];
  const engineWeaknesses = draft?.suggestedWeaknesses ?? [];
  const customStrengthTags = selectedStrengths.filter((s) => !engineStrengths.includes(s));
  const customWeaknessTags = selectedWeaknesses.filter((w) => !engineWeaknesses.includes(w));

  return (
    <GameLayout>
      <div className="relative min-h-full p-6">
        <ScreenBackground src="/images/backgrounds/report-writer.png" opacity={0.82} />
        <div className="relative z-10 max-w-4xl mx-auto">
        <button
          onClick={handleBack}
          className="mb-4 flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition"
          aria-label="Back to player profile"
        >
          <ArrowLeft size={14} />
          {t("backToProfile")}
        </button>

        <div className="mb-6 flex items-center gap-4">
          <PlayerAvatar
            playerId={player.id}
            nationality={player.nationality}
            size={64}
          />
          <div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
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
                    </div>
                  )}
                </div>
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
                  Form modifier: {player.form > 0 ? "+" : ""}{player.form}
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
            <CardContent>
              {engineStrengths.length > 0 ? (
                <div className="space-y-2" role="group" aria-label="Select strengths">
                  {engineStrengths.map((s) => {
                    const attr = strengthToAttribute.get(s);
                    const selected = selectedStrengths.includes(s);
                    return (
                      <button
                        key={s}
                        onClick={() => toggleStrength(s)}
                        aria-pressed={selected}
                        className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                          selected
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-[#27272a] bg-[#141414] hover:border-zinc-600 opacity-60"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs leading-snug ${selected ? "text-emerald-300" : "text-zinc-400"}`}>
                            {s}
                          </p>
                        </div>
                        {attr && (
                          <Badge
                            variant="secondary"
                            className={`shrink-0 text-[10px] ${selected ? "bg-emerald-500/20 text-emerald-400" : ""}`}
                          >
                            {attrLabel(attr)}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-600 mb-2">
                  No standout strengths detected from observations. Add custom strengths below.
                </p>
              )}

              {/* Custom strength tags */}
              {customStrengthTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {customStrengthTags.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-500 bg-emerald-500/20 px-3 py-1 text-xs text-emerald-400"
                    >
                      {s}
                      <button
                        onClick={() =>
                          setSelectedStrengths((prev) => prev.filter((x) => x !== s))
                        }
                        className="hover:text-white transition"
                        aria-label={`Remove ${s}`}
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Custom strength input */}
              <div className="mt-3 flex gap-2">
                <label htmlFor="custom-strength" className="sr-only">
                  Add custom strength
                </label>
                <input
                  id="custom-strength"
                  type="text"
                  value={customStrength}
                  onChange={(e) => { setIsDirty(true); setCustomStrength(e.target.value.slice(0, 100)); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customStrength.trim()) {
                      e.preventDefault();
                      setIsDirty(true);
                      setSelectedStrengths((prev) => [...prev, customStrength.trim()]);
                      setCustomStrength("");
                    }
                  }}
                  placeholder={t("addCustomStrength")}
                  maxLength={100}
                  className="flex-1 rounded-md border border-[#27272a] bg-[#141414] px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (customStrength.trim()) {
                      setIsDirty(true);
                      setSelectedStrengths((prev) => [...prev, customStrength.trim()]);
                      setCustomStrength("");
                    }
                  }}
                  disabled={!customStrength.trim()}
                  className="text-xs"
                >
                  {t("add")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Weaknesses */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {t("weaknesses")} ({selectedWeaknesses.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {engineWeaknesses.length > 0 ? (
                <div className="space-y-2" role="group" aria-label="Select weaknesses">
                  {engineWeaknesses.map((w) => {
                    const attr = weaknessToAttribute.get(w);
                    const selected = selectedWeaknesses.includes(w);
                    return (
                      <button
                        key={w}
                        onClick={() => toggleWeakness(w)}
                        aria-pressed={selected}
                        className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                          selected
                            ? "border-red-500/50 bg-red-500/10"
                            : "border-[#27272a] bg-[#141414] hover:border-zinc-600 opacity-60"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs leading-snug ${selected ? "text-red-300" : "text-zinc-400"}`}>
                            {w}
                          </p>
                        </div>
                        {attr && (
                          <Badge
                            variant="secondary"
                            className={`shrink-0 text-[10px] ${selected ? "bg-red-500/20 text-red-400" : ""}`}
                          >
                            {attrLabel(attr)}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-600 mb-2">
                  No notable weaknesses detected from observations. Add custom weaknesses below.
                </p>
              )}

              {/* Custom weakness tags */}
              {customWeaknessTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {customWeaknessTags.map((w) => (
                    <span
                      key={w}
                      className="inline-flex items-center gap-1 rounded-full border border-red-500 bg-red-500/20 px-3 py-1 text-xs text-red-400"
                    >
                      {w}
                      <button
                        onClick={() =>
                          setSelectedWeaknesses((prev) => prev.filter((x) => x !== w))
                        }
                        className="hover:text-white transition"
                        aria-label={`Remove ${w}`}
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Custom weakness input */}
              <div className="mt-3 flex gap-2">
                <label htmlFor="custom-weakness" className="sr-only">
                  Add custom weakness
                </label>
                <input
                  id="custom-weakness"
                  type="text"
                  value={customWeakness}
                  onChange={(e) => { setIsDirty(true); setCustomWeakness(e.target.value.slice(0, 100)); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customWeakness.trim()) {
                      e.preventDefault();
                      setIsDirty(true);
                      setSelectedWeaknesses((prev) => [...prev, customWeakness.trim()]);
                      setCustomWeakness("");
                    }
                  }}
                  placeholder={t("addCustomWeakness")}
                  maxLength={100}
                  className="flex-1 rounded-md border border-[#27272a] bg-[#141414] px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (customWeakness.trim()) {
                      setIsDirty(true);
                      setSelectedWeaknesses((prev) => [...prev, customWeakness.trim()]);
                      setCustomWeakness("");
                    }
                  }}
                  disabled={!customWeakness.trim()}
                  className="text-xs"
                >
                  {t("add")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Player comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("playerComparison")}</CardTitle>
            </CardHeader>
            <CardContent>
              {draft && draft.comparisonSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {draft.comparisonSuggestions.map((sug) => (
                    <button
                      key={sug}
                      onClick={() => { setIsDirty(true); setComparison(sug); }}
                      className={`rounded-lg border px-3 py-1.5 text-xs text-left transition ${
                        comparison === sug
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                          : "border-[#27272a] bg-[#141414] text-zinc-400 hover:border-zinc-500 hover:text-white"
                      }`}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-zinc-500 mb-2">
                {t("comparisonHint")}
              </p>
              <label htmlFor="comparison" className="sr-only">
                Player comparison
              </label>
              <input
                id="comparison"
                type="text"
                value={comparison}
                onChange={(e) => { setIsDirty(true); setComparison(e.target.value.slice(0, 200)); }}
                placeholder={t("comparisonPlaceholder")}
                maxLength={200}
                className="w-full rounded-md border border-[#27272a] bg-[#141414] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
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

          {/* Written summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("scoutSummary")}</CardTitle>
            </CardHeader>
            <CardContent>
              {!summary.trim() && draft && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateDraft}
                  className="mb-3 text-xs"
                >
                  <Sparkles size={12} className="mr-1.5" />
                  Generate draft summary
                </Button>
              )}
              <label htmlFor="summary" className="sr-only">
                Written summary
              </label>
              <textarea
                id="summary"
                value={summary}
                onChange={(e) => { setIsDirty(true); setSummary(e.target.value.slice(0, 2000)); }}
                onFocus={() => playSFX("pen-scribble")}
                placeholder={t("summaryPlaceholder")}
                rows={5}
                maxLength={2000}
                className="w-full rounded-md border border-[#27272a] bg-[#141414] p-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                aria-required="true"
              />
              <p className="mt-1 text-xs text-zinc-500">{summary.length} characters</p>
            </CardContent>
          </Card>

          {/* Quality preview */}
          {observations.length > 0 && (
            <Card className={`border ${qualityScoreBorder(qualityPreview.score)} sticky top-4 z-10`}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp size={14} className="text-zinc-400" aria-hidden="true" />
                  Quality Preview
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

                <p className="mt-2 text-[10px] text-zinc-600 italic">
                  Final score may vary slightly based on additional factors
                </p>
              </CardContent>
            </Card>
          )}

          {/* Conviction level */}
          <Card data-tutorial-id="report-conviction">
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
                    onClick={() => { setIsDirty(true); setConviction(key); playSFX("page-turn"); }}
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
          <div className="flex items-center justify-end gap-3" data-tutorial-id="report-submit">
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
