"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDialogFocusTrap } from "@/lib/a11y/useDialogFocusTrap";

interface PlannerOpportunitySheetProps {
  open: boolean;
  activityCount: number;
  selectedLabel?: string;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
}

export function PlannerOpportunitySheet({
  open,
  activityCount,
  selectedLabel,
  onOpen,
  onClose,
  children,
}: PlannerOpportunitySheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia("(min-width: 1024px)");
    const closeWhenDesktop = () => {
      if (media.matches) onClose();
    };
    closeWhenDesktop();
    media.addEventListener("change", closeWhenDesktop);
    return () => media.removeEventListener("change", closeWhenDesktop);
  }, [onClose, open]);

  useDialogFocusTrap(sheetRef, open, {
    onClose,
    initialFocusRef: closeRef,
  });

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        data-testid="planner-mobile-opportunities-trigger"
        onClick={onOpen}
        aria-expanded={open}
        aria-controls="planner-mobile-opportunity-sheet"
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#10151b]/94 px-4 py-3 text-left shadow-xl shadow-black/20"
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Opportunity list
          </span>
          <span className="mt-1 block text-sm font-semibold text-white">
            {selectedLabel ? `Change ${selectedLabel}` : "Choose the next live call"}
          </span>
          <span className="mt-1 block text-xs text-zinc-400">
            Mobile keeps the day strip visible and moves the full board into a bottom sheet.
          </span>
        </span>
        <Badge variant="secondary" className="shrink-0 border-white/10 bg-white/5 text-zinc-200">
          {activityCount} live
        </Badge>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/60 backdrop-blur-[1px] lg:hidden"
            aria-label="Dismiss opportunity sheet backdrop"
            onClick={onClose}
            tabIndex={-1}
          />
          <div
            ref={sheetRef}
            id="planner-mobile-opportunity-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="planner-mobile-opportunity-sheet-title"
            className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 max-h-[68dvh] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] shadow-[0_24px_70px_rgba(0,0,0,0.65)] lg:hidden"
          >
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Opportunity list
                </p>
                <h2 id="planner-mobile-opportunity-sheet-title" className="mt-1 text-sm font-semibold text-white">
                  Select one live opportunity, then place it on the strip
                </h2>
              </div>
              <button
                type="button"
                ref={closeRef}
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                aria-label="Close opportunity sheet"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="max-h-[calc(68dvh-3.75rem)] overflow-y-auto p-4">
              {children}
            </div>
          </div>
        </>
      )}
    </>
  );
}
