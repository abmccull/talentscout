"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Trash2 } from "lucide-react";
import type { SaveRecord } from "@/lib/db";

export function MainMenu() {
  const {
    setScreen,
    saveSlots,
    refreshSaveSlots,
    loadFromSlot,
    deleteSlot,
    isLoadingSave,
  } = useGameStore();
  const [showLoadPicker, setShowLoadPicker] = useState(false);

  useEffect(() => {
    refreshSaveSlots();
  }, [refreshSaveSlots]);

  const autosave = saveSlots.find((s) => s.slot === 0);
  const manualSaves = saveSlots.filter((s) => s.slot > 0);

  const handleContinue = async () => {
    // Load the most recent save (autosave or latest manual)
    const mostRecent = saveSlots.sort((a, b) => b.savedAt - a.savedAt)[0];
    if (mostRecent) {
      await loadFromSlot(mostRecent.slot);
    }
  };

  const handleLoad = async (slot: number) => {
    await loadFromSlot(slot);
    setShowLoadPicker(false);
  };

  const handleDelete = async (slot: number) => {
    await deleteSlot(slot);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const hasSaves = saveSlots.length > 0;

  if (isLoadingSave) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0a0a0a] to-[#0f1a0f]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        <p className="mt-4 text-zinc-400">Loading save...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0a0a0a] to-[#0f1a0f]">
      <div className="mb-16 text-center">
        <h1 className="mb-2 text-6xl font-bold tracking-tight text-white">
          Talent<span className="text-emerald-500">Scout</span>
        </h1>
        <p className="text-lg text-zinc-400">Football Scout Career Simulator</p>
      </div>

      {!showLoadPicker ? (
        <div className="flex w-64 flex-col gap-3">
          <Button
            size="lg"
            className="w-full text-base"
            onClick={() => setScreen("newGame")}
          >
            New Game
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full text-base"
            disabled={!hasSaves}
            onClick={handleContinue}
          >
            Continue
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full text-base"
            disabled={!hasSaves}
            onClick={() => setShowLoadPicker(true)}
          >
            Load Game
          </Button>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-3 px-4">
          <h2 className="text-center text-lg font-semibold text-white">
            Load Game
          </h2>

          {autosave && (
            <SaveSlotCard
              save={autosave}
              label="Autosave"
              onLoad={() => handleLoad(autosave.slot)}
              onDelete={() => handleDelete(autosave.slot)}
              formatDate={formatDate}
            />
          )}

          {manualSaves.map((save) => (
            <SaveSlotCard
              key={save.slot}
              save={save}
              label={save.name}
              onLoad={() => handleLoad(save.slot)}
              onDelete={() => handleDelete(save.slot)}
              formatDate={formatDate}
            />
          ))}

          {saveSlots.length === 0 && (
            <p className="text-center text-sm text-zinc-500">
              No saved games found.
            </p>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowLoadPicker(false)}
          >
            Back
          </Button>
        </div>
      )}

      <p className="mt-16 text-xs text-zinc-600">
        v0.1.0 — The scout&apos;s eye sees what others miss
      </p>
    </div>
  );
}

function SaveSlotCard({
  save,
  label,
  onLoad,
  onDelete,
  formatDate,
}: {
  save: Omit<SaveRecord, "state">;
  label: string;
  onLoad: () => void;
  onDelete: () => void;
  formatDate: (ts: number) => string;
}) {
  return (
    <Card className="cursor-pointer transition hover:border-emerald-500/50">
      <CardContent className="flex items-center justify-between p-4">
        <button onClick={onLoad} className="flex-1 text-left">
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="text-xs text-zinc-400">
            {save.scoutName} &middot; {save.specialization} &middot; S{save.season} W{save.week}
          </p>
          <p className="text-xs text-zinc-500">
            Rep: {Math.round(save.reputation)} &middot; {formatDate(save.savedAt)}
          </p>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="ml-3 rounded p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400"
          aria-label={`Delete ${label}`}
        >
          <Trash2 size={14} />
        </button>
      </CardContent>
    </Card>
  );
}
