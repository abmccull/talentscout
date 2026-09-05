import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createSession } from "@/engine/observation/session";
import { createRNG } from "@/engine/rng";
import { createInsightState } from "@/engine/insight/insight";
import type { GameState } from "@/engine/core/types";
import type { ObservationSession, SessionFlaggedMoment } from "@/engine/observation/types";
import { createObservationActions } from "@/stores/actions/observationActions";
import type { GameStoreState, SetState } from "@/stores/actions/types";
import { confirmObservationLeave, LeaveObservationButton, LeaveObservationDialog, observationLeavePolicy } from "@/components/game/observation/LeaveObservationButton";

vi.mock("@/stores/actions/persistGameplayAutosave", () => ({
  queueGameplayAutosave: vi.fn(), snapshotPersistedGameState: (state: GameState) => state,
}));

function watch(): ObservationSession {
  const session = createSession({
    activityType: "youthTournament", specialization: "youth", seed: "leave-watch",
    week: 2, season: 1, activityInstanceId: "tournament-day-2",
    playerPool: [{ playerId: "prospect", name: "Milo Vale", position: "CM" }],
  }, createRNG("leave-watch"));
  return { ...session, state: "active", currentPhaseIndex: 1, insightPointsEarned: 8,
    flaggedMoments: [{ id: "flag", phaseIndex: 0, reaction: "concerning", minute: 10,
      moment: { id: "moment", playerId: "prospect", momentType: "technicalAction" },
    }] as SessionFlaggedMoment[] };
}

describe("truthful leave-watch confirmation", () => {
  it("requires confirmation for the flagged tournament watch and describes the exact loss", () => {
    const session = watch();
    expect(observationLeavePolicy(session)).toBe("confirm");
    const html = renderToStaticMarkup(createElement(LeaveObservationDialog, {
      session, onCancel: vi.fn(), onConfirm: vi.fn(),
    }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-describedby="leave-observation-loss"');
    expect(html).toContain("1 flagged moment");
    expect(html).toContain("will be discarded");
    expect(html).toContain("No new observation evidence or completion rewards will be banked");
    expect(html).toContain("remain unfinished");
    expect(html.indexOf("Keep watching")).toBeLessThan(html.indexOf("Leave and discard"));
    expect(renderToStaticMarkup(createElement(LeaveObservationButton, { session }))).toContain("Leave watch…");
  });

  it("leaves work untouched until confirmation and keeps the existing complete-only reward rule", () => {
    const session = watch();
    const originalState = {
      seed: "leave-watch", currentWeek: 2, currentSeason: 1,
      scout: { primarySpecialization: "youth", attributes: { intuition: 10 }, fatigue: 0, insightState: createInsightState() },
      contacts: {}, players: {}, unsignedYouth: {}, observations: {}, reflectionJournal: {},
      gutFeelings: [], completedInteractiveSessions: [], activeObservationSession: session,
      schedule: { activities: [{ instanceId: session.activityInstanceId }] },
    } as unknown as GameState;
    let store = { gameState: originalState, activeSession: session, currentScreen: "observation", sessionReturnScreen: "weekSimulation" } as unknown as GameStoreState;
    const set: SetState = (patch) => { store = { ...store, ...(typeof patch === "function" ? patch(store) : patch) }; };
    const actions = createObservationActions(() => store, set);
    // Opening/cancelling the dialog does not call the completion action.
    expect(observationLeavePolicy(store.activeSession)).toBe("confirm");
    expect(store.activeSession?.flaggedMoments).toHaveLength(1);
    expect(store.gameState).toBe(originalState);
    expect(confirmObservationLeave(session, store.activeSession, actions.endObservationSession)).toBe(true);
    expect(store.activeSession).toBeNull();
    expect(store.currentScreen).toBe("weekSimulation");
    expect(store.gameState?.observations).toEqual({});
    expect(store.gameState?.completedInteractiveSessions).toEqual([]);
    expect(store.gameState?.scout.insightState?.points).toBe(0);
    expect(store.gameState?.schedule).toBe(originalState.schedule);
    const after = store.gameState;
    expect(confirmObservationLeave(session, store.activeSession, actions.endObservationSession)).toBe(false);
    expect(store.gameState).toBe(after);
  });

  it("cannot use an old confirmation to discard a different or advanced session", () => {
    const session = watch();
    const end = vi.fn();
    expect(confirmObservationLeave(session, { ...session, currentPhaseIndex: 2 }, end)).toBe(false);
    expect(confirmObservationLeave(session, { ...session, id: "another-session" }, end)).toBe(false);
    expect(end).not.toHaveBeenCalled();
  });

  it("protects the opening and completed states even if a stale control is invoked", () => {
    const opening = { ...watch(), activityInstanceId: "opening-discovery:lead" };
    const end = vi.fn();
    expect(observationLeavePolicy(opening)).toBe("blocked");
    expect(confirmObservationLeave(opening, opening, end)).toBe(false);
    expect(renderToStaticMarkup(createElement(LeaveObservationButton, { session: opening }))).toBe("");
    expect(observationLeavePolicy({ ...watch(), state: "reflection" })).toBe("blocked");
    expect(observationLeavePolicy(null)).toBe("blocked");
    expect(end).not.toHaveBeenCalled();
  });

  it("allows an untouched active session to leave directly but protects focus and analysis choices", () => {
    const empty = { ...watch(), currentPhaseIndex: 0, flaggedMoments: [], insightPointsEarned: 0 };
    expect(observationLeavePolicy(empty)).toBe("leave");
    expect(observationLeavePolicy({ ...empty, players: [{ ...empty.players[0], isFocused: true }] })).toBe("confirm");
    expect(observationLeavePolicy({ ...empty, mode: "analysis", phases: [{ ...empty.phases[0], selectedDataPointId: "data-1" }] })).toBe("confirm");
  });
});
