"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, ShoppingCart, ArrowLeftRight, Trash2 } from "lucide-react";
import {
  getItemsForSlot,
  getEquipmentItem,
  getEquipmentMonthlyTotal,
} from "@/engine/finance";
import type { EquipmentSlot, EquipmentItemDefinition } from "@/engine/finance";

interface Props {
  slot: EquipmentSlot;
  onClose: () => void;
}

const SLOT_LABELS: Record<EquipmentSlot, string> = {
  notebook: "Field Notebook",
  video: "Video Analysis",
  travel: "Travel Gear",
  network: "Networking Tools",
  analysis: "Analysis Software",
};

function getTierBadgeClass(tier: number, isSpec: boolean): string {
  if (isSpec) return "bg-purple-900/50 text-purple-300 border-purple-700/50";
  switch (tier) {
    case 2: return "bg-blue-900/50 text-blue-300 border-blue-700/50";
    case 3: return "bg-amber-900/50 text-amber-300 border-amber-700/50";
    case 4: return "bg-emerald-900/50 text-emerald-300 border-emerald-700/50";
    default: return "bg-zinc-800 text-zinc-400 border-zinc-700";
  }
}

function formatEffectLine(type: string, value: number): string {
  const percentTypes = [
    "observationConfidence", "videoConfidence", "dataAccuracy", "reportQuality",
    "travelCostReduction", "relationshipGainBonus", "intelReliabilityBonus",
    "youthDiscoveryBonus", "gutFeelingBonus", "paEstimateAccuracy",
    "systemFitAccuracy", "anomalyDetectionRate", "predictionAccuracy", "valuationAccuracy",
  ];
  const label = type.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  if (percentTypes.includes(type)) return `+${Math.round(value * 100)}% ${label}`;
  if (type === "fatigueReduction") return `-${value} fatigue`;
  if (type === "attributesPerSession") return `+${value} attributes per session`;
  if (type === "familiarityGainBonus") return `+${value} familiarity gain`;
  if (type === "travelSlotReduction") return `-${value} travel slot cost`;
  return `+${value} ${label}`;
}

