/**
 * Tutorial store — tracks tutorial sequences, guided first-week session,
 * per-screen guides, and contextual hints.
 *
 * Persisted state (localStorage): completedSequences, dismissed,
 * visitedScreens, dismissedHints, guidedMilestones, guidedSessionCompleted.
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
  | "firstTravel"
  | OnboardingSequenceId
  | AhaMomentSequenceId;

export type GuidedMilestoneId =
  | "viewedDashboard"
  | "openedCalendar"
  | "scheduledActivity"
  | "advancedWeek"
  | "attendedMatch"
  | "focusedPlayer"
  | "completedMatch"
  | "wroteReport"
  | "submittedReport"
  | "checkedInbox";

export interface ContextualHint {
  id: string;
  message: string;
  cta?: { label: string; screen: string };
  handbookChapter?: string;
}

interface PersistedTutorialData {
  completedSequences: string[];
  dismissed: boolean;
  visitedScreens: string[];
  dismissedHints: string[];
  guidedMilestones: Record<string, boolean>;
  guidedSessionCompleted: boolean;
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

const PERSISTED_DEFAULTS: PersistedTutorialData = {
  completedSequences: [],
  dismissed: false,
  visitedScreens: [],
  dismissedHints: [],
  guidedMilestones: {},
  guidedSessionCompleted: false,
};

function readPersisted(): PersistedTutorialData {
  if (typeof window === "undefined") return { ...PERSISTED_DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...PERSISTED_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PersistedTutorialData>;
    return {
      completedSequences: Array.isArray(parsed.completedSequences)
        ? parsed.completedSequences
        : [],
      dismissed: parsed.dismissed === true,
      visitedScreens: Array.isArray(parsed.visitedScreens)
        ? parsed.visitedScreens
        : [],
      dismissedHints: Array.isArray(parsed.dismissedHints)
        ? parsed.dismissedHints
        : [],
      guidedMilestones:
        parsed.guidedMilestones && typeof parsed.guidedMilestones === "object"
          ? parsed.guidedMilestones
          : {},
      guidedSessionCompleted: parsed.guidedSessionCompleted === true,
    };
  } catch {
    return { ...PERSISTED_DEFAULTS };
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

  // ── Guided First Week ────────────────────────────────────────────────────

  /** True while the guided first-week session is in progress. */
  guidedSessionActive: boolean;

  /** True once the guided session has been completed (persisted). */
  guidedSessionCompleted: boolean;

  /** Record of which milestones the player has reached. */
  guidedMilestones: Record<GuidedMilestoneId, boolean>;

  /** The milestone the player should work toward next. */
  currentGuidedTask: GuidedMilestoneId | null;

  // ── Screen Guides ────────────────────────────────────────────────────────

  /** Screens the player has visited at least once. Persisted. */
  visitedScreens: Set<string>;

  /** The screen guide currently being displayed, or null. */
  activeScreenGuide: string | null;

  /** Current step within the active screen guide. */
  screenGuideStep: number;

  // ── Contextual Hints ─────────────────────────────────────────────────────

  /** Hint IDs the player has dismissed. Persisted. */
  dismissedHints: Set<string>;

  /** The hint currently being displayed, or null. */
  activeHint: ContextualHint | null;

  // ── Mentor ───────────────────────────────────────────────────────────────

  mentorName: string;
  mentorTitle: string;

  // ── Actions ──────────────────────────────────────────────────────────────

  startSequence: (id: TutorialSequenceId) => void;
  queueSequence: (id: TutorialSequenceId) => void;
  nextStep: () => void;
  skipTutorial: () => void;
  dismissForever: () => void;
  checkAutoAdvance: (condition: string) => void;

  // Guided session
  startGuidedSession: (hasClub: boolean) => void;
  completeMilestone: (id: GuidedMilestoneId) => void;
  skipGuidedSession: () => void;

  // Screen guides
  recordScreenVisit: (screen: string) => void;
  openScreenGuide: (screen: string) => void;
  closeScreenGuide: () => void;
  advanceScreenGuide: () => void;

  // Hints
  showHint: (hint: ContextualHint) => void;
  dismissHint: (hintId: string) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

// readPersisted() is called at module evaluation time, which happens in the
// browser after hydration — localStorage is available at that point.
const persisted = readPersisted();

const MILESTONE_ORDER: GuidedMilestoneId[] = [
  "viewedDashboard",
  "openedCalendar",
  "scheduledActivity",
  "advancedWeek",
  "attendedMatch",
  "focusedPlayer",
  "completedMatch",
  "wroteReport",
  "submittedReport",
  "checkedInbox",
];

function nextMilestone(
  milestones: Record<GuidedMilestoneId, boolean>,
): GuidedMilestoneId | null {
  for (const m of MILESTONE_ORDER) {
    if (!milestones[m]) return m;
  }
  return null;
}

/** Persist all tutorial state in one write. */
function persistAll(state: TutorialState): void {
  writePersisted({
    completedSequences: Array.from(state.completedSequences),
    dismissed: state.dismissed,
    visitedScreens: Array.from(state.visitedScreens),
    dismissedHints: Array.from(state.dismissedHints),
    guidedMilestones: state.guidedMilestones,
    guidedSessionCompleted: state.guidedSessionCompleted,
  });
}

