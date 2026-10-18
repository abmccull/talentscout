"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { BookOpen, Laptop, Compass, Phone, BarChart3, type LucideIcon } from "lucide-react";
import { ALL_EQUIPMENT_SLOTS, getEquipmentItem, getEquipmentMonthlyTotal } from "@/engine/finance";
import type { EquipmentSlot } from "@/engine/finance";
import { getScoutHomeCountry } from "@/engine/world/travel";
import { getCountryDisplayName } from "@/lib/country";
import { EquipmentSlotBrowser } from "./EquipmentSlotBrowser";

const SLOT_LABELS: Record<EquipmentSlot, string> = {
  notebook: "Field Notebook", video: "Video Analysis", travel: "Travel Gear",
  network: "Networking Tools", analysis: "Analysis Software",
};
const SLOT_ICONS: Record<EquipmentSlot, LucideIcon> = {
  notebook: BookOpen, video: Laptop, travel: Compass, network: Phone, analysis: BarChart3,
};

function formatEffect(type: string, value: number): string {
  const percent = [
    "observationConfidence", "videoConfidence", "dataAccuracy", "reportQuality",
    "travelCostReduction", "relationshipGainBonus", "intelReliabilityBonus",
    "youthDiscoveryBonus", "gutFeelingBonus", "paEstimateAccuracy",
    "systemFitAccuracy", "anomalyDetectionRate", "predictionAccuracy", "valuationAccuracy",
  ];
  const label = type.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  if (percent.includes(type)) return `+${Math.round(value * 100)}% ${label}`;
  if (type === "fatigueReduction") return `-${value} fatigue`;
  if (type === "attributesPerSession") return `+${value} attributes per session`;
  if (type === "familiarityGainBonus") return `+${value} familiarity gain`;
  if (type === "travelSlotReduction") return `-${value} travel slot`;
  return `+${value} ${label}`;
}

export function EquipmentPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlot | null>(null);
  if (!gameState?.finances?.equipment) return null;

  const { loadout } = gameState.finances.equipment;
  const monthlyTotal = getEquipmentMonthlyTotal(loadout);
  const homeCountry = getCountryDisplayName(getScoutHomeCountry(gameState.scout));

  return (
    <section className="max-w-5xl" aria-labelledby="equipment-loadout-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-4">
        <h2 id="equipment-loadout-heading" className="font-editorial text-2xl text-white">In the bag</h2>
        <p className="text-sm text-zinc-400">{monthlyTotal > 0 ? `£${monthlyTotal.toLocaleString()} per month in running costs` : "No monthly running costs"}</p>
      </div>
      <div data-tutorial-id="equipment-loadout">
        {ALL_EQUIPMENT_SLOTS.map((slot) => {
          const item = getEquipmentItem(loadout[slot]);
          if (!item) return null;
          const Icon = SLOT_ICONS[slot];
          const isSelected = selectedSlot === slot;
          return (
            <article key={slot} className="border-b border-[var(--border)] py-5">
              <div className="flex items-start gap-3 sm:gap-4">
                <Icon size={23} strokeWidth={1.5} className="mt-1 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-400">{SLOT_LABELS[slot]} · {item.specialization ? "Specialist equipment" : `Grade ${item.tier}`}</p>
                  <h3 className="mt-1 text-base font-semibold text-white">{item.name}</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-300">{item.description}</p>
                  {item.effects.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                      {item.effects.map((effect, index) => (
                        <li key={index}>
                          {formatEffect(effect.type, effect.value)}
                          {effect.homeRegionOnly && <span className="text-zinc-400"> · while working in {homeCountry}</span>}
                          {effect.activityTypes && effect.activityTypes.length > 0 && (
                            <span className="text-zinc-400"> · {effect.activityTypes.map((activity) => activity.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()).join(", ")}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-400">Standard kit · no additional scouting bonus</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedSlot(isSelected ? null : slot)} aria-expanded={isSelected} aria-controls={isSelected ? `equipment-shop-${slot}` : undefined} aria-label={`Browse ${SLOT_LABELS[slot]} equipment`}>
                      {isSelected ? "Close upgrades" : "Compare upgrades"}
                    </Button>
                    <span className="text-xs text-zinc-400">Equipped{item.monthlyCost > 0 ? ` · £${item.monthlyCost.toLocaleString()}/month` : " · no monthly fee"}</span>
                  </div>
                </div>
              </div>
              {isSelected && (
                <div id={`equipment-shop-${slot}`} className="mt-4" data-tutorial-id="equipment-shop">
                  <EquipmentSlotBrowser slot={slot} onClose={() => setSelectedSlot(null)} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
