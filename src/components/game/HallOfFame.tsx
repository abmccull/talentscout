"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import type { LegacyScore, Scout, GameState } from "@/engine/core/types";
import {
  getCareerSeasonOrdinal,
  hasRepresentedCareerCompletionState,
} from "@/engine/career/legacy";
import { ScreenBackground } from "@/components/ui/screen-background";
import {
  Star,
  Globe,
  Users,
  FileText,
  Eye,
  TrendingUp,
  Award,
  Home,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { ScoutAvatar } from "@/components/game/ScoutAvatar";

interface HallOfFameProps {
  legacyScore: LegacyScore;
  scout: Scout;
  gameState: GameState;
}

function getLegacyTier(score: number): { label: string; color: string } {
  if (score >= 200) return { label: "Legendary", color: "text-yellow-400" };
  if (score >= 150) return { label: "Hall of Fame", color: "text-amber-400" };
  if (score >= 100) return { label: "Elite", color: "text-emerald-400" };
  if (score >= 60) return { label: "Respected", color: "text-blue-400" };
  if (score >= 30) return { label: "Journeyman", color: "text-zinc-300" };
  return { label: "Newcomer", color: "text-zinc-500" };
}

function getTopDiscoveries(state: GameState): Array<{
  name: string;
  pa: number;
  nationality: string;
}> {
  return state.discoveryRecords
    .slice()
    .sort((a, b) => (b.initialPA ?? 0) - (a.initialPA ?? 0))
    .slice(0, 5)
    .map((discovery) => {
      const player = state.players[discovery.playerId];
      return {
        name: player
          ? `${player.firstName} ${player.lastName}`
          : "Unknown Player",
        pa: discovery.initialPA ?? player?.potentialAbility ?? 0,
        nationality: player?.nationality ?? "Unknown",
      };
    });
}

function paToStars(pa: number): string {
  const stars = Math.round((pa / 200) * 10) / 2;
  return `${Math.max(0.5, Math.min(5, stars)).toFixed(1)}\u2605`;
}

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

  const maxValue = Math.max(...components.map((component) => component.value), 1);

  return (
    <div className="rounded-xl border border-[#222] bg-[#111] p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Legacy Breakdown
      </h3>
      <div className="space-y-3">
        {components.map((component) => (
          <div key={component.label}>
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
              <span>{component.label}</span>
              <span className="font-medium text-zinc-200">{component.value}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#222]">
              <div
                className={`h-full rounded-full ${component.color} transition-all duration-700`}
                style={{ width: `${(component.value / maxValue) * 100}%` }}
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
        {discoveries.map((discovery, index) => (
          <div
            key={`${discovery.name}-${index}`}
            className="flex items-center justify-between rounded-lg bg-[#0e0e0e] px-4 py-2.5"
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-5 text-center text-xs font-bold ${
                  index === 0 ? "text-yellow-400" : "text-zinc-500"
                }`}
              >
                {index === 0 ? "\u2605" : `${index + 1}`}
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-200">{discovery.name}</p>
                <p className="text-xs text-zinc-500">{discovery.nationality}</p>
              </div>
            </div>
            <span className="text-sm font-semibold text-amber-400">
              {paToStars(discovery.pa)}
            </span>
          </div>
        ))}
      </div>

      {state.legacyScore.bestDiscoveryName !== "" && (
        <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
          <p className="text-xs text-yellow-400">
            Career-best discovery:{" "}
            <span className="font-semibold">{state.legacyScore.bestDiscoveryName}</span>
            {" "}({paToStars(state.legacyScore.bestDiscoveryPA)} potential)
          </p>
        </div>
      )}
    </div>
  );
}

export function HallOfFame({ legacyScore, scout, gameState }: HallOfFameProps) {
  const setScreen = useGameStore((state) => state.setScreen);
  const completeLegacyCareer = useGameStore((state) => state.completeLegacyCareer);
  const tier = getLegacyTier(legacyScore.totalScore);
  const [legacySaved, setLegacySaved] = useState(false);
  const canCompleteCareer = hasRepresentedCareerCompletionState(gameState);

  const totalReports =
    Object.values(gameState.reports).length +
    Object.values(gameState.placementReports).length;
  const totalObservations = Object.values(gameState.observations).length;
  const countriesScouted = Object.values(scout.countryReputations).filter(
    (country) => country.reportsSubmitted > 0,
  ).length;
  const wonderkidsFound = gameState.discoveryRecords.filter(
    (discovery) => discovery.wasWonderkid,
  ).length;
  const seasonsPlayed = legacyScore.totalSeasons > 0
    ? legacyScore.totalSeasons
    : getCareerSeasonOrdinal(gameState.currentSeason);

  const saveLegacyCareer = () => {
    const profile = completeLegacyCareer();
    if (profile) {
      setLegacySaved(true);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#0a0a0a] px-4 py-10">
      <ScreenBackground
        src="/images/backgrounds/season-end.png"
        opacity={0.7}
        position="center top"
      />
      <div className="relative z-10 mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full ring-2 ring-yellow-500/30">
              <ScoutAvatar avatarId={scout.avatarId ?? 1} size={96} />
            </div>
          </div>

          <h1 className="mb-1 text-4xl font-bold tracking-tight text-white">
            {canCompleteCareer ? "Career Complete" : "Hall of Fame Snapshot"}
          </h1>
          <p className="mb-4 text-zinc-400">
            {scout.firstName} {scout.lastName} &middot; {scout.primarySpecialization} Scout
          </p>
          <p className="mx-auto max-w-2xl text-sm text-zinc-500">
            {canCompleteCareer
              ? "Your career has reached a real ending. Save it to your legacy profile to unlock New Game+."
              : "This is a live legacy snapshot for your active career. Viewing it does not end the save or unlock New Game+."}
          </p>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#333] bg-[#111] px-5 py-2">
            <Award size={16} className={tier.color} aria-hidden="true" />
            <span className={`text-base font-bold ${tier.color}`}>
              {tier.label}
            </span>
          </div>
        </div>

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

        <div className="mb-6 space-y-2">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Career Statistics
          </h3>
          <StatRow icon={FileText} label="Total Reports" value={totalReports} />
          <StatRow icon={Eye} label="Total Observations" value={totalObservations} />
          <StatRow icon={Globe} label="Countries Scouted" value={countriesScouted} />
          <StatRow
            icon={Star}
            label="Wonderkids Discovered"
            value={wonderkidsFound}
            accent="text-yellow-400"
          />
          <StatRow icon={Users} label="Clubs Worked At" value={legacyScore.clubsWorkedAt} />
          <StatRow
            icon={TrendingUp}
            label="Scenarios Completed"
            value={legacyScore.scenariosCompleted}
            accent="text-emerald-400"
          />
        </div>

        <div className="mb-6">
          <LegacyBreakdown score={legacyScore} />
        </div>

        <div className="mb-8">
          <TopDiscoveries state={gameState} />
        </div>

        <div className="space-y-4 text-center">
          {canCompleteCareer ? (
            <>
              <p className="mb-2 text-sm text-zinc-500">
                Your story as a scout is complete. Ready to begin again?
              </p>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <button
                  onClick={() => {
                    if (!legacySaved) {
                      saveLegacyCareer();
                    }
                    setScreen("newGame");
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-500 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:from-amber-500 hover:to-yellow-400 active:scale-[0.98]"
                >
                  <Sparkles size={18} aria-hidden="true" />
                  New Game+
                </button>
                <button
                  onClick={() => {
                    if (!legacySaved) {
                      saveLegacyCareer();
                    }
                    setScreen("mainMenu");
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-emerald-500 active:scale-[0.98]"
                >
                  <Home size={18} aria-hidden="true" />
                  Main Menu
                </button>
              </div>
              {legacySaved && (
                <p className="text-xs text-amber-400/80">
                  Career saved to your legacy profile. Your achievements carry forward.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mb-2 text-sm text-zinc-500">
                Your career is still active. Keep scouting to build a stronger legacy.
              </p>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <button
                  onClick={() => setScreen("career")}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-zinc-700 active:scale-[0.98]"
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                  Back to Career
                </button>
                <button
                  onClick={() => setScreen("mainMenu")}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-emerald-500 active:scale-[0.98]"
                >
                  <Home size={18} aria-hidden="true" />
                  Main Menu
                </button>
              </div>
              <p className="text-xs text-zinc-600">
                New Game+ stays locked until a real career ending is represented in the save state.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
