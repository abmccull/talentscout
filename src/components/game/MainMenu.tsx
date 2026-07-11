"use client";

import { useEffect, useState, useRef } from "react";
import { useGameStore, type SaveSlotSummary } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Trash2, LogOut } from "lucide-react";
import { ScreenBackground } from "@/components/ui/screen-background";
import { APP_VERSION } from "@/config/version";
import { AuthModal } from "./AuthModal";
import { supabase } from "@/lib/supabase";
import { getScenarioById } from "@/engine/scenarios/scenarioSetup";
import {
  BETA_CLOUD_SAVES_ENABLED,
  BETA_CLOUD_SAVES_MESSAGE,
  BETA_GLOBAL_LEADERBOARD_MESSAGE,
} from "@/config/beta";
import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";

// Session flag — splash only shown once per browser session.
let splashShownThisSession = false;

function getSaveSourceLabel(source: SaveSlotSummary["source"]): string {
  if (source === "supabase") return "Cloud";
  if (source === "steam") return "Steam";
  return "Local";
}

export function MainMenu() {
  const {
    setScreen,
    saveSlots,
    refreshSaveSlots,
    loadFromSlot,
    deleteSlot,
    isLoadingSave,
    selectedScenarioId,
    setSelectedScenario,
  } = useGameStore();

  const {
    isLoading: isAuthLoading,
    isAuthenticated,
    displayName,
    signOut,
    cloudSaveEnabled,
  } = useAuthStore();

  const [showLoadPicker, setShowLoadPicker] = useState(false);
  const [showSplash, setShowSplash] = useState(!splashShownThisSession);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [deleteConfirmSlot, setDeleteConfirmSlot] = useState<number | null>(null);
  const [deletingSlot, setDeletingSlot] = useState<number | null>(null);
  const splashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    void refreshSaveSlots();
  }, [refreshSaveSlots, isAuthenticated, cloudSaveEnabled]);

  useEffect(() => {
    if (!showSplash) return;
    splashShownThisSession = true;
    splashTimerRef.current = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(splashTimerRef.current);
  }, [showSplash]);

  const compatibleSaveSlots = IS_YOUTH_EARLY_ACCESS
    ? saveSlots.filter((save) => save.specialization === "youth")
    : saveSlots;
  const autosave = compatibleSaveSlots.find((s) => s.slot === 0);
  const manualSaves = compatibleSaveSlots.filter((s) => s.slot > 0);
  const unsupportedSaveCount = saveSlots.length - compatibleSaveSlots.length;

  const handleContinue = async () => {
    const mostRecent = [...compatibleSaveSlots].sort((a, b) => b.savedAt - a.savedAt)[0];
    if (mostRecent) {
      await loadFromSlot(mostRecent.slot);
    }
  };

  const handleLoad = async (slot: number) => {
    setDeleteConfirmSlot(null);
    await loadFromSlot(slot);
    setShowLoadPicker(false);
  };

  const handleDelete = async (slot: number) => {
    setDeletingSlot(slot);
    try {
      await deleteSlot(slot);
      setDeleteConfirmSlot((current) => (current === slot ? null : current));
    } finally {
      setDeletingSlot(null);
    }
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

  const hasSaves = compatibleSaveSlots.length > 0;
  const cloudAuthAvailable = BETA_CLOUD_SAVES_ENABLED && Boolean(supabase);
  const pendingScenario = selectedScenarioId
    ? getScenarioById(selectedScenarioId)
    : undefined;

  if (showSplash) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a]">
        <ScreenBackground src="/images/backgrounds/loading.png" opacity={0.6} />
        <div className="relative z-10 animate-[splashFadeIn_800ms_ease-out_both] text-center">
          <h1 className="mb-3 text-7xl font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
            Talent<span className="text-emerald-500 drop-shadow-[0_0_24px_rgba(16,185,129,0.5)]">Scout</span>
          </h1>
          <p className="text-lg tracking-wide text-zinc-400 animate-[splashFadeIn_1000ms_ease-out_400ms_both] drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            The scout&apos;s eye sees what others miss
          </p>
        </div>
        <style>{`
          @keyframes splashFadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </main>
    );
  }

  if (isLoadingSave) {
    return (
      <main
        className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a]"
        aria-busy="true"
      >
        <ScreenBackground src="/images/backgrounds/menu-bg-1.png" opacity={0.8} />
        <div className="relative z-10">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          <p className="mt-4 text-zinc-400">Loading save...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4 py-10">
      <ScreenBackground src="/images/backgrounds/menu-bg-1.png" opacity={0.65} />
      {/* Title */}
      <div className="relative z-10 mb-10 text-center md:mb-14">
        {IS_YOUTH_EARLY_ACCESS && (
          <Badge className="mb-4 border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Youth Scout Early Access
          </Badge>
        )}
        <h1 className="mb-2 text-6xl font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
          Talent<span className="text-emerald-500">Scout</span>
        </h1>
        <p className="text-lg text-zinc-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
          {IS_YOUTH_EARLY_ACCESS
            ? "Discover young players. Build the evidence. Back your judgement."
            : "Football Scout Career Simulator"}
        </p>
        {IS_YOUTH_EARLY_ACCESS && (
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
            This Early Access build is focused on one complete scouting specialization: Youth Scout.
            Other scouting specializations will return after this core loop is proven.
          </p>
        )}
      </div>

      {!showLoadPicker ? (
        <div className="relative z-10 flex w-64 flex-col gap-3">
          <Button
            size="lg"
            className="w-full text-base"
            onClick={() => {
              if (selectedScenarioId) {
                setSelectedScenario(null);
              }
              setScreen("newGame");
            }}
          >
            {IS_YOUTH_EARLY_ACCESS ? "Start Youth Career" : "New Game"}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full text-base"
            disabled={!hasSaves}
            onClick={() => void handleContinue()}
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
          {!IS_YOUTH_EARLY_ACCESS && (
            <Button
              variant="outline"
              size="lg"
              className="w-full text-base"
              onClick={() => setScreen("scenarioSelect")}
            >
              Scenarios
            </Button>
          )}

          {!IS_YOUTH_EARLY_ACCESS && pendingScenario && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
              <p className="text-xs font-medium text-amber-200">
                Pending scenario: {pendingScenario.name}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                Use Scenarios to continue it. New Game clears this selection and
                starts a standard career.
              </p>
            </div>
          )}

          {IS_YOUTH_EARLY_ACCESS && unsupportedSaveCount > 0 && (
            <p className="rounded-md border border-zinc-700/70 bg-zinc-900/80 px-3 py-2 text-center text-[11px] leading-relaxed text-zinc-400">
              {unsupportedSaveCount} save{unsupportedSaveCount === 1 ? "" : "s"} from an
              unsupported specialization {unsupportedSaveCount === 1 ? "is" : "are"} safely
              preserved and hidden in this Youth Early Access build.
            </p>
          )}

          {/* Auth status indicator */}
          <div className="mt-2 flex flex-col items-center gap-1.5">
            {!cloudAuthAvailable ? (
              <p className="max-w-xs text-center text-xs text-zinc-500">
                Cloud saves are unavailable in this build.
              </p>
            ) : isAuthLoading ? (
              <p className="max-w-xs text-center text-xs text-zinc-500">
                Checking cloud account…
              </p>
            ) : isAuthenticated ? (
              <>
                <p className="text-xs text-zinc-400">
                  Signed in as {displayName ?? "Scout"}
                </p>
                <p className="max-w-xs text-center text-xs text-zinc-500">
                  {cloudSaveEnabled
                    ? BETA_CLOUD_SAVES_MESSAGE
                    : "Signed in. Turn on cloud saves in Settings to sync this device."}
                </p>
                {isAuthenticated && (
                  <button
                    onClick={() => void signOut()}
                    className="flex items-center gap-1 text-xs text-zinc-600 transition hover:text-zinc-400"
                  >
                    <LogOut size={11} aria-hidden="true" />
                    Sign Out {displayName ? `(${displayName})` : ""}
                  </button>
                )}
                <p className="max-w-xs text-center text-[11px] text-zinc-600">
                  {BETA_GLOBAL_LEADERBOARD_MESSAGE}
                </p>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowAuthModal(true)}
                >
                  Sign In
                </Button>
                <p className="max-w-xs text-center text-xs text-zinc-500">
                  Sign in to connect a cloud account. Turn on Cloud Save Sync in
                  Settings when you want this device to sync.
                </p>
                <p className="max-w-xs text-center text-[11px] text-zinc-600">
                  {BETA_GLOBAL_LEADERBOARD_MESSAGE}
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="relative z-10 w-full max-w-md space-y-3 px-4">
          <h2 className="text-center text-lg font-semibold text-white">
            Load Game
          </h2>

          {autosave && (
            <div className="space-y-1.5">
              <SaveSlotCard
                save={autosave}
                label="Autosave"
                onLoad={() => void handleLoad(autosave.slot)}
                onDelete={() => setDeleteConfirmSlot(autosave.slot)}
                formatDate={formatDate}
              />
              {deleteConfirmSlot === autosave.slot && (
                <InlineDeleteConfirm
                  label="Autosave"
                  isLoading={deletingSlot === autosave.slot}
                  onCancel={() => setDeleteConfirmSlot(null)}
                  onConfirm={() => void handleDelete(autosave.slot)}
                />
              )}
            </div>
          )}

          {manualSaves.map((save) => (
            <div key={save.slot} className="space-y-1.5">
              <SaveSlotCard
                save={save}
                label={save.name}
                onLoad={() => void handleLoad(save.slot)}
                onDelete={() => setDeleteConfirmSlot(save.slot)}
                formatDate={formatDate}
              />
              {deleteConfirmSlot === save.slot && (
                <InlineDeleteConfirm
                  label={save.name}
                  isLoading={deletingSlot === save.slot}
                  onCancel={() => setDeleteConfirmSlot(null)}
                  onConfirm={() => void handleDelete(save.slot)}
                />
              )}
            </div>
          ))}

          {compatibleSaveSlots.length === 0 && (
            <p className="text-center text-sm text-zinc-500">
              No compatible Youth Scout saves found.
            </p>
          )}

          {IS_YOUTH_EARLY_ACCESS && unsupportedSaveCount > 0 && (
            <p className="text-center text-xs leading-relaxed text-zinc-500">
              Other-specialization saves remain stored and will be available when full-game mode returns.
            </p>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setDeleteConfirmSlot(null);
              setShowLoadPicker(false);
            }}
          >
            Back
          </Button>
        </div>
      )}

      <p className="mt-16 text-xs text-zinc-600">
        v{APP_VERSION} — The scout&apos;s eye sees what others miss
      </p>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </main>
  );
}

// ─── SaveSlotCard ─────────────────────────────────────────────────────────────

function InlineDeleteConfirm({
  label,
  isLoading,
  onConfirm,
  onCancel,
}: {
  label: string;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
      <p className="flex-1 text-xs text-amber-200">
        Delete {label} permanently?
      </p>
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
          "Delete"
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

function SaveSlotCard({
  save,
  label,
  onLoad,
  onDelete,
  formatDate,
}: {
  save: SaveSlotSummary;
  label: string;
  onLoad: () => void;
  onDelete: () => void;
  formatDate: (ts: number) => string;
}) {
  return (
    <Card className="cursor-pointer transition hover:border-emerald-500/50">
      <CardContent className="flex items-center justify-between p-4">
        <button onClick={onLoad} className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white">{label}</p>
            <Badge variant="secondary" className="text-[10px] uppercase">
              {getSaveSourceLabel(save.source)}
            </Badge>
          </div>
          <p className="text-xs text-zinc-400">
            {save.scoutName} &middot; {save.specialization} &middot; S
            {save.season} W{save.week}
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
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </CardContent>
    </Card>
  );
}
