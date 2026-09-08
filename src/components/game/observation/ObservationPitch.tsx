"use client";

import { memo, useMemo, useRef, type KeyboardEvent } from "react";
import { Eye } from "lucide-react";
import type { ObservationSession, SessionPhase } from "@/engine/observation/types";
import { YouthPortraitWithFallback } from "@/components/game/YouthPortrait";
import { buildObservationPitchMarkers, inferObservationPhaseType } from "./observationPitchModel";

interface ObservationPitchProps {
  session: ObservationSession;
  phase: SessionPhase;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
}

const PHASE_LABELS: Record<string, string> = {
  buildUp: "Build-up", transition: "Transition", setpiece: "Set piece",
  pressingSequence: "Pressing sequence", counterAttack: "Counterattack", possession: "Possession",
};

function markerLabel(marker: ReturnType<typeof buildObservationPitchMarkers>[number]): string {
  return [
    `${marker.name}, ${marker.position}`,
    marker.isFocused ? "focus active" : "not focused",
    marker.hasMoment ? `${marker.momentCount} observable ${marker.momentCount === 1 ? "moment" : "moments"} now` : "no observable moment now",
    marker.isStandout ? "standout moment" : null,
  ].filter(Boolean).join(", ");
}

export const ObservationPitch = memo(function ObservationPitch({
  session, phase, selectedPlayerId, onSelectPlayer,
}: ObservationPitchProps) {
  const markers = useMemo(() => buildObservationPitchMarkers(session.players, phase), [phase, session.players]);
  const phaseType = inferObservationPhaseType(phase);
  const controlsRef = useRef<HTMLDivElement>(null);
  const selectedMarker = markers.find((marker) => marker.playerId === selectedPlayerId);
  const focusActive = markers.some((marker) => marker.isFocused);
  const venue = session.venueAtmosphere?.venueType === "schoolMatch"
    ? "School ground"
    : session.venueAtmosphere?.venueType?.replace(/([A-Z])/g, " $1").trim() || "Touchline";

  const handleMarkerKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const backwards = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? markers.length - 1
      : backwards ? (index - 1 + markers.length) % markers.length : (index + 1) % markers.length;
    onSelectPlayer(markers[nextIndex].playerId);
    const nextControl = controlsRef.current?.querySelectorAll<HTMLButtonElement>("[data-observation-pitch-marker]")[nextIndex];
    nextControl?.focus({ preventScroll: true });
    nextControl?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-labelledby="observation-pitch-heading" data-testid="observation-pitch">
      <div
        className="relative flex min-h-[200px] flex-1 flex-col justify-between overflow-hidden bg-[#19221b] sm:min-h-[320px] lg:min-h-[360px]"
        aria-label={`Observation pitch at ${phase.minute} minutes`}
      >
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 motion-reduce:transition-none"
          style={{ backgroundImage: "url('/images/backgrounds/activities/touchline-documentary.webp')", transform: focusActive ? "scale(1.025)" : "scale(1)" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/10" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/20 to-transparent" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <p className="dossier-eyebrow text-white/75">From the touchline</p>
            <h2 id="observation-pitch-heading" className="mt-1 text-base font-semibold capitalize text-white sm:text-lg">{venue}</h2>
          </div>
          <span className="text-sm font-medium text-white/90">{PHASE_LABELS[phaseType] ?? "Live play"}</span>
        </div>
        <div className="relative px-4 pb-3 pt-3 sm:px-6 sm:pb-6 sm:pt-8">
          <p className="max-w-2xl font-editorial text-lg leading-relaxed text-white sm:text-2xl">{phase.description || "Watch the passage. Decide whose movement deserves a closer look."}</p>
          {phase.atmosphereEvent && <details className="mt-3 max-w-2xl text-sm leading-6 text-white/80"><summary className="cursor-pointer py-2 text-xs text-white/80">Around the ground</summary><p>{phase.atmosphereEvent.description}</p></details>}
          {focusActive && <p className="mt-3 hidden items-center gap-2 text-xs font-medium text-white/85 sm:flex"><Eye size={14} aria-hidden="true" />{markers.filter((marker) => marker.isFocused).map((marker) => marker.name).join(" · ")}<span className="text-white/60">in focus</span></p>}
        </div>
      </div>
      <div ref={controlsRef} className="min-w-0 shrink-0 bg-[var(--surface)] px-4 py-3 sm:px-6 sm:py-4" role="group" aria-label="Players in view">
        <div className="mb-2 flex items-center justify-between gap-3 sm:mb-3">
          <h3 className="dossier-eyebrow text-zinc-300">Players in view</h3>
          <span className="hidden text-xs text-zinc-400 sm:block">Select a player to direct your attention</span>
        </div>
        <ul className="flex snap-x gap-3 overflow-x-auto pb-2 sm:gap-4" aria-label="Players on the observation pitch">
          {markers.map((marker, index) => {
            const isSelected = marker.playerId === selectedPlayerId;
            return (
              <li key={marker.playerId} className="w-[176px] shrink-0 snap-start sm:w-[136px]">
                <button
                  type="button" data-observation-pitch-marker onClick={() => onSelectPlayer(marker.playerId)} onKeyDown={(event) => handleMarkerKeyDown(event, index)}
                  aria-label={`Track ${markerLabel(marker)}`} aria-pressed={isSelected} tabIndex={isSelected || (!selectedMarker && index === 0) ? 0 : -1}
                  className="group flex w-full items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--surface)] sm:block"
                >
                  <span className={`relative block h-16 w-16 shrink-0 overflow-hidden border-b-[3px] bg-[var(--background)] transition-opacity duration-200 motion-reduce:transition-none sm:mb-2 sm:aspect-[4/3] sm:h-auto sm:w-full ${isSelected ? "border-[var(--primary)]" : "border-transparent"} ${focusActive && !marker.isFocused && !isSelected ? "opacity-65 group-hover:opacity-100 group-focus-visible:opacity-100" : "opacity-100"}`}>
                    <YouthPortraitWithFallback playerId={marker.playerId} size={96} alt={marker.name} className="h-full w-full rounded-none object-cover object-top ring-0 ring-offset-0" />
                    {marker.isFocused && <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/80 px-2 py-1 text-xs font-semibold text-white"><Eye size={12} aria-hidden="true" /> Focus</span>}
                    {marker.isStandout && <span className="absolute right-2 top-2 h-2 w-2 bg-[var(--signal-moment)]" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0"><span className={`block text-sm font-semibold leading-5 ${isSelected ? "text-[var(--foreground)]" : "text-zinc-300"}`}>{marker.name}</span>
                  <span className="mt-0.5 block text-xs text-zinc-400">{marker.position}{marker.isStandout ? " · Standout moment" : marker.hasMoment ? " · In this passage" : ""}</span></span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{selectedMarker ? `${selectedMarker.name} selected. ${selectedMarker.isFocused ? "Focus is active." : "Choose a lens in focus controls to allocate attention."}` : "No player selected."}</p>
    </section>
  );
});
