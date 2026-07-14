"use client";

import { useMemo, useState } from "react";
import { Building2, ChevronDown, ExternalLink, UserRound, UsersRound } from "lucide-react";
import type { Club, League, Player } from "@/engine/core/types";
import {
  buildWorldArchiveComparisonCatalog,
  type ClubArchiveTimeline,
  type ManagerArchiveTimeline,
  type PlayerArchiveTimeline,
} from "@/engine/world/historyComparison";
import type { WorldHistoryState } from "@/engine/world/worldHistory";

type ComparisonKind = "player" | "club" | "manager";
type ArchiveTimeline = PlayerArchiveTimeline | ClubArchiveTimeline | ManagerArchiveTimeline;

interface WorldHistoryComparisonProps {
  history: WorldHistoryState;
  clubs: Record<string, Club>;
  leagues: Record<string, League>;
  players: Record<string, Player>;
  retiredPlayers: Record<string, Player>;
  onInspectSeason: (season: number) => void;
  onOpenPlayer?: (playerId: string) => void;
}

interface ComparisonOption {
  id: string;
  label: string;
  timeline: ArchiveTimeline;
}

interface ComparisonMetric {
  label: string;
  left: string;
  right: string;
}

const KIND_OPTIONS = [
  { id: "player", label: "Players", Icon: UserRound },
  { id: "club", label: "Clubs", Icon: Building2 },
  { id: "manager", label: "Managers", Icon: UsersRound },
] as const;

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatStatus(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function playerLabel(
  timeline: PlayerArchiveTimeline,
  players: Record<string, Player>,
  retiredPlayers: Record<string, Player>,
): string {
  const player = players[timeline.id] ?? retiredPlayers[timeline.id];
  if (player) return `${player.firstName} ${player.lastName}`;
  const archived = `${timeline.firstName ?? ""} ${timeline.lastName ?? ""}`.trim();
  return archived || "Historic player";
}

function buildOptions(
  kind: ComparisonKind,
  catalog: ReturnType<typeof buildWorldArchiveComparisonCatalog>,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  retiredPlayers: Record<string, Player>,
): ComparisonOption[] {
  if (kind === "player") {
    return catalog.players.map((timeline) => ({
      id: timeline.id,
      label: playerLabel(timeline, players, retiredPlayers),
      timeline,
    })).sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  }
  if (kind === "club") {
    return catalog.clubs.map((timeline) => ({
      id: timeline.id,
      label: clubs[timeline.id]?.name ?? "Historic club",
      timeline,
    })).sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  }
  return catalog.managers.map((timeline) => ({
    id: timeline.id,
    label: timeline.name,
    timeline,
  })).sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

function buildComparisonMetrics(
  kind: ComparisonKind,
  left: ArchiveTimeline,
  right: ArchiveTimeline,
): ComparisonMetric[] {
  if (kind === "player" && left.kind === "player" && right.kind === "player") {
    return [
      { label: "Archived seasons", left: `${left.summary.seasonsRecorded}`, right: `${right.summary.seasonsRecorded}` },
      { label: "Explicit appearances", left: `${left.summary.totalAppearances}`, right: `${right.summary.totalAppearances}` },
      { label: "Goals + assists", left: `${left.summary.totalGoals + left.summary.totalAssists}`, right: `${right.summary.totalGoals + right.summary.totalAssists}` },
      { label: "Appearance-weighted rating", left: left.summary.weightedAverageRating?.toFixed(1) ?? "No sample", right: right.summary.weightedAverageRating?.toFixed(1) ?? "No sample" },
      { label: "Recorded movements", left: `${left.summary.movementCount}`, right: `${right.summary.movementCount}` },
      { label: "Latest status", left: formatStatus(left.summary.latestStatus), right: formatStatus(right.summary.latestStatus) },
    ];
  }
  if (kind === "club" && left.kind === "club" && right.kind === "club") {
    return [
      { label: "Archived seasons", left: `${left.summary.seasonsRecorded}`, right: `${right.summary.seasonsRecorded}` },
      { label: "Titles", left: `${left.summary.titles}`, right: `${right.summary.titles}` },
      { label: "Best supported finish", left: left.summary.bestFinish ? `#${left.summary.bestFinish}` : "No table", right: right.summary.bestFinish ? `#${right.summary.bestFinish}` : "No table" },
      { label: "Total supported points", left: `${left.summary.totalPoints}`, right: `${right.summary.totalPoints}` },
      { label: "Promotion / relegation", left: `${left.summary.promotions} / ${left.summary.relegations}`, right: `${right.summary.promotions} / ${right.summary.relegations}` },
      { label: "Managers recorded", left: `${left.summary.managerCount}`, right: `${right.summary.managerCount}` },
    ];
  }
  if (kind === "manager" && left.kind === "manager" && right.kind === "manager") {
    return [
      { label: "Archived seasons", left: `${left.summary.seasonsRecorded}`, right: `${right.summary.seasonsRecorded}` },
      { label: "Clubs managed", left: `${left.summary.clubsManaged}`, right: `${right.summary.clubsManaged}` },
      { label: "Titles", left: `${left.summary.titles}`, right: `${right.summary.titles}` },
      { label: "Best supported finish", left: left.summary.bestFinish ? `#${left.summary.bestFinish}` : "No table", right: right.summary.bestFinish ? `#${right.summary.bestFinish}` : "No table" },
      { label: "Total supported points", left: `${left.summary.totalPoints}`, right: `${right.summary.totalPoints}` },
      { label: "Observed formations", left: left.summary.formations.join(", ") || "Unknown", right: right.summary.formations.join(", ") || "Unknown" },
    ];
  }
  return [];
}

function PlayerTimelinePanel({
  timeline,
  label,
  clubs,
  onInspectSeason,
  onOpenPlayer,
  canOpenPlayer,
}: {
  timeline: PlayerArchiveTimeline;
  label: string;
  clubs: Record<string, Club>;
  onInspectSeason: (season: number) => void;
  onOpenPlayer?: (playerId: string) => void;
  canOpenPlayer: boolean;
}) {
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-300">Player trajectory</p>
          <h4 className="mt-1 text-sm font-semibold text-white">{label}</h4>
          <p className="mt-1 text-xs text-zinc-400">{timeline.position} · {timeline.nationality ?? "Nationality not archived"}</p>
        </div>
        {onOpenPlayer && canOpenPlayer && (
          <button
            type="button"
            onClick={() => onOpenPlayer(timeline.id)}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-blue-500/30 px-2 text-xs font-semibold text-blue-200 transition hover:border-blue-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300"
          >
            Dossier <ExternalLink size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      <ol className="mt-3 space-y-2">
        {timeline.seasons.map((season) => {
          const clubId = season.registeredClubId ?? season.contractClubId;
          return (
            <li key={season.season}>
              <details className="group rounded-lg border border-zinc-800 bg-zinc-900/70 open:border-blue-500/30">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300">
                  <span>
                    <span className="font-mono text-xs font-semibold text-blue-200">S{season.season}</span>
                    <span className="ml-2 text-xs text-zinc-300">{clubId ? clubs[clubId]?.shortName ?? "Historic club" : formatStatus(season.status)}</span>
                  </span>
                  <span className="flex items-center gap-1 text-right text-xs text-zinc-400">
                    {season.performance ? `${season.performance.appearances} apps · ${season.performance.averageRating.toFixed(1)}` : "No explicit sample"}
                    <ChevronDown className="transition group-open:rotate-180" size={14} aria-hidden="true" />
                  </span>
                </summary>
                <div className="border-t border-zinc-800 px-3 py-3 text-xs text-zinc-300">
                  <p>Age {season.age} · {formatStatus(season.status)} · {formatMoney(season.marketValue)}</p>
                  {season.performance && (
                    <p className="mt-1">{season.performance.starts} starts · {season.performance.goals} goals · {season.performance.assists} assists</p>
                  )}
                  <p className="mt-1">{season.movementCount} resolved movement{season.movementCount === 1 ? "" : "s"}</p>
                  <button
                    type="button"
                    onClick={() => onInspectSeason(season.season)}
                    className="mt-2 min-h-11 rounded-lg border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                  >
                    Open Season {season.season} story
                  </button>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function ClubTimelinePanel({
  timeline,
  label,
  clubs,
  leagues,
  onInspectSeason,
}: {
  timeline: ClubArchiveTimeline;
  label: string;
  clubs: Record<string, Club>;
  leagues: Record<string, League>;
  onInspectSeason: (season: number) => void;
}) {
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Club trajectory</p>
      <h4 className="mt-1 text-sm font-semibold text-white">{label}</h4>
      <ol className="mt-3 space-y-2">
        {timeline.seasons.map((season) => (
          <li key={season.season}>
            <details className="group rounded-lg border border-zinc-800 bg-zinc-900/70 open:border-emerald-500/30">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
                <span className="font-mono text-xs font-semibold text-emerald-200">S{season.season}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{leagues[season.leagueId]?.name ?? "Historic competition"}</span>
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  {season.standing ? `#${season.standing.position} · ${season.standing.points} pts` : "No table"}
                  <ChevronDown className="transition group-open:rotate-180" size={14} aria-hidden="true" />
                </span>
              </summary>
              <div className="border-t border-zinc-800 px-3 py-3 text-xs text-zinc-300">
                {season.standing && <p>{season.standing.won}W {season.standing.drawn}D {season.standing.lost}L · {season.standing.goalDifference >= 0 ? "+" : ""}{season.standing.goalDifference} GD</p>}
                <p className="mt-1">{formatStatus(season.leagueMovement ?? "movement not recorded")} · {formatStatus(season.scoutingPhilosophy)}</p>
                {season.manager && <p className="mt-1">{season.manager.name} · {season.manager.preferredFormation}</p>}
                <button
                  type="button"
                  onClick={() => onInspectSeason(season.season)}
                  className="mt-2 min-h-11 rounded-lg border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                >
                  Open Season {season.season} story
                </button>
              </div>
            </details>
          </li>
        ))}
      </ol>
      {clubs[timeline.id] === undefined && <p className="mt-3 text-xs text-zinc-400">This club survives only in the archive.</p>}
    </article>
  );
}

function ManagerTimelinePanel({
  timeline,
  label,
  clubs,
  leagues,
  onInspectSeason,
}: {
  timeline: ManagerArchiveTimeline;
  label: string;
  clubs: Record<string, Club>;
  leagues: Record<string, League>;
  onInspectSeason: (season: number) => void;
}) {
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-300">Manager trajectory</p>
      <h4 className="mt-1 text-sm font-semibold text-white">{label}</h4>
      <ol className="mt-3 space-y-2">
        {timeline.seasons.map((season) => (
          <li key={`${season.season}:${season.clubId}`}>
            <details className="group rounded-lg border border-zinc-800 bg-zinc-900/70 open:border-violet-500/30">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">
                <span className="font-mono text-xs font-semibold text-violet-200">S{season.season}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{clubs[season.clubId]?.shortName ?? "Historic club"}</span>
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  {season.standing ? `#${season.standing.position} · ${season.standing.points} pts` : season.preferredFormation}
                  <ChevronDown className="transition group-open:rotate-180" size={14} aria-hidden="true" />
                </span>
              </summary>
              <div className="border-t border-zinc-800 px-3 py-3 text-xs text-zinc-300">
                <p>{leagues[season.leagueId]?.name ?? "Historic competition"} · {season.preferredFormation}</p>
                {season.standing && <p className="mt-1">{season.standing.played} played · {season.standing.goalDifference >= 0 ? "+" : ""}{season.standing.goalDifference} GD</p>}
                <p className="mt-1">{formatStatus(season.leagueMovement ?? "movement not recorded")}</p>
                <button
                  type="button"
                  onClick={() => onInspectSeason(season.season)}
                  className="mt-2 min-h-11 rounded-lg border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                >
                  Open Season {season.season} story
                </button>
              </div>
            </details>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function WorldHistoryComparison({
  history,
  clubs,
  leagues,
  players,
  retiredPlayers,
  onInspectSeason,
  onOpenPlayer,
}: WorldHistoryComparisonProps) {
  const [kind, setKind] = useState<ComparisonKind>("player");
  const [selections, setSelections] = useState<Record<ComparisonKind, [string?, string?]>>({
    player: [],
    club: [],
    manager: [],
  });
  const catalog = useMemo(() => buildWorldArchiveComparisonCatalog(history), [history]);
  const options = useMemo(
    () => buildOptions(kind, catalog, clubs, players, retiredPlayers),
    [catalog, clubs, kind, players, retiredPlayers],
  );
  const storedSelection = selections[kind];
  const leftId = options.some((option) => option.id === storedSelection[0])
    ? storedSelection[0]
    : options[0]?.id;
  const rightId = options.some((option) => option.id === storedSelection[1] && option.id !== leftId)
    ? storedSelection[1]
    : options.find((option) => option.id !== leftId)?.id;
  const left = options.find((option) => option.id === leftId);
  const right = options.find((option) => option.id === rightId);
  const metrics = left && right
    ? buildComparisonMetrics(kind, left.timeline, right.timeline)
    : [];

  const updateSelection = (side: 0 | 1, id: string) => {
    setSelections((current) => {
      const next: [string?, string?] = [...current[kind]];
      next[side] = id;
      if (next[0] === next[1]) {
        next[side === 0 ? 1 : 0] = options.find((option) => option.id !== id)?.id;
      }
      return { ...current, [kind]: next };
    });
  };

  const renderTimeline = (option: ComparisonOption) => {
    if (option.timeline.kind === "player") {
      return (
        <PlayerTimelinePanel
          key={option.id}
          timeline={option.timeline}
          label={option.label}
          clubs={clubs}
          onInspectSeason={onInspectSeason}
          onOpenPlayer={onOpenPlayer}
          canOpenPlayer={players[option.id] !== undefined}
        />
      );
    }
    if (option.timeline.kind === "club") {
      return (
        <ClubTimelinePanel
          key={option.id}
          timeline={option.timeline}
          label={option.label}
          clubs={clubs}
          leagues={leagues}
          onInspectSeason={onInspectSeason}
        />
      );
    }
    return (
      <ManagerTimelinePanel
        key={option.id}
        timeline={option.timeline}
        label={option.label}
        clubs={clubs}
        leagues={leagues}
        onInspectSeason={onInspectSeason}
      />
    );
  };

  return (
    <section data-testid="world-history-comparison" aria-labelledby="world-history-comparison-title" className="mt-3">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">Observable comparison</p>
        <h3 id="world-history-comparison-title" className="mt-1 text-base font-semibold text-white">Compare careers across seasons</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          Built from played results, explicit appearances, public values, and resolved movements—never hidden ability.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Comparison subject">
          {KIND_OPTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={kind === id}
              onClick={() => setKind(id)}
              className={`flex min-h-11 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${
                kind === id
                  ? "border-amber-400/50 bg-amber-400/10 text-amber-100"
                  : "border-zinc-700 bg-zinc-950/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              <Icon size={14} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </div>

      {options.length > 0 ? (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">First subject</span>
              <select
                aria-label="First comparison subject"
                value={leftId}
                onChange={(event) => updateSelection(0, event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
              >
                {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Second subject</span>
              <select
                aria-label="Second comparison subject"
                value={rightId ?? ""}
                disabled={options.length < 2}
                onChange={(event) => updateSelection(1, event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
              >
                {options.length < 2 && <option value="">Archive another subject to compare</option>}
                {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>

          {left && right ? (
            <div className="mt-3 rounded-xl border border-zinc-800">
              <table className="w-full table-fixed border-collapse text-left text-xs">
                <caption className="sr-only">Comparison between {left.label} and {right.label}</caption>
                <thead className="bg-zinc-900/90 text-zinc-300">
                  <tr>
                    <th scope="col" className="w-[34%] px-2 py-2 font-medium sm:px-3">Evidence</th>
                    <th scope="col" className="w-[33%] break-words px-2 py-2 font-semibold text-white sm:px-3">{left.label}</th>
                    <th scope="col" className="w-[33%] break-words px-2 py-2 font-semibold text-white sm:px-3">{right.label}</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((metric) => (
                    <tr key={metric.label} className="border-t border-zinc-800">
                      <th scope="row" className="break-words px-2 py-2 font-medium text-zinc-500 sm:px-3">{metric.label}</th>
                      <td className="break-words px-2 py-2 text-zinc-200 sm:px-3">{metric.left}</td>
                      <td className="break-words px-2 py-2 text-zinc-200 sm:px-3">{metric.right}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p role="status" className="mt-3 rounded-xl border border-dashed border-zinc-700 p-4 text-xs text-zinc-500">
              One {kind} is archived. A second distinct history will unlock side-by-side evidence.
            </p>
          )}

          <div className="mt-3 space-y-3">
            {left && renderTimeline(left)}
            {right && renderTimeline(right)}
          </div>
        </>
      ) : (
        <p role="status" className="mt-3 rounded-xl border border-dashed border-zinc-700 p-4 text-xs leading-relaxed text-zinc-500">
          No {kind} timeline has enough archived evidence yet. Complete another season to extend the living record.
        </p>
      )}
    </section>
  );
}
