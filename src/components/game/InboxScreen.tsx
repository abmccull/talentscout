"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAudio } from "@/lib/audio/useAudio";
import { AudioEngine } from "@/lib/audio/audioEngine";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  Star,
  Newspaper,
  Briefcase,
  Bell,
  Mail,
  MailOpen,
  Zap,
  X,
  AlertTriangle,
  Link2,
} from "lucide-react";
import type { InboxMessage, InboxMessageType, NarrativeEvent, NarrativeEventType, EventChain } from "@/engine/core/types";

// ─── Message type config ──────────────────────────────────────────────────────

const MESSAGE_TYPE_CONFIG: Record<
  InboxMessageType,
  { label: string; icon: React.ElementType; color: string }
> = {
  assignment: { label: "Assignment", icon: ClipboardList, color: "text-blue-400" },
  feedback: { label: "Feedback", icon: Star, color: "text-amber-400" },
  news: { label: "News", icon: Newspaper, color: "text-zinc-400" },
  jobOffer: { label: "Job Offer", icon: Briefcase, color: "text-emerald-400" },
  event: { label: "Event", icon: Bell, color: "text-purple-400" },
  directive: { label: "Directive", icon: ClipboardList, color: "text-rose-400" },
  clubResponse: { label: "Club Response", icon: Star, color: "text-emerald-400" },
  transferUpdate: { label: "Transfer Update", icon: Newspaper, color: "text-sky-400" },
  analystReport: { label: "Analyst Report", icon: ClipboardList, color: "text-cyan-400" },
  predictionResult: { label: "Prediction Result", icon: Zap, color: "text-amber-400" },
  warning: { label: "Warning", icon: AlertTriangle, color: "text-red-400" },
};

// ─── Narrative event type config ─────────────────────────────────────────────

const NARRATIVE_TYPE_CONFIG: Record<
  NarrativeEventType,
  { label: string; color: string }
