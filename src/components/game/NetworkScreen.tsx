"use client";

import { useMemo, useState } from "react";
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
import type { Contact, ContactType, Activity, HiddenIntel, GossipItem } from "@/engine/core/types";
import { getHiddenAttributeIntel, getContactSpecializationBonus } from "@/engine/network/contacts";
import { RNG } from "@/engine/rng";
import { ScreenBackground } from "@/components/ui/screen-background";

const CONTACT_TYPE_CONFIG: Record<
  ContactType,
  { label: string; icon: React.ElementType; color: string }
> = {
  agent: { label: "Agent", icon: UserCheck, color: "text-blue-400" },
  scout: { label: "Scout", icon: Eye, color: "text-emerald-400" },
  clubStaff: { label: "Club Staff", icon: Users, color: "text-purple-400" },
  journalist: { label: "Journalist", icon: Newspaper, color: "text-amber-400" },
  academyCoach: { label: "Academy Coach", icon: GraduationCap, color: "text-pink-400" },
  sportingDirector: { label: "Sporting Director", icon: Users, color: "text-indigo-400" },
  grassrootsOrganizer: { label: "Grassroots Organizer", icon: Users, color: "text-green-400" },
  schoolCoach: { label: "School Coach", icon: GraduationCap, color: "text-lime-400" },
  youthAgent: { label: "Youth Agent", icon: UserCheck, color: "text-cyan-400" },
  academyDirector: { label: "Academy Director", icon: GraduationCap, color: "text-rose-400" },
  localScout: { label: "Local Scout", icon: Eye, color: "text-teal-400" },
};

