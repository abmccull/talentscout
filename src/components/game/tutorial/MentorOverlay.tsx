"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTutorialStore } from "@/stores/tutorialStore";
import { useGameStore } from "@/stores/gameStore";
import { getSequenceById } from "./tutorialSteps";
import type { TutorialStep } from "./tutorialSteps";
import { getScreenGuide } from "./screenGuides";
import type { ScreenGuideStep } from "./screenGuides";
import { getGuidedMilestone } from "./guidedSession";
import type { GuidedMilestoneDefinition } from "./guidedSession";
import type { GuidedMilestoneId } from "@/stores/tutorialStore";

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

type ActiveMode =
  | { kind: "tutorial"; step: TutorialStep; totalSteps: number; isAha: boolean }
  | { kind: "guided"; milestone: GuidedMilestoneDefinition }
  | { kind: "screenGuide"; step: ScreenGuideStep; stepIndex: number; totalSteps: number }
  | { kind: "none" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the (top, left) position for the popup card relative to the
 * viewport, given the target element's bounding rect and the desired
 * preferred side. Clamps to keep the card within the viewport.
 */
function computePopupPosition(
  rect: TargetRect,
  preferredSide: TutorialStep["position"],
  cardWidth: number,
  cardHeight: number,
): PopupPosition {
  const GAP = 12;
  const MARGIN = 8;

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

  left = Math.max(MARGIN, Math.min(left, vw - cardWidth - MARGIN));
  top = Math.max(MARGIN, Math.min(top, vh - cardHeight - MARGIN));

  return { top, left };
}

/** Derive two-letter initials from a full name. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const NON_GAME_SCREENS = new Set(["mainMenu", "newGame", "scenarioSelect", "hallOfFame", "demoEnd"]);

export function MentorOverlay() {
  const gameState = useGameStore((s) => s.gameState);
  const currentGameScreen = useGameStore((s) => s.currentScreen);
  const tutorialActive = useTutorialStore((s) => s.tutorialActive);
  const currentSequence = useTutorialStore((s) => s.currentSequence);
  const currentStep = useTutorialStore((s) => s.currentStep);
  const nextStep = useTutorialStore((s) => s.nextStep);
  const skipTutorial = useTutorialStore((s) => s.skipTutorial);
  const dismissForever = useTutorialStore((s) => s.dismissForever);
  const guidedSessionActive = useTutorialStore((s) => s.guidedSessionActive);
  const currentGuidedTask = useTutorialStore((s) => s.currentGuidedTask);
  const mentorName = useTutorialStore((s) => s.mentorName);
  const mentorTitle = useTutorialStore((s) => s.mentorTitle);
  const activeScreenGuide = useTutorialStore((s) => s.activeScreenGuide);
  const screenGuideStep = useTutorialStore((s) => s.screenGuideStep);
  const closeScreenGuide = useTutorialStore((s) => s.closeScreenGuide);
  const advanceScreenGuide = useTutorialStore((s) => s.advanceScreenGuide);

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [popupPos, setPopupPos] = useState<PopupPosition>({ top: 0, left: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Derive active mode (priority order)
  // ---------------------------------------------------------------------------

  const activeMode = ((): ActiveMode => {
    // 1. Legacy tutorial sequence
    if (tutorialActive && currentSequence) {
      const sequence = getSequenceById(currentSequence);
      const step = sequence?.steps[currentStep] ?? null;
      if (step) {
        return {
          kind: "tutorial",
          step,
          totalSteps: sequence?.steps.length ?? 0,
          isAha: currentSequence.startsWith("ahaMoment:"),
        };
      }
    }
    // 2. Guided session milestone
    if (guidedSessionActive && currentGuidedTask) {
      const milestone = getGuidedMilestone(currentGuidedTask as GuidedMilestoneId);
      if (milestone) {
        return { kind: "guided", milestone };
      }
    }
    // 3. Screen guide
    if (activeScreenGuide) {
      const guide = getScreenGuide(activeScreenGuide);
      if (guide) {
        const step = guide.steps[screenGuideStep];
        if (!step) {
          // Step index out of bounds — close via effect, render nothing for now.
          return { kind: "none" };
        }
        return {
          kind: "screenGuide",
          step,
          stepIndex: screenGuideStep,
          totalSteps: guide.steps.length,
        };
      }
    }
    return { kind: "none" };
  })();

  // Close screen guide when step index overflows.
  useEffect(() => {
    if (!activeScreenGuide) return;
    const guide = getScreenGuide(activeScreenGuide);
    if (guide && screenGuideStep >= guide.steps.length) {
      closeScreenGuide();
    }
  }, [activeScreenGuide, screenGuideStep, closeScreenGuide]);

  // ---------------------------------------------------------------------------
  // Target selector resolution
  // ---------------------------------------------------------------------------

  const targetSelector = ((): string | null => {
    switch (activeMode.kind) {
      case "tutorial":
        return activeMode.step.targetSelector;
      case "guided":
        return activeMode.milestone.target;
      case "screenGuide":
        return activeMode.step.target;
      default:
        return null;
    }
  })();

  const preferredSide = ((): TutorialStep["position"] => {
    switch (activeMode.kind) {
      case "tutorial":
        return activeMode.step.position;
      case "guided":
        return activeMode.milestone.position;
      case "screenGuide":
        return activeMode.step.position;
      default:
        return "bottom";
    }
  })();

  // ---------------------------------------------------------------------------
  // Spotlight measurement
  // ---------------------------------------------------------------------------

  const measure = useCallback(() => {
    if (!targetSelector) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(`[data-tutorial-id="${targetSelector}"]`);
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

    const cardWidth = cardRef.current?.offsetWidth ?? 360;
    const cardHeight = cardRef.current?.offsetHeight ?? 220;
    setPopupPos(computePopupPosition(rect, preferredSide, cardWidth, cardHeight));
  }, [targetSelector, preferredSide]);

  useEffect(() => {
    if (activeMode.kind === "none") return;
    const id = window.setTimeout(measure, 80);
    return () => window.clearTimeout(id);
  }, [activeMode.kind, measure]);

  useEffect(() => {
    if (activeMode.kind === "none") return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeMode.kind, measure]);

  // Recompute popup position after card renders with real dimensions.
  useEffect(() => {
    if (activeMode.kind === "none" || !targetRect) return;
    const cardWidth = cardRef.current?.offsetWidth ?? 360;
    const cardHeight = cardRef.current?.offsetHeight ?? 220;
    setPopupPos(computePopupPosition(targetRect, preferredSide, cardWidth, cardHeight));
  }, [activeMode.kind, targetRect, preferredSide]);

  // Keyboard: Escape closes/skips.
  useEffect(() => {
    if (activeMode.kind === "none") return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (activeMode.kind === "tutorial") skipTutorial();
        else if (activeMode.kind === "screenGuide") closeScreenGuide();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeMode.kind, skipTutorial, closeScreenGuide]);

  // ---------------------------------------------------------------------------
  // Early exit
  // ---------------------------------------------------------------------------

  if (activeMode.kind === "none") return null;
  if (!gameState || NON_GAME_SCREENS.has(currentGameScreen)) return null;

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------

  const isAha = activeMode.kind === "tutorial" && activeMode.isAha;

  const title = ((): string => {
    switch (activeMode.kind) {
      case "tutorial":    return activeMode.step.title;
      case "guided":      return activeMode.milestone.title;
      case "screenGuide": return activeMode.step.title;
      default:            return "";
    }
  })();

  const description = ((): string => {
    if (activeMode.kind === "tutorial") return activeMode.step.description;
    if (activeMode.kind === "guided") {
      const isFreelance = mentorName === "Tommy Reyes";
      return isFreelance
        ? activeMode.milestone.mentorTextFreelance
        : activeMode.milestone.mentorText;
    }
    if (activeMode.kind === "screenGuide") return activeMode.step.description;
    return "";
  })();

  const isInteractive = ((): boolean => {
    if (activeMode.kind === "tutorial") return !!activeMode.step.nextStep;
    if (activeMode.kind === "guided") return activeMode.milestone.interactive;
    return false;
  })();

  const totalDots =
    activeMode.kind === "tutorial"
      ? activeMode.totalSteps
      : activeMode.kind === "screenGuide"
        ? activeMode.totalSteps
        : 0;

  const currentDotIndex =
    activeMode.kind === "tutorial"
      ? currentStep
      : activeMode.kind === "screenGuide"
        ? activeMode.stepIndex
        : 0;

  const isLastStep =
    activeMode.kind === "tutorial"
      ? currentStep + 1 >= activeMode.totalSteps
      : activeMode.kind === "screenGuide"
        ? activeMode.stepIndex + 1 >= activeMode.totalSteps
        : false;

  const nextLabel =
    activeMode.kind === "tutorial" && isLastStep
      ? isAha ? "Awesome!" : "Done"
      : "Next";

  function handleNext() {
    if (activeMode.kind === "tutorial") nextStep();
    else if (activeMode.kind === "screenGuide") advanceScreenGuide();
  }

  function handleSkip() {
    if (activeMode.kind === "tutorial") skipTutorial();
    else if (activeMode.kind === "screenGuide") closeScreenGuide();
  }

  const showSkipControls =
    activeMode.kind === "tutorial" || activeMode.kind === "screenGuide";

  // ---------------------------------------------------------------------------
  // Spotlight style — inset box-shadow, pointerEvents none so clicks pass through
  // ---------------------------------------------------------------------------

  const spotlightStyle: React.CSSProperties = targetRect
    ? {
        boxShadow: [
          "0 0 0 9999px rgba(0,0,0,0.65)",
          `inset 0 0 0 2px ${isAha ? "rgba(245,158,11,0.6)" : "rgba(16,185,129,0.6)"}`,
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
        // Ambient mode — no target found, just a subtle full-screen dim.
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        pointerEvents: "none",
        zIndex: 9998,
      };

  const borderClass = isAha ? "border-amber-700/50" : "border-zinc-700";
  const accentTextClass = isAha ? "text-amber-400" : "text-emerald-500";
  const dotActiveClass = isAha ? "bg-amber-400" : "bg-emerald-500";
  const dotPastClass = isAha ? "bg-amber-700" : "bg-emerald-700";
  const btnClass = isAha
    ? "bg-amber-600 hover:bg-amber-500 focus-visible:outline-amber-400"
    : "bg-emerald-600 hover:bg-emerald-500 focus-visible:outline-emerald-400";
  const interactiveTextClass = isAha ? "text-amber-400/70" : "text-emerald-400/70";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Spotlight — pointerEvents none so the game remains fully interactive */}
      <div aria-hidden="true" style={spotlightStyle} />

      {/* Mentor panel */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label={`Mentor: ${title}`}
        style={{
          position: "fixed",
          top: popupPos.top,
          left: popupPos.left,
          width: 360,
          zIndex: 9999,
          transition: "top 150ms ease, left 150ms ease",
        }}
        className={`rounded-xl border ${borderClass} bg-zinc-900 p-5 shadow-2xl`}
      >
        {/* Mentor identity row */}
        <div className="mb-4 flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white"
          >
            {getInitials(mentorName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{mentorName}</p>
            <p className="truncate text-xs text-zinc-400">{mentorTitle}</p>
          </div>
          <span className={`ml-auto shrink-0 text-xs font-semibold uppercase tracking-wider ${accentTextClass}`}>
            {activeMode.kind === "guided"
              ? "Task"
              : isAha
                ? "Milestone"
                : activeMode.kind === "screenGuide"
                  ? "Guide"
                  : "Tutorial"}
          </span>
        </div>

        {/* Speech bubble */}
        <div className="mb-4 rounded-lg bg-zinc-800/60 px-4 py-3">
          <h2 className="mb-1 text-sm font-bold text-white">{title}</h2>
          <p className="text-sm leading-relaxed text-zinc-400">{description}</p>
        </div>

        {/* Progress dots (tutorial + screen guide only) */}
        {totalDots > 1 && (
          <div className="mb-4 flex items-center gap-1.5">
            {Array.from({ length: totalDots }).map((_, i) => (
              <div
                key={i}
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-all ${
                  i === currentDotIndex
                    ? `w-4 ${dotActiveClass}`
                    : i < currentDotIndex
                      ? `w-1.5 ${dotPastClass}`
                      : "w-1.5 bg-zinc-700"
                }`}
              />
            ))}
          </div>
        )}

        {/* Actions row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {showSkipControls && (
              <>
                <button
                  onClick={handleSkip}
                  className="text-xs text-zinc-500 underline-offset-2 transition hover:text-zinc-300 hover:underline"
                >
                  Skip
                </button>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <button
                  onClick={dismissForever}
                  className="text-xs text-zinc-500 underline-offset-2 transition hover:text-zinc-300 hover:underline"
                >
                  Disable tutorials
                </button>
              </>
            )}
            {activeMode.kind === "guided" && (
              <button
                onClick={dismissForever}
                className="text-xs text-zinc-500 underline-offset-2 transition hover:text-zinc-300 hover:underline"
              >
                Disable tutorials
              </button>
            )}
          </div>

          {isInteractive || activeMode.kind === "guided" ? (
            <span className={`text-xs italic ${interactiveTextClass}`}>
              Complete the action to continue
            </span>
          ) : (
            <button
              onClick={handleNext}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 ${btnClass}`}
            >
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
