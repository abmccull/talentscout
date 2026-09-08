"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  UserCheck,
  Newspaper,
  GraduationCap,
  Eye,
  ChevronRight,
  X,
  Shield,
  AlertTriangle,
  MessageCircle,
  UserPlus,
  Lock,
  Clock,
} from "lucide-react";
import type {
  Activity,
  Contact,
  ContactType,
  Fixture,
  GameDate,
  GossipItem,
  HiddenIntel,
} from "@/engine/core/types";
import {
  getContactSpecializationBonus,
  getHiddenAttributeIntel,
  isContactAccessSuspended,
} from "@/engine/network/contacts";
import { gameWeeksBetween, isGameDateAtOrAfter } from "@/engine/core/gameDate";
import { RNG } from "@/engine/rng";
import {
  buildContactRelationshipPosition,
  buildStoryThread,
  getActiveEarlyAccessForContact,
  type AccessAgreement,
  type RelationshipPosition,
  type StakeholderProfile,
  type StoryThread,
} from "@/engine/consequences";
import { StakeholderEcologyPanel } from "./StakeholderEcologyPanel";

const CONTACT_TYPE_CONFIG: Record<
  ContactType,
  { label: string; icon: React.ElementType; color: string }
> = {
  agent: { label: "Agent", icon: UserCheck, color: "text-[var(--muted-foreground)]" },
  scout: { label: "Scout", icon: Eye, color: "text-[var(--muted-foreground)]" },
  clubStaff: { label: "Club Staff", icon: Users, color: "text-[var(--muted-foreground)]" },
  journalist: { label: "Journalist", icon: Newspaper, color: "text-[var(--muted-foreground)]" },
  academyCoach: { label: "Academy Coach", icon: GraduationCap, color: "text-[var(--muted-foreground)]" },
  sportingDirector: { label: "Sporting Director", icon: Users, color: "text-[var(--muted-foreground)]" },
  grassrootsOrganizer: { label: "Grassroots Organizer", icon: Users, color: "text-[var(--muted-foreground)]" },
  schoolCoach: { label: "School Coach", icon: GraduationCap, color: "text-[var(--muted-foreground)]" },
  youthAgent: { label: "Youth Agent", icon: UserCheck, color: "text-[var(--muted-foreground)]" },
  academyDirector: { label: "Academy Director", icon: GraduationCap, color: "text-[var(--muted-foreground)]" },
  localScout: { label: "Local Scout", icon: Eye, color: "text-[var(--muted-foreground)]" },
};

