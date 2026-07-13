"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleHelp,
  ClipboardList,
  Eye,
  FileCheck2,
  List,
  MessageCircle,
  Network,
  Pin,
  PinOff,
  Radio,
} from "lucide-react";
import type {
  HiddenIntel,
  JudgmentCategory,
  NPCScoutReport,
  Observation,
  ReflectionFlaggedMomentRecord,
  ReflectionHypothesisRecord,
  ScoutReport,
} from "@/engine/core/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  buildEvidenceBoardModel,
  getConnectedHypothesisIds,
  getVisibleConnectedSourceIds,
  type EvidenceBoardHypothesis,
  type EvidenceBoardIntelMessage,
  type EvidenceBoardSource,
} from "./evidenceBoardModel";

interface EvidenceBoardProps {
  playerName: string;
  observations: Observation[];
  contactIntel?: HiddenIntel[];
  npcReports?: NPCScoutReport[];
  messages?: EvidenceBoardIntelMessage[];
  flaggedMoments?: ReflectionFlaggedMomentRecord[];
  hypotheses?: ReflectionHypothesisRecord[];
  reports?: ScoutReport[];
  unknowns?: string[];
  selectedHypothesisIds?: string[];
  currentWeek?: number;
  currentSeason?: number;
  seasonLength?: number;
  mode?: "dossier" | "report";
  onToggleHypothesis?: (hypothesisId: string, category: JudgmentCategory) => void;
  onStartReport?: () => void;
  className?: string;
}

const SOURCE_ICONS = {
  observation: Eye,
  flaggedMoment: Pin,
  contactIntel: MessageCircle,
  npcReport: FileCheck2,
  messageIntel: Radio,
} as const;

const STATE_STYLES: Record<EvidenceBoardHypothesis["state"], string> = {
  open: "border-zinc-700 bg-zinc-900/70 text-zinc-300",
  supported: "border-sky-500/35 bg-sky-500/10 text-sky-200",
  contradicted: "border-amber-500/35 bg-amber-500/10 text-amber-200",
  confirmed: "border-emerald-500/35 bg-emerald-500/10 text-emerald-200",
  debunked: "border-rose-500/35 bg-rose-500/10 text-rose-200",
};

function formatToken(value: string): string {
  const spaced = value.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function confidenceLabel(confidence?: number): string | undefined {
  if (confidence === undefined) return undefined;
  if (confidence >= 0.7) return "High confidence";
  if (confidence >= 0.4) return "Mixed confidence";
  return "Low confidence";
}

function SourceCard({
  source,
  focused,
  dimmed,
  onFocus,
}: {
  source: EvidenceBoardSource;
  focused: boolean;
  dimmed: boolean;
  onFocus: () => void;
}) {
  const Icon = SOURCE_ICONS[source.kind];
  const confidence = confidenceLabel(source.confidence);
  return (
    <button
      type="button"
      aria-pressed={focused}
      aria-label={`${source.attribution ?? source.title}. ${source.category ? `${source.category}, ` : ""}${source.claimDirection ?? "neutral"}. ${source.relation ?? "single source"}. ${source.detail}`}
      onClick={onFocus}
      className={cn(
        "group w-full rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
        focused ? "border-emerald-400/60 bg-emerald-400/10" : "border-white/10 bg-black/25 hover:border-white/25",
        dimmed && "opacity-45",
      )}
    >
      <span className="flex items-start gap-2.5">
        <span className="mt-0.5 rounded-md border border-white/10 bg-white/5 p-1.5 text-zinc-300">
          <Icon size={13} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-white">{source.title}</span>
          {(source.category || source.range || source.relation) && (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {source.category && <Badge variant="outline" className="border-white/15 text-[9px] text-zinc-300">{source.category}</Badge>}
              {source.range && <Badge variant="outline" className="border-sky-400/25 text-[9px] text-sky-200">Range {source.range}</Badge>}
              {source.claimDirection && <Badge variant="outline" className={cn(
                "text-[9px] capitalize",
                source.claimDirection === "positive" && "border-emerald-400/30 text-emerald-200",
                source.claimDirection === "negative" && "border-rose-400/30 text-rose-200",
                source.claimDirection === "mixed" && "border-amber-400/30 text-amber-200",
              )}>{source.claimDirection}</Badge>}
              {source.relation && source.relation !== "single" && <Badge variant="outline" className={cn(
                "text-[9px] capitalize",
                source.relation === "agreement" ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/30 text-amber-200",
              )}>{source.relation}</Badge>}
            </span>
          )}
          <span className="mt-1 line-clamp-3 block text-[11px] leading-4 text-zinc-400">{source.detail}</span>
          {source.explanation && (
            <span className="mt-1.5 line-clamp-2 block text-[10px] leading-4 text-zinc-500">Why it may differ: {source.explanation}</span>
          )}
          <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] uppercase tracking-[0.13em] text-zinc-500">
            <span>{source.meta}</span>
            {confidence && <span>· {confidence}</span>}
          </span>
        </span>
      </span>
    </button>
  );
}

