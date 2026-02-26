"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Eye, Zap, Brain, Dumbbell, Compass, Target } from "lucide-react";
import type {
  FocusTokenState,
  LensType,
  SessionPlayer,
  ObservationMode,
} from "@/engine/observation/types";

// =============================================================================
// Types
// =============================================================================

interface FocusPanelProps {
  focusTokens: FocusTokenState;
  players: SessionPlayer[];
  onAllocateFocus: (playerId: string, lens: LensType) => void;
  onRemoveFocus: (playerId: string) => void;
  disabled: boolean;
  mode: ObservationMode;
}

// =============================================================================
// Constants
// =============================================================================

const LENS_KEYS: LensType[] = ["technical", "physical", "mental", "tactical", "general"];

const LENS_CONFIG: Record<
  LensType,
  { label: string; textColor: string; bgColor: string; borderColor: string; icon: React.ElementType }
> = {
  technical: {
    label: "Technical",
    textColor: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500/40",
    icon: Target,
  },
  physical: {
    label: "Physical",
    textColor: "text-green-400",
    bgColor: "bg-green-500/20",
    borderColor: "border-green-500/40",
    icon: Dumbbell,
  },
  mental: {
    label: "Mental",
    textColor: "text-purple-400",
    bgColor: "bg-purple-500/20",
    borderColor: "border-purple-500/40",
    icon: Brain,
  },
  tactical: {
    label: "Tactical",
    textColor: "text-orange-400",
    bgColor: "bg-orange-500/20",
    borderColor: "border-orange-500/40",
    icon: Compass,
  },
  general: {
    label: "General",
    textColor: "text-zinc-400",
    bgColor: "bg-zinc-500/20",
    borderColor: "border-zinc-500/40",
    icon: Eye,
  },
};

// =============================================================================
// Sub-components
// =============================================================================

