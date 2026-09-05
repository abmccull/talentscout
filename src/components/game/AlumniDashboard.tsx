"use client";

import { resolvePlayerDisplayName } from "@/lib/playerResolution";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { GameLayout } from "./GameLayout";
import { PlayerAgeTimeline, selectPlayerAgeTimeline } from "./PlayerAgeTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "./PlayerAvatar";
import {
  Star,
  Trophy,
  Globe,
  Sparkles,
  ArrowRightLeft,
  Users,
  ChevronDown,
  ChevronRight,
  Shield,
  Activity,
  Calendar,
  UserCheck,
  Target,
} from "lucide-react";
import type {
  AlumniMilestoneType,
  AlumniCareerUpdateType,
  AlumniRecord,
  AlumniSeasonStats,
  AlumniStatus,
} from "@/engine/core/types";
import { calculatePlacementSuccessRate } from "@/engine/youth/alumni";
import {
  buildScoutingCaseTimeline,
  type ScoutingCaseTimeline,
} from "@/engine/reports/scoutingCaseTimeline";
import { ScoutingCaseTimelineView } from "./ScoutingCaseTimeline";
import { projectCareerInterventionPortfolio } from "@/engine/career/careerInterventionPortfolio";

// ─── Milestone config ─────────────────────────────────────────────────────────

const MILESTONE_ICONS: Record<AlumniMilestoneType, React.ElementType> = {
  firstTeamDebut: Star,
  firstGoal: Trophy,
  internationalCallUp: Globe,
  wonderkidStatus: Sparkles,
  transfer: ArrowRightLeft,
};

const MILESTONE_COLORS: Record<AlumniMilestoneType, string> = {
  firstTeamDebut: "text-emerald-400",
  firstGoal: "text-amber-400",
  internationalCallUp: "text-blue-400",
  wonderkidStatus: "text-purple-400",
  transfer: "text-zinc-400",
};

const MILESTONE_LABELS: Record<AlumniMilestoneType, string> = {
  firstTeamDebut: "First Team Debut",
  firstGoal: "First Goal",
  internationalCallUp: "International Call-Up",
  wonderkidStatus: "Wonderkid Status",
  transfer: "Transfer",
};

// ─── Career update config ─────────────────────────────────────────────────────

const UPDATE_ICONS: Record<AlumniCareerUpdateType, React.ElementType> = {
  debut: Star,
  firstGoal: Trophy,
  teamOfWeek: Target,
  loanMove: ArrowRightLeft,
  transfer: ArrowRightLeft,
  released: Users,
  internationalCall: Globe,
  injury: Activity,
  captaincy: Shield,
};

const UPDATE_COLORS: Record<AlumniCareerUpdateType, string> = {
  debut: "text-emerald-400",
  firstGoal: "text-amber-400",
  teamOfWeek: "text-cyan-400",
  loanMove: "text-orange-400",
  transfer: "text-zinc-400",
  released: "text-red-400",
  internationalCall: "text-blue-400",
  injury: "text-red-500",
  captaincy: "text-yellow-400",
};

