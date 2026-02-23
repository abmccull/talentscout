/**
 * Tutorial store — tracks which tutorial sequence is active, the current
 * step within that sequence, and which sequences have been completed.
 *
 * `completedSequences` and `dismissed` are persisted to localStorage so the
 * user only sees each tutorial once and can permanently opt out.
 */

import { create } from "zustand";
import { getSequenceById } from "@/components/game/tutorial/tutorialSteps";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "talentscout_tutorial";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TutorialSequenceId =
  | "firstWeek"
  | "firstReport"
  | "careerProgression";

interface PersistedTutorialData {
  completedSequences: string[];
  dismissed: boolean;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function readPersisted(): PersistedTutorialData {
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

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * Begin a named tutorial sequence from step 0.
   * No-ops if `dismissed` is true or the sequence was already completed.
   */
  startSequence: (id: TutorialSequenceId) => void;

  /**
   * Advance to the next step in the current sequence.
   * Marks the sequence as completed and deactivates when the last step is
   * acknowledged.
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

  startSequence(id) {
    const { dismissed, completedSequences } = get();

    // Respect permanent opt-out and skip already-seen sequences.
    if (dismissed) return;
    if (completedSequences.has(id)) return;

    set({
      currentSequence: id,
      currentStep: 0,
      tutorialActive: true,
    });
  },

  nextStep() {
    const { currentStep, currentSequence, completedSequences } = get();
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
      });
    } else {
      set({ currentStep: currentStep + 1 });
    }
  },

  skipTutorial() {
    set({
      currentSequence: null,
      currentStep: 0,
      tutorialActive: false,
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
    });
  },
}));
