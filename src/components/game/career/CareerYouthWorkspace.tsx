"use client";

import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  Building2,
  ChevronRight,
  Shield,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { GameLayout } from "@/components/game/GameLayout";
import { ConsequenceCinema } from "@/components/game/consequence-cinema/ConsequenceCinema";
import { LeadershipPortfolioPanel } from "@/components/game/career/LeadershipPortfolioPanel";
import { CareerRecoveryPanel } from "@/components/game/career/CareerRecoveryPanel";
import {
  PoliticalMeetingCards,
  type PoliticalMeetingCardsProps,
} from "@/components/game/career/PoliticalMeetingCards";
import { CareerCommandBridge } from "@/components/game/career/CareerCommandBridge";
import { ScreenBackground } from "@/components/ui/screen-background";
import { WorkspaceDisclosure } from "@/components/game/workspace/WorkspaceDisclosure";
import type {
  DiscoveryRecord,
  FinancialRecord,
  GameState,
  JobOffer,
  PerformanceReview,
  Scout,
  ScoutAttribute,
  ScoutSkill,
} from "@/engine/core/types";
import {
  AGENCY_POLICY_DEFINITIONS,
  type AgencyStrategicPressure,
} from "@/engine/finance/agencyStrategy";
import { LIFESTYLE_TIERS } from "@/engine/finance/lifestyle";
import { TOTAL_ACHIEVEMENT_COUNT } from "@/stores/achievementStore";
import {
  CAREER_FINANCE_DRILLDOWN,
  CAREER_RECORD_DRILLDOWNS,
} from "./careerDrilldowns";
import {
  CareerMetricTile,
  JobOfferCard,
  outcomeColor,
  outcomeIcon,
  timelineToneClasses,
} from "./CareerScreenShared";
import {
  ATTRIBUTE_LABELS,
  CAREER_TAB_ITEMS,
  CareerTimelineEntry,
  SPEC_LABELS,
  SKILL_LABELS,
  formatBalance,
  formatExpenseLabel,
  formatSalary,
  formatWeekSeason,
} from "./careerScreenModel";

interface CareerYouthWorkspaceProps {
  acceptedPlacements: number;
  activeObligations: Array<
    GameState["consequenceState"]["obligations"][string]
  >;
  agencyPolicyChangeAvailable: boolean;
  agencyPressure: AgencyStrategicPressure | null;
  agencyStrategy: {
    lockedUntil: { season: number; week: number };
    policy: keyof typeof AGENCY_POLICY_DEFINITIONS;
  } | undefined;
  attrEntries: [ScoutAttribute, number][];
  averageSkill: number;
  careerBaseLabel: string;
  careerCommandBridgeProps: ComponentProps<typeof CareerCommandBridge>;
  careerInventoryOpen: boolean;
  careerMetricsOpen: boolean;
  careerPoliticsOpen: boolean;
  careerTimeline: CareerTimelineEntry[];
  consequenceCinemaProps: ComponentProps<typeof ConsequenceCinema>;
  courseSummary: string;
  currentBuildAchievementCount: number;
  finances: FinancialRecord | null;
  gameState: GameState;
  getClubName: (clubId: string) => string;
  jobOffers: JobOffer[];
  latestPerformanceReview?: PerformanceReview;
  leadershipPortfolioProps: ComponentProps<typeof LeadershipPortfolioPanel> | null;
  monthlyExpenses: number;
  monthlyIncome: number;
  onAcceptJob: (offerId: string) => void;
  onDeclineJob: (offerId: string) => void;
  onCareerInventoryToggle: (open: boolean) => void;
  onCareerMetricsToggle: (open: boolean) => void;
  onCareerPoliticsToggle: (open: boolean) => void;
  onChangeLifestyle: (level: number) => void;
  onChooseCareerRecovery: ComponentProps<typeof CareerRecoveryPanel>["onChoose"];
  onChooseClubPath: () => void;
  onChooseIndependentPath: () => void;
  onOpenPlayerProfile: (playerId: string) => void;
  onSetScreen: (screen: string) => void;
  pendingPlacements: number;
  performanceReviews: PerformanceReview[];
  politicalMeetingProps: PoliticalMeetingCardsProps;
  recentDecisions: Array<GameState["consequenceState"]["decisions"][string]>;
  rivalOrganizationCount: number;
  scout: Scout;
  showPathChoice: boolean;
  skillEntries: [ScoutSkill, number][];
  youthDiscoveryRecords: DiscoveryRecord[];
  youthPlacementReportCount: number;
}