function HypothesisCard({
  hypothesis,
  focused,
  linked,
  dimmed,
  onFocus,
  onToggleClaim,
}: {
  hypothesis: EvidenceBoardHypothesis;
  focused: boolean;
  linked: boolean;
  dimmed: boolean;
  onFocus: () => void;
  onToggleClaim?: () => void;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border p-3 transition",
        STATE_STYLES[hypothesis.state],
        focused && "ring-2 ring-emerald-400/75",
        linked && !focused && "ring-2 ring-sky-400/70",
        dimmed && "opacity-45",
      )}
    >
      <button
        type="button"
        aria-pressed={focused}
        onClick={onFocus}
        className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.15em] opacity-75">
            {formatToken(hypothesis.domain)} · {formatToken(hypothesis.state)}
          </span>
          <span className="text-[10px] tabular-nums opacity-75">
            +{hypothesis.evidenceFor} / −{hypothesis.evidenceAgainst}
          </span>
        </span>
        <span className="mt-2 block text-xs font-medium leading-5 text-white">{hypothesis.text}</span>
      </button>
      {onToggleClaim && (
        <button
          type="button"
          aria-pressed={hypothesis.selectedForDraft}
          onClick={onToggleClaim}
          className={cn(
            "mt-3 flex min-h-9 w-full items-center justify-center gap-2 rounded-md border px-3 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
            hypothesis.selectedForDraft
              ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
              : "border-white/10 bg-black/20 text-zinc-300 hover:border-white/25",
          )}
        >
          {hypothesis.selectedForDraft ? <Check size={13} aria-hidden="true" /> : <FileCheck2 size={13} aria-hidden="true" />}
          {hypothesis.selectedForDraft ? "Included in report" : "Use as report claim"}
        </button>
      )}
    </article>
  );
}

function EmptyLane({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-black/15 px-3 py-5 text-center text-[11px] leading-4 text-zinc-500">
      {children}
    </div>
  );
}

