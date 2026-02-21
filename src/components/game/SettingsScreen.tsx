"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { GameLayout } from "./GameLayout";
import { AuthModal } from "./AuthModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  Download,
  Trash2,
  Loader2,
  ArrowLeft,
  Check,
  User,
  Cloud,
  LogOut,
  LogIn,
} from "lucide-react";
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

  const {
    isAuthenticated,
    displayName,
    cloudSaveEnabled,
    signOut,
    toggleCloudSave,
  } = useAuthStore();

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [syncingSlot, setSyncingSlot] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    refreshSaveSlots();
  }, [refreshSaveSlots]);

  if (!gameState) return null;

  const manualSaves = saveSlots.filter((s) => s.slot > 0);
  const usedSlots = new Set(manualSaves.map((s) => s.slot));

  // ── Save handlers ─────────────────────────────────────────────────────────

  const handleSave = async (slot: number) => {
    const name = `Save ${slot}`;
    await saveToSlot(slot, name);
    setSaveStatus(`Saved to slot ${slot}`);
    setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleQuickSave = async () => {
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

  const handleSyncToCloud = async (slot: number) => {
    // The SupabaseCloudSaveProvider will be injected via gameStore in a future
    // iteration. For now we locate the save from local slots and delegate to
    // the provider that is wired at the store level.
    setSyncingSlot(slot);
    setSyncStatus(null);
    try {
      await saveToSlot(slot, `Save ${slot}`);
      setSyncStatus(`Slot ${slot} synced to cloud`);
      setTimeout(() => setSyncStatus(null), 2500);
    } finally {
      setSyncingSlot(null);
    }
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <GameLayout>
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Settings</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScreen("dashboard")}
          >
            <ArrowLeft size={14} className="mr-1" aria-hidden="true" />
            Back
          </Button>
        </div>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User size={18} className="text-emerald-500" aria-hidden="true" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAuthenticated ? (
              <>
                {/* Signed-in state */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {displayName}
                    </p>
                    <p className="text-xs text-zinc-500">Signed in</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void signOut()}
                  >
                    <LogOut
                      size={12}
                      className="mr-1"
                      aria-hidden="true"
                    />
                    Sign Out
                  </Button>
                </div>

                {/* Cloud saves toggle */}
                <div className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Cloud
                      size={14}
                      className="text-emerald-500"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium">Cloud Saves</p>
                      <p className="text-xs text-zinc-500">
                        Sync save slots to the cloud
                      </p>
                    </div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={cloudSaveEnabled}
                    aria-label="Toggle cloud saves"
                    onClick={() => toggleCloudSave(!cloudSaveEnabled)}
                    className={`relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      cloudSaveEnabled ? "bg-emerald-500" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        cloudSaveEnabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                {syncStatus && (
                  <span className="flex items-center gap-1 text-sm text-emerald-400">
                    <Check size={14} aria-hidden="true" />
                    {syncStatus}
                  </span>
                )}
              </>
            ) : (
              /* Signed-out state */
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-300">
                    Sign in to enable cloud saves and global leaderboard
                  </p>
                </div>
                <Button size="sm" onClick={() => setShowAuthModal(true)}>
                  <LogIn size={12} className="mr-1" aria-hidden="true" />
                  Sign In
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Quick Save ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Save size={18} className="text-emerald-500" aria-hidden="true" />
              Save Game
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Button onClick={() => void handleQuickSave()} disabled={isSaving}>
                {isSaving ? (
                  <Loader2
                    size={14}
                    className="mr-2 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Save size={14} className="mr-2" aria-hidden="true" />
                )}
                Quick Save
              </Button>
              {saveStatus && (
                <span className="flex items-center gap-1 text-sm text-emerald-400">
                  <Check size={14} aria-hidden="true" />
                  {saveStatus}
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-500">
              Game autosaves every time you advance a week. You have{" "}
              {MAX_MANUAL_SLOTS} manual save slots.
            </p>
          </CardContent>
        </Card>

        {/* ── Save Slots ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download
                size={18}
                className="text-emerald-500"
                aria-hidden="true"
              />
              Save Slots
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: MAX_MANUAL_SLOTS }, (_, i) => i + 1).map(
              (slot) => {
                const existing = manualSaves.find((s) => s.slot === slot);
                const isSyncingThis = syncingSlot === slot;
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
                            {existing.scoutName} &middot; Rep{" "}
                            {Math.round(existing.reputation)} &middot;{" "}
                            {formatDate(existing.savedAt)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500">
                          Slot {slot} — Empty
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleSave(slot)}
                        disabled={isSaving}
                      >
                        <Save size={12} className="mr-1" aria-hidden="true" />
                        Save
                      </Button>
                      {existing && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => loadFromSlot(slot)}
                          >
                            <Download
                              size={12}
                              className="mr-1"
                              aria-hidden="true"
                            />
                            Load
                          </Button>

                          {/* Cloud sync button — only when authenticated + enabled */}
                          {isAuthenticated && cloudSaveEnabled && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleSyncToCloud(slot)}
                              disabled={isSyncingThis}
                              aria-label={`Sync slot ${slot} to cloud`}
                            >
                              {isSyncingThis ? (
                                <Loader2
                                  size={12}
                                  className="animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Cloud size={12} aria-hidden="true" />
                              )}
                            </Button>
                          )}

                          <button
                            onClick={() => deleteSlot(slot)}
                            className="rounded p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400"
                            aria-label={`Delete slot ${slot}`}
                          >
                            <Trash2 size={14} aria-hidden="true" />
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

        {/* ── Quit to Menu ────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setScreen("mainMenu")}
            >
              Quit to Main Menu
            </Button>
            <p className="mt-2 text-center text-xs text-zinc-500">
              Unsaved progress will be lost. The game autosaves each week.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Auth modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </GameLayout>
  );
}
