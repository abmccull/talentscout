"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { AppSettings } from "@/stores/settingsStore";
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
  Volume2,
  VolumeX,
  Monitor,
  Accessibility,
  Gamepad2,
  Bell,
} from "lucide-react";
import { MAX_MANUAL_SLOTS } from "@/lib/db";
import { useAudio } from "@/lib/audio/useAudio";
import type { AudioChannel } from "@/lib/audio/audioEngine";

// ---------------------------------------------------------------------------
// Small reusable primitives used only within SettingsScreen
// ---------------------------------------------------------------------------

/** Emerald pill toggle — matches the Cloud Saves and Mute toggles above. */
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
      className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        checked ? "bg-emerald-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/** Three-option radio row (Small/Medium/Large, Slow/Normal/Fast, etc.). */
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
    <div className="flex gap-2" role="radiogroup" aria-label={name}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ${
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

// ---------------------------------------------------------------------------

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

  const { setSetting, ...settings } = useSettingsStore();

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { volumes, setVolume, toggleMute } = useAudio();

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
                    className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      cloudSaveEnabled ? "bg-emerald-500" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        cloudSaveEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

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

        {/* ── Audio ───────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
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
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Mute toggle */}
            <div className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <VolumeX
                  size={14}
                  className="text-zinc-400"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">Mute All Audio</p>
              </div>
              <button
                role="switch"
                aria-checked={volumes.muted}
                aria-label="Mute all audio"
                onClick={toggleMute}
                className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  volumes.muted ? "bg-emerald-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    volumes.muted ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Volume sliders */}
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

        {/* ── Display ─────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Monitor size={18} className="text-emerald-500" aria-hidden="true" />
              Display
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Font Size */}
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

            {/* Colorblind Mode */}
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
                className="w-full rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="none">None</option>
                <option value="protanopia">Protanopia (red deficiency)</option>
                <option value="deuteranopia">Deuteranopia (green deficiency)</option>
                <option value="tritanopia">Tritanopia (blue deficiency)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* ── Accessibility ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Accessibility size={18} className="text-emerald-500" aria-hidden="true" />
              Accessibility
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Reduced Motion */}
            <div className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Reduce Motion</p>
                <p className="text-xs text-zinc-500">
                  Minimise animations and transitions
                </p>
              </div>
              <PillToggle
                checked={settings.reducedMotion}
                onChange={(v) => setSetting("reducedMotion", v)}
                label="Toggle reduced motion"
              />
            </div>

            {/* Keyboard shortcuts reference */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-300">
                Keyboard Shortcuts
              </p>
              <div className="rounded-md border border-[#27272a] bg-[#0c0c0c] p-3">
                <ul className="space-y-1.5 text-xs text-zinc-400" aria-label="Keyboard shortcut reference">
                  {(
                    [
                      ["Esc", "Back to Dashboard"],
                      ["1", "Dashboard"],
                      ["2", "Calendar"],
                      ["3", "Players"],
                      ["4", "Reports"],
                      ["5", "Career"],
                      ["6", "Inbox"],
                      ["7", "Network"],
                      ["8", "Settings"],
                      ["Space", "Advance week (Calendar screen)"],
                      ["?", "Open Settings"],
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
                <p className="mt-2.5 text-xs text-zinc-600">
                  Shortcuts are disabled while typing in any text field.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Gameplay ─────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gamepad2 size={18} className="text-emerald-500" aria-hidden="true" />
              Gameplay
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Auto-Advance Speed */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-300">Auto-Advance Speed</p>
              <RadioGroup<AppSettings["autoAdvanceSpeed"]>
                name="autoAdvanceSpeed"
                value={settings.autoAdvanceSpeed}
                onChange={(v) => setSetting("autoAdvanceSpeed", v)}
                options={[
                  { value: "slow", label: "Slow" },
                  { value: "normal", label: "Normal" },
                  { value: "fast", label: "Fast" },
                ]}
              />
            </div>

            {/* Confirm Before Advance */}
            <div className="flex items-center justify-between rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Confirm Before Advancing</p>
                <p className="text-xs text-zinc-500">
                  Show a prompt before advancing the week
                </p>
              </div>
              <PillToggle
                checked={settings.confirmBeforeAdvance}
                onChange={(v) => setSetting("confirmBeforeAdvance", v)}
                label="Toggle confirm before advance"
              />
            </div>

            {/* Notification Level */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-300">Notification Level</p>
              <RadioGroup<AppSettings["notificationLevel"]>
                name="notificationLevel"
                value={settings.notificationLevel}
                onChange={(v) => setSetting("notificationLevel", v)}
                options={[
                  { value: "all", label: "All" },
                  { value: "important", label: "Important Only" },
                  { value: "critical", label: "Critical Only" },
                ]}
              />
            </div>
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

                          {/* Cloud sync — not yet implemented */}
                          {isAuthenticated && cloudSaveEnabled && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled
                              aria-label="Cloud sync coming soon"
                              title="Cloud Sync — Coming Soon"
                            >
                              <Cloud
                                size={12}
                                className="mr-1 opacity-50"
                                aria-hidden="true"
                              />
                              <span className="text-xs opacity-50">
                                Coming Soon
                              </span>
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
