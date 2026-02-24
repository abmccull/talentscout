/**
 * Tutorial store — tracks which tutorial sequence is active, the current
 * step within that sequence, and which sequences have been completed.
 *
 * `completedSequences` and `dismissed` are persisted to localStorage so the
 * user only sees each tutorial once and can permanently opt out.
 */

import { create } from "zustand";
import { getSequenceById } from "@/components/game/tutorial/tutorialSteps";
import type { Specialization } from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "talentscout_tutorial";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OnboardingSequenceId =
  | "onboarding:youth:club"
  | "onboarding:youth:freelance"
  | "onboarding:firstTeam:club"
  | "onboarding:firstTeam:freelance"
  | "onboarding:regional:club"
  | "onboarding:regional:freelance"
  | "onboarding:data:club"
  | "onboarding:data:freelance";

export type AhaMomentSequenceId =
  | "ahaMoment:youth"
  | "ahaMoment:firstTeam"
  | "ahaMoment:regional"
  | "ahaMoment:data";

export type TutorialSequenceId =
  | "firstWeek"
  | "firstReport"
  | "careerProgression"
  | "firstMatch"
  | "firstReportWriting"
  | OnboardingSequenceId
  | AhaMomentSequenceId;

interface PersistedTutorialData {
  completedSequences: string[];
  dismissed: boolean;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/** Returns the correct onboarding sequence ID for a given specialization and career path. */
export function resolveOnboardingSequence(
  specialization: Specialization,
  hasClub: boolean,
): OnboardingSequenceId {
  const career = hasClub ? "club" : "freelance";
  return `onboarding:${specialization}:${career}` as OnboardingSequenceId;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function readPersisted(): PersistedTutorialData {
  if (typeof window === "undefined") {
    return { completedSequences: [], dismissed: false };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completedSequences: [], dismissed: false };
    const parsed = JSON.parse(raw) as Partial<PersistedTutorialData>;
    return {
      completedSequences: Array.isArray(parsed.completedSequences)
        ? parsed.completedSequences
        : [],
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return { completedSequences: [], dismissed: false };
  }
}

function writePersisted(data: PersistedTutorialData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Silently ignore — tutorial state will reset on next load.
  }
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface TutorialState {
  /** Zero-based index into the current sequence's steps array. */
  currentStep: number;

  /** The ID of the sequence currently being displayed, or null if none. */
  currentSequence: TutorialSequenceId | null;

  /** Set of sequence IDs the user has completed. Persisted to localStorage. */
  completedSequences: Set<string>;

  /** True while a sequence is actively displayed. */
  tutorialActive: boolean;

  /**
   * True if the user has chosen to skip all tutorials forever.
   * Persisted to localStorage.
   */
  dismissed: boolean;

  /** Sequence queued to start after the current one completes. */
  pendingSequence: TutorialSequenceId | null;

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * Begin a named tutorial sequence from step 0.
   * No-ops if `dismissed` is true or the sequence was already completed.
   */
  startSequence: (id: TutorialSequenceId) => void;

  /**
   * Queue a sequence. Starts immediately if no tutorial is active,
   * otherwise waits until the current sequence completes.
   */
  queueSequence: (id: TutorialSequenceId) => void;

  /**
   * Advance to the next step in the current sequence.
   * Marks the sequence as completed and deactivates when the last step is
   * acknowledged. If a pendingSequence exists, auto-starts it.
   */
  nextStep: () => void;

  /**
   * Skip the current sequence without marking it completed.
   * The sequence will be shown again next time `startSequence` is called.
   */
  skipTutorial: () => void;

  /**
   * Permanently dismiss all tutorials.  Sets `dismissed = true` and persists
   * the preference to localStorage.  No further sequences will ever start.
   */
  dismissForever: () => void;

  /**
   * Check if the current step should auto-advance based on a condition string.
   * Called by game actions (scheduleActivity, setFocus, submitReport) when the
   * corresponding action completes.  If the current step's `nextStep` matches
   * the provided condition, the tutorial advances automatically.
   */
  checkAutoAdvance: (condition: string) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

// readPersisted() is called at module evaluation time, which happens in the
// browser after hydration — localStorage is available at that point.
const persisted = readPersisted();

export const useTutorialStore = create<TutorialState>((set, get) => ({
  currentStep: 0,
  currentSequence: null,
  completedSequences: new Set(persisted.completedSequences),
  tutorialActive: false,
  dismissed: persisted.dismissed,
  pendingSequence: null,

  startSequence(id) {
    const { dismissed, completedSequences } = get();

    // Respect permanent opt-out and skip already-seen sequences.
    if (dismissed) return;

    // Backward compat: "firstWeek" is replaced by onboarding sequences.
    // If called with "firstWeek", no-op — onboarding is started via the resolver.
    if (id === "firstWeek") return;

    if (completedSequences.has(id)) return;

    // If any onboarding sequence was completed, skip all onboarding sequences.
    // This handles old saves that completed "firstWeek" — they shouldn't see new onboarding.
    if (
      id.startsWith("onboarding:") &&
      (completedSequences.has("firstWeek") ||
        Array.from(completedSequences).some((s) => s.startsWith("onboarding:")))
    ) {
      return;
    }

    set({
      currentSequence: id,
      currentStep: 0,
      tutorialActive: true,
    });
  },

  queueSequence(id) {
    const { dismissed, completedSequences, tutorialActive } = get();
    if (dismissed) return;
    if (completedSequences.has(id)) return;

    if (!tutorialActive) {
      get().startSequence(id);
    } else {
      set({ pendingSequence: id });
    }
  },

  nextStep() {
    const { currentStep, currentSequence, completedSequences, pendingSequence } = get();
    if (!currentSequence) return;

    const sequence = getSequenceById(currentSequence);
    const totalSteps = sequence?.steps.length ?? 0;

    if (currentStep + 1 >= totalSteps) {
      // Reached the end — mark completed and deactivate.
      const next = new Set(completedSequences);
      next.add(currentSequence);

      writePersisted({
        completedSequences: Array.from(next),
        dismissed: get().dismissed,
      });

      set({
        completedSequences: next,
        currentSequence: null,
        currentStep: 0,
        tutorialActive: false,
        pendingSequence: null,
      });

      // Auto-start pending sequence if one was queued.
      if (pendingSequence) {
        get().startSequence(pendingSequence);
      }
    } else {
      set({ currentStep: currentStep + 1 });
    }
  },

  skipTutorial() {
    set({
      currentSequence: null,
      currentStep: 0,
      tutorialActive: false,
      pendingSequence: null,
    });
  },

  dismissForever() {
    const { completedSequences } = get();

    writePersisted({
      completedSequences: Array.from(completedSequences),
      dismissed: true,
    });

    set({
      dismissed: true,
      currentSequence: null,
      currentStep: 0,
      tutorialActive: false,
      pendingSequence: null,
    });
  },

  checkAutoAdvance(condition) {
    const { currentSequence, currentStep, tutorialActive } = get();
    if (!tutorialActive || !currentSequence) return;

    const sequence = getSequenceById(currentSequence);
    if (!sequence) return;

    const step = sequence.steps[currentStep];
    if (step?.nextStep === condition) {
      get().nextStep();
    }
  },
}));
