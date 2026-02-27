"use client";

import { X, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { useTutorialStore } from "@/stores/tutorialStore";
import { useGameStore } from "@/stores/gameStore";
import { getScreenGuide } from "./screenGuides";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ScreenGuidePanel — right-edge slide-in panel (300px wide).
 *
 * Renders when `activeScreenGuide` is set in the tutorial store.
 * Shows mentor avatar, step title, description, step navigation, an optional
 * "Learn more" link to the handbook, and a close button.
 *
 * When the user clicks Next on the final step, the panel closes automatically.
 */
export function ScreenGuidePanel() {
  const activeScreenGuide = useTutorialStore((s) => s.activeScreenGuide);
  const screenGuideStep = useTutorialStore((s) => s.screenGuideStep);
  const advanceScreenGuide = useTutorialStore((s) => s.advanceScreenGuide);
  const closeScreenGuide = useTutorialStore((s) => s.closeScreenGuide);
  const mentorName = useTutorialStore((s) => s.mentorName);
  const mentorTitle = useTutorialStore((s) => s.mentorTitle);
  const setScreen = useGameStore((s) => s.setScreen);

  // Derive guide and current step — all hooks are called before early return.
  const guide = activeScreenGuide != null ? getScreenGuide(activeScreenGuide) : undefined;
  const totalSteps = guide?.steps.length ?? 0;
  const step = guide?.steps[screenGuideStep] ?? null;

  // Panel is visible only when there is an active guide with a valid step.
  const isVisible = activeScreenGuide != null && step != null;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleNext() {
    const isLastStep = screenGuideStep + 1 >= totalSteps;
    if (isLastStep) {
      closeScreenGuide();
    } else {
      advanceScreenGuide();
    }
  }

  function handlePrevious() {
    // advanceScreenGuide only increments — we manage backward navigation via
    // direct store manipulation. Since the store exposes advanceScreenGuide
    // (increment) but not decrement, we close and reopen at the correct step.
    // For simplicity the store uses a single screenGuideStep counter; we work
    // within that by checking bounds here.
    if (screenGuideStep > 0) {
      // Reopen at previous step: close then reopen sets step to 0, so instead
      // we call the raw store setter via the zustand subscribe pattern.
      // The store doesn't expose setPrevStep, so we replicate the logic inline.
      useTutorialStore.setState({ screenGuideStep: screenGuideStep - 1 });
    }
  }

  function handleLearnMore() {
    if (!step?.handbookChapter) return;
    closeScreenGuide();
    setScreen("handbook");
  }

  // ---------------------------------------------------------------------------
  // Mentor initials
  // ---------------------------------------------------------------------------

  const initials = mentorName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      role="complementary"
      aria-label="Screen guide"
      aria-hidden={!isVisible}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 300,
        zIndex: 9990,
        transform: isVisible ? "translateX(0)" : "translateX(100%)",
        transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      className="flex flex-col border-l border-zinc-700 bg-zinc-900 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b border-zinc-800 p-4">
        <div className="flex items-center gap-3">
          {/* Mentor avatar */}
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white"
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">
              {mentorName}
            </p>
            <p className="truncate text-xs text-zinc-400">{mentorTitle}</p>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={closeScreenGuide}
          aria-label="Close screen guide"
          className="ml-2 shrink-0 rounded p-1 text-zinc-400 transition hover:bg-zinc-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Step counter badge */}
      {step != null && (
        <div className="border-b border-zinc-800 px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
            Step {screenGuideStep + 1} of {totalSteps}
          </span>
        </div>
      )}

      {/* Body — scrollable if content overflows */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {step != null ? (
          <>
            <h2 className="mb-2 text-sm font-bold text-white">{step.title}</h2>
            <p className="text-sm leading-relaxed text-zinc-400">
              {step.description}
            </p>

            {/* Progress dots */}
            {totalSteps > 1 && (
              <div
                aria-hidden="true"
                className="mt-5 flex items-center gap-1.5"
              >
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === screenGuideStep
                        ? "w-4 bg-emerald-500"
                        : i < screenGuideStep
                          ? "w-1.5 bg-emerald-700"
                          : "w-1.5 bg-zinc-700"
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Learn more link */}
            {step.handbookChapter != null && (
              <button
                onClick={handleLearnMore}
                className="mt-4 flex items-center gap-1.5 text-xs text-emerald-400 underline-offset-2 transition hover:text-emerald-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
              >
                <BookOpen size={13} aria-hidden="true" />
                Learn more in the Handbook
              </button>
            )}
          </>
        ) : (
          /* Fallback when guide has no steps (should not occur in practice) */
          <p className="text-sm text-zinc-500">No guide available.</p>
        )}
      </div>

      {/* Navigation footer */}
      {step != null && (
        <div className="border-t border-zinc-800 p-4">
          <div className="flex items-center justify-between gap-2">
            {/* Previous */}
            <button
              onClick={handlePrevious}
              disabled={screenGuideStep === 0}
              aria-label="Previous step"
              className="flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              Previous
            </button>

            {/* Next / Done */}
            <button
              onClick={handleNext}
              aria-label={
                screenGuideStep + 1 >= totalSteps ? "Close guide" : "Next step"
              }
              className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              {screenGuideStep + 1 >= totalSteps ? "Done" : "Next"}
              {screenGuideStep + 1 < totalSteps && (
                <ChevronRight size={14} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
