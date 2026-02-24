"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { EquipmentPanel } from "./EquipmentPanel";

export function EquipmentScreen() {
  const gameState = useGameStore((s) => s.gameState);
  if (!gameState?.finances) return null;

  return (
    <GameLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-1">Equipment</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Upgrade your scouting gear to improve observation quality and unlock new abilities.
        </p>
        <EquipmentPanel />
      </div>
    </GameLayout>
  );
}
