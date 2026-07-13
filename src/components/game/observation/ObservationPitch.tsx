"use client";

import { memo, useMemo, useRef, type KeyboardEvent } from "react";
import { Eye, Sparkles } from "lucide-react";
import type {
  ObservationSession,
  SessionPhase,
} from "@/engine/observation/types";
import {
  buildObservationPitchMarkers,
  inferObservationPhaseType,
} from "./observationPitchModel";

interface ObservationPitchProps {
  session: ObservationSession;
  phase: SessionPhase;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
}

const PHASE_LABELS: Record<string, string> = {
  buildUp: "Build-up shape",
  transition: "Transition test",
  setpiece: "Set-piece pressure",
  pressingSequence: "Pressing response",
  counterAttack: "Counter-attack",
  possession: "Possession phase",
};

function markerLabel(
  marker: ReturnType<typeof buildObservationPitchMarkers>[number],
): string {
  const details = [
    `${marker.name}, ${marker.position}`,
    marker.isFocused ? "focus active" : "not focused",
    marker.hasMoment
      ? `${marker.momentCount} observable ${marker.momentCount === 1 ? "moment" : "moments"} now`
      : "no observable moment now",
    marker.isStandout ? "standout moment" : null,
  ].filter(Boolean);
  return details.join(", ");
}

