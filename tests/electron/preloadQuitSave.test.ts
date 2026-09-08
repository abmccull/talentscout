import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function executePreload() {
  const invoke = vi.fn(async () => ({ ok: true }));
  const on = vi.fn();
  const removeListener = vi.fn();
  let api: {
    game: {
      onFlushSaveRequest: (listener: (requestId: number) => void) => () => void;
      notifySaveFlushed: (result: unknown) => Promise<{ ok: boolean }>;
    };
  } | undefined;
  runInNewContext(readFileSync(resolve(process.cwd(), "electron/preload.js"), "utf8"), {
    Buffer, Uint8Array, console,
    require: (name: string) => {
      if (name !== "electron") throw new Error(`Unexpected module ${name}`);
      return {
        contextBridge: { exposeInMainWorld: (_name: string, value: typeof api) => { api = value; } },
        ipcRenderer: { invoke, on, removeListener },
      };
    },
  });
  if (!api) throw new Error("Missing preload bridge");
  return { api, invoke, on, removeListener };
}

describe("quit save preload protocol", () => {
  it("forwards only a positive request ID and removes the exact subscription", () => {
    const { api, on, removeListener } = executePreload();
    const listener = vi.fn();
    const unsubscribe = api.game.onFlushSaveRequest(listener);
    const [channel, wrapped] = on.mock.calls[0];
    expect(channel).toBe("game:flush-save");
    wrapped({ sender: "privileged event" }, 8);
    for (const value of [null, -1, 0, 1.5, "8", Number.MAX_SAFE_INTEGER + 1]) wrapped({}, value);
    expect(listener).toHaveBeenCalledExactlyOnceWith(8);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledExactlyOnceWith(channel, wrapped);
  });

  it("sends only validated save status and correlation data", async () => {
    const { api, invoke } = executePreload();
    await api.game.notifySaveFlushed({ requestId: 8, status: "failed" });
    expect(invoke).toHaveBeenCalledExactlyOnceWith("game:notifySaveFlushed", { requestId: 8, status: "failed" });
    for (const result of [undefined, {}, { requestId: 0, status: "saved" },
      { requestId: 8, status: "failed", error: "private data" }, { requestId: 8, status: true }]) {
      expect(() => api.game.notifySaveFlushed(result)).toThrow("Invalid save flush result");
    }
    expect(invoke).toHaveBeenCalledOnce();
  });
});
