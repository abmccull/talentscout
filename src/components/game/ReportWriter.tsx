"use client";

import { useState, useMemo } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileText, ArrowLeft } from "lucide-react";
import type { ConvictionLevel, AttributeReading } from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";

const CONVICTION_OPTIONS: Array<{
  value: ConvictionLevel;
  label: string;
  description: string;
}> = [
  {
    value: "note",
    label: "Note",
    description: "Worth keeping an eye on — no commitment implied.",
  },
  {
    value: "recommend",
    label: "Recommend",
    description: "I would consider signing this player.",
  },
  {
    value: "strongRecommend",
    label: "Strong Recommend",
    description: "I strongly recommend pursuing this player.",
  },
  {
    value: "tablePound",
    label: "Table Pound",
    description: "Sign this player — I stake my reputation on it.",
  },
];

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

  const [conviction, setConviction] = useState<ConvictionLevel>("note");
  const [summary, setSummary] = useState("");
  const [selectedStrengths, setSelectedStrengths] = useState<string[]>([]);
  const [selectedWeaknesses, setSelectedWeaknesses] = useState<string[]>([]);

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

  // Early return after all hooks
  if (!gameState || !selectedPlayerId || !player) return null;

  const toggleStrength = (s: string) => {
    setSelectedStrengths((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const toggleWeakness = (w: string) => {
    setSelectedWeaknesses((prev) =>
      prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]
    );
  };

  const handleSubmit = () => {
    if (!summary.trim()) return;
    submitReport(conviction, summary, selectedStrengths, selectedWeaknesses);
  };

  const isTablePound = conviction === "tablePound";
  const canSubmit = summary.trim().length > 0 && observations.length > 0;

  return (
    <GameLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <button
          onClick={() => setScreen("playerProfile")}
          className="mb-4 flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition"
          aria-label="Back to player profile"
        >
          <ArrowLeft size={14} />
          Back to Profile
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">Write Scouting Report</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {player.firstName} {player.lastName} — {player.position}, Age {player.age}
            {club ? ` — ${club.name}` : ""}
          </p>
        </div>

        {observations.length === 0 && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle size={16} aria-hidden="true" />
              No observations recorded. Attend a match and focus on this player before writing a
              report.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {/* Observation summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Observation Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <div>
                <p className="text-xs text-zinc-500">Sessions</p>
                <p className="text-xl font-bold text-emerald-400">{observations.length}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Attributes Read</p>
                <p className="text-xl font-bold">{merged.size}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Contexts</p>
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
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Attribute Assessments</CardTitle>
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

          {/* Strengths */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Strengths ({selectedStrengths.length} selected)
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
            </CardContent>
          </Card>

          {/* Weaknesses */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Weaknesses ({selectedWeaknesses.length} selected)
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
            </CardContent>
          </Card>

          {/* Written summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Scout&apos;s Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <label htmlFor="summary" className="sr-only">
                Written summary
              </label>
              <textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value.slice(0, 2000))}
                placeholder="Write your assessment of this player..."
                rows={5}
                maxLength={2000}
                className="w-full rounded-md border border-[#27272a] bg-[#141414] p-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                aria-required="true"
              />
              <p className="mt-1 text-xs text-zinc-500">{summary.length} characters</p>
            </CardContent>
          </Card>

          {/* Conviction level */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Conviction Level</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                role="radiogroup"
                aria-label="Conviction level"
              >
                {CONVICTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setConviction(opt.value)}
                    role="radio"
                    aria-checked={conviction === opt.value}
                    className={`rounded-lg border p-3 text-left transition ${
                      conviction === opt.value
                        ? opt.value === "tablePound"
                          ? "border-red-500 bg-red-500/10"
                          : opt.value === "strongRecommend"
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-zinc-500 bg-zinc-500/10"
                        : "border-[#27272a] bg-[#141414] hover:border-zinc-600"
                    }`}
                  >
                    <p
                      className={`text-sm font-semibold mb-1 ${
                        opt.value === "tablePound" && conviction === opt.value
                          ? "text-red-400"
                          : opt.value === "strongRecommend" && conviction === opt.value
                          ? "text-emerald-400"
                          : "text-white"
                      }`}
                    >
                      {opt.label}
                    </p>
                    <p className="text-xs text-zinc-500 leading-tight">{opt.description}</p>
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
                    <p className="text-sm font-semibold text-red-400">Reputation on the line</p>
                    <p className="text-xs text-red-400/80 mt-0.5">
                      A Table Pound is your strongest possible recommendation. If this player fails
                      to deliver, your reputation will take a significant hit. Use sparingly.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setScreen("playerProfile")}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={isTablePound ? "bg-red-600 hover:bg-red-700" : ""}
            >
              <FileText size={14} className="mr-2" />
              Submit Report
            </Button>
          </div>
        </div>
      </div>
    </GameLayout>
  );
}
