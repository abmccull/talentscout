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
    unlockedTools: gameState.unlockedTools,
  });

  return (
    <div className="space-y-6">
      <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-300">
        <span>Available funds <strong className="ml-2 font-semibold text-white">{formatCurrency(finances.balance)}</strong></span>
        <span className="text-xs text-zinc-400">Each upgrade shows its price and weekly upkeep.</span>
      </p>

      {/* Data Subscription */}
      <Card>
        <CardHeader><CardTitle className="text-base">Data Subscription</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-y-1 text-xs text-zinc-400">
            Current: <Badge variant="outline" className="ml-1">{infrastructure?.dataSubscription ?? "none"}</Badge>
            {infrastructure?.dataSubscription && infrastructure.dataSubscription !== "none" && (
              <span className="ml-2 text-[var(--accent)]">+{(getDataSubscriptionBonus(infrastructure.dataSubscription) * 100).toFixed(0)}% data quality</span>
            )}
          </div>
          <details className="text-xs text-zinc-400">
            <summary className="min-h-8 cursor-pointer py-1.5">Where data quality applies</summary>
            <p className="mt-1 leading-5">{dataSubscriptionSystems.join(" • ")}.</p>
          </details>
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
                <div key={tier} className={`rounded-lg border p-3 ${isOwned ? "border-[var(--accent)]/40 bg-white/[0.03]" : "border-zinc-700"}`}>
                  <p className="text-sm font-medium text-white capitalize">{tier}</p>
                  <p className="text-sm text-zinc-300 mt-2">{formatCurrency(cost)} upfront · {formatCurrency(weekly)}/week</p>
                  <p className="text-xs text-[var(--accent)]">+{(bonus * 100).toFixed(0)}% data quality</p>
                  {isOwned ? (
                    <Badge className="mt-2 bg-white/10 text-zinc-200 text-[10px]">{current === tier ? "Current" : "Included"}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant={tierOrder.indexOf(tier) === tierOrder.indexOf(current) + 1 ? "default" : "outline"}
                      className="mt-3 w-full text-xs"
                      disabled={!canBuy}
                      onClick={() => purchaseDataSubscriptionAction(tier)}
                    >
                      {canBuy ? `Upgrade to ${tier}` : `Need ${formatCurrency(cost - finances.balance)} more`}
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
              <span className="ml-2 text-[var(--accent)]">{((1 - getTravelBudgetFatigue(infrastructure.travelBudget)) * 100).toFixed(0)}% less travel fatigue</span>
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
                <div key={tier} className={`rounded-lg border p-3 ${isOwned ? "border-[var(--accent)]/40 bg-white/[0.03]" : "border-zinc-700"}`}>
                  <p className="text-sm font-medium text-white capitalize">{tier}</p>
                  <p className="text-sm text-zinc-300 mt-2">{formatCurrency(cost)} upfront · {formatCurrency(weekly)}/week</p>
                  <p className="text-xs text-[var(--accent)]">Fatigue: {(fatigue * 100).toFixed(0)}% of normal</p>
                  {isOwned ? (
                    <Badge className="mt-2 bg-white/10 text-zinc-200 text-[10px]">{current === tier ? "Current" : "Included"}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant={tierOrder.indexOf(tier) === tierOrder.indexOf(current) + 1 ? "default" : "outline"}
                      className="mt-3 w-full text-xs"
                      disabled={!canBuy}
                      onClick={() => upgradeTravelBudgetAction(tier)}
                    >
                      {canBuy ? `Upgrade to ${tier}` : `Need ${formatCurrency(cost - finances.balance)} more`}
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
              <span className="ml-2 text-[var(--accent)]">+{(getOfficeEquipmentBonus(infrastructure.officeEquipment) * 100).toFixed(0)}% report quality</span>
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
                <div key={tier} className={`rounded-lg border p-3 ${isOwned ? "border-[var(--accent)]/40 bg-white/[0.03]" : "border-zinc-700"}`}>
                  <p className="text-sm font-medium text-white capitalize">{tier}</p>
                  <p className="text-sm text-zinc-300 mt-2">{formatCurrency(cost)} upfront · {formatCurrency(weekly)}/week</p>
                  <p className="text-xs text-[var(--accent)]">+{(bonus * 100).toFixed(0)}% report quality</p>
                  {isOwned ? (
                    <Badge className="mt-2 bg-white/10 text-zinc-200 text-[10px]">{current === tier ? "Current" : "Included"}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant={tierOrder.indexOf(tier) === tierOrder.indexOf(current) + 1 ? "default" : "outline"}
                      className="mt-3 w-full text-xs"
                      disabled={!canBuy}
                      onClick={() => upgradeOfficeEquipmentAction(tier)}
                    >
                      {canBuy ? `Upgrade to ${tier}` : `Need ${formatCurrency(cost - finances.balance)} more`}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <details className="dossier-section">
            <summary className="min-h-11 cursor-pointer select-none py-2 text-sm font-semibold text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
              How your equipment and infrastructure apply · {modifierLedger.length} sources
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
                  <p className="mt-1 text-[11px] leading-4 text-zinc-400">How it applies: {entry.formula}</p>
                  <p className="mt-2 text-[10px] leading-4 text-zinc-500">
                    Affects: {entry.affectedActions.join(" • ")}
                  </p>
                </div>
              ))}
            </div>
          </details>

      <details className="dossier-section">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-zinc-300">Investment and upkeep</summary>
        <div className="mt-3 max-w-2xl space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Total one-time invested</span>
            <span className="text-white font-semibold">{formatCurrency(infrastructure?.investmentCosts.oneTime ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Weekly maintenance</span>
            <span className="text-zinc-300 font-semibold">{formatCurrency(infraEffects.weeklyCost)}/wk</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Assistant scout salaries</span>
            <span className="text-zinc-300 font-semibold">{formatCurrency(assistantScouts.reduce((s: number, a: { salary: number }) => s + a.salary, 0))}/wk</span>
          </div>
          <div className="border-t border-zinc-800 pt-2 flex items-center justify-between text-xs">
            <span className="text-zinc-400">Total weekly cost</span>
            <span className="text-zinc-300 font-bold">{formatCurrency(infraEffects.weeklyCost + assistantScouts.reduce((s: number, a: { salary: number }) => s + a.salary, 0))}/wk</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Travel fatigue reduction</span>
            <span className="text-zinc-300">{infraEffects.travelFatigueMultiplier < 1 ? `${((1 - infraEffects.travelFatigueMultiplier) * 100).toFixed(0)}%` : "None"}</span>
          </div>
        </div>
      </details>
    </div>
  );
}
