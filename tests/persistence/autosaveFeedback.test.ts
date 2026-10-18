import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";
import type { SetState } from "@/stores/actions/types";

const persist = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());
vi.mock("@/lib/activeSaveProvider", () => ({ getActiveSaveProvider: async () => ({}) }));
vi.mock("@/lib/saveProvider", () => ({ persistGameState: persist }));
import {
  queueGameplayAutosave,
  resetGameplayAutosaveWatermark,
  snapshotPersistedGameState,
} from "@/stores/actions/persistGameplayAutosave";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const career = (week = 1) => ({ currentWeek: week, lastSaved: 0 }) as GameState;
function feedback() {
  let state = { autosaveStatus: "idle", autosaveError: null as string | null };
  const set: SetState = (patch) => {
    if (typeof patch === "function") throw new Error("Unexpected updater");
    state = { ...state, ...patch };
  };
  return { set, read: () => ({ ...state }), reset: () => { state = { autosaveStatus: "idle", autosaveError: null }; } };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetGameplayAutosaveWatermark();
  persist.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(async () => {
  resetGameplayAutosaveWatermark();
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("truthful autosave feedback", () => {
  it("stays pending from request until actual save acceptance, never from snapshot time", async () => {
    const ui = feedback();
    const save = deferred();
    persist.mockReturnValueOnce(save.promise);
    snapshotPersistedGameState(career());
    const afterSnapshot = ui.read();
    queueGameplayAutosave(career(), ui.set);
    const queued = ui.read();
    const callsBeforeDelay = persist.mock.calls.length;
    await vi.advanceTimersByTimeAsync(400);
    const inFlight = ui.read();
    save.resolve();
    await vi.runAllTimersAsync();
    expect(afterSnapshot.autosaveStatus).toBe("idle");
    expect(callsBeforeDelay).toBe(0);
    expect(queued.autosaveStatus).toBe("pending");
    expect(inFlight.autosaveStatus).toBe("pending");
    expect(ui.read()).toEqual({ autosaveStatus: "saved", autosaveError: null });
  });

  it.each(["success", "failure"] as const)("keeps a newer edit pending when the previous write ends in %s", async (outcome) => {
    const ui = feedback();
    const old = deferred();
    const latest = deferred();
    persist.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    queueGameplayAutosave(career(), ui.set);
    await vi.advanceTimersByTimeAsync(400);
    queueGameplayAutosave(career(2), ui.set);
    if (outcome === "success") old.resolve();
    else old.reject(new Error("Previous write failed"));
    await vi.advanceTimersByTimeAsync(0);
    const afterOlderCompletion = ui.read();
    await vi.advanceTimersByTimeAsync(400);
    const beforeLatestAcceptance = ui.read();
    latest.resolve();
    await vi.runAllTimersAsync();
    expect(afterOlderCompletion).toEqual({ autosaveStatus: "pending", autosaveError: null });
    expect(beforeLatestAcceptance).toEqual({ autosaveStatus: "pending", autosaveError: null });
    expect(ui.read()).toEqual({ autosaveStatus: "saved", autosaveError: null });
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("shows the latest failure and clears it only when a retry is requested", async () => {
    const ui = feedback();
    persist.mockRejectedValueOnce(new Error("Local storage is full"));
    queueGameplayAutosave(career(), ui.set);
    await vi.runAllTimersAsync();
    const failed = ui.read();
    queueGameplayAutosave(career(2), ui.set);
    const retry = ui.read();
    await vi.runAllTimersAsync();
    expect(failed).toEqual({ autosaveStatus: "error", autosaveError: "Local storage is full" });
    expect(retry).toEqual({ autosaveStatus: "pending", autosaveError: null });
    expect(ui.read()).toEqual({ autosaveStatus: "saved", autosaveError: null });
  });

  it.each(["success", "failure"] as const)("ignores the replaced career's late %s", async (outcome) => {
    const ui = feedback();
    const old = deferred();
    persist.mockReturnValueOnce(old.promise);
    queueGameplayAutosave(career(), ui.set);
    await vi.advanceTimersByTimeAsync(400);
    const hadPending = resetGameplayAutosaveWatermark();
    ui.reset();
    if (outcome === "success") old.resolve();
    else old.reject(new Error("Replaced career write failed"));
    await vi.runAllTimersAsync();
    const afterOldCompletion = ui.read();
    queueGameplayAutosave(career(8), ui.set);
    const nextRequested = ui.read();
    await vi.runAllTimersAsync();
    expect(hadPending).toBe(true);
    expect(afterOldCompletion).toEqual({ autosaveStatus: "idle", autosaveError: null });
    expect(nextRequested).toEqual({ autosaveStatus: "pending", autosaveError: null });
    expect(ui.read()).toEqual({ autosaveStatus: "saved", autosaveError: null });
  });
});