> = {
  // Original 8
  rivalPoach:                  { label: "Rival Activity",      color: "text-red-400" },
  managerFired:                { label: "Management Change",   color: "text-amber-400" },
  exclusiveTip:                { label: "Exclusive Tip",       color: "text-emerald-400" },
  debutHatTrick:               { label: "Player Form",         color: "text-blue-400" },
  targetInjured:               { label: "Injury Alert",        color: "text-red-400" },
  reportCitedInBoardMeeting:   { label: "Board Recognition",   color: "text-purple-400" },
  rivalRecruitment:            { label: "Rival Recruitment",   color: "text-orange-400" },
  agentDeception:              { label: "Agent Intel",         color: "text-zinc-400" },
  // Scout Personal Life
  burnout:                     { label: "Personal Wellbeing",  color: "text-yellow-400" },
  familyEmergency:             { label: "Personal Life",       color: "text-rose-400" },
  scoutingConference:          { label: "Industry Event",      color: "text-sky-400" },
  mentorOffer:                 { label: "Career Opportunity",  color: "text-emerald-400" },
  mediaInterview:              { label: "Media",               color: "text-cyan-400" },
  healthScare:                 { label: "Personal Wellbeing",  color: "text-red-400" },
  // Club Drama
  boardroomCoup:               { label: "Club Politics",       color: "text-amber-400" },
  budgetCut:                   { label: "Club Finance",        color: "text-orange-400" },
  scoutingDeptRestructure:     { label: "Department News",     color: "text-amber-400" },
  rivalClubPoach:              { label: "Career Opportunity",  color: "text-emerald-400" },
  managerSacked:               { label: "Management Change",   color: "text-red-400" },
  clubFinancialTrouble:        { label: "Club Finance",        color: "text-orange-400" },
  // Player Stories
  wonderkidPressure:           { label: "Player Story",        color: "text-blue-400" },
  playerHomesick:              { label: "Player Welfare",      color: "text-sky-400" },
  hiddenGemVindication:        { label: "Scout Vindicated",    color: "text-emerald-400" },
  playerControversy:           { label: "Player Story",        color: "text-red-400" },
  youthProdigyDilemma:         { label: "Youth Dilemma",       color: "text-purple-400" },
  injurySetback:               { label: "Injury Alert",        color: "text-red-400" },
  debutBrilliance:             { label: "Player Milestone",    color: "text-blue-400" },
  lateBloomingSurprise:        { label: "Player Story",        color: "text-emerald-400" },
  // Network Events
  contactBetrayal:             { label: "Network Alert",       color: "text-red-400" },
  exclusiveAccess:             { label: "Network Opportunity", color: "text-emerald-400" },
  agentDoubleDealing:          { label: "Agent Intel",         color: "text-zinc-400" },
  journalistExpose:            { label: "Media",               color: "text-cyan-400" },
  networkExpansion:            { label: "Network Growth",      color: "text-emerald-400" },
  contactRetirement:           { label: "Network Change",      color: "text-zinc-400" },
  // Industry Events
  transferRuleChange:          { label: "Industry News",       color: "text-sky-400" },
  dataRevolution:              { label: "Industry News",       color: "text-cyan-400" },
  youthAcademyScandal:         { label: "Industry Scandal",    color: "text-red-400" },
  internationalTournament:     { label: "Tournament",          color: "text-blue-400" },
  scoutingAwardNomination:     { label: "Award",               color: "text-purple-400" },
  financialFairPlayImpact:     { label: "Industry News",       color: "text-amber-400" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(
  week: number,
  season: number,
  currentWeek: number,
  currentSeason: number,
): string {
  const totalWeeksAgo =
    (currentSeason - season) * 38 + (currentWeek - week);
  if (totalWeeksAgo === 0) return "This week";
  if (totalWeeksAgo === 1) return "1 week ago";
  if (totalWeeksAgo < 4) return `${totalWeeksAgo} weeks ago`;
  return `Season ${season}, Week ${week}`;
}

// ─── NarrativeEventCard ──────────────────────────────────────────────────────

interface NarrativeEventCardProps {
  event: NarrativeEvent;
  chain?: EventChain;
  onAcknowledge: () => void;
  onChoice: (index: number) => void;
}

/** Escalation badge colour and label. */
const ESCALATION_CONFIG: Record<number, { label: string; className: string }> = {
  0: { label: "", className: "" },
  1: { label: "Escalating", className: "border-amber-500/60 text-amber-400 bg-amber-500/10" },
  2: { label: "Critical", className: "border-red-500/60 text-red-400 bg-red-500/10" },
};

function NarrativeEventCard({
  event,
  chain,
  onAcknowledge,
  onChoice,
}: NarrativeEventCardProps) {
  const typeConfig = NARRATIVE_TYPE_CONFIG[event.type];
  const hasChoices = event.choices && event.choices.length > 0;
  const choiceResolved = event.selectedChoice !== undefined;

  const isChainEvent = !!event.chainId;
  const escalation = event.escalationLevel ?? 0;
  const escalationConfig = ESCALATION_CONFIG[escalation] ?? ESCALATION_CONFIG[0];

  // Determine chain step display (e.g. "Part 2 of 4")
  const chainStepLabel = isChainEvent && chain
    ? `Part ${event.chainStep ?? 1} of ${chain.maxSteps}`
    : null;

  // Border colour escalation: normal=purple, warning=amber, critical=red
  const borderClass = escalation >= 2
    ? "border-red-500/40 bg-red-500/5"
    : escalation === 1
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-purple-500/30 bg-purple-500/5";

  return (
    <div className={`rounded-lg border p-4 ${borderClass}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Zap size={14} className="shrink-0 text-purple-400" aria-hidden="true" />
          <span className="font-semibold text-white truncate">{event.title}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* F2: Chain indicator badge */}
          {isChainEvent && chainStepLabel && (
            <Badge variant="outline" className="text-[10px] border-sky-500/50 text-sky-400 bg-sky-500/10">
              <Link2 size={9} className="mr-0.5" aria-hidden="true" />
              {chainStepLabel}
            </Badge>
          )}
          {/* F2: Escalation badge */}
          {escalation > 0 && escalationConfig.label && (
            <Badge variant="outline" className={`text-[10px] ${escalationConfig.className}`}>
              <AlertTriangle size={9} className="mr-0.5" aria-hidden="true" />
              {escalationConfig.label}
            </Badge>
          )}
          <Badge variant="outline" className={`text-[10px] border-current ${typeConfig.color}`}>
            {typeConfig.label}
          </Badge>
        </div>
      </div>

      {/* F2: Show previous chain choices as context */}
      {isChainEvent && chain && chain.choiceHistory.length > 0 && (
        <div className="mb-2 rounded bg-zinc-800/50 px-2.5 py-1.5 text-xs text-zinc-400">
          <span className="font-medium text-zinc-300">Previous choices:</span>{" "}
          {chain.choiceHistory.map((choiceIdx, stepIdx) => (
            <span key={stepIdx} className="text-zinc-500">
              {stepIdx > 0 ? " > " : ""}
              Step {stepIdx + 1}: Option {choiceIdx + 1}
            </span>
          ))}
        </div>
      )}

      <p className="mb-3 text-sm text-zinc-300 leading-relaxed">
        {event.description}
      </p>

      {/* Related entity count */}
      {event.relatedIds.length > 0 && (
        <p className="mb-3 text-xs text-zinc-500">
          {event.relatedIds.length} related{" "}
          {event.relatedIds.length === 1 ? "entity" : "entities"}
        </p>
      )}

      {/* Choices or dismiss */}
      {hasChoices && !choiceResolved ? (
        <div className="flex flex-wrap gap-2">
          {event.choices!.map((choice, i) => (
            <Button
              key={i}
              size="sm"
              variant="outline"
              className="text-xs border-purple-500/40 hover:border-purple-500"
              onClick={() => onChoice(i)}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      ) : choiceResolved ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Choice made: {event.choices?.[event.selectedChoice!]?.label ?? "--"}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-zinc-500 hover:text-white h-7 px-2"
            onClick={onAcknowledge}
            aria-label={`Dismiss narrative event: ${event.title}`}
          >
            <X size={12} className="mr-1" aria-hidden="true" />
            Dismiss
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-zinc-500 hover:text-white h-7 px-2"
          onClick={onAcknowledge}
          aria-label={`Dismiss narrative event: ${event.title}`}
        >
          <X size={12} className="mr-1" aria-hidden="true" />
          Dismiss
        </Button>
      )}
    </div>
  );
}

// ─── MessageItem ─────────────────────────────────────────────────────────────

interface MessageItemProps {
  message: InboxMessage;
  isExpanded: boolean;
  currentWeek: number;
  currentSeason: number;
  onClick: () => void;
  onViewPlayer?: (playerId: string) => void;
  onWriteReport?: (playerId: string) => void;
  onViewCareer?: () => void;
}

function MessageItem({
  message,
  isExpanded,
  currentWeek,
  currentSeason,
  onClick,
  onViewPlayer,
  onWriteReport,
  onViewCareer,
}: MessageItemProps) {
  const config = MESSAGE_TYPE_CONFIG[message.type];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      aria-expanded={isExpanded}
      aria-label={`${message.read ? "Read" : "Unread"} message: ${message.title}`}
      className={`w-full rounded-lg border text-left transition ${
        !message.read
          ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50"
          : isExpanded
            ? "border-zinc-600 bg-[#141414]"
            : "border-[#27272a] bg-[#141414] hover:border-zinc-600"
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div
          className={`mt-0.5 shrink-0 rounded-md p-1.5 ${
            !message.read ? "bg-emerald-500/10" : "bg-[#27272a]"
          }`}
        >
          <Icon size={14} className={config.color} aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {!message.read && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                  aria-label="Unread"
                />
              )}
              <span
                className={`truncate text-sm font-semibold ${
                  !message.read ? "text-white" : "text-zinc-300"
                }`}
              >
                {message.title}
              </span>
            </div>
            <span className="shrink-0 text-xs text-zinc-600">
              {timeAgo(message.week, message.season, currentWeek, currentSeason)}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-[10px]">
              {config.label}
            </Badge>
            {message.actionRequired && (
              <Badge variant="warning" className="text-[10px]">
                Action Required
              </Badge>
            )}
          </div>

          {isExpanded ? (
            <>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                {message.body}
              </p>
              {message.relatedId && message.relatedEntityType === "player" && (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={(e) => { e.stopPropagation(); onViewPlayer?.(message.relatedId!); }}
                  >
                    View Player
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-xs h-7"
                    onClick={(e) => { e.stopPropagation(); onWriteReport?.(message.relatedId!); }}
                  >
                    Write Report
                  </Button>
                </div>
              )}
              {message.relatedEntityType === "jobOffer" && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={(e) => { e.stopPropagation(); onViewCareer?.(); }}
                  >
                    View in Career
                  </Button>
                </div>
              )}
              {message.relatedEntityType === "contact" && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={(e) => { e.stopPropagation(); onViewCareer?.(); }}
                  >
                    View Network
                  </Button>
                </div>
              )}
              {message.relatedEntityType === "tool" && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={(e) => { e.stopPropagation(); onViewCareer?.(); }}
                  >
                    View Tools
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-zinc-500 line-clamp-2">{message.body}</p>
          )}
        </div>

        {/* Read indicator */}
        <div className="shrink-0 mt-0.5">
          {message.read ? (
            <MailOpen size={14} className="text-zinc-600" aria-hidden="true" />
          ) : (
            <Mail size={14} className="text-emerald-500" aria-hidden="true" />
          )}
        </div>
      </div>
    </button>
  );
}

// ─── InboxScreen ─────────────────────────────────────────────────────────────

export function InboxScreen() {
  const {
    gameState,
    markMessageRead,
    acknowledgeNarrativeEvent,
    resolveNarrativeEventChoice,
    selectPlayer,
    setScreen,
    startReport,
  } = useGameStore();
  const { playSFX } = useAudio();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<InboxMessageType | "all">("all");

  // Play tension music when dramatic narrative events are present.
  // Must be above the early return so hooks are called unconditionally.
  const DRAMATIC_TYPES = new Set([
    "boardroomCoup", "budgetCut", "scoutingDeptRestructure", "rivalClubPoach",
    "managerSacked", "clubFinancialTrouble", "playerControversy", "wonderkidPressure",
    "injurySetback", "contactBetrayal", "agentDoubleDealing", "burnout",
    "healthScare", "familyEmergency", "youthAcademyScandal", "rivalPoach",
    "rivalRecruitment", "agentDeception",
  ]);
  const activeNarrativeEvents = gameState?.narrativeEvents.filter((e) => !e.acknowledged) ?? [];
  const hasDramaticEvent = activeNarrativeEvents.some((e) => DRAMATIC_TYPES.has(e.type));
  useEffect(() => {
    if (!gameState) return;
    const audio = AudioEngine.getInstance();
    if (hasDramaticEvent) {
      audio.playMusic("transfer-pressure");
    } else {
      audio.playMusic("career-hub");
    }
  }, [hasDramaticEvent, gameState]);

  if (!gameState) return null;

  const { inbox, currentWeek, currentSeason, narrativeEvents } = gameState;

  // F2: Build a lookup map for event chains
  const chainMap = new Map<string, EventChain>();
  for (const chain of gameState.eventChains ?? []) {
    chainMap.set(chain.id, chain);
  }

  // Sort messages by most recent (week desc, season desc)
  const sorted = [...inbox].sort((a, b) => {
    if (b.season !== a.season) return b.season - a.season;
    return b.week - a.week;
  });

  const filtered =
    filterType === "all" ? sorted : sorted.filter((m) => m.type === filterType);

  const unreadCount = inbox.filter((m) => !m.read).length;

  const handleExpand = (message: InboxMessage) => {
    const isExpanding = expandedId !== message.id;
    setExpandedId(isExpanding ? message.id : null);
    if (isExpanding && !message.read) {
      markMessageRead(message.id);
      playSFX(message.type === "jobOffer" ? "job-offer" : "notification");
    }
  };

  const handleMarkAllRead = () => {
    inbox.filter((m) => !m.read).forEach((m) => markMessageRead(m.id));
  };

  return (
    <GameLayout>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Inbox</h1>
            <p className="text-sm text-zinc-400">
              {unreadCount > 0
                ? `${unreadCount} unread message${unreadCount !== 1 ? "s" : ""}`
                : "All messages read"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-zinc-500 hover:text-white transition"
              aria-label="Mark all messages as read"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* ── T8.3: Narrative events at the top ─────────────────────────── */}
        {activeNarrativeEvents.length > 0 && (
          <section aria-label="Narrative events" className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Zap size={14} className="text-purple-400" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-white">
                Events Requiring Attention
              </h2>
              <Badge className="text-[10px]">{activeNarrativeEvents.length}</Badge>
            </div>
            <div className="space-y-3">
              {activeNarrativeEvents.map((event) => (
                <NarrativeEventCard
                  key={event.id}
                  event={event}
                  chain={event.chainId ? chainMap.get(event.chainId) : undefined}
                  onAcknowledge={() => acknowledgeNarrativeEvent(event.id)}
                  onChoice={(index) =>
                    resolveNarrativeEventChoice(event.id, index)
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Type filter tabs */}
        <div
          className="mb-4 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Filter messages by type"
        >
          <button
            role="tab"
            aria-selected={filterType === "all"}
            onClick={() => setFilterType("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filterType === "all"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-[#141414] text-zinc-500 hover:text-white border border-[#27272a]"
            }`}
          >
            All ({inbox.length})
          </button>
          {(
            Object.entries(MESSAGE_TYPE_CONFIG) as [
              InboxMessageType,
              (typeof MESSAGE_TYPE_CONFIG)[InboxMessageType],
            ][]
          ).map(([type, config]) => {
            const count = inbox.filter((m) => m.type === type).length;
            if (count === 0) return null;
            const Icon = config.icon;
            return (
              <button
                key={type}
                role="tab"
                aria-selected={filterType === type}
                onClick={() => setFilterType(type)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filterType === type
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-[#141414] text-zinc-500 hover:text-white border border-[#27272a]"
                }`}
              >
                <Icon size={11} className={config.color} aria-hidden="true" />
                {config.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Messages */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <MailOpen size={32} className="mb-3 text-zinc-700" aria-hidden="true" />
              <p className="text-sm text-zinc-500">
                {filterType === "all"
                  ? "No messages yet."
                  : `No ${MESSAGE_TYPE_CONFIG[filterType as InboxMessageType]?.label.toLowerCase()} messages.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2" role="list" data-tutorial-id="inbox-latest">
            {filtered.map((message) => (
              <div key={message.id} role="listitem">
                <MessageItem
                  message={message}
                  isExpanded={expandedId === message.id}
                  currentWeek={currentWeek}
                  currentSeason={currentSeason}
                  onClick={() => handleExpand(message)}
                  onViewPlayer={(playerId) => {
                    selectPlayer(playerId);
                    setScreen("playerProfile");
                  }}
                  onWriteReport={(playerId) => {
                    startReport(playerId);
                  }}
                  onViewCareer={() => {
                    if (message.relatedEntityType === "contact") setScreen("network");
                    else if (message.relatedEntityType === "tool") setScreen("career");
                    else setScreen("career");
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </GameLayout>
  );
}
