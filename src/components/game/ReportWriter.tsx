"use client";

import { useState, useMemo, useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileText, ArrowLeft, X } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { ConvictionLevel, AttributeReading } from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { useAudio } from "@/lib/audio/useAudio";
import { useTranslations } from "next-intl";

const CONVICTION_KEYS: ConvictionLevel[] = ["note", "recommend", "strongRecommend", "tablePound"];

const SUGGESTED_STRENGTHS = [
  "Exceptional technical quality",
  "Elite physical attributes",
  "Strong leadership presence",
  "Excellent positioning",
  "Clinical finishing",
  "Creative vision",
  "Dominant aerial ability",
  "High work rate",
  "Composed under pressure",
  "Strong tactical awareness",
  "Consistent performer",
  "Versatile positionally",
];

const SUGGESTED_WEAKNESSES = [
  "Below-par pace",
  "Weak off the ball",
  "Poor composure under pressure",
  "Lack of aerial threat",
  "Inconsistent decision-making",
  "Limited with weak foot",
  "Injury concerns",
  "Limited stamina",
  "Struggles defensively",
  "Lacks leadership",
  "Untested at higher level",
  "Poor set-piece delivery",
];

function confidenceColor(confidence: number): string {
  if (confidence >= 0.7) return "text-emerald-400";
  if (confidence >= 0.4) return "text-amber-400";
  return "text-red-400";
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

  // Derive data before any early return — use optional chaining for safety
  const player = gameState && selectedPlayerId ? gameState.players[selectedPlayerId] : undefined;
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

  return (
    <GameLayout>
      <div className="p-6 max-w-4xl mx-auto">
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
                              {attr.replace(/([A-Z])/g, " $1").trim()}
                            </span>
                            <div className="flex-1 relative h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                              <div
                                className="absolute left-0 top-0 h-full rounded-full bg-emerald-500"
                                style={{ width: `${(reading.perceivedValue / 20) * 100}%` }}
                              />
                            </div>
                            <span className="w-6 shrink-0 text-right text-xs font-mono font-bold text-white">
                              {reading.perceivedValue}
                            </span>
                            <span
                              className={`shrink-0 text-xs ${confidenceColor(reading.confidence)}`}
                            >
                              {Math.round(reading.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Player comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("playerComparison")}</CardTitle>
            </CardHeader>
            <CardContent>
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
                onChange={(e) => { setIsDirty(true); setComparison(e.target.value.slice(0, 100)); }}
                placeholder={t("comparisonPlaceholder")}
                maxLength={100}
                className="w-full rounded-md border border-[#27272a] bg-[#141414] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </CardContent>
          </Card>

          {/* Strengths */}
          <Card data-tutorial-id="report-strengths">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {t("strengths")} ({selectedStrengths.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Select strengths">
                {SUGGESTED_STRENGTHS.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleStrength(s)}
                    aria-pressed={selectedStrengths.includes(s)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      selectedStrengths.includes(s)
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                        : "border-[#27272a] bg-[#141414] text-zinc-400 hover:border-zinc-500 hover:text-white"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Custom strength tags */}
              {selectedStrengths.filter((s) => !SUGGESTED_STRENGTHS.includes(s)).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedStrengths
                    .filter((s) => !SUGGESTED_STRENGTHS.includes(s))
                    .map((s) => (
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
              <div className="flex flex-wrap gap-2" role="group" aria-label="Select weaknesses">
                {SUGGESTED_WEAKNESSES.map((w) => (
                  <button
                    key={w}
                    onClick={() => toggleWeakness(w)}
                    aria-pressed={selectedWeaknesses.includes(w)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      selectedWeaknesses.includes(w)
                        ? "border-red-500 bg-red-500/20 text-red-400"
                        : "border-[#27272a] bg-[#141414] text-zinc-400 hover:border-zinc-500 hover:text-white"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>

              {/* Custom weakness tags */}
              {selectedWeaknesses.filter((w) => !SUGGESTED_WEAKNESSES.includes(w)).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedWeaknesses
                    .filter((w) => !SUGGESTED_WEAKNESSES.includes(w))
                    .map((w) => (
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

          {/* Written summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("scoutSummary")}</CardTitle>
            </CardHeader>
            <CardContent>
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
    </GameLayout>
  );
}
