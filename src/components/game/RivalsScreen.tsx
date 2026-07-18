"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Swords,
  Star,
  User,
  Target,
  Eye,
  Clock,
  AlertTriangle,
  Building2,
  Flame,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  getOpenRivalOrganizationOpportunities,
  getRivalOrganizationDefinition,
  getRivalOrganizationThreat,
  getRivalThreatLevel,
} from "@/engine/rivals";
import type { RivalScout, RivalActivity, Scout } from "@/engine/core/types";
import type {
  RivalOrganization,
  RivalOrganizationOpportunity,
} from "@/engine/rivals";
import type { ConsequenceEngineState } from "@/engine/consequences/types";
import { ScreenBackground } from "@/components/ui/screen-background";
import { RivalOperationsNetwork } from "./rivals/RivalOperationsNetwork";
import { buildStakeholderEcologyProfile } from "@/engine/consequences";
import { StakeholderEcologyPanel } from "./StakeholderEcologyPanel";

const THREAT_STYLES = {
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  high: "bg-red-500/10 text-red-400 border-red-500/30",
};

const THREAT_LABELS = {
  low: "Low pressure",
  medium: "Active pressure",
  high: "Immediate pressure",
};

const PERSONALITY_LABELS: Record<string, string> = {
  aggressive: "Aggressive",
  methodical: "Methodical",
  connected: "Well-Connected",
  lucky: "Lucky",
};

const BUDGET_LABELS: Record<string, string> = {
  low: "Low Budget",
  medium: "Mid Budget",
  high: "Big Spender",
};

const ACTIVITY_LABELS: Record<string, string> = {
  spotted: "Spotted at match",
  targetAcquired: "Targeting player",
  reportSubmitted: "Report submitted",
  playerSigned: "Player signed",
};

const ACTIVITY_ICONS: Record<string, typeof Eye> = {
  spotted: Eye,
  targetAcquired: Target,
  reportSubmitted: Clock,
  playerSigned: AlertTriangle,
};

