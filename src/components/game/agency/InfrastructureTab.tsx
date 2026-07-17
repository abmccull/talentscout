"use client";

import { useGameStore } from "@/stores/gameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  calculateInfrastructureEffects,
  buildAgencyModifierLedger,
  getDataSubscriptionCost,
  getDataSubscriptionWeekly,
  getDataSubscriptionBonus,
  getDataSubscriptionSystems,
  getTravelBudgetCost,
  getTravelBudgetWeekly,
  getTravelBudgetFatigue,
  getOfficeEquipmentCost,
  getOfficeEquipmentWeekly,
  getOfficeEquipmentBonus,
} from "@/engine/finance";
import type {
  DataSubscriptionTier,
  TravelBudgetTier,
  OfficeEquipmentTier,
} from "@/engine/core/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(1)}K`;
  return `${sign}£${abs.toLocaleString()}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InfrastructureTab() {
  const gameState = useGameStore((s) => s.gameState);
  const purchaseDataSubscriptionAction = useGameStore((s) => s.purchaseDataSubscriptionAction);
  const upgradeTravelBudgetAction = useGameStore((s) => s.upgradeTravelBudgetAction);
  const upgradeOfficeEquipmentAction = useGameStore((s) => s.upgradeOfficeEquipmentAction);

  if (!gameState?.finances) return null;

  const { finances } = gameState;
  const infrastructure = gameState.scoutingInfrastructure;
  const infraEffects = calculateInfrastructureEffects(infrastructure);
  const assistantScouts = gameState.assistantScouts ?? [];
  const dataSubscriptionSystems = getDataSubscriptionSystems();
  const modifierLedger = buildAgencyModifierLedger({
    scoutingInfrastructure: infrastructure,
    finances,
  });

  return (
    <div className="space-y-6">
      {/* Infrastructure Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-zinc-500 mb-1">Weekly Infrastructure Cost</p>
            <p className="text-lg font-bold text-red-400">{formatCurrency(infraEffects.weeklyCost)}/wk</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-zinc-500 mb-1">Report Quality Bonus</p>
            <p className="text-lg font-bold text-emerald-400">+{(infraEffects.reportQualityBonus * 100).toFixed(0)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-zinc-500 mb-1">Travel Fatigue Reduction</p>
            <p className="text-lg font-bold text-sky-400">{infraEffects.travelFatigueMultiplier < 1 ? `-${((1 - infraEffects.travelFatigueMultiplier) * 100).toFixed(0)}%` : "None"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Modifier Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs leading-5 text-zinc-400">
            One auditable view of what your office, infrastructure, satellite network, and equipped tools currently change.
          </p>
          <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
            <summary className="min-h-8 cursor-pointer select-none py-1 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
              Review {modifierLedger.length} modifier sources
            </summary>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {modifierLedger.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-white">{entry.source}</p>
                      <p className="mt-1 text-[11px] text-zinc-400">{entry.effect}</p>
                    </div>
                    <Badge
                      variant={entry.status === "active" ? "success" : entry.status === "conditional" ? "warning" : "outline"}
                      className="text-[10px] capitalize"
                    >
                      {entry.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-emerald-300">{entry.currentValue}</p>
                  <p className="mt-1 text-[11px] leading-4 text-zinc-400">Formula: {entry.formula}</p>
                  <p className="mt-2 text-[10px] leading-4 text-zinc-500">
                    Affects: {entry.affectedActions.join(" • ")}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Data Subscription */}
      <Card>
        <CardHeader><CardTitle className="text-base">Data Subscription</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-y-1 text-xs text-zinc-400">
            Current: <Badge variant="outline" className="ml-1">{infrastructure?.dataSubscription ?? "none"}</Badge>
            {infrastructure?.dataSubscription && infrastructure.dataSubscription !== "none" && (
              <span className="ml-2 text-emerald-400">+{(getDataSubscriptionBonus(infrastructure.dataSubscription) * 100).toFixed(0)}% data quality</span>
            )}
          </div>
          <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              Live Systems
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-300">
              Data subscriptions now improve:
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {dataSubscriptionSystems.join(" • ")}.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(["basic", "premium", "elite"] as DataSubscriptionTier[]).map((tier) => {
              const current = infrastructure?.dataSubscription ?? "none";
              const tierOrder = ["none", "basic", "premium", "elite"];
              const isOwned = tierOrder.indexOf(current) >= tierOrder.indexOf(tier);
              const cost = getDataSubscriptionCost(tier);
              const weekly = getDataSubscriptionWeekly(tier);
              const bonus = getDataSubscriptionBonus(tier);
              const canBuy = !isOwned && finances.balance >= cost;
              return (
                <div key={tier} className={`rounded-lg border p-3 ${isOwned ? "border-emerald-700 bg-emerald-900/20" : "border-zinc-700"}`}>
                  <p className="text-sm font-medium text-white capitalize">{tier}</p>
                  <p className="text-xs text-zinc-400 mt-1">Cost: {formatCurrency(cost)} + {formatCurrency(weekly)}/wk</p>
                  <p className="text-xs text-emerald-400">+{(bonus * 100).toFixed(0)}% data quality</p>
                  {isOwned ? (
                    <Badge className="mt-2 bg-emerald-800 text-emerald-200 text-[10px]">Active</Badge>
                  ) : (
                    <Button
                      size="sm"
                      className="mt-2 w-full text-xs"
                      disabled={!canBuy}
                      onClick={() => purchaseDataSubscriptionAction(tier)}
                    >
                      {canBuy ? "Upgrade" : "Cannot Afford"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Travel Budget */}
      <Card>
        <CardHeader><CardTitle className="text-base">Travel Budget</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-y-1 text-xs text-zinc-400">
            Current: <Badge variant="outline" className="ml-1">{infrastructure?.travelBudget ?? "economy"}</Badge>
            {infrastructure?.travelBudget && infrastructure.travelBudget !== "economy" && (
              <span className="ml-2 text-sky-400">{((1 - getTravelBudgetFatigue(infrastructure.travelBudget)) * 100).toFixed(0)}% less travel fatigue</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(["standard", "business"] as TravelBudgetTier[]).map((tier) => {
              const current = infrastructure?.travelBudget ?? "economy";
              const tierOrder = ["economy", "standard", "business"];
              const isOwned = tierOrder.indexOf(current) >= tierOrder.indexOf(tier);
              const cost = getTravelBudgetCost(tier);
              const weekly = getTravelBudgetWeekly(tier);
              const fatigue = getTravelBudgetFatigue(tier);
              const canBuy = !isOwned && finances.balance >= cost;
              return (
                <div key={tier} className={`rounded-lg border p-3 ${isOwned ? "border-sky-700 bg-sky-900/20" : "border-zinc-700"}`}>
                  <p className="text-sm font-medium text-white capitalize">{tier}</p>
                  <p className="text-xs text-zinc-400 mt-1">Cost: {formatCurrency(cost)} + {formatCurrency(weekly)}/wk</p>
                  <p className="text-xs text-sky-400">Fatigue: {(fatigue * 100).toFixed(0)}% of normal</p>
                  {isOwned ? (
                    <Badge className="mt-2 bg-sky-800 text-sky-200 text-[10px]">Active</Badge>
                  ) : (
                    <Button
                      size="sm"
                      className="mt-2 w-full text-xs"
                      disabled={!canBuy}
                      onClick={() => upgradeTravelBudgetAction(tier)}
                    >
                      {canBuy ? "Upgrade" : "Cannot Afford"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Office Equipment */}
      <Card>
        <CardHeader><CardTitle className="text-base">Office Equipment</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-y-1 text-xs text-zinc-400">
            Current: <Badge variant="outline" className="ml-1">{infrastructure?.officeEquipment ?? "basic"}</Badge>
            {infrastructure?.officeEquipment && infrastructure.officeEquipment !== "basic" && (
              <span className="ml-2 text-amber-400">+{(getOfficeEquipmentBonus(infrastructure.officeEquipment) * 100).toFixed(0)}% report quality</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(["upgraded", "professional"] as OfficeEquipmentTier[]).map((tier) => {
              const current = infrastructure?.officeEquipment ?? "basic";
              const tierOrder = ["basic", "upgraded", "professional"];
              const isOwned = tierOrder.indexOf(current) >= tierOrder.indexOf(tier);
              const cost = getOfficeEquipmentCost(tier);
              const weekly = getOfficeEquipmentWeekly(tier);
              const bonus = getOfficeEquipmentBonus(tier);
              const canBuy = !isOwned && finances.balance >= cost;
              return (
                <div key={tier} className={`rounded-lg border p-3 ${isOwned ? "border-amber-700 bg-amber-900/20" : "border-zinc-700"}`}>
                  <p className="text-sm font-medium text-white capitalize">{tier}</p>
                  <p className="text-xs text-zinc-400 mt-1">Cost: {formatCurrency(cost)} + {formatCurrency(weekly)}/wk</p>
                  <p className="text-xs text-amber-400">+{(bonus * 100).toFixed(0)}% report quality</p>
                  {isOwned ? (
                    <Badge className="mt-2 bg-amber-800 text-amber-200 text-[10px]">Active</Badge>
                  ) : (
                    <Button
                      size="sm"
                      className="mt-2 w-full text-xs"
                      disabled={!canBuy}
                      onClick={() => upgradeOfficeEquipmentAction(tier)}
                    >
                      {canBuy ? "Upgrade" : "Cannot Afford"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ROI Summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Investment ROI</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Total one-time invested</span>
            <span className="text-white font-semibold">{formatCurrency(infrastructure?.investmentCosts.oneTime ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Weekly maintenance</span>
            <span className="text-red-400 font-semibold">{formatCurrency(infraEffects.weeklyCost)}/wk</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Assistant scout salaries</span>
            <span className="text-red-400 font-semibold">{formatCurrency(assistantScouts.reduce((s: number, a: { salary: number }) => s + a.salary, 0))}/wk</span>
          </div>
          <div className="border-t border-zinc-800 pt-2 flex items-center justify-between text-xs">
            <span className="text-zinc-400">Total weekly cost</span>
            <span className="text-red-400 font-bold">{formatCurrency(infraEffects.weeklyCost + assistantScouts.reduce((s: number, a: { salary: number }) => s + a.salary, 0))}/wk</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
