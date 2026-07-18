"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTutorialStore } from "@/stores/tutorialStore";
import { useGameStore, type GameScreen } from "@/stores/gameStore";
import { ArrowLeft } from "lucide-react";
import { getSequenceById } from "./tutorialSteps";
import type { TutorialStep } from "./tutorialSteps";
import { getGuidedMilestone } from "./guidedSession";
import type { GuidedMilestoneDefinition } from "./guidedSession";
import { getGuidedMilestoneInstruction } from "./guidedMilestoneInstruction";
import type { GuidedMilestoneId } from "@/stores/tutorialStore";
import { parseConceptText } from "@/components/ui/GameTerm";
import { isHalfTimePhase } from "@/engine/observation/session";

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

  // On narrow screens the sidebar and primary actions live near the viewport
  // edges. Keep the mentor card on the opposite edge so it never covers the
  // hamburger or the highlighted control the player must press.
  if (vw < 640) {
    const targetIsInTopHalf = rect.top + rect.height / 2 < vh / 2;
    return {
      left: MARGIN,
      top: targetIsInTopHalf
        ? Math.max(MARGIN, vh - cardHeight - MARGIN)
        : MARGIN,
    };
  }

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

const TARGET_SELECTOR_SEPARATOR = "\u001f";

function findVisibleTutorialTarget(selectorKey: string): HTMLElement | null {
  if (!selectorKey) return null;

  for (const selector of selectorKey.split(TARGET_SELECTOR_SEPARATOR)) {
    const matches = document.querySelectorAll<HTMLElement>(
      `[data-tutorial-id="${selector}"]`,
    );
    for (const match of matches) {
      const rect = match.getBoundingClientRect();
      const style = window.getComputedStyle(match);
      if (
        rect.width > 0
        && rect.height > 0
        && style.display !== "none"
        && style.visibility !== "hidden"
      ) {
        return match;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const NON_GAME_SCREENS = new Set(["mainMenu", "newGame", "scenarioSelect", "hallOfFame", "demoEnd"]);

export function MentorOverlay() {
  const gameState = useGameStore((s) => s.gameState);
  const currentGameScreen = useGameStore((s) => s.currentScreen);
  const setScreen = useGameStore((s) => s.setScreen);
  const observationState = useGameStore((s) => s.activeSession?.state ?? null);
  const observationPhaseIndex = useGameStore(
    (s) => s.activeSession?.currentPhaseIndex ?? null,
  );
  const observationIsHalfTime = useGameStore((s) => Boolean(
    s.activeSession
    && isHalfTimePhase(s.activeSession, s.activeSession.currentPhaseIndex),
  ));
  const observationHalftimeApproach = useGameStore(
    (s) => s.activeSession?.halftimeApproach ?? null,
  );
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
    return { kind: "none" };
  })();

  // ---------------------------------------------------------------------------
  // Target selector resolution
  // ---------------------------------------------------------------------------

  const targetSelectorKey = ((): string => {
    switch (activeMode.kind) {
      case "tutorial":
        return activeMode.step.targetSelector;
      case "guided": {
        const targets = typeof activeMode.milestone.target === "string"
          ? [activeMode.milestone.target]
          : activeMode.milestone.target;
        return targets.join(TARGET_SELECTOR_SEPARATOR);
      }
      default:
        return "";
    }
  })();

  const preferredSide = ((): TutorialStep["position"] => {
    switch (activeMode.kind) {
      case "tutorial":
        return activeMode.step.position;
      case "guided":
        return activeMode.milestone.position;
      default:
        return "bottom";
    }
  })();

  // ---------------------------------------------------------------------------
  // Spotlight measurement
  // ---------------------------------------------------------------------------

  const measure = useCallback(() => {
    if (!targetSelectorKey) {
      setTargetRect(null);
      return;
    }

    const el = findVisibleTutorialTarget(targetSelectorKey);
    if (!el) {
      setTargetRect(null);
      const cardWidth = cardRef.current?.offsetWidth ?? 360;
      const cardHeight = cardRef.current?.offsetHeight ?? 220;
      setPopupPos({
        top: Math.max(8, (window.innerHeight - cardHeight) / 2),
        left: Math.max(8, (window.innerWidth - cardWidth) / 2),
      });
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
  }, [targetSelectorKey, preferredSide]);

  useEffect(() => {
    if (activeMode.kind === "none") return;
    measure();
    const id = window.setTimeout(measure, 80);
    return () => window.clearTimeout(id);
  }, [activeMode.kind, measure]);

  useEffect(() => {
    if (activeMode.kind === "none" || typeof ResizeObserver === "undefined") return;
    const card = cardRef.current;
    if (!card) return;

    const observer = new ResizeObserver(() => measure());
    observer.observe(card);
    return () => observer.disconnect();
  }, [activeMode.kind, measure]);

  useEffect(() => {
    if (activeMode.kind === "none") return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    let frame = 0;
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeMode.kind, measure]);

  useEffect(() => {
    if (activeMode.kind === "none" || !targetSelectorKey) return;

    let settleId: number | null = null;
    const id = window.setTimeout(() => {
      const target = findVisibleTutorialTarget(targetSelectorKey);
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const outsideViewport = rect.top < 12 || rect.bottom > window.innerHeight - 12;
      if (!outsideViewport) return;

      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
        inline: "nearest",
      });
      settleId = window.setTimeout(measure, 0);
    }, 100);

    return () => {
      window.clearTimeout(id);
      if (settleId !== null) window.clearTimeout(settleId);
    };
  }, [
    activeMode.kind,
    currentGameScreen,
    measure,
    observationPhaseIndex,
    observationState,
    targetSelectorKey,
  ]);

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
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeMode.kind, skipTutorial]);

  // ---------------------------------------------------------------------------
  // Early exit
  // ---------------------------------------------------------------------------

  if (activeMode.kind === "none") return null;
  if (!gameState || NON_GAME_SCREENS.has(currentGameScreen)) return null;

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------

  const isAha = activeMode.kind === "tutorial" && activeMode.isAha;
  const isOffGuidedScreen = activeMode.kind === "guided"
    && currentGameScreen !== activeMode.milestone.screen;
  const isWaitingForStandout = activeMode.kind === "guided"
    && activeMode.milestone.id === "flaggedBreakthrough"
    && currentGameScreen === "observation"
    && (observationPhaseIndex ?? 0) < 1;

  const title = ((): string => {
    switch (activeMode.kind) {
      case "tutorial":    return activeMode.step.title;
      case "guided":      return isWaitingForStandout
        ? "Keep watching"
        : activeMode.milestone.title;
      default:            return "";
    }
  })();

  const description = ((): string => {
    if (activeMode.kind === "tutorial") return activeMode.step.description;
    if (activeMode.kind === "guided") {
      const isFreelance = mentorName === "Tommy Reyes";
      if (isWaitingForStandout) {
        return isFreelance
          ? "You have chosen who to watch. Select Next phase and stay with the play—the key moment is still ahead."
          : "Your focus is set. Select Next phase and keep watching—the action that tests your first read is still ahead.";
      }
      return isFreelance
        ? activeMode.milestone.mentorTextFreelance
        : activeMode.milestone.mentorText;
    }
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
        : 0;

  const currentDotIndex =
    activeMode.kind === "tutorial"
      ? currentStep
        : 0;

  const isLastStep =
    activeMode.kind === "tutorial"
      ? currentStep + 1 >= activeMode.totalSteps
        : false;

  const nextLabel =
    activeMode.kind === "tutorial" && isLastStep
      ? isAha ? "Awesome!" : "Done"
      : "Next";

  function handleNext() {
    if (activeMode.kind === "tutorial") nextStep();
  }

  function handleSkip() {
    if (activeMode.kind === "tutorial") skipTutorial();
  }

  function handleReturnToGuidedStep() {
    if (activeMode.kind !== "guided") return;
    setScreen(activeMode.milestone.screen as GameScreen);
  }

  const showSkipControls = activeMode.kind === "tutorial";
  const actionInstruction = activeMode.kind === "guided"
    ? getGuidedMilestoneInstruction({
        milestoneId: activeMode.milestone.id,
        currentScreen: currentGameScreen,
        observationState,
        observationPhaseIndex,
        observationIsHalfTime,
        observationHalftimeApproach,
      })
    : "Complete the highlighted action to continue.";

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
          width: "min(360px, calc(100vw - 16px))",
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
                : "Tutorial"}
          </span>
        </div>

        {/* Speech bubble */}
        <div className="mb-4 rounded-lg bg-zinc-800/60 px-4 py-3">
          <h2 className="mb-1 text-sm font-bold text-white">{title}</h2>
          <p className="text-sm leading-relaxed text-zinc-400">{parseConceptText(description)}</p>
        </div>

        {isOffGuidedScreen && (
          <p
            role="status"
            className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100"
          >
            This guided step is still waiting on the previous screen. Return there to continue where you left off.
          </p>
        )}

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
                  className="inline-flex min-h-11 items-center text-xs text-zinc-400 underline-offset-2 transition hover:text-zinc-200 hover:underline"
                >
                  Skip
                </button>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <button
                  onClick={dismissForever}
                  className="inline-flex min-h-11 items-center text-xs text-zinc-400 underline-offset-2 transition hover:text-zinc-200 hover:underline"
                >
                  Disable tutorials
                </button>
              </>
            )}
            {activeMode.kind === "guided" && (
              <button
                onClick={dismissForever}
                className="inline-flex min-h-11 items-center text-xs text-zinc-400 underline-offset-2 transition hover:text-zinc-200 hover:underline"
              >
                Disable tutorials
              </button>
            )}
          </div>

          {isOffGuidedScreen ? (
            <button
              type="button"
              onClick={handleReturnToGuidedStep}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Return to guided step
            </button>
          ) : isInteractive || activeMode.kind === "guided" ? (
            <span className={`text-xs italic ${interactiveTextClass}`}>
              {activeMode.kind === "guided" ? actionInstruction : "Complete the action to continue"}
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
