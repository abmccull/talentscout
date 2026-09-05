import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  cleanup: undefined as (() => void) | undefined,
  getState: vi.fn(),
}));
vi.mock("react", () => ({ useEffect: (effect: () => () => void) => { runtime.cleanup = effect(); } }));
vi.mock("@/stores/gameStore", () => ({ useGameStore: { getState: runtime.getState } }));
import { PersistenceRuntime } from "@/components/game/PersistenceRuntime";

function setup() {
  let request: (requestId: number) => void = () => {};
  const notifySaveFlushed = vi.fn(async (_result: { requestId: number; status: string }) => ({ ok: true }));
  const unsubscribe = vi.fn();
  const browserWindow = Object.assign(new EventTarget(), {
    electronAPI: { game: {
      onFlushSaveRequest: (listener: typeof request) => { request = listener; return unsubscribe; },
      notifySaveFlushed,
    } },
  });
  const browserDocument = Object.assign(new EventTarget(), { visibilityState: "hidden" });
  const flushGameplaySave = vi.fn(async () => {});
  const state = { gameState: { career: "first", watchlist: [] as string[] }, activeSession: null as object | null, flushGameplaySave };
  runtime.getState.mockImplementation(() => ({ ...state }));
  vi.stubGlobal("window", browserWindow);
  vi.stubGlobal("document", browserDocument);
  PersistenceRuntime();
  return { browserWindow, browserDocument, state, flushGameplaySave, notifySaveFlushed, unsubscribe, request: (id: number) => request(id) };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("persistence lifecycle", () => {
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => {
    runtime.cleanup?.();
    runtime.cleanup = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("reports a failed quit save without exposing the error in IPC", async () => {
    const h = setup();
    h.flushGameplaySave.mockRejectedValueOnce(new Error("private storage details"));
    h.request(7);
    await settle();
    expect(h.notifySaveFlushed).toHaveBeenCalledExactlyOnceWith({ requestId: 7, status: "failed" });
  });

  it("retires the previous quit loop when retry arrives during a pending flush", async () => {
    const h = setup();
    let finishDrain: () => void = () => {};
    const drain = new Promise<void>((resolve) => { finishDrain = resolve; });
    h.flushGameplaySave.mockImplementation(() => {
      h.state.gameState = { ...h.state.gameState };
      return drain;
    });
    h.request(1);
    h.request(2);
    expect(h.flushGameplaySave).toHaveBeenCalledTimes(2);
    await settle();
    expect(h.notifySaveFlushed).not.toHaveBeenCalled();
    finishDrain();
    await settle();
    expect(h.notifySaveFlushed).toHaveBeenCalledExactlyOnceWith({ requestId: 2, status: "saved" });
    expect(h.flushGameplaySave).toHaveBeenCalledTimes(2);
  });

  it("waits for a second write when the watchlist changes during the first write", async () => {
    const h = setup();
    const finish: Array<() => void> = [];
    const written: string[][] = [];
    h.flushGameplaySave.mockImplementation(() => {
      // Match the store's synchronous saved-snapshot publication.
      h.state.gameState = { ...h.state.gameState };
      written.push([...h.state.gameState.watchlist]);
      return new Promise<void>((resolve) => { finish.push(resolve); });
    });
    h.request(1);
    h.state.gameState = { ...h.state.gameState, watchlist: ["player-edited-during-save"] };
    finish[0]();
    await settle();
    expect(h.flushGameplaySave).toHaveBeenCalledTimes(2);
    expect(written).toEqual([[], ["player-edited-during-save"]]);
    expect(h.notifySaveFlushed).not.toHaveBeenCalled();
    finish[1]();
    await settle();
    expect(h.notifySaveFlushed).toHaveBeenCalledExactlyOnceWith({ requestId: 1, status: "saved" });
    expect(h.flushGameplaySave).toHaveBeenCalledTimes(2);
  });

  it("reports failure when the follow-up write for a newer edit fails", async () => {
    const h = setup();
    let finishFirst: () => void = () => {};
    h.flushGameplaySave.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }));
    h.flushGameplaySave.mockRejectedValueOnce(new Error("second write failed"));
    h.request(3);
    h.state.activeSession = { notes: "new observation" };
    finishFirst();
    await settle();
    expect(h.flushGameplaySave).toHaveBeenCalledTimes(2);
    expect(h.notifySaveFlushed).toHaveBeenCalledExactlyOnceWith({ requestId: 3, status: "failed" });
  });

  it("saves the current career before closing if it changes during the first write", async () => {
    const h = setup();
    const finish: Array<() => void> = [];
    const careers: string[] = [];
    h.flushGameplaySave.mockImplementation(() => {
      h.state.gameState = { ...h.state.gameState };
      careers.push(h.state.gameState.career);
      return new Promise<void>((resolve) => { finish.push(resolve); });
    });
    h.request(4);
    h.state.gameState = { career: "second", watchlist: [] };
    finish[0]();
    await settle();
    expect(careers).toEqual(["first", "second"]);
    expect(h.notifySaveFlushed).not.toHaveBeenCalled();
    finish[1]();
    await settle();
    expect(h.notifySaveFlushed).toHaveBeenCalledExactlyOnceWith({ requestId: 4, status: "saved" });
  });

  it("keeps background saves to one pass even when gameplay changes during I/O", async () => {
    const h = setup();
    let finish: () => void = () => {};
    h.flushGameplaySave.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    h.browserWindow.dispatchEvent(new Event("pagehide"));
    h.state.gameState = { ...h.state.gameState, watchlist: ["new edit"] };
    finish();
    await settle();
    expect(h.flushGameplaySave).toHaveBeenCalledOnce();
    expect(h.notifySaveFlushed).not.toHaveBeenCalled();
  });

  it("stops a pending quit loop after cleanup without acknowledging or writing again", async () => {
    const h = setup();
    let finish: () => void = () => {};
    h.flushGameplaySave.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    h.request(5);
    runtime.cleanup?.();
    runtime.cleanup = undefined;
    h.state.gameState = { ...h.state.gameState, watchlist: ["new edit"] };
    finish();
    await settle();
    expect(h.flushGameplaySave).toHaveBeenCalledOnce();
    expect(h.notifySaveFlushed).not.toHaveBeenCalled();
  });

  it("handles rejected background saves and rejected result notifications", async () => {
    const h = setup();
    h.flushGameplaySave.mockRejectedValue(new Error("storage full"));
    h.browserWindow.dispatchEvent(new Event("pagehide"));
    h.browserDocument.dispatchEvent(new Event("visibilitychange"));
    h.notifySaveFlushed.mockRejectedValueOnce(new Error("bridge unavailable"));
    h.request(3);
    await settle();
    expect(h.flushGameplaySave).toHaveBeenCalledTimes(3);
    expect(h.notifySaveFlushed).toHaveBeenCalledWith({ requestId: 3, status: "failed" });
    expect(console.warn).toHaveBeenCalledWith("Could not report quit save result:", expect.any(Error));
  });

  it("acknowledges a title screen with no career and cleans up background listeners", async () => {
    const h = setup();
    runtime.getState.mockReturnValue({ gameState: null, flushGameplaySave: h.flushGameplaySave });
    h.request(4);
    await settle();
    expect(h.notifySaveFlushed).toHaveBeenCalledExactlyOnceWith({ requestId: 4, status: "saved" });
    expect(h.flushGameplaySave).not.toHaveBeenCalled();
    runtime.cleanup?.();
    runtime.cleanup = undefined;
    h.browserWindow.dispatchEvent(new Event("pagehide"));
    h.browserDocument.dispatchEvent(new Event("visibilitychange"));
    expect(h.unsubscribe).toHaveBeenCalledOnce();
    expect(h.flushGameplaySave).not.toHaveBeenCalled();
  });
});
