"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDialogFocusTrap } from "@/lib/a11y/useDialogFocusTrap";
import { useGameStore } from "@/stores/gameStore";
import type { ObservationSession } from "@/engine/observation/types";
import { MODE_FLAGGED_NOUN } from "@/engine/observation/types";
import { isOpeningDiscoverySession } from "@/engine/youth/openingCase";

export function observationLeavePolicy(session: ObservationSession | null): "blocked" | "confirm" | "leave" {
  if (!session || session.state !== "active" || isOpeningDiscoverySession(session)) return "blocked";
  const hasWork = session.currentPhaseIndex > 0
    || session.flaggedMoments.length > 0
    || session.reflectionNotes.length > 0
    || session.insightPointsEarned > 0
    || Object.keys(session.evidenceDecisions ?? {}).length > 0
    || session.players.some((player) => player.isFocused || player.focusedPhases.length > 0)
    || session.phases.some((phase) => phase.selectedChoiceId || phase.selectedDataPointId
      || Object.keys(phase.selectedDialogueOptionIds ?? {}).length > 0);
  return hasWork ? "confirm" : "leave";
}

/** A confirmation applies only to the exact watch the player reviewed. */
export function confirmObservationLeave(
  expected: ObservationSession,
  current: ObservationSession | null,
  endSession: () => void,
): boolean {
  if (current !== expected || observationLeavePolicy(current) === "blocked") return false;
  endSession();
  return true;
}

export function LeaveObservationDialog({ session, onCancel, onConfirm }: {
  session: ObservationSession;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialogFocusTrap(dialogRef, true, { onClose: onCancel, initialFocusRef: cancelRef });
  const live = session.mode === "fullObservation";
  const noun = MODE_FLAGGED_NOUN[session.mode];
  const flagCount = session.flaggedMoments.length;
  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog" aria-modal="true" aria-labelledby="leave-observation-title" aria-describedby="leave-observation-loss">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#11161c] p-5 shadow-2xl">
        <h2 id="leave-observation-title" className="text-lg font-semibold text-white">
          Leave this {live ? "watch" : "session"}?
        </h2>
        <div id="leave-observation-loss" className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-300">
          <p>{flagCount > 0
            ? `Your ${flagCount} flagged ${flagCount === 1 ? noun.singular : noun.plural} and unfiled session notes will be discarded.`
            : "Your unfiled session notes and observation progress will be discarded."}</p>
          <p>No new observation evidence or completion rewards will be banked. This activity will remain unfinished when you return to the day.</p>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button ref={cancelRef} type="button" variant="outline" onClick={onCancel}>
            {live ? "Keep watching" : "Keep working"}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>Leave and discard</Button>
        </div>
      </div>
    </div>
  );
}

export function LeaveObservationButton({ session, className = "" }: { session: ObservationSession; className?: string }) {
  const [pendingSession, setPendingSession] = useState<ObservationSession | null>(null);
  const cancel = useCallback(() => setPendingSession(null), []);
  useEffect(() => {
    if (pendingSession && session !== pendingSession) setPendingSession(null);
  }, [session, pendingSession]);
  const requestLeave = () => {
    const store = useGameStore.getState();
    const current = store.activeSession;
    const policy = observationLeavePolicy(current);
    if (policy === "confirm") setPendingSession(current);
    else if (policy === "leave") store.endObservationSession();
  };
  const confirm = () => {
    const store = useGameStore.getState();
    if (pendingSession) confirmObservationLeave(pendingSession, store.activeSession, store.endObservationSession);
    setPendingSession(null);
  };
  if (observationLeavePolicy(session) === "blocked") return null;
  return <>
    <Button type="button" variant="ghost" className={`min-h-11 shrink-0 text-zinc-300 ${className}`} onClick={requestLeave}>
      {session.mode === "fullObservation" ? "Leave watch…" : "Leave session…"}
    </Button>
    {pendingSession && <LeaveObservationDialog session={pendingSession} onCancel={cancel} onConfirm={confirm} />}
  </>;
}
