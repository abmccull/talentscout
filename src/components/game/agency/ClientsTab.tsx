"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Send } from "lucide-react";
import type { ClientRelationship, Club } from "@/engine/core/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type PitchType = "coldCall" | "referral" | "showcase";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ClientRelationship["status"], string> = {
  prospect: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  cooling: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  lost: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_LABELS: Record<ClientRelationship["status"], string> = {
  prospect: "Prospect",
  active: "Active",
  cooling: "Cooling",
  lost: "Lost",
};

const PITCH_OPTIONS: Array<{ value: PitchType; label: string; desc: string; rate: string }> = [
  { value: "coldCall", label: "Cold Call", desc: "Reach out to a club with no prior relationship.", rate: "~12% base" },
  { value: "referral", label: "Referral", desc: "Leverage your network — someone vouches for you.", rate: "~35% base" },
  { value: "showcase", label: "Showcase", desc: "Present your best reports as proof of quality.", rate: "~25% base" },
];

function getSatisfactionColor(sat: number): string {
  if (sat >= 70) return "bg-emerald-500";
  if (sat >= 40) return "bg-amber-500";
  return "bg-red-500";
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ClientsTabProps {
  clientRelationships: ClientRelationship[];
  clubs: Record<string, Club>;
}

export function ClientsTab({ clientRelationships, clubs }: ClientsTabProps) {
  const pitchToClient = useGameStore((s) => s.pitchToClient);

  const [pitchClubId, setPitchClubId] = useState<string>("");
  const [pitchType, setPitchType] = useState<PitchType>("coldCall");
  const [lastPitchResult, setLastPitchResult] = useState<string | null>(null);

  // Clubs that are not already in a client relationship
  const existingClubIds = new Set(clientRelationships.map((cr) => cr.clubId));
  const availableClubs = Object.values(clubs).filter((c) => !existingClubIds.has(c.id));

  function handlePitch() {
    if (!pitchClubId) return;
    pitchToClient(pitchClubId, pitchType);
    const club = clubs[pitchClubId];
    setLastPitchResult(
      `Pitch sent to ${club?.name ?? pitchClubId}. Check your inbox for retainer offers.`,
    );
    setPitchClubId("");
  }

  const activeClients = clientRelationships.filter((cr) => cr.status !== "lost");
  const lostClients = clientRelationships.filter((cr) => cr.status === "lost");

  return (
    <div className="space-y-4">
      {/* Client list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users size={14} className="text-zinc-400" aria-hidden="true" />
            Client Relationships
          </CardTitle>
        </CardHeader>
        <CardContent>
          {clientRelationships.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-6">
              No client relationships yet. Use the pitch panel below to reach out to clubs.
            </p>
          ) : (
            <div className="space-y-2">
              {activeClients.map((cr) => {
                const club = clubs[cr.clubId];
                return (
                  <div key={cr.clubId} className="rounded-lg border border-zinc-800 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-medium text-white">
                          {club?.name ?? cr.clubId}
                        </span>
                        {club?.shortName && (
                          <span className="ml-1.5 text-xs text-zinc-600">{club.shortName}</span>
                        )}
                      </div>
                      <Badge className={`text-[10px] ${STATUS_COLORS[cr.status]}`}>
                        {STATUS_LABELS[cr.status]}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-600">
                        <span>Satisfaction</span>
                        <span>{cr.satisfaction}/100</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className={`h-full rounded-full transition-all ${getSatisfactionColor(cr.satisfaction)}`}
                          style={{ width: `${cr.satisfaction}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-zinc-500">
                      <span>Revenue: <span className="text-zinc-300">£{cr.totalRevenue.toLocaleString()}</span></span>
                      <span>Reports: <span className="text-zinc-300">{cr.totalReportsDelivered}</span></span>
                      <span>Tenure: <span className="text-zinc-300">{cr.tenureWeeks}w</span></span>
                    </div>
                  </div>
                );
              })}
              {lostClients.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400">
                    {lostClients.length} lost client{lostClients.length > 1 ? "s" : ""}
                  </summary>
                  <div className="mt-2 space-y-2">
                    {lostClients.map((cr) => {
                      const club = clubs[cr.clubId];
                      return (
                        <div key={cr.clubId} className="rounded-lg border border-zinc-800/50 p-3 opacity-60">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400">{club?.name ?? cr.clubId}</span>
                            <Badge className={`text-[10px] ${STATUS_COLORS["lost"]}`}>Lost</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pitch panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send size={14} className="text-zinc-400" aria-hidden="true" />
            Pitch to a Club
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lastPitchResult && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-400">
              {lastPitchResult}
            </div>
          )}

          {availableClubs.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">
              All clubs are already in your client list.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="pitch-club" className="block text-xs text-zinc-400 mb-1">
                  Select Club
                </label>
                <select
                  id="pitch-club"
                  value={pitchClubId}
                  onChange={(e) => setPitchClubId(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">— Choose a club —</option>
                  {availableClubs.map((club) => (
                    <option key={club.id} value={club.id}>
                      {club.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-xs text-zinc-400 mb-1">Pitch Type</p>
                <div className="space-y-1.5">
                  {PITCH_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-2.5 cursor-pointer rounded-lg border p-2.5 transition ${
                        pitchType === opt.value
                          ? "border-emerald-600/50 bg-emerald-950/20"
                          : "border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="pitchType"
                        value={opt.value}
                        checked={pitchType === opt.value}
                        onChange={() => setPitchType(opt.value)}
                        className="mt-0.5 accent-emerald-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-200">{opt.label}</span>
                          <span className="text-[10px] text-zinc-500">{opt.rate}</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <Button
                size="sm"
                onClick={handlePitch}
                disabled={!pitchClubId}
                className="w-full"
              >
                Make Pitch
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
