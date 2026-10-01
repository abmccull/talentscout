import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reporting = vi.hoisted(() => ({
  loads: 0,
  captureException: vi.fn(),
}));

describe("deferred renderer error reporting", () => {
  beforeEach(() => {
    vi.resetModules();
    reporting.loads = 0;
    reporting.captureException.mockReset();
    // resetModules clears product modules, but not cached mock factories.
    // Register a fresh factory so load accounting is independent per case.
    vi.doMock("../../src/lib/sentry", () => {
      reporting.loads += 1;
      return { captureException: reporting.captureException };
    });
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@local-test.invalid/1");
  });

  afterEach(() => {
    vi.doUnmock("../../src/lib/sentry");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("loads no reporting SDK while offline or outside the renderer", async () => {
    const { captureException } = await import("../../src/lib/deferredErrorReporting");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    captureException(new Error("offline-only"));
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@local-test.invalid/1");
    vi.stubGlobal("window", undefined);
    captureException(new Error("server-only"));
    await Promise.resolve();
    expect(reporting.loads).toBe(0);
    expect(reporting.captureException).not.toHaveBeenCalled();
  });

  it("preserves the first and concurrent errors while loading one reporter", async () => {
    const { captureException } = await import("../../src/lib/deferredErrorReporting");
    expect(reporting.loads).toBe(0);
    const first = new Error("first error");
    const second = new TypeError("second error");
    captureException(first);
    captureException(second);
    await vi.waitFor(() => expect(reporting.captureException).toHaveBeenCalledTimes(2));
    expect(reporting.loads).toBe(1);
    expect(reporting.captureException.mock.calls).toEqual([[first], [second]]);
  });

  it("keeps gameplay usable when exception reporting throws", async () => {
    const { captureException } = await import("../../src/lib/deferredErrorReporting");
    reporting.captureException.mockImplementationOnce(() => {
      throw new Error("reporting transport unavailable");
    });
    expect(() => captureException(new Error("original gameplay exception"))).not.toThrow();
    await vi.waitFor(() => expect(reporting.captureException).toHaveBeenCalledTimes(1));
    const later = new Error("later exception");
    captureException(later);
    await vi.waitFor(() => expect(reporting.captureException).toHaveBeenLastCalledWith(later));
    expect(reporting.loads).toBe(1);
  });
});
