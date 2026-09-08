"use client";

import { useRef, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "@/components/ui/button";
import { isYouthOpeningWeek } from "@/lib/youthFirstHour";
import { useDialogFocusTrap } from "@/lib/a11y/useDialogFocusTrap";

export function useGuardedWeekAdvance() {
  const requestWeekAdvance = useGameStore((state) => state.requestWeekAdvance);
  const confirmBeforeAdvance = useSettingsStore((state) => state.confirmBeforeAdvance);
  const openingWeek = useGameStore((state) => isYouthOpeningWeek(state.gameState));
  const [pending, setPending] = useState(false);

  const request = () => {
    if (confirmBeforeAdvance || openingWeek) {
      setPending(true);
      return;
    }
    requestWeekAdvance();
  };

  return {
    request,
    pending,
    confirm: () => {
      setPending(false);
      requestWeekAdvance();
    },
    cancel: () => setPending(false),
  };
}

export function WeekAdvanceConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, open, { onClose: onCancel });

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="week-advance-confirm-title"
    >
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#11161c] p-5 shadow-2xl">
        <h2 id="week-advance-confirm-title" className="text-lg font-semibold text-white">
          Advance this week?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          Scheduled work will resolve and the football world will move forward. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm}>
            Advance week
          </Button>
        </div>
      </div>
    </div>
  );
}
