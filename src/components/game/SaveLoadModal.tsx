"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useGameStore, type SaveSlotSummary } from "@/stores/gameStore";
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
  CloudOff,
  History,
  RotateCcw,
  X,
} from "lucide-react";
import { AUTOSAVE_SLOT, MAX_MANUAL_SLOTS } from "@/lib/db";
import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";
import { useShallow } from "zustand/react/shallow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SaveLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "save" | "load" | "recovery";

type ConfirmAction =
  | { type: "overwrite"; slot: number }
  | { type: "load"; slot: number }
  | { type: "delete"; slot: number }
  | { type: "restore"; slot: number; archiveId: string };

type SlotMeta = SaveSlotSummary;

function getSaveSourceLabel(source: SlotMeta["source"]): string {
  if (source === "supabase") return "Cloud";
  if (source === "steam") return "Steam";
  return "Local";
}

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
        <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
          {getSaveSourceLabel(slot.source)}
        </Badge>
        {slot.recovery && (
          <Badge className="shrink-0 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300">
            Verified backup
          </Badge>
        )}
        {slot.unavailable && (
          <Badge className="shrink-0 border-red-500/40 bg-red-500/10 text-[10px] text-red-300">
            Damaged
          </Badge>
        )}
        {slot.localUnavailable && (
          <Badge className="shrink-0 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300">
            Cloud recovery
          </Badge>
        )}
      </div>
      <p className="truncate text-xs text-zinc-500">
        {slot.scoutName} &middot; Rep {Math.round(slot.reputation)} &middot;{" "}
        {formatDate(slot.savedAt)}
      </p>
      {slot.recovery && (
        <p className="mt-1 text-xs text-amber-300">
          Newest generation damaged; this row is the last verified recovery copy.
        </p>
      )}
      {slot.unavailable && (
        <p className="mt-1 text-xs text-red-300">{slot.unavailable.message}</p>
      )}
      {slot.localUnavailable && (
        <p className="mt-1 text-xs text-amber-300">
          The local copy is damaged; this verified remote copy can still be loaded.
        </p>
      )}
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

