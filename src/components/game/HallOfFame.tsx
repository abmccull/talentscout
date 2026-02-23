"use client";

import { useGameStore } from "@/stores/gameStore";
import type { LegacyScore, Scout, GameState } from "@/engine/core/types";
import { ScreenBackground } from "@/components/ui/screen-background";
import {
  Trophy,
  Star,
  Globe,
  Users,
  FileText,
  Eye,
  TrendingUp,
  Award,
  Home,
} from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

interface HallOfFameProps {
  legacyScore: LegacyScore;
  scout: Scout;
  gameState: GameState;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Determine a legacy tier label from the total score. */
function getLegacyTier(score: number): { label: string; color: string } {
  if (score >= 200) return { label: "Legendary", color: "text-yellow-400" };
  if (score >= 150) return { label: "Hall of Fame", color: "text-amber-400" };
  if (score >= 100) return { label: "Elite", color: "text-emerald-400" };
  if (score >= 60)  return { label: "Respected", color: "text-blue-400" };
  if (score >= 30)  return { label: "Journeyman", color: "text-zinc-300" };
  return { label: "Newcomer", color: "text-zinc-500" };
}

/** Top 5 discoveries by potential ability. */
function getTopDiscoveries(state: GameState): Array<{
  name: string;
  pa: number;
  nationality: string;
}> {
  return state.discoveryRecords
    .slice()
    .sort((a, b) => (b.initialPA ?? 0) - (a.initialPA ?? 0))
    .slice(0, 5)
    .map((d) => {
      const player = state.players[d.playerId];
      return {
        name: player
          ? `${player.firstName} ${player.lastName}`
          : "Unknown Player",
        pa: d.initialPA ?? player?.potentialAbility ?? 0,
        nationality: player?.nationality ?? "Unknown",
      };
    });
}

/** Convert a PA (1–200) to a star display (0.5–5.0). */
function paToStars(pa: number): string {
  const stars = Math.round((pa / 200) * 10) / 2; // half-star steps
  return `${Math.max(0.5, Math.min(5, stars)).toFixed(1)}★`;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function StatRow({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#222] bg-[#0e0e0e] px-4 py-3">
      <div className="flex items-center gap-2.5 text-sm text-zinc-400">
        <Icon size={15} className="shrink-0 text-zinc-500" aria-hidden="true" />
        {label}
      </div>
      <span className={`text-sm font-semibold ${accent ?? "text-zinc-200"}`}>
        {value}
      </span>
    </div>
  );
}

function LegacyBreakdown({ score }: { score: LegacyScore }) {
  const components: Array<{ label: string; value: number; color: string }> = [
    { label: "Youth Found", value: score.youthFound, color: "bg-emerald-500" },
    { label: "First Team Breakthroughs", value: score.firstTeamBreakthroughs, color: "bg-blue-500" },
    { label: "International Caps from Finds", value: score.internationalCapsFromFinds, color: "bg-purple-500" },
    { label: "Clubs Worked At", value: score.clubsWorkedAt, color: "bg-amber-500" },
    { label: "Countries Scouted", value: score.countriesScouted, color: "bg-teal-500" },
    { label: "Scenarios Completed", value: score.scenariosCompleted, color: "bg-pink-500" },
  ];

  const maxValue = Math.max(...components.map((c) => c.value), 1);

  return (
    <div className="rounded-xl border border-[#222] bg-[#111] p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Legacy Breakdown
      </h3>
      <div className="space-y-3">
        {components.map((c) => (
          <div key={c.label}>
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
              <span>{c.label}</span>
              <span className="font-medium text-zinc-200">{c.value}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#222]">
              <div
                className={`h-full rounded-full ${c.color} transition-all duration-700`}
                style={{ width: `${(c.value / maxValue) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[#222] pt-4">
        <span className="text-sm font-semibold text-zinc-300">Total Score</span>
        <span className="text-xl font-bold text-emerald-400">{score.totalScore}</span>
      </div>
    </div>
  );
}

function TopDiscoveries({ state }: { state: GameState }) {
  const discoveries = getTopDiscoveries(state);

  if (discoveries.length === 0) {
    return (
      <div className="rounded-xl border border-[#222] bg-[#111] p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Top Discoveries
        </h3>
        <p className="text-sm text-zinc-600">No discoveries recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#222] bg-[#111] p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Top Discoveries by Potential
      </h3>
      <div className="space-y-2">
        {discoveries.map((d, i) => (
          <div
            key={`${d.name}-${i}`}
            className="flex items-center justify-between rounded-lg bg-[#0e0e0e] px-4 py-2.5"
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-5 text-center text-xs font-bold ${
                  i === 0 ? "text-yellow-400" : "text-zinc-500"
                }`}
              >
                {i === 0 ? "★" : `${i + 1}`}
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-200">{d.name}</p>
                <p className="text-xs text-zinc-500">{d.nationality}</p>
              </div>
            </div>
            <span className="text-sm font-semibold text-amber-400">
              {paToStars(d.pa)}
            </span>
          </div>
        ))}
      </div>

      {/* Best discovery callout */}
      {state.legacyScore.bestDiscoveryName !== "" && (
        <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
          <p className="text-xs text-yellow-400">
            Career-best discovery: <span className="font-semibold">{state.legacyScore.bestDiscoveryName}</span>
            {" "}({paToStars(state.legacyScore.bestDiscoveryPA)} potential)
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function HallOfFame({ legacyScore, scout, gameState }: HallOfFameProps) {
  const setScreen = useGameStore((s) => s.setScreen);
  const tier = getLegacyTier(legacyScore.totalScore);

  // Career statistics derived from game state
  const totalReports = Object.values(gameState.reports).length +
    Object.values(gameState.placementReports).length;
  const totalObservations = Object.values(gameState.observations).length;
  const countriesScouted = Object.values(scout.countryReputations).filter(
    (cr) => cr.reportsSubmitted > 0,
  ).length;
  const wonderkidsFound = gameState.discoveryRecords.filter(
    (d) => d.wasWonderkid,
  ).length;

  // Seasons played estimate from currentSeason and legacyScore
  const seasonsPlayed = legacyScore.totalSeasons > 0
    ? legacyScore.totalSeasons
    : gameState.currentSeason - 2024;

  return (
    <div className="relative min-h-screen bg-[#0a0a0a] px-4 py-10">
      <ScreenBackground src="/images/backgrounds/season-end.png" opacity={0.7} position="center top" />
      <div className="relative z-10 mx-auto max-w-3xl">

        {/* Header */}
        <div className="mb-10 text-center">
          {/* Trophy icon */}
          <div className="mb-4 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-yellow-500/20 to-amber-600/10 ring-2 ring-yellow-500/30">
              <Trophy size={38} className="text-yellow-400" aria-hidden="true" />
            </div>
          </div>

          <h1 className="mb-1 text-4xl font-bold tracking-tight text-white">
            Career Complete
          </h1>
          <p className="mb-4 text-zinc-400">
            {scout.firstName} {scout.lastName} &middot; {scout.primarySpecialization} Scout
          </p>

          {/* Legacy tier badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#333] bg-[#111] px-5 py-2">
            <Award size={16} className={tier.color} aria-hidden="true" />
            <span className={`text-base font-bold ${tier.color}`}>
              {tier.label}
            </span>
          </div>
        </div>

        {/* Career timeline strip */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[#222] bg-[#111] p-4 text-center">
            <p className="text-3xl font-bold text-white">{seasonsPlayed}</p>
            <p className="mt-1 text-xs text-zinc-500">Seasons Played</p>
          </div>
          <div className="rounded-xl border border-[#222] bg-[#111] p-4 text-center">
            <p className="text-3xl font-bold text-emerald-400">
              {legacyScore.careerHighTier > 0 ? legacyScore.careerHighTier : scout.careerTier}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Highest Tier Reached</p>
          </div>
          <div className="rounded-xl border border-[#222] bg-[#111] p-4 text-center">
            <p className="text-3xl font-bold text-amber-400">{legacyScore.totalScore}</p>
            <p className="mt-1 text-xs text-zinc-500">Legacy Score</p>
          </div>
        </div>

        {/* Career stats grid */}
        <div className="mb-6 space-y-2">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Career Statistics
          </h3>
          <StatRow icon={FileText} label="Total Reports" value={totalReports} />
          <StatRow icon={Eye} label="Total Observations" value={totalObservations} />
          <StatRow icon={Globe} label="Countries Scouted" value={countriesScouted} />
          <StatRow icon={Star} label="Wonderkids Discovered" value={wonderkidsFound} accent="text-yellow-400" />
          <StatRow icon={Users} label="Clubs Worked At" value={legacyScore.clubsWorkedAt} />
          <StatRow icon={TrendingUp} label="Scenarios Completed" value={legacyScore.scenariosCompleted} accent="text-emerald-400" />
        </div>

        {/* Legacy breakdown */}
        <div className="mb-6">
          <LegacyBreakdown score={legacyScore} />
        </div>

        {/* Top discoveries */}
        <div className="mb-8">
          <TopDiscoveries state={gameState} />
        </div>

        {/* Play Again CTA */}
        <div className="text-center">
          <p className="mb-4 text-sm text-zinc-500">
            Your story as a scout is complete. Ready to begin again?
          </p>
          <button
            onClick={() => setScreen("mainMenu")}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-emerald-500 active:scale-[0.98]"
          >
            <Home size={18} aria-hidden="true" />
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
