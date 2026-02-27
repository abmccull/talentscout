"use client";

import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  Award,
  Eye,
  Target,
  Globe,
  TrendingUp,
  DollarSign,
  Baby,
  Shield,
  BookOpen,
  Star,
  Zap,
  Users,
  FileText,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import type { SeasonAward, LeagueAward, SeasonStats } from "@/engine/core/types";
import { ScreenBackground } from "@/components/ui/screen-background";

// =============================================================================
// HELPERS
// =============================================================================

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}\u00A3${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}\u00A3${(abs / 1_000).toFixed(0)}K`;
  return `${sign}\u00A3${abs}`;
}

/** Map award ID to a lucide icon component. */
function getAwardIcon(id: string) {
  switch (id) {
    case "golden-eye":
      return Eye;
    case "mr-reliable":
      return Target;
    case "globe-trotter":
      return Globe;
    case "rising-star":
      return TrendingUp;
    case "moneyball-master":
      return DollarSign;
    case "youth-whisperer":
      return Baby;
    case "iron-scout":
      return Shield;
    case "the-professor":
      return BookOpen;
    default:
      return Award;
  }
}

function getLeagueAwardIcon(id: string) {
  switch (id) {
    case "golden-boot":
      return Zap;
    case "best-young-player":
      return Star;
    case "biggest-transfer":
      return DollarSign;
    case "breakthrough-discovery":
      return Eye;
    default:
      return Trophy;
  }
}

function tierColor(tier: SeasonAward["tier"]): string {
  switch (tier) {
    case "gold":
      return "text-amber-400";
    case "silver":
      return "text-zinc-300";
    case "bronze":
      return "text-orange-400";
  }
}

function tierBorder(tier: SeasonAward["tier"]): string {
  switch (tier) {
    case "gold":
      return "border-amber-500/40";
    case "silver":
      return "border-zinc-400/30";
    case "bronze":
      return "border-orange-500/30";
  }
}

function tierGlow(tier: SeasonAward["tier"]): string {
  switch (tier) {
    case "gold":
      return "shadow-amber-500/20";
    case "silver":
      return "shadow-zinc-400/10";
    case "bronze":
      return "shadow-orange-500/10";
  }
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function SeasonHeader({
  season,
  clubName,
  stats,
}: {
  season: number;
  clubName: string;
  stats: SeasonStats;
}) {
  return (
    <div className="mb-10 text-center">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-1.5 text-sm font-medium text-amber-400">
        <Trophy size={14} />
        End of Season
      </div>
      <h1 className="mb-2 text-4xl font-bold tracking-tight text-white">
        Season {season} Complete
      </h1>
      <p className="mb-6 text-lg text-zinc-400">{clubName}</p>

      <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-zinc-800/60 px-4 py-3">
          <p className="text-2xl font-bold text-white">
            {stats.reportsSubmitted}
          </p>
          <p className="text-xs text-zinc-500">Reports Submitted</p>
        </div>
        <div className="rounded-lg bg-zinc-800/60 px-4 py-3">
          <p className="text-2xl font-bold text-white">
            {stats.playersDiscovered}
          </p>
          <p className="text-xs text-zinc-500">Discoveries Made</p>
        </div>
        <div className="rounded-lg bg-zinc-800/60 px-4 py-3">
          <p className="text-2xl font-bold text-white">{stats.hitRate}%</p>
          <p className="text-xs text-zinc-500">Hit Rate</p>
        </div>
        <div className="rounded-lg bg-zinc-800/60 px-4 py-3">
          <p
            className={`text-2xl font-bold ${stats.reputationChange >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {stats.reputationChange >= 0 ? "+" : ""}
            {stats.reputationChange}
          </p>
          <p className="text-xs text-zinc-500">Reputation</p>
        </div>
      </div>
    </div>
  );
}

function ScoutAwardCard({ award }: { award: SeasonAward }) {
  const Icon = getAwardIcon(award.id);
  return (
    <div
      className={`award-card-enter relative overflow-hidden rounded-xl border ${tierBorder(award.tier)} bg-zinc-900/80 p-5 shadow-lg ${tierGlow(award.tier)}`}
    >
      <div className="award-shimmer absolute inset-0 pointer-events-none" />
      <div className="relative flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-800 ${tierColor(award.tier)}`}
        >
          <Icon size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className={`text-lg font-bold ${tierColor(award.tier)}`}
          >
            {award.name}
          </h3>
          <p className="mt-0.5 text-sm text-zinc-400">{award.description}</p>
          <p className="mt-1 text-xs text-zinc-500">{award.criteria}</p>
        </div>
      </div>
    </div>
  );
}