const initialMilestones: Record<GuidedMilestoneId, boolean> = {
  viewedDashboard: false,
  openedCalendar: false,
  scheduledActivity: false,
  advancedWeek: false,
  attendedMatch: false,
  focusedPlayer: false,
  completedMatch: false,
  wroteReport: false,
  submittedReport: false,
  checkedInbox: false,
};

// Merge persisted milestones with defaults (handles old saves).
const restoredMilestones: Record<GuidedMilestoneId, boolean> = {
  ...initialMilestones,
  ...(persisted.guidedMilestones as Record<GuidedMilestoneId, boolean>),
};

export const useTutorialStore = create<TutorialState>((set, get) => ({
  // ── Existing tutorial sequence state ─────────────────────────────────────
  currentStep: 0,
  currentSequence: null,
  completedSequences: new Set(persisted.completedSequences),
  tutorialActive: false,
  dismissed: persisted.dismissed,
  pendingSequence: null,

  // ── Guided session state ─────────────────────────────────────────────────
  guidedSessionActive: false,
  guidedSessionCompleted: persisted.guidedSessionCompleted,
  guidedMilestones: restoredMilestones,
  currentGuidedTask: persisted.guidedSessionCompleted
    ? null
    : nextMilestone(restoredMilestones),

  // ── Screen guides state ──────────────────────────────────────────────────
  visitedScreens: new Set(persisted.visitedScreens),
  activeScreenGuide: null,
  screenGuideStep: 0,

  // ── Hints state ──────────────────────────────────────────────────────────
  dismissedHints: new Set(persisted.dismissedHints),
  activeHint: null,

  // ── Mentor ───────────────────────────────────────────────────────────────
  mentorName: "Margaret Chen",
  mentorTitle: "Director of Recruitment",

  // ── Existing actions (unchanged) ─────────────────────────────────────────

  startSequence(id) {
    const { dismissed, completedSequences } = get();
    if (dismissed) return;
    if (id === "firstWeek") return;
    if (completedSequences.has(id)) return;

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
      const next = new Set(completedSequences);
      next.add(currentSequence);

      set({
        completedSequences: next,
        currentSequence: null,
        currentStep: 0,
        tutorialActive: false,
        pendingSequence: null,
      });
      persistAll(get());

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
    set({
      dismissed: true,
      currentSequence: null,
      currentStep: 0,
      tutorialActive: false,
      pendingSequence: null,
      guidedSessionActive: false,
      activeScreenGuide: null,
      activeHint: null,
    });
    persistAll(get());
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

  // ── Guided session actions ───────────────────────────────────────────────

  startGuidedSession(hasClub) {
    const { dismissed, guidedSessionCompleted } = get();
    if (dismissed || guidedSessionCompleted) return;

    set({
      guidedSessionActive: true,
      guidedMilestones: { ...initialMilestones },
      currentGuidedTask: "viewedDashboard",
      mentorName: hasClub ? "Margaret Chen" : "Tommy Reyes",
      mentorTitle: hasClub ? "Director of Recruitment" : "Senior Scout",
    });
    persistAll(get());
  },

  completeMilestone(id) {
    const { guidedSessionActive, guidedMilestones, dismissed } = get();
    if (dismissed || !guidedSessionActive || guidedMilestones[id]) return;

    const updated = { ...guidedMilestones, [id]: true };
    const next = nextMilestone(updated);
    const allDone = next === null;

    set({
      guidedMilestones: updated,
      currentGuidedTask: next,
      guidedSessionActive: !allDone,
      guidedSessionCompleted: allDone || get().guidedSessionCompleted,
    });
    persistAll(get());
  },

  skipGuidedSession() {
    set({
      guidedSessionActive: false,
      guidedSessionCompleted: true,
      currentGuidedTask: null,
    });
    persistAll(get());
  },

  // ── Screen guide actions ─────────────────────────────────────────────────

  recordScreenVisit(screen) {
    const { visitedScreens, dismissed, guidedSessionActive } = get();
    if (dismissed) return;
    if (visitedScreens.has(screen)) return;

    const updated = new Set(visitedScreens);
    updated.add(screen);
    set({ visitedScreens: updated });
    persistAll(get());

    // Auto-open screen guide on first visit (unless guided session is active).
    if (!guidedSessionActive) {
      get().openScreenGuide(screen);
    }
  },

  openScreenGuide(screen) {
    const { dismissed } = get();
    if (dismissed) return;
    set({ activeScreenGuide: screen, screenGuideStep: 0 });
  },

  closeScreenGuide() {
    set({ activeScreenGuide: null, screenGuideStep: 0 });
  },

  advanceScreenGuide() {
    set((s) => ({ screenGuideStep: s.screenGuideStep + 1 }));
  },

  // ── Hint actions ─────────────────────────────────────────────────────────

  showHint(hint) {
    const { dismissed, dismissedHints } = get();
    if (dismissed || dismissedHints.has(hint.id)) return;
    set({ activeHint: hint });
  },

  dismissHint(hintId) {
    const { dismissedHints } = get();
    const updated = new Set(dismissedHints);
    updated.add(hintId);
    set({ dismissedHints: updated, activeHint: null });
    persistAll(get());
  },
}));

// Expose store for E2E testing (dev only — stripped in production builds)
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as any).__TUTORIAL_STORE__ = useTutorialStore;
}
