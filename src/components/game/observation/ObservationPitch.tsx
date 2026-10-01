"use client";

import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Eye } from "lucide-react";
import type {
  ObservationSession,
  SessionPhase,
} from "@/engine/observation/types";
import { YouthPortraitWithFallback } from "@/components/game/YouthPortrait";
import {
  buildObservationPitchMarkers,
  observationPassageLabel,
} from "./observationPitchModel";
import { createObservationPitchLayout } from "./observationPitchLayout";

interface ObservationPitchProps {
  session: ObservationSession;
  phase: SessionPhase;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
}

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
  const passageLabel = observationPassageLabel(phase);
  const activeMarkers = markers.filter((marker) => marker.hasMoment);
  const pitchControlsRef = useRef<HTMLDivElement>(null);
  const keyboardRevealFrameRef = useRef<number | null>(null);
  const [fieldSize, setFieldSize] = useState({ width: 320, height: 240 });
  const layout = useMemo(
    () => createObservationPitchLayout(markers, fieldSize.width, fieldSize.height),
    [markers, fieldSize.width, fieldSize.height],
  );

  useEffect(() => {
    const field = pitchControlsRef.current;
    if (!field) return;
    const measure = () => {
      const { width, height } = field.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setFieldSize((previous) => previous.width === width && previous.height === height
        ? previous : { width, height });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined"
      ? null : new ResizeObserver(measure);
    observer?.observe(field);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [layout.minimumHeight]);

  useEffect(() => () => {
    if (keyboardRevealFrameRef.current !== null) {
      cancelAnimationFrame(keyboardRevealFrameRef.current);
    }
  }, []);

  const revealKeyboardMarker = (target: HTMLButtonElement) => {
    // Touch selection stays local. Tab and roving keys must reveal the actual
    // focused portrait, its selected ring, and the caption below it.
    if (!target.matches(":focus-visible")) return;
    if (keyboardRevealFrameRef.current !== null) {
      cancelAnimationFrame(keyboardRevealFrameRef.current);
    }
    keyboardRevealFrameRef.current = requestAnimationFrame(() => {
      keyboardRevealFrameRef.current = null;
      if (!target.isConnected || document.activeElement !== target
        || !target.matches(":focus-visible")) return;
      const rect = target.getBoundingClientRect();
      const caption = target.querySelector<HTMLElement>("[data-observation-pitch-caption]")?.getBoundingClientRect();
      const header = document.querySelector<HTMLElement>("header")?.getBoundingClientRect();
      const controls = document.querySelector<HTMLElement>("[data-testid='mobile-observation-controls']")?.getBoundingClientRect();
      const visibleTop = Math.max(0, header?.bottom ?? 0) + 8;
      const visibleBottom = Math.min(window.innerHeight, controls?.top ?? window.innerHeight) - 8;
      const top = Math.min(rect.top - 4, caption?.top ?? rect.top);
      const bottom = Math.max(rect.bottom + 4, caption?.bottom ?? rect.bottom);
      if (top >= visibleTop && bottom <= visibleBottom) return;
      // Centering the scroll-margin footprint leaves room for fixed Watch
      // chrome and the caption; do not animate repeated keyboard navigation.
      target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    });
  };

  const selectedMarker = markers.find(
    (marker) => marker.playerId === selectedPlayerId,
  );
  const venue = session.venueAtmosphere?.venueType === "schoolMatch"
    ? "School ground"
    : session.venueAtmosphere?.venueType === "trainingVisit"
      ? "Training ground"
      : session.venueAtmosphere?.venueType?.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase()) || "School ground";

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
    const target = controls?.[nextIndex];
    if (target) {
      target.focus({ preventScroll: true });
      revealKeyboardMarker(target);
    }
  };

  return (
    <section
      className="relative flex min-w-0 flex-1 flex-col"
      aria-labelledby="observation-pitch-heading"
      data-testid="observation-pitch"
    >
      <div
        className="relative flex flex-1 flex-col overflow-hidden bg-black"
        style={{
          backgroundImage: "url('/images/backgrounds/activities/school-match.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-[#0a1628]/50" aria-hidden="true" />

        <div className="pointer-events-none relative z-20 flex shrink-0 flex-wrap items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 sm:p-4">
          <div>
            <div className="flex items-center gap-2">
              <Eye size={15} className="signal-moment" aria-hidden="true" />
              <h2 id="observation-pitch-heading" className="text-sm font-semibold text-zinc-100">
                {venue}
              </h2>
            </div>
            <p className="mt-0.5 text-meta text-zinc-300">
              Watch the faces. Select the kid you need a second look at.
            </p>
          </div>
          <span className="rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-eyebrow font-semibold uppercase tracking-[0.12em] text-zinc-200">
            {passageLabel}
          </span>
        </div>

        <div
          className="pointer-events-none relative z-20 mx-3 mb-3 flex shrink-0 flex-wrap gap-2 text-eyebrow text-zinc-200 sm:mx-4"
          aria-hidden="true"
        >
          <span className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-signal-moment" /> Moment
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-[color:var(--signal-focus)]" /> Focus
          </span>
        </div>

        <div
          ref={pitchControlsRef}
          className="relative z-10 flex-1"
          aria-label={`Interactive observation pitch at ${phase.minute} minutes`}
          role="group"
          style={{ minHeight: layout.minimumHeight }}
        >
        {markers.map((marker, index) => {
          const isSelected = marker.playerId === selectedPlayerId;
          const position = layout.positions[index];
          return (
            <button
              key={marker.playerId}
              type="button"
              data-observation-pitch-marker
              onClick={() => onSelectPlayer(marker.playerId)}
              onFocus={(event) => revealKeyboardMarker(event.currentTarget)}
              onKeyDown={(event) => handleMarkerKeyDown(event, index)}
              aria-label={`Track ${markerLabel(marker)}`}
              aria-pressed={isSelected}
              tabIndex={isSelected || (!selectedPlayerId && index === 0) ? 0 : -1}
              className={`group absolute z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full ${
                isSelected ? "ring-2 ring-[color:var(--primary)] ring-offset-2 ring-offset-black" : ""
              }`}
              style={{ left: position.x, top: position.y,
                scrollMarginTop: 8, scrollMarginBottom: 32,
                scrollMarginLeft: 8, scrollMarginRight: 8,
              }}
            >
              <span className="relative h-16 w-16 overflow-hidden rounded-full border border-white/20">
                <YouthPortraitWithFallback
                  playerId={marker.playerId}
                  size={64}
                  className="h-16 w-16"
                  alt={marker.name}
                />
                {marker.isFocused && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-[color:var(--signal-focus)]" />
                )}
                {marker.isStandout && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[color:var(--signal-moment)] text-eyebrow font-black text-zinc-950">
                    !
                  </span>
                )}
              </span>
              <span data-observation-pitch-caption className="pointer-events-none absolute left-1/2 top-[4.25rem] max-w-[72px] -translate-x-1/2 truncate rounded bg-black/80 px-1.5 py-0.5 text-meta font-medium text-white shadow">
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
        </div>

        <div className="relative z-20 shrink-0 bg-gradient-to-t from-black/80 via-black/55 to-transparent px-2 pb-2 pt-3 sm:px-3">
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
                    <YouthPortraitWithFallback playerId={marker.playerId} size={32} alt={marker.name} />
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
