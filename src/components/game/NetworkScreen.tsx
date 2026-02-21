"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, UserCheck, Newspaper, GraduationCap, Eye, ChevronRight, X } from "lucide-react";
import type { Contact, ContactType, Activity } from "@/engine/core/types";

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

interface ContactDetailProps {
  contact: Contact;
  knownPlayerNames: string[];
  onScheduleMeeting: () => void;
  onClose: () => void;
}

function ContactDetail({ contact, knownPlayerNames, onScheduleMeeting, onClose }: ContactDetailProps) {
  const config = CONTACT_TYPE_CONFIG[contact.type];
  const Icon = config.icon;

  return (
    <Card className="border-emerald-500/20">
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
        </div>

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

        {/* Reliability */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Intel Reliability</span>
            <span className="text-white font-medium">
              {Math.round(contact.reliability * 100)}%
            </span>
          </div>
          <Progress
            value={contact.reliability * 100}
            max={100}
            indicatorClassName="bg-purple-500"
          />
        </div>

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

        <Button size="sm" className="w-full" onClick={onScheduleMeeting}>
          Schedule Meeting
        </Button>
      </CardContent>
    </Card>
  );
}

export function NetworkScreen() {
  const { gameState, scheduleActivity, getPlayer } = useGameStore();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [scheduledId, setScheduledId] = useState<string | null>(null);

  if (!gameState) return null;

  const contacts = Object.values(gameState.contacts);

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

  return (
    <GameLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Network</h1>
          <p className="text-sm text-zinc-400">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""} in your network
          </p>
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Contact list */}
            <div className={selectedContact ? "lg:col-span-2" : "lg:col-span-3"}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {contacts.map((contact) => {
                  const config = CONTACT_TYPE_CONFIG[contact.type];
                  const Icon = config.icon;
                  const isSelected = selectedContact?.id === contact.id;
                  const wasScheduled = scheduledId === contact.id;
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
                        <ChevronRight
                          size={14}
                          className={`text-zinc-600 transition ${isSelected ? "rotate-90" : ""}`}
                          aria-hidden="true"
                        />
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
                      <div>
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
                      {wasScheduled && (
                        <p className="mt-2 text-xs text-emerald-400">Meeting scheduled</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detail panel */}
            {selectedContact && (
              <div>
                <ContactDetail
                  contact={selectedContact}
                  knownPlayerNames={getKnownPlayerNames(selectedContact)}
                  onScheduleMeeting={() => handleScheduleMeeting(selectedContact)}
                  onClose={() => setSelectedContact(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </GameLayout>
  );
}
