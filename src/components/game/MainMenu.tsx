"use client";

import { useEffect, useState, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore, type SaveSlotSummary } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  Cloud,
  Loader2,
  LogOut,
  Map,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { ScreenBackground } from "@/components/ui/screen-background";
import { APP_VERSION } from "@/config/version";
import { AuthModal } from "./AuthModal";
import { supabase } from "@/lib/supabase";
import { getScenarioById } from "@/engine/scenarios/scenarioSetup";
import {
  BETA_CLOUD_SAVES_ENABLED,
  BETA_CLOUD_SAVES_MESSAGE,
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
  } = useGameStore(useShallow((state) => ({
    setScreen: state.setScreen,
    saveSlots: state.saveSlots,
    refreshSaveSlots: state.refreshSaveSlots,
    loadFromSlot: state.loadFromSlot,
    deleteSlot: state.deleteSlot,
    isLoadingSave: state.isLoadingSave,
    selectedScenarioId: state.selectedScenarioId,
    setSelectedScenario: state.setSelectedScenario,
  })));

  const {
    isLoading: isAuthLoading,
    isAuthenticated,
    displayName,
    signOut,
    cloudSaveEnabled,
  } = useAuthStore(useShallow((state) => ({
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    displayName: state.displayName,
    signOut: state.signOut,
    cloudSaveEnabled: state.cloudSaveEnabled,
  })));

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

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShowSplash(false);
      return;
    }

    const handleSplashKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowSplash(false);
      }
    };

    window.addEventListener("keydown", handleSplashKeyDown);
    splashTimerRef.current = setTimeout(() => setShowSplash(false), 2200);
    return () => {
      window.removeEventListener("keydown", handleSplashKeyDown);
      clearTimeout(splashTimerRef.current);
    };
  }, [showSplash]);

  const compatibleSaveSlots = IS_YOUTH_EARLY_ACCESS
    ? saveSlots.filter(
        (save) => save.specialization === "youth" || Boolean(save.unavailable),
      )
    : saveSlots;
  const autosave = compatibleSaveSlots.find((s) => s.slot === 0);
  const manualSaves = compatibleSaveSlots.filter((s) => s.slot > 0);
  const unsupportedSaveCount = saveSlots.length - compatibleSaveSlots.length;
  const continueSave = [...compatibleSaveSlots]
    .filter((save) => !save.unavailable)
    .sort((left, right) => right.savedAt - left.savedAt)[0];

  const handleContinue = async () => {
    if (continueSave) {
      await loadFromSlot(continueSave.slot);
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

  const hasSaveEntries = compatibleSaveSlots.length > 0;
  const hasLoadableSave = Boolean(continueSave);
  const cloudAuthAvailable = BETA_CLOUD_SAVES_ENABLED && Boolean(supabase);
  const pendingScenario = selectedScenarioId
    ? getScenarioById(selectedScenarioId)
    : undefined;

  if (showSplash) {
    return (
      <main
        className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a]"
        data-testid="main-menu-splash"
        aria-labelledby="talentscout-splash-title"
      >
        <ScreenBackground src="/images/backgrounds/loading.png" opacity={0.6} />
        <div className="relative z-10 animate-[splashFadeIn_800ms_ease-out_both] text-center">
          <h1
            id="talentscout-splash-title"
            className="mb-3 text-5xl font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-7xl"
          >
            Talent<span className="text-emerald-500 drop-shadow-[0_0_24px_rgba(16,185,129,0.5)]">Scout</span>
          </h1>
          <p className="text-lg tracking-wide text-zinc-400 animate-[splashFadeIn_1000ms_ease-out_400ms_both] drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            The scout&apos;s eye sees what others miss
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSplash(false)}
          className="absolute bottom-6 right-6 z-10 min-h-11 rounded-lg border border-white/15 bg-black/35 px-4 text-sm font-medium text-zinc-300 backdrop-blur transition hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          Skip intro
        </button>
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
        <div
          className="relative z-10 flex w-64 flex-col gap-3"
          data-testid="main-menu-actions"
        >
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
            disabled={!hasLoadableSave}
            onClick={() => void handleContinue()}
          >
            {continueSave?.recovery
              ? "Continue from verified backup"
              : continueSave?.localUnavailable
                ? "Continue from cloud recovery"
                : "Continue"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full text-base"
            disabled={!hasSaveEntries}
            onClick={() => setShowLoadPicker(true)}
          >
            Load Game
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full text-base text-zinc-300"
            onClick={() => setScreen("futureRoadmap")}
          >
            <Map size={16} className="mr-2" aria-hidden="true" />
            Future roadmap
          </Button>

          {continueSave?.recovery && (
            <div
              className="flex gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-left"
              role="status"
            >
              <ShieldCheck
                size={16}
                className="mt-0.5 shrink-0 text-amber-300"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-amber-100">
                Continue will load the last verified backup because the newest local generation is damaged.
              </p>
            </div>
          )}
          {continueSave?.localUnavailable && !continueSave.recovery && (
            <div
              className="flex gap-2 rounded-lg border border-sky-400/25 bg-sky-400/10 p-3 text-left"
              role="status"
            >
              <Cloud
                size={16}
                className="mt-0.5 shrink-0 text-sky-300"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-sky-100">
                Continue will load the verified remote copy because the local copy is unavailable.
              </p>
            </div>
          )}
          {!hasLoadableSave && compatibleSaveSlots.some((save) => save.unavailable) && (
            <div
              className="flex gap-2 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-left"
              role="alert"
            >
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-red-300"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-red-100">
                No verified copy can be loaded. Open Load Game to review the damaged save and its recovery message.
              </p>
            </div>
          )}
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

          {cloudAuthAvailable && (
            <div className="mt-2 flex flex-col items-center gap-1.5">
            {isAuthLoading ? (
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
              </>
            )}
            </div>
          )}
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
  const isUnavailable = Boolean(save.unavailable);
  const statusId = `main-menu-save-${save.slot}-${save.source}-status`;
  const loadLabel = save.recovery
    ? `Load ${label} from verified backup`
    : save.localUnavailable
      ? `Load ${label} from cloud recovery`
      : `Load ${label}`;

  return (
    <Card
      className={`transition ${
        isUnavailable
          ? "border-red-500/25 bg-red-950/10"
          : "hover:border-emerald-500/50"
      }`}
    >
      <CardContent className="flex items-center justify-between p-4">
        <button
          onClick={onLoad}
          disabled={isUnavailable}
          aria-label={loadLabel}
          aria-describedby={
            save.recovery || save.unavailable || save.localUnavailable
              ? statusId
              : undefined
          }
          className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-white">{label}</p>
            <Badge variant="secondary" className="text-[10px] uppercase">
              {getSaveSourceLabel(save.source)}
            </Badge>
            {save.recovery && (
              <Badge className="border border-amber-400/30 bg-amber-400/10 text-[10px] text-amber-300">
                Verified backup
              </Badge>
            )}
            {save.unavailable && (
              <Badge className="border border-red-400/30 bg-red-400/10 text-[10px] text-red-300">
                Damaged
              </Badge>
            )}
            {save.localUnavailable && (
              <Badge className="border border-sky-400/30 bg-sky-400/10 text-[10px] text-sky-300">
                Cloud recovery
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-400">
            {save.scoutName} &middot; {save.specialization} &middot; S
            {save.season} W{save.week}
          </p>
          <p className="text-xs text-zinc-500">
            Rep: {Math.round(save.reputation)} &middot; {formatDate(save.savedAt)}
          </p>
          {(save.recovery || save.unavailable || save.localUnavailable) && (
            <span
              id={statusId}
              className={`mt-1.5 block text-xs leading-relaxed ${
                save.unavailable
                  ? "text-red-300"
                  : save.localUnavailable
                    ? "text-sky-300"
                    : "text-amber-300"
              }`}
              role="status"
            >
              {save.unavailable
                ? save.unavailable.message
                : save.localUnavailable
                  ? "The local copy is unavailable; this verified remote copy can still be loaded."
                  : save.recovery?.message ??
                    "The newest generation is damaged; this is the last verified backup."}
            </span>
          )}
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