function TokenDots({ available, total }: { available: number; total: number }) {
  const used = total - available;
  return (
    <div className="flex items-center gap-1.5" aria-label={`${available} of ${total} focus tokens remaining`}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={[
            "h-3 w-3 rounded-full border transition-colors",
            i < used
              ? "border-amber-500/60 bg-amber-500/30"
              : "border-amber-400 bg-amber-400",
          ].join(" ")}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function LensBadge({ lens }: { lens: LensType }) {
  const { label, textColor, bgColor, borderColor } = LENS_CONFIG[lens];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${textColor} ${bgColor} ${borderColor}`}
    >
      {label}
    </span>
  );
}

type EffectivenessStatus = "warmup" | "normal" | "fatigued";

function getEffectiveness(
  playerId: string,
  lens: LensType | undefined,
  warmupPhases: Record<string, number>,
  phasesActive: number,
): EffectivenessStatus {
  if (!lens) return "normal";
  const key = `${playerId}:${lens}`;
  const warmup = warmupPhases[key] ?? 0;
  if (warmup < 1) return "warmup";
  if (phasesActive >= 6) return "fatigued";
  return "normal";
}

const EFFECTIVENESS_CONFIG: Record<
  EffectivenessStatus,
  { label: string; className: string }
> = {
  warmup:  { label: "warming up", className: "text-orange-400" },
  normal:  { label: "active",     className: "text-green-400"  },
  fatigued:{ label: "fatigued",   className: "text-red-400"    },
};

function EffectivenessIndicator({ status }: { status: EffectivenessStatus }) {
  const { label, className } = EFFECTIVENESS_CONFIG[status];
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${className}`}>
      <Zap className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function LensSelector({
  playerId,
  onSelect,
  onCancel,
}: {
  playerId: string;
  onSelect: (playerId: string, lens: LensType) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-900 p-2">
      <p className="mb-2 text-xs text-zinc-400">Select observation lens:</p>
      <div className="flex flex-wrap gap-1.5">
        {LENS_KEYS.map((lens) => {
          const { label, textColor, bgColor, borderColor, icon: Icon } = LENS_CONFIG[lens];
          return (
            <button
              key={lens}
              type="button"
              onClick={() => onSelect(playerId, lens)}
              className={[
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-100",
                textColor,
                bgColor,
                borderColor,
                "opacity-80",
              ].join(" ")}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 text-xs text-zinc-500 underline hover:text-zinc-300"
      >
        Cancel
      </button>
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

export function FocusPanel({
  focusTokens,
  players,
  onAllocateFocus,
  onRemoveFocus,
  disabled,
  mode,
}: FocusPanelProps) {
  const [lensPickerFor, setLensPickerFor] = useState<string | null>(null);

  const { available, total, allocations, warmupPhases } = focusTokens;
  const noTokensLeft = available === 0;

  const focusedPlayers = players.filter((p) => p.isFocused);
  const unfocusedPlayers = players.filter((p) => !p.isFocused);

  const isFullObservation = mode === "fullObservation";

  function handleAllocate(playerId: string, lens: LensType) {
    setLensPickerFor(null);
    onAllocateFocus(playerId, lens);
  }

  function handleFocusClick(playerId: string) {
    setLensPickerFor((prev) => (prev === playerId ? null : playerId));
  }

  return (
    <Card className="border-zinc-700/60 bg-zinc-900/80 text-zinc-100">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Eye className="h-4 w-4 text-amber-400" aria-hidden="true" />
            Focus Tokens
          </CardTitle>
          <div className="flex items-center gap-2">
            <TokenDots available={available} total={total} />
            <span className="text-xs tabular-nums text-zinc-400">
              {available}/{total}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-4 pb-4">
        {/* Active allocations */}
        {focusedPlayers.length > 0 && (
          <section aria-label="Active focus allocations">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Focused
            </p>
            <ul className="space-y-2" role="list">
              {focusedPlayers.map((player) => {
                const allocation = allocations.find(
                  (a) => a.playerId === player.playerId,
                );
                const lens = player.currentLens ?? "general";
                const effectiveness = getEffectiveness(
                  player.playerId,
                  lens,
                  warmupPhases,
                  allocation?.phasesActive ?? 0,
                );
                return (
                  <li
                    key={player.playerId}
                    className="flex items-start justify-between gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-zinc-100">
                          {player.name}
                        </span>
                        <LensBadge lens={lens} />
                      </div>
                      <EffectivenessIndicator status={effectiveness} />
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveFocus(player.playerId)}
                      disabled={disabled}
                      aria-label={`Remove focus from ${player.name}`}
                      className="mt-0.5 flex-shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* No tokens remaining notice */}
        {noTokensLeft && unfocusedPlayers.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-center">
            <p className="text-xs font-medium text-amber-400">
              No focus tokens remaining
            </p>
            {isFullObservation && (
              <p className="mt-0.5 text-xs text-zinc-500">
                Tokens refresh at half-time
              </p>
            )}
          </div>
        )}

        {/* Available players */}
        {unfocusedPlayers.length > 0 && !noTokensLeft && (
          <section aria-label="Available players to focus">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Available
            </p>
            <ul className="space-y-2" role="list">
              {unfocusedPlayers.map((player) => (
                <li key={player.playerId} className="space-y-0">
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-700/40 bg-zinc-800/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {player.name}
                      </p>
                      <p className="text-xs text-zinc-500">{player.position}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleFocusClick(player.playerId)}
                      disabled={disabled || noTokensLeft}
                      aria-expanded={lensPickerFor === player.playerId}
                      aria-controls={`lens-picker-${player.playerId}`}
                      className="h-7 border-zinc-600 bg-transparent px-2.5 text-xs text-zinc-300 hover:border-amber-500/60 hover:bg-amber-500/10 hover:text-amber-300"
                    >
                      Focus
                    </Button>
                  </div>
                  {lensPickerFor === player.playerId && (
                    <div id={`lens-picker-${player.playerId}`}>
                      <LensSelector
                        playerId={player.playerId}
                        onSelect={handleAllocate}
                        onCancel={() => setLensPickerFor(null)}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Empty state — no players */}
        {players.length === 0 && (
          <p className="py-4 text-center text-xs text-zinc-500">
            No players available to focus on.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
