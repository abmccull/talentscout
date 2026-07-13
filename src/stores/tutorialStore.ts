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
import {
  mergePersistedPlayerExperience,
  readPlayerExperience,
  subscribePlayerExperience,
  updatePlayerExperience,
} from "@/lib/playerExperience";

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
  | "ahaMoment:data"
  | "ahaMoment:equipment"
  | "ahaMoment:npcReport"
  | "ahaMoment:freeAgent"
  | "ahaMoment:seasonAward"
  | "ahaMoment:contactIntel"
  | "ahaMoment:perkActivated";

export type ContextualTutorialId =
  | "contextual:equipment"
  | "contextual:npcManagement"
  | "contextual:freeAgent"
  | "contextual:network"
  | "contextual:rival";

export type MentorCheckinId =
  | "mentorCheckin:week2"
  | "mentorCheckin:week3"
  | "mentorCheckin:week4";

export type TutorialSequenceId =
  | "firstWeek"
  | "firstReport"
  | "careerProgression"
  | "firstMatch"
  | "firstReportWriting"
  | "firstTravel"
  | OnboardingSequenceId
  | AhaMomentSequenceId
  | ContextualTutorialId
  | MentorCheckinId;

export type GuidedMilestoneId =
  | "viewedDashboard"
  | "openedCalendar"
  | "scheduledActivity"
  | "advancedWeek"
  | "attendedMatch"
  | "focusedPlayer"
  | "flaggedBreakthrough"
  | "completedMatch"
  | "wroteReport"
  | "submittedReport"
  | "checkedInbox";

export type GuidedSessionKind = "firstWeek" | "discoveryHook";

export interface GuidedSessionStartOptions {
  /** Replay onboarding for this session without clearing profile completion. */
  forceReplay?: boolean;
}

export interface ContextualHint {
  id: string;
  message: string;
  cta?: { label: string; screen: string };
  wikiArticle?: string;
  /** @deprecated Use wikiArticle instead */
  handbookChapter?: string;
}

interface PersistedTutorialData {
  completedSequences: string[];
  dismissed: boolean;
  visitedScreens: string[];
  dismissedHints: string[];
  guidedMilestones: Record<string, boolean>;
  guidedSessionCompleted: boolean;
  guidedSessionKind: GuidedSessionKind;
  /** Features the player discovered organically (without a tutorial). */
  discoveredFeatures: string[];
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
  guidedSessionKind: "firstWeek",
  discoveredFeatures: [],
};

