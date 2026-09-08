import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
type SaveResult = { requestId: number; status: "saved" | "failed" };
type Choice = "retry" | "cancel" | "discard";
const { createQuitSaveController, assertSaveFlushResult } = require("../../electron/quit-save-controller.js") as {
  assertSaveFlushResult: (value: unknown) => SaveResult;
  createQuitSaveController: (options: {
    sendFlush: (requestId: number) => void;
    showRecoveryPrompt: (reason: string) => Promise<Choice>;
    finishQuit: () => void;
    onPromptError?: (error: unknown) => void;
  }) => {
    getState: () => string;
    request: () => void;
    receive: (result: unknown) => boolean;
    rendererUnavailable: () => void;
  };
};

function setup() {
  let choose: (choice: Choice) => void = () => {};
  const sendFlush = vi.fn();
  const finishQuit = vi.fn();
  const onPromptError = vi.fn();
  const showRecoveryPrompt = vi.fn(() => new Promise<Choice>((resolve) => { choose = resolve; }));
  const controller = createQuitSaveController({ sendFlush, finishQuit, showRecoveryPrompt, onPromptError });
  return { controller, sendFlush, finishQuit, showRecoveryPrompt, onPromptError, choose: (choice: Choice) => choose(choice) };
}

describe("career save before desktop quit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for a matching successful save and quits only once", async () => {
    const h = setup();
    h.controller.request();
    h.controller.request();
    expect(h.sendFlush).toHaveBeenCalledExactlyOnceWith(1);
    expect(h.controller.receive({ requestId: 99, status: "saved" })).toBe(false);
    expect(h.finishQuit).not.toHaveBeenCalled();
    expect(h.controller.receive({ requestId: 1, status: "saved" })).toBe(true);
    h.controller.receive({ requestId: 1, status: "saved" });
    h.controller.request();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.finishQuit).toHaveBeenCalledOnce();
    expect(h.showRecoveryPrompt).not.toHaveBeenCalled();
    expect(h.controller.getState()).toBe("done");
  });

  it("allows saves longer than the old 2.5 second cutoff", async () => {
    const h = setup();
    h.controller.request();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.finishQuit).not.toHaveBeenCalled();
    h.controller.receive({ requestId: 1, status: "saved" });
    expect(h.finishQuit).toHaveBeenCalledOnce();
  });

  it("retains the career after a slow save and honors cancel even if its acknowledgement arrives late", async () => {
    const h = setup();
    h.controller.request();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.showRecoveryPrompt).toHaveBeenCalledExactlyOnceWith("slow");
    h.controller.request();
    h.controller.receive({ requestId: 1, status: "saved" });
    expect(h.finishQuit).not.toHaveBeenCalled();
    h.choose("cancel");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.controller.getState()).toBe("idle");
    expect(h.controller.receive({ requestId: 1, status: "saved" })).toBe(false);
    expect(h.finishQuit).not.toHaveBeenCalled();
  });

  it("retries a failed save with a fresh ID and rejects the previous acknowledgement", async () => {
    const h = setup();
    h.controller.request();
    h.controller.receive({ requestId: 1, status: "failed" });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.showRecoveryPrompt).toHaveBeenCalledExactlyOnceWith("failed");
    expect(h.finishQuit).not.toHaveBeenCalled();
    h.choose("retry");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sendFlush).toHaveBeenLastCalledWith(2);
    h.controller.receive({ requestId: 1, status: "saved" });
    expect(h.finishQuit).not.toHaveBeenCalled();
    h.controller.receive({ requestId: 2, status: "saved" });
    expect(h.finishQuit).toHaveBeenCalledOnce();
  });

  it("closes an unsaved career only after explicit discard", async () => {
    const h = setup();
    h.controller.request();
    h.controller.receive({ requestId: 1, status: "failed" });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.finishQuit).not.toHaveBeenCalled();
    h.choose("discard");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.finishQuit).toHaveBeenCalledOnce();
  });

  it("requires a recovery choice when the renderer cannot receive the save request", async () => {
    const h = setup();
    h.sendFlush.mockImplementation(() => { throw new Error("renderer gone"); });
    h.controller.request();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.showRecoveryPrompt).toHaveBeenCalledExactlyOnceWith("unavailable");
    expect(h.finishQuit).not.toHaveBeenCalled();
    h.choose("cancel");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.controller.getState()).toBe("idle");
    expect(h.finishQuit).not.toHaveBeenCalled();
  });

  it("keeps one recovery prompt when the renderer crashes while saving", async () => {
    const h = setup();
    h.controller.request();
    h.controller.rendererUnavailable();
    h.controller.rendererUnavailable();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.showRecoveryPrompt).toHaveBeenCalledExactlyOnceWith("unavailable");
    expect(h.finishQuit).not.toHaveBeenCalled();
  });

  it("keeps the game open if the native recovery dialog fails", async () => {
    const h = setup();
    h.showRecoveryPrompt.mockRejectedValueOnce(new Error("dialog unavailable"));
    h.controller.request();
    h.controller.receive({ requestId: 1, status: "failed" });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.controller.getState()).toBe("idle");
    expect(h.onPromptError).toHaveBeenCalledOnce();
    expect(h.finishQuit).not.toHaveBeenCalled();
  });

  it("rejects malformed, uncorrelated, and data-bearing result payloads", () => {
    for (const result of [undefined, null, [], {}, { requestId: 0, status: "saved" },
      { requestId: 1.5, status: "saved" }, { requestId: "1", status: "saved" },
      { requestId: 1, status: "unknown" }, { requestId: 1, status: "failed", error: "private career data" }]) {
      expect(() => assertSaveFlushResult(result)).toThrow("Invalid save flush result");
    }
    expect(assertSaveFlushResult({ requestId: 2, status: "failed" })).toEqual({ requestId: 2, status: "failed" });
  });
});
