"use client";

import { memo, useMemo, useRef, type KeyboardEvent } from "react";
import { Eye } from "lucide-react";
import type {
  ObservationSession,
  SessionPhase,
} from "@/engine/observation/types";
import { YouthPortrait } from "@/components/game/YouthPortrait";
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
  buildUp: "Build-up",
  transition: "Transition",
  setpiece: "Set piece",
  pressingSequence: "Press",
  counterAttack: "Counter",
  possession: "Possession",
};

function markerLabel(
  marker: ReturnType<typeof buildObservationPitchMarkers>[number],
): string {
  const details = [
    `${marker.name}, ${marker.position}`,
    marker.isFocused ? "focus" : "not focused",
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
  const venue = session.venueAtmosphere?.venueType === "schoolMatch"
    ? "School ground"
    : session.venueAtmosphere?.venueType?.replace(/([A-Z])/g, " $1").trim() || "School ground";

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
          : (index + 1 + markers.length) % markers.length;
    const nextMarker = markers[nextIndex];
    onSelectPlayer(nextMarker.playerId);
    const controls = pitchControlsRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-observation-pitch-marker]",
    );
    controls?.[nextIndex]?.focus({ preventScroll: true });
  };

  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      aria-labelledby="observation-pitch-heading"
      data-testid="observation-pitch"
    >
      <div
        ref={pitchControlsRef}
        className="relative min-h-[240px] flex-1 overflow-hidden bg-black sm:min-h-[300px]"
        aria-label={`Interactive observation pitch at ${phase.minute} minutes`}
        role="group"
        style={{
          backgroundImage: "url('/images/backgrounds/match-atmosphere.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-[#0a1628]/50" aria-hidden="true" />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 sm:p-4">
          <div>
            <div className="flex items-center gap-2">
              <Eye size={15} className="signal-moment" aria-hidden="true" />
              <h2 id="observation-pitch-heading" className="text-sm font-semibold text-zinc-100">
                {venue} · first half
              </h2>
            </div>
            <p className="mt-0.5 text-meta text-zinc-300">
              Watch the faces. Select the kid you need a second look at.
            </p>
          </div>
          <span className="rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-eyebrow font-semibold uppercase tracking-[0.12em] text-zinc-200">
            {PHASE_LABELS[phaseType] ?? "Live"}
          </span>
        </div>

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
              className={`group absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full ${
                isSelected ? "ring-2 ring-[color:var(--primary)] ring-offset-2 ring-offset-black" : ""
              }`}
              style={{ left: `${marker.x}%`, top: `${Math.min(marker.y, 68)}%` }}
            >
              <span className="relative h-11 w-11 overflow-hidden rounded-full border border-white/20">
                <YouthPortrait playerId={marker.playerId} size={48} className="h-11 w-11" />
                {marker.isFocused && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-[color:var(--signal-focus)]" />
                )}
                {marker.isStandout && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rotate-45 bg-[color:var(--signal-moment)] text-eyebrow font-black text-zinc-950">
                    <span className="-rotate-45 text-eyebrow">M</span>
                  </span>
                )}
              </span>
              <span className="pointer-events-none absolute left-1/2 top-12 hidden max-w-28 -translate-x-1/2 truncate rounded bg-black/80 px-1.5 py-0.5 text-meta font-medium text-white shadow sm:block">
                {marker.name}
              </span>
              {marker.isStandout && (
                <span className="sr-only">Moment</span>
              )}
              {marker.isFocused && (
                <span className="sr-only">Focus</span>
              )}
            </button>
          );
        })}

        <div
          className="pointer-events-none absolute left-3 top-20 z-20 flex flex-wrap gap-2 rounded-md bg-black/65 px-2 py-1.5 text-eyebrow text-zinc-200 backdrop-blur-sm sm:top-24"
          aria-hidden="true"
        >
          <span className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rotate-45 bg-signal-moment" /> Moment
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-[color:var(--signal-focus)]" /> Focus
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/55 to-transparent px-2 pb-2 pt-8 sm:px-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h3 className="text-eyebrow font-semibold uppercase tracking-[0.13em] text-zinc-300">
              Players in view
            </h3>
            <span className="text-eyebrow text-zinc-300">
              {activeMarkers.length} active {activeMarkers.length === 1 ? "moment" : "moments"}
            </span>
          </div>
          <ul
            className="flex gap-1.5 overflow-x-auto pb-0.5"
            aria-label="Synchronized list of players on the observation pitch"
          >
            {markers.map((marker) => {
              const isSelected = marker.playerId === selectedPlayerId;
              return (
                <li key={marker.playerId} className="min-w-0 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(marker.playerId)}
                    aria-pressed={isSelected}
                    className={`flex min-h-11 min-w-[9.5rem] items-center gap-2 rounded-md border px-2.5 py-2 text-left ${
                      isSelected
                        ? "border-[color:var(--primary)] bg-[color:var(--primary)]/15"
                        : "border-white/15 bg-black/45 hover:border-white/30"
                    }`}
                    aria-label={`Select ${markerLabel(marker)} for focus`}
                  >
                    <YouthPortrait playerId={marker.playerId} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-zinc-200">{marker.name}</span>
                      <span className="block truncate text-eyebrow text-zinc-300">
                        {marker.isFocused
                          ? "Focus"
                          : marker.hasMoment
                            ? "Moment"
                            : marker.position}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {selectedMarker
          ? `${selectedMarker.name} selected. ${selectedMarker.isFocused ? "Focus is active." : "Choose a lens in focus controls to allocate attention."}`
          : "No player selected."}
      </p>
    </section>
  );
});