export const ObservationPitch = memo(function ObservationPitch({
  session,
  phase,
  selectedPlayerId,
  onSelectPlayer,
}: ObservationPitchProps) {
  const markers = useMemo(
    () => buildObservationPitchMarkers(session.players, phase),
    [phase, session.players],
  );
  const phaseType = inferObservationPhaseType(phase);
  const activeMarkers = markers.filter((marker) => marker.hasMoment);
  const pitchControlsRef = useRef<HTMLDivElement>(null);
  const selectedMarker = markers.find(
    (marker) => marker.playerId === selectedPlayerId,
  );

  const handleMarkerKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const backwards = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? markers.length - 1
        : backwards
          ? (index - 1 + markers.length) % markers.length
          : (index + 1) % markers.length;
    const nextMarker = markers[nextIndex];
    onSelectPlayer(nextMarker.playerId);
    const controls = pitchControlsRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-observation-pitch-marker]",
    );
    controls?.[nextIndex]?.focus({ preventScroll: true });
  };

  return (
    <section
      className="min-w-0 rounded-xl border border-white/10 bg-[#090d0b]/95 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:p-4"
      aria-labelledby="observation-pitch-heading"
      data-testid="observation-pitch"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Eye size={15} className="text-emerald-400" aria-hidden="true" />
            <h2 id="observation-pitch-heading" className="text-sm font-semibold text-zinc-100">
              Live scouting view
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Select a player to direct your attention and choose an evidence lens.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300">
          {PHASE_LABELS[phaseType] ?? "Live phase"}
        </span>
      </div>

      <div
        ref={pitchControlsRef}
        className="relative aspect-[105/68] min-h-[220px] w-full overflow-hidden rounded-lg border border-emerald-200/20 bg-[#285c31] shadow-inner sm:min-h-[260px]"
        aria-label={`Interactive observation pitch at ${phase.minute} minutes`}
        role="group"
      >
        <svg
          viewBox="0 0 105 68"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="observation-action-zone">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="observation-pitch-shade" x1="0" x2="1">
              <stop offset="0%" stopColor="#0b2613" stopOpacity="0.16" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.025" />
              <stop offset="100%" stopColor="#0b2613" stopOpacity="0.16" />
            </linearGradient>
          </defs>

          {Array.from({ length: 10 }, (_, index) => (
            <rect
              key={index}
              x={index * 10.5}
              y="0"
              width="10.5"
              height="68"
              fill={index % 2 === 0 ? "#ffffff" : "#061b0c"}
              opacity={index % 2 === 0 ? "0.035" : "0.025"}
            />
          ))}
          <rect x="0" y="0" width="105" height="68" fill="url(#observation-pitch-shade)" />

          <g fill="none" stroke="rgba(255,255,255,0.64)" strokeWidth="0.38">
            <rect x="1.2" y="1.2" width="102.6" height="65.6" />
            <line x1="52.5" y1="1.2" x2="52.5" y2="66.8" />
            <circle cx="52.5" cy="34" r="6.2" />
            <circle cx="52.5" cy="34" r="0.55" fill="rgba(255,255,255,0.64)" />
            <rect x="1.2" y="13.8" width="16.5" height="40.4" />
            <rect x="87.3" y="13.8" width="16.5" height="40.4" />
            <rect x="1.2" y="24.8" width="5.8" height="18.4" />
            <rect x="98" y="24.8" width="5.8" height="18.4" />
            <path d="M17.7 28.2 A8 8 0 0 1 17.7 39.8" />
            <path d="M87.3 28.2 A8 8 0 0 0 87.3 39.8" />
          </g>

          {activeMarkers.length > 1 && (
            <polyline
              points={activeMarkers.map((marker) => `${marker.x * 1.05},${marker.y * 0.68}`).join(" ")}
              fill="none"
              stroke="rgba(251,191,36,0.52)"
              strokeWidth="0.6"
              strokeDasharray="1.4 1.4"
              className="motion-safe:animate-pulse"
            />
          )}
          {activeMarkers.map((marker) => (
            <circle
              key={marker.playerId}
              cx={marker.x * 1.05}
              cy={marker.y * 0.68}
              r={marker.isStandout ? 9 : 6.5}
              fill="url(#observation-action-zone)"
              className="motion-safe:animate-pulse"
            />
          ))}
        </svg>

        {markers.map((marker, index) => {
          const isSelected = marker.playerId === selectedPlayerId;
          return (
            <button
              key={marker.playerId}
              type="button"
              data-observation-pitch-marker
              onClick={() => onSelectPlayer(marker.playerId)}
              onKeyDown={(event) => handleMarkerKeyDown(event, index)}
              aria-label={`Track ${markerLabel(marker)}`}
              aria-pressed={isSelected}
              tabIndex={isSelected || (!selectedPlayerId && index === 0) ? 0 : -1}
              className="group absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-950"
              style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            >
              <span
                aria-hidden="true"
                className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 text-[9px] font-black shadow-[0_3px_10px_rgba(0,0,0,0.55)] transition motion-reduce:transition-none ${
                  marker.isFocused
                    ? "border-emerald-200 bg-emerald-500 text-emerald-950"
                    : marker.hasMoment
                      ? "border-amber-200 bg-amber-400 text-amber-950"
                      : "border-white/70 bg-zinc-900 text-white"
                } ${isSelected ? "scale-110 ring-2 ring-white/90 ring-offset-2 ring-offset-emerald-900" : "group-hover:scale-105"}`}
              >
                {marker.normalizedPosition}
                {marker.isStandout && (
                  <Sparkles
                    size={11}
                    className="absolute -right-2 -top-2 text-amber-200 drop-shadow"
                  />
                )}
              </span>
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-1/2 top-10 hidden max-w-28 -translate-x-1/2 truncate rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-medium text-white shadow sm:block ${
                  isSelected ? "ring-1 ring-white/30" : ""
                }`}
              >
                {marker.name}
              </span>
            </button>
          );
        })}

        <div
          className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1.5 rounded-md bg-black/55 px-2 py-1.5 text-[9px] text-zinc-200 backdrop-blur-sm"
          aria-hidden="true"
        >
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" /> Moment</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-400" /> Focus</span>
          <span className="hidden sm:inline">Illustrative positions</span>
        </div>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {selectedMarker
          ? `${selectedMarker.name} selected. ${selectedMarker.isFocused ? "Focus is active." : "Choose a lens in focus controls to allocate attention."}`
          : "No player selected."}
      </p>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-400">
            Players in view
          </h3>
          <span className="text-[10px] text-zinc-400">
            {activeMarkers.length} active {activeMarkers.length === 1 ? "moment" : "moments"}
          </span>
        </div>
        <ul
          className="grid grid-cols-1 gap-1.5 min-[430px]:grid-cols-2 xl:grid-cols-3"
          aria-label="Synchronized list of players on the observation pitch"
        >
          {markers.map((marker) => {
            const isSelected = marker.playerId === selectedPlayerId;
            return (
              <li key={marker.playerId} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectPlayer(marker.playerId)}
                  aria-pressed={isSelected}
                  className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    isSelected
                      ? "border-emerald-400/60 bg-emerald-500/10"
                      : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/5"
                  }`}
                  aria-label={`Select ${markerLabel(marker)} for focus`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      marker.isFocused
                        ? "bg-emerald-500 text-emerald-950"
                        : marker.hasMoment
                          ? "bg-amber-400 text-amber-950"
                          : "bg-zinc-700 text-zinc-200"
                    }`}
                    aria-hidden="true"
                  >
                    {marker.normalizedPosition}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-zinc-200">{marker.name}</span>
                    <span className="block truncate text-[10px] text-zinc-400">
                      {marker.isFocused
                        ? "Focus active"
                        : marker.hasMoment
                          ? `${marker.momentCount} live ${marker.momentCount === 1 ? "moment" : "moments"}`
                          : marker.position}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
});
