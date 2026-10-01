import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeeklyWorkerInput } from "@/stores/actions/weeklyWorkerTypes";
const mocks = vi.hoisted(() => ({ fallback: vi.fn() }));
vi.mock("@/stores/actions/weeklyWorkerSync", () => ({ createWeeklyWorkerWireState: (_base: unknown, state: unknown) => state }));
vi.mock("@/stores/actions/weeklyHeadlessTransaction", () => ({
  runHeadlessWeeklyTransaction: mocks.fallback,
  compactWeeklyWorkerCommit: (_source: unknown, commit: unknown) => commit,
  materializeWeeklyWorkerCommit: (_source: unknown, commit: unknown) => commit,
}));
import { runWeeklyWorkerTransaction, terminateWeeklySimulationWorker } from "@/lib/weeklySimulationWorkerClient";

class ControlledWorker extends EventTarget {
  static instances: ControlledWorker[] = [];
  static failNextPost = false;
  request: any;
  terminated = false;
  constructor() { super(); ControlledWorker.instances.push(this); }
  postMessage(request: unknown) {
    if (ControlledWorker.failNextPost) { ControlledWorker.failNextPost = false; throw new Error("clone failed"); }
    this.request = request;
  }
  terminate() { this.terminated = true; }
  answer() {
    this.dispatchEvent(new MessageEvent("message", { data: {
      kind: "weekly-transaction-result", protocolVersion: this.request.protocolVersion,
      jobId: this.request.job.id, source: this.request.job.source, state: commit(this.request.state),
    } }));
  }
}

function input(): WeeklyWorkerInput {
  return { gameState: { seed: "same", currentSeason: 1, currentWeek: 1, fixtures: [], scout: { primarySpecialization: "youth" } },
    weekSimulation: {}, currentScreen: "weekSimulation", isLoaded: true,
    tutorial: { completedSequences: [], visitedScreens: [], dismissedHints: [], discoveredFeatures: [] },
  } as unknown as WeeklyWorkerInput;
}
function commit(state: WeeklyWorkerInput) {
  return { patch: { gameState: { ...state.gameState, currentWeek: 2 } }, tutorialCommands: [],
    metrics: { computeMs: 1, changedFieldCount: 1, changedEntryCount: 1, totalFieldCount: 6, responseBytes: 50 } };
}

describe("weekly worker replacement and pending request cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks();
    ControlledWorker.instances = []; ControlledWorker.failNextPost = false;
    vi.stubGlobal("Worker", ControlledWorker);
    mocks.fallback.mockImplementation(commit);
  });
  afterEach(() => { terminateWeeklySimulationWorker(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("cancels a replaced career without computing obsolete main-thread fallback", async () => {
    const pending = runWeeklyWorkerTransaction(input());
    const rejection = expect(pending).rejects.toThrow(/cancel|changed/i);
    terminateWeeklySimulationWorker();
    await rejection;
    expect(mocks.fallback).not.toHaveBeenCalled();
    expect(ControlledWorker.instances[0].terminated).toBe(true);
  });

  it("ignores late errors from disposed workers while a new same-seed job runs", async () => {
    const old = runWeeklyWorkerTransaction(input());
    const rejection = expect(old).rejects.toThrow(/cancel|changed/i);
    const oldWorker = ControlledWorker.instances[0];
    terminateWeeklySimulationWorker();
    await rejection;
    const current = runWeeklyWorkerTransaction(input());
    const currentWorker = ControlledWorker.instances[1];
    oldWorker.dispatchEvent(new Event("error"));
    expect(currentWorker.terminated).toBe(false);
    currentWorker.answer();
    expect((await current).route).toBe("worker");
    expect(mocks.fallback).not.toHaveBeenCalled();
  });

  it("keeps genuine active-worker timeout fallback bounded and singular", async () => {
    const pending = runWeeklyWorkerTransaction(input());
    await vi.advanceTimersByTimeAsync(8_000);
    expect((await pending).route).toBe("main-thread-fallback");
    expect(mocks.fallback).toHaveBeenCalledTimes(1);
  });

  it("removes a synchronously failed postMessage timer before a later job starts", async () => {
    ControlledWorker.failNextPost = true;
    const failed = await runWeeklyWorkerTransaction(input());
    expect(failed.route).toBe("main-thread-fallback");
    expect(mocks.fallback).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_000);
    const pending = runWeeklyWorkerTransaction(input());
    const active = ControlledWorker.instances.at(-1)!;
    await vi.advanceTimersByTimeAsync(4_001);
    expect(active.terminated).toBe(false);
    active.answer();
    expect((await pending).route).toBe("worker");
    expect(mocks.fallback).toHaveBeenCalledTimes(1);
  });
});
