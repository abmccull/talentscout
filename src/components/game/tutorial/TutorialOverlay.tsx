"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTutorialStore } from "@/stores/tutorialStore";
import { getSequenceById } from "./tutorialSteps";
import type { TutorialStep } from "./tutorialSteps";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PopupPosition {
  top: number;
  left: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the (top, left) position for the popup card relative to the
 * viewport, given the target element's bounding rect and the desired
 * preferred side.  Clamps to keep the card within the viewport.
 */
function computePopupPosition(
  rect: TargetRect,
  preferredSide: TutorialStep["position"],
  cardWidth: number,
  cardHeight: number,
): PopupPosition {
  const GAP = 12; // px between spotlight edge and card
  const MARGIN = 8; // minimum distance from viewport edge

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0;
  let left = 0;

  switch (preferredSide) {
    case "top":
      top = rect.top - cardHeight - GAP;
      left = rect.left + rect.width / 2 - cardWidth / 2;
      break;
    case "bottom":
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - cardWidth / 2;
      break;
    case "left":
      top = rect.top + rect.height / 2 - cardHeight / 2;
      left = rect.left - cardWidth - GAP;
      break;
    case "right":
      top = rect.top + rect.height / 2 - cardHeight / 2;
      left = rect.left + rect.width + GAP;
      break;
  }

  // Clamp within viewport.
  left = Math.max(MARGIN, Math.min(left, vw - cardWidth - MARGIN));
  top = Math.max(MARGIN, Math.min(top, vh - cardHeight - MARGIN));

  return { top, left };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TutorialOverlay() {
  const tutorialActive = useTutorialStore((s) => s.tutorialActive);
  const currentSequence = useTutorialStore((s) => s.currentSequence);
  const currentStep = useTutorialStore((s) => s.currentStep);
  const nextStep = useTutorialStore((s) => s.nextStep);
  const skipTutorial = useTutorialStore((s) => s.skipTutorial);
  const dismissForever = useTutorialStore((s) => s.dismissForever);

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [popupPos, setPopupPos] = useState<PopupPosition>({ top: 0, left: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  // Derive the active step object.
  const sequence = currentSequence ? getSequenceById(currentSequence) : null;
  const step: TutorialStep | null = sequence?.steps[currentStep] ?? null;
  const totalSteps = sequence?.steps.length ?? 0;

  /**
   * Re-measure the target element and recompute the popup position.
   * Called on mount, on step change, and on window resize.
   */
  const measure = useCallback(() => {
    if (!step) return;

    const el = document.querySelector(
      `[data-tutorial-id="${step.targetSelector}"]`,
    );

    if (!el) {
      setTargetRect(null);
      return;
    }

    const domRect = el.getBoundingClientRect();
    const rect: TargetRect = {
      top: domRect.top,
      left: domRect.left,
      width: domRect.width,
      height: domRect.height,
    };

    setTargetRect(rect);

    // Measure the card dimensions — fall back to sensible defaults if the
    // ref isn't attached yet (first render).
    const cardWidth = cardRef.current?.offsetWidth ?? 320;
    const cardHeight = cardRef.current?.offsetHeight ?? 200;

    setPopupPos(computePopupPosition(rect, step.position, cardWidth, cardHeight));
  }, [step]);

  // Remeasure whenever the active step changes.
  useEffect(() => {
    if (!tutorialActive || !step) return;

    // Small delay to allow the target element to render/animate into place.
    const id = window.setTimeout(measure, 80);
    return () => window.clearTimeout(id);
  }, [tutorialActive, step, measure]);

  // Remeasure on window resize.
  useEffect(() => {
    if (!tutorialActive) return;

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tutorialActive, measure]);

  // Re-run popup position after the card has rendered and we have real dimensions.
  useEffect(() => {
    if (!tutorialActive || !step || !targetRect) return;
    const cardWidth = cardRef.current?.offsetWidth ?? 320;
    const cardHeight = cardRef.current?.offsetHeight ?? 200;
    setPopupPos(
      computePopupPosition(targetRect, step.position, cardWidth, cardHeight),
    );
  }, [tutorialActive, step, targetRect]);

  // Keyboard: Escape skips, Enter/Space advances.
  useEffect(() => {
    if (!tutorialActive) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        skipTutorial();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        nextStep();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tutorialActive, nextStep, skipTutorial]);

  // Nothing to render when the tutorial is not active.
  if (!tutorialActive || !step) return null;

  // Shadow cutout spotlight: inset box-shadow carves out a hole over the target.
  // Falls back to a full dimmed overlay when the target element isn't found.
  const spotlightStyle: React.CSSProperties =
    targetRect
      ? {
          boxShadow: [
            // Large outer shadow fills the rest of the screen.
            `0 0 0 9999px rgba(0,0,0,0.72)`,
            // Inset glow traces the target boundary.
            `inset 0 0 0 2px rgba(16,185,129,0.6)`,
          ].join(", "),
          position: "fixed",
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
          borderRadius: 6,
          pointerEvents: "none",
          zIndex: 9998,
          transition: "top 150ms ease, left 150ms ease, width 150ms ease, height 150ms ease",
        }
      : {
          // No target found — full-screen dim only.
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.72)",
          pointerEvents: "none",
          zIndex: 9998,
        };

  return (
    <>
      {/* Click-blocker overlay (lets the spotlight div sit above it) */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9997,
        }}
        onClick={skipTutorial}
      />

      {/* Spotlight cutout */}
      <div aria-hidden="true" style={spotlightStyle} />

      {/* Popup card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Tutorial: ${step.title}`}
        style={{
          position: "fixed",
          top: popupPos.top,
          left: popupPos.left,
          width: 320,
          zIndex: 9999,
          transition: "top 150ms ease, left 150ms ease",
        }}
        className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
      >
        {/* Step counter */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
            Tutorial
          </span>
          <span className="text-xs text-zinc-500">
            {currentStep + 1}/{totalSteps}
          </span>
        </div>

        {/* Title */}
        <h2 className="mb-2 text-sm font-bold text-white">{step.title}</h2>

        {/* Description */}
        <p className="mb-5 text-sm leading-relaxed text-zinc-400">
          {step.description}
        </p>

        {/* Step progress dots */}
        <div className="mb-4 flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep
                  ? "w-4 bg-emerald-500"
                  : i < currentStep
                    ? "w-1.5 bg-emerald-700"
                    : "w-1.5 bg-zinc-700"
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={skipTutorial}
              className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline transition"
            >
              Skip
            </button>
            <span className="text-zinc-700" aria-hidden="true">
              ·
            </span>
            <button
              onClick={dismissForever}
              className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline transition"
            >
              Disable tutorials
            </button>
          </div>

          <button
            onClick={nextStep}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            {currentStep + 1 >= totalSteps ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}
