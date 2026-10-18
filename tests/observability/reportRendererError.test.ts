import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/sentry", () => { throw new Error("private loader failure"); });
import { reportRendererError } from "@/lib/reportRendererError";

describe("deferred reporting failure", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("keeps recovery usable when the reporting chunk fails to load", async () => {
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@local-test.invalid/1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(reportRendererError(new Error("private original error"))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
  });
});
