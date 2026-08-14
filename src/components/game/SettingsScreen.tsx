"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { GameLayout } from "./GameLayout";
import { ScreenBackground } from "@/components/ui/screen-background";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  LogOut,
  AlertTriangle,
  MessageSquarePlus,
} from "lucide-react";
import { MAX_MANUAL_SLOTS } from "@/lib/db";
import { SettingsPreferences } from "./settings/SettingsPreferences";
import {
  exportGameData,
  importGameData,
  resetModData,
  getModdedKeys,
} from "@/lib/modLoader";
import { supabase } from "@/lib/supabase";
import { getLastCloudSyncStatus } from "@/lib/saveProvider";
import { getCountryData, getAvailableCountries } from "@/data/index";
import { SaveLoadModal } from "./SaveLoadModal";
import { FeedbackModal } from "./FeedbackModal";
import { isFeedbackSubmissionAvailable } from "@/lib/feedbackService";
import { AuthModal } from "./AuthModal";
import {
  BETA_CLOUD_SAVES_ENABLED,
  BETA_CLOUD_SAVES_MESSAGE,
} from "@/config/beta";
import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";
import { useShallow } from "zustand/react/shallow";

import { PillToggle } from "./settings/SettingsControls";

export function SettingsScreen() {
  const {
    gameState,
    saveSlots,
    saveSyncStatus,
    refreshSaveSlots,
    refreshSaveSyncStatus,
    retryPendingSaveSync,
    saveToSlot,
    isSaving,
    setScreen,
  } = useGameStore(
    useShallow((state) => ({
      gameState: state.gameState,
      saveSlots: state.saveSlots,
      saveSyncStatus: state.saveSyncStatus,
      refreshSaveSlots: state.refreshSaveSlots,
      refreshSaveSyncStatus: state.refreshSaveSyncStatus,
      retryPendingSaveSync: state.retryPendingSaveSync,
      saveToSlot: state.saveToSlot,
      isSaving: state.isSaving,
      setScreen: state.setScreen,
    })),
  );

  const {
    isLoading: isAuthLoading,
    isAuthenticated,
    displayName,
    cloudSaveEnabled,
    toggleCloudSave,
    signOut,
  } = useAuthStore(
    useShallow((state) => ({
      isLoading: state.isLoading,
      isAuthenticated: state.isAuthenticated,
      displayName: state.displayName,
      cloudSaveEnabled: state.cloudSaveEnabled,
      toggleCloudSave: state.toggleCloudSave,
      signOut: state.signOut,
    })),
  );

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showSaveLoadModal, setShowSaveLoadModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [moddedKeys, setModdedKeys] = useState<string[]>([]);
  const [modStatus, setModStatus] = useState<{
    message: string;
    kind: "success" | "error";
  } | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState(() =>
    getLastCloudSyncStatus(),
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const modTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => {
    clearTimeout(saveTimerRef.current);
    clearTimeout(modTimerRef.current);
  }, []);

  useEffect(() => {
    void refreshSaveSlots();
    void getModdedKeys().then(setModdedKeys);
  }, [refreshSaveSlots, isAuthenticated, cloudSaveEnabled]);

  useEffect(() => {
    const syncStatus = () => {
      setCloudSyncStatus(getLastCloudSyncStatus());
      void refreshSaveSyncStatus();
    };
    syncStatus();
    const intervalId = window.setInterval(syncStatus, 1000);
    return () => window.clearInterval(intervalId);
  }, [refreshSaveSyncStatus]);

  const hasActiveCareer = Boolean(gameState);

  const allManualSaves = saveSlots.filter((save) => save.slot > 0);
  const manualSaves = IS_YOUTH_EARLY_ACCESS
    ? allManualSaves.filter((save) => save.specialization === "youth")
    : allManualSaves;
  const usedSlots = new Set(allManualSaves.map((save) => save.slot));
  const reservedSlots = new Set(
    allManualSaves
      .filter(
        (save) =>
          !manualSaves.some((compatible) => compatible.slot === save.slot),
      )
      .map((save) => save.slot),
  );
  const unsupportedSaveCount = allManualSaves.length - manualSaves.length;
  const cloudAuthAvailable = BETA_CLOUD_SAVES_ENABLED && Boolean(supabase);
  const feedbackSubmissionAvailable = isFeedbackSubmissionAvailable();

  const handleSave = async (slot: number) => {
    if (reservedSlots.has(slot)) {
      setSaveStatus(
        `Error: Slot ${slot} is reserved by a preserved full-game save.`,
      );
      return;
    }

    const name = `Save ${slot}`;
    await saveToSlot(slot, name);
    setSaveStatus(`Saved to slot ${slot}`);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleQuickSave = async () => {
    let slot: number | null = null;
    for (let i = 1; i <= MAX_MANUAL_SLOTS; i++) {
      if (!usedSlots.has(i)) {
        slot = i;
        break;
      }
    }
    if (slot === null) {
      const oldest = [...manualSaves].sort((a, b) => a.savedAt - b.savedAt)[0];
      if (oldest) slot = oldest.slot;
    }
    if (slot === null) {
      setSaveStatus(
        "Error: No Youth save slot is available. Other-specialization saves remain preserved.",
      );
      return;
    }
    await handleSave(slot);
  };

  const content = (
      <div
        className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6"
        data-tutorial-id="settings-preferences"
        data-testid="settings-screen"
      >
        <div className="flex items-center justify-between gap-3">
          <h1 id="settings-title" className="text-2xl font-bold">Settings</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScreen(hasActiveCareer ? "dashboard" : "mainMenu")}
            className="min-h-11"
          >
            <ArrowLeft size={14} className="mr-1" aria-hidden="true" />
            {hasActiveCareer ? "Back to Desk" : "Back to main menu"}
          </Button>
        </div>

        <SettingsPreferences />

        {hasActiveCareer ? (
        <>
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
              <User size={18} className="text-emerald-500" aria-hidden="true" />
              Account
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {!cloudAuthAvailable ? (
              <div className="rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-3">
                <p className="text-sm font-medium text-white">
                  {BETA_CLOUD_SAVES_ENABLED
                    ? "Cloud account unavailable"
                    : "Cloud saves unavailable in this build"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  {BETA_CLOUD_SAVES_ENABLED
                    ? "The cloud service is not configured. Saves remain safely on this device."
                    : BETA_CLOUD_SAVES_MESSAGE}
                </p>
              </div>
            ) : isAuthLoading ? (
              <div className="rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-3">
                <p className="text-sm font-medium text-white">
                  Checking account...
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Verifying whether this browser already has a cloud session.
                </p>
              </div>
            ) : isAuthenticated ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {displayName}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {cloudSaveEnabled
                        ? "Signed in with cloud saves enabled"
                        : "Signed in on this device"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void signOut()}
                    className="min-h-11"
                  >
                    <LogOut size={12} className="mr-1" aria-hidden="true" />
                    Sign Out
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-3">
                  <div>
                    <p className="text-sm font-medium">Cloud Save Sync</p>
                    <p className="text-xs text-zinc-400">
                      {cloudSaveEnabled
                        ? BETA_CLOUD_SAVES_MESSAGE
                        : "Saves stay local until you turn sync on for this device."}
                    </p>
                  </div>
                  <PillToggle
                    checked={cloudSaveEnabled}
                    onChange={(enabled) => {
                      toggleCloudSave(enabled);
                      setCloudSyncStatus(getLastCloudSyncStatus());
                      void refreshSaveSlots();
                    }}
                    label="Toggle cloud saves"
                  />
                </div>

                <div className="rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-3">
                  <p className="text-sm font-medium text-white">
                    {cloudSaveEnabled
                      ? saveSyncStatus.pendingCount > 0
                        ? `${saveSyncStatus.pendingCount} cloud ${saveSyncStatus.pendingCount === 1 ? "change" : "changes"} queued`
                        : cloudSyncStatus.pending
                        ? "Sync in progress"
                        : cloudSyncStatus.lastError
                          ? "Sync needs attention"
                          : cloudSyncStatus.lastSync
                            ? `Last synced ${cloudSyncStatus.lastSync.toLocaleString()}`
                            : "Waiting for next save"
                      : "Cloud sync paused"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {cloudSaveEnabled
                      ? saveSyncStatus.pendingCount > 0
                        ? `Local save and delete choices are safe. Reconnect and retry the queue.${saveSyncStatus.lastError ? ` Last error: ${saveSyncStatus.lastError}` : ""}`
                        : cloudSyncStatus.lastError
                          ? `Local saves still work, but cloud sync failed: ${cloudSyncStatus.lastError}`
                        : "Manual saves and weekly autosaves write locally first, then sync in the background."
                      : "You can still save locally. Re-enable cloud sync any time to resume uploading."}
                  </p>
                  {cloudSaveEnabled && saveSyncStatus.pendingCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 min-h-11"
                      onClick={() => void retryPendingSaveSync()}
                    >
                      Retry Pending Sync
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-3">
                <p className="text-sm font-medium text-white">
                  Sign in to connect cloud saves
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Signing in connects your account. Turn on Cloud Save Sync
                  afterward when you want this device to upload and download
                  saves.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAuthModal(true)}
                    className="min-h-11"
                  >
                    Sign In
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
              <Download size={18} className="text-emerald-500" aria-hidden="true" />
              Data Mods
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-zinc-400">
              Export game data as JSON, edit club or league names and attributes,
              then re-import to play with custom data. Changes apply to new
              games only.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void exportGameData(getCountryData, getAvailableCountries());
                }}
                className="min-h-11"
              >
                <Download size={12} className="mr-1" aria-hidden="true" />
                Export Game Data
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".json";
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    void importGameData(file).then((result) => {
                      if (result.imported.length > 0) {
                        setModStatus({
                          message: `Imported ${result.imported.length} country data file(s)`,
                          kind: "success",
                        });
                        void getModdedKeys().then(setModdedKeys);
                      }
                      if (result.errors.length > 0) {
                        setModStatus({ message: result.errors.join(", "), kind: "error" });
                      }
                      clearTimeout(modTimerRef.current);
                      modTimerRef.current = setTimeout(
                        () => setModStatus(null),
                        4000,
                      );
                    });
                  };
                  input.click();
                }}
                className="min-h-11"
              >
                <Save size={12} className="mr-1" aria-hidden="true" />
                Import Custom Data
              </Button>

              {moddedKeys.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void resetModData().then(() => {
                      setModdedKeys([]);
                      setModStatus({ message: "Reset to default data", kind: "success" });
                      clearTimeout(modTimerRef.current);
                      modTimerRef.current = setTimeout(
                        () => setModStatus(null),
                        3000,
                      );
                    });
                  }}
                  className="min-h-11"
                >
                  <Trash2 size={12} className="mr-1" aria-hidden="true" />
                  Reset to Default
                </Button>
              )}
            </div>

            {modStatus && (
              <p
                className={`text-xs ${modStatus.kind === "error" ? "text-red-300" : "text-emerald-400"}`}
                role="status"
                aria-live="polite"
              >
                {modStatus.message}
              </p>
            )}

            {moddedKeys.length > 0 && (
              <div className="rounded-md border border-[#27272a] bg-[#0c0c0c] p-3">
                <p className="mb-1 text-xs font-medium text-zinc-300">
                  Active Mods
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {moddedKeys.map((key) => (
                    <Badge key={key} variant="secondary" className="text-xs">
                      {key}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
              <Save size={18} className="text-emerald-500" aria-hidden="true" />
              Saves
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void handleQuickSave()}
                disabled={isSaving}
                className="min-h-11"
              >
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
              <Button
                variant="outline"
                onClick={() => setShowSaveLoadModal(true)}
                className="min-h-11"
              >
                <Download size={14} className="mr-2" aria-hidden="true" />
                Manage Saves
              </Button>
            </div>

            {saveStatus && (
              <div
                className={`flex items-center gap-2 text-sm ${
                  saveStatus.startsWith("Error:") ? "text-red-400" : "text-emerald-400"
                }`}
                role="status"
              >
                {saveStatus.startsWith("Error:") ? (
                  <AlertTriangle size={14} aria-hidden="true" />
                ) : (
                  <Check size={14} aria-hidden="true" />
                )}
                <span>{saveStatus}</span>
              </div>
            )}

            <p className="text-xs leading-relaxed text-zinc-400">
              Game autosaves the opening loop and every week advance. Use Manage Saves for
              loading, deleting, and slot-by-slot save management across your{" "}
              {MAX_MANUAL_SLOTS} manual slots.
            </p>

            {IS_YOUTH_EARLY_ACCESS && unsupportedSaveCount > 0 && (
              <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-xs leading-relaxed text-zinc-400">
                Other-specialization saves stay preserved in their slots and are
                only viewable from Manage Saves in this Youth Scout build.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
              <MessageSquarePlus
                size={18}
                className="text-emerald-500"
                aria-hidden="true"
              />
              Feedback &amp; Support
            </h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-zinc-400">
              {feedbackSubmissionAvailable
                ? "Found a bug? Have a suggestion? We'd love to hear from you."
                : "Offline mode opens a pre-filled email draft so feedback is never submitted to a dead endpoint."}
            </p>
            <Button
              variant="outline"
              onClick={() => setShowFeedbackModal(true)}
              className="min-h-11"
            >
              <MessageSquarePlus size={14} className="mr-2" aria-hidden="true" />
              {feedbackSubmissionAvailable ? "Send Feedback" : "Draft Feedback Email"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <Button
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => setScreen("mainMenu")}
            >
              Quit to Main Menu
            </Button>
            <p className="mt-2 text-center text-xs text-zinc-400">
              Unsaved progress will be lost. The game autosaves the opening loop and each week.
            </p>
          </CardContent>
        </Card>
        </>
        ) : null}
      </div>
  );

  const dialogs = (
    <>
      {showSaveLoadModal && (
        <SaveLoadModal
          isOpen={showSaveLoadModal}
          onClose={() => setShowSaveLoadModal(false)}
        />
      )}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      />
    </>
  );

  if (hasActiveCareer) {
    return (
      <GameLayout>
        {content}
        {dialogs}
      </GameLayout>
    );
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#090b0e]"
      aria-labelledby="settings-title"
    >
      <ScreenBackground src="/images/backgrounds/menu-bg-1.png" opacity={0.88} />
      <div className="relative z-10 min-h-screen overflow-y-auto">
        {content}
      </div>
      {dialogs}
    </main>
  );
}