function QualityStars({ quality }: { quality: number }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`Quality: ${quality} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={12}
          className={i < quality ? "text-amber-400 fill-amber-400" : "text-zinc-700"}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/** Progress bar component for scouting progress (0-5 scale). */
function ScoutingProgressBar({ progress, max = 5 }: { progress: number; max?: number }) {
  const pct = Math.min(100, (progress / max) * 100);
  const color =
    pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-[10px] tabular-nums text-zinc-400">
        {progress}/{max}
      </span>
    </div>
  );
}

interface RivalCardProps {
  rival: RivalScout;
  getClubName: (clubId: string) => string;
  getPlayerName: (playerId: string) => string;
  scout: Scout;
  consequenceState: ConsequenceEngineState;
  currentWeek: number;
  currentSeason: number;
  contactNamesById: Record<string, string>;
  rivalNamesById: Record<string, string>;
  sharedTargetIds: string[];
  onNavigateToPlayer: (playerId: string) => void;
  recentActivities: RivalActivity[];
}

function RivalCard({
  rival,
  getClubName,
  getPlayerName,
  scout,
  consequenceState,
  currentWeek,
  currentSeason,
  contactNamesById,
  rivalNamesById,
  sharedTargetIds,
  onNavigateToPlayer,
  recentActivities,
}: RivalCardProps) {
  const threat = getRivalThreatLevel(rival, scout);
  const currentTargetName = rival.currentTarget
    ? getPlayerName(rival.currentTarget)
    : null;
  const currentTargetProgress = rival.currentTarget
    ? (rival.scoutingProgress?.[rival.currentTarget] ?? 0)
    : 0;
  const ecology = buildStakeholderEcologyProfile({
    state: consequenceState,
    stakeholder: { kind: "rival", id: rival.id },
    now: { week: currentWeek, season: currentSeason },
    scoutId: scout.id,
    baseInfluence: rival.reputation,
    resolveEntityName: (entity) => {
      if (entity.kind === "player") return getPlayerName(entity.id);
      if (entity.kind === "club") return getClubName(entity.id);
      if (entity.kind === "rival") return rivalNamesById[entity.id];
      if (entity.kind === "contact") return contactNamesById[entity.id];
      return undefined;
    },
  });

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-sm font-medium text-white">{rival.name}</h3>
            <p className="text-xs text-zinc-400">
              {getClubName(rival.clubId)} &middot;{" "}
              <span className="capitalize">{rival.specialization}</span>
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${THREAT_STYLES[threat]}`}
          >
            {THREAT_LABELS[threat]}
          </span>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <QualityStars quality={rival.quality} />
          <span className="text-xs text-zinc-400">Rep: {rival.reputation}</span>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="text-[10px]">
            {PERSONALITY_LABELS[rival.personality] ?? rival.personality}
          </Badge>
          {rival.budgetTier && (
            <Badge variant="secondary" className="text-[10px]">
              {BUDGET_LABELS[rival.budgetTier] ?? rival.budgetTier}
            </Badge>
          )}
        </div>

        {/* Active target with progress bar */}
        {currentTargetName && (
          <div className="border-t border-zinc-800 pt-2 mt-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Target size={10} className="text-amber-400" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                Active Target
              </p>
            </div>
            <button
              onClick={() => rival.currentTarget && onNavigateToPlayer(rival.currentTarget)}
              className="text-xs text-zinc-300 hover:text-emerald-400 transition cursor-pointer mb-1"
            >
              {currentTargetName}
            </button>
            <ScoutingProgressBar progress={currentTargetProgress} />
            {rival.reportDeadline !== undefined && (
              <p className="mt-0.5 text-[10px] text-zinc-400">
                Report due: week {rival.reportDeadline}
              </p>
            )}
          </div>
        )}

        {/* Scouting progress on other targets */}
        {rival.scoutingProgress && Object.keys(rival.scoutingProgress).length > 0 && (
          <div className="border-t border-zinc-800 pt-2 mt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Scouting Progress
            </p>
            <div className="space-y-1">
              {Object.entries(rival.scoutingProgress)
                .filter(([pid]) => pid !== rival.currentTarget && state_hasProgress(rival.scoutingProgress[pid]))
                .slice(0, 4)
                .map(([pid, prog]) => (
                  <div key={pid} className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 truncate flex-1">
                      {getPlayerName(pid)}
                    </span>
                    <ScoutingProgressBar progress={prog} />
                  </div>
                ))}
            </div>
          </div>
        )}

        {sharedTargetIds.length > 0 && (
          <div className="border-t border-zinc-800 pt-2 mt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Shared Targets ({sharedTargetIds.length})
            </p>
            <div className="space-y-1">
              {sharedTargetIds.slice(0, 5).map((pid) => (
                <button
                  key={pid}
                  onClick={() => onNavigateToPlayer(pid)}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 transition cursor-pointer"
                >
                  <User size={10} aria-hidden="true" />
                  {getPlayerName(pid)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent activity feed */}
        {recentActivities.length > 0 && (
          <div className="border-t border-zinc-800 pt-2 mt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Recent Activity
            </p>
            <div className="space-y-1">
              {recentActivities.slice(0, 3).map((act, i) => {
                const Icon = ACTIVITY_ICONS[act.type] ?? Eye;
                return (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <Icon size={10} aria-hidden="true" />
                    <span>{ACTIVITY_LABELS[act.type] ?? act.type}</span>
                    {act.playerId && (
                      <span className="text-zinc-400 truncate">
                        - {getPlayerName(act.playerId)}
                      </span>
                    )}
                    <span className="ml-auto text-zinc-400">W{act.week}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3 border-t border-zinc-800 pt-3">
          <StakeholderEcologyPanel profile={ecology} title="Competitive history" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Helper: returns true if progress value exists and is > 0. */
function state_hasProgress(prog: number | undefined): boolean {
  return prog !== undefined && prog > 0;
}

const ORGANIZATION_ACTION_LABELS: Record<string, string> = {
  "academy-sweep": "Academy sweep",
  "showcase-capture": "Showcase capture",
  "data-mapping": "Data mapping",
  "model-sale": "Model sale",
  "access-lockdown": "Access lockdown",
  "whisper-campaign": "Whisper campaign",
  "market-blitz": "Market blitz",
  "resource-pool": "Resource pool",
  "regional-rush": "Regional rush",
  "poach-relay": "Poach relay",
  "prestige-push": "Prestige push",
  "global-trial-network": "Global trial network",
  regroup: "Regrouping",
};

function OrganizationMeter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "red" | "sky";
}) {
  const barClass = {
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    red: "bg-red-400",
    sky: "bg-sky-400",
  }[tone];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-zinc-400">
        <span>{label}</span>
        <span className="font-mono text-zinc-200">{Math.round(value)}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-label={`${label}: ${Math.round(value)} out of 100`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
      >
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function OrganizationCard({ organization }: { organization: RivalOrganization }) {
  const definition = getRivalOrganizationDefinition(organization.archetypeId);
  const threat = getRivalOrganizationThreat(organization);
  return (
    <article className="rounded-xl border border-fuchsia-400/15 bg-zinc-950/80 p-4 shadow-lg shadow-black/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300">
            {definition.name}
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-white">{organization.name}</h3>
        </div>
        <Badge variant="outline" className="shrink-0 border-fuchsia-400/25 text-fuchsia-200">
          Threat {threat}
        </Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-400">{definition.description}</p>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-zinc-200">{definition.agendaName}</p>
          <span className="text-[10px] font-medium text-fuchsia-300">
            Agenda level {organization.agendaLevel}/10
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-zinc-400">{definition.agendaDescription}</p>
        <div className="mt-3">
          <OrganizationMeter label="Agenda progress" value={organization.agendaProgress} tone="emerald" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <OrganizationMeter label="Resources" value={organization.resources} tone="sky" />
        <OrganizationMeter label="Influence" value={organization.influence} tone="amber" />
        <OrganizationMeter label="Heat" value={organization.heat} tone="red" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-800 pt-3 text-[10px] text-zinc-400">
        <span>{organization.memberRivalIds.length} affiliated scout{organization.memberRivalIds.length === 1 ? "" : "s"}</span>
        {organization.lastAction && (
          <span>
            Last move: {ORGANIZATION_ACTION_LABELS[organization.lastAction] ?? organization.lastAction}
            {organization.lastActionWeek ? ` (S${organization.lastActionSeason} W${organization.lastActionWeek})` : ""}
          </span>
        )}
      </div>
    </article>
  );
}

function OpportunityCard({
  opportunity,
  organization,
  onResolve,
}: {
  opportunity: RivalOrganizationOpportunity;
  organization?: RivalOrganization;
  onResolve: (response: "exploit" | "decline") => void;
}) {
  return (
    <article className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
            Competitive opening
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">{opportunity.title}</h3>
          {organization && <p className="mt-0.5 text-xs text-zinc-400">Against {organization.name}</p>}
        </div>
        <Badge variant="warning" className="shrink-0">
          Closes S{opportunity.expiresSeason} W{opportunity.expiresWeek}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-300">{opportunity.description}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400">Estimated success</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-emerald-300">
            {Math.round(opportunity.successChance * 100)}%
          </p>
        </div>
        <ul className="space-y-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-zinc-400">
          {opportunity.knownTradeoffs.map((tradeoff) => (
            <li key={tradeoff} className="flex gap-2">
              <span className="text-amber-300" aria-hidden="true">&bull;</span>
              <span>{tradeoff}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => onResolve("exploit")}
          className="min-h-11 flex-1 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          Exploit the opening
        </button>
        <button
          type="button"
          onClick={() => onResolve("decline")}
          className="min-h-11 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          Decline
        </button>
      </div>
    </article>
  );
}

export function RivalsScreen() {
  const {
    scout,
    rivalScoutsById,
    rivalOrganizationState,
    clubs,
    players,
    rivalActivities,
    observations,
    reports,
    unsignedYouth,
    contactsById,
    consequenceState,
    currentWeek,
    currentSeason,
    selectPlayer,
    setScreen,
    resolveRivalOrganizationOpportunity,
  } = useGameStore(
    useShallow((state) => ({
      scout: state.gameState?.scout,
      rivalScoutsById: state.gameState?.rivalScouts,
      rivalOrganizationState: state.gameState?.rivalOrganizationState,
      clubs: state.gameState?.clubs,
      players: state.gameState?.players,
      rivalActivities: state.gameState?.rivalActivities,
      observations: state.gameState?.observations,
      reports: state.gameState?.reports,
      unsignedYouth: state.gameState?.unsignedYouth,
      contactsById: state.gameState?.contacts,
      consequenceState: state.gameState?.consequenceState,
      currentWeek: state.gameState?.currentWeek,
      currentSeason: state.gameState?.currentSeason,
      selectPlayer: state.selectPlayer,
      setScreen: state.setScreen,
      resolveRivalOrganizationOpportunity: state.resolveRivalOrganizationOpportunity,
    })),
  );

  const rivalList = useMemo(
    () => Object.values(rivalScoutsById ?? {}),
    [rivalScoutsById],
  );
  const activities = useMemo(
    () => rivalActivities ?? [],
    [rivalActivities],
  );
  const organizations = useMemo(
    () =>
      Object.values(rivalOrganizationState?.organizations ?? {}).sort(
        (left, right) =>
          getRivalOrganizationThreat(right) - getRivalOrganizationThreat(left)
          || left.name.localeCompare(right.name),
      ),
    [rivalOrganizationState],
  );
  const openOpportunities = useMemo(
    () =>
      rivalOrganizationState
        ? getOpenRivalOrganizationOpportunities(rivalOrganizationState)
        : [],
    [rivalOrganizationState],
  );

  const scopedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const observation of Object.values(observations ?? {})) {
      ids.add(observation.playerId);
    }
    for (const report of Object.values(reports ?? {})) {
      ids.add(report.playerId);
    }
    return ids;
  }, [observations, reports]);

  const recentActivitiesByRival = useMemo(() => {
    const activityMap = new Map<string, RivalActivity[]>();
    for (const activity of activities) {
      const rivalEntries = activityMap.get(activity.rivalId);
      if (rivalEntries) {
        rivalEntries.push(activity);
      } else {
        activityMap.set(activity.rivalId, [activity]);
      }
    }

    for (const [rivalId, rivalEntries] of activityMap) {
      activityMap.set(rivalId, rivalEntries.slice(-5).reverse());
    }

    return activityMap;
  }, [activities]);

  const contactNamesById = useMemo(
    () =>
      Object.fromEntries(
        Object.values(contactsById ?? {}).map((contact) => [contact.id, contact.name]),
      ),
    [contactsById],
  );

  const rivalNamesById = useMemo(
    () =>
      Object.fromEntries(
        Object.values(rivalScoutsById ?? {}).map((rival) => [rival.id, rival.name]),
      ),
    [rivalScoutsById],
  );

  if (
    !scout
    || !clubs
    || !players
    || !unsignedYouth
    || !consequenceState
    || currentWeek == null
    || currentSeason == null
  ) {
    return null;
  }

  const getClubName = (clubId: string) => clubs[clubId]?.name ?? "Unknown Club";
  const getPlayerName = (playerId: string) => {
    const p = players[playerId];
    return p ? `${p.firstName} ${p.lastName}` : "Unknown Player";
  };
  const navigateToPlayer = (playerId: string) => {
    if (!players[playerId] && !unsignedYouth[playerId]?.player) return;
    selectPlayer(playerId);
    setScreen("playerProfile");
  };

  if (rivalList.length === 0 && organizations.length === 0) {
    return (
      <GameLayout>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-white mb-2">Rival Scouts</h1>
          <p className="text-sm text-zinc-400">
            No rival scouts active yet. Rivals appear as you advance in your career.
          </p>
        </div>
      </GameLayout>
    );
  }

  const nemesis = rivalList.find((r) => r.isNemesis);
  const nonNemesisRivals = rivalList.filter((r) => !r.isNemesis);

  // Count total signed players by rivals
  const signedByRivals = activities.filter((a) => a.type === "playerSigned").length;
  const activeTargets = rivalList.filter((r) => r.currentTarget).length;

  return (
    <GameLayout>
      <div className="relative space-y-6 p-4 sm:p-6">
        <ScreenBackground src="/images/backgrounds/rivals-binoculars.png" opacity={0.80} />
        <div className="relative z-10">
        <div>
          <h1 className="text-2xl font-bold text-white">Rival Scouts</h1>
          <p className="text-sm text-zinc-400">
            Persistent organizations and individual scouts competing for the same talent
          </p>
        </div>

        {/* Summary stats */}
        <div className="flex flex-wrap gap-3" data-tutorial-id="rivals-intel">
          <div className="flex items-center gap-2 rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2">
            <Building2 size={14} className="text-fuchsia-300" aria-hidden="true" />
            <span className="text-xs text-zinc-400">
              {organizations.length} active organization{organizations.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2">
            <Target size={14} className="text-amber-400" aria-hidden="true" />
            <span className="text-xs text-zinc-400">
              {activeTargets} actively scouting
            </span>
          </div>
          {openOpportunities.length > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-amber-400/25 bg-amber-400/5 px-3 py-2">
              <Zap size={14} className="text-amber-300" aria-hidden="true" />
              <span className="text-xs text-amber-200">
                {openOpportunities.length} opening{openOpportunities.length === 1 ? "" : "s"} available
              </span>
            </div>
          )}
          {signedByRivals > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2">
              <AlertTriangle size={14} className="text-red-400" />
              <span className="text-xs text-zinc-400">
                {signedByRivals} player{signedByRivals !== 1 ? "s" : ""} lost to rivals
              </span>
            </div>
          )}
        </div>

        {rivalOrganizationState && openOpportunities.length > 0 && (
          <section aria-labelledby="rival-openings-heading" className="space-y-3">
            <div>
              <h2 id="rival-openings-heading" className="flex items-center gap-2 text-lg font-semibold text-white">
                <Zap size={17} className="text-amber-300" aria-hidden="true" />
                Openings you can exploit
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                These windows exist because a competitor has overreached, moved too early, or left a relationship exposed.
                Acting can win ground, but it also makes your intentions visible.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {openOpportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  organization={rivalOrganizationState.organizations[opportunity.organizationId]}
                  onResolve={(response) =>
                    resolveRivalOrganizationOpportunity(opportunity.id, response)
                  }
                />
              ))}
            </div>
          </section>
        )}

        {rivalOrganizationState && organizations.length > 0 && (
          <section aria-labelledby="rival-organizations-heading" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="rival-organizations-heading" className="flex items-center gap-2 text-lg font-semibold text-white">
                  <Building2 size={17} className="text-fuchsia-300" aria-hidden="true" />
                  Recruitment organizations
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Each organization has a long-term agenda, a distinct network, and its own way of applying pressure.
                </p>
              </div>
              {rivalOrganizationState.currentPressure.sourceOrganizationId && (
                <div className="flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs text-zinc-300">
                  <Flame size={14} className="text-red-300" aria-hidden="true" />
                  <span>
                    Current pressure: {ORGANIZATION_ACTION_LABELS[rivalOrganizationState.currentPressure.sourceAction ?? ""] ?? "active campaign"}
                  </span>
                  <TrendingUp size={14} className="text-amber-300" aria-hidden="true" />
                </div>
              )}
            </div>
            <RivalOperationsNetwork
              organizations={organizations}
              rivals={rivalScoutsById ?? {}}
              opportunities={openOpportunities}
              pressure={rivalOrganizationState.currentPressure}
              formatAction={(action) => ORGANIZATION_ACTION_LABELS[action] ?? action}
            />
            <details className="group rounded-xl border border-white/10 bg-black/20">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300 [&::-webkit-details-marker]:hidden">
                Detailed organization files
                <span className="text-xs font-normal text-zinc-400 group-open:hidden">Show all</span>
                <span className="hidden text-xs font-normal text-zinc-400 group-open:inline">Hide files</span>
              </summary>
              <div className="grid gap-4 border-t border-white/10 p-4 lg:grid-cols-3">
                {organizations.map((organization) => (
                  <OrganizationCard key={organization.id} organization={organization} />
                ))}
              </div>
            </details>
          </section>
        )}

        {/* Nemesis banner */}
        {nemesis && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Swords size={16} className="text-red-400" aria-hidden="true" />
              <span className="text-sm font-semibold text-red-400">Closest rival</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-white">{nemesis.name}</span>
                <span className="text-xs text-zinc-400 ml-2">
                  {getClubName(nemesis.clubId)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <QualityStars quality={nemesis.quality} />
                <span className="text-xs text-zinc-400">Rep: {nemesis.reputation}</span>
              </div>
            </div>
            {nemesis.currentTarget && (
              <p className="text-xs text-amber-400 mt-1">
                Currently scouting: {getPlayerName(nemesis.currentTarget)}
              </p>
            )}
            {(() => {
              const shared = nemesis.targetPlayerIds.filter((playerId) => scopedPlayerIds.has(playerId));
              return shared.length > 0 ? (
                <p className="mt-1 text-xs text-zinc-400">
                  {shared.length} shared target{shared.length !== 1 ? "s" : ""}
                </p>
              ) : null;
            })()}
          </div>
        )}

        {/* Rival cards grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-tutorial-id="rivals-list">
          {nemesis && (
            <RivalCard
              key={nemesis.id}
              rival={nemesis}
              getClubName={getClubName}
              getPlayerName={getPlayerName}
              scout={scout}
              consequenceState={consequenceState}
              currentWeek={currentWeek}
              currentSeason={currentSeason}
              contactNamesById={contactNamesById}
              rivalNamesById={rivalNamesById}
              sharedTargetIds={nemesis.targetPlayerIds.filter((playerId) => scopedPlayerIds.has(playerId))}
              onNavigateToPlayer={navigateToPlayer}
              recentActivities={recentActivitiesByRival.get(nemesis.id) ?? []}
            />
          )}
          {nonNemesisRivals.map((rival) => (
            <RivalCard
              key={rival.id}
              rival={rival}
              getClubName={getClubName}
              getPlayerName={getPlayerName}
              scout={scout}
              consequenceState={consequenceState}
              currentWeek={currentWeek}
              currentSeason={currentSeason}
              contactNamesById={contactNamesById}
              rivalNamesById={rivalNamesById}
              sharedTargetIds={rival.targetPlayerIds.filter((playerId) => scopedPlayerIds.has(playerId))}
              onNavigateToPlayer={navigateToPlayer}
              recentActivities={recentActivitiesByRival.get(rival.id) ?? []}
            />
          ))}
        </div>
        </div>
      </div>
    </GameLayout>
  );
}
