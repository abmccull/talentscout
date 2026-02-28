"use client";

import { useEffect, useState, useCallback } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  Download,
  Trash2,
  Loader2,
  Check,
  AlertTriangle,
  X,
} from "lucide-react";
import { AUTOSAVE_SLOT, MAX_MANUAL_SLOTS } from "@/lib/db";
import type { SaveRecord } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SaveLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "save" | "load";

type ConfirmAction =
  | { type: "overwrite"; slot: number }
  | { type: "load"; slot: number }
  | { type: "delete"; slot: number };

type SlotMeta = Omit<SaveRecord, "state">;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// SlotInfo — shared display for a populated save slot
// ---------------------------------------------------------------------------

function SlotInfo({ slot }: { slot: SlotMeta }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-white">{slot.name}</p>
        <Badge variant="secondary" className="shrink-0 text-xs">
          S{slot.season} W{slot.week}
        </Badge>
      </div>
      <p className="truncate text-xs text-zinc-500">
        {slot.scoutName} &middot; Rep {Math.round(slot.reputation)} &middot;{" "}
        {formatDate(slot.savedAt)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InlineConfirm — small confirmation prompt shown inline
// ---------------------------------------------------------------------------

function InlineConfirm({
  message,
  onConfirm,
  onCancel,
  isLoading,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
      role="alert"
    >
      <AlertTriangle
        size={14}
        className="shrink-0 text-amber-400"
        aria-hidden="true"
      />
      <p className="flex-1 text-xs text-amber-200">{message}</p>
      <Button
        size="sm"
        variant="destructive"
        onClick={onConfirm}
        disabled={isLoading}
        className="h-7 px-2 text-xs"
      >
        {isLoading ? (
          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        ) : (
          "Confirm"
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onCancel}
        disabled={isLoading}
        className="h-7 px-2 text-xs"
      >
        Cancel
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SaveLoadModal
// ---------------------------------------------------------------------------

export function SaveLoadModal({ isOpen, onClose }: SaveLoadModalProps) {
  const {
    gameState,
    saveSlots,
    refreshSaveSlots,
    saveToSlot,
    loadFromSlot,
    deleteSlot,
    isSaving,
    isLoadingSave,
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<Tab>("save");
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [successSlot, setSuccessSlot] = useState<number | null>(null);

  // Refresh save slots on mount
  useEffect(() => {
    if (isOpen) {
      void refreshSaveSlots();
      setConfirm(null);
      setSuccessSlot(null);
    }
  }, [isOpen, refreshSaveSlots]);

  // Escape key closes the modal
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [isOpen, onClose]);

  const autosave = saveSlots.find((s) => s.slot === AUTOSAVE_SLOT);

  const findSlot = useCallback(
    (slot: number): SlotMeta | undefined => {
      return saveSlots.find((s) => s.slot === slot);
    },
    [saveSlots],
  );

  // ── Save handler ──────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (slot: number) => {
      if (!gameState) return;
      const existing = findSlot(slot);
      if (existing) {
        setConfirm({ type: "overwrite", slot });
        return;
      }
      const name = `Manual Save - S${gameState.currentSeason} W${gameState.currentWeek}`;
      await saveToSlot(slot, name);
      setSuccessSlot(slot);
      setTimeout(() => setSuccessSlot(null), 2000);
    },
    [gameState, findSlot, saveToSlot],
  );

  const confirmOverwrite = useCallback(async () => {
    if (!gameState || !confirm || confirm.type !== "overwrite") return;
    const name = `Manual Save - S${gameState.currentSeason} W${gameState.currentWeek}`;
    await saveToSlot(confirm.slot, name);
    setConfirm(null);
    setSuccessSlot(confirm.slot);
    setTimeout(() => setSuccessSlot(null), 2000);
  }, [gameState, confirm, saveToSlot]);

  // ── Load handler ──────────────────────────────────────────────────────────

  const handleLoad = useCallback(
    (slot: number) => {
      setConfirm({ type: "load", slot });
    },
    [],
  );

  const confirmLoad = useCallback(async () => {
    if (!confirm || confirm.type !== "load") return;
    await loadFromSlot(confirm.slot);
    setConfirm(null);
    onClose();
  }, [confirm, loadFromSlot, onClose]);

  // ── Delete handler ────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    (slot: number) => {
      setConfirm({ type: "delete", slot });
    },
    [],
  );

  const confirmDelete = useCallback(async () => {
    if (!confirm || confirm.type !== "delete") return;
    await deleteSlot(confirm.slot);
    setConfirm(null);
  }, [confirm, deleteSlot]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Save and Load Game"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="w-full max-w-lg border-[#27272a] bg-[#141414]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg font-bold text-white">
            Save / Load
          </CardTitle>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Close save and load dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ── Tab bar ──────────────────────────────────────────────────── */}
          <div className="flex gap-1 rounded-md bg-[#0c0c0c] p-1" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === "save"}
              onClick={() => {
                setActiveTab("save");
                setConfirm(null);
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition ${
                activeTab === "save"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Save size={14} aria-hidden="true" />
              Save
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "load"}
              onClick={() => {
                setActiveTab("load");
                setConfirm(null);
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition ${
                activeTab === "load"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Download size={14} aria-hidden="true" />
              Load
            </button>
          </div>

          {/* ── Save tab ─────────────────────────────────────────────────── */}
          {activeTab === "save" && (
            <div className="space-y-2" role="tabpanel" aria-label="Save game">
              {Array.from({ length: MAX_MANUAL_SLOTS }, (_, i) => i + 1).map(
                (slot) => {
                  const existing = findSlot(slot);
                  const isConfirming =
                    confirm?.type === "overwrite" && confirm.slot === slot;
                  const showSuccess = successSlot === slot;

                  return (
                    <div key={slot} className="space-y-1.5">
                      <div className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0c0c0c] p-3">
                        {existing ? (
                          <SlotInfo slot={existing} />
                        ) : (
                          <p className="flex-1 text-sm text-zinc-500">
                            Slot {slot} — Empty
                          </p>
                        )}

                        <div className="ml-3 flex items-center gap-2">
                          {showSuccess && (
                            <span className="flex items-center gap-1 text-xs text-emerald-400">
                              <Check size={12} aria-hidden="true" />
                              Saved
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleSave(slot)}
                            disabled={isSaving || isConfirming}
                            className="h-8"
                          >
                            {isSaving && isConfirming ? (
                              <Loader2
                                size={12}
                                className="mr-1 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <Save
                                size={12}
                                className="mr-1"
                                aria-hidden="true"
                              />
                            )}
                            Save
                          </Button>
                          {existing && (
                            <button
                              onClick={() => handleDelete(slot)}
                              disabled={
                                confirm?.type === "delete" &&
                                confirm.slot === slot
                              }
                              className="rounded p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                              aria-label={`Delete save slot ${slot}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline confirm: overwrite */}
                      {isConfirming && (
                        <InlineConfirm
                          message="Overwrite existing save?"
                          onConfirm={() => void confirmOverwrite()}
                          onCancel={() => setConfirm(null)}
                          isLoading={isSaving}
                        />
                      )}

                      {/* Inline confirm: delete */}
                      {confirm?.type === "delete" && confirm.slot === slot && (
                        <InlineConfirm
                          message="Delete this save permanently?"
                          onConfirm={() => void confirmDelete()}
                          onCancel={() => setConfirm(null)}
                          isLoading={false}
                        />
                      )}
                    </div>
                  );
                },
              )}
            </div>
          )}

          {/* ── Load tab ─────────────────────────────────────────────────── */}
          {activeTab === "load" && (
            <div className="space-y-2" role="tabpanel" aria-label="Load game">
              {/* Autosave slot */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0c0c0c] p-3">
                  {autosave ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-white">
                            Autosave
                          </p>
                          <Badge
                            variant="secondary"
                            className="shrink-0 text-xs"
                          >
                            S{autosave.season} W{autosave.week}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-zinc-500">
                          {autosave.scoutName} &middot; Rep{" "}
                          {Math.round(autosave.reputation)} &middot;{" "}
                          {formatDate(autosave.savedAt)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleLoad(AUTOSAVE_SLOT)}
                        disabled={isLoadingSave}
                        className="ml-3 h-8"
                      >
                        {isLoadingSave &&
                        confirm?.type === "load" &&
                        confirm.slot === AUTOSAVE_SLOT ? (
                          <Loader2
                            size={12}
                            className="mr-1 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Download
                            size={12}
                            className="mr-1"
                            aria-hidden="true"
                          />
                        )}
                        Load
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      Autosave — No data yet
                    </p>
                  )}
                </div>

                {confirm?.type === "load" && confirm.slot === AUTOSAVE_SLOT && (
                  <InlineConfirm
                    message="Loading will lose unsaved progress. Continue?"
                    onConfirm={() => void confirmLoad()}
                    onCancel={() => setConfirm(null)}
                    isLoading={isLoadingSave}
                  />
                )}
              </div>

              {/* Manual slots */}
              {Array.from({ length: MAX_MANUAL_SLOTS }, (_, i) => i + 1).map(
                (slot) => {
                  const existing = findSlot(slot);
                  const isConfirmingLoad =
                    confirm?.type === "load" && confirm.slot === slot;
                  const isConfirmingDelete =
                    confirm?.type === "delete" && confirm.slot === slot;

                  return (
                    <div key={slot} className="space-y-1.5">
                      <div className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0c0c0c] p-3">
                        {existing ? (
                          <>
                            <SlotInfo slot={existing} />
                            <div className="ml-3 flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleLoad(slot)}
                                disabled={isLoadingSave}
                                className="h-8"
                              >
                                {isLoadingSave && isConfirmingLoad ? (
                                  <Loader2
                                    size={12}
                                    className="mr-1 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Download
                                    size={12}
                                    className="mr-1"
                                    aria-hidden="true"
                                  />
                                )}
                                Load
                              </Button>
                              <button
                                onClick={() => handleDelete(slot)}
                                disabled={isConfirmingDelete}
                                className="rounded p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                aria-label={`Delete save slot ${slot}`}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-zinc-500">
                            Slot {slot} — Empty
                          </p>
                        )}
                      </div>

                      {/* Inline confirm: load */}
                      {isConfirmingLoad && (
                        <InlineConfirm
                          message="Loading will lose unsaved progress. Continue?"
                          onConfirm={() => void confirmLoad()}
                          onCancel={() => setConfirm(null)}
                          isLoading={isLoadingSave}
                        />
                      )}

                      {/* Inline confirm: delete */}
                      {isConfirmingDelete && (
                        <InlineConfirm
                          message="Delete this save permanently?"
                          onConfirm={() => void confirmDelete()}
                          onCancel={() => setConfirm(null)}
                          isLoading={false}
                        />
                      )}
                    </div>
                  );
                },
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
