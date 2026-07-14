import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAutosaveQueue,
  scheduleAfterPaint,
} from "@/stores/actions/autosaveQueue";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("autosave paint scheduling", () => {
  it("waits for two painted frames before starting persistence", async () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("window", {
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
      setTimeout: (callback: TimerHandler, delay?: number) => setTimeout(callback, delay),
      clearTimeout: (handle: number) => clearTimeout(handle),
    });
    const task = vi.fn();

    scheduleAfterPaint(task);
    for (let frame = 0; frame < 2; frame++) {
      frames.shift()?.(frame * 16);
      expect(task).not.toHaveBeenCalled();
    }

    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("falls back when a background tab does not paint", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      requestAnimationFrame: vi.fn(() => 1),
      setTimeout: (callback: TimerHandler, delay?: number) => setTimeout(callback, delay),
      clearTimeout: (handle: number) => clearTimeout(handle),
    });
    const task = vi.fn();

    scheduleAfterPaint(task);
    await vi.advanceTimersByTimeAsync(999);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(1);
  });
});

describe("autosave queue", () => {
  it("persists only the newest state requested in one gameplay task", async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async (_revision: number) => undefined);
    const queue = createAutosaveQueue<number>({
      persist,
      onError: () => undefined,
    });

    queue.request(1);
    queue.request(2);
    queue.request(3);

    expect(persist).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(persist.mock.calls).toEqual([[3]]);
  });

  it("persists the newest request queued while a write is in flight", async () => {
    vi.useFakeTimers();
    let finishFirstWrite: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      finishFirstWrite = resolve;
    });
    const persist = vi.fn((revision: number) =>
      revision === 1 ? firstWrite : Promise.resolve(),
    );
    const queue = createAutosaveQueue<number>({
      persist,
      onError: () => undefined,
    });

    queue.request(1);
    await vi.runOnlyPendingTimersAsync();
    expect(persist.mock.calls).toEqual([[1]]);

    queue.request(2);
    queue.request(3);
    expect(persist).toHaveBeenCalledTimes(1);

    finishFirstWrite?.();
    await firstWrite;
    await vi.runAllTimersAsync();
    expect(persist.mock.calls).toEqual([[1], [3]]);
  });
});
