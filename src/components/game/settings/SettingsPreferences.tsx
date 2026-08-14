"use client";

import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Accessibility,
  Gamepad2,
  Monitor,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSettingsStore, type AppSettings } from "@/stores/settingsStore";
import { useAudio } from "@/lib/audio/useAudio";
import type { AudioChannel } from "@/lib/audio/audioEngine";
import { PillToggle, RadioGroup, SettingRow } from "./SettingsControls";

type SettingsTab = "audio" | "graphics" | "gameplay" | "accessibility";

const TABS: { id: SettingsTab; label: string; icon: typeof Volume2 }[] = [
  { id: "audio", label: "Audio", icon: Volume2 },
  { id: "graphics", label: "Graphics", icon: Monitor },
  { id: "gameplay", label: "Gameplay", icon: Gamepad2 },
  { id: "accessibility", label: "Accessibility", icon: Accessibility },
];

const SLIDER_CLASS =
  "h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-emerald-500 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500";

export function SettingsPreferences() {
  const [tab, setTab] = useState<SettingsTab>("audio");
  const { setSetting, resetDefaults, ...settings } = useSettingsStore(
    useShallow((state) => ({
      setSetting: state.setSetting,
      resetDefaults: state.resetDefaults,
      fontSize: state.fontSize,
      backgroundIntensity: state.backgroundIntensity,
      uiContrast: state.uiContrast,
      preferFullscreen: state.preferFullscreen,
      colorblindMode: state.colorblindMode,
      reducedMotion: state.reducedMotion,
      cinematicMoments: state.cinematicMoments,
      emotionalAudioCues: state.emotionalAudioCues,
      autoOpenCareerDefiningMoments: state.autoOpenCareerDefiningMoments,
      autoPlayWeekSimulation: state.autoPlayWeekSimulation,
      confirmBeforeAdvance: state.confirmBeforeAdvance,
    })),
  );
  const { volumes, setVolume, toggleMute, resetVolumes } = useAudio();

  return (
    <div className="space-y-4" data-testid="settings-preferences">
      <div
        role="tablist"
        aria-label="Settings categories"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`settings-tab-${id}`}
              aria-selected={selected}
              aria-controls={`settings-panel-${id}`}
              onClick={() => setTab(id)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
                selected
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                  : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-white"
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "audio" && (
        <Card id="settings-panel-audio" role="tabpanel" aria-labelledby="settings-tab-audio">
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
              {volumes.muted ? (
                <VolumeX size={18} className="text-emerald-500" aria-hidden="true" />
              ) : (
                <Volume2 size={18} className="text-emerald-500" aria-hidden="true" />
              )}
              Audio
            </h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <SettingRow
              title="Mute all audio"
              description="Silence music, effects, and ambience immediately"
            >
              <PillToggle
                checked={volumes.muted}
                onChange={() => toggleMute()}
                label="Mute all audio"
              />
            </SettingRow>

            {(
              [
                { channel: "master" as const, label: "Master volume" },
                { channel: "music" as const, label: "Music" },
                { channel: "sfx" as const, label: "Sound effects" },
                { channel: "ambience" as const, label: "Ambience" },
              ] satisfies { channel: AudioChannel | "master"; label: string }[]
            ).map(({ channel, label }) => {
              const value =
                channel === "master" ? volumes.master : volumes[channel as AudioChannel];
              const pct = Math.round(value * 100);
              const inputId = `audio-volume-${channel}`;
              const disabled = volumes.muted && channel !== "master";
              return (
                <div key={channel} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor={inputId} className="text-sm font-medium text-zinc-300">
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
                    disabled={disabled}
                    onChange={(event) => setVolume(channel, Number(event.target.value) / 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    aria-valuetext={`${pct} percent`}
                    className={`${SLIDER_CLASS} ${disabled ? "opacity-40" : "opacity-100"}`}
                  />
                </div>
              );
            })}

            <SettingRow
              title="Emotional audio cues"
              description="Optional stingers. Every cue is also shown in text."
            >
              <PillToggle
                checked={settings.emotionalAudioCues}
                onChange={(value) => setSetting("emotionalAudioCues", value)}
                label="Toggle emotional audio cues"
              />
            </SettingRow>
          </CardContent>
        </Card>
      )}

      {tab === "graphics" && (
        <Card id="settings-panel-graphics" role="tabpanel" aria-labelledby="settings-tab-graphics">
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
              <Monitor size={18} className="text-emerald-500" aria-hidden="true" />
              Graphics
            </h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-300">Interface scale</p>
              <RadioGroup<AppSettings["fontSize"]>
                name="fontSize"
                value={settings.fontSize}
                onChange={(value) => setSetting("fontSize", value)}
                options={[
                  { value: "small", label: "Small" },
                  { value: "medium", label: "Medium" },
                  { value: "large", label: "Large" },
                ]}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-300">Background detail</p>
              <RadioGroup<AppSettings["backgroundIntensity"]>
                name="backgroundIntensity"
                value={settings.backgroundIntensity}
                onChange={(value) => setSetting("backgroundIntensity", value)}
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ]}
              />
              <p className="text-xs leading-5 text-zinc-400">
                High shows more of the scene art. Low keeps menus darker and easier to read.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-300">UI contrast</p>
              <RadioGroup<AppSettings["uiContrast"]>
                name="uiContrast"
                value={settings.uiContrast}
                onChange={(value) => setSetting("uiContrast", value)}
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "high", label: "High contrast" },
                ]}
              />
            </div>

            <SettingRow
              title="Fullscreen"
              description="Fills the display. In the desktop build this is the same fullscreen as F11."
            >
              <PillToggle
                checked={settings.preferFullscreen}
                onChange={(value) => setSetting("preferFullscreen", value)}
                label="Toggle fullscreen"
              />
            </SettingRow>
          </CardContent>
        </Card>
      )}

      {tab === "gameplay" && (
        <Card id="settings-panel-gameplay" role="tabpanel" aria-labelledby="settings-tab-gameplay">
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
              <Gamepad2 size={18} className="text-emerald-500" aria-hidden="true" />
              Gameplay
            </h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <SettingRow
              title="Auto-play week simulation"
              description="Advance resolved days automatically after their consequences appear"
            >
              <PillToggle
                checked={settings.autoPlayWeekSimulation}
                onChange={(value) => setSetting("autoPlayWeekSimulation", value)}
                label="Toggle auto-play week simulation"
              />
            </SettingRow>

            <SettingRow
              title="Confirm before advancing week"
              description="Ask before committing the planner and resolving the week"
            >
              <PillToggle
                checked={settings.confirmBeforeAdvance}
                onChange={(value) => setSetting("confirmBeforeAdvance", value)}
                label="Toggle confirm before advancing week"
              />
            </SettingRow>

            <div className="space-y-2">
              <label htmlFor="cinematic-moments" className="text-sm font-medium text-zinc-300">
                Career moment presentation
              </label>
              <select
                id="cinematic-moments"
                value={settings.cinematicMoments}
                onChange={(event) =>
                  setSetting(
                    "cinematicMoments",
                    event.target.value as AppSettings["cinematicMoments"],
                  )
                }
                className="min-h-11 w-full rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="full">Full presentation</option>
                <option value="reduced">Reduced effects</option>
                <option value="off">Archive only</option>
              </select>
              <p className="text-xs leading-5 text-zinc-400">
                Changes visual delivery only. Decisions and consequences stay the same.
              </p>
            </div>

            <SettingRow
              title="Auto-open defining moments"
              description="Turn off to keep every moment in the Career archive without an interruption"
            >
              <PillToggle
                checked={settings.autoOpenCareerDefiningMoments}
                onChange={(value) => setSetting("autoOpenCareerDefiningMoments", value)}
                label="Toggle automatic career-defining moments"
              />
            </SettingRow>
          </CardContent>
        </Card>
      )}

      {tab === "accessibility" && (
        <Card
          id="settings-panel-accessibility"
          role="tabpanel"
          aria-labelledby="settings-tab-accessibility"
        >
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
              <Accessibility size={18} className="text-emerald-500" aria-hidden="true" />
              Accessibility
            </h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <SettingRow
              title="Reduce motion"
              description="Minimise animations, transitions, and cinematic movement"
            >
              <PillToggle
                checked={settings.reducedMotion}
                onChange={(value) => setSetting("reducedMotion", value)}
                label="Toggle reduced motion"
              />
            </SettingRow>

            <div className="space-y-2">
              <label htmlFor="colorblind-mode" className="text-sm font-medium text-zinc-300">
                Safer colors
              </label>
              <select
                id="colorblind-mode"
                value={settings.colorblindMode}
                onChange={(event) =>
                  setSetting(
                    "colorblindMode",
                    event.target.value as AppSettings["colorblindMode"],
                  )
                }
                className="min-h-11 w-full rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2 text-sm text-white"
              >
                <option value="none">Default palette</option>
                <option value="protanopia">Safer for red-weak vision</option>
                <option value="deuteranopia">Safer for green-weak vision</option>
                <option value="tritanopia">Safer for blue-weak vision</option>
              </select>
              <p className="text-xs text-quiet">
                Remaps status colors. It does not simulate a color vision deficiency.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            resetDefaults();
            resetVolumes();
          }}
        >
          <RotateCcw size={14} className="mr-2" aria-hidden="true" />
          Reset settings
        </Button>
      </div>
    </div>
  );
}