/** Color classes for specialization bonus badges. */
const SPECIALIZATION_BADGE_COLORS: Partial<Record<ContactType, string>> = {
  agent: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  clubStaff: "bg-[var(--surface)] text-[var(--signal-focus)] border-[var(--border)]",
  journalist: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  scout: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

function relationshipLabel(rel: number): string {
  if (rel >= 80) return "Close Ally";
  if (rel >= 60) return "Friend";
  if (rel >= 40) return "Acquaintance";
  if (rel >= 20) return "Contact";
  return "Stranger";
}

function relationshipColor(rel: number): string {
  if (rel >= 80) return "bg-emerald-500";
  if (rel >= 60) return "bg-blue-500";
  if (rel >= 40) return "bg-amber-500";
  return "bg-zinc-500";
}

function trustColor(trust: number): string {
  if (trust >= 75) return "bg-emerald-500";
  if (trust >= 50) return "bg-blue-500";
  if (trust >= 25) return "bg-amber-500";
  return "bg-red-500";
}

function trustLabel(trust: number): string {
  if (trust >= 75) return "Trusted Insider";
  if (trust >= 50) return "Reliable";
  if (trust >= 25) return "Cautious";
  return "Wary";
}

function betrayalRiskLabel(risk: number): { label: string; color: string } {
  if (risk >= 0.3) return { label: "High Risk", color: "text-red-400" };
  if (risk >= 0.15) return { label: "Moderate Risk", color: "text-[var(--muted-foreground)]" };
  if (risk >= 0.05) return { label: "Low Risk", color: "text-zinc-400" };
  return { label: "Safe", color: "text-[var(--muted-foreground)]" };
}

function relationshipStanceTone(stance: RelationshipPosition["stance"]): string {
  switch (stance) {
    case "adversarial": return "border-[var(--border)] bg-transparent text-[var(--signal-danger)]";
    case "strained": return "border-amber-400/35 bg-amber-500/10 text-amber-200";
    case "conditional": return "border-zinc-400/30 text-zinc-200";
    default: return "border-emerald-400/30 text-emerald-200";
  }
}

function formatGameDate(date: GameDate): string {
  return `S${date.season}, W${date.week}`;
}

function isActiveBefore(date: GameDate, expiresAt: GameDate): boolean {
  return !isGameDateAtOrAfter(date, expiresAt);
}

function gossipTypeLabel(type: GossipItem["type"]): string {
  const labels: Record<GossipItem["type"], string> = {
    transferRumor: "Transfer Rumor",
    unhappyPlayer: "Unhappy Player",
    youthProspect: "Youth Prospect",
    managerChange: "Manager Change",
    injuryNews: "Injury News",
  };
  return labels[type] ?? type;
}

function gossipTypeColor(type: GossipItem["type"]): string {
  const colors: Record<GossipItem["type"], string> = {
    transferRumor: "text-blue-400",
    unhappyPlayer: "text-red-400",
    youthProspect: "text-emerald-400",
    managerChange: "text-amber-400",
    injuryNews: "text-orange-400",
  };
  return colors[type] ?? "text-zinc-400";
}

interface IntelEntry {
  playerName: string;
  intel: HiddenIntel;
}

interface ContactDetailProps {
  contact: Contact;
  accessAgreement?: AccessAgreement;
  position: RelationshipPosition;
  identity?: StakeholderProfile;
  knownPlayerNames: string[];
  intelEntries: IntelEntry[];
  currentDate: GameDate;
  fixtures: Record<string, Fixture>;
  onScheduleMeeting: () => void;
  onClose: () => void;
}

function reliabilityColor(reliability: number): string {
  if (reliability >= 0.8) return "text-emerald-400";
  if (reliability >= 0.5) return "text-amber-400";
  return "text-red-400";
}

function reliabilityLabel(reliability: number): string {
  if (reliability >= 0.8) return "High";
  if (reliability >= 0.5) return "Medium";
  return "Low";
}

function formatAttributeLabel(attribute: string): string {
  const labels: Record<string, string> = {
    injuryProneness: "Injury Proneness",
    consistency: "Consistency",
    bigGameTemperament: "Big-Game Temperament",
    professionalism: "Professionalism",
  };
  return labels[attribute] ?? attribute;
}

function formatPlayerName(
  player:
    | { firstName: string; lastName: string }
    | undefined,
): string | null {
  return player ? `${player.firstName} ${player.lastName}` : null;
}

function ContactDetail({ contact, accessAgreement, position, identity, knownPlayerNames, intelEntries, currentDate, fixtures, onScheduleMeeting, onClose }: ContactDetailProps) {
  const ecology = position.ecology;
  const config = CONTACT_TYPE_CONFIG[contact.type];
  const Icon = config.icon;
  const trustLevel = contact.trustLevel ?? contact.relationship;
  const betrayalRisk = contact.betrayalRisk ?? 0;
  const gossipQueue = contact.gossipQueue ?? [];
  const activeGossip = gossipQueue.filter((g) => isActiveBefore(currentDate, g.expiresAt));
  const referralCount = (contact.referralNetwork ?? []).length;
  const risk = betrayalRiskLabel(betrayalRisk);
  const weeksSinceContact = contact.lastInteractionAt
    ? Math.max(0, gameWeeksBetween(fixtures, contact.lastInteractionAt, currentDate))
    : null;
  const accessSuspended = isContactAccessSuspended(contact, currentDate);
  const isDormant = contact.dormant === true && !accessSuspended;
  const isRelationshipFading = contact.relationship < 30 && !isDormant;

  return (
    <Card className={isDormant || position.stance === "adversarial" ? "border-red-400/30" : "border-[var(--border)]"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Icon size={16} className={config.color} aria-hidden="true" />
            {contact.name}
          </CardTitle>
          <button
            onClick={onClose}
            className="text-zinc-300 hover:text-white transition rounded p-1"
            aria-label="Close contact detail"
          >
            <X size={14} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2" aria-label="Relationship position">
          <Badge variant="outline" className={`text-xs capitalize ${relationshipStanceTone(position.stance)}`}>
            {position.stance.replace(/([a-z])([A-Z])/g, "$1 $2")}
          </Badge>
          {position.leverageScore > 0 && (
            <span className="text-[10px] text-zinc-300">Leverage {position.leverageScore}</span>
          )}
          {position.threatScore >= 45 && (
            <span className="text-[10px] text-amber-300">Pressure {position.threatScore}</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-zinc-300">Type: </span>
            <span className="text-white">{config.label}</span>
          </div>
          <div>
            <span className="text-zinc-300">Organisation: </span>
            <span className="text-white">{contact.organization}</span>
          </div>
          {contact.region && (
            <div>
              <span className="text-zinc-300">Region: </span>
              <span className="text-white">{contact.region}</span>
            </div>
          )}
          {weeksSinceContact != null && (
            <div>
              <span className="text-zinc-300">Last contact: </span>
              <span className="text-white">
                {weeksSinceContact === 0
                  ? "This week"
                  : `${weeksSinceContact} week${weeksSinceContact !== 1 ? "s" : ""} ago`}
              </span>
            </div>
          )}
        </div>

        {/* Relationship status warnings */}
        {isDormant && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle size={12} className="text-red-400" aria-hidden="true" />
              <span className="font-medium text-red-400">Dormant</span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-300">
              This contact has gone dormant due to low relationship. Schedule a meeting to rebuild the connection.
            </p>
          </div>
        )}
        {isRelationshipFading && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle size={12} className="text-amber-400" aria-hidden="true" />
              <span className="font-medium text-amber-400">Relationship Fading</span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-300">
              Your relationship is deteriorating. Consider reaching out before this contact goes dormant.
            </p>
          </div>
        )}

        {/* Specialization bonus (A6) */}
        {(() => {
          const bonus = getContactSpecializationBonus(contact.type);
          const badgeColor = SPECIALIZATION_BADGE_COLORS[contact.type];
          if (!bonus || !badgeColor) return null;
          return (
            <div className="flex items-start gap-2">
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-medium ${badgeColor}`}
              >
                {bonus.badgeLabel}
              </span>
              <span className="text-xs text-zinc-300">{bonus.description}</span>
            </div>
          );
        })()}

        {/* Relationship */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-300">Relationship</span>
            <span className="text-white font-medium">{relationshipLabel(contact.relationship)}</span>
          </div>
          <Progress
            value={contact.relationship}
            max={100}
            indicatorClassName={relationshipColor(contact.relationship)}
          />
          <p className="mt-1 text-xs text-zinc-300">{contact.relationship}/100</p>
        </div>

        {/* F3: Trust Level */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-300 flex items-center gap-1">
              <Shield size={10} aria-hidden="true" />
              Trust
            </span>
            <span className="text-white font-medium">{trustLabel(trustLevel)}</span>
          </div>
          <Progress
            value={trustLevel}
            max={100}
            indicatorClassName={trustColor(trustLevel)}
          />
          <p className="mt-1 text-xs text-zinc-300">{trustLevel}/100</p>
        </div>

        {/* Reliability */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-300">Intel Reliability</span>
            <span className="text-white font-medium">
              {contact.reliability}%
            </span>
          </div>
          <Progress
            value={contact.reliability}
            max={100}
            indicatorClassName="bg-[var(--signal-focus)]"
          />
        </div>

        <StakeholderEcologyPanel profile={ecology} />

        {identity && (
          <div className="rounded-md border border-indigo-500/20 bg-indigo-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-200">
                Persistent identity
              </p>
              <span className="text-[10px] capitalize text-indigo-300">
                {identity.conflictStyle.replace(/([a-z])([A-Z])/g, "$1 $2")}
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-[9px] uppercase tracking-wide text-zinc-300">What they value</p>
                <p className="mt-1 text-[10px] leading-relaxed text-zinc-300">
                  {identity.priorities.slice(0, 3).map((value) =>
                    value.replace(/([a-z])([A-Z])/g, "$1 $2"),
                  ).join(" · ")}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wide text-zinc-300">Red lines</p>
                <p className="mt-1 text-[10px] leading-relaxed text-zinc-300">
                  {identity.redLine.replace(/([a-z])([A-Z])/g, "$1 $2")}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {identity.traits.slice(0, 4).map((trait) => (
                <Badge key={trait} variant="outline" className="border-indigo-500/25 text-[9px] capitalize text-indigo-200">
                  {trait.replace(/([a-z])([A-Z])/g, "$1 $2")}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {accessSuspended && contact.accessSuspendedUntil && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <Lock size={12} className="text-red-400" aria-hidden="true" />
              <span className="font-medium text-red-400">Access Suspended</span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-300">
              This source will not provide gossip, referrals, or exclusive access until {formatGameDate(contact.accessSuspendedUntil)}.
            </p>
          </div>
        )}

        {/* F3: Betrayal Risk Warning */}
        {betrayalRisk >= 0.05 && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle size={12} className="text-red-400" aria-hidden="true" />
              <span className={`font-medium ${risk.color}`}>
                Betrayal: {risk.label}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-300">
              This contact may leak information to rivals. Maintain trust to reduce risk.
            </p>
          </div>
        )}

        {/* F3: Exclusive Window */}
        {accessAgreement && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <Lock size={12} className="text-amber-400" aria-hidden="true" />
              <span className="font-medium text-amber-400">
                Exclusive Access
              </span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-300">
              {accessAgreement.expiresAt
                ? `Early access to a prospect expires ${formatGameDate(accessAgreement.expiresAt)}.`
                : "This source has granted active early access to a prospect."}
            </p>
          </div>
        )}

        {/* F3: Gossip Feed */}
        {activeGossip.length > 0 && (
          <div>
            <p className="text-xs text-zinc-300 mb-2 uppercase tracking-wider font-semibold flex items-center gap-1">
              <MessageCircle size={11} aria-hidden="true" />
              Gossip ({activeGossip.length})
            </p>
            <ul className="space-y-2" aria-label="Contact gossip">
              {activeGossip.slice(0, 5).map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-medium ${gossipTypeColor(item.type)}`}>
                      {gossipTypeLabel(item.type)}
                    </span>
                    <span className="text-[10px] text-zinc-300">
                      Expires {formatGameDate(item.expiresAt)}
                    </span>
                  </div>
                  <p className="text-zinc-300 leading-relaxed">{item.content}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-[10px] text-zinc-300">Reliability:</span>
                    <span
                      className={`text-[10px] font-medium ${reliabilityColor(item.reliability)}`}
                    >
                      {Math.round(item.reliability * 100)}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* F3: Referral Network */}
        {referralCount > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <UserPlus size={11} className="text-cyan-400" aria-hidden="true" />
            <span className="text-zinc-300">
              Introduced {referralCount} contact{referralCount !== 1 ? "s" : ""} to your network
            </span>
          </div>
        )}

        {/* Known players */}
        {knownPlayerNames.length > 0 && (
          <div>
            <p className="text-xs text-zinc-300 mb-2 uppercase tracking-wider font-semibold">
              Known Players ({knownPlayerNames.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {knownPlayerNames.slice(0, 8).map((name) => (
                <Badge key={name} variant="secondary" className="text-[10px]">
                  {name}
                </Badge>
              ))}
              {knownPlayerNames.length > 8 && (
                <Badge variant="outline" className="text-[10px]">
                  +{knownPlayerNames.length - 8} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Available intel */}
        {intelEntries.length > 0 && (
          <div>
            <p className="text-xs text-zinc-300 mb-2 uppercase tracking-wider font-semibold flex items-center gap-1">
              <Eye size={11} aria-hidden="true" />
              Available Intel ({intelEntries.length})
            </p>
            <ul className="space-y-3" aria-label="Available player intel">
              {intelEntries.map((entry, i) => (
                <li
                  key={`${entry.intel.playerId}-${i}`}
                  className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-medium text-white">{entry.playerName}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="secondary" className="text-[10px] py-0">
                        {formatAttributeLabel(entry.intel.attribute)}
                      </Badge>
                      <span
                        className={`text-[10px] font-medium ${reliabilityColor(entry.intel.reliability)}`}
                        aria-label={`Reliability: ${reliabilityLabel(entry.intel.reliability)}`}
                      >
                        {reliabilityLabel(entry.intel.reliability)}
                      </span>
                    </div>
                  </div>
                  <p className="text-zinc-300 leading-relaxed">{entry.intel.hint}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          size="sm"
          className="w-full"
          onClick={onScheduleMeeting}
          disabled={accessSuspended}
        >
          {accessSuspended ? "Source Unavailable" : "Schedule Meeting"}
        </Button>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Gossip Feed Panel — displays all active gossip across all contacts
// =============================================================================

function GossipFeedPanel({ contacts, currentDate }: { contacts: Contact[]; currentDate: GameDate }) {
  const allGossip = useMemo(() => {
    const items: Array<{ contact: Contact; gossip: GossipItem }> = [];
    for (const contact of contacts) {
      for (const g of contact.gossipQueue ?? []) {
        if (isActiveBefore(currentDate, g.expiresAt)) {
          items.push({ contact, gossip: g });
        }
      }
    }
    // Sort by most recent first
    items.sort((a, b) =>
      b.gossip.revealedAt.season - a.gossip.revealedAt.season
      || b.gossip.revealedAt.week - a.gossip.revealedAt.week,
    );
    return items;
  }, [contacts, currentDate]);

  if (allGossip.length === 0) return null;

  return (
    <Card className="border-zinc-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageCircle size={14} className="text-cyan-400" aria-hidden="true" />
          Intelligence Feed
          <Badge variant="secondary" className="text-[10px]">
            {allGossip.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2" aria-label="Intelligence feed">
          {allGossip.slice(0, 8).map(({ contact, gossip }) => (
            <li
              key={gossip.id}
              className="rounded-md border border-zinc-800 bg-zinc-900/40 p-2.5 text-xs"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${gossipTypeColor(gossip.type)}`}>
                    {gossipTypeLabel(gossip.type)}
                  </span>
                  <span className="text-zinc-300">via {contact.name}</span>
                </div>
                <span className="text-[10px] text-zinc-300 shrink-0">
                  {formatGameDate(gossip.revealedAt)}
                </span>
              </div>
              <p className="text-zinc-300 leading-relaxed">{gossip.content}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function storyEntryLabel(entry: StoryThread["entries"][number]): string {
  if (entry.kind === "access") return "Access live";
  if (entry.kind === "obligation") return "Favor in motion";
  return "Memory logged";
}

function storyEntryTone(entry: StoryThread["entries"][number]): string {
  if (entry.kind === "access") return "text-amber-300";
  if (entry.kind === "obligation") return "text-blue-300";
  return "text-zinc-300";
}

interface ContactThreadPreview {
  contact: Contact;
  accessAgreement: AccessAgreement | undefined;
  position: RelationshipPosition;
  thread: StoryThread;
  urgencyScore: number;
  whyNow: string;
}

function NetworkPressurePanel({
  contacts,
  previews,
}: {
  contacts: Contact[];
  previews: ContactThreadPreview[];
}) {
  const exclusiveSources = previews.filter((preview) => preview.accessAgreement).length;
  const leveragePositions = previews.filter((preview) => preview.position.leverageScore > 0).length;
  const pressureThreads = previews.filter((preview) => preview.position.threatScore >= 45).length;
  const dormantContacts = contacts.filter((contact) => contact.dormant === true).length;

  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-3 border-y border-[var(--border)] py-4 text-sm" aria-label="Network overview">
      <div className="flex items-baseline gap-2"><dt className="text-zinc-300">Exclusive sources</dt><dd className="font-semibold text-white">{exclusiveSources}</dd></div>
      <div className="flex items-baseline gap-2"><dt className="text-zinc-300">Open leverage</dt><dd className="font-semibold text-white">{leveragePositions}</dd></div>
      <div className="flex items-baseline gap-2"><dt className="text-zinc-300">Under pressure</dt><dd className={pressureThreads > 0 ? "font-semibold text-amber-200" : "font-semibold text-white"}>{pressureThreads}</dd></div>
      <div className="flex items-baseline gap-2"><dt className="text-zinc-300">Dormant contacts</dt><dd className={dormantContacts > 0 ? "font-semibold text-red-200" : "font-semibold text-white"}>{dormantContacts}</dd></div>
    </dl>
  );
}

// =============================================================================
// Main NetworkScreen
// =============================================================================

export function NetworkScreen() {
  const {
    contactsById,
    contactIntel,
    playersById,
    fixturesById,
    clubsById,
    rivalScoutsById,
      consequenceState,
      accessAgreements,
    stakeholderProfiles,
    currentWeek,
    currentSeason,
    scoutId,
    scheduledActivities,
    scheduleActivity,
    pendingNetworkContactId,
    setPendingNetworkContactId,
  } = useGameStore(
    useShallow((state) => ({
      contactsById: state.gameState?.contacts,
      contactIntel: state.gameState?.contactIntel,
      playersById: state.gameState?.players,
      fixturesById: state.gameState?.fixtures,
      clubsById: state.gameState?.clubs,
      rivalScoutsById: state.gameState?.rivalScouts,
      consequenceState: state.gameState?.consequenceState,
      accessAgreements: state.gameState?.accessAgreements,
      stakeholderProfiles: state.gameState?.stakeholderProfiles,
      currentWeek: state.gameState?.currentWeek,
      currentSeason: state.gameState?.currentSeason,
      scoutId: state.gameState?.scout.id,
      scheduledActivities: state.gameState?.schedule.activities,
      scheduleActivity: state.scheduleActivity,
      pendingNetworkContactId: state.pendingNetworkContactId,
      setPendingNetworkContactId: state.setPendingNetworkContactId,
    })),
  );
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [scheduledId, setScheduledId] = useState<string | null>(null);
  const contactCardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const contacts = useMemo(
    () => Object.values(contactsById ?? {}),
    [contactsById],
  );
  const selectedContact = selectedContactId
    ? (contactsById?.[selectedContactId] ?? null)
    : null;

  const activeAccessByContact = useMemo(() => {
    const result = new Map<string, AccessAgreement>();
    if (!accessAgreements || currentWeek == null || currentSeason == null) return result;
    const now = { week: currentWeek, season: currentSeason };
    for (const contact of contacts) {
      const agreement = getActiveEarlyAccessForContact(accessAgreements, contact.id, now);
      if (agreement) result.set(contact.id, agreement);
    }
    return result;
  }, [accessAgreements, contacts, currentSeason, currentWeek]);

  const contactIntelMap = useMemo<Map<string, IntelEntry[]>>(() => {
    const map = new Map<string, IntelEntry[]>();
    if (!contactsById || !playersById) return map;
    const persistedIntel = contactIntel;
    const usePersistedIntel = persistedIntel !== undefined && persistedIntel !== null;

    for (const contact of contacts) {
      if (contact.knownPlayerIds.length === 0) {
        map.set(contact.id, []);
        continue;
      }

      if (usePersistedIntel) {
        const entries: IntelEntry[] = [];
        const seenIntel = new Set<string>();
        for (const playerId of contact.knownPlayerIds) {
          const player = playersById[playerId];
          if (!player) continue;
          for (const intel of persistedIntel[playerId] ?? []) {
            const intelKey = `${intel.playerId}:${intel.attribute}`;
            if (seenIntel.has(intelKey)) continue;
            seenIntel.add(intelKey);
            entries.push({
              playerName: `${player.firstName} ${player.lastName}`,
              intel,
            });
          }
        }
        map.set(contact.id, entries);
        continue;
      }

      if (contact.relationship < 35) {
        map.set(contact.id, []);
        continue;
      }

      const rng = new RNG(`intel-${contact.id}`);
      const entries: IntelEntry[] = [];
      for (const playerId of contact.knownPlayerIds) {
        const player = playersById[playerId];
        if (!player) continue;
        const intel = getHiddenAttributeIntel(rng, contact, playerId, player);
        if (intel) {
          entries.push({
            playerName: `${player.firstName} ${player.lastName}`,
            intel,
          });
        }
      }
      map.set(contact.id, entries);
    }
    return map;
  }, [contacts, contactsById, contactIntel, playersById]);

  const relationshipPositionMap = useMemo(() => {
    const profiles = new Map<string, RelationshipPosition>();
    if (
      !contactsById
      || !playersById
      || !clubsById
      || !rivalScoutsById
      || !consequenceState
      || !accessAgreements
      || currentWeek == null
      || currentSeason == null
      || !scoutId
    ) {
      return profiles;
    }
    const resolveEntityName = (entity: { kind: string; id: string }) => {
      if (entity.kind === "player") return formatPlayerName(playersById[entity.id]) ?? undefined;
      if (entity.kind === "contact") return contactsById[entity.id]?.name;
      if (entity.kind === "club") return clubsById[entity.id]?.name;
      if (entity.kind === "rival") return rivalScoutsById[entity.id]?.name;
      return undefined;
    };
    for (const contact of contacts) {
      profiles.set(contact.id, buildContactRelationshipPosition({
        state: { consequenceState, accessAgreements },
        contact,
        now: { week: currentWeek, season: currentSeason },
        scoutId,
        resolveEntityName,
      }));
    }
    return profiles;
  }, [
    contacts,
    contactsById,
    playersById,
    clubsById,
    rivalScoutsById,
    consequenceState,
    accessAgreements,
    currentWeek,
    currentSeason,
    scoutId,
  ]);

  const storyThreadMap = useMemo(() => {
    const map = new Map<string, StoryThread>();
    if (!consequenceState || !accessAgreements || currentWeek == null || currentSeason == null) {
      return map;
    }
    for (const contact of contacts) {
      map.set(contact.id, buildStoryThread({
        state: { consequenceState, accessAgreements },
        stakeholder: { kind: "contact", id: contact.id },
        now: { week: currentWeek, season: currentSeason },
      }));
    }
    return map;
  }, [accessAgreements, consequenceState, contacts, currentSeason, currentWeek]);

  useEffect(() => {
    if (!pendingNetworkContactId) return;
    if (!contactsById?.[pendingNetworkContactId]) {
      setPendingNetworkContactId(null);
      return;
    }

    setSelectedContactId(pendingNetworkContactId);
    setPendingNetworkContactId(null);
    window.requestAnimationFrame(() => {
      const target = contactCardRefs.current[pendingNetworkContactId];
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus();
    });
  }, [contactsById, pendingNetworkContactId, setPendingNetworkContactId]);

  const contactThreadPreviews = useMemo<ContactThreadPreview[]>(() =>
    contacts
      .map((contact) => {
        const position = relationshipPositionMap.get(contact.id);
        const thread = storyThreadMap.get(contact.id);
        if (!position || !thread) return undefined;
        const accessAgreement = activeAccessByContact.get(contact.id);
        const latest = thread.entries[0];
        const hasFreshGossip = (contact.gossipQueue ?? []).some((item) =>
          currentWeek != null && currentSeason != null
            ? isActiveBefore({ season: currentSeason, week: currentWeek }, item.expiresAt)
            : false,
        );
        const urgencyScore = (accessAgreement ? 60 : 0)
          + Math.max(0, position.threatScore)
          + Math.max(0, position.leverageScore * 10)
          + (latest ? 12 : 0)
          + ((contact.betrayalRisk ?? 0) * 100);
        let whyNow = "Maintain this relationship before the line goes cold.";
        if (accessAgreement?.expiresAt) {
          whyNow = `Protected access expires ${formatGameDate(accessAgreement.expiresAt)}.`;
        } else if (position.threatScore >= 45) {
          whyNow = "Pressure is building around this relationship.";
        } else if (position.leverageScore > 0) {
          whyNow = "There is open leverage or reciprocity attached to this line.";
        } else if (latest) {
          whyNow = latest.description;
        } else if (hasFreshGossip) {
          whyNow = "Fresh information is available from this contact.";
        }
        return {
          contact,
          accessAgreement,
          position,
          thread,
          urgencyScore,
          whyNow,
        };
      })
      .filter((preview): preview is ContactThreadPreview => preview !== undefined)
      .sort((left, right) =>
        right.urgencyScore - left.urgencyScore
        || right.thread.entries.length - left.thread.entries.length
        || left.contact.name.localeCompare(right.contact.name),
      ),
  [activeAccessByContact, contacts, currentSeason, currentWeek, relationshipPositionMap, storyThreadMap]);

  if (
    !contactsById
    || !playersById
    || !fixturesById
    || !scheduledActivities
    || currentWeek == null
    || currentSeason == null
  ) {
    return null;
  }

  const currentDate = { season: currentSeason, week: currentWeek };

  const handleScheduleMeeting = (contact: Contact) => {
    if (isContactAccessSuspended(contact, currentDate)) return;
    const activity: Activity = {
      type: "networkMeeting",
      slots: 1,
      targetId: contact.id,
      description: `Meet with ${contact.name}`,
    };
    // Schedule on the first free day
    const firstFree = scheduledActivities.findIndex((activitySlot) => activitySlot === null);
    if (firstFree !== -1) {
      scheduleActivity(activity, firstFree);
      setScheduledId(contact.id);
    }
  };

  const getKnownPlayerNames = (contact: Contact): string[] => {
    return contact.knownPlayerIds
      .map((id) => formatPlayerName(playersById[id]))
      .filter((n): n is string => !!n);
  };

  // Count contacts with active betrayal risk
  const riskyContacts = contacts.filter((c) => (c.betrayalRisk ?? 0) >= 0.15);

  return (
    <GameLayout>
      <div className="relative game-workspace min-h-full">
        <div className="relative z-10">
        <div className="mb-6">
          <p className="dossier-eyebrow mb-2">People &amp; access</p>
          <h1 className="dossier-title mb-2">Your network</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-300">
            <span>
              {contacts.length} contact{contacts.length !== 1 ? "s" : ""} in your network
            </span>
            {riskyContacts.length > 0 && (
              <span className="flex items-center gap-1 text-red-400 text-xs">
                <AlertTriangle size={12} aria-hidden="true" />
                {riskyContacts.length} at risk of betrayal
              </span>
            )}
          </div>
        </div>

        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={40} className="mb-4 text-zinc-700" aria-hidden="true" />
            <p className="text-sm text-zinc-300">Your network is empty.</p>
            <p className="text-xs text-zinc-400 mt-1">
              Attend matches and complete networking activities to build contacts.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <NetworkPressurePanel contacts={contacts} previews={contactThreadPreviews} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Contact list */}
              <div className={selectedContact ? "lg:col-span-2" : "lg:col-span-3"} data-tutorial-id="network-contacts">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-medium">Contacts</h2>
                  <p className="text-sm text-zinc-300">Choose a source to review intelligence or arrange a meeting.</p>
                </div>
                <div className="divide-y divide-[var(--border)] border-y border-[var(--border)] bg-[var(--surface)]">
                  {contacts.map((contact) => {
                    const config = CONTACT_TYPE_CONFIG[contact.type];
                    const Icon = config.icon;
                    const isSelected = selectedContactId === contact.id;
                    const wasScheduled = scheduledId === contact.id;
                    const trust = contact.trustLevel ?? contact.relationship;
                    const bRisk = contact.betrayalRisk ?? 0;
                    const gossipCount = (contact.gossipQueue ?? []).filter(
                      (g) => isActiveBefore(currentDate, g.expiresAt),
                    ).length;
                    const hasExclusive = activeAccessByContact.has(contact.id);
                    const threadPreview = contactThreadPreviews.find((preview) => preview.contact.id === contact.id);
                    const weeksSinceContact = contact.lastInteractionAt
                      ? Math.max(
                          0,
                          gameWeeksBetween(fixturesById, contact.lastInteractionAt, currentDate),
                        )
                      : null;
                    const accessSuspended = isContactAccessSuspended(contact, currentDate);
                    const isDormant = contact.dormant === true && !accessSuspended;
                    const isRelationshipFading = contact.relationship < 30 && !isDormant;

                    return (
                      <button
                        key={contact.id}
                        type="button"
                        ref={(node) => {
                          contactCardRefs.current[contact.id] = node;
                        }}
                        onClick={() => setSelectedContactId(isSelected ? null : contact.id)}
                        aria-pressed={isSelected}
                        aria-label={`View contact: ${contact.name}`}
                        className={`w-full p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] sm:p-5 ${
                          isSelected
                            ? "bg-[var(--surface-selected)] shadow-[inset_3px_0_0_var(--accent)]"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Icon size={16} className={config.color} aria-hidden="true" />
                            <span className="text-lg font-medium leading-snug text-white">{contact.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {bRisk >= 0.15 && (
                              <AlertTriangle
                                size={12}
                                className="text-red-400"
                                aria-label="Betrayal risk"
                              />
                            )}
                            {hasExclusive && (
                              <Lock
                                size={12}
                                className="text-amber-400"
                                aria-label="Exclusive access"
                              />
                            )}
                            <ChevronRight
                              size={14}
                              className={`text-zinc-400 transition ${isSelected ? "rotate-90" : ""}`}
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-zinc-300">
                          <span className="text-zinc-200">{config.label}</span>
                          {threadPreview && (
                            <Badge variant="outline" className={`text-xs capitalize ${relationshipStanceTone(threadPreview.position.stance)}`}>
                              {threadPreview.position.stance.replace(/([a-z])([A-Z])/g, "$1 $2")}
                            </Badge>
                          )}
                          <span>{contact.organization}</span>
                          {contact.region && (
                            <span className="text-zinc-400">· {contact.region}</span>
                          )}
                        </div>
                        {threadPreview && (
                          <p className="mb-3 text-sm leading-relaxed text-zinc-300">
                            {threadPreview.whyNow}
                          </p>
                        )}

                        {threadPreview?.thread.entries[0] && (
                          <p className="mb-3 text-xs leading-relaxed text-zinc-300">
                            <span className={storyEntryTone(threadPreview.thread.entries[0])}>{storyEntryLabel(threadPreview.thread.entries[0])}</span>
                            {" · "}{threadPreview.thread.entries[0].title}
                            {" · S"}{threadPreview.thread.entries[0].season}{" W"}{threadPreview.thread.entries[0].week}
                          </p>
                        )}
                        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                          <div className="flex items-baseline gap-2">
                            <dt className="text-zinc-300">Relationship</dt>
                            <dd className="text-white">{relationshipLabel(contact.relationship)} <span className="ml-1 text-zinc-300">{contact.relationship}/100</span></dd>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <dt className="text-zinc-300">Trust</dt>
                            <dd className="text-white">{trustLabel(trust)} <span className="ml-1 text-zinc-300">{trust}/100</span></dd>
                          </div>
                        </dl>

                        {/* Status indicators */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {isDormant && (
                            <Badge variant="outline" className="text-[10px] border-red-500/40 bg-red-500/10 text-red-400">
                              Dormant
                            </Badge>
                          )}
                          {accessSuspended && (
                            <Badge variant="outline" className="text-[10px] border-red-500/40 bg-red-500/10 text-red-400">
                              Access suspended
                            </Badge>
                          )}
                          {isRelationshipFading && (
                            <Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-400">
                              Fading
                            </Badge>
                          )}
                          {(contactIntelMap.get(contact.id)?.length ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-xs text-cyan-400">
                              <Eye size={11} aria-hidden="true" />
                              {(contactIntelMap.get(contact.id)?.length ?? 0)} intel
                            </span>
                          )}
                          {gossipCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-[var(--signal-focus)]">
                              <MessageCircle size={11} aria-hidden="true" />
                              {gossipCount} gossip
                            </span>
                          )}
                          {wasScheduled && (
                            <span className="text-xs text-emerald-400">Meeting scheduled</span>
                          )}
                          {weeksSinceContact != null && (
                            <span className="flex items-center gap-1 text-[10px] text-zinc-300">
                              <Clock size={10} aria-hidden="true" />
                              {weeksSinceContact === 0
                                ? "This week"
                                : `${weeksSinceContact}w ago`}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detail panel */}
              {selectedContact && (
                <div className="lg:sticky lg:top-6 lg:self-start" data-tutorial-id="network-meet">
                  <ContactDetail
                    contact={selectedContact}
                    accessAgreement={activeAccessByContact.get(selectedContact.id)}
                    position={relationshipPositionMap.get(selectedContact.id)!}
                    identity={stakeholderProfiles?.profiles[`contact:${selectedContact.id}`]}
                    knownPlayerNames={getKnownPlayerNames(selectedContact)}
                    intelEntries={contactIntelMap.get(selectedContact.id) ?? []}
                    currentDate={currentDate}
                    fixtures={fixturesById}
                    onScheduleMeeting={() => handleScheduleMeeting(selectedContact)}
                    onClose={() => setSelectedContactId(null)}
                  />
                </div>
              )}
            </div>

            <section className="dossier-section" data-tutorial-id="network-intel" aria-label="Intelligence from your contacts">
              <GossipFeedPanel contacts={contacts} currentDate={currentDate} />
            </section>
          </div>
        )}
        </div>
      </div>
    </GameLayout>
  );
}
