"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Star } from "lucide-react";
import type { AwardRecord, FinancialRecord } from "@/engine/core/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const AWARD_ICONS: Record<AwardRecord["type"], string> = {
  scoutOfYear: "🏆",
  bestAgency: "🥇",
  discoveryOfYear: "🔭",
};

const AWARD_COLORS: Record<AwardRecord["type"], string> = {
  scoutOfYear: "border-amber-500/30 bg-amber-500/5",
  bestAgency: "border-purple-500/30 bg-purple-500/5",
  discoveryOfYear: "border-blue-500/30 bg-blue-500/5",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface LegacyTabProps {
  awards: AwardRecord[];
  finances: FinancialRecord;
  currentSeason: number;
}

export function LegacyTab({ awards, finances, currentSeason }: LegacyTabProps) {
  const yearsInBusiness = currentSeason;
  const totalRevenue =
    finances.reportSalesRevenue +
    finances.retainerRevenue +
    finances.consultingRevenue +
    finances.bonusRevenue +
    finances.placementFeeRevenue;

  const totalReports =
    finances.employees.reduce((sum, e) => sum + e.reportsGenerated.length, 0);

  const peakEmployeeCount = finances.employees.length; // approximate — would need historical tracking

  return (
    <div className="space-y-4">
      {/* Awards */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy size={14} className="text-zinc-400" aria-hidden="true" />
            Awards
          </CardTitle>
        </CardHeader>
        <CardContent>
          {awards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Star size={32} className="text-zinc-700 mb-3" aria-hidden="true" />
              <p className="text-sm text-zinc-400">No awards yet</p>
              <p className="text-xs text-zinc-600 mt-1 max-w-xs">
                End-of-season industry ceremonies recognise the best agencies. Keep growing your reputation and client satisfaction to be nominated.
              </p>
              <div className="mt-4 space-y-1 text-xs text-zinc-600">
                <p>Scout of the Year — reach reputation 70+</p>
                <p>Best Agency — avg. client satisfaction 70+, 3+ employees</p>
                <p>Discovery of the Year — any elite-tier agency</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {awards.map((award, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${AWARD_COLORS[award.type]}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden="true">{AWARD_ICONS[award.type]}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{award.title}</span>
                        <span className="text-xs text-zinc-500">Season {award.season}</span>
                      </div>
                      <div className="flex gap-3 mt-0.5 text-xs text-zinc-400">
                        <span>+{award.reputationBonus} reputation</span>
                        <span>£{award.cashBonus.toLocaleString()} bonus</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agency stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Star size={14} className="text-zinc-400" aria-hidden="true" />
            Agency Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-800 p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Total Revenue</p>
              <p className="text-base font-bold text-emerald-400">
                £{totalRevenue.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Years Active</p>
              <p className="text-base font-bold text-white">
                {yearsInBusiness}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Reports Generated</p>
              <p className="text-base font-bold text-white">
                {totalReports}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Current Staff</p>
              <p className="text-base font-bold text-white">
                {peakEmployeeCount}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Awards Won</p>
              <p className="text-base font-bold text-amber-400">
                {awards.length}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Active Clients</p>
              <p className="text-base font-bold text-white">
                {finances.clientRelationships.filter((cr) => cr.status === "active").length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
