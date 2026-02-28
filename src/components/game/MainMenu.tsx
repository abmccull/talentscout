"use client";

import { useEffect, useState, useRef } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { AuthModal } from "./AuthModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Trash2, LogOut } from "lucide-react";
import type { SaveRecord } from "@/lib/db";
import { ScreenBackground } from "@/components/ui/screen-background";
import { APP_VERSION } from "@/config/version";

// Session flag — splash only shown once per browser session.
let splashShownThisSession = false;

export function MainMenu() {
  const {
    setScreen,
    saveSlots,
    refreshSaveSlots,
    loadFromSlot,
    deleteSlot,
    isLoadingSave,
  } = useGameStore();

  const { isAuthenticated, displayName, signOut } = useAuthStore();

  const [showLoadPicker, setShowLoadPicker] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSplash, setShowSplash] = useState(!splashShownThisSession);
  const splashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    refreshSaveSlots();
  }, [refreshSaveSlots]);

  useEffect(() => {
    if (!showSplash) return;
    splashShownThisSession = true;
    splashTimerRef.current = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(splashTimerRef.current);
  }, [showSplash]);

  const autosave = saveSlots.find((s) => s.slot === 0);
  const manualSaves = saveSlots.filter((s) => s.slot > 0);

  const handleContinue = async () => {
    const mostRecent = [...saveSlots].sort((a, b) => b.savedAt - a.savedAt)[0];
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

  if (showSplash) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a]">
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
      </div>
    );
  }

  if (isLoadingSave) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a]">
        <ScreenBackground src="/images/backgrounds/menu-bg-1.png" opacity={0.8} />
        <div className="relative z-10">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          <p className="mt-4 text-zinc-400">Loading save...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a]">
      <ScreenBackground src="/images/backgrounds/menu-bg-1.png" opacity={0.65} />
      {/* Title */}
      <div className="relative z-10 mb-16 text-center">
        <h1 className="mb-2 text-6xl font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
          Talent<span className="text-emerald-500">Scout</span>
        </h1>
        <p className="text-lg text-zinc-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">Football Scout Career Simulator</p>
      </div>

      {!showLoadPicker ? (
        <div className="relative z-10 flex w-64 flex-col gap-3">
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
          <Button
            variant="outline"
            size="lg"
            className="w-full text-base"
            onClick={() => setScreen("scenarioSelect")}
          >
            Scenarios
          </Button>

          {/* Auth status indicator */}
          <div className="mt-2 flex flex-col items-center gap-1.5">
            {isAuthenticated ? (
              <>
                <p className="text-xs text-zinc-500">
                  Signed in as{" "}
                  <span className="text-emerald-400">{displayName}</span>
                </p>
                <button
                  onClick={() => void signOut()}
                  className="flex items-center gap-1 text-xs text-zinc-600 transition hover:text-zinc-400"
                >
                  <LogOut size={11} aria-hidden="true" />
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-xs text-zinc-600 underline-offset-2 transition hover:text-emerald-400 hover:underline"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="relative z-10 w-full max-w-md space-y-3 px-4">
          <h2 className="text-center text-lg font-semibold text-white">
            Load Game
          </h2>

          {autosave && (
            <SaveSlotCard
              save={autosave}
              label="Autosave"
              onLoad={() => void handleLoad(autosave.slot)}
              onDelete={() => void handleDelete(autosave.slot)}
              formatDate={formatDate}
            />
          )}

          {manualSaves.map((save) => (
            <SaveSlotCard
              key={save.slot}
              save={save}
              label={save.name}
              onLoad={() => void handleLoad(save.slot)}
              onDelete={() => void handleDelete(save.slot)}
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
        v{APP_VERSION} — The scout&apos;s eye sees what others miss
      </p>

      {/* Auth modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}

// ─── SaveSlotCard ─────────────────────────────────────────────────────────────

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
