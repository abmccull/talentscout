"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTutorialStore } from "@/stores/tutorialStore";
import { useGameStore, type GameScreen } from "@/stores/gameStore";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { getSequenceById } from "./tutorialSteps";
import type { TutorialStep } from "./tutorialSteps";
import { getGuidedMilestone } from "./guidedSession";
import type { GuidedMilestoneDefinition } from "./guidedSession";
import { getGuidedMilestoneInstruction } from "./guidedMilestoneInstruction";
import type { GuidedMilestoneId } from "@/stores/tutorialStore";
import { parseConceptText } from "@/components/ui/GameTerm";
import { isHalfTimePhase } from "@/engine/observation/session";
import { useDialogFocusTrap } from "@/lib/a11y/useDialogFocusTrap";
import { placeCompactMentor, placeMentorWithoutCoveringTarget } from "./mentorPlacement";

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
  const guidedSessionKind = useTutorialStore((s) => s.guidedSessionKind);
  const mentorName = useTutorialStore((s) => s.mentorName);
  const mentorTitle = useTutorialStore((s) => s.mentorTitle);

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [popupPos, setPopupPos] = useState<PopupPosition>({ top: 0, left: 0 });
  const [compactPos, setCompactPos] = useState<PopupPosition>({ top: 8, left: 8 });
  const [needsCompact, setNeedsCompact] = useState(false);
  const [manuallyCollapsed, setManuallyCollapsed] = useState(false);
  const [forceExpanded, setForceExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const compactButtonRef = useRef<HTMLButtonElement>(null);
  const hideButtonRef = useRef<HTMLButtonElement>(null);

  const hideMentorHelp = useCallback(() => {
    setManuallyCollapsed(true);
    setForceExpanded(false);
    window.requestAnimationFrame(() => compactButtonRef.current?.focus());
  }, []);
  const showMentorHelp = useCallback(() => {
    setManuallyCollapsed(false);
    setForceExpanded(true);
    window.requestAnimationFrame(() => hideButtonRef.current?.focus());
  }, []);

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

  const trapFocus = activeMode.kind === "tutorial"
    || (activeMode.kind === "guided" && !activeMode.milestone.interactive);
  const canCollapse = activeMode.kind === "guided" && activeMode.milestone.interactive;
  const isOffGuidedScreen = activeMode.kind === "guided"
    && currentGameScreen !== activeMode.milestone.screen;
  const isCompact = canCollapse && (manuallyCollapsed || (needsCompact && !forceExpanded));

  useEffect(() => {
    setManuallyCollapsed(false);
    setForceExpanded(false);
  }, [currentGuidedTask, currentSequence, currentStep]);

  useDialogFocusTrap(cardRef, trapFocus, {
    initialFocusRef: continueRef,
  });

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
    const el = findVisibleTutorialTarget(targetSelectorKey);
    const domRect = el?.getBoundingClientRect();
    const rect: TargetRect | null = domRect ? {
      top: domRect.top,
      left: domRect.left,
      width: domRect.width,
      height: domRect.height,
    } : null;
    setTargetRect(rect);
    const cardWidth = cardRef.current?.offsetWidth ?? 360;
    const cardHeight = cardRef.current?.offsetHeight ?? 220;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const safePosition = rect && placeMentorWithoutCoveringTarget(
      rect, preferredSide, { width: cardWidth, height: cardHeight }, viewport,
    );
    // Off-screen guidance is the route back to the task, so keep its return
    // action visible. In-task guidance must never obstruct the required input.
    setNeedsCompact(canCollapse && !isOffGuidedScreen && (viewport.width < 768 || !safePosition));
    setCompactPos(placeCompactMentor(rect, viewport));
    setPopupPos(safePosition || {
      top: Math.max(8, (viewport.height - cardHeight) / 2),
      left: Math.max(8, (viewport.width - cardWidth) / 2),
    });
  }, [targetSelectorKey, preferredSide, canCollapse, isOffGuidedScreen]);

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
    if (activeMode.kind === "none" || !targetSelectorKey || (canCollapse && !isOffGuidedScreen)) return;

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
    canCollapse,
    isOffGuidedScreen,
    currentGameScreen,
    measure,
    observationPhaseIndex,
    observationState,
    targetSelectorKey,
  ]);

  // Interactive guidance can be tucked away without disabling tutorials.
  useEffect(() => {
    if (activeMode.kind === "none") return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      const targetDialog = target?.closest('dialog, [role="dialog"], [role="alertdialog"]');
      if (targetDialog && targetDialog !== cardRef.current) return;

      if (activeMode.kind === "tutorial") {
        e.preventDefault();
        skipTutorial();
      } else if (canCollapse && !isCompact && target && cardRef.current?.contains(target)) {
        // The game's other dialogs own Escape and restore their own focus.
        // Only a focused, expanded mentor card may move focus to compact help.
        e.preventDefault();
        hideMentorHelp();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeMode.kind, canCollapse, hideMentorHelp, isCompact, skipTutorial]);

  // ---------------------------------------------------------------------------
  // Early exit
  // ---------------------------------------------------------------------------

  if (activeMode.kind === "none") return null;
  if (!gameState || NON_GAME_SCREENS.has(currentGameScreen)) return null;
  if (activeMode.kind === "guided") {
    const targets = Array.isArray(activeMode.milestone.target)
      ? activeMode.milestone.target
      : [activeMode.milestone.target];
    // The setup card already carries the hook. A covering mentor card
    // hides Watch the match — the first-hour conversion control.
    if (
      currentGameScreen === "observation"
      && observationState === "setup"
      && targets.includes("observation-begin-session")
    ) return null;
  }

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------

  const isAha = activeMode.kind === "tutorial" && activeMode.isAha;
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
        isYouthDiscoveryHook: guidedSessionKind === "discoveryHook",
      })
    : "Complete the highlighted action to continue.";

  // ---------------------------------------------------------------------------
  // Spotlight style — inset box-shadow, pointerEvents none so clicks pass through
  // ---------------------------------------------------------------------------

  const spotlightStyle: React.CSSProperties = targetRect
    ? {
        boxShadow: [
          trapFocus ? "0 0 0 9999px rgba(0,0,0,0.45)" : "0 0 0 1px var(--primary)",
          "inset 0 0 0 1px var(--primary)",
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
        background: trapFocus ? "rgba(0,0,0,0.35)" : "transparent",
        pointerEvents: "none",
        zIndex: 9998,
      };

  const borderClass = isAha ? "border-amber-700/50" : "border-zinc-700";
  const accentTextClass = "text-[color:var(--primary)]";
  const dotActiveClass = "bg-[color:var(--primary)]";
  const dotPastClass = "bg-[color:var(--primary)]/50";
  const btnClass = "bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:bg-[color:var(--primary)]/90 focus-visible:outline-[color:var(--ring)]";
  const interactiveTextClass = "text-[color:var(--primary)]";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Spotlight — pointerEvents none so the game remains fully interactive */}
      {!isCompact && <div aria-hidden="true" style={spotlightStyle} />}

      {isCompact && (
        <div
          role="complementary"
          aria-label={`Mentor: ${title}`}
          style={{ position: "fixed", ...compactPos, width: "min(184px, calc(100vw - 16px))", zIndex: 9999 }}
        >
          <button
            ref={compactButtonRef}
            type="button"
            aria-label="Show mentor help"
            aria-expanded={false}
            aria-controls="mentor-help-panel"
            onClick={showMentorHelp}
            className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-zinc-600 bg-zinc-900 px-3 text-sm font-semibold text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ring)]"
          >
            Mentor help
            <ChevronUp size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Mentor panel */}
      <div
        id="mentor-help-panel"
        ref={cardRef}
        role={trapFocus ? "dialog" : "complementary"}
        aria-modal={trapFocus || undefined}
        aria-label={isCompact ? undefined : `Mentor: ${title}`}
        aria-hidden={isCompact || undefined}
        inert={isCompact || undefined}
        style={{
          position: "fixed",
          top: popupPos.top,
          left: popupPos.left,
          width: "min(360px, calc(100vw - 16px))",
          maxHeight: "calc(100dvh - 16px)",
          overflowY: "auto",
          visibility: isCompact ? "hidden" : "visible",
          pointerEvents: isCompact ? "none" : "auto",
          zIndex: 9999,
          transition: "top 150ms ease, left 150ms ease",
        }}
        className={`rounded-md border ${borderClass} bg-[var(--surface-overlay)] p-4 shadow-xl`}
      >
        {/* Mentor identity row */}
        <div className="mb-2 flex items-center gap-2">
          <div
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[color:var(--surface-selected)] text-xs font-bold text-[color:var(--primary)]"
          >
            {getInitials(mentorName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{mentorName}</p>
            {!canCollapse && <p className="truncate text-xs text-zinc-400">{mentorTitle}</p>}
          </div>
          <span className={`ml-auto shrink-0 text-xs font-semibold uppercase tracking-wider ${accentTextClass}`}>
            {activeMode.kind === "guided"
              ? "Task"
              : isAha
                ? "Milestone"
                : "Tutorial"}
          </span>
          {canCollapse && (
            <button
              ref={hideButtonRef}
              type="button"
              aria-label="Hide mentor help"
              aria-expanded={true}
              aria-controls="mentor-help-panel"
              onClick={hideMentorHelp}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ring)]"
            >
              <ChevronDown size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Speech bubble */}
        <div className="mb-2">
          <h2 className="mb-1 text-sm font-semibold text-white">{title}</h2>
          <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">{parseConceptText(canCollapse ? actionInstruction : description)}</p>
          {canCollapse && (
            <details className="mt-2 text-xs text-[var(--muted-foreground)]">
              <summary className="cursor-pointer py-2">More from {mentorName.split(" ")[0]}</summary>
              <p className="pb-2 leading-5">{parseConceptText(description)}</p>
            </details>
          )}
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
              ref={continueRef}
              type="button"
              onClick={handleReturnToGuidedStep}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs font-bold text-[color:var(--primary-foreground)] transition"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Return to guided step
            </button>
          ) : canCollapse ? null : isInteractive || activeMode.kind === "guided" ? (
            <span className={`text-xs italic ${interactiveTextClass}`}>
              {activeMode.kind === "guided" ? actionInstruction : "Complete the action to continue"}
            </span>
          ) : (
            <button
              ref={continueRef}
              onClick={handleNext}
              className={`min-h-11 rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition ${btnClass}`}
            >
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
