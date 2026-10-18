"use client";

import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { ArrowRight, Award, ChevronDown } from "lucide-react";
import type { LeagueAward, SeasonAward, SeasonStats } from "@/engine/core/types";
import { resolvePlayerDisplayName, resolvePlayerEntity } from "@/lib/playerResolution";

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}\u00A3${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}\u00A3${(abs / 1_000).toFixed(0)}K`;
  return `${sign}\u00A3${abs}`;
}

function scoutAwardCopy(award: SeasonAward) {
  // These records use a season-end fatigue sample and a report's estimate,
  // respectively. Neither establishes a season average or a paid transfer fee.
  if (award.id === "iron-scout") {
    return {
      description: "Finished this season with low fatigue.",
      criteria: "Season-end fatigue below 20%.",
    };
  }
  if (award.id === "moneyball-master") {
    return {
      description: "Two or more signed recommendations carried estimates below market value.",
      criteria: "Recognition for the estimates in your submitted reports.",
    };
  }
  return { description: award.description, criteria: award.criteria };
}

function leagueAwardCopy(award: LeagueAward, playerName: string) {
  // Preserve award IDs and results while keeping hidden ability and simulated
  // proxies out of the player's evidence record.
  switch (award.id) {
    case "best-young-player":
      return {
        name: award.name,
        record: playerName,
        description: "Named in this season's young player awards.",
      };
    case "breakthrough-discovery":
      return {
        name: "A discovery on record",
        record: playerName,
        description: "A player from your discoveries this season.",
      };
    case "golden-boot": {
      const estimatedGoals = award.stat.match(/\u2014 (\d+) goals$/u)?.[1];
      return {
        name: "Golden Boot · scoring estimate",
        record: estimatedGoals
          ? `${playerName} — estimated ${estimatedGoals} goals`
          : playerName,
        description: "A simulated scoring estimate for this season.",
      };
    }
    case "biggest-transfer":
      return {
        name: "Market value recognition",
        record: award.stat,
        description: "The highest market value in the season record. This does not record a completed transfer.",
      };
    default:
      return { name: award.name, record: award.stat, description: award.description };
  }
}

function ScoutAwards({ awards }: { awards: SeasonAward[] }) {
  return (
    <section aria-labelledby="scout-awards-heading" className="border-t border-[var(--border)] py-6 sm:py-8">
      <h2 id="scout-awards-heading" className="font-editorial text-2xl">
        Your awards
      </h2>
      {awards.length === 0 ? (
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
          No scouting awards this season. Your reports, discoveries and recommendations are recorded below.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--border)]">
          {awards.map((award) => {
            const copy = scoutAwardCopy(award);
            return (
              <li key={award.id} className="flex items-start gap-3 py-5">
                <Award aria-hidden="true" size={20} className="mt-1 shrink-0 text-[var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-base font-semibold">{award.name}</h3>
                    <span className="text-xs capitalize text-[var(--muted-foreground)]">
                      {award.tier} award
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{copy.description}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{copy.criteria}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LeagueAwards({ awards }: { awards: LeagueAward[] }) {
  const { gameState, selectPlayer, setScreen } = useGameStore();
  if (!gameState || awards.length === 0) return null;

  return (
    <details className="group border-t border-[var(--border)]">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)] [&::-webkit-details-marker]:hidden">
        <h2 className="font-editorial text-2xl">Around the league</h2>
        <span className="flex shrink-0 items-center gap-3 text-sm text-[var(--muted-foreground)]">
          {awards.length} awards
          <ChevronDown aria-hidden="true" size={18} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </span>
      </summary>
      <ul className="divide-y divide-[var(--border)] pb-4">
        {awards.map((award) => {
          const playerId = award.relatedPlayerId;
          const playerName = playerId ? resolvePlayerDisplayName(gameState, playerId) : "Unknown Player";
          const copy = leagueAwardCopy(award, playerName);
          return (
            <li key={award.id} className="py-5">
              <h3 className="text-base font-semibold">{copy.name}</h3>
              <p className="mt-2 text-base leading-6">{copy.record}</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{copy.description}</p>
              {playerId && resolvePlayerEntity(gameState, playerId) && (
                <Button
                  type="button"
                  variant="link"
                  className="mt-2 h-auto justify-start px-0 text-sm"
                  aria-label={`Open player file for ${playerName}`}
                  onClick={() => {
                    selectPlayer(playerId);
                    setScreen("playerProfile");
                  }}
                >
                  Open player file
                  <ArrowRight aria-hidden="true" size={16} />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function SeasonStatistics({ stats }: { stats: SeasonStats }) {
  const groups: { title: string; rows: [string, string | number][] }[] = [
    {
      title: "Reports",
      rows: [
        ["Submitted", stats.reportsSubmitted],
        ["Average report craft", stats.avgReportQuality],
      ],
    },
    {
      title: "Scouting",
      rows: [
        ["Matches attended", stats.matchesAttended],
        ["Players discovered", stats.playersDiscovered],
        ["High-upside calls", stats.highUpsideCalls ?? 0],
      ],
    },
    {
      title: "Recommendations",
      rows: [
        ["Made", stats.transferRecommendations],
        ["Accepted", stats.recommendationsAccepted],
        ["Signed", stats.recommendationsSigned],
        ["Acceptance rate", `${stats.hitRate}%`],
      ],
    },
    {
      title: "Reputation",
      rows: [
        ["At season start", stats.reputationStart],
        ["At season end", stats.reputationEnd],
        ["Change", `${stats.reputationChange >= 0 ? "+" : ""}${stats.reputationChange}`],
      ],
    },
    {
      title: "Finances",
      rows: [
        ["Income", formatMoney(stats.income)],
        ["Expenses", formatMoney(stats.expenses)],
        ["Profit / loss", formatMoney(stats.profitLoss)],
      ],
    },
    {
      title: "Travel and workload",
      rows: [
        ["Countries scouted", stats.countriesScouted],
        ["Fatigue at season end", `${Math.round(stats.avgFatigue)}%`],
      ],
    },
  ];

  return (
    <details className="group border-y border-[var(--border)]">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)] [&::-webkit-details-marker]:hidden">
        <h2 className="font-editorial text-2xl">Season statistics</h2>
        <ChevronDown aria-hidden="true" size={18} className="shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="grid gap-x-10 gap-y-7 pb-8 pt-2 sm:grid-cols-2">
        {groups.map(({ title, rows }) => (
          <section key={title}>
            <h3 className="mb-2 text-sm font-semibold">{title}</h3>
            <dl>
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-1.5 text-sm leading-5">
                  <dt className="text-[var(--muted-foreground)]">{label}</dt>
                  <dd className="shrink-0 font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </details>
  );
}

export function SeasonAwardsScreen() {
  const { gameState, setScreen, dismissSeasonAwards } = useGameStore();

  if (!gameState || !gameState.seasonAwardsData) {
    return (
      <main className="min-h-screen bg-[var(--background)] px-5 py-10 text-[var(--foreground)] sm:px-10 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <p className="dossier-eyebrow">Season review</p>
          <h1 className="mt-3 font-editorial text-3xl sm:text-4xl">No season review yet</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted-foreground)]">
            Your review will be ready when the season ends.
          </p>
          <Button className="mt-6" onClick={() => setScreen(gameState ? "dashboard" : "mainMenu")}>
            {gameState ? "Return to scouting desk" : "Return to main menu"}
          </Button>
        </div>
      </main>
    );
  }

  const { seasonAwardsData } = gameState;
  const { season, clubName, stats, scoutAwards, leagueAwards } = seasonAwardsData;

  const handleContinue = () => {
    dismissSeasonAwards();
    setScreen("dashboard");
  };

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-8 text-[var(--foreground)] sm:px-10 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <header className="pb-7 sm:pb-10">
          <p className="dossier-eyebrow">The season, on record</p>
          <h1 className="mt-3 font-editorial text-4xl leading-tight tracking-tight sm:text-5xl">
            Season {season} Complete
          </h1>
          <p className="mt-3 text-base leading-7 text-[var(--muted-foreground)]">{clubName}</p>
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:max-w-2xl sm:grid-cols-3">
            <div>
              <dt className="text-sm text-[var(--muted-foreground)]">Reports submitted</dt>
              <dd className="mt-1 text-2xl font-medium tabular-nums">{stats.reportsSubmitted}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--muted-foreground)]">Players discovered</dt>
              <dd className="mt-1 text-2xl font-medium tabular-nums">{stats.playersDiscovered}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--muted-foreground)]">Reputation change</dt>
              <dd className="mt-1 text-2xl font-medium tabular-nums">
                {stats.reputationChange >= 0 ? "+" : ""}{stats.reputationChange}
              </dd>
            </div>
          </dl>
          <Button onClick={handleContinue} size="lg" className="mt-7 w-full gap-3 sm:w-auto">
            Continue to Next Season
            <ArrowRight aria-hidden="true" size={18} />
          </Button>
        </header>
        <ScoutAwards awards={scoutAwards} />
        <LeagueAwards awards={leagueAwards} />
        <SeasonStatistics stats={stats} />
      </div>
    </main>
  );
}