export function EquipmentSlotBrowser({ slot, onClose }: Props) {
  const gameState = useGameStore((s) => s.gameState);
  const purchaseEquipItem = useGameStore((s) => s.purchaseEquipItem);
  const sellEquipItem = useGameStore((s) => s.sellEquipItem);
  const equipEquipItem = useGameStore((s) => s.equipEquipItem);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!gameState?.finances?.equipment) return null;

  const { equipment } = gameState.finances;
  const currentItemId = equipment.loadout[slot];
  const specialization = gameState.scout.primarySpecialization;
  const items = getItemsForSlot(slot, specialization);
  const balance = gameState.finances.balance;
  const currentMonthly = getEquipmentMonthlyTotal(equipment.loadout);

  const selectedItem = selectedId ? getEquipmentItem(selectedId) : null;
  const currentItem = getEquipmentItem(currentItemId);

  // Calculate monthly delta when selecting a new item
  const monthlyDelta = selectedItem && currentItem
    ? selectedItem.monthlyCost - currentItem.monthlyCost
    : 0;

  return (
    <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-white">
          {SLOT_LABELS[slot]}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={onClose}
          aria-label="Close browser"
        >
          <X size={14} />
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const isEquipped = item.id === currentItemId;
          const isOwned = equipment.ownedItems.includes(item.id);
          const isSelected = item.id === selectedId;
          const canAfford = balance >= item.purchaseCost;
          const isSpec = !!item.specialization;
          const tierClass = getTierBadgeClass(item.tier, isSpec);

          return (
            <div
              key={item.id}
              className={`rounded-md border p-2.5 transition-colors cursor-pointer ${
                isSelected
                  ? "border-white/30 bg-zinc-800"
                  : isEquipped
                    ? "border-emerald-600/40 bg-emerald-950/20"
                    : "border-zinc-700/50 bg-zinc-900/50 hover:bg-zinc-800/50"
              }`}
              onClick={() => setSelectedId(isSelected ? null : item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedId(isSelected ? null : item.id);
                }
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white">{item.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${tierClass}`}>
                    {isSpec ? "SPECIALIST" : `TIER ${item.tier}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isEquipped && (
                    <Badge variant="success" className="text-[9px]">
                      <Check size={8} className="mr-0.5" /> Equipped
                    </Badge>
                  )}
                  {!isEquipped && isOwned && (
                    <Badge variant="secondary" className="text-[9px]">Owned</Badge>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-zinc-400 mb-1.5">{item.description}</p>

              {/* Effects */}
              {item.effects.length > 0 && (
                <div className="space-y-0.5 mb-1.5">
                  {item.effects.map((effect, i) => (
                    <p key={i} className="text-[10px] text-emerald-400">
                      {formatEffectLine(effect.type, effect.value)}
                      {effect.homeRegionOnly && (
                        <span className="text-zinc-500 ml-1">(home region)</span>
                      )}
                      {effect.activityTypes && effect.activityTypes.length > 0 && (
                        <span className="text-zinc-600 ml-1">
                          ({effect.activityTypes.slice(0, 2).join(", ")}{effect.activityTypes.length > 2 ? "..." : ""})
                        </span>
                      )}
                    </p>
                  ))}
                </div>
              )}

              {/* Cost info */}
              <div className="flex items-center gap-3 text-[10px]">
                {item.purchaseCost > 0 && !isOwned && (
                  <span className={canAfford ? "text-amber-400" : "text-red-400"}>
                    £{item.purchaseCost.toLocaleString()}
                  </span>
                )}
                {item.monthlyCost > 0 && (
                  <span className="text-zinc-500">
                    £{item.monthlyCost}/mo
                  </span>
                )}
                {item.purchaseCost === 0 && item.monthlyCost === 0 && (
                  <span className="text-zinc-600">Free</span>
                )}
              </div>

              {/* Action buttons when selected */}
              {isSelected && (
                <div className="mt-2 pt-2 border-t border-zinc-700/50 flex items-center gap-2">
                  {!isOwned && !isEquipped && (
                    <Button
                      size="sm"
                      className="text-[10px] h-7 px-3"
                      disabled={!canAfford}
                      onClick={(e) => {
                        e.stopPropagation();
                        purchaseEquipItem(item.id);
                        setSelectedId(null);
                      }}
                    >
                      <ShoppingCart size={10} className="mr-1" />
                      {canAfford
                        ? `Purchase & Equip — £${item.purchaseCost.toLocaleString()}`
                        : `Need £${(item.purchaseCost - balance).toLocaleString()} more`
                      }
                    </Button>
                  )}
                  {isOwned && !isEquipped && (
                    <>
                      <Button
                        size="sm"
                        className="text-[10px] h-7 px-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          equipEquipItem(item.id);
                          setSelectedId(null);
                        }}
                      >
                        <ArrowLeftRight size={10} className="mr-1" />
                        Equip
                      </Button>
                      {item.tier > 1 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[10px] h-7 px-3 text-red-400 border-red-800/50 hover:bg-red-950/30"
                          onClick={(e) => {
                            e.stopPropagation();
                            sellEquipItem(item.id);
                            setSelectedId(null);
                          }}
                        >
                          <Trash2 size={10} className="mr-1" />
                          Sell — £{Math.floor(item.purchaseCost * 0.5).toLocaleString()}
                        </Button>
                      )}
                    </>
                  )}
                  {isEquipped && item.tier > 1 && (
                    <p className="text-[10px] text-zinc-500">Currently equipped. Equip another item first to sell this one.</p>
                  )}

                  {/* Budget impact */}
                  {!isEquipped && monthlyDelta !== 0 && (
                    <span className={`text-[10px] ml-auto ${monthlyDelta > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      Monthly: £{currentMonthly}/mo → £{(currentMonthly + monthlyDelta).toLocaleString()}/mo
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
