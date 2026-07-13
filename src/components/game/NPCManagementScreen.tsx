"use client";

import { useState, useMemo } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  Star,
  Map,
  FileText,
  Eye,
  CheckCircle,
  X,
  Send,
} from "lucide-react";
import type {
  NPCDelegation,
  NPCScout,
  NPCScoutReport,
  Territory,
} from "@/engine/core/types";
import { ScreenBackground } from "@/components/ui/screen-background";
import { formatEvidenceRange } from "@/engine/scout/sourcePerspectives";

// =============================================================================
// Constants & helpers
// =============================================================================

const SPEC_LABELS: Record<string, string> = {
  youth: "Youth",
  firstTeam: "First Team",
  regional: "Regional",
  data: "Data",
};

const RECOMMENDATION_CONFIG: Record<
  NPCScoutReport["recommendation"],
  { label: string; variant: "success" | "warning" | "default" }
> = {
  monitor: { label: "Monitor", variant: "default" },
  shortlist: { label: "Shortlist", variant: "warning" },
  pursue: { label: "Pursue", variant: "success" },
};

/** Render 1–5 filled/empty star characters for quality rating. */
function QualityStars({ quality }: { quality: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`Quality: ${quality} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={12}
          aria-hidden="true"
          className={i < quality ? "text-amber-400 fill-amber-400" : "text-zinc-700"}
        />
      ))}
    </span>
  );
}

/** Return a Tailwind color class for the fatigue progress bar. */
function fatigueColor(fatigue: number): string {
  if (fatigue >= 75) return "bg-red-500";
  if (fatigue >= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

// =============================================================================
// Sub-components
// =============================================================================

interface NPCScoutCardProps {
  scout: NPCScout;
  territory: Territory | undefined;
  activeDelegation?: NPCDelegation;
  activeDelegationPlayerName?: string;
  isSelected: boolean;
  onClick: () => void;
}

function NPCScoutCard({
  scout,
  territory,
  activeDelegation,
  activeDelegationPlayerName,
  isSelected,
  onClick,
}: NPCScoutCardProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`View NPC scout: ${scout.firstName} ${scout.lastName}`}
      className={`w-full rounded-lg border p-4 text-left transition ${
        isSelected
          ? "border-emerald-500/50 bg-emerald-500/5"
          : "border-[#27272a] bg-[#141414] hover:border-zinc-600"
      }`}
    >
      {/* Name row */}
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-white">
          {scout.firstName} {scout.lastName}
        </span>
        <QualityStars quality={scout.quality} />
      </div>

      {/* Spec & territory */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary" className="text-[10px] capitalize">
          {SPEC_LABELS[scout.specialization] ?? scout.specialization}
        </Badge>
        {territory ? (
          <span className="flex items-center gap-1 text-zinc-400">
            <Map size={10} aria-hidden="true" />
            {territory.name}
          </span>
        ) : (
          <span className="text-zinc-600">Unassigned</span>
        )}
      </div>

      {/* Fatigue */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-zinc-500">Fatigue</span>
          <span className="text-zinc-400">{scout.fatigue}/100</span>
        </div>
        <Progress
          value={scout.fatigue}
          max={100}
          className="h-1.5"
          indicatorClassName={fatigueColor(scout.fatigue)}
        />
      </div>

      {activeDelegation && (
        <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-100">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-amber-200">Focused delegation active</span>
            <span className="text-amber-300/80">
              {activeDelegation.weeksRemaining} wk left
            </span>
          </div>
          <p className="mt-1 truncate text-amber-100/90">
            {activeDelegationPlayerName ?? "Assigned target"}
          </p>
        </div>
      )}
    </button>
  );
}

// =============================================================================
// Detail panel
// =============================================================================

interface NPCScoutDetailProps {
  scout: NPCScout;
  territory: Territory | undefined;
  allTerritories: Territory[];
  reports: NPCScoutReport[];
  activeDelegation?: NPCDelegation;
  activeDelegatedPlayerName?: string;
  activePlayerDelegations: Record<string, NPCDelegation>;
  onAssign: (territoryId: string) => void;
  onMarkReviewed: (reportId: string) => void;
  onClose: () => void;
  getPlayerName: (playerId: string) => string;
  watchlist: string[];
  onDelegate: (npcScoutId: string, playerId: string) => void;
  onToggleWatchlist: (playerId: string) => void;
}

function NPCScoutDetail({
  scout,
  territory,
  allTerritories,
  reports,
  activeDelegation,
  activeDelegatedPlayerName,
  activePlayerDelegations,
  onAssign,
  onMarkReviewed,
  onClose,
  getPlayerName,
  watchlist,
  onDelegate,
  onToggleWatchlist,
}: NPCScoutDetailProps) {
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>(
    scout.territoryId ?? ""
  );

  const scoutReports = useMemo(
    () =>
      reports
        .filter((r) => r.npcScoutId === scout.id)
        .sort((a, b) => b.week - a.week || b.season - a.season),
    [reports, scout.id]
  );

  const handleAssign = () => {
    if (selectedTerritoryId) {
      onAssign(selectedTerritoryId);
    }
  };

  const getDelegationBlockReason = (playerId: string): string | null => {
    if (activeDelegation && activeDelegation.playerId !== playerId) {
      return `Busy: ${activeDelegatedPlayerName ?? "active assignment"}`;
    }

    const playerDelegation = activePlayerDelegations[playerId];
    if (playerDelegation && playerDelegation.npcScoutId !== scout.id) {
      return "Already assigned";
    }

    if (playerDelegation && playerDelegation.npcScoutId === scout.id) {
      return "Assigned";
    }

    return null;
  };

  return (
    <Card className="border-emerald-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users size={16} className="text-emerald-400" aria-hidden="true" />
            {scout.firstName} {scout.lastName}
          </CardTitle>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 transition hover:text-white"
            aria-label="Close scout detail"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Quality & spec */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-zinc-500">Quality: </span>
            <QualityStars quality={scout.quality} />
          </div>
          <div>
            <span className="text-zinc-500">Spec: </span>
            <span className="text-white capitalize">
              {SPEC_LABELS[scout.specialization] ?? scout.specialization}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Morale: </span>
            <span className="text-white">{scout.morale}/10</span>
          </div>
          <div>
            <span className="text-zinc-500">Reports: </span>
            <span className="text-white">{scout.reportsSubmitted}</span>
          </div>
        </div>

        {/* Fatigue bar */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Fatigue</span>
            <span className="text-white font-medium">{scout.fatigue}/100</span>
          </div>
          <Progress
            value={scout.fatigue}
            max={100}
            indicatorClassName={fatigueColor(scout.fatigue)}
          />
        </div>

        {activeDelegation && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
                Active Delegation
              </p>
              <Badge variant="warning" className="text-[10px]">
                {activeDelegation.weeksRemaining} wk left
              </Badge>
            </div>
            <p className="text-sm text-white">{activeDelegatedPlayerName ?? "Assigned target"}</p>
            <p className="mt-1 text-[11px] text-zinc-400">
              Focused report due around S{activeDelegation.completionSeason} W{activeDelegation.completionWeek}.
            </p>
          </div>
        )}

        {/* Territory assignment */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Territory Assignment
          </p>
          <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
            <Map size={12} aria-hidden="true" />
            <span>
              Currently:{" "}
              <span className="font-medium text-white">
                {territory ? territory.name : "Unassigned"}
              </span>
            </span>
          </div>

          <label htmlFor={`territory-select-${scout.id}`} className="mb-1 block text-xs text-zinc-500">
            Assign to territory
          </label>
          <select
            id={`territory-select-${scout.id}`}
            value={selectedTerritoryId}
            onChange={(e) => setSelectedTerritoryId(e.target.value)}
            className="mb-2 w-full rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2 text-xs text-white transition focus:border-emerald-500/50 focus:outline-none"
          >
            <option value="">Select a territory…</option>
            {allTerritories.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.country}) — {t.assignedScoutIds.length}/{t.maxScouts} scouts
              </option>
            ))}
          </select>

          <Button
            size="sm"
            className="w-full"
            onClick={handleAssign}
            disabled={!selectedTerritoryId || selectedTerritoryId === scout.territoryId}
          >
            <Map size={14} aria-hidden="true" />
            Assign
          </Button>
        </div>

        {/* Delegate Player Scouting */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Delegate Player Scouting
            </p>
            <Badge variant="outline" className="text-[10px]">
              {watchlist.length} watchlisted
            </Badge>
          </div>
          {watchlist.length > 0 ? (
            <div className="space-y-1.5">
              {watchlist.map((playerId) => {
                const delegationBlockReason = getDelegationBlockReason(playerId);

                return (
                  <div
                    key={playerId}
                    className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0c0c0c] px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-zinc-300 truncate mr-2">{getPlayerName(playerId)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-5 px-2 text-[10px] shrink-0"
                      onClick={() => onDelegate(scout.id, playerId)}
                      disabled={delegationBlockReason !== null}
                    >
                      <Eye size={10} className="mr-1" aria-hidden="true" />
                      {delegationBlockReason ?? "Assign"}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[10px] text-zinc-600">
              Add players from scout reports to your watchlist, then assign them here for follow-up coverage.
            </p>
          )}
        </div>

        {/* Recent reports for this scout */}
        {scoutReports.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Recent Reports ({scoutReports.length})
            </p>
            <div className="space-y-2">
              {scoutReports.slice(0, 5).map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  playerName={getPlayerName(report.playerId)}
                  onMarkReviewed={onMarkReviewed}
                  isWatchlisted={watchlist.includes(report.playerId)}
                  onToggleWatchlist={onToggleWatchlist}
                  onDelegate={(playerId) => onDelegate(scout.id, playerId)}
                  delegateLabel={getDelegationBlockReason(report.playerId) ?? "Delegate"}
                  delegateDisabled={getDelegationBlockReason(report.playerId) !== null}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Report card (used in both detail panel and bottom reports section)
// =============================================================================

interface ReportCardProps {
  report: NPCScoutReport;
  playerName: string;
  onMarkReviewed: (reportId: string) => void;
  isWatchlisted?: boolean;
  onToggleWatchlist?: (playerId: string) => void;
  onDelegate?: (playerId: string) => void;
  delegateDisabled?: boolean;
  delegateLabel?: string;
}

function ReportCard({
  report,
  playerName,
  onMarkReviewed,
  isWatchlisted = false,
  onToggleWatchlist,
  onDelegate,
  delegateDisabled = false,
  delegateLabel = "Delegate",
}: ReportCardProps) {
  const recConfig = RECOMMENDATION_CONFIG[report.recommendation];

  return (
    <div
      className={`rounded-md border p-3 transition ${
        report.reviewed
          ? "border-[#27272a] bg-[#141414]"
          : "border-amber-500/20 bg-amber-500/5"
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-medium text-white text-xs">{playerName}</span>
        <div className="flex items-center gap-1.5">
          <Badge variant={recConfig.variant} className="text-[10px]">
            {recConfig.label}
          </Badge>
          {report.reviewed ? (
            <span
              className="flex items-center gap-1 text-[10px] text-emerald-400"
              aria-label="Report reviewed"
            >
              <CheckCircle size={10} aria-hidden="true" />
              Reviewed
            </span>
          ) : (
            <Badge variant="warning" className="text-[10px]">
              New
            </Badge>
          )}
        </div>
      </div>

      <p className="mb-2 text-[11px] leading-relaxed text-zinc-400">{report.summary}</p>

      {report.sourcePerspective && (
        <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Scout interpretation profile">
          <Badge variant="outline" className="border-sky-400/25 text-[9px] capitalize text-sky-200">
            {report.sourcePerspective.lens.replace(/([A-Z])/g, " $1").trim()} lens
          </Badge>
          <Badge variant="outline" className="border-white/15 text-[9px] capitalize text-zinc-300">
            {report.sourcePerspective.riskTolerance} risk
          </Badge>
          <Badge variant="outline" className="border-white/15 text-[9px] capitalize text-zinc-300">
            {report.sourcePerspective.reliabilityBand} reliability
          </Badge>
        </div>
      )}

      {report.evidenceClaims && report.evidenceClaims.length > 0 && (
        <details className="mb-2 rounded-md border border-white/10 bg-black/20 px-2.5 py-2">
          <summary className="cursor-pointer text-[10px] font-semibold text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
            Compare {report.evidenceClaims.length} attributed claim{report.evidenceClaims.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-2">
            {report.evidenceClaims.map((claim) => (
              <li key={claim.id} className="border-l-2 border-white/10 pl-2 text-[10px] leading-4 text-zinc-400">
                <span className="block font-medium capitalize text-zinc-200">
                  {String(claim.category).replace(/([A-Z])/g, " $1").trim()} · {claim.direction} · {formatEvidenceRange(claim.range)}
                </span>
                <span>{claim.statement}</span>
                <span className="mt-0.5 block text-zinc-500">
                  {Math.round(claim.confidence * 100)}% confidence · {claim.calibration.status}. {claim.explanation}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <Eye size={10} aria-hidden="true" />
          <span>Quality: {report.quality}/100</span>
          <span>·</span>
          <span>
            S{report.season} W{report.week}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onToggleWatchlist && (
            <Button
              size="sm"
              variant="outline"
              className={`h-6 px-2 text-[10px] ${isWatchlisted ? "border-amber-500/40 text-amber-300" : ""}`}
              onClick={() => onToggleWatchlist(report.playerId)}
            >
              <Star
                size={10}
                className={isWatchlisted ? "mr-1 fill-amber-400 text-amber-400" : "mr-1"}
                aria-hidden="true"
              />
              {isWatchlisted ? "Watchlisted" : "Watchlist"}
            </Button>
          )}
          {onDelegate && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => onDelegate(report.playerId)}
              disabled={delegateDisabled}
            >
              <Send size={10} className="mr-1" aria-hidden="true" />
              {delegateLabel}
            </Button>
          )}
          {!report.reviewed && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => onMarkReviewed(report.id)}
            >
              Mark Reviewed
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main screen
// =============================================================================

export function NPCManagementScreen() {
  const {
    gameState,
    assignNPCScoutTerritory,
    reviewNPCReport,
    getPlayer,
    delegateScouting,
    toggleWatchlist,
    resolveLeadershipResponsibility,
  } = useGameStore();
  const [selectedScoutId, setSelectedScoutId] = useState<string | null>(null);

  // All hooks must be called before any conditional return.
  const npcScouts = useMemo(
    () => Object.values(gameState?.npcScouts ?? {}),
    [gameState?.npcScouts]
  );

  const allTerritories = useMemo(
    () => Object.values(gameState?.territories ?? {}),
    [gameState?.territories]
  );

  const allNPCReports = useMemo(
    () =>
      Object.values(gameState?.npcReports ?? {}).sort(
        (a, b) => b.week - a.week || b.season - a.season
      ),
    [gameState?.npcReports]
  );

  const activeDelegations = useMemo(
    () =>
      Object.values(gameState?.npcDelegations ?? {})
        .filter((delegation) => !delegation.completed)
        .sort((a, b) => a.weeksRemaining - b.weeksRemaining),
    [gameState?.npcDelegations]
  );

  const activeDelegationsByScout = useMemo(
    () =>
      activeDelegations.reduce<Record<string, NPCDelegation>>((acc, delegation) => {
        acc[delegation.npcScoutId] = delegation;
        return acc;
      }, {}),
    [activeDelegations]
  );

  const activeDelegationsByPlayer = useMemo(
    () =>
      activeDelegations.reduce<Record<string, NPCDelegation>>((acc, delegation) => {
        acc[delegation.playerId] = delegation;
        return acc;
      }, {}),
    [activeDelegations]
  );

  const selectedScout = useMemo(
    () => (selectedScoutId ? (gameState?.npcScouts[selectedScoutId] ?? null) : null),
    [selectedScoutId, gameState?.npcScouts]
  );

  const selectedTerritory = useMemo(
    () =>
      selectedScout?.territoryId
        ? (gameState?.territories[selectedScout.territoryId] ?? undefined)
        : undefined,
    [selectedScout, gameState?.territories]
  );

  if (!gameState) return null;

  const { scout } = gameState;
  const isTierEligible = scout.careerTier >= 4;

  const getPlayerName = (playerId: string): string => {
    const p = getPlayer(playerId);
    return p ? `${p.firstName} ${p.lastName}` : "Unknown Player";
  };

  const getTerritoryForScout = (npcScout: NPCScout): Territory | undefined =>
    npcScout.territoryId ? gameState.territories[npcScout.territoryId] : undefined;

  const unreviewedCount = allNPCReports.filter((r) => !r.reviewed).length;
  const openLeadershipResponsibilities = Object.values(
    gameState.leadershipPortfolio?.responsibilities ?? {},
  ).filter((responsibility) => responsibility.status === "open");
  const leadershipAttentionRemaining = gameState.leadershipPortfolio
    ? Math.max(
        0,
        gameState.leadershipPortfolio.attentionCapacity
          - gameState.leadershipPortfolio.attentionUsed,
      )
    : 0;

  return (
    <GameLayout>
      <div className="relative p-6">
        <ScreenBackground src="/images/backgrounds/agency-office.png" opacity={0.82} />
        <div className="relative z-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">NPC Scout Management</h1>
          <p className="text-sm text-zinc-400">
            {isTierEligible
              ? `${npcScouts.length} scout${npcScouts.length !== 1 ? "s" : ""} in your network${
                  unreviewedCount > 0
                    ? ` · ${unreviewedCount} unreviewed report${unreviewedCount !== 1 ? "s" : ""}`
                    : ""
                }${activeDelegations.length > 0 ? ` · ${activeDelegations.length} active delegation${activeDelegations.length !== 1 ? "s" : ""}` : ""}`
              : "Head of Scouting tier required"}
          </p>
        </div>

        {/* Gate: tier < 4 */}
        {!isTierEligible && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users size={40} className="mb-4 text-zinc-700" aria-hidden="true" />
            <p className="text-sm text-zinc-400">
              Reach Head of Scouting (Tier 4) to manage NPC scouts
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Current tier: {scout.careerTier} — build your reputation to advance your career.
            </p>
          </div>
        )}

        {/* Tier 4+ but no scouts yet */}
        {isTierEligible && npcScouts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users size={40} className="mb-4 text-zinc-700" aria-hidden="true" />
            <p className="text-sm text-zinc-400">No NPC scouts assigned yet.</p>
            <p className="mt-1 text-xs text-zinc-600">
              NPC scouts are allocated as you advance through the game.
            </p>
          </div>
        )}

        {/* Main content: scouts exist */}
        {isTierEligible && npcScouts.length > 0 && (
          <div className="space-y-6">
            {openLeadershipResponsibilities.length > 0 && (
              <Card className="border-fuchsia-400/20 bg-fuchsia-400/[0.05]" data-testid="leadership-handoffs">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">Leadership portfolio handoffs</CardTitle>
                      <p className="mt-1 text-sm text-zinc-400">
                        Select a scout below, then assign one open responsibility. The actual report will remain attributable to that scout.
                      </p>
                    </div>
                    <Badge variant={leadershipAttentionRemaining > 0 ? "warning" : "destructive"}>
                      {leadershipAttentionRemaining} attention left
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  {openLeadershipResponsibilities.map((responsibility) => {
                    const selectedScoutBusy = selectedScout
                      ? Boolean(activeDelegationsByScout[selectedScout.id])
                      : true;
                    return (
                      <div key={responsibility.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-300">
                          {responsibility.title}
                        </p>
                        <p className="mt-1 font-semibold text-white">{getPlayerName(responsibility.playerId)}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Due S{responsibility.dueSeason} W{responsibility.dueWeek}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          className="mt-3 w-full"
                          disabled={!selectedScout || selectedScoutBusy || leadershipAttentionRemaining < 1}
                          onClick={() => selectedScout && resolveLeadershipResponsibility(
                            responsibility.id,
                            "delegate",
                            selectedScout.id,
                          )}
                        >
                          {selectedScout
                            ? selectedScoutBusy
                              ? "Selected scout busy"
                              : `Assign ${selectedScout.firstName}`
                            : "Select a scout"}
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Two-column: roster + detail */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Left: NPC Scout roster */}
              <div className={selectedScout ? "lg:col-span-2" : "lg:col-span-3"}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {npcScouts.map((npcScout) => (
                    <NPCScoutCard
                      key={npcScout.id}
                      scout={npcScout}
                      territory={getTerritoryForScout(npcScout)}
                      activeDelegation={activeDelegationsByScout[npcScout.id]}
                      activeDelegationPlayerName={
                        activeDelegationsByScout[npcScout.id]
                          ? getPlayerName(activeDelegationsByScout[npcScout.id].playerId)
                          : undefined
                      }
                      isSelected={selectedScoutId === npcScout.id}
                      onClick={() =>
                        setSelectedScoutId(
                          selectedScoutId === npcScout.id ? null : npcScout.id
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Right: Selected scout detail */}
              {selectedScout && (
                <div>
                  <NPCScoutDetail
                    scout={selectedScout}
                    territory={selectedTerritory}
                    allTerritories={allTerritories}
                    reports={allNPCReports}
                    activeDelegation={activeDelegationsByScout[selectedScout.id]}
                    activeDelegatedPlayerName={
                      activeDelegationsByScout[selectedScout.id]
                        ? getPlayerName(activeDelegationsByScout[selectedScout.id].playerId)
                        : undefined
                    }
                    activePlayerDelegations={activeDelegationsByPlayer}
                    onAssign={(territoryId) =>
                      assignNPCScoutTerritory(selectedScout.id, territoryId)
                    }
                    onMarkReviewed={reviewNPCReport}
                    onClose={() => setSelectedScoutId(null)}
                    getPlayerName={getPlayerName}
                    watchlist={gameState.watchlist ?? []}
                    onDelegate={delegateScouting}
                    onToggleWatchlist={toggleWatchlist}
                  />
                </div>
              )}
            </div>

            {/* All NPC reports section */}
            {allNPCReports.length > 0 && (
              <section aria-label="All NPC Scout Reports">
                <div className="mb-3 flex items-center gap-3">
                  <FileText size={16} className="text-zinc-400" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-zinc-300">
                    All Reports
                  </h2>
                  {unreviewedCount > 0 && (
                    <Badge variant="warning" className="text-[10px]">
                      {unreviewedCount} unreviewed
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {allNPCReports.map((report) => {
                    const npcScout = gameState.npcScouts[report.npcScoutId];
                    const scoutName = npcScout
                      ? `${npcScout.firstName} ${npcScout.lastName}`
                      : "Unknown Scout";
                    return (
                      <div key={report.id} className="space-y-1">
                        <p className="text-[10px] text-zinc-600">
                          From: {scoutName}
                        </p>
                        <ReportCard
                          report={report}
                          playerName={getPlayerName(report.playerId)}
                          onMarkReviewed={reviewNPCReport}
                          isWatchlisted={(gameState.watchlist ?? []).includes(report.playerId)}
                          onToggleWatchlist={toggleWatchlist}
                          onDelegate={
                            selectedScout
                              ? (playerId) => delegateScouting(selectedScout.id, playerId)
                              : undefined
                          }
                          delegateLabel={
                            selectedScout
                              ? activeDelegationsByScout[selectedScout.id] &&
                                activeDelegationsByScout[selectedScout.id].playerId !== report.playerId
                                ? "Scout Busy"
                                : activeDelegationsByPlayer[report.playerId]
                                  ? "Assigned"
                                  : "Delegate"
                              : "Delegate"
                          }
                          delegateDisabled={
                            !selectedScout ||
                            (activeDelegationsByScout[selectedScout.id] !== undefined &&
                              activeDelegationsByScout[selectedScout.id].playerId !== report.playerId) ||
                            activeDelegationsByPlayer[report.playerId] !== undefined
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
        </div>
      </div>
    </GameLayout>
  );
}