export function EvidenceBoard({
  playerName,
  observations,
  contactIntel = [],
  npcReports = [],
  messages = [],
  flaggedMoments = [],
  hypotheses = [],
  reports = [],
  unknowns = [],
  selectedHypothesisIds = [],
  currentWeek,
  currentSeason,
  seasonLength,
  mode = "dossier",
  onToggleHypothesis,
  onStartReport,
  className,
}: EvidenceBoardProps) {
  const model = useMemo(() => buildEvidenceBoardModel({
    observations,
    contactIntel,
    npcReports,
    messages,
    flaggedMoments,
    hypotheses,
    reports,
    unknowns,
    selectedHypothesisIds,
    now: currentWeek !== undefined && currentSeason !== undefined
      ? { week: currentWeek, season: currentSeason }
      : undefined,
    seasonLength,
  }), [contactIntel, currentSeason, currentWeek, flaggedMoments, hypotheses, messages, npcReports, observations, reports, seasonLength, selectedHypothesisIds, unknowns]);
  const [focusedHypothesisId, setFocusedHypothesisId] = useState<string | null>(null);
  const [focusedSourceId, setFocusedSourceId] = useState<string | null>(null);
  const activeHypothesis = model.hypotheses.find((hypothesis) => hypothesis.id === focusedHypothesisId);
  const connectedIds = new Set(activeHypothesis?.connectedSourceIds ?? []);
  const connectedHypothesisIds = new Set(getConnectedHypothesisIds(model, focusedSourceId));
  const visibleConnectedSourceIds = getVisibleConnectedSourceIds(model, focusedHypothesisId);
  const hasAnyEvidence = model.sources.length > 0 || model.hypotheses.length > 0 || model.claims.length > 0;

  const toggleHypothesisFocus = (id: string) => {
    setFocusedSourceId(null);
    setFocusedHypothesisId((current) => current === id ? null : id);
  };
  const toggleSourceFocus = (id: string) => {
    setFocusedHypothesisId(null);
    setFocusedSourceId((current) => current === id ? null : id);
  };

  return (
    <Card data-testid="evidence-board" className={cn("overflow-hidden border-white/10 bg-[#0c1115]", className)}>
      <CardHeader className="border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_42%)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-300">
              <Network size={16} aria-hidden="true" />
              <CardTitle className="text-base">Evidence board</CardTitle>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">
              Trace what you know about {playerName}, test competing interpretations, and decide which claims deserve your name.
            </p>
          </div>
          {mode === "dossier" && onStartReport && (
            <Button onClick={onStartReport} className="min-h-11 shrink-0 gap-2">
              <ClipboardList size={15} aria-hidden="true" />
              Build report from evidence
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="Evidence board summary">
          {[
            [model.metrics.sourceCount, "visible sources"],
            [model.metrics.contextCount, "contexts"],
            [model.metrics.openQuestions, "open questions"],
            [model.metrics.contradictions, "conflicts"],
            [model.metrics.draftClaims, "draft claims"],
          ].map(([value, label]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <span className="block text-lg font-semibold tabular-nums text-white">{value}</span>
              <span className="block text-[9px] uppercase tracking-[0.14em] text-zinc-500">{label}</span>
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-5">
        {!hasAnyEvidence ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
            <CircleHelp className="mx-auto text-zinc-600" size={24} aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-zinc-300">The board is empty.</p>
            <p className="mt-1 text-xs text-zinc-500">Observe the player or speak to a contact before forming a case.</p>
          </div>
        ) : (
          <Tabs defaultValue="board">
            <TabsList className="grid h-auto min-h-11 w-full grid-cols-2 bg-black/30 sm:w-64" aria-label="Evidence board view">
              <TabsTrigger value="board" className="min-h-9 gap-2"><Network size={13} aria-hidden="true" /> Board</TabsTrigger>
              <TabsTrigger value="list" className="min-h-9 gap-2"><List size={13} aria-hidden="true" /> Accessible list</TabsTrigger>
            </TabsList>

            <TabsContent value="board" className="mt-4">
              <p className="sr-only" aria-live="polite">
                {activeHypothesis
                  ? `Focused hypothesis: ${activeHypothesis.text}. ${visibleConnectedSourceIds.length} visible linked ${visibleConnectedSourceIds.length === 1 ? "source" : "sources"}.`
                  : focusedSourceId
                    ? `Focused evidence source. ${connectedHypothesisIds.size} linked ${connectedHypothesisIds.size === 1 ? "hypothesis" : "hypotheses"}.`
                    : "All evidence shown."}
              </p>
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)_2rem_minmax(0,1fr)]">
                <section aria-labelledby="evidence-source-lane" className="min-w-0 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 id="evidence-source-lane" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">1 · Sources</h3>
                    <Badge variant="outline" className="border-white/10 text-[9px] text-zinc-400">Observed, never truth</Badge>
                  </div>
                  <div className="space-y-2">
                    {model.sources.length === 0 ? <EmptyLane>No observations or contact intelligence yet.</EmptyLane> : model.sources.map((source) => (
                      <SourceCard
                        key={source.id}
                        source={source}
                        focused={focusedSourceId === source.id}
                        dimmed={Boolean(activeHypothesis && connectedIds.size > 0 && !connectedIds.has(source.id))}
                        onFocus={() => toggleSourceFocus(source.id)}
                      />
                    ))}
                  </div>
                </section>

                <div className="hidden items-center justify-center text-zinc-700 xl:flex" aria-hidden="true"><ArrowRight size={18} /></div>

                <section aria-labelledby="evidence-hypothesis-lane" className="min-w-0 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 id="evidence-hypothesis-lane" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">2 · Your hypotheses</h3>
                    {(focusedHypothesisId || focusedSourceId) && (
                      <button
                        type="button"
                        onClick={() => { setFocusedHypothesisId(null); setFocusedSourceId(null); }}
                        className="flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[10px] text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                      >
                        <PinOff size={11} aria-hidden="true" /> Clear focus
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {model.hypotheses.length === 0 ? <EmptyLane>No hypothesis has been preserved. The case is still descriptive.</EmptyLane> : model.hypotheses.map((hypothesis) => (
                      <HypothesisCard
                        key={hypothesis.id}
                        hypothesis={hypothesis}
                        focused={focusedHypothesisId === hypothesis.id}
                        linked={connectedHypothesisIds.has(hypothesis.id)}
                        dimmed={Boolean(focusedSourceId && connectedHypothesisIds.size > 0 && !connectedHypothesisIds.has(hypothesis.id))}
                        onFocus={() => toggleHypothesisFocus(hypothesis.id)}
                        onToggleClaim={onToggleHypothesis
                          ? () => onToggleHypothesis(hypothesis.id, hypothesis.category)
                          : undefined}
                      />
                    ))}
                  </div>
                </section>

                <div className="hidden items-center justify-center text-zinc-700 xl:flex" aria-hidden="true"><ArrowRight size={18} /></div>

                <div className="min-w-0 space-y-3">
                  <section aria-labelledby="evidence-claim-lane" className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 id="evidence-claim-lane" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">3 · Report claims</h3>
                      {mode === "report" && <Badge variant="success" className="text-[9px]">Changes draft</Badge>}
                    </div>
                    <div className="space-y-2">
                      {model.claims.length === 0 ? <EmptyLane>Select a hypothesis to turn interpretation into a professional claim.</EmptyLane> : model.claims.map((claim) => (
                        <article key={claim.id} className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300">{claim.label}</span>
                            <span className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">{claim.source} · {claim.confidence}</span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-zinc-200">{claim.verdict}</p>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section aria-labelledby="evidence-unknown-lane" className="rounded-xl border border-amber-500/15 bg-amber-500/[0.035] p-3">
                    <h3 id="evidence-unknown-lane" className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                      <CircleHelp size={12} aria-hidden="true" /> Unknowns to acknowledge
                    </h3>
                    {model.unknowns.length === 0 ? (
                      <p className="mt-3 text-[11px] leading-4 text-zinc-500">No unknown has been recorded. Check whether confidence is being overstated.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {model.unknowns.map((unknown) => (
                          <li key={unknown} className="flex gap-2 text-[11px] leading-4 text-zinc-300">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                            <span>{unknown}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="list" className="mt-4">
              <div className="space-y-5 rounded-xl border border-white/8 bg-black/15 p-4">
                <section aria-labelledby="evidence-list-sources">
                  <h3 id="evidence-list-sources" className="text-xs font-semibold text-white">Sources ({model.sources.length})</h3>
                  {model.sources.length === 0 ? <p className="mt-2 text-xs text-zinc-500">No sources.</p> : (
                    <ul className="mt-2 space-y-2">
                      {model.sources.map((source) => (
                        <li key={source.id} className="rounded-lg border border-white/10 p-3 text-xs leading-5 text-zinc-300">
                          <strong>{source.attribution ?? source.title}:</strong> {source.detail}
                          <span className="block text-zinc-500">
                            {[source.category, source.range ? `range ${source.range}` : undefined, source.claimDirection, source.relation, source.meta]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {source.explanation && <span className="mt-1 block text-zinc-400">Why it may differ: {source.explanation}</span>}
                          <span className="mt-1 block text-zinc-500">Calibration: {source.calibration?.status ?? "uncalibrated"}. {source.calibration?.note}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section aria-labelledby="evidence-list-hypotheses">
                  <h3 id="evidence-list-hypotheses" className="text-xs font-semibold text-white">Hypotheses ({model.hypotheses.length})</h3>
                  {model.hypotheses.length === 0 ? <p className="mt-2 text-xs text-zinc-500">No hypotheses.</p> : (
                    <ul className="mt-2 space-y-2">
                      {model.hypotheses.map((hypothesis) => (
                        <li key={hypothesis.id} className="rounded-lg border border-white/10 p-3 text-xs leading-5 text-zinc-300">
                          <span className="font-medium text-white">{hypothesis.text}</span>
                          <span className="ml-1 text-zinc-500">({hypothesis.state}; {hypothesis.evidenceFor} for, {hypothesis.evidenceAgainst} against)</span>
                          {onToggleHypothesis && (
                            <button
                              type="button"
                              aria-pressed={hypothesis.selectedForDraft}
                              onClick={() => onToggleHypothesis(hypothesis.id, hypothesis.category)}
                              className="mt-2 flex min-h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-[11px] font-semibold text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                            >
                              {hypothesis.selectedForDraft ? <Check size={12} aria-hidden="true" /> : <FileCheck2 size={12} aria-hidden="true" />}
                              {hypothesis.selectedForDraft ? "Remove from report" : "Use in report"}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section aria-labelledby="evidence-list-claims">
                  <h3 id="evidence-list-claims" className="text-xs font-semibold text-white">Report claims ({model.claims.length})</h3>
                  <ul className="mt-2 space-y-2 text-xs leading-5 text-zinc-300">
                    {model.claims.map((claim) => <li key={claim.id}><strong>{claim.label}:</strong> {claim.verdict} <span className="text-zinc-500">({claim.confidence})</span></li>)}
                  </ul>
                </section>
                <section aria-labelledby="evidence-list-unknowns">
                  <h3 id="evidence-list-unknowns" className="text-xs font-semibold text-white">Unknowns ({model.unknowns.length})</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-zinc-300">
                    {model.unknowns.map((unknown) => <li key={unknown}>{unknown}</li>)}
                  </ul>
                </section>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