function ConflictResolution({
  localPreview,
  localTimestamp,
  cloudPreview,
  cloudTimestamp,
  cloudSourceLabel,
  onKeepLocal,
  onUseCloud,
  onCancel,
  isLoading,
}: {
  localPreview: string;
  localTimestamp: number;
  cloudPreview: string;
  cloudTimestamp: number;
  cloudSourceLabel: string;
  onKeepLocal: () => void;
  onUseCloud: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={14}
          className="mt-0.5 shrink-0 text-amber-400"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="text-xs font-medium text-amber-100">
            Local and cloud saves diverged for this slot.
          </p>
          <p className="text-xs text-amber-200/90">
            Pick the source of truth. The unselected version will remain available in Recovery.
          </p>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded border border-zinc-800 bg-[#0c0c0c] p-2.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Local</p>
          <p className="mt-1 text-xs text-zinc-200">{localPreview}</p>
          <p className="mt-1 text-[11px] text-zinc-500">{formatDate(localTimestamp)}</p>
        </div>
        <div className="rounded border border-zinc-800 bg-[#0c0c0c] p-2.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{cloudSourceLabel}</p>
          <p className="mt-1 text-xs text-zinc-200">{cloudPreview}</p>
          <p className="mt-1 text-[11px] text-zinc-500">{formatDate(cloudTimestamp)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={isLoading}
          onClick={onKeepLocal}
          className="h-8 text-xs"
        >
          {isLoading ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
          Keep Local
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isLoading}
          onClick={onUseCloud}
          className="h-8 text-xs"
        >
          {cloudSourceLabel === "Cloud" ? "Use Cloud" : `Use ${cloudSourceLabel}`}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isLoading}
          onClick={onCancel}
          className="h-8 text-xs text-zinc-400 hover:text-white"
        >
          Cancel
        </Button>
      </div>
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
    saveRecoveryCopies,
    saveSyncStatus,
    refreshSaveSlots,
    saveToSlot,
    loadFromSlot,
    deleteSlot,
    saveConflict,
    dismissSaveConflict,
    resolveSaveConflict,
    restoreSaveRecoveryCopy,
    retryPendingSaveSync,
    isSaving,
    isLoadingSave,
    isResolvingSaveConflict,
  } = useGameStore(
    useShallow((state) => ({
      gameState: state.gameState,
      saveSlots: state.saveSlots,
      saveRecoveryCopies: state.saveRecoveryCopies,
      saveSyncStatus: state.saveSyncStatus,
      refreshSaveSlots: state.refreshSaveSlots,
      saveToSlot: state.saveToSlot,
      loadFromSlot: state.loadFromSlot,
      deleteSlot: state.deleteSlot,
      saveConflict: state.saveConflict,
      dismissSaveConflict: state.dismissSaveConflict,
      resolveSaveConflict: state.resolveSaveConflict,
      restoreSaveRecoveryCopy: state.restoreSaveRecoveryCopy,
      retryPendingSaveSync: state.retryPendingSaveSync,
      isSaving: state.isSaving,
      isLoadingSave: state.isLoadingSave,
      isResolvingSaveConflict: state.isResolvingSaveConflict,
    })),
  );

  const [activeTab, setActiveTab] = useState<Tab>("save");
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [successSlot, setSuccessSlot] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => clearTimeout(successTimerRef.current), []);

  // Refresh save slots on mount
  useEffect(() => {
    if (isOpen) {
      void refreshSaveSlots();
      setConfirm(null);
      setSuccessSlot(null);
      setLoadError(null);
      dismissSaveConflict();
    }
  }, [isOpen, refreshSaveSlots, dismissSaveConflict]);

  // Escape key closes the modal
  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    }, 0);
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        dismissSaveConflict();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKey, true);
      returnFocusRef.current?.focus();
    };
  }, [isOpen, onClose, dismissSaveConflict]);

  const { compatibleSaveSlots, reservedSlots, unsupportedSaveCount } = useMemo(() => {
    const compatible = IS_YOUTH_EARLY_ACCESS
      ? saveSlots.filter(
          (save) => save.specialization === "youth" || Boolean(save.unavailable),
        )
      : saveSlots;
    const compatibleSlotNumbers = new Set(compatible.map((save) => save.slot));
    return {
      compatibleSaveSlots: compatible,
      reservedSlots: new Set(
        saveSlots
          .filter((save) => !compatibleSlotNumbers.has(save.slot))
          .map((save) => save.slot),
      ),
      unsupportedSaveCount: saveSlots.length - compatible.length,
    };
  }, [saveSlots]);
  const autosave = compatibleSaveSlots.find((s) => s.slot === AUTOSAVE_SLOT);

  const findSlot = useCallback(
    (slot: number): SlotMeta | undefined => {
      return compatibleSaveSlots.find((s) => s.slot === slot);
    },
    [compatibleSaveSlots],
  );

  // ── Save handler ──────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (slot: number) => {
      if (!gameState) return;
      if (reservedSlots.has(slot)) {
        setLoadError(
          `Slot ${slot} is reserved by a preserved full-game save and cannot be overwritten in Youth Scout Early Access.`,
        );
        return;
      }
      const existing = findSlot(slot);
      if (existing) {
        setConfirm({ type: "overwrite", slot });
        return;
      }
      const name = `Manual Save - S${gameState.currentSeason} W${gameState.currentWeek}`;
      await saveToSlot(slot, name);
      setSuccessSlot(slot);
      clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccessSlot(null), 2000);
    },
    [gameState, findSlot, reservedSlots, saveToSlot],
  );

  const confirmOverwrite = useCallback(async () => {
    if (!gameState || !confirm || confirm.type !== "overwrite") return;
    const name = `Manual Save - S${gameState.currentSeason} W${gameState.currentWeek}`;
    await saveToSlot(confirm.slot, name);
    setConfirm(null);
    setSuccessSlot(confirm.slot);
    clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccessSlot(null), 2000);
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
    try {
      setLoadError(null);
      await loadFromSlot(confirm.slot);
      setConfirm(null);
      if (!useGameStore.getState().saveConflict) {
        onClose();
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load this save.");
    }
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

  const confirmRestore = useCallback(async () => {
    if (!confirm || confirm.type !== "restore") return;
    try {
      setLoadError(null);
      await restoreSaveRecoveryCopy(confirm.archiveId);
      setConfirm(null);
      onClose();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to restore this recovery copy.",
      );
    }
  }, [confirm, onClose, restoreSaveRecoveryCopy]);

  const handleResolveConflict = useCallback(
    async (slot: number, preferredSource: SlotMeta["source"]) => {
      try {
        setLoadError(null);
        await resolveSaveConflict(slot, preferredSource);
        if (!useGameStore.getState().saveConflict) {
          onClose();
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Unable to resolve this save.");
      }
    },
    [resolveSaveConflict, onClose],
  );

  const conflictForSlot = useCallback(
    (slot: number) => (saveConflict?.slot === slot ? saveConflict.conflict : null),
    [saveConflict],
  );

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Save and Load Game"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          dismissSaveConflict();
          onClose();
        }
      }}
    >
      <Card className="w-full max-w-lg border-[#27272a] bg-[#141414]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg font-bold text-white">
            Save / Load
          </CardTitle>
          <button
            onClick={() => {
              dismissSaveConflict();
              onClose();
            }}
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
                dismissSaveConflict();
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
                dismissSaveConflict();
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
            <button
              role="tab"
              aria-selected={activeTab === "recovery"}
              onClick={() => {
                setActiveTab("recovery");
                setConfirm(null);
                dismissSaveConflict();
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition ${
                activeTab === "recovery"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <History size={14} aria-hidden="true" />
              Recovery
              {saveRecoveryCopies.length > 0 && (
                <span className="rounded-full bg-zinc-800 px-1.5 text-[10px]">
                  {saveRecoveryCopies.length}
                </span>
              )}
            </button>
          </div>

          {loadError && (
            <div
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-200"
              role="alert"
            >
              {loadError}
            </div>
          )}

          {IS_YOUTH_EARLY_ACCESS && unsupportedSaveCount > 0 && (
            <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-xs leading-relaxed text-zinc-400">
              {unsupportedSaveCount} save{unsupportedSaveCount === 1 ? "" : "s"} from other
              specializations {unsupportedSaveCount === 1 ? "is" : "are"} preserved and hidden in
              Youth Scout Early Access.
            </div>
          )}

          {/* ── Save tab ─────────────────────────────────────────────────── */}
          {activeTab === "save" && (
            <div className="space-y-2" role="tabpanel" aria-label="Save game">
              {Array.from({ length: MAX_MANUAL_SLOTS }, (_, i) => i + 1).map(
                (slot) => {
                  const existing = findSlot(slot);
                  const isReserved = reservedSlots.has(slot);
                  const isConfirming =
                    confirm?.type === "overwrite" && confirm.slot === slot;
                  const showSuccess = successSlot === slot;

                  return (
                    <div key={slot} className="space-y-1.5">
                      <div className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0c0c0c] p-3">
                        {existing ? (
                          <SlotInfo slot={existing} />
                        ) : isReserved ? (
                          <div className="flex-1">
                            <p className="text-sm font-medium text-zinc-400">
                              Slot {slot} — Preserved full-game save
                            </p>
                            <p className="text-xs text-zinc-600">This slot cannot be overwritten in Youth Early Access.</p>
                          </div>
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
                            disabled={isSaving || isConfirming || isReserved}
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
                {(() => {
                  const autosaveConflict = conflictForSlot(AUTOSAVE_SLOT);
                  return (
                    <>
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
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[10px] uppercase"
                          >
                            {getSaveSourceLabel(autosave.source)}
                          </Badge>
                          {autosave.recovery && (
                            <Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300">
                              Verified backup
                            </Badge>
                          )}
                          {autosave.unavailable && (
                            <Badge className="border-red-500/40 bg-red-500/10 text-[10px] text-red-300">
                              Damaged
                            </Badge>
                          )}
                          {autosave.localUnavailable && (
                            <Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300">
                              Cloud recovery
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-zinc-500">
                          {autosave.scoutName} &middot; Rep{" "}
                          {Math.round(autosave.reputation)} &middot;{" "}
                          {formatDate(autosave.savedAt)}
                        </p>
                        {autosave.recovery && (
                          <p className="mt-1 text-xs text-amber-300">
                            Newest autosave damaged; this is the last verified copy.
                          </p>
                        )}
                        {autosave.unavailable && (
                          <p className="mt-1 text-xs text-red-300">
                            {autosave.unavailable.message}
                          </p>
                        )}
                        {autosave.localUnavailable && (
                          <p className="mt-1 text-xs text-amber-300">
                            The local autosave is damaged; this verified remote copy can still be loaded.
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleLoad(AUTOSAVE_SLOT)}
                        disabled={isLoadingSave || Boolean(autosave.unavailable)}
                        aria-label="Load autosave"
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
                {autosaveConflict && (
                  <ConflictResolution
                    localPreview={autosaveConflict.local.preview}
                    localTimestamp={autosaveConflict.local.timestamp}
                    cloudPreview={autosaveConflict.cloud.preview}
                    cloudTimestamp={autosaveConflict.cloud.timestamp}
                    cloudSourceLabel={getSaveSourceLabel(autosaveConflict.cloud.source)}
                    isLoading={isResolvingSaveConflict}
                    onKeepLocal={() => void handleResolveConflict(AUTOSAVE_SLOT, "local")}
                    onUseCloud={() =>
                      void handleResolveConflict(AUTOSAVE_SLOT, autosaveConflict.cloud.source)
                    }
                    onCancel={dismissSaveConflict}
                  />
                )}
                    </>
                  );
                })()}
              </div>

              {/* Manual slots */}
              {Array.from({ length: MAX_MANUAL_SLOTS }, (_, i) => i + 1).map(
                (slot) => {
                  const existing = findSlot(slot);
                  const isReserved = reservedSlots.has(slot);
                  const isConfirmingLoad =
                    confirm?.type === "load" && confirm.slot === slot;
                  const isConfirmingDelete =
                    confirm?.type === "delete" && confirm.slot === slot;
                  const slotConflict = conflictForSlot(slot);

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
                                disabled={isLoadingSave || Boolean(existing.unavailable)}
                                aria-label={`Load save slot ${slot}`}
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
                        ) : isReserved ? (
                          <div>
                            <p className="text-sm font-medium text-zinc-400">
                              Slot {slot} — Preserved full-game save
                            </p>
                            <p className="text-xs text-zinc-600">Unavailable in Youth Scout Early Access.</p>
                          </div>
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

                      {slotConflict && (
                        <ConflictResolution
                          localPreview={slotConflict.local.preview}
                          localTimestamp={slotConflict.local.timestamp}
                          cloudPreview={slotConflict.cloud.preview}
                          cloudTimestamp={slotConflict.cloud.timestamp}
                          cloudSourceLabel={getSaveSourceLabel(slotConflict.cloud.source)}
                          isLoading={isResolvingSaveConflict}
                          onKeepLocal={() => void handleResolveConflict(slot, "local")}
                          onUseCloud={() =>
                            void handleResolveConflict(slot, slotConflict.cloud.source)
                          }
                          onCancel={dismissSaveConflict}
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

          {activeTab === "recovery" && (
            <div className="space-y-3" role="tabpanel" aria-label="Save recovery">
              <div className="rounded-md border border-zinc-800 bg-[#0c0c0c] p-3">
                <div className="flex items-start gap-2">
                  <History size={15} className="mt-0.5 text-emerald-400" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-white">Recovery journal</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                      Earlier generations and unselected conflict copies are immutable until
                      their bounded retention window expires. Restoring one also preserves the
                      current valid generation.
                    </p>
                  </div>
                </div>
              </div>

              {saveRecoveryCopies.length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-500">
                  No recovery copies are currently retained.
                </div>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {saveRecoveryCopies.map((copy) => {
                    const isConfirming =
                      confirm?.type === "restore" && confirm.archiveId === copy.id;
                    return (
                      <div key={copy.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-[#0c0c0c] p-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium text-white">
                                {copy.slot === AUTOSAVE_SLOT ? "Autosave" : `Slot ${copy.slot}`}
                                {" · "}{copy.name}
                              </p>
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {copy.kind === "conflict-loser" ? "Conflict copy" : "Earlier version"}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-zinc-500">
                              S{copy.season} W{copy.week} · {copy.scoutName} · {formatDate(copy.savedAt)}
                            </p>
                            <p className="mt-1 text-xs text-zinc-400">{copy.reason}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0 text-xs"
                            disabled={isLoadingSave}
                            onClick={() => setConfirm({
                              type: "restore",
                              slot: copy.slot,
                              archiveId: copy.id,
                            })}
                          >
                            <RotateCcw size={12} className="mr-1" aria-hidden="true" />
                            Restore
                          </Button>
                        </div>
                        {isConfirming && (
                          <InlineConfirm
                            message="Restore this copy as the current local save? Your current valid version will also be preserved."
                            onConfirm={() => void confirmRestore()}
                            onCancel={() => setConfirm(null)}
                            isLoading={isLoadingSave}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {saveSyncStatus.pendingCount > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3" role="status">
                  <div className="flex min-w-0 items-start gap-2">
                    <CloudOff size={15} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-amber-100">
                        {saveSyncStatus.pendingCount} cloud {saveSyncStatus.pendingCount === 1 ? "change" : "changes"} queued
                      </p>
                      <p className="mt-1 text-xs text-amber-200/80">
                        Local save and delete choices are safe. Reconnect, then retry the pending cloud changes.
                        {saveSyncStatus.lastError ? ` Last error: ${saveSyncStatus.lastError}` : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => void retryPendingSaveSync()}
                  >
                    <RotateCcw size={12} className="mr-1" aria-hidden="true" />
                    Retry sync
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