function readPersisted(): PersistedTutorialData {
  const profileExperience = readPlayerExperience();
  const withProfileExperience = (
    data: PersistedTutorialData,
  ): PersistedTutorialData => ({
    ...data,
    dismissed: data.dismissed || profileExperience.tutorial.dismissed,
    guidedSessionCompleted:
      data.guidedSessionCompleted || profileExperience.tutorial.completed,
  });
  if (typeof window === "undefined") {
    return withProfileExperience({ ...PERSISTED_DEFAULTS });
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return withProfileExperience({ ...PERSISTED_DEFAULTS });
    const parsed = JSON.parse(raw) as Partial<PersistedTutorialData>;
    const migrated: PersistedTutorialData = {
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
      guidedSessionKind: parsed.guidedSessionKind === "discoveryHook"
        ? "discoveryHook"
        : "firstWeek",
      discoveredFeatures: Array.isArray(parsed.discoveredFeatures)
        ? parsed.discoveredFeatures
        : [],
    };
    const mergedExperience = mergePersistedPlayerExperience({
      guidedSessionCompleted: migrated.guidedSessionCompleted,
      dismissed: migrated.dismissed,
      updatedAt: 0,
    });
    return {
      ...migrated,
      dismissed: migrated.dismissed || mergedExperience.tutorial.dismissed,
      guidedSessionCompleted:
        migrated.guidedSessionCompleted
        || mergedExperience.tutorial.completed,
    };
  } catch {
    return withProfileExperience({ ...PERSISTED_DEFAULTS });
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

  /** Transient override used only when an experienced player requests replay. */
  guidedSessionForcedReplay: boolean;

  /** True once the guided session has been completed (persisted). */
  guidedSessionCompleted: boolean;

  /** Determines whether milestones teach planning first or begin inside a live discovery. */
  guidedSessionKind: GuidedSessionKind;

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

  /** Screen guide queued during guided session, to show after milestone completes. */
  pendingScreenGuide: string | null;

  // ── Feature Discovery Tracking ──────────────────────────────────────────

  /**
   * Features the player has discovered organically (without a tutorial).
   * When a feature is in this set, its contextual tutorial is skipped.
   * Persisted to localStorage.
   */
  discoveredFeatures: Set<string>;

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
  startGuidedSession: (
    hasClub: boolean,
    kind?: GuidedSessionKind,
    options?: GuidedSessionStartOptions,
  ) => void;
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

  // Feature discovery
  recordFeatureDiscovery: (feature: string) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

// readPersisted() is called at module evaluation time, which happens in the
// browser after hydration — localStorage is available at that point.
const persisted = readPersisted();

const FIRST_WEEK_MILESTONE_ORDER: GuidedMilestoneId[] = [
  "viewedDashboard",
  "openedCalendar",
  "scheduledActivity",
  "advancedWeek",
  "attendedMatch",
  "focusedPlayer",
  "flaggedBreakthrough",
  "completedMatch",
  "wroteReport",
  "submittedReport",
  "checkedInbox",
];

const DISCOVERY_HOOK_MILESTONE_ORDER: GuidedMilestoneId[] = [
  "attendedMatch",
  "focusedPlayer",
  "flaggedBreakthrough",
  "completedMatch",
  "wroteReport",
  "submittedReport",
  "checkedInbox",
  "openedCalendar",
  "scheduledActivity",
  "advancedWeek",
];

function milestoneOrder(kind: GuidedSessionKind): GuidedMilestoneId[] {
  return kind === "discoveryHook"
    ? DISCOVERY_HOOK_MILESTONE_ORDER
    : FIRST_WEEK_MILESTONE_ORDER;
}

function nextMilestone(
  milestones: Record<GuidedMilestoneId, boolean>,
  kind: GuidedSessionKind,
): GuidedMilestoneId | null {
  for (const m of milestoneOrder(kind)) {
    if (!milestones[m]) return m;
  }
  return null;
}

/** Persist all tutorial state in one write. */
function persistAll(state: TutorialState): void {
  updatePlayerExperience({
    tutorialCompleted: state.guidedSessionCompleted,
    tutorialDismissed: state.dismissed,
  });
  writePersisted({
    completedSequences: Array.from(state.completedSequences),
    dismissed: state.dismissed,
    visitedScreens: Array.from(state.visitedScreens),
    dismissedHints: Array.from(state.dismissedHints),
    guidedMilestones: state.guidedMilestones,
    guidedSessionCompleted: state.guidedSessionCompleted,
    guidedSessionKind: state.guidedSessionKind,
    discoveredFeatures: Array.from(state.discoveredFeatures),
  });
}

const initialMilestones: Record<GuidedMilestoneId, boolean> = {
  viewedDashboard: false,
  openedCalendar: false,
  scheduledActivity: false,
  advancedWeek: false,
  attendedMatch: false,
  focusedPlayer: false,
  flaggedBreakthrough: false,
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
  guidedSessionForcedReplay: false,
  guidedSessionCompleted: persisted.guidedSessionCompleted,
  guidedSessionKind: persisted.guidedSessionKind,
  guidedMilestones: restoredMilestones,
  currentGuidedTask: persisted.guidedSessionCompleted
    ? null
    : nextMilestone(restoredMilestones, persisted.guidedSessionKind),

  // ── Screen guides state ──────────────────────────────────────────────────
  visitedScreens: new Set(persisted.visitedScreens),
  activeScreenGuide: null,
  screenGuideStep: 0,

  // ── Hints state ──────────────────────────────────────────────────────────
  dismissedHints: new Set(persisted.dismissedHints),
  activeHint: null,

  // ── Pending screen guide (queued during guided session) ─────────────────
  pendingScreenGuide: null,

  // ── Feature discovery tracking ─────────────────────────────────────────
  discoveredFeatures: new Set(persisted.discoveredFeatures),

  // ── Mentor ───────────────────────────────────────────────────────────────
  mentorName: "Margaret Chen",
  mentorTitle: "Director of Recruitment",

  // ── Existing actions (unchanged) ─────────────────────────────────────────

  startSequence(id) {
    const { dismissed, completedSequences, tutorialActive, guidedSessionActive, discoveredFeatures } = get();
    if (dismissed) return;
    if (id === "firstWeek") return;
    if (completedSequences.has(id)) return;

    // Skip contextual tutorials if the player already discovered the feature organically.
    if (id.startsWith("contextual:")) {
      const feature = id.slice("contextual:".length);
      if (discoveredFeatures.has(feature)) return;
    }

    // Don't start new sequences while one is already playing.
    if (tutorialActive) {
      get().queueSequence(id);
      return;
    }

    // Don't start onboarding during the guided session (queue it instead).
    if (id.startsWith("onboarding:") && guidedSessionActive) {
      set({ pendingSequence: id as TutorialSequenceId });
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
      guidedSessionForcedReplay: false,
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

  startGuidedSession(hasClub, kind = "firstWeek", options = {}) {
    const { dismissed, guidedSessionCompleted } = get();
    const forceReplay = options.forceReplay === true;
    if (!forceReplay && (dismissed || guidedSessionCompleted)) return;

    set({
      guidedSessionActive: true,
      guidedSessionForcedReplay: forceReplay,
      guidedSessionKind: kind,
      guidedMilestones: { ...initialMilestones },
      currentGuidedTask: nextMilestone(initialMilestones, kind),
      mentorName: hasClub ? "Margaret Chen" : "Tommy Reyes",
      mentorTitle: hasClub ? "Director of Recruitment" : "Senior Scout",
    });
    persistAll(get());
  },

  completeMilestone(id) {
    const {
      guidedSessionActive,
      guidedMilestones,
      guidedSessionKind,
      guidedSessionForcedReplay,
      dismissed,
      pendingScreenGuide,
    } = get();
    if (
      (dismissed && !guidedSessionForcedReplay)
      || !guidedSessionActive
      || guidedMilestones[id]
    ) return;

    const updated = { ...guidedMilestones, [id]: true };
    const next = nextMilestone(updated, guidedSessionKind);
    const allDone = next === null;

    set({
      guidedMilestones: updated,
      currentGuidedTask: next,
      guidedSessionActive: !allDone,
      guidedSessionForcedReplay: allDone ? false : guidedSessionForcedReplay,
      guidedSessionCompleted: allDone || get().guidedSessionCompleted,
    });
    persistAll(get());

    // Flush any screen guide that was queued during the guided session.
    if (pendingScreenGuide) {
      set({ pendingScreenGuide: null });
      // Brief delay so the milestone spotlight dismisses before the guide opens.
      setTimeout(() => get().openScreenGuide(pendingScreenGuide), 400);
    }
  },

  skipGuidedSession() {
    set({
      guidedSessionActive: false,
      guidedSessionForcedReplay: false,
      guidedSessionCompleted: true,
      currentGuidedTask: null,
    });
    persistAll(get());
  },

  // ── Screen guide actions ─────────────────────────────────────────────────

  recordScreenVisit(screen) {
    const {
      visitedScreens,
      dismissed,
      guidedSessionActive,
      guidedSessionForcedReplay,
    } = get();
    if (dismissed && !guidedSessionForcedReplay) return;
    if (visitedScreens.has(screen) && !guidedSessionForcedReplay) return;

    const updated = new Set(visitedScreens);
    updated.add(screen);

    if (guidedSessionActive) {
      // Queue the screen guide to show after the current milestone spotlight.
      set({ visitedScreens: updated, pendingScreenGuide: screen });
    } else {
      set({ visitedScreens: updated });
      persistAll(get());
      get().openScreenGuide(screen);
    }
    persistAll(get());
  },

  openScreenGuide(screen) {
    const { dismissed, guidedSessionForcedReplay } = get();
    if (dismissed && !guidedSessionForcedReplay) return;
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
    const { dismissed, dismissedHints, guidedSessionForcedReplay } = get();
    if (
      (dismissed && !guidedSessionForcedReplay)
      || dismissedHints.has(hint.id)
    ) return;
    set({ activeHint: hint });
  },

  dismissHint(hintId) {
    const { dismissedHints } = get();
    const updated = new Set(dismissedHints);
    updated.add(hintId);
    set({ dismissedHints: updated, activeHint: null });
    persistAll(get());
  },

  // ── Feature discovery actions ──────────────────────────────────────────

  recordFeatureDiscovery(feature) {
    const { discoveredFeatures } = get();
    if (discoveredFeatures.has(feature)) return;
    const updated = new Set(discoveredFeatures);
    updated.add(feature);
    set({ discoveredFeatures: updated });
    persistAll(get());
  },
}));

// Save/cloud loads can arrive after Zustand initializes. Keep the live store in
// sync with the monotonic profile record without coupling persistence to React.
subscribePlayerExperience((experience) => {
  useTutorialStore.setState((state) => {
    const guidedSessionCompleted =
      state.guidedSessionCompleted || experience.tutorial.completed;
    const dismissed = state.dismissed || experience.tutorial.dismissed;
    if (
      guidedSessionCompleted === state.guidedSessionCompleted
      && dismissed === state.dismissed
    ) {
      return state;
    }
    return {
      ...state,
      dismissed,
      guidedSessionCompleted,
      guidedSessionActive:
        (dismissed || guidedSessionCompleted) && !state.guidedSessionForcedReplay
        ? false
        : state.guidedSessionActive,
      currentGuidedTask:
        guidedSessionCompleted && !state.guidedSessionForcedReplay
        ? null
        : state.currentGuidedTask,
      tutorialActive: dismissed ? false : state.tutorialActive,
      currentSequence: dismissed ? null : state.currentSequence,
      activeScreenGuide: dismissed ? null : state.activeScreenGuide,
      activeHint: dismissed ? null : state.activeHint,
    };
  });
});

// Expose store for E2E testing (dev only — stripped in production builds)
if (
  typeof window !== "undefined"
  && (process.env.NODE_ENV !== "production"
    || process.env.NEXT_PUBLIC_ENABLE_E2E_BRIDGE === "true")
) {
  (window as any).__TUTORIAL_STORE__ = useTutorialStore;
}
