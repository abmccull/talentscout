"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { AppSettings } from "@/stores/settingsStore";
import { GameLayout } from "./GameLayout";
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
  Volume2,
  VolumeX,
  Monitor,
  Accessibility,
  MessageSquarePlus,
} from "lucide-react";
import { MAX_MANUAL_SLOTS } from "@/lib/db";
import { useAudio } from "@/lib/audio/useAudio";
import type { AudioChannel } from "@/lib/audio/audioEngine";
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

function PillToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-11 w-16 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        checked ? "bg-emerald-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`absolute left-1.5 top-1.5 h-8 w-8 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function RadioGroup<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex min-h-11 min-w-11 cursor-pointer items-center gap-1.5 rounded-md border px-4 py-2 text-sm transition ${
            value === opt.value
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
              : "border-[#27272a] text-zinc-400 hover:border-zinc-600 hover:text-white"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

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

  const { setSetting, ...settings } = useSettingsStore(
    useShallow((state) => ({
      setSetting: state.setSetting,
      fontSize: state.fontSize,
      colorblindMode: state.colorblindMode,
      reducedMotion: state.reducedMotion,
      cinematicMoments: state.cinematicMoments,
      emotionalAudioCues: state.emotionalAudioCues,
      autoOpenCareerDefiningMoments: state.autoOpenCareerDefiningMoments,
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

  const { volumes, setVolume, toggleMute } = useAudio();

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

  if (!gameState) return null;

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

  return (
    <GameLayout>
      <div
        className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6"
        data-tutorial-id="settings-preferences"
      >
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Settings</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScreen("dashboard")}
            className="min-h-11"
          >
            <ArrowLeft size={14} className="mr-1" aria-hidden="true" />
            Back
          </Button>
        </div>

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
              {volumes.muted ? (
                <VolumeX
                  size={18}
                  className="text-emerald-500"
                  aria-hidden="true"
                />
              ) : (
                <Volume2
                  size={18}
                  className="text-emerald-500"
                  aria-hidden="true"
                />
              )}
              Audio
            </h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-3">
              <div className="flex items-center gap-2">
                <VolumeX
                  size={14}
                  className="text-zinc-400"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">Mute All Audio</p>
              </div>
              <PillToggle
                checked={volumes.muted}
                onChange={() => toggleMute()}
                label="Mute all audio"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="cinematic-moments" className="text-sm font-medium text-zinc-300">
                Career moment presentation
              </label>
              <select
                id="cinematic-moments"
                value={settings.cinematicMoments}
                onChange={(event) => setSetting(
                  "cinematicMoments",
                  event.target.value as AppSettings["cinematicMoments"],
                )}
                className="min-h-11 w-full rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="full">Full presentation</option>
                <option value="reduced">Reduced effects</option>
                <option value="off">Archive only</option>
              </select>
              <p className="text-xs leading-5 text-zinc-400">
                Changes visual delivery only. Decisions, consequences, and the career archive remain identical.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-3">
              <div>
                <p className="text-sm font-medium">Emotional audio cues</p>
                <p className="text-xs text-zinc-400">Optional stingers; all information is also shown in text</p>
              </div>
              <PillToggle
                checked={settings.emotionalAudioCues}
                onChange={(value) => setSetting("emotionalAudioCues", value)}
                label="Toggle emotional audio cues"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-3">
              <div>
                <p className="text-sm font-medium">Auto-open defining moments</p>
                <p className="text-xs text-zinc-400">Turn off to keep every moment in the Career archive without an interruption</p>
              </div>
              <PillToggle
                checked={settings.autoOpenCareerDefiningMoments}
                onChange={(value) => setSetting("autoOpenCareerDefiningMoments", value)}
                label="Toggle automatic career-defining moments"
              />
            </div>

            {(
              [
                { channel: "master" as const, label: "Master Volume" },
                { channel: "music" as const, label: "Music" },
                { channel: "sfx" as const, label: "SFX" },
                { channel: "ambience" as const, label: "Ambience" },
              ] satisfies { channel: AudioChannel | "master"; label: string }[]
            ).map(({ channel, label }) => {
              const value =
                channel === "master"
                  ? volumes.master
                  : volumes[channel as AudioChannel];
              const pct = Math.round(value * 100);
              const inputId = `audio-volume-${channel}`;
              return (
                <div key={channel} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor={inputId}
                      className="text-sm font-medium text-zinc-300"
                    >
                      {label}
                    </label>
                    <span
                      className="w-10 text-right text-xs tabular-nums text-zinc-400"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {pct}%
                    </span>
                  </div>
                  <input
                    id={inputId}
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={pct}
                    onChange={(e) =>
                      setVolume(channel, Number(e.target.value) / 100)
                    }
                    disabled={volumes.muted && channel !== "master"}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    aria-valuetext={`${pct} percent`}
                    className={`h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-emerald-500 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 ${
                      volumes.muted && channel !== "master"
                        ? "opacity-40"
                        : "opacity-100"
                    }`}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
              <Monitor size={18} className="text-emerald-500" aria-hidden="true" />
              Display
            </h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-300">Font Size</p>
              <RadioGroup<AppSettings["fontSize"]>
                name="fontSize"
                value={settings.fontSize}
                onChange={(v) => setSetting("fontSize", v)}
                options={[
                  { value: "small", label: "Small" },
                  { value: "medium", label: "Medium" },
                  { value: "large", label: "Large" },
                ]}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="colorblind-mode"
                className="text-sm font-medium text-zinc-300"
              >
                Colorblind Mode
              </label>
              <select
                id="colorblind-mode"
                value={settings.colorblindMode}
                onChange={(e) =>
                  setSetting(
                    "colorblindMode",
                    e.target.value as AppSettings["colorblindMode"],
                  )
                }
                className="min-h-11 w-full rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="none">None</option>
                <option value="protanopia">Protanopia (red deficiency)</option>
                <option value="deuteranopia">
                  Deuteranopia (green deficiency)
                </option>
                <option value="tritanopia">Tritanopia (blue deficiency)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
              <Accessibility
                size={18}
                className="text-emerald-500"
                aria-hidden="true"
              />
              Accessibility
            </h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-3">
              <div>
                <p className="text-sm font-medium">Reduce Motion</p>
                <p className="text-xs text-zinc-400">
                  Minimise animations and transitions
                </p>
              </div>
              <PillToggle
                checked={settings.reducedMotion}
                onChange={(v) => setSetting("reducedMotion", v)}
                label="Toggle reduced motion"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-300">
                Keyboard Shortcuts
              </p>
              <div className="rounded-md border border-[#27272a] bg-[#0c0c0c] p-3">
                <ul
                  className="space-y-1.5 text-xs text-zinc-400"
                  aria-label="Keyboard shortcut reference"
                >
                  {(
                    [
                      ["Esc", "Back to Desk"],
                      ["1", "Desk"],
                      ["2", "Planner"],
                      ["3", "Prospects"],
                      ["4", "Reports"],
                      ["5", "World"],
                      ["6", "Career"],
                      ["Space", "Advance week (Planner screen)"],
                      ["?", "Open Settings"],
                      ["Ctrl+S", "Open Settings (save management)"],
                      ["F1", "Send Feedback"],
                    ] as [string, string][]
                  ).map(([key, desc]) => (
                    <li key={key} className="flex items-center gap-3">
                      <kbd className="inline-flex min-w-[2.25rem] items-center justify-center rounded border border-[#3f3f46] bg-[#1c1c1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
                        {key}
                      </kbd>
                      <span>{desc}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-xs text-zinc-400">
                  Shortcuts are disabled while typing in any text field.
                </p>
              </div>
            </div>
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
              Game autosaves every time you advance a week. Use Manage Saves for
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
              Unsaved progress will be lost. The game autosaves each week.
            </p>
          </CardContent>
        </Card>
      </div>

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
    </GameLayout>
  );
}