/** Color classes for specialization bonus badges. */
const SPECIALIZATION_BADGE_COLORS: Partial<Record<ContactType, string>> = {
  agent: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  clubStaff: "bg-purple-500/20 text-purple-300 border-purple-500/30",
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
  if (risk >= 0.15) return { label: "Moderate Risk", color: "text-amber-400" };
  if (risk >= 0.05) return { label: "Low Risk", color: "text-zinc-400" };
  return { label: "Safe", color: "text-emerald-400" };
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
  knownPlayerNames: string[];
  intelEntries: IntelEntry[];
  currentWeek: number;
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

function ContactDetail({ contact, knownPlayerNames, intelEntries, currentWeek, onScheduleMeeting, onClose }: ContactDetailProps) {
  const config = CONTACT_TYPE_CONFIG[contact.type];
  const Icon = config.icon;
  const trustLevel = contact.trustLevel ?? contact.relationship;
  const betrayalRisk = contact.betrayalRisk ?? 0;
  const gossipQueue = contact.gossipQueue ?? [];
  const activeGossip = gossipQueue.filter((g) => g.expiresWeek > currentWeek);
  const referralCount = (contact.referralNetwork ?? []).length;
  const exclusiveWindow = contact.exclusiveWindow;
  const risk = betrayalRiskLabel(betrayalRisk);
  const weeksSinceContact = contact.lastInteractionWeek != null
    ? currentWeek - contact.lastInteractionWeek
    : null;
  const isDormant = contact.dormant === true;
  const isRelationshipFading = contact.relationship < 30 && !isDormant;

  return (
    <Card className={isDormant ? "border-red-500/20" : "border-emerald-500/20"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Icon size={16} className={config.color} aria-hidden="true" />
            {contact.name}
          </CardTitle>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition rounded p-1"
            aria-label="Close contact detail"
          >
            <X size={14} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-zinc-500">Type: </span>
            <span className="text-white">{config.label}</span>
          </div>
          <div>
            <span className="text-zinc-500">Organisation: </span>
            <span className="text-white">{contact.organization}</span>
          </div>
          {contact.region && (
            <div>
              <span className="text-zinc-500">Region: </span>
              <span className="text-white">{contact.region}</span>
            </div>
          )}
          {weeksSinceContact != null && (
            <div>
              <span className="text-zinc-500">Last contact: </span>
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
            <p className="mt-1 text-[10px] text-zinc-500">
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
            <p className="mt-1 text-[10px] text-zinc-500">
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
              <span className="text-xs text-zinc-400">{bonus.description}</span>
            </div>
          );
        })()}

        {/* Relationship */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Relationship</span>
            <span className="text-white font-medium">{relationshipLabel(contact.relationship)}</span>
          </div>
          <Progress
            value={contact.relationship}
            max={100}
            indicatorClassName={relationshipColor(contact.relationship)}
          />
          <p className="mt-1 text-xs text-zinc-500">{contact.relationship}/100</p>
        </div>

        {/* F3: Trust Level */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-500 flex items-center gap-1">
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
          <p className="mt-1 text-xs text-zinc-500">{trustLevel}/100</p>
        </div>

        {/* Reliability */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Intel Reliability</span>
            <span className="text-white font-medium">
              {contact.reliability}%
            </span>
          </div>
          <Progress
            value={contact.reliability}
            max={100}
            indicatorClassName="bg-purple-500"
          />
        </div>

        {/* F3: Betrayal Risk Warning */}
        {betrayalRisk >= 0.05 && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle size={12} className="text-red-400" aria-hidden="true" />
              <span className={`font-medium ${risk.color}`}>
                Betrayal: {risk.label}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              This contact may leak information to rivals. Maintain trust to reduce risk.
            </p>
          </div>
        )}

        {/* F3: Exclusive Window */}
        {exclusiveWindow && exclusiveWindow.expiresWeek > currentWeek && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <Lock size={12} className="text-amber-400" aria-hidden="true" />
              <span className="font-medium text-amber-400">
                Exclusive Access
              </span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-400">
              Early access to a prospect expires in week {exclusiveWindow.expiresWeek}.
            </p>
          </div>
        )}

        {/* F3: Gossip Feed */}
        {activeGossip.length > 0 && (
          <div>
            <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-semibold flex items-center gap-1">
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
                    <span className="text-[10px] text-zinc-600">
                      Expires wk {item.expiresWeek}
                    </span>
                  </div>
                  <p className="text-zinc-400 leading-relaxed">{item.content}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-[10px] text-zinc-600">Reliability:</span>
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
            <span className="text-zinc-500">
              Introduced {referralCount} contact{referralCount !== 1 ? "s" : ""} to your network
            </span>
          </div>
        )}

        {/* Known players */}
        {knownPlayerNames.length > 0 && (
          <div>
            <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-semibold">
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
            <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-semibold flex items-center gap-1">
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
                  <p className="text-zinc-400 leading-relaxed">{entry.intel.hint}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button size="sm" className="w-full" onClick={onScheduleMeeting}>
          Schedule Meeting
        </Button>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Gossip Feed Panel — displays all active gossip across all contacts
// =============================================================================

function GossipFeedPanel({ contacts, currentWeek }: { contacts: Contact[]; currentWeek: number }) {
  const allGossip = useMemo(() => {
    const items: Array<{ contact: Contact; gossip: GossipItem }> = [];
    for (const contact of contacts) {
      for (const g of contact.gossipQueue ?? []) {
        if (g.expiresWeek > currentWeek) {
          items.push({ contact, gossip: g });
        }
      }
    }
    // Sort by most recent first
    items.sort((a, b) => b.gossip.revealedWeek - a.gossip.revealedWeek);
    return items;
  }, [contacts, currentWeek]);

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
                  <span className="text-zinc-600">via {contact.name}</span>
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">
                  Wk {gossip.revealedWeek}
                </span>
              </div>
              <p className="text-zinc-400 leading-relaxed">{gossip.content}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main NetworkScreen
// =============================================================================

export function NetworkScreen() {
  const { gameState, scheduleActivity, getPlayer } = useGameStore();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [scheduledId, setScheduledId] = useState<string | null>(null);

  // Pre-compute intel for all contacts using stable per-contact RNG seeds.
  // Memoised so it only re-runs when gameState changes.
  const contactIntelMap = useMemo<Map<string, IntelEntry[]>>(() => {
    const map = new Map<string, IntelEntry[]>();
    if (!gameState) return map;

    for (const contact of Object.values(gameState.contacts)) {
      if (contact.relationship < 35 || contact.knownPlayerIds.length === 0) {
        map.set(contact.id, []);
        continue;
      }
      const rng = new RNG(`intel-${contact.id}`);
      const entries: IntelEntry[] = [];
      for (const playerId of contact.knownPlayerIds) {
        const player = getPlayer(playerId);
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
  }, [gameState, getPlayer]);

  if (!gameState) return null;

  const contacts = Object.values(gameState.contacts);
  const currentWeek = gameState.currentWeek;

  const handleScheduleMeeting = (contact: Contact) => {
    const activity: Activity = {
      type: "networkMeeting",
      slots: 1,
      targetId: contact.id,
      description: `Meet with ${contact.name}`,
    };
    // Schedule on the first free day
    const activities = gameState.schedule.activities;
    const firstFree = activities.findIndex((a) => a === null);
    if (firstFree !== -1) {
      scheduleActivity(activity, firstFree);
      setScheduledId(contact.id);
    }
  };

  const getKnownPlayerNames = (contact: Contact): string[] => {
    return contact.knownPlayerIds
      .map((id) => {
        const p = getPlayer(id);
        return p ? `${p.firstName} ${p.lastName}` : null;
      })
      .filter((n): n is string => !!n);
  };

  // Count contacts with active betrayal risk
  const riskyContacts = contacts.filter((c) => (c.betrayalRisk ?? 0) >= 0.15);

  return (
    <GameLayout>
      <div className="relative p-6">
        <ScreenBackground src="/images/backgrounds/network-lounge.png" opacity={0.82} />
        <div className="relative z-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Network</h1>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
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
            <p className="text-sm text-zinc-500">Your network is empty.</p>
            <p className="text-xs text-zinc-600 mt-1">
              Attend matches and complete networking activities to build contacts.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Gossip Feed — full-width intelligence summary */}
            <div data-tutorial-id="network-intel">
              <GossipFeedPanel contacts={contacts} currentWeek={currentWeek} />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Contact list */}
              <div className={selectedContact ? "lg:col-span-2" : "lg:col-span-3"} data-tutorial-id="network-contacts">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {contacts.map((contact) => {
                    const config = CONTACT_TYPE_CONFIG[contact.type];
                    const Icon = config.icon;
                    const isSelected = selectedContact?.id === contact.id;
                    const wasScheduled = scheduledId === contact.id;
                    const trust = contact.trustLevel ?? contact.relationship;
                    const bRisk = contact.betrayalRisk ?? 0;
                    const gossipCount = (contact.gossipQueue ?? []).filter(
                      (g) => g.expiresWeek > currentWeek,
                    ).length;
                    const hasExclusive =
                      contact.exclusiveWindow &&
                      contact.exclusiveWindow.expiresWeek > currentWeek;
                    const weeksSinceContact = contact.lastInteractionWeek != null
                      ? currentWeek - contact.lastInteractionWeek
                      : null;
                    const isDormant = contact.dormant === true;
                    const isRelationshipFading = contact.relationship < 30 && !isDormant;

                    return (
                      <button
                        key={contact.id}
                        onClick={() => setSelectedContact(isSelected ? null : contact)}
                        aria-pressed={isSelected}
                        aria-label={`View contact: ${contact.name}`}
                        className={`rounded-lg border p-4 text-left transition ${
                          isSelected
                            ? "border-emerald-500/50 bg-emerald-500/5"
                            : "border-[#27272a] bg-[#141414] hover:border-zinc-600"
                        }`}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon size={16} className={config.color} aria-hidden="true" />
                            <span className="font-medium text-white">{contact.name}</span>
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
                              className={`text-zinc-600 transition ${isSelected ? "rotate-90" : ""}`}
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                        <div className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
                          <Badge variant="outline" className="text-[10px]">
                            {config.label}
                          </Badge>
                          <span>{contact.organization}</span>
                          {contact.region && (
                            <span className="text-zinc-600">· {contact.region}</span>
                          )}
                        </div>

                        {/* Relationship bar */}
                        <div className="mb-2">
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-zinc-500">Relationship</span>
                            <span className="text-white">{contact.relationship}/100</span>
                          </div>
                          <Progress
                            value={contact.relationship}
                            max={100}
                            className="h-1.5"
                            indicatorClassName={relationshipColor(contact.relationship)}
                          />
                        </div>

                        {/* Trust bar */}
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-zinc-500 flex items-center gap-1">
                              <Shield size={9} aria-hidden="true" />
                              Trust
                            </span>
                            <span className="text-white">{trust}/100</span>
                          </div>
                          <Progress
                            value={trust}
                            max={100}
                            className="h-1.5"
                            indicatorClassName={trustColor(trust)}
                          />
                        </div>

                        {/* Status indicators */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {isDormant && (
                            <Badge variant="outline" className="text-[10px] border-red-500/40 bg-red-500/10 text-red-400">
                              Dormant
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
                              Intel
                            </span>
                          )}
                          {gossipCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-purple-400">
                              <MessageCircle size={11} aria-hidden="true" />
                              {gossipCount} gossip
                            </span>
                          )}
                          {wasScheduled && (
                            <span className="text-xs text-emerald-400">Meeting scheduled</span>
                          )}
                          {weeksSinceContact != null && (
                            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
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
                <div data-tutorial-id="network-meet">
                  <ContactDetail
                    contact={selectedContact}
                    knownPlayerNames={getKnownPlayerNames(selectedContact)}
                    intelEntries={contactIntelMap.get(selectedContact.id) ?? []}
                    currentWeek={currentWeek}
                    onScheduleMeeting={() => handleScheduleMeeting(selectedContact)}
                    onClose={() => setSelectedContact(null)}
                  />
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </GameLayout>
  );
}