export function CareerYouthWorkspace({
  acceptedPlacements,
  activeObligations,
  agencyPolicyChangeAvailable,
  agencyPressure,
  agencyStrategy,
  attrEntries,
  averageSkill,
  careerBaseLabel,
  careerCommandBridgeProps,
  careerInventoryOpen,
  careerMetricsOpen,
  careerPoliticsOpen,
  careerTimeline,
  consequenceCinemaProps,
  courseSummary,
  currentBuildAchievementCount,
  finances,
  gameState,
  getClubName,
  jobOffers,
  latestPerformanceReview,
  leadershipPortfolioProps,
  monthlyExpenses,
  monthlyIncome,
  onAcceptJob,
  onDeclineJob,
  onCareerInventoryToggle,
  onCareerMetricsToggle,
  onCareerPoliticsToggle,
  onChangeLifestyle,
  onChooseCareerRecovery,
  onChooseClubPath,
  onChooseIndependentPath,
  onOpenPlayerProfile,
  onSetScreen,
  pendingPlacements,
  performanceReviews,
  politicalMeetingProps,
  recentDecisions,
  rivalOrganizationCount,
  scout,
  showPathChoice,
  skillEntries,
  youthDiscoveryRecords,
  youthPlacementReportCount,
}: CareerYouthWorkspaceProps) {
  return (
    <GameLayout>
      <div className="relative min-h-screen p-4 sm:p-6 lg:p-8 [&_.text-zinc-500]:text-zinc-400 [&_.text-zinc-600]:text-zinc-400">
        <ScreenBackground src="/images/backgrounds/career-journey.png" opacity={0.88} />
        <div className="relative z-10 mx-auto max-w-[1480px]">
          <CareerCommandBridge {...careerCommandBridgeProps} />

          <Tabs defaultValue="overview">
            <TabsList className="mb-5 grid h-auto min-h-12 w-full grid-cols-2 gap-1 overflow-hidden rounded-xl border border-white/10 bg-[#11161c]/95 p-1 sm:grid-cols-4">
              {CAREER_TAB_ITEMS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="min-h-11 rounded-lg px-3 py-2.5">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-0 space-y-5" data-tutorial-id="career-overview">
              <h2 className="sr-only">Career overview</h2>
              <CareerRecoveryPanel state={gameState} onChoose={onChooseCareerRecovery} />
              <details
                className="group rounded-xl border border-white/10 bg-black/20"
                open={careerMetricsOpen}
                onToggle={(event) => onCareerMetricsToggle(event.currentTarget.open)}
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
                  Career record at a glance
                  <span className="text-xs font-normal text-zinc-400 group-open:hidden">Show four measures</span>
                  <span className="hidden text-xs font-normal text-zinc-400 group-open:inline">Hide measures</span>
                </summary>
                <div className="grid grid-cols-2 gap-3 border-t border-white/10 p-3 lg:grid-cols-4">
                  <CareerMetricTile label="Reputation" value={`${Math.round(scout.reputation)}/100`} helper="Trust earned through decisions" tone="emerald" />
                  <CareerMetricTile label="Placements" value={`${acceptedPlacements}`} helper={`${pendingPlacements} awaiting response`} tone="blue" />
                  <CareerMetricTile label="Discoveries" value={`${youthDiscoveryRecords.length}`} helper={`${scout.discoveryCredits.length} credited outcomes`} tone="amber" />
                  <CareerMetricTile label="Skill Average" value={`${averageSkill.toFixed(1)}/20`} helper={`${scout.reportsSubmitted} reports submitted`} />
                </div>
              </details>

              {scout.careerPath === "independent" && scout.careerTier >= 3 && finances && agencyPressure && (
                <WorkspaceDisclosure
                  title="Agency operating policy"
                  eyebrow="Four-week commitment"
                  description="Career summarizes the current policy and pressure. Change the live operating commitment from Agency, where the full practice view is visible."
                  icon={<Building2 size={17} className="text-emerald-300" aria-hidden="true" />}
                  summary={
                    <div className="space-y-0.5">
                      <p>{agencyStrategy ? AGENCY_POLICY_DEFINITIONS[agencyStrategy.policy].label : "No policy selected"}</p>
                      <p>{agencyPolicyChangeAvailable ? "Agency can change it now" : `Locked to S${agencyStrategy?.lockedUntil.season} W${agencyStrategy?.lockedUntil.week}`}</p>
                    </div>
                  }
                  contentClassName="space-y-4"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Current pressure</p>
                      <p className="mt-2 text-sm font-semibold text-white">{agencyPressure.dominantRisk}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">
                        {agencyPressure.runwayWeeks != null
                          ? `${agencyPressure.runwayWeeks} runway weeks · ${Math.round(agencyPressure.capacityUtilization * 100)}% capacity utilization`
                          : `${Math.round(agencyPressure.capacityUtilization * 100)}% capacity utilization · ${Math.round(agencyPressure.clientConcentration * 100)}% concentration`}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Recommended next</p>
                      <p className="mt-2 text-sm font-semibold text-white">{AGENCY_POLICY_DEFINITIONS[agencyPressure.suggestedPolicy].label}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-300">{agencyPressure.policyEffect.recommendedWhen}</p>
                    </div>
                  </div>
                  <Button className="min-h-11 w-full sm:w-auto" onClick={() => onSetScreen("agency" as never)}>
                    Open Agency workspace
                    <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                  </Button>
                </WorkspaceDisclosure>
              )}

              {showPathChoice && finances && (
                <Card className="border-amber-400/25 bg-amber-400/[0.06]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-amber-200">Choose your career path</CardTitle>
                    <p className="text-sm leading-6 text-zinc-300">This determines how you earn, who you answer to, and which long-term opportunities become available.</p>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={onChooseClubPath}
                      className="min-h-24 rounded-xl border border-sky-400/25 bg-sky-400/[0.06] p-4 text-left transition hover:bg-sky-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                    >
                      <span className="font-semibold text-sky-200">Club Scout</span>
                      <span className="mt-1 block text-sm leading-5 text-zinc-400">Stable salary, internal influence, and an employer&apos;s priorities.</span>
                    </button>
                    <button
                      type="button"
                      onClick={onChooseIndependentPath}
                      className="min-h-24 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 text-left transition hover:bg-emerald-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                    >
                      <span className="font-semibold text-emerald-200">Independent Scout</span>
                      <span className="mt-1 block text-sm leading-5 text-zinc-400">Sell expertise, build retainers, and own the financial risk.</span>
                    </button>
                  </CardContent>
                </Card>
              )}

              {leadershipPortfolioProps && <LeadershipPortfolioPanel {...leadershipPortfolioProps} />}

              <WorkspaceDisclosure
                title="Career inventory"
                eyebrow="Reference"
                description="Offers and formal reviews stay available below the command bridge without competing with the live seat."
                summary={<span>{jobOffers.length} offer{jobOffers.length === 1 ? "" : "s"} · {performanceReviews.length} review{performanceReviews.length === 1 ? "" : "s"}</span>}
                tone="subtle"
                open={careerInventoryOpen}
                onToggle={(event) => onCareerInventoryToggle(event.currentTarget.open)}
                contentClassName="space-y-5"
              >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                  <Card className="border-white/10 bg-[#11161c]/95">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Briefcase size={17} className="text-emerald-300" aria-hidden="true" />
                        Career opportunities
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {jobOffers.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/15 p-6 text-center">
                          <p className="font-semibold text-white">No offers on the table</p>
                          <p className="mt-1 text-sm text-zinc-400">Reputation, successful placements, and strong reviews create better roles over time.</p>
                        </div>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                          {jobOffers.map((offer) => (
                            <JobOfferCard
                              key={offer.id}
                              offer={offer}
                              clubName={getClubName(offer.clubId)}
                              onAccept={() => onAcceptJob(offer.id)}
                              onDecline={() => onDeclineJob(offer.id)}
                            />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 bg-[#11161c]/95">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Recent reviews</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {performanceReviews.length === 0 ? (
                        <p className="text-sm leading-6 text-zinc-400">Your first formal review arrives after enough work has accumulated to judge.</p>
                      ) : (
                        [...performanceReviews].reverse().slice(0, 4).map((review) => (
                          <div key={review.season} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`flex items-center gap-2 text-sm font-semibold ${outcomeColor(review.outcome)}`}>
                                {outcomeIcon(review.outcome)} {review.outcome}
                              </span>
                              <span className="text-xs text-zinc-500">Season {review.season}</span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-zinc-400">
                              {review.reportsSubmitted} reports · {Math.round(review.averageQuality)} average craft · {review.successfulRecommendations} successful recommendations
                            </p>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </WorkspaceDisclosure>

              <button
                type="button"
                data-testid="career-world-details"
                onClick={() => onSetScreen("internationalView" as never)}
                className="flex min-h-20 w-full items-center gap-4 rounded-xl border border-fuchsia-400/20 bg-[radial-gradient(circle_at_right,rgba(217,70,239,0.08),transparent_42%),rgba(17,22,28,0.95)] px-4 py-3 text-left transition hover:border-fuchsia-300/40 hover:bg-fuchsia-400/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-300"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-200">
                  <Shield size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300">
                    World context
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-white">
                    Open regional and football outlook
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-400">
                    World conditions, territorial position, and club recruitment identities live with the map. {rivalOrganizationCount} rival organization{rivalOrganizationCount === 1 ? "" : "s"} active.
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-fuchsia-100">
                  Open World
                  <ArrowRight size={15} aria-hidden="true" />
                </span>
              </button>

              {(scout.managerRelationship || scout.careerTier >= 5) && (
                <WorkspaceDisclosure
                  title="Club politics"
                  eyebrow="Conversations"
                  description="Open when you need to spend trust, challenge a directive, or manage board and manager memory."
                  summary={<span>{politicalMeetingProps.managerEligibility?.eligible ? "Manager ready" : "Manager closed"} · {politicalMeetingProps.boardEligibility?.eligible ? "Board ready" : "Board closed"}</span>}
                  tone="subtle"
                  open={careerPoliticsOpen}
                  onToggle={(event) => onCareerPoliticsToggle(event.currentTarget.open)}
                  contentClassName="space-y-3"
                >
                  <div>
                    <h2 id="club-politics-title" className="text-base font-semibold text-white">
                      Club politics
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      Choose how you use evidence, trust, and accountability. These conversations create
                      directives, memories, fatigue, and future access.
                    </p>
                  </div>
                  <div className="grid gap-5 lg:grid-cols-2" aria-labelledby="club-politics-title">
                    <PoliticalMeetingCards {...politicalMeetingProps} />
                  </div>
                </WorkspaceDisclosure>
              )}
            </TabsContent>

            <TabsContent value="development" className="mt-0 space-y-5" data-tutorial-id="career-skills">
              <h2 className="sr-only">Scout development</h2>
              <div className="grid gap-5 xl:grid-cols-2">
                <Card className="border-white/10 bg-[#11161c]/95">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Scouting skills</CardTitle>
                    <p className="text-sm text-zinc-400">Skills improve through relevant weekly work. The thin bar is XP toward the next level.</p>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    {skillEntries.map(([skill, value]) => {
                      const xp = scout.skillXp?.[skill] ?? 0;
                      const threshold = Math.max(1, value * 10);
                      return (
                        <div key={skill} className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="font-medium text-zinc-200">{SKILL_LABELS[skill]}</span>
                            <span className="font-mono font-bold text-white">{value}/20</span>
                          </div>
                          <Progress value={value} max={20} indicatorClassName={value >= 15 ? "bg-emerald-400" : value >= 10 ? "bg-amber-400" : "bg-sky-400"} className="mt-3" />
                          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
                            <span>{xp}/{threshold} XP</span>
                            <span>{value >= 20 ? "Mastered" : `${Math.max(0, threshold - xp)} to level`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-[#11161c]/95">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Professional attributes</CardTitle>
                    <p className="text-sm text-zinc-400">These shape relationships, stamina, memory, intuition, and how convincingly you act on a read.</p>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    {attrEntries.map(([attribute, value]) => (
                      <div key={attribute} className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium text-zinc-200">{ATTRIBUTE_LABELS[attribute]}</span>
                          <span className="font-mono font-bold text-white">{value}/20</span>
                        </div>
                        <Progress value={value} max={20} indicatorClassName="bg-violet-400" className="mt-3" />
                        <p className="mt-2 text-[11px] text-zinc-400">{scout.attributeXp?.[attribute] ?? 0} XP banked</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-5 lg:grid-cols-3">
                <Card className="border-white/10 bg-[#11161c]/95 lg:col-span-2" data-tutorial-id="career-perk-tree">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Star size={17} className="text-amber-300" aria-hidden="true" />
                      Youth specialization
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex items-center justify-between text-sm">
                      <span className="text-zinc-300">Mastery level</span>
                      <span className="font-semibold text-amber-200">{scout.specializationLevel}/20</span>
                    </div>
                    <Progress value={scout.specializationLevel} max={20} indicatorClassName="bg-amber-400" />
                    <div className="mt-4 flex flex-wrap gap-2">
                      {scout.unlockedPerks.length === 0 ? (
                        <p className="text-sm text-zinc-400">Perks unlock as your specialization grows.</p>
                      ) : scout.unlockedPerks.map((perk) => (
                        <Badge key={perk} variant="outline" className="border-amber-400/20 bg-amber-400/10 text-amber-200">{perk}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <div className="space-y-3">
                  <button onClick={() => onSetScreen("training" as never)} className="flex min-h-20 w-full items-center justify-between rounded-xl border border-white/10 bg-[#11161c]/95 p-4 text-left transition hover:border-amber-400/25 hover:bg-amber-400/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                    <span><span className="block font-semibold text-white">Courses & qualifications</span><span className="mt-1 block text-xs text-zinc-400">{courseSummary}</span></span>
                    <ChevronRight size={18} className="text-zinc-400" aria-hidden="true" />
                  </button>
                  <button onClick={() => onSetScreen("equipment" as never)} className="flex min-h-20 w-full items-center justify-between rounded-xl border border-white/10 bg-[#11161c]/95 p-4 text-left transition hover:border-emerald-400/25 hover:bg-emerald-400/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                    <span><span className="block font-semibold text-white">Equipment loadout</span><span className="mt-1 block text-xs text-zinc-400">Tools that change real activity outcomes</span></span>
                    <ChevronRight size={18} className="text-zinc-400" aria-hidden="true" />
                  </button>
                  <button onClick={() => onSetScreen("agency" as never)} className="flex min-h-20 w-full items-center justify-between rounded-xl border border-white/10 bg-[#11161c]/95 p-4 text-left transition hover:border-sky-400/25 hover:bg-sky-400/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                    <span className="flex min-w-0 items-center gap-3">
                      <Building2 size={18} className="shrink-0 text-sky-300" aria-hidden="true" />
                      <span>
                        <span className="block font-semibold text-white">Agency &amp; regional presence</span>
                        <span className="mt-1 block text-xs text-zinc-400">
                          {finances?.satelliteOffices.length
                            ? `${finances.satelliteOffices.length} regional office${finances.satelliteOffices.length === 1 ? "" : "s"} active`
                            : "Infrastructure, assistants, clients, and offices"}
                        </span>
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-zinc-400" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="trackRecord" className="mt-0 space-y-5">
              <h2 className="sr-only">Career track record</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <CareerMetricTile label="Reports Filed" value={`${youthPlacementReportCount}`} helper="Placement recommendations" />
                <CareerMetricTile label="Accepted" value={`${acceptedPlacements}`} helper="Trials and academy offers" tone="emerald" />
                <CareerMetricTile label="Tracked Players" value={`${new Set(youthDiscoveryRecords.map((record) => record.playerId)).size}`} helper="Across full careers" tone="blue" />
                <CareerMetricTile label="Legacy" value={`${gameState.legacyScore.totalScore}`} helper="How your calls held up over time" tone="amber" />
              </div>
              <section
                aria-labelledby="career-records-relationships-title"
                className="rounded-2xl border border-white/10 bg-[#11161c]/95 p-4 sm:p-5"
                data-testid="career-record-drilldowns"
              >
                <div className="mb-4">
                  <h3 id="career-records-relationships-title" className="font-semibold text-white">
                    Records &amp; relationships
                  </h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    Reopen the people and evidence behind your reputation at any time.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {CAREER_RECORD_DRILLDOWNS.map((item) => {
                    const status = item.screen === "network"
                      ? `${Object.keys(gameState.contacts).length} known contacts`
                      : item.screen === "alumniDashboard"
                        ? `${gameState.alumniRecords.length} placed prospects`
                        : item.screen === "performance"
                          ? latestPerformanceReview
                            ? `Latest review: ${latestPerformanceReview.outcome}`
                            : `${scout.reportsSubmitted} reports on record`
                          : `${currentBuildAchievementCount}/${TOTAL_ACHIEVEMENT_COUNT} unlocked`;
                    const Icon = item.screen === "network"
                      ? Users
                      : item.screen === "alumniDashboard"
                        ? Trophy
                        : item.screen === "performance"
                          ? BarChart3
                          : Star;

                    return (
                      <button
                        key={item.screen}
                        type="button"
                        onClick={() => onSetScreen(item.screen as never)}
                        className="flex min-h-28 w-full items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-emerald-400/30 hover:bg-emerald-400/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-semibold text-white">
                            <Icon size={17} className="shrink-0 text-emerald-300" aria-hidden="true" />
                            {item.label}
                          </span>
                          <span className="mt-2 block text-xs leading-5 text-zinc-400">
                            {item.description}
                          </span>
                          <span className="mt-2 block text-[11px] font-medium text-emerald-200">
                            {status}
                          </span>
                        </span>
                        <ChevronRight size={17} className="mt-0.5 shrink-0 text-zinc-400" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </section>
              <ConsequenceCinema {...consequenceCinemaProps} />
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
                <Card className="border-white/10 bg-[#11161c]/95">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Shield size={17} className="text-fuchsia-300" aria-hidden="true" />
                      Decision legacy
                    </CardTitle>
                    <p className="text-sm text-zinc-400">The calls you made, the alternatives you closed, and whether their consequences have finished unfolding.</p>
                  </CardHeader>
                  <CardContent>
                    {recentDecisions.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-400">Your consequential choices will be recorded here.</p>
                    ) : (
                      <ol className="space-y-2">
                        {recentDecisions.map((decision) => {
                          const selected = decision.options.find((option) => option.id === decision.selectedOptionId);
                          const date = decision.selectedAt ?? decision.offeredAt;
                          return (
                            <li key={decision.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-white">{String(decision.metadata?.title ?? selected?.label ?? "Career decision")}</p>
                                <Badge variant="outline" className={decision.status === "resolved" ? "border-emerald-400/25 text-emerald-200" : "border-amber-400/25 text-amber-200"}>
                                  {decision.status}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-zinc-300">{selected?.label ?? decision.selectedOptionId}</p>
                              <p className="mt-2 text-[11px] text-zinc-500">
                                {formatWeekSeason(date.season, date.week)} &middot; {decision.selectionKind === "default" ? "Deadline decision" : "Chosen by you"} &middot; {Math.max(0, decision.options.length - 1)} alternatives closed
                              </p>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-[#11161c]/95">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Promises &amp; obligations</CardTitle>
                    <p className="text-sm text-zinc-400">Access creates debts. Future opportunities may force you to choose between keeping a promise and advancing your career.</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {activeObligations.length === 0 ? (
                      <p className="text-sm leading-6 text-zinc-400">No active promises. Relationship choices can create duties that persist beyond the original event.</p>
                    ) : activeObligations.map((obligation) => (
                      <div key={obligation.id} className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3">
                        <p className="text-sm font-semibold capitalize text-amber-100">{obligation.kind.replace(/([A-Z])/g, " $1")}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-300">{obligation.terms}</p>
                        <p className="mt-2 text-[11px] text-zinc-500">
                          {obligation.dueAt ? `Due ${formatWeekSeason(obligation.dueAt.season, obligation.dueAt.week)}` : "Ongoing"}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
              <Card className="border-white/10 bg-[#11161c]/95">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Trophy size={17} className="text-amber-300" aria-hidden="true" />
                    Career timeline
                  </CardTitle>
                  <p className="text-sm text-zinc-400">Your discoveries remain connected to signings, loans, transfers, releases, and retirement.</p>
                </CardHeader>
                <CardContent>
                  {careerTimeline.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
                      <p className="font-semibold text-white">Your record starts with the first name you back</p>
                      <p className="mt-1 text-sm text-zinc-400">Discover a prospect, build evidence, recommend a destination, then watch the career unfold.</p>
                    </div>
                  ) : (
                    <ol className="space-y-3">
                      {careerTimeline.map((entry) => (
                        <li key={entry.id} className={`rounded-xl border p-4 ${timelineToneClasses(entry.tone)}`}>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="border-white/15 text-[10px] text-zinc-300">{entry.label}</Badge>
                                <h3 className="font-semibold text-white">{entry.title}</h3>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-zinc-300">{entry.description}</p>
                            </div>
                            <span className="text-[11px] text-zinc-500">{formatWeekSeason(entry.season, entry.week)}</span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="finances" className="mt-0 space-y-5">
              <h2 className="sr-only">Career finances</h2>
              {!finances ? (
                <Card className="border-white/10 bg-[#11161c]/95">
                  <CardContent className="p-6 text-sm text-zinc-400">
                    Financial tracking will unlock when your career enters a paid role or practice phase.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <CareerMetricTile label="Balance" value={formatBalance(finances.balance)} helper="Available cash" tone={finances.balance >= 0 ? "emerald" : "red"} />
                    <CareerMetricTile label="Monthly Income" value={formatBalance(monthlyIncome)} helper={scout.careerPath === "independent" ? "Committed retainers" : "Contract salary"} tone="emerald" />
                    <CareerMetricTile label="Monthly Costs" value={formatBalance(monthlyExpenses)} helper="Lifestyle, travel, and tools" tone="red" />
                    <CareerMetricTile
                      label="Weekly Pay"
                      value={scout.salary > 0 ? formatSalary(scout.salary) : scout.careerPath === "independent" ? "Retainers vary" : "No salary"}
                      helper={scout.employmentContract?.role ?? careerBaseLabel}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onSetScreen(CAREER_FINANCE_DRILLDOWN.screen as never)}
                    className="flex min-h-20 w-full items-center justify-between gap-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4 text-left transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                    data-testid="career-finance-drilldown"
                  >
                    <span>
                      <span className="block font-semibold text-emerald-100">
                        {CAREER_FINANCE_DRILLDOWN.label}
                      </span>
                      <span className="mt-1 block text-sm text-zinc-400">
                        {CAREER_FINANCE_DRILLDOWN.description}
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-emerald-300" aria-hidden="true" />
                  </button>
                  <div className="grid gap-5 lg:grid-cols-2">
                    <Card className="border-white/10 bg-[#11161c]/95">
                      <CardHeader className="pb-3"><CardTitle className="text-base">Monthly commitments</CardTitle></CardHeader>
                      <CardContent className="space-y-2">
                        {Object.entries(finances.expenses).map(([label, amount]) => (
                          <div key={label} className="flex min-h-11 items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 text-sm">
                            <span className="text-zinc-300">{formatExpenseLabel(label)}</span>
                            <span className="font-semibold text-red-300">{formatBalance(amount)}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                    <Card className="border-white/10 bg-[#11161c]/95">
                      <CardHeader className="pb-3"><CardTitle className="text-base">Lifestyle</CardTitle><p className="text-sm text-zinc-400">Comfort changes monthly costs and recovery. Choose deliberately.</p></CardHeader>
                      <CardContent className="space-y-2">
                        {Object.entries(LIFESTYLE_TIERS).map(([levelString, tier]) => {
                          const level = Number(levelString);
                          const active = finances.lifestyle.level === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => onChangeLifestyle(level)}
                              aria-pressed={active}
                              className={`flex min-h-14 w-full items-center justify-between rounded-xl border px-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${active ? "border-emerald-400/35 bg-emerald-400/10" : "border-white/10 bg-black/20 hover:border-white/20"}`}
                            >
                              <span><span className="block text-sm font-semibold text-white">{tier.name}</span><span className="mt-0.5 block text-xs text-zinc-400">Monthly comfort level</span></span>
                              <span className={active ? "font-semibold text-emerald-200" : "text-zinc-300"}>{formatBalance(tier.config.monthlyCost)}/mo</span>
                            </button>
                          );
                        })}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </GameLayout>
  );
}
