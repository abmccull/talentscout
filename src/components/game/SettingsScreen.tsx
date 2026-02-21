"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, Download, Trash2, Loader2, ArrowLeft, Check } from "lucide-react";
import { MAX_MANUAL_SLOTS } from "@/lib/db";

export function SettingsScreen() {
  const {
    gameState,
    saveSlots,
    refreshSaveSlots,
    saveToSlot,
    loadFromSlot,
    deleteSlot,
    isSaving,
    setScreen,
  } = useGameStore();

  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    refreshSaveSlots();
  }, [refreshSaveSlots]);

  if (!gameState) return null;

  const manualSaves = saveSlots.filter((s) => s.slot > 0);
  const usedSlots = new Set(manualSaves.map((s) => s.slot));

  const handleSave = async (slot: number) => {
    const name = `Save ${slot}`;
    await saveToSlot(slot, name);
    setSaveStatus(`Saved to slot ${slot}`);
    setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleQuickSave = async () => {
    // Find first available slot, or overwrite oldest
    let slot = 1;
    for (let i = 1; i <= MAX_MANUAL_SLOTS; i++) {
      if (!usedSlots.has(i)) {
        slot = i;
        break;
      }
    }
    if (usedSlots.size >= MAX_MANUAL_SLOTS) {
      const oldest = manualSaves.sort((a, b) => a.savedAt - b.savedAt)[0];
      if (oldest) slot = oldest.slot;
    }
    await handleSave(slot);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <GameLayout>
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Settings</h1>
          <Button variant="outline" size="sm" onClick={() => setScreen("dashboard")}>
            <ArrowLeft size={14} className="mr-1" />
            Back
          </Button>
        </div>

        {/* Quick Save */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Save size={18} className="text-emerald-500" />
              Save Game
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Button onClick={handleQuickSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 size={14} className="mr-2 animate-spin" />
                ) : (
                  <Save size={14} className="mr-2" />
                )}
                Quick Save
              </Button>
              {saveStatus && (
                <span className="flex items-center gap-1 text-sm text-emerald-400">
                  <Check size={14} />
                  {saveStatus}
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-500">
              Game autosaves every time you advance a week.
              You have {MAX_MANUAL_SLOTS} manual save slots.
            </p>
          </CardContent>
        </Card>

        {/* Save Slots */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download size={18} className="text-emerald-500" />
              Save Slots
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: MAX_MANUAL_SLOTS }, (_, i) => i + 1).map(
              (slot) => {
                const existing = manualSaves.find((s) => s.slot === slot);
                return (
                  <div
                    key={slot}
                    className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#141414] p-3"
                  >
                    <div className="flex-1">
                      {existing ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{existing.name}</p>
                            <Badge variant="secondary" className="text-xs">
                              S{existing.season} W{existing.week}
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-500">
                            {existing.scoutName} &middot; Rep {Math.round(existing.reputation)} &middot;{" "}
                            {formatDate(existing.savedAt)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500">Slot {slot} — Empty</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSave(slot)}
                        disabled={isSaving}
                      >
                        <Save size={12} className="mr-1" />
                        Save
                      </Button>
                      {existing && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => loadFromSlot(slot)}
                          >
                            <Download size={12} className="mr-1" />
                            Load
                          </Button>
                          <button
                            onClick={() => deleteSlot(slot)}
                            className="rounded p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400"
                            aria-label={`Delete slot ${slot}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              },
            )}
          </CardContent>
        </Card>

        {/* Quit to Menu */}
        <Card>
          <CardContent className="p-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setScreen("mainMenu");
              }}
            >
              Quit to Main Menu
            </Button>
            <p className="mt-2 text-center text-xs text-zinc-500">
              Unsaved progress will be lost. The game autosaves each week.
            </p>
          </CardContent>
        </Card>
      </div>
    </GameLayout>
  );
}
