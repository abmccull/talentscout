"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";
import {
  ALL_EQUIPMENT_SLOTS,
  getEquipmentItem,
  getEquipmentMonthlyTotal,
} from "@/engine/finance";
import type { EquipmentSlot } from "@/engine/finance";
import { EquipmentSlotBrowser } from "./EquipmentSlotBrowser";

const SLOT_LABELS: Record<EquipmentSlot, string> = {
  notebook: "Field Notebook",
  video: "Video Analysis",
  travel: "Travel Gear",
  network: "Networking Tools",
  analysis: "Analysis Software",
};

function getTierColor(tier: number, isSpecialist: boolean): string {
  if (isSpecialist) return "text-purple-400";
  switch (tier) {
    case 2: return "text-blue-400";
    case 3: return "text-amber-400";
    case 4: return "text-emerald-400";
    default: return "text-zinc-500";
  }
}

function getTierBorderColor(tier: number, isSpecialist: boolean): string {
  if (isSpecialist) return "border-purple-600/40";
  switch (tier) {
    case 2: return "border-blue-600/40";
    case 3: return "border-amber-600/40";
    case 4: return "border-emerald-600/40";
    default: return "border-zinc-700";
  }
}

function formatEffect(type: string, value: number): string {
  const percent = [
    "observationConfidence", "videoConfidence", "dataAccuracy", "reportQuality",
    "travelCostReduction", "relationshipGainBonus", "intelReliabilityBonus",
    "youthDiscoveryBonus", "gutFeelingBonus", "paEstimateAccuracy",
    "systemFitAccuracy", "anomalyDetectionRate", "predictionAccuracy", "valuationAccuracy",
  ];
  if (percent.includes(type)) {
    return `+${Math.round(value * 100)}% ${type.replace(/([A-Z])/g, " $1").toLowerCase().trim()}`;
  }
  if (type === "fatigueReduction") return `-${value} fatigue`;
  if (type === "attributesPerSession") return `+${value} attributes/session`;
  if (type === "familiarityGainBonus") return `+${value} familiarity gain`;
  if (type === "travelSlotReduction") return `-${value} travel slot`;
  return `+${value} ${type}`;
}

export function EquipmentPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlot | null>(null);

  if (!gameState?.finances?.equipment) return null;

  const { loadout } = gameState.finances.equipment;
  const monthlyTotal = getEquipmentMonthlyTotal(loadout);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Wrench size={14} className="text-zinc-400" aria-hidden="true" />
            Equipment
          </span>
          {monthlyTotal > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              £{monthlyTotal.toLocaleString()}/mo
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2" data-tutorial-id="equipment-loadout">
          {ALL_EQUIPMENT_SLOTS.map((slot) => {
            const itemId = loadout[slot];
            const item = getEquipmentItem(itemId);
            if (!item) return null;

            const isSpecialist = !!item.specialization;
            const tierColor = getTierColor(item.tier, isSpecialist);
            const borderColor = getTierBorderColor(item.tier, isSpecialist);
            const firstEffect = item.effects[0];

            return (
              <div
                key={slot}
                className={`rounded-md border p-2.5 ${borderColor} bg-zinc-900/50 cursor-pointer hover:bg-zinc-800/50 transition-colors`}
                onClick={() => setSelectedSlot(selectedSlot === slot ? null : slot)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedSlot(selectedSlot === slot ? null : slot);
                  }
                }}
                aria-label={`Browse ${SLOT_LABELS[slot]} equipment`}
              >
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
                  {SLOT_LABELS[slot]}
                </p>
                <p className="text-xs font-medium text-white truncate">{item.name}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`text-[10px] font-semibold ${tierColor}`}>
                    {isSpecialist ? "SPEC" : `T${item.tier}`}
                  </span>
                  {item.monthlyCost > 0 && (
                    <span className="text-[9px] text-zinc-600">
                      £{item.monthlyCost}/mo
                    </span>
                  )}
                </div>
                {firstEffect && (
                  <p className="text-[9px] text-emerald-400/80 mt-1 truncate">
                    {formatEffect(firstEffect.type, firstEffect.value)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {selectedSlot && (
          <div data-tutorial-id="equipment-shop">
            <EquipmentSlotBrowser
              slot={selectedSlot}
              onClose={() => setSelectedSlot(null)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
