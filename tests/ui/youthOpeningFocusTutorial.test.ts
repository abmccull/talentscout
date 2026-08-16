import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGameStore } from "@/stores/gameStore";
import {
  createEmptyGuidedMilestones,
  useTutorialStore,
} from "@/stores/tutorialStore";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));

vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0,
  migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: {
    mods: { toArray: async () => [] },
    leaderboard: { put: async () => undefined, clear: async () => undefined },
  },
}));

beforeEach(() => {
  useTutorialStore.setState({
    dismissed: false,
    guidedSessionActive: false,
    guidedSessionForcedReplay: false,
    guidedSessionCompleted: false,
    guidedSessionKind: "discoveryHook",
    guidedMilestones: createEmptyGuidedMilestones(),
    currentGuidedTask: null,
  });
});

describe("opening Watch focus beat", () => {
  it("does not spend focus for the player when they begin the opening session", async () => {
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Ava",
      scoutLastName: "Morgan",
      scoutAge: 24,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "opening-focus-tutorial",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
    });

    useTutorialStore.getState().startGuidedSession(false, "discoveryHook", {
      forceReplay: true,
    });

    const session = useGameStore.getState().activeSession;
    expect(session?.state).toBe("setup");
    expect(useTutorialStore.getState().currentGuidedTask).toBe("attendedMatch");

    useGameStore.getState().beginSession();

    const started = useGameStore.getState().activeSession;
    expect(started?.state).toBe("active");
    expect(started?.players.some((player) => player.isFocused)).toBe(false);
    expect(useTutorialStore.getState().currentGuidedTask).toBe("focusedPlayer");

    const leadId = useGameStore.getState().gameState?.openingCase?.playerId
      ?? started?.players[0]?.playerId;
    expect(leadId).toBeTruthy();
    useGameStore.getState().allocateSessionFocus(leadId!, "technical");

    expect(
      useGameStore.getState().activeSession?.players.find((player) => player.playerId === leadId)?.isFocused,
    ).toBe(true);
    expect(useTutorialStore.getState().currentGuidedTask).toBe("flaggedBreakthrough");
  }, 30_000);

  it("skips the mentor hour when the player chose start without the guide", async () => {
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Ava",
      scoutLastName: "Morgan",
      scoutAge: 24,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "skip-guide-first-hour",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
      openingMode: "tutorial",
      guideFirstHour: false,
    });

    expect(useTutorialStore.getState().guidedSessionActive).toBe(false);
    expect(useTutorialStore.getState().currentGuidedTask).toBeNull();
    expect(useGameStore.getState().activeSession?.state).toBe("setup");
  }, 30_000);
});