const STATUS_LABELS: Record<AlumniStatus, string> = {
  academy: "Academy",
  firstTeam: "First Team",
  loaned: "On Loan",
  released: "Released",
  retired: "Retired",
  transferred: "Transferred",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SeasonStatsTable({ stats }: { stats: AlumniSeasonStats[] }) {
  if (stats.length === 0) return null;

  // Sort newest season first
  const sorted = [...stats].sort((a, b) => b.season - a.season);

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        Season-by-Season Stats
      </p>
      <div className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]" tabIndex={0} role="region" aria-label="Alumni season statistics">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#27272a] text-[var(--muted-foreground)]">
              <th className="pb-1 pr-3 text-left font-medium">Season</th>
              <th className="pb-1 px-2 text-right font-medium">Apps</th>
              <th className="pb-1 px-2 text-right font-medium">Goals</th>
              <th className="pb-1 px-2 text-right font-medium">Assists</th>
              <th className="pb-1 pl-2 text-right font-medium">Avg Rating</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.season} className="border-b border-[#27272a]/50">
                <td className="py-1 pr-3 text-zinc-300">
                  S{s.season}
                  {s.source === "legacyEstimate" && (
                    <span className="ml-1 text-xs uppercase tracking-wide text-amber-400" title="Estimate retained from an older save">
                      estimate
                    </span>
                  )}
                </td>
                <td className="py-1 px-2 text-right text-zinc-400">{s.appearances}</td>
                <td className="py-1 px-2 text-right text-zinc-400">{s.goals}</td>
                <td className="py-1 px-2 text-right text-zinc-400">{s.assists}</td>
                <td className="py-1 pl-2 text-right text-zinc-300 font-medium">
                  {s.avgRating.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface AlumniCardProps {
  record: AlumniRecord;
  playerName: string;
  placedClubName: string;
  currentClubName: string;
  caseId?: string;
  getCaseTimeline: (caseId: string) => ScoutingCaseTimeline | null;
  portraitAge?: number;
}

function AlumniCard({
  record,
  playerName,
  placedClubName,
  currentClubName,
  caseId,
  getCaseTimeline,
  portraitAge,
}: AlumniCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"casebook" | "milestones" | "timeline" | "stats">("milestones");
  const milestoneCount = record.milestones.length;
  const latestRecordedEvent = record.careerUpdates?.at(-1)?.description ?? record.milestones.at(-1)?.description;
  const status = record.currentStatus ?? "academy";
  const caseTimeline = expanded && activeTab === "casebook" && caseId
    ? getCaseTimeline(caseId)
    : null;

  return (
    <article className="dossier-section py-2">
      {/* Card header — always visible */}
      <div className="flex items-start gap-4 py-5">
        <PlayerAvatar playerId={record.playerId} atAge={portraitAge} size={88} alt={playerName} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-editorial text-2xl text-[var(--foreground)] sm:text-3xl">{playerName}</h3>
            {/* Status badge */}
            <span
              className={`inline-flex items-center text-xs font-medium text-[var(--muted-foreground)]`}
            >
              {STATUS_LABELS[status]}
            </span>
            {/* Contact graduated badge */}
            {record.becameContact && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)]">
                <UserCheck size={10} aria-hidden="true" />
                Contact
              </span>
            )}
            {milestoneCount > 0 && (
              <Badge
                variant="secondary"
                className="shrink-0 text-xs"
              >
                {milestoneCount} milestone{milestoneCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-[var(--muted-foreground)]">
            <span>Placed at</span>
            <span className="text-zinc-300">{placedClubName}</span>
            {currentClubName !== placedClubName && (
              <>
                <ArrowRightLeft
                  size={10}
                  className="text-[var(--muted-foreground)]"
                  aria-hidden="true"
                />
                <span className="text-zinc-300">{currentClubName}</span>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Placed Season {record.placedSeason}, Week {record.placedWeek}
          </p>
          {latestRecordedEvent && <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--foreground)]">{latestRecordedEvent}</p>}
          <Button variant="outline" className="mt-4 gap-2"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} alumni record for ${playerName}`}>
            {expanded ? "Close career record" : "Open career record"}
            {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
          </Button>
        </div>
      </div>

      {/* Expanded content — tabs */}
      {expanded && (
        <div className="border-t border-[var(--border)] pb-6 pt-5">
          <PlayerAgeTimeline playerId={record.playerId} compact className="mb-5 max-w-md border-b border-[var(--border)] pb-5" />
          {/* Tab navigation */}
          <div className="mb-3 flex flex-wrap gap-1">
            {(["casebook", "milestones", "timeline", "stats"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-pressed={activeTab === tab}
                className={`min-h-11 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
                  activeTab === tab
                    ? "border-[var(--primary)] text-[var(--foreground)]"
                    : "border-transparent text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
                }`}
              >
                {tab === "casebook"
                  ? "Originating Case"
                  : tab === "milestones"
                    ? "Milestones"
                    : tab === "timeline"
                      ? "Career Timeline"
                      : "Season Stats"}
              </button>
            ))}
          </div>

          {activeTab === "casebook" && (
            caseTimeline ? (
              <ScoutingCaseTimelineView timeline={caseTimeline} />
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">
                This legacy alumni record predates the linked scouting case history.
              </p>
            )
          )}

          {/* Milestones tab */}
          {activeTab === "milestones" && (
            <>
              {record.milestones.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  No milestones are retained in this career record.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Career Milestones
                  </p>
                  {record.milestones.map((milestone, idx) => {
                    const Icon = MILESTONE_ICONS[milestone.type];
                    const color = MILESTONE_COLORS[milestone.type];
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-3 rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2"
                      >
                        <Icon
                          size={14}
                          className={`mt-0.5 shrink-0 ${color}`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`text-xs font-semibold ${color}`}>
                              {MILESTONE_LABELS[milestone.type]}
                            </p>
                            <span className="text-xs text-[var(--muted-foreground)]">
                              S{milestone.season} W{milestone.week}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400">
                            {milestone.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Career Timeline tab (F12) */}
          {activeTab === "timeline" && (
            <>
              {(record.careerUpdates ?? []).length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  No career updates are retained in this record.
                </p>
              ) : (
                <div className="relative space-y-0">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Career Timeline
                  </p>
                  {/* Vertical timeline line */}
                  <div className="relative ml-2">
                    <div className="absolute left-[5px] top-0 bottom-0 w-px bg-[#27272a]" />
                    {[...(record.careerUpdates ?? [])].reverse().map((update, idx) => {
                      const Icon = UPDATE_ICONS[update.type];
                      const color = UPDATE_COLORS[update.type];
                      return (
                        <div key={idx} className="relative flex items-start gap-3 pb-3 pl-5">
                          <div
                            className={`absolute left-0 top-0.5 flex h-[11px] w-[11px] items-center justify-center rounded-full border border-[#27272a] bg-[#141414]`}
                          >
                            <div className={`h-[5px] w-[5px] rounded-full ${color.replace("text-", "bg-")}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Icon size={12} className={`shrink-0 ${color}`} aria-hidden="true" />
                              <span className="text-xs text-[var(--muted-foreground)]">
                                S{update.season} W{update.week}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-zinc-400">
                              {update.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Season Stats tab (F12) */}
          {activeTab === "stats" && (
            <>
              {(record.seasonStats ?? []).length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  No season statistics are retained in this record.
                </p>
              ) : (
                <SeasonStatsTable stats={record.seasonStats ?? []} />
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function AlumniDashboard() {
  const { gameState, setScreen } = useGameStore();

  if (!gameState) return null;

  const { alumniRecords, legacyScore, clubs } = gameState;

  const getPlayerName = (playerId: string): string => {
    return resolvePlayerDisplayName(gameState, playerId);
  };

  const getClubName = (clubId: string): string => {
    return clubs[clubId]?.name ?? "Unknown Club";
  };

  const getCaseTimeline = (caseId: string): ScoutingCaseTimeline | null =>
    buildScoutingCaseTimeline(gameState, caseId);

  const getAlumniCaseId = (record: AlumniRecord): string | undefined =>
    record.caseId
    ?? (record.originatingReportId
      ? gameState.reports[record.originatingReportId]?.caseId
      : undefined)
    ?? Object.values(gameState.scoutingCases).find(
      (scoutingCase) => scoutingCase.alumniRecordId === record.id,
    )?.id;

  const successRate = calculatePlacementSuccessRate(alumniRecords);
  const contactGraduates = alumniRecords.filter((r) => r.becameContact).length;
  const interventionPortfolio = projectCareerInterventionPortfolio(gameState);

  return (
    <GameLayout>
      <div className="mx-auto min-h-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[var(--primary)]">The names that stayed with you</p>
          <h1 className="font-editorial text-3xl text-[var(--foreground)] sm:text-4xl">Alumni</h1>
          <p className="text-sm text-zinc-400">
            The careers that began with a chance you helped create.
          </p>
        </div>

        {alumniRecords.length > 0 && (
          <details className="mb-6 border-y border-[var(--border)]">
            <summary className="min-h-11 cursor-pointer py-4 text-sm text-[var(--muted-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
              <strong className="text-[var(--foreground)]">{alumniRecords.length} placed career{alumniRecords.length === 1 ? "" : "s"}</strong>
              {" · "}{legacyScore.totalScore} legacy points · View the record in numbers
            </summary>
            <dl className="grid gap-x-8 gap-y-4 border-t border-[var(--border)] py-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-[var(--muted-foreground)]">Youth found</dt><dd className="mt-1 font-semibold text-[var(--foreground)]">{legacyScore.youthFound}</dd></div>
              <div><dt className="text-[var(--muted-foreground)]">First-team breakthroughs</dt><dd className="mt-1 font-semibold text-[var(--foreground)]">{legacyScore.firstTeamBreakthroughs}</dd></div>
              <div><dt className="text-[var(--muted-foreground)]">International caps from finds</dt><dd className="mt-1 font-semibold text-[var(--foreground)]">{legacyScore.internationalCapsFromFinds}</dd></div>
              <div><dt className="text-[var(--muted-foreground)]">Placement success rate</dt><dd className="mt-1 font-semibold text-[var(--foreground)]">{successRate}%</dd></div>
            </dl>
            {contactGraduates > 0 && <p className="pb-4 text-sm text-[var(--muted-foreground)]">{contactGraduates} alumni {contactGraduates === 1 ? "has" : "have"} joined your contact network.</p>}
          </details>
        )}

        {interventionPortfolio.interventions.length > 0 && (
          <Card className="mb-8 rounded-md border-[var(--border)] bg-[var(--card)]" data-testid="career-intervention-portfolio">
            <CardHeader className="pb-3">
              <CardTitle as="h2" className="flex items-center gap-2 text-sm">
                <Shield size={16} className="text-[var(--signal-focus)]" aria-hidden="true" />
                Pathway intervention record
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-zinc-300">{interventionPortfolio.summary}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                These comparisons remember what you chose and what the public career evidence did next. They do not claim your intervention caused the outcome.
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {interventionPortfolio.interventions.slice(0, 3).map((intervention) => (
                  <div key={intervention.decisionId} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{intervention.playerName}</p>
                      <Badge
                        variant="outline"
                        className={intervention.outcome === "improved"
                          ? "border-emerald-500/30 text-emerald-300"
                          : intervention.outcome === "worsened"
                            ? "border-red-500/30 text-red-300"
                            : intervention.outcome === "monitoring"
                              ? "border-sky-500/30 text-sky-300"
                              : "border-amber-500/30 text-amber-300"}
                      >
                        {intervention.outcome}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-300">
                      You chose “{intervention.optionLabel}.”
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                      Environment {intervention.originalEnvironmentScore}/100 → {intervention.currentEnvironmentScore}/100. {intervention.currentEnvironmentSummary}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Alumni List */}
        <div data-tutorial-id="alumni-list">
          {alumniRecords.length > 0 && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-editorial text-2xl text-[var(--foreground)]">The careers you helped start</h2>
            <div className="flex items-center gap-2">
              {contactGraduates > 0 && (
                <Badge variant="outline" className="border-amber-700/50 text-amber-400">
                  {contactGraduates} contacts
                </Badge>
              )}
              {alumniRecords.length > 0 && (
                <Badge variant="secondary">
                  {alumniRecords.length} placed
                </Badge>
              )}
            </div>
          </div>

          )}

          {alumniRecords.length === 0 ? (
            <section className="dossier-section max-w-3xl px-5 py-8 sm:px-8 sm:py-10" aria-labelledby="alumni-first-chance">
              <UserCheck size={24} className="mb-5 text-[var(--accent)]" aria-hidden="true" />
              <h2 id="alumni-first-chance" className="font-editorial text-2xl text-white">A first chance. A career to follow.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300">
                No players placed yet. Help an unsigned prospect find a club, then follow their breakthroughs, setbacks and place in the game here.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={() => setScreen("youthScouting")}>Review prospects</Button>
                <Button variant="outline" onClick={() => setScreen("career")}>Back to Career</Button>
              </div>
            </section>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {alumniRecords.map((record) => (
                <AlumniCard
                  key={record.id}
                  record={record}
                  playerName={getPlayerName(record.playerId)}
                  placedClubName={getClubName(record.placedClubId)}
                  currentClubName={getClubName(record.currentClubId)}
                  caseId={getAlumniCaseId(record)}
                  getCaseTimeline={getCaseTimeline}
                  portraitAge={selectPlayerAgeTimeline(gameState, record.playerId)?.frames.at(-1)?.age}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </GameLayout>
  );
}