function ScoutAwardsSection({ awards }: { awards: SeasonAward[] }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-amber-400">
        <Trophy size={20} />
        Your Awards
      </h2>
      {awards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {awards.map((award) => (
            <ScoutAwardCard key={award.id} award={award} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
          <Trophy size={32} className="mx-auto mb-3 text-zinc-600" />
          <p className="text-zinc-400">
            Keep pushing — awards await next season
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Write more reports, discover wonderkids, and build your reputation
          </p>
        </div>
      )}
    </section>
  );
}

function LeagueAwardCard({ award }: { award: LeagueAward }) {
  const Icon = getLeagueAwardIcon(award.id);
  const { selectPlayer, setScreen } = useGameStore();

  const handleClick = () => {
    if (award.relatedPlayerId) {
      selectPlayer(award.relatedPlayerId);
      setScreen("playerProfile");
    }
  };

  return (
    <div
      className={`rounded-xl border border-zinc-700/40 bg-zinc-900/60 p-4 transition ${
        award.relatedPlayerId
          ? "cursor-pointer hover:border-amber-500/30 hover:bg-zinc-800/80"
          : ""
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-amber-400/70">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-zinc-200">{award.name}</h3>
          <p className="mt-0.5 text-sm text-zinc-400">{award.description}</p>
          <p className="mt-1 text-xs text-amber-400/70">{award.stat}</p>
        </div>
      </div>
    </div>
  );
}

function LeagueAwardsSection({ awards }: { awards: LeagueAward[] }) {
  if (awards.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-zinc-200">
        <Award size={20} className="text-amber-400/60" />
        League Awards
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {awards.map((award) => (
          <LeagueAwardCard key={award.id} award={award} />
        ))}
      </div>
    </section>
  );
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800/50 py-2 last:border-0">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className={`text-sm font-medium ${color ?? "text-zinc-200"}`}>
        {value}
      </span>
    </div>
  );
}

function SeasonStatisticsSection({ stats }: { stats: SeasonStats }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-zinc-200">
        <BarChart3 size={20} className="text-zinc-400" />
        Season Statistics
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Reports */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <FileText size={14} className="text-zinc-500" />
            Reports
          </div>
          <StatRow
            label="Submitted"
            value={stats.reportsSubmitted}
          />
          <StatRow
            label="Avg Quality"
            value={stats.avgReportQuality}
            color={
              stats.avgReportQuality >= 70
                ? "text-emerald-400"
                : stats.avgReportQuality >= 50
                  ? "text-amber-400"
                  : "text-red-400"
            }
          />
        </div>

        {/* Scouting */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <Eye size={14} className="text-zinc-500" />
            Scouting
          </div>
          <StatRow label="Matches Attended" value={stats.matchesAttended} />
          <StatRow
            label="Players Discovered"
            value={`${stats.playersDiscovered} (${stats.wonderkidsDiscovered} wonderkids)`}
          />
        </div>

        {/* Transfers */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <Users size={14} className="text-zinc-500" />
            Transfers
          </div>
          <StatRow
            label="Recommendations"
            value={stats.transferRecommendations}
          />
          <StatRow label="Accepted" value={stats.recommendationsAccepted} />
          <StatRow label="Signed" value={stats.recommendationsSigned} />
          <StatRow
            label="Hit Rate"
            value={`${stats.hitRate}%`}
            color={
              stats.hitRate >= 50
                ? "text-emerald-400"
                : stats.hitRate >= 25
                  ? "text-amber-400"
                  : "text-zinc-400"
            }
          />
        </div>

        {/* Reputation */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <TrendingUp size={14} className="text-zinc-500" />
            Reputation
          </div>
          <StatRow label="Start" value={stats.reputationStart} />
          <StatRow label="End" value={stats.reputationEnd} />
          <StatRow
            label="Change"
            value={`${stats.reputationChange >= 0 ? "+" : ""}${stats.reputationChange}`}
            color={
              stats.reputationChange > 0
                ? "text-emerald-400"
                : stats.reputationChange < 0
                  ? "text-red-400"
                  : "text-zinc-400"
            }
          />
        </div>

        {/* Financial */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <DollarSign size={14} className="text-zinc-500" />
            Financial
          </div>
          <StatRow
            label="Income"
            value={formatMoney(stats.income)}
            color="text-emerald-400"
          />
          <StatRow
            label="Expenses"
            value={formatMoney(stats.expenses)}
            color="text-red-400"
          />
          <StatRow
            label="Profit / Loss"
            value={formatMoney(stats.profitLoss)}
            color={
              stats.profitLoss >= 0 ? "text-emerald-400" : "text-red-400"
            }
          />
        </div>

        {/* Geography */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <Globe size={14} className="text-zinc-500" />
            Geography
          </div>
          <StatRow
            label="Countries Scouted"
            value={stats.countriesScouted}
          />
          <StatRow
            label="Avg Fatigue"
            value={`${Math.round(stats.avgFatigue)}%`}
            color={
              stats.avgFatigue < 30
                ? "text-emerald-400"
                : stats.avgFatigue < 60
                  ? "text-amber-400"
                  : "text-red-400"
            }
          />
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SeasonAwardsScreen() {
  const { gameState, setScreen } = useGameStore();

  if (!gameState || !gameState.seasonAwardsData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-500">No awards data available.</p>
      </div>
    );
  }

  const { seasonAwardsData } = gameState;

  const handleContinue = () => {
    setScreen("dashboard");
  };

  return (
    <div className="relative min-h-screen bg-zinc-950">
      <ScreenBackground src="/images/backgrounds/season-end.png" opacity={0.72} />
      <div className="relative z-10">
      {/* CSS-only animations */}
      <style jsx>{`
        @keyframes award-enter {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes trophy-pulse {
          0%,
          100% {
            transform: scale(1);
            filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.3));
          }
          50% {
            transform: scale(1.05);
            filter: drop-shadow(0 0 16px rgba(245, 158, 11, 0.5));
          }
        }
        .award-card-enter {
          animation: award-enter 0.5s ease-out both;
        }
        .award-card-enter:nth-child(1) {
          animation-delay: 0.1s;
        }
        .award-card-enter:nth-child(2) {
          animation-delay: 0.2s;
        }
        .award-card-enter:nth-child(3) {
          animation-delay: 0.3s;
        }
        .award-card-enter:nth-child(4) {
          animation-delay: 0.4s;
        }
        .award-card-enter:nth-child(5) {
          animation-delay: 0.5s;
        }
        .award-card-enter:nth-child(6) {
          animation-delay: 0.6s;
        }
        .award-card-enter:nth-child(7) {
          animation-delay: 0.7s;
        }
        .award-card-enter:nth-child(8) {
          animation-delay: 0.8s;
        }
        .award-shimmer {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(245, 158, 11, 0.04) 50%,
            transparent 100%
          );
          animation: shimmer 3s ease-in-out infinite;
        }
        .fade-in {
          animation: fadeIn 0.6s ease-out both;
        }
        .fade-in-delay {
          animation: fadeIn 0.6s ease-out 0.3s both;
        }
        .trophy-glow {
          animation: trophy-pulse 2s ease-in-out infinite;
        }
      `}</style>

      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Trophy header icon */}
        <div className="mb-4 flex justify-center fade-in">
          <div className="trophy-glow rounded-full bg-amber-500/10 p-4">
            <Trophy size={36} className="text-amber-400" />
          </div>
        </div>

        {/* Section 1: Season Summary Header */}
        <div className="fade-in">
          <SeasonHeader
            season={seasonAwardsData.season}
            clubName={seasonAwardsData.clubName}
            stats={seasonAwardsData.stats}
          />
        </div>

        {/* Section 2: Your Awards */}
        <div className="fade-in-delay">
          <ScoutAwardsSection awards={seasonAwardsData.scoutAwards} />
        </div>

        {/* Section 3: League Awards */}
        <div className="fade-in-delay">
          <LeagueAwardsSection awards={seasonAwardsData.leagueAwards} />
        </div>

        {/* Section 4: Season Statistics */}
        <div className="fade-in-delay">
          <SeasonStatisticsSection stats={seasonAwardsData.stats} />
        </div>

        {/* Section 5: Continue Button */}
        <div className="flex justify-center pb-8 fade-in-delay">
          <Button
            onClick={handleContinue}
            className="h-14 cursor-pointer gap-3 rounded-xl bg-emerald-600 px-10 text-lg font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 hover:shadow-emerald-500/30"
          >
            Continue to Next Season
            <ArrowRight size={20} />
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
